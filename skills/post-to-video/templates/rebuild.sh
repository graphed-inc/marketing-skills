#!/bin/bash
# Rebuilds __NAME__.tsrct from scratch: packages fonts, logo, SFX, music, generates layers, commits.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source "__SKILL__/scripts/env.sh"
rm -f __NAME__.tsrct
"$T" project create --project __NAME__.tsrct >/dev/null
for f in assets/fonts/*.ttf; do
  "$T" project import-font --project __NAME__.tsrct --file "$f" >/dev/null 2>&1
done
"$T" project import-asset --project __NAME__.tsrct --file assets/graphed-logo-160.png --asset-id graphed-logo --kind image >/dev/null
for p in assets/sfx/*.wav; do
  n=$(basename "$p" .wav)
  "$T" project import-asset --project __NAME__.tsrct --file "$p" --asset-id "sfx-$n" --kind audio >/dev/null
done
"$T" project import-asset --project __NAME__.tsrct --file assets/music.mp3 --asset-id music --kind audio >/dev/null
"$PY" .tesseract-work/build.py
"$T" project commit --project __NAME__.tsrct --file .tesseract-work/editable.json
