# AGENTS.md

Guidance for coding agents working in this repository. This project deploys
to Graphed cloud from `graphed.yaml`.

## Golden rules

- **Never guess manifest fields or CLI flags.** Run `graphed docs manifest`
  or `graphed <command> --help` first. The packaged docs match the installed
  CLI version.
- **Use `graphed --format json`** when you need to parse output.
- **Develop against the local compose Postgres** (`docker compose up -d`,
  `npm run db:migrate`). Deploy with `graphed deploy`. Migrations are
  TypeScript, not SQL files — model new ones on
  `packages/core/src/migrations/0001_init.ts` and use the Kysely schema
  builder.
- **Never read `process.env` directly in app code.** Env goes through
  `packages/core/src/config.ts`: declare a zod schema and call `envSlice()`
  (see `coreEnv()` there for the pattern). The loader finds the project-root
  `.env` by walking up, and real environment variables always win.

## Project shape

One npm workspace (`packages/*`); a single root `npm install` covers
everything.

- `graphed.yaml` — the whole system: services (always-on HTTP), jobs (cron),
  release command, databases. Deploying upserts the cloud project from it.
- `packages/core` (`@app/core`) — the shared library. `src/db/` has the
  Kysely instance (`getDb()`) and `src/db/types.ts`, the single registry of
  table types: add a row type per migration. `src/migrations/` holds numbered
  TypeScript migrations (`0002_*.ts`, ... exporting `up`/`down`), applied in
  order by `npm run db:migrate` via Kysely's `Migrator` (also the deploy
  release command). Never edit an applied migration; add a new numbered file.
  Domain logic (pipelines, external-API adapters) lives here too so jobs and
  dashboard routes share it.
- `packages/jobs` (`@app/jobs`) — one thin entrypoint per cron job in
  `src/<name>.ts`: import the logic from `@app/core`, call it, `destroyDb()`.
  Wire each job into `graphed.yaml` as `jobs.<name>` with
  `command: npm run job:<name>`, plus the script in both
  `packages/jobs/package.json` (`tsx src/<name>.ts`) and a root proxy
  (`npm run -w @app/jobs job:<name>`).
- `packages/dashboard` (`@app/dashboard`) — Next.js App Router. One route
  folder per capability under `app/`; register pages in `lib/plugins.ts`
  (nav registry) and the layout renders them grouped by `group`. Query the
  database via `@app/core`'s `getDb()` — never a second pool or copy of the
  table types.
- **UI components are shadcn/ui, always.** The dashboard is set up for it:
  `components/ui/` (button, card, badge, table, ...), `components.json`,
  `cn()` in `lib/utils.ts`, design tokens as CSS variables in
  `app/globals.css` (slate tokens, light on `:root` and dark on `.dark`,
  toggled with next-themes). Compose the existing components
  first; when one is missing, add it with `npx shadcn@latest add <name>`
  rather than hand-rolling markup. No other component libraries, no inline
  `style=` attributes.
- Secrets are never committed. Declare the env name in `graphed.yaml`, set
  the value with `graphed secrets set <NAME>`, validate it with `envSlice()`.

## Plugins

Capabilities (SEO, outbound, ads, ...) come from the Graphed registry:

```bash
graphed plugins list
graphed plugins add <name>
```

`add` stages a kit at `.graphed/plugins/<name>/` — read its `AGENT.md` and
follow it end to end. The kit's `files/` are tested reference source: adapt
them into this repo's conventions; do not invent a parallel structure. Every
kit's runbook ends in a verification checklist — run it locally (compose
Postgres) before deploying.

## Safety

- Non-idempotent jobs run with `retries: 0` in `graphed.yaml`.
