#!/bin/bash
# Export the MP4, verify streams + loudness, save a 6-frame Previews/Filmstrip.png.
# Usage: export.sh <project-dir> [ms ms ms ms ms ms]   (slow: ~60-80 s for 50 s of video)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
DIR="${1:?project dir}"; shift || true
cd "$DIR"; P=$(ls *.tsrct | head -1); OUT="${P%.tsrct}.mp4"

args=(export --project "$P" --output "$OUT")
if [ "$(uname -s)" = "Linux" ]; then
  FFMPEG="$(command -v ffmpeg || true)"
  encoders=""
  if [ -n "$FFMPEG" ]; then
    encoders="$("$FFMPEG" -hide_banner -encoders 2>/dev/null || true)"
  fi
  if [ -z "$FFMPEG" ] || ! printf '%s\n' "$encoders" | grep -q libx264; then
    echo "Linux export needs ffmpeg with libx264 and AAC on PATH." >&2
    echo "On Debian or Ubuntu: sudo apt-get install -y ffmpeg" >&2
    exit 1
  fi
  args+=(--encoder-backend external-ffmpeg-command --ffmpeg-path "$FFMPEG")
fi
"$T" "${args[@]}"
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate -show_entries format=duration -of compact "$OUT"
ffmpeg -nostdin -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" || true
if [ $# -eq 0 ]; then
  DUR=$("$PY" -c "import json;print(int(json.load(open('.tesseract-work/editable.json'))['duration']*1000))")
  set -- $("$PY" -c "d=$DUR;print(' '.join(str(int(d*f)) for f in (0.08,0.25,0.42,0.6,0.78,0.97)))")
fi
"$T" filmstrip --project "$P" --timestamps-ms "$@" --tile-width 270 --tile-height 338 --items-per-row 6 --output Previews/Filmstrip.png >/dev/null
echo "$DIR/$OUT"
