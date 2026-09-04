#!/usr/bin/env bash
set -euo pipefail

echo "[railway-start] service=${RAILWAY_SERVICE_NAME:-unknown} headless=${GOLOGIN_HEADLESS:-true} commit=${RAILWAY_GIT_COMMIT_SHA:-local}"

if [ "${RAILWAY_SERVICE_NAME:-}" = "worker" ]; then
  if [ "${GOLOGIN_HEADLESS:-true}" = "false" ] || [ "${GOLOGIN_HEADLESS:-true}" = "0" ]; then
    export DISPLAY="${DISPLAY:-:99}"
    DISPLAY_NUM="${DISPLAY#:}"
    echo "[railway-start] launching Xvfb on ${DISPLAY}"
    # Redeploys / OOM kills leave /tmp/.X99-lock behind → "Server is already active".
    if [ -e "/tmp/.X${DISPLAY_NUM}-lock" ] || [ -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
      echo "[railway-start] clearing stale Xvfb lock for display ${DISPLAY_NUM}"
      pkill -9 -f "Xvfb.*:${DISPLAY_NUM}" 2>/dev/null || true
      rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"
      sleep 0.5
    fi
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
