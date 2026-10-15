#!/bin/bash
# Claim a new post video project and stage everything the build needs.
# Usage: new.sh <slug> <ProjectName> <music-track> [videos-dir]
#   music-track: one of assets/music/*.mp3 (name without .mp3), e.g. minimal-emotion
set -euo pipefail
SLUG="${1:?slug}"; NAME="${2:?ProjectName (CamelCase, used for .tsrct/.mp4)}"; TRACK="${3:?music track}"
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIDEOS="${4:-$PWD/videos}"
DIR="$VIDEOS/$SLUG"
mkdir "$DIR" || { echo "refusing: $DIR already exists"; exit 1; }   # atomic claim, never merge into old work
mkdir -p "$DIR/assets/fonts" "$DIR/assets/sfx" "$DIR/.tesseract-work/checks" "$DIR/Previews" "$DIR/Versions"
cp "$SKILL"/assets/fonts/*.ttf "$DIR/assets/fonts/"
cp "$SKILL"/assets/sfx/*.wav "$DIR/assets/sfx/"
cp "$SKILL/assets/graphed-logo-160.png" "$DIR/assets/"
cp "$SKILL/assets/music/$TRACK.mp3" "$DIR/assets/music.mp3"
sed -e "s#__SKILL_LIB__#$SKILL/lib#" -e "s#__NAME__#$NAME#g" "$SKILL/templates/build.py" > "$DIR/.tesseract-work/build.py"
sed -e "s#__NAME__#$NAME#g" -e "s#__SKILL__#$SKILL#g" "$SKILL/templates/rebuild.sh" > "$DIR/.tesseract-work/rebuild.sh"
chmod +x "$DIR/.tesseract-work/rebuild.sh"
echo "$DIR"
