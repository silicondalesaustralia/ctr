#!/usr/bin/env bash
set -euo pipefail

echo "[railway-start] service=${RAILWAY_SERVICE_NAME:-unknown} headless=${GOLOGIN_HEADLESS:-true} commit=${RAILWAY_GIT_COMMIT_SHA:-local}"

if [ "${RAILWAY_SERVICE_NAME:-}" = "worker" ]; then
  if [ "${GOLOGIN_HEADLESS:-true}" = "false" ] || [ "${GOLOGIN_HEADLESS:-true}" = "0" ]; then
    export DISPLAY="${DISPLAY:-:99}"
    echo "[railway-start] launching Xvfb on ${DISPLAY}"
    # Background Xvfb is more reliable than xvfb-run in Railway (stdout + hang recovery).
    Xvfb "${DISPLAY}" -screen 0 1280x720x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
    XVFB_PID=$!
    sleep 1
    if ! kill -0 "${XVFB_PID}" 2>/dev/null; then
      echo "[railway-start] Xvfb failed to start:" >&2
      cat /tmp/xvfb.log >&2 || true
      exit 1
    fi
    echo "[railway-start] Xvfb ready pid=${XVFB_PID}"
    echo "[railway-start] starting worker (headful via xvfb)"
    exec npm run worker
  fi
  echo "[railway-start] starting worker (headless)"
  exec npm run worker
fi

echo "[railway-start] starting api"
exec npm run api
