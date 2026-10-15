#!/bin/bash
# Source me (bash or zsh): `source <skill>/scripts/env.sh`
# Sets $PY (python with fonttools + numpy), $T (tsrct), $POST_TO_VIDEO (skill root).
# Does not install tsrct or system packages. Run scripts/setup.sh for that.

_post_to_video_fail() {
  echo "$1" >&2
  return 1
}

if [ -n "${BASH_SOURCE[0]:-}" ]; then
  _post_to_video_src="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
  eval '_post_to_video_src=${(%):-%x}'
else
  _post_to_video_src="$0"
fi
POST_TO_VIDEO="$(cd "$(dirname "$_post_to_video_src")/.." && pwd)"
export POST_TO_VIDEO
unset _post_to_video_src

_post_to_video_tsrct() {
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

if ! T="$(_post_to_video_tsrct)"; then
  _post_to_video_fail "tsrct not found. Run: bash \"$POST_TO_VIDEO/scripts/setup.sh\""
  return 1
fi
export T

VENV="$HOME/.cache/post-to-video/venv"
if [ ! -x "$VENV/bin/python" ] || [ ! -x "$VENV/bin/pip" ]; then
  rm -rf "$VENV"
  if ! python3 -m venv "$VENV"; then
    _post_to_video_fail "python3 -m venv failed. Install python3-venv and re-run scripts/setup.sh."
    return 1
  fi
  if [ ! -x "$VENV/bin/pip" ]; then
    if ! "$VENV/bin/python" -m ensurepip --upgrade; then
      if ! curl -fsSL https://bootstrap.pypa.io/get-pip.py | "$VENV/bin/python"; then
        _post_to_video_fail "The venv has no pip. Install python3-venv or ensure curl can reach bootstrap.pypa.io."
        return 1
      fi
    fi
  fi
fi
if ! "$VENV/bin/python" -c "import numpy, fontTools" >/dev/null 2>&1; then
  if ! "$VENV/bin/python" -m pip install fonttools numpy; then
    _post_to_video_fail "pip install fonttools numpy failed."
    return 1
  fi
fi
export PY="$VENV/bin/python"
unset _post_to_video_fail _post_to_video_tsrct VENV
