#!/usr/bin/env bash
set -euo pipefail

REPO="${RAILWAY_REPO:-silicondalesaustralia/ctr}"
BRANCH="${RAILWAY_BRANCH:-main}"
WORKER_NAME="${RAILWAY_WORKER_SERVICE_NAME:-worker}"

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: npm install -g @railway/cli"
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: railway login"
  exit 1
fi

cd "$(dirname "$0")/.."

if ! railway status >/dev/null 2>&1; then
  echo "Link this repo to your CTR Railway project:"
  railway link
fi

echo "Checking for worker service..."
services_json="$(railway service list --json 2>/dev/null || echo "[]")"

if ! echo "$services_json" | grep -q "\"name\":\"${WORKER_NAME}\""; then
  echo "Creating worker service from ${REPO}@${BRANCH}..."
  railway add --service "$WORKER_NAME" --repo "$REPO" --branch "$BRANCH" --json
else
  echo "Worker service already exists."
fi

api_service="$(echo "$services_json" | python3 -c "
import json, sys
services = json.load(sys.stdin)
for s in services:
    name = s.get('name', '')
    if name and name != '${WORKER_NAME}':
        print(name)
        break
" 2>/dev/null || echo "ctr")"

if [ -n "$api_service" ]; then
  echo "Linking worker env vars to API service: ${api_service}"
  while IFS='=' read -r key _; do
    [ -n "$key" ] || continue
    case "$key" in
      RAILWAY_*|PORT) continue ;;
    esac
    railway variable set "${key}=\${{${api_service}.${key}}}" --service "$WORKER_NAME" --skip-deploys >/dev/null 2>&1 || true
  done < <(railway variable list --service "$api_service" --kv 2>/dev/null || true)
fi

echo "Deploying worker..."
railway up --service "$WORKER_NAME" --detach -y

worker_id="$(railway service list --json | python3 -c "
import json, sys
services = json.load(sys.stdin)
for s in services:
    if s.get('name') == '${WORKER_NAME}':
        print(s.get('id', ''))
        break
" 2>/dev/null || true)"

echo ""
echo "Worker service ready."
if [ -n "$worker_id" ]; then
  echo "Add to GitHub repo variables: RAILWAY_WORKER_SERVICE_ID=${worker_id}"
fi
echo "Check logs: railway logs --service ${WORKER_NAME}"
