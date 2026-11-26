#!/usr/bin/env bash
# Copy the AI SEO Tool app template into a project folder and deploy it to Graphed Cloud.
#
#   deploy.sh --account <act_…> [--slug ai-seo-tool] [--name "AI SEO Tool"] [--dir apps/<slug>]
#             [--timezone America/New_York] [--dry-run]
#
# Re-running updates the same project: code is re-copied from the skill's app/ folder, and the folder's
# .graphed.json (account link) is kept. The Postgres data lives in the cloud and is never touched.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/../app"
SLUG="ai-seo-tool"; NAME="AI SEO Tool"; DIR=""; ACCOUNT=""; TZ_NAME=""; DRY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --account) ACCOUNT="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --timezone) TZ_NAME="$2"; shift 2 ;;
    --dry-run) DRY="--dry-run"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]] || { echo "slug must be lowercase letters, digits and dashes" >&2; exit 2; }
[[ -z "$TZ_NAME" || "$TZ_NAME" =~ ^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$ ]] || { echo "timezone must be an IANA name, like America/Chicago" >&2; exit 2; }
DIR="${DIR:-apps/$SLUG}"
if [[ -z "$ACCOUNT" && -f "$DIR/.graphed.json" ]]; then
  ACCOUNT="$(node -e 'console.log(require(process.argv[1]).account_id||"")' "$(cd "$DIR" && pwd)/.graphed.json")"
fi
[[ -n "$ACCOUNT" ]] || { echo "pass --account <act_…> (see: graphed --format json accounts list)" >&2; exit 2; }

# Keep the timezone of an earlier deploy when --timezone is not given.
if [[ -z "$TZ_NAME" && -f "$DIR/graphed.yaml" ]]; then
  TZ_NAME="$(node -e 'const m=require("fs").readFileSync(process.argv[1],"utf8").match(/^\s+timezone: (\S+)/m);console.log(m?m[1]:"")' "$DIR/graphed.yaml")"
fi

mkdir -p "$DIR"
# Copy code. Keep the folder's .graphed.json and .git (graphed deploy pushes that repo to its remote), never ship
# node_modules or a local database.
rsync -a --delete --exclude node_modules --exclude .data --exclude .env --exclude ".env.*" --exclude .graphed.json --exclude .git "$APP/" "$DIR/"
# Set slug, name and timezone in the copied manifest (node, so this works the same on macOS and Linux).
node -e 'const fs=require("fs");const [f,slug,name,tz]=process.argv.slice(1);let s=fs.readFileSync(f,"utf8").replace(/^slug: .*$/m,`slug: ${slug}`).replace(/^name: .*$/m,`name: ${name}`);if(tz)s=s.replace(/^(\s+timezone: ).*$/gm,`$1${tz}`);fs.writeFileSync(f,s)' "$DIR/graphed.yaml" "$SLUG" "$NAME" "$TZ_NAME"
(cd "$DIR" && npm install --silent --no-audit --no-fund >/dev/null && node build-ui.mjs >/dev/null && npm test >/dev/null)

graphed deploy --file "$DIR/graphed.yaml" --account "$ACCOUNT" $DRY
[[ -n "$DRY" ]] && exit 0

echo
graphed --format json services list --project "$SLUG" --account "$ACCOUNT" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const a=j.services||j;for(const x of (Array.isArray(a)?a:[])) console.log(`${x.name||x.slug||"web"}: ${x.url||x.public_url||JSON.stringify(x)}`)})'
