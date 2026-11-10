#!/usr/bin/env bash
# Copy the Enrichment Tables app into a project folder and deploy it to Graphed Cloud.
#
#   deploy.sh --account <act_…> [--slug enrichment-tables] [--name "Tables"] [--dir apps/<slug>] [--dry-run]
#
# Re-running updates the same project: code is re-copied from the skill's app/ folder, and the
# folder's .graphed.json (account link) is kept. Postgres data lives in the cloud and is never touched.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/../app"
SLUG="enrichment-tables"; NAME="Tables"; DIR=""; ACCOUNT=""; DRY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --account) ACCOUNT="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --dry-run) DRY="--dry-run"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]] || { echo "slug must be lowercase letters, digits and dashes" >&2; exit 2; }
DIR="${DIR:-apps/$SLUG}"
if [[ -z "$ACCOUNT" && -f "$DIR/.graphed.json" ]]; then
  ACCOUNT="$(node -e 'console.log(require(process.argv[1]).account_id||"")' "$(cd "$DIR" && pwd)/.graphed.json")"
fi
[[ -n "$ACCOUNT" ]] || { echo "pass --account <act_…> (see: graphed --format json accounts list)" >&2; exit 2; }

mkdir -p "$DIR"
rsync -a --delete --exclude node_modules --exclude .data --exclude .next --exclude .next-dev --exclude .graphed.json --exclude .git "$APP/" "$DIR/"
node -e 'const fs=require("fs");const [f,slug,name]=process.argv.slice(1);fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/^slug: .*$/m,`slug: ${slug}`).replace(/^name: .*$/m,`name: ${name}`))' "$DIR/graphed.yaml" "$SLUG" "$NAME"
(cd "$DIR" && npm install --silent --no-audit --no-fund >/dev/null && npm test >/dev/null)

graphed deploy --file "$DIR/graphed.yaml" --account "$ACCOUNT" $DRY
[[ -n "$DRY" ]] && exit 0

echo
graphed --format json services list --project "$SLUG" --account "$ACCOUNT" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const a=j.services||j;for(const x of (Array.isArray(a)?a:[])) console.log(`${x.name||x.slug||"web"}: ${x.url||x.public_url||JSON.stringify(x)}`)})'
