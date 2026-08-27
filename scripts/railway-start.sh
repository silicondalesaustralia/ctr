#!/usr/bin/env bash
set -euo pipefail

if [ "${RAILWAY_SERVICE_NAME:-}" = "worker" ]; then
  exec npm run worker
fi

exec npm run api
