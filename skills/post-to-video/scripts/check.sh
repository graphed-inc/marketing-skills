#!/bin/bash
# Render review filmstrips at evenly spaced times (or given ms), print the paths.
# Usage: check.sh <project-dir> [ms ms ms ...]
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
DIR="${1:?project dir}"; shift || true
cd "$DIR"; P=$(ls *.tsrct | head -1)
if [ $# -eq 0 ]; then
  DUR=$("$PY" -c "import json;print(int(json.load(open('.tesseract-work/editable.json'))['duration']*1000))")
  set -- $("$PY" -c "d=$DUR;print(' '.join(str(int(d*(i+0.5)/20)) for i in range(20)))")
fi
ARGS=("$@"); N=${#ARGS[@]}; HALF=$(( (N + 1) / 2 ))
"$T" filmstrip --project "$P" --timestamps-ms "${ARGS[@]:0:$HALF}" --tile-width 324 --tile-height 405 --items-per-row 5 --output .tesseract-work/checks/fs-a.png >/dev/null
[ $N -gt $HALF ] && "$T" filmstrip --project "$P" --timestamps-ms "${ARGS[@]:$HALF}" --tile-width 324 --tile-height 405 --items-per-row 5 --output .tesseract-work/checks/fs-b.png >/dev/null
ls -1 "$PWD"/.tesseract-work/checks/fs-*.png
