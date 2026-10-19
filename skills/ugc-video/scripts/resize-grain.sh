#!/bin/zsh
# Upscale a low-res AI video to 1080 wide with no AI: Lanczos resize + light sharpen + phone grain.
# The face stays exactly as rendered — nothing is redrawn.
#
# usage: resize-grain.sh <in.mp4> [out.mp4] [--width 1080] [--sharpen 0.6] [--grain 6] [--bitrate 12M]
set -e

IN="$1"; shift || true
[[ -z "$IN" || ! -f "$IN" ]] && { echo "usage: resize-grain.sh <in.mp4> [out.mp4] [--width N] [--sharpen N] [--grain N] [--bitrate N]"; exit 1; }
OUT=""
[[ -n "$1" && "$1" != --* ]] && { OUT="$1"; shift; }
[[ -z "$OUT" ]] && OUT="${IN:r}-resize-grain.mp4"

WIDTH=1080; SHARPEN=0.6; GRAIN=6; BITRATE=12M
while [[ $# -gt 0 ]]; do
  case "$1" in
    --width)   WIDTH="$2"; shift 2 ;;
    --sharpen) SHARPEN="$2"; shift 2 ;;
    --grain)   GRAIN="$2"; shift 2 ;;
    --bitrate) BITRATE="$2"; shift 2 ;;
    *) echo "unknown flag: $1"; exit 1 ;;
  esac
done

# 9:16 sources (e.g. 480x854) snap to an exact 1080x1920; anything else keeps its aspect ratio
DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$IN")
W=${DIMS%x*}; H=${DIMS#*x}
if (( $(python3 -c "print(int(abs($W/$H - 9/16) < 0.01))") )); then SIZE="${WIDTH}:$(( WIDTH * 16 / 9 ))"; else SIZE="${WIDTH}:-2"; fi

# maxrate/bufsize scale with the target bitrate (grain kills compression; without a cap files hit 300MB+)
NUM=${BITRATE%[MmKk]}; UNIT=${BITRATE##*[0-9.]}
MAXRATE="$(( NUM * 7 / 6 ))${UNIT}"; BUFSIZE="$(( NUM * 2 ))${UNIT}"

ffmpeg -y -loglevel error -i "$IN" \
  -vf "scale=${SIZE}:flags=lanczos,unsharp=5:5:${SHARPEN}:5:5:0,noise=alls=${GRAIN}:allf=t,format=yuv420p" \
  -c:v libx264 -preset slow -b:v "$BITRATE" -maxrate "$MAXRATE" -bufsize "$BUFSIZE" -tune grain \
  -c:a copy -movflags +faststart "$OUT"

echo "$OUT"
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration,size -of compact "$OUT"
