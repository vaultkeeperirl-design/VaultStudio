#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-${SCRIPT_DIR}/vss-runtime/linux}"

if ! command -v obs >/dev/null 2>&1 && ! ldconfig -p 2>/dev/null | grep -q 'libobs\.so'; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y obs-studio libobs-dev
  else
    echo "obs-studio/libobs not found and apt-get is unavailable" >&2
    exit 1
  fi
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/bin" "$OUT_DIR/lib/obs-plugins" "$OUT_DIR/share"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node not found on PATH; cannot bundle vaultstudio-engine" >&2
  exit 1
fi
cp "$NODE_BIN" "$OUT_DIR/bin/vaultstudio-engine"
chmod +x "$OUT_DIR/bin/vaultstudio-engine"

LIBOBS="$(ldconfig -p 2>/dev/null | awk '/libobs\.so/{print $NF; exit}')"
if [[ -z "${LIBOBS:-}" ]]; then
  LIBOBS="$(find /usr -name 'libobs.so*' 2>/dev/null | head -n 1)"
fi
if [[ -z "${LIBOBS:-}" || ! -e "$LIBOBS" ]]; then
  echo "libobs.so not found" >&2
  exit 1
fi
cp -a "$(dirname "$LIBOBS")"/libobs.so* "$OUT_DIR/lib/"

PLUGIN_DIR=""
for candidate in \
  /usr/lib/x86_64-linux-gnu/obs-plugins \
  /usr/lib/aarch64-linux-gnu/obs-plugins \
  /usr/lib/obs-plugins; do
  if [[ -d "$candidate" ]]; then
    PLUGIN_DIR="$candidate"
    break
  fi
done
if [[ -z "$PLUGIN_DIR" ]]; then
  echo "OBS plugin directory not found" >&2
  exit 1
fi
cp -a "$PLUGIN_DIR"/. "$OUT_DIR/lib/obs-plugins/"

if [[ ! -d /usr/share/obs ]]; then
  echo "/usr/share/obs not found" >&2
  exit 1
fi
cp -a /usr/share/obs "$OUT_DIR/share/obs"

echo "Linux VSS runtime ready at $OUT_DIR"
find "$OUT_DIR" -maxdepth 2 \( -name 'vaultstudio-engine' -o -name 'libobs.so*' -o -name '*.so' \) -print | head -n 40
