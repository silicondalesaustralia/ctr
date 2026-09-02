#!/usr/bin/env bash
set -euo pipefail

if [ "${RAILWAY_SERVICE_NAME:-}" = "worker" ]; then
  if [ "${GOLOGIN_HEADLESS:-true}" = "false" ] || [ "${GOLOGIN_HEADLESS:-true}" = "0" ]; then
    exec xvfb-run -a --server-args="-screen 0 1280x720x24" npm run worker
  fi
  exec npm run worker
fi

exec npm run api
