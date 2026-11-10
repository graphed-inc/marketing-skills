# AGENTS.md

This project deploys to Graphed cloud from `graphed.yaml`. It is UGC Studio: a Next.js app. The page is React.
The JSON API and the render worker run in that same server. Kysely talks to Postgres in the cloud and to embedded
PGlite when `DATABASE_URL` is unset, so `npm test` needs no database server.

## Golden rules

- **Never guess manifest fields or CLI flags.** Run `graphed docs manifest` or `graphed <command> --help` first.
- **Every vendor call is a Graphed Tool** (`packages/core/src/tools.ts` → `@graphed-inc/sdk`) or the Graphed LLM proxy.
  Never add vendor API keys.
- **Rendering spends credits.** `POST /api/videos` and `node cli.mjs render` refuse to run without `confirm: true` /
  `--yes`. Only send that after the user approved the estimate.
- **Schema changes are Kysely migrations** in `packages/core/src/migrations/`, registered in `db/migrate.ts`.
  `ensureSchema` is idempotent. Never edit a migration that has already been applied; add a new file.
- **Do not read `process.env` in app code.** Add the key to the zod schema in `packages/core/src/config.ts`.
- **One database.** `initDb()` / `getDb()` in `packages/core/src/db/index.ts`.
- **The worker runs inside the Next server** (`packages/dashboard/boot.ts`). It is not a cron job.
- **Media never streams through the app.** The API returns presigned api.graphed.com links. Presigned links can live
  1 hour at most.
- **Grid geometry is set from React** (a ref writes `transform` / size). Do not put column or row geometry in a
  `style=` attribute. `app/studio.css` is the page layout.

## Layout

- `packages/dashboard/` Next.js App Router. `app/page.tsx` renders the studio. `app/api/[...path]/route.ts` is the JSON API.
- `packages/core/src/` database, worker, render pipeline, plans, research, writer.
- `cli.mjs` terminal access (`graphed exec --project <slug> -- node cli.mjs …`). It reads and queues. The web worker renders.
- `engine/` python word fixer (needs ffmpeg + python3, both in the Dockerfile).
- `seed/avatars/<slug>/` built-in avatars (`avatar.jpg` + `avatar.json`), `seed/voice-ref.mp3` the shared voice sample.

## Checks

`npm test` (offline, fake vendors), `node uitest.mjs` (real Chrome, needs `npm i --no-save puppeteer-core`),
`graphed exec --project <slug> -- node smoke.mjs` (cloud, no spend).
