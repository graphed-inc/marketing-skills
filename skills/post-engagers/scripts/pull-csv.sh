#!/usr/bin/env bash
# Download a lead list from a deployed Post Engagers project as CSV.
#   pull-csv.sh <job-id|all> [--since <days>] [--tracked <id>] [--project post-engagers] [--account act_…] [--dir apps/<project>] [--out file.csv]
# The container writes the CSV to project storage (exec output is not reliable for files), then this downloads it.
# --account defaults to the account in <dir>/.graphed.json, written by deploy.sh.
set -euo pipefail
JOB="${1:?job id or all}"; shift
PROJECT="post-engagers"; ACCOUNT=""; OUT=""; DIR=""; EXTRA=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;; --account) ACCOUNT="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;; --dir) DIR="$2"; shift 2 ;;
    --since|--tracked) EXTRA+=("$1" "$2"); shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
DIR="${DIR:-apps/$PROJECT}"
if [[ -z "$ACCOUNT" && -f "$DIR/.graphed.json" ]]; then
  ACCOUNT="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).account_id||"")' "$DIR/.graphed.json")"
fi
[[ -n "$ACCOUNT" ]] || { echo "pass --account <act_…> (or --dir to the deployed app folder)" >&2; exit 2; }

STAMP="$(date +%Y%m%d-%H%M%S)"
KEY="exports/$JOB-$STAMP.csv"
OUT="${OUT:-$PROJECT-$JOB-$STAMP.csv}"
graphed exec --project "$PROJECT" --account "$ACCOUNT" --timeout 300 -- node cli.mjs export "$JOB" ${EXTRA[@]+"${EXTRA[@]}"} --key "$KEY" >/dev/null 2>&1 || true
TMP="$(mktemp -d)"
if ! graphed storage download "$KEY" "$TMP" --project "$PROJECT" --account "$ACCOUNT" >/dev/null 2>&1; then
  rmdir "$TMP"; echo "export did not land in storage ($KEY). Run it again; check: graphed logs --project $PROJECT --account $ACCOUNT" >&2; exit 1
fi
mv "$TMP/$(basename "$KEY")" "$OUT"
rmdir "$TMP"
ROWS="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");let n=0,q=false;for(const c of s){if(c==="\"")q=!q;else if(c==="\n"&&!q)n++}console.log(Math.max(0,n-1))' "$OUT")"
echo "$ROWS people → $OUT"
