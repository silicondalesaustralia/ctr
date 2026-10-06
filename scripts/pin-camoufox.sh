#!/usr/bin/env bash
# Install a pinned Camoufox build. `camoufox-js fetch` always takes the newest stable
# release, and newer builds reject config keys camoufox-js 0.12.0 still sends
# (e.g. fonts:spacing_seed, navigator.product). Fetch still supplies GeoIP + addons.
set -euo pipefail

VERSION="${1:?usage: pin-camoufox.sh <version-release, e.g. 152.0.4-beta.30>}"
DIR="$(npx camoufox-js path)"
ZIP="/tmp/camoufox-${VERSION}.zip"

npx camoufox-js fetch
find "$DIR" -mindepth 1 -maxdepth 1 ! -name 'GeoLite2-City.mmdb' ! -name addons -exec rm -rf {} +
python3 -c 'import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])' \
  "https://github.com/daijro/camoufox/releases/download/v${VERSION}/camoufox-${VERSION}-lin.x86_64.zip" "$ZIP"
python3 -m zipfile -e "$ZIP" "$DIR"
rm -f "$ZIP"
chmod -R 755 "$DIR"
printf '{"version":"%s","release":"%s"}' "${VERSION%%-*}" "${VERSION#*-}" > "$DIR/version.json"
echo "[pin-camoufox] installed ${VERSION} in ${DIR}"
