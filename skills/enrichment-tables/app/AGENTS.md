# AGENTS.md

This project deploys to Graphed cloud from `graphed.yaml`. It is the enrichment
spreadsheet. The page at `/` is a Next.js client component. Keep its behavior.
Do not wrap it in the scaffold sidebar shell.

## Golden rules

- **Never guess manifest fields or CLI flags.** Run `graphed docs manifest`
  or `graphed <command> --help` first.
- **Use `graphed --format json`** when you need to parse output.
- **Migrations are TypeScript Kysely modules**, modeled on
  `packages/core/src/migrations/0001_enrichment.ts`. Register a new file in
  `packages/core/src/db/migrate.ts`. Never edit a migration that has already
  been applied. Apply with `npm run db:migrate` (also the deploy release command).
- **Never read `process.env` directly in app code.** Env goes through
  `packages/core/src/config.ts` (`envSlice()` / `coreEnv()`).
- **One database.** Dashboard routes and the worker use `initDb()` / `getDb()`.
  `DATABASE_URL` selects Postgres. When it is unset, the process uses embedded
  PGlite so `npm test` needs no database server.

## Project shape

One npm workspace (`packages/*`).

- `packages/core` (`@app/core`) — schema, queue, worker, formula runner, presets.
- `packages/dashboard` (`@app/dashboard`) — Next.js App Router. `app/page.tsx`
  renders the spreadsheet. `app/api/[...path]/route.ts` is the JSON API.
- The worker starts inside the Next server (`packages/dashboard/boot.ts`),
  twelve lanes, same as before. It is not a cron job.
- `cli.mjs` reads and queues rows. It does not run cells. The web worker does.

## UI

The spreadsheet is React in `packages/dashboard/components/spreadsheet/`.
Controls are the shadcn/ui components in `components/ui/`. Grid geometry
(column width, virtual row position) is set on the element from React, not
with a `style=` attribute. `app/spreadsheet.css` is the sheet layout.
New dashboard pages, if you add any later, go under `packages/dashboard/app/`
and register in `lib/plugins.ts`.
