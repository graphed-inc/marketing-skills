# AGENTS.md

This project deploys to Graphed cloud from `graphed.yaml`. It is Ad Spy: a competitor ad
library plus a positioning-gaps heat map. The page at `/` is a Next.js client component that
is a React client app. Keep its behavior. Do not wrap it in a scaffold sidebar.

## Golden rules

- **Never guess manifest fields or CLI flags.** Run `graphed docs manifest`
  or `graphed <command> --help` first.
- **Use `graphed --format json`** when you need to parse output.
- **Migrations are TypeScript Kysely modules**, modeled on
  `packages/core/src/migrations/0001_ad_spy.ts`. Register a new file in
  `packages/core/src/db/migrate.ts`. Never edit a migration that has already
  been applied. Apply with `npm run db:migrate` (also the deploy release command).
- **Never read `process.env` directly in app code.** Env goes through
  `packages/core/src/config.ts` (`envSlice()` / `coreEnv()`).
- **Every vendor call is a Graphed Tool or the Graphed OpenRouter proxy** (`packages/core/src/tools.ts`).
  No vendor API keys.
- **No chat in the app.** Users query the database from their coding agent with
  `node cli.mjs sql "<select …>"`. "Ask your agent" copies that prompt (`packages/core/src/prompt.ts`).

## Project shape

One npm workspace (`packages/*`).

- `packages/core` (`@app/core`)
  - `sources.ts` ad library adapters (Meta, Google, LinkedIn via ScrapeCreators) → one ad shape
  - `pull.ts` list → new ads → media to object storage → rows → queue analysis
  - `analyze.ts` Gemini 2.5 Flash watches / reads each creative → typed columns
  - `research.ts` business URL → voice of customer → persona matrix → tag comments and ads
  - `gaps.ts` gap scores, cell evidence, ad concepts
  - `storage.ts` project storage with SigV4 (`node:crypto`), local folder when env is missing
  - `api.ts` JSON API + `/m/<key>` media redirect, `cli.ts` daily job and terminal commands
- `packages/dashboard` (`@app/dashboard`) — Next.js App Router. `app/page.tsx` renders
  `components/spy`. `app/api/[...path]/route.ts` and `app/m/[...key]/route.ts` call `handleApi`.
- The worker (analysis queue, research resume, ad mapping) starts inside the Next server
  (`packages/dashboard/boot.ts`). The `daily-pull` cron runs `node cli.mjs daily`.

## UI

Hash routes: `#/gaps` (home: onboarding, then the heat map), `#/all`, `#/new`, `#/brand/<id>`.
Styles in `app/ad-spy.css` (shadcn tokens, white + orange, light only).
