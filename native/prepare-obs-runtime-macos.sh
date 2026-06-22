#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${OBS_VERSION:-32.1.2}"
ARCH="$(uname -m)"
FLAVOR="Intel"
if [[ "$ARCH" == "arm64" ]]; then
  FLAVOR="Apple"
fi

URL="${OBS_MAC_DMG_URL:-https://github.com/obsproject/obs-studio/releases/download/${VERSION}/OBS-Studio-${VERSION}-macOS-${FLAVOR}.dmg}"
OUT_DIR="${1:-${SCRIPT_DIR}/vss-runtime/darwin}"
CACHE_DIR="${SCRIPT_DIR}/.cache"
DMG_PATH="${CACHE_DIR}/$(basename "$URL")"
MOUNT_DIR="$(mktemp -d /tmp/vaultstudio-obs-mac.XXXXXX)"

cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
  rm -rf "$MOUNT_DIR"
}
trap cleanup EXIT

mkdir -p "$CACHE_DIR"
if [[ ! -f "$DMG_PATH" ]]; then
  echo "Downloading $URL"
  curl --fail --location --retry 3 --output "$DMG_PATH" "$URL"
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/bin" "$OUT_DIR/share/obs"

echo "Mounting $DMG_PATH"
hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$MOUNT_DIR" >/dev/null
OBS_APP="$(find "$MOUNT_DIR" -maxdepth 3 -type d -name 'OBS.app' | head -n 1)"
if [[ -z "$OBS_APP" ]]; then
  echo "OBS.app not found in mounted DMG" >&2
  exit 1
fi

CONTENTS="${OBS_APP}/Contents"
if [[ -d "${CONTENTS}/Frameworks" ]]; then
  ditto "${CONTENTS}/Frameworks" "${OUT_DIR}/Frameworks"
else
  echo "OBS Frameworks directory missing" >&2
  exit 1
fi

PLUGIN_DIR=""
for candidate in "${CONTENTS}/PlugIns" "${CONTENTS}/Plugins"; do
  if [[ -d "$candidate" ]]; then
    PLUGIN_DIR="$candidate"
    break
  fi
done
if [[ -z "$PLUGIN_DIR" ]]; then
  echo "OBS plugin directory missing" >&2
  exit 1
fi
ditto "$PLUGIN_DIR" "${OUT_DIR}/plugins"

if [[ -d "${CONTENTS}/Resources/data" ]]; then
  ditto "${CONTENTS}/Resources/data" "${OUT_DIR}/share/obs"
else
  echo "OBS Resources/data directory missing" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node not found on PATH; cannot bundle vaultstudio-engine" >&2
  exit 1
fi
cp "$NODE_BIN" "${OUT_DIR}/bin/vaultstudio-engine"
chmod +x "${OUT_DIR}/bin/vaultstudio-engine"

if [[ ! -e "${OUT_DIR}/Frameworks/libobs.framework/libobs" && ! -e "${OUT_DIR}/lib/libobs.dylib" ]]; then
  echo "libobs was not found in assembled runtime" >&2
  find "$OUT_DIR" -maxdepth 3 -name '*obs*' -print >&2
  exit 1
fi

echo "macOS VSS runtime ready at $OUT_DIR"
find "$OUT_DIR" -maxdepth 2 \( -name 'vaultstudio-engine' -o -name 'libobs*' -o -name '*.plugin' \) -print | head -n 40
