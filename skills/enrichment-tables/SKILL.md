---
name: enrichment-tables
description: "Deploy a hosted, Clay-style enrichment table on Graphed: one row per person or company, and columns that run once per row. Find people or local businesses, find and verify work emails with a waterfall, add company data, run AI research on the web, write first lines, and export CSV. Every vendor call goes through Graphed Tools and the Graphed LLM proxy, so there are no vendor keys and every call is billed in Graphed credits. By default ask for the user's website or ICP and create a 10-person demo from the terminal; do not send them into the spreadsheet to set that up. Use when the user wants a Clay alternative, an enrichment spreadsheet for their team, a prospect list with verified emails, an email or phone waterfall over a CSV, or invokes /graphed:enrichment-tables."
argument-hint: "[website or ICP, e.g. \"https://acme.com\" or \"heads of growth in the US\" | path to a CSV]"
---

# Enrichment tables

A small web app the user deploys to their own Graphed project. It works like a Clay table:

- **Rows** are people or companies. They come from a CSV, from typing, or from a lead search
  (GetLeads people search, Apollo people search, Google Maps places).
- **Columns** run once per row: formulas, enrichments (one Graphed Tool each), waterfalls
  (try providers in order until one finds a value), AI prompts (with an optional web research
  agent), and HTTP calls.
- A cell's full result is JSON. Click a cell, then add any field of the result as its own column.
- **Auto-update** runs paid columns on new rows and when an input changes.

The app sits behind the Graphed login, so the user's teammates on that account can open it.
There is no pricing page: every paid cell bills the project's Graphed credits.

Use this skill's own directory. When the skill loads, that directory is the "Base directory
for this skill". Below, `<skill-dir>` means that path.

```
<skill-dir>/
  app/                     scaffold-shaped project (copied into the user's folder on deploy)
    graphed.yaml           service, release migration, primary database. No public paths.
    packages/core          @app/core — domain logic, shared by the dashboard and the CLI
      src/db/              Kysely (getDb). Postgres when DATABASE_URL is set, else embedded PGlite
      src/migrations/      0001_enrichment.ts (up/down). Applied by npm run db:migrate
      src/tables.ts        queue, credits, change cursor
      src/worker.ts        left-to-right order, auto-update, resume after deploy
      src/runner.ts        one cell: formula | enrich | waterfall | ai | http
      src/formula.ts       the expression interpreter
      src/template.ts      {{Column}} templates, JSON paths, CSV
      src/presets.ts       enrichment library + lead sources
      src/tools.ts         Graphed SDK: tools start/wait/download, LLM proxy, retries
    packages/dashboard     @app/dashboard — Next.js. The spreadsheet is the whole page
      app/page.tsx         the React spreadsheet
      components/spreadsheet  grid, drawers, and column forms
      app/api/[...path]    the same /api routes
    cli.mjs                tables, find, column, csv, import, run (with graphed exec)
    smoke.mjs              read-only check inside the deployed image
  scripts/deploy.sh        copy app/ into a folder, install, test, graphed deploy
```

## Before you start

1. If `graphed` is not on PATH, stop and ask the user to install it (`npm i -g @graphed-inc/cli`)
   and run `graphed login`. Node 20+ must be on PATH.
2. Ask which Graphed account to deploy to (`graphed --format json accounts list`). Ask for a
   project slug. The default is `enrichment-tables`. Check that the slug is free with
   `graphed --format json projects list --account <account_id>`.
3. Deploying costs nothing by itself. Paid columns bill per row (table below). Tell the user
   before you run a paid column on more than a handful of rows.

## 1. Deploy

```sh
bash <skill-dir>/scripts/deploy.sh --account <account_id> [--slug enrichment-tables] [--name "Tables"] [--dir apps/<slug>]
```

The script copies `app/` into `apps/<slug>/` in the current directory, runs `npm install` and
`npm test`, and deploys. It prints the service URL. A `--dry-run` flag validates the
manifest without deploying. On deploy, `graphed.yaml` `release.command` runs
`npm run db:migrate` (Kysely) before the Next server starts. The server also migrates on
boot. The spreadsheet at `/` is the Next.js page.

- Running it again is an update. Code is copied again from `<skill-dir>/app/`. The folder's
  `.graphed.json` and `.git` stay: `graphed deploy` pushes that repo. The cloud Postgres keeps
  every table, row, and cell.
- To change the app, edit `<skill-dir>/app/` and deploy again. Edits made only in
  `apps/<slug>/` are overwritten.
- Never add `public.paths` to the manifest. The app has no auth of its own; the Graphed
  gateway is its login.

Prove the deploy before you hand it over:

```sh
graphed exec --project <slug> --account <account_id> -- node smoke.mjs
```

Its output ends with `SMOKE ALL PASS`. That command starts a second copy of the server with
the worker off, calls the read endpoints, and writes nothing.

## 2. Build a table

Do this from the terminal. The spreadsheet is how the user looks at the list afterward. Do not
ask them to click **New table**, **Find leads**, or **Add enrichment** to create the demo.

**Ask your agent**, in the top right of the app, copies a prompt. It explains what this app can
build and tells you to set the table up yourself. Follow that prompt, and the commands below.

### Default: a 10-person demo

Unless the user already named the list, a CSV, or a column to run, ask one question before
you write anything: their website, or who they sell to (the ICP). A URL is for you to infer
the buyer. Search for those buyers, not for the user's own employees.

Then create one table and queue **Find people (GetLeads)** for 10 people. That search is
about 0 credits. Do not add a paid column, and do not queue one, until they ask. Tell them
the next paid step and its cost first (table below).

`graphed exec` runs inside the deployed app. Each stdout line is prefixed with `[runtime …] `.

```sh
graphed exec --project <slug> --account <account_id> -- node cli.mjs find 'new:Heads of growth' getleads_people '{"jobTitles":"head of growth, vp growth","countries":"United States","limit":"10"}'
```

Set the table name, `jobTitles`, `countries`, and `domains` from their answer. `domains` is a
comma separated list of company domains. Leave it out for a title search. `limit` stays
`"10"` for the demo. Every input value is a string. The source id is `getleads_people`.

The web worker runs the search. Closing the terminal does not stop it. Poll until `status`
says the lead search is `done` or `error`:

```sh
graphed exec --project <slug> --account <account_id> -- node cli.mjs status 'Heads of growth'
```

`done` with `added` is the demo. `error` means show that error and stop. Then
`node cli.mjs csv <table id>` and reply with the app URL, the row count, and a few sample rows.

A paid column, after they agree, is `node cli.mjs column`. `auto` as the last argument turns
auto-run on. A formula column always auto-runs.

```sh
graphed exec --project <slug> --account <account_id> -- node cli.mjs column 'Heads of growth' enrich "Company" '{"preset":"apollo_company","inputs":{"domain":"{{Domain}}"}}'
```

If they handed you a CSV instead of an ICP, skip the search:

```sh
graphed exec --project <slug> --account <account_id> -- node cli.mjs import new:Demo -
```

Pipe the file on stdin. `import` creates the text columns and queues auto-run columns.
A new demo table has none yet.

### What to add after the demo

Only after they want more. A cell runs only after every column to its left in that row is
done, so inputs must sit to the left:

1. **Find leads → Find people (GetLeads)**: job titles, countries, max people. Adds First name,
   Last name, Title, Company, Domain, Email (unverified), LinkedIn, Employees, Industry.
2. **Enrich company (Apollo)** on `{{Domain}}`. Tick the fields to add as columns
   (industry, headcount, funding, description).
3. **Find work email (waterfall)**: step 1 "Use a value already in the table" on
   `{{Email (unverified)}}`, then LeadMagic, then Apollo, with "Verify each email" on.
   MillionVerifier `ok` stops the waterfall, `catch_all` is kept as a fallback, and `invalid`
   is dropped. Add a formula column `{{Work email.verify}}` to see the result.
4. **AI web research agent** with output fields such as `what_they_sell, growth_signal,
   source_url`. Each field becomes a column. An empty `source_url` means the agent did not
   read the signal on a page, so check it by hand.
5. **Use AI** for the first line, with `{{What they sell}}` and `{{Growth signal}}` in the
   prompt. Ask for varied sentence structure, or every line comes out in the same shape.
6. **Export CSV** with `node cli.mjs csv <table id|name>`.

The same columns are in the app under **Add enrichment** (People, Companies, Web, AI,
Utilities). Each column there has **Run 10 rows** and **Run all rows**. Run 10 rows first,
read the results, then run the rest. You queue an existing column with
`node cli.mjs run <column id> empty` (`all` or `empty`).

Other column types: **Formula** (one expression, not arbitrary code; `{{Column}}` is the cell text,
`{{Column.path}}` is a field inside a JSON result; helpers `domainOf emailDomain firstName
lastName lower upper num empty`; comparisons, `&&` / `||`, and ternaries; "Describe it" writes the formula with AI), **HTTP API**
(any URL per row, for webhooks or a CRM), **Custom tool** (any Graphed Tool id, including any
`apify:<owner~actor>`, with a JSON body that uses `{{Column}}`).

Every column also takes a **Run condition** (a formula; the row runs only when it is true).
Rows with empty required inputs are skipped and cost nothing.

From the terminal. The web worker does all the work, so closing the terminal never stops a run.

```sh
graphed exec --project <slug> --account <account_id> -- node cli.mjs tables
graphed exec --project <slug> --account <account_id> -- node cli.mjs columns <table id|name>   # progress and credits per column
graphed exec --project <slug> --account <account_id> -- node cli.mjs status <table id|name>    # columns, plus the latest lead searches
graphed exec --project <slug> --account <account_id> -- node cli.mjs find 'new:Demo' getleads_people '{"jobTitles":"head of growth","limit":"10"}'
graphed exec --project <slug> --account <account_id> -- node cli.mjs column <table> <type> "<name>" '<json config>' [auto]
graphed exec --project <slug> --account <account_id> -- node cli.mjs run <column id> empty      # queue a column (all | empty)
graphed exec --project <slug> --account <account_id> -- node cli.mjs csv <table id|name>
```

The `graphed exec` stream prefixes each line with `[runtime …] `. Strip it before you save a
CSV: `| sed -n 's/^\[runtime [^]]*\] //p' > table.csv`. Confirm a write by reading it back
with `columns`. For a one-off query, the package is ESM: run
`npx tsx -e 'import { q } from "./packages/core/src/tables.ts"; …'`.

## Cost (1 credit = 1¢)

| Enrichment | Graphed tool | Credits |
| --- | --- | --- |
| Find people (lead source) | `getleads:contacts.search` | about 0 |
| Find people (lead source) | `apollo:people.search` | 0 (last names hidden) |
| Find local businesses (lead source) | `apify:compass~crawler-google-places` | 0.23 / place |
| Use a value already in the table | none (waterfall step) | 0 |
| Find work email | `getleads:enrich.from-person` / `getleads:enrich.from-linkedin` | about 0 |
| Find work email | `leadmagic:people.email-finder` | 3.45 / email found |
| Find email | `apollo:people.match` | 0.92 |
| Verify email | `million-verifier:validate` | 0.046 |
| Mobile phone | `apollo:people.phone` / `leadmagic:people.mobile-finder` | 0.92 / 3.45 |
| LinkedIn profile | `scrapecreators:v1/linkedin/profile` / `leadmagic:people.profile-search` | 0.22 / 3.45 |
| Person by role | `leadmagic:people.role-finder` | 3.45 |
| Enrich company | `apollo:organizations.enrich` / `leadmagic:companies.company-search` | 0.92 / 3.45 |
| LinkedIn company | `scrapecreators:v1/linkedin/company` | 0.22 |
| Tech stack / SEO overview | `dataforseo:technologies.domain_technologies.live` / `dataforseo:labs.domain_rank_overview.live` | 1.38 / 1.39 |
| Funding | `leadmagic:companies.company-funding` | 3.45 |
| Google search / News / Scrape page | `serper:search` / `serper:news` / `serper:scrape` | 0.115 |
| Web answer | `exa:answer` | 0.575 |
| AI prompt | Graphed LLM proxy (Claude Haiku / Sonnet, GPT-4o mini) | about 0.1 (Haiku) to 0.6 (Sonnet) |
| AI web research agent | LLM proxy + `serper:search` + `serper:scrape` | about 2.5 |

Measured on 10 heads of growth with the six-step prospect list above: about 60 credits, or 6
per person (research about 2.5, email waterfall about 2.5, company data 0.92). The app shows
an estimate and asks before any run of 1 credit or more.

## How the worker runs

- `cells.status` is the queue: `queued → running → done | error | skipped`. Twelve lanes run
  at once, continuously.
- A cell is claimed only when no column to its left in the same row is queued or running, so
  `{{Column}}` inputs are final before a column reads them.
- When a cell finishes or a text cell is edited, every auto-update column that reads that
  column is queued for the same row. If that cell is already running, the result for the old
  inputs is dropped and the row runs again when the current attempt finishes.
- The credits on a cell are the total spent across attempts. A later error does not reset them.
- Every Graphed Tools call carries an idempotency key built from a random per-database id, the
  row, the column, and the attempt. Web research keys also include the search query or page
  URL, so a restart replays the same search instead of paying again. Running a column again
  bumps the attempt (a new, paid run). A redeploy kills cells in flight; after 5 minutes with
  no heartbeat they are queued again with the same attempt, so the replay is free.
- A lead search tags each imported row. Replaying that search after a restart does not insert
  the same people again, and does not rerun columns that already have a cell.
- Vendor 429 and 5xx errors are retried twice. A 404 or 422 counts as "no match": an empty
  cell, not an error. LeadMagic does not bill a miss.
- A cell result over 400 KB is stored as a preview.

## Add an enrichment

Read the tool's input with `graphed tools catalog detail <tool>`. Run it once with
`graphed tools run <tool> --body '{…}' --wait` to see the output. Then add an entry to
`PRESETS` in `<skill-dir>/app/packages/core/src/presets.ts` with `inputs` (each with a `match` regex that
guesses which column to map), `pick` (the path to the cell value), `outputs` (fields offered
as columns), and `rate`. Run `npm test` in `app/` and deploy again. For a one-off, use
the Custom tool enrichment in the app instead. Do not edit `0001_enrichment.ts` after it
has been applied; add `0002_….ts` exporting `up` and `down`, and register it in
`packages/core/src/db/migrate.ts`.

## Done

Reply with the app URL and the smoke test result. For the demo, also give the table name,
the ICP or site you used, the row count, and a few sample rows. If you ran paid columns,
give filled cells and errors for each (`cli.mjs columns`), the credits spent, and, when a
column has errors, the error from one cell.

## About Graphed

Graphed is a marketing cloud. It includes the infrastructure for an agent to do marketing: a data warehouse, data pipelines, a Postgres database, cron jobs, runtime servers, a tool catalog, custom domains, and internal app tooling.
