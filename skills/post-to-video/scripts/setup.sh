#!/bin/bash
# Prepare this machine for post-to-video.
# tsrct itself comes from the official steps in tesseract-motion. This script
# checks that pin, then creates the Python venv and checks Linux host libraries.
# It does not download tsrct and it does not use sudo.
set -euo pipefail

SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUIDE_DIR="$SKILL/../tesseract-motion/references"
if [ ! -d "$GUIDE_DIR" ]; then
  echo "tesseract-motion has to be installed beside post-to-video." >&2
  echo "Expected $GUIDE_DIR" >&2
  exit 1
fi
GUIDE_DIR="$(cd "$GUIDE_DIR" && pwd)"
PIN_FILE="$GUIDE_DIR/cli-version.txt"
INSTALL_GUIDE="$GUIDE_DIR/installation.md"
if [ ! -f "$PIN_FILE" ] || [ ! -f "$INSTALL_GUIDE" ]; then
  echo "tesseract-motion is missing cli-version.txt or installation.md." >&2
  echo "Expected $INSTALL_GUIDE" >&2
  exit 1
fi
PIN="$(tr -d '[:space:]' < "$PIN_FILE")"

resolve_tsrct() {
  if [ -n "${TSRCT:-}" ] && [ -x "$TSRCT" ]; then
    printf '%s\n' "$TSRCT"
    return 0
  fi
  if command -v tsrct >/dev/null 2>&1; then
    command -v tsrct
    return 0
  fi
  local candidate candidates
  if [ "$(uname -s)" = "Darwin" ]; then
    candidates=(
      "$HOME/Library/Application Support/Tesseract/bin/tsrct"
      "${XDG_DATA_HOME:-$HOME/.local/share}/Tesseract/bin/tsrct"
    )
  else
    candidates=("${XDG_DATA_HOME:-$HOME/.local/share}/Tesseract/bin/tsrct")
  fi
  for candidate in "${candidates[@]}"
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

version_matches() {
  local bin="$1" line
  line="$("$bin" --version 2>/dev/null | head -1 || true)"
  case "$line" in
    "tsrct ${PIN} "*) return 0 ;;
    *) return 1 ;;
  esac
}

if ! current="$(resolve_tsrct)" || ! version_matches "$current"; then
  echo "tsrct ${PIN} is not installed." >&2
  echo "Follow the official install steps, then re-run this script:" >&2
  echo "  $INSTALL_GUIDE" >&2
  exit 1
fi
echo "tsrct ${PIN} already installed: $current"

if [ "$(uname -s)" = "Linux" ]; then
  if ! compgen -G "/usr/share/vulkan/icd.d/*.json" >/dev/null && \
     ! compgen -G "${XDG_DATA_HOME:-$HOME/.local/share}/vulkan/icd.d/*.json" >/dev/null; then
    echo "No Vulkan driver is installed, so tsrct cannot render." >&2
    echo "On Debian or Ubuntu: sudo apt-get install -y libvulkan1 mesa-vulkan-drivers" >&2
    echo "Then re-run: bash \"$SKILL/scripts/setup.sh\"" >&2
    exit 1
  fi
  ffmpeg_bin="$(command -v ffmpeg || true)"
  encoders=""
  if [ -n "$ffmpeg_bin" ]; then
    encoders="$("$ffmpeg_bin" -hide_banner -encoders 2>/dev/null || true)"
  fi
  if [ -z "$ffmpeg_bin" ] || ! printf '%s\n' "$encoders" | grep -q libx264; then
    echo "Linux export needs ffmpeg with libx264 and AAC on PATH." >&2
    echo "On Debian or Ubuntu: sudo apt-get install -y ffmpeg" >&2
    echo "Then re-run: bash \"$SKILL/scripts/setup.sh\"" >&2
    exit 1
  fi
fi

# shellcheck disable=SC1091
source "$SKILL/scripts/env.sh"
echo "PY=$PY"
echo "T=$T"
"$T" --version
"$PY" -c "import numpy, fontTools; print('python deps ok')"
