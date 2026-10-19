#!/usr/bin/env bash
# Generate every <name>.req.json in a folder with GPT Image 2 via Graphed Tools.
# Usage: generate.sh <ads-dir> [downloads-folder-name] [--dry-run] [--account ID] [--project SLUG]
# Writes <name>.res.json + a 1080x1350 <name>.png next to each request,
# copies PNGs to ~/Downloads/<folder>/, and uploads them to project storage.
# Account and project are the logged-in Graphed CLI user. There is no default account.
# The last successful account and project are reused. --account and --project override them.
set -uo pipefail

DIR=""
DL=""
DRY=""
ACCT="${GRAPHED_ACCOUNT:-}"
PROJ="${GRAPHED_PROJECT:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY="--dry-run"; shift ;;
    --account)
      [ -n "${2:-}" ] || { echo "generate.sh: --account needs an id"; exit 1; }
      ACCT="$2"; shift 2 ;;
    --project)
      [ -n "${2:-}" ] || { echo "generate.sh: --project needs a slug"; exit 1; }
      PROJ="$2"; shift 2 ;;
    --*) echo "generate.sh: unknown flag $1"; exit 1 ;;
    *)
      if [ -z "$DIR" ]; then DIR="$1"
      elif [ -z "$DL" ]; then DL="$1"
      else echo "generate.sh: unexpected argument $1"; exit 1
      fi
      shift ;;
  esac
done

[ -n "$DIR" ] || { echo "usage: generate.sh <ads-dir> [downloads-folder-name] [--dry-run] [--account ID] [--project SLUG]"; exit 1; }

# --dry-run only reads local files. It must not call Graphed or spend credits.
if [ "$DRY" = "--dry-run" ]; then
  echo "dry-run: checking request files only. Not calling Graphed."
  python3 - "$ACCT" "$PROJ" << 'PY'
import json, sys
from pathlib import Path
account, project = sys.argv[1], sys.argv[2]
saved_path = Path.home() / ".config" / "graphed" / "static-ads.json"
saved = json.loads(saved_path.read_text()) if saved_path.is_file() else {}
use_account = account or saved.get("account") or "(ask on a real run)"
use_project = project or saved.get("project") or "(ask on a real run)"
print(f"a real run would use account {use_account}  project {use_project}")
print("pass --account and --project to use a different one")
PY
fi

# Resolve before cd, so a graphed.yaml / .graphed.json above the ads folder still counts.
if [ "$DRY" != "--dry-run" ]; then
  if ! command -v graphed >/dev/null 2>&1; then
    echo "generate.sh: graphed CLI is not installed. Install it and run graphed login."
    exit 1
  fi
  SCOPE=$(python3 - "$ACCT" "$PROJ" "$PWD" << 'PY'
import json, subprocess, sys
from pathlib import Path

account, project, cwd = sys.argv[1], sys.argv[2], Path(sys.argv[3]).resolve()
saved_path = Path.home() / ".config" / "graphed" / "static-ads.json"
saved = json.loads(saved_path.read_text()) if saved_path.is_file() else {}

def find_up(name):
    for d in [cwd, *cwd.parents]:
        if (d / name).is_file():
            return d / name
    return None

def graphed(*args):
    r = subprocess.run(["graphed", *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit((r.stderr or r.stdout).strip() or "graphed failed. Run graphed login.")
    return r.stdout.strip()

if not account and (f := find_up(".graphed.json")):
    account = json.loads(f.read_text()).get("account_id") or ""
account = account or saved.get("account") or ""
if not account:
    accts = json.loads(graphed("--format", "json", "accounts", "list"))["accounts"]
    if len(accts) != 1:
        rows = "\n".join(f"  {x['id']}  {x.get('name', '')}" for x in accts)
        sys.exit(f"You have {len(accts)} Graphed accounts. Pick one with --account:\n{rows}")
    account = accts[0]["id"]

if not project and (f := find_up("graphed.yaml")):
    for line in f.read_text().splitlines():
        if line.startswith("slug:"):
            project = line.split(":", 1)[1].strip()
            break
if not project and saved.get("account") == account:
    project = saved.get("project") or ""
if not project:
    projs = json.loads(graphed("--format", "json", "projects", "list", "--account", account))["projects"]
    if len(projs) != 1:
        shown = projs[:40]
        rows = "\n".join(f"  {x['slug']}" for x in shown)
        extra = "" if len(projs) <= 40 else f"\n  … and {len(projs) - 40} more"
        sys.exit(f"This account has {len(projs)} projects. Pick one with --project:\n{rows}{extra}")
    project = projs[0]["slug"]

saved_path.parent.mkdir(parents=True, exist_ok=True)
saved_path.write_text(json.dumps({"account": account, "project": project}))
print(account)
print(project)
PY
  ) || exit 1
  ACCT=$(printf '%s\n' "$SCOPE" | sed -n '1p')
  PROJ=$(printf '%s\n' "$SCOPE" | sed -n '2p')
  [ -n "$ACCT" ] && [ -n "$PROJ" ] || { echo "generate.sh: could not resolve a Graphed account and project"; exit 1; }
  echo "using account $ACCT  project $PROJ"
  echo "pass --account and --project to use a different one"
fi

cd "$DIR" || exit 1
TOOL="kie:gpt-image-2-image-to-image"

# Center-crop a 3:4 render to Meta's 4:5 size, 1080x1350.
crop_meta() {
  python3 - "$1" << 'PY'
import subprocess, sys
path = sys.argv[1]
info = subprocess.check_output(
    ["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], text=True
)
w = h = None
for line in info.splitlines():
    if "pixelWidth:" in line:
        w = int(line.split(":")[1].strip())
    elif "pixelHeight:" in line:
        h = int(line.split(":")[1].strip())
if not w or not h:
    sys.exit(f"generate.sh: could not read the size of {path}")
if w == 1080 and h == 1350:
    sys.exit(0)
ratio = 1080 / 1350
if (w / h) > ratio:
    cw, ch = int(round(h * ratio)), h
else:
    cw, ch = w, int(round(w / ratio))
subprocess.check_call(
    ["sips", "-c", str(ch), str(cw), path, "--out", path],
    stdout=subprocess.DEVNULL,
)
subprocess.check_call(
    ["sips", "-z", "1350", "1080", path, "--out", path],
    stdout=subprocess.DEVNULL,
)
print(f"cropped to 1080x1350")
PY
}

gen() {
  local k="$1"
  if [ "$DRY" = "--dry-run" ]; then
    python3 -c "import json;d=json.load(open('$k.req.json'));print('$k:',d['aspect_ratio'],d['resolution'],len(d['prompt']),'chars,',len(d.get('input_urls',[])),'refs')"
    return
  fi
  [ -s "$k.png" ] && { echo "$k: exists, skip"; return; }
  graphed tools run "$TOOL" --account "$ACCT" --project "$PROJ" --wait --timeout 400 \
    --out "$k.res.json" --body "$(cat "$k.req.json")" >"$k.log" 2>&1
  # --wait timing out does not kill the run: poll it until the result lands
  local run; run=$(grep -oE 'trn_[a-z0-9]+' "$k.log" | head -1)
  local tries=0
  while [ ! -s "$k.res.json" ] && [ -n "$run" ] && [ $tries -lt 20 ]; do
    sleep 30; tries=$((tries+1))
    graphed tools get "$run" --account "$ACCT" --project "$PROJ" --out "$k.res.json" >>"$k.log" 2>&1
  done
  local url; url=$(python3 -c "import json;print(json.load(open('$k.res.json'))['resultUrls'][0])" 2>/dev/null)
  if [ -n "$url" ] && curl -sL "$url" -o "$k.png" && crop_meta "$k.png"; then
    echo "$k: done"
  else
    echo "$k: FAILED — see $k.log"
  fi
}

for f in *.req.json; do gen "${f%.req.json}" & done; wait

if [ -n "$DL" ] && [ "$DRY" != "--dry-run" ]; then
  mkdir -p ~/Downloads/"$DL" && cp ./*.png ~/Downloads/"$DL"/ 2>/dev/null && echo "copied to ~/Downloads/$DL"
fi

if [ "$DRY" != "--dry-run" ]; then
  prefix="static-ads/${DL:-ads}"
  for png in *.png; do
    [ -s "$png" ] || continue
    key="$prefix/$png"
    if graphed storage upload "$png" "$key" --account "$ACCT" --project "$PROJ" --content-type image/png; then
      echo "uploaded $key"
    else
      echo "upload failed: $key"
    fi
  done
fi
