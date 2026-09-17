#!/usr/bin/env bash
# Patchright Step-1 gate: two fresh Premium Ports probes.
# Prerequisites: worker deployed with Patchright commit; PROXY_PROVIDER=premiumports; GOLOGIN_HEADLESS=false
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== pause ==="
npm run warmup:pause -- --confirm

probe_one() {
  local label="$1"
  echo ""
  echo "=== create identity ($label) ==="
  local out
  out="$(npm run identities:create-additional -- --count 1 2>&1)"
  echo "$out"
  local id
  id="$(echo "$out" | sed -n 's/.*Created 1 identities (\(au_[0-9]*\).*/\1/p' | head -1)"
  if [[ -z "$id" ]]; then
    echo "Failed to parse new identity id" >&2
    exit 1
  fi
  echo "=== probe $id ==="
  npm run warmup:probe-one -- --confirm --id="$id"
  echo "Waiting 25 minutes for $id …"
  sleep 1500
  echo "=== audit $id ==="
  npx tsx scripts/audit-au055.ts --id="$id"
}

probe_one "A"
probe_one "B"
echo ""
echo "Done. Paste both audit blocks back for CURRENT_SETUP update."
