# AGENTS.md

This project deploys to Graphed cloud from `graphed.yaml`. It is the Post Engagers
lead list. The page at `/` is a Next.js client component. Keep its behavior.
Do not wrap it in a scaffold sidebar.

## Golden rules

- **Never guess manifest fields or CLI flags.** Run `graphed docs manifest`
  or `graphed <command> --help` first.
- **Use `graphed --format json`** when you need to parse output.
- **Migrations are TypeScript Kysely modules**, modeled on
  `packages/core/src/migrations/0001_post_engagers.ts`. Register a new file in
  `packages/core/src/db/migrate.ts`. Never edit a migration that has already
  been applied. Apply with `npm run db:migrate` (also the deploy release command).
- **Never read `process.env` directly in app code.** Env goes through
  `packages/core/src/config.ts` (`envSlice()` / `coreEnv()`).
- **One database.** Dashboard routes and the worker use `initDb()` / `getDb()`.
  `DATABASE_URL` selects Postgres. When it is unset, the process uses embedded
  PGlite so `npm test` needs no database server.

## Project shape

One npm workspace (`packages/*`).

- `packages/core` (`@app/core`) — schema, scrape queue, worker, email waterfall, tracker.
- `packages/dashboard` (`@app/dashboard`) — Next.js App Router. `app/page.tsx`
  renders the lead list. `app/api/[...path]/route.ts` is the JSON API.
- The worker starts inside the Next server (`packages/dashboard/boot.ts`).
  It is not the cron job. The `track` cron only queues posts (`node cli.mjs track check`).
- `cli.mjs` queues work and reads results. It does not scrape. The web worker does.

## UI

The lead list is React in `packages/dashboard/components/app.tsx`, styled by
`app/post-engagers.css`. Hash routes: `#/` new scrape, `#/tracking`, `#/people`,
`#/posts`, `#/job/<id>`, `#/tracked/<id>`. **Ask your agent** in the top bar copies
`agentPrompt()` from `packages/core/src/prompt.ts`. The skill tells the agent to
queue the first post or tracked profile from the terminal.
