---
name: enrich-linkedin-engagers
description: "Scrape people who engaged with a LinkedIn profile or post, find their emails, and verify them with MillionVerifier. Use when the user gives a LinkedIn user or post and wants those engagers enriched, or invokes /graphed:enrich-linkedin-engagers."
argument-hint: "<linkedin profile or post url>"
---

# Enrich LinkedIn engagers

One LinkedIn profile or one post in. A folder of verified contacts out.

Scrape who commented or reacted, match emails, leave out people already in the CRM when the user asks, then verify the rest with MillionVerifier. Each run writes its own artifact so the user can come back to it.

When they gave you a profile or post, do these three things even if they only pasted a URL:

1. Ask whether they want to connect their CRM so existing contacts are excluded.
2. Write a new artifact folder for this enrichment.
3. Tell them this same workflow can run daily on a cron that watches one or more LinkedIn influencers.

Setting up the tables, dashboard, and cron does not need a URL. If that is what they asked for, do sections 6 and 7 and stop. Do not invent a profile to scrape.

## Before you start

1. If `graphed` is not on PATH, stop and ask the user to install it (`npm i -g @graphed-inc/cli`) and run `graphed login`.
2. You need a Graphed account and project. Tools bill that project. Do not start a scrape until both are set.
3. Read the tool contracts before the first call. Copy the ids below into `graphed tools run`. Do not invent actor names.

   ```sh
   graphed tools catalog detail apify:apimaestro~linkedin-profile-posts
   graphed tools catalog detail apify:apimaestro~linkedin-post-reactions
   graphed tools catalog detail apify:apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies
   graphed tools catalog detail apollo:people.bulk_match
   graphed tools catalog detail apollo:people.email
   graphed tools catalog detail million-verifier:validate
   graphed tools catalog detail million-verifier:bulk
   ```

Pass `--project` and `--account` on every `graphed tools` and `graphed storage` command.

## 1. What to scrape

Use the LinkedIn profile or post the user already gave. If they gave neither, ask for one:

- A profile (`https://www.linkedin.com/in/<username>` or the username). Pull that person's recent posts, then the people who engaged with those posts.
- A post URL. Scrape engagers on that post only.

For a profile, ask how many recent posts to include. Default to 5. Skip any post whose URL contains `groupPost`.

## 2. CRM exclusion

Before any paid call, ask whether they want to connect their CRM so people already in it are left off this list.

- If they say no, skip exclusion and write `crm.enabled: false` in the artifact.
- If they say yes, ask which CRM. HubSpot and Salesforce are the usual ones. Use whatever is already in this account's Graphed warehouse. Do not guess a dataset or a column.
- Read `graphed docs warehouse`, then list tables and columns. Find the contact email column, and a LinkedIn URL column when one exists.
- If that CRM is not in the warehouse yet, say so and tell them it has to be connected before exclusion can run. Continue the enrichment only if they say to run it without the exclusion.
- When you have a real contact list, drop an engager whose email or LinkedIn URL is already in it. Reason: `crm`. Do this after emails are found and before MillionVerifier, so excluded people are not verified.

## 3. Scrape engagers

Profile posts:

```sh
graphed tools run apify:apimaestro~linkedin-profile-posts \
  --wait --timeout 120 --out posts.json \
  --body '{"username":"<username>","total_posts":5}'
```

For each post, take the activity id: the digits after `urn:li:activity:` or `activity-`. Then scrape comments and reactions:

```sh
graphed tools run apify:apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies \
  --wait --timeout 120 --out comments.json \
  --body '{"postIds":["<activity id>"],"limit":100,"sortOrder":"most recent"}'

graphed tools run apify:apimaestro~linkedin-post-reactions \
  --wait --timeout 240 --out reactions.json \
  --body '{"post_urls":["<activity id>"],"page_number":1,"limit":100}'
```

Page reactions. Stop after 3 pages, or when a page is empty. If a reactions call times out, keep the comments you already have and record the skip. Do not fail the whole run for one slow post.

Normalize each person:

- `linkedin_url` from `author.profile_url` (comment) or `reactor.profile_url` (reaction)
- `full_name`
- `title` from the headline
- `engagement_type`: `comment` or `reaction`
- `comment_text` for comments, empty for reactions
- `source_post_url`

Dedupe on `linkedin_url`. When the same person both commented and reacted, keep the comment. Drop rows with no profile URL. Drop URN-only profiles (`/in/ACo`) from email matching and list them in the artifact as `skipped_urn`.

Tell the user the counts before you spend on emails: engagers, unique profiles, URN skips. Apollo match is about 0.92 credits per person. A missing email that you then reveal is another charge of about the same size. MillionVerifier is about 0.046 credits per email. Scrapes are about 0.575 credits per result. If there are more than 100 unique profiles, wait for a yes before matching.

## 4. Find emails

Match LinkedIn URLs with Apollo in batches of at most 10. `matches[]` lines up 1:1 with `details`. A miss is `null`.

```sh
graphed tools run apollo:people.bulk_match --wait \
  --body '{"details":[{"linkedinUrl":"https://www.linkedin.com/in/example"}]}'
```

Do not pass reveal flags on `bulk_match`. Read `email`, `email_status`, `organization.name`, and `country` from each match. When `email` is empty, reveal it with `apollo:people.email` and the same `linkedinUrl`. Graphed polls that call. Leave people who still have no email in the artifact as `not_found`. Do not send them to MillionVerifier.

Apply the CRM exclusion from step 2 here, before verification.

## 5. MillionVerifier

Verify every email that is still in the list.

A short list (25 emails or fewer): one call each.

```sh
graphed tools run million-verifier:validate --wait \
  --body '{"email":"ada@example.com","timeout":20}'
```

A longer list: upload a CSV and run bulk. The bulk tool only accepts a Graphed project storage GET URL. Keep `filter` at `all` so invalid rows stay in the report.

```sh
graphed storage upload ./emails.csv linkedin-engagers/<slug>/emails.csv --content-type text/csv
graphed --format json storage url linkedin-engagers/<slug>/emails.csv --expires-in 3600
graphed tools run million-verifier:bulk --wait --timeout 3600 --out report.csv \
  --body '{"url":"<storage GET url>","filter":"all"}'
```

The command prints a `trn_…` id. If `--wait` times out, the run is still going. Save that id on the Postgres run row with status `waiting` and resume with `graphed tools get <trn_…> --out report.csv`. Do not start a second bulk file for the same emails.

Treat `ok` and `catch_all` as deliverable. Keep `invalid` and `unknown` in the artifact with that status. Do not drop them silently.

Map report rows back by email. The bulk CSV may use `email` and `result` (also `resultcode`, `quality`).

## 6. Save the run in Postgres

The record of a run is two tables, not a file on disk. A Graphed job container has no persistent disk, so a folder written during the job is gone when the container stops.

Before writing, read `graphed docs manifest` and run `graphed databases list`. If this directory has no `graphed.yaml` and they asked you to set the project up, create it with `graphed init <directory> --yes` (pass `--account` when they named one). If this project has no `primary` database, add this block to `graphed.yaml`. Do not also list `DATABASE_URL` under `jobs.*.env` or `release.env`. The database block injects it.

```yaml
databases:
  primary:
    env: DATABASE_URL
```

Copy the templates shipped next to this skill. On a fresh scaffold, copy them as-is. Do not rewrite the TypeScript. If the project already has other tables or nav entries, merge `templates/types.ts`, `templates/core-index.ts`, and `templates/plugins.ts` instead of replacing those three.

| Template | Destination |
| --- | --- |
| `templates/migration.ts` | `packages/core/src/migrations/<next>_linkedin_engagers.ts` |
| `templates/types.ts` | `packages/core/src/db/types.ts` |
| `templates/persist.ts` | `packages/core/src/linkedin-engagers.ts` |
| `templates/pipeline.ts` | `packages/core/src/linkedin-engagers-pipeline.ts` |
| `templates/core-index.ts` | `packages/core/src/index.ts` |
| `templates/dashboard-page.tsx` | `packages/dashboard/app/linkedin-engagers/page.tsx` |
| `templates/plugins.ts` | `packages/dashboard/lib/plugins.ts` |
| `templates/self-check.ts` | `packages/jobs/src/linkedin-engagers-self-check.ts` |
| `templates/jobs-package.json` | `packages/jobs/package.json` |

`<next>` is one higher than the latest migration already in that directory. If the latest file is `0001_init.ts`, name this one `0002_linkedin_engagers.ts`. Never edit an applied migration. The pipeline and persist filenames have to stay `linkedin-engagers-pipeline.ts` and `linkedin-engagers.ts`. `@app/core/*` maps onto `packages/core/src/*.ts`.

Add this root script next to `job:example-daily`:

```json
"job:linkedin-engagers-self-check": "npm run -w @app/jobs job:linkedin-engagers-self-check"
```

`npm install` from the repo root, start Postgres with `docker compose up -d`, copy `env.example` to `.env` if `.env` is missing, then `npm run db:migrate`.

`insertEngagerRun` opens the run. `replaceEngagers` writes the people in one transaction, so a failed insert does not leave the run empty. `finishEngagerRun` stores counts. When a bulk MillionVerifier run is still going, set status `waiting` and store the `trn_…` id. The next run calls `findWaitingEngagerRun` and downloads that report instead of scraping again.

Prove the copy before you trust it:

```sh
npm run job:linkedin-engagers-self-check
```

The last line is JSON and includes `"ok": true`. That command does not call paid tools. It writes one synthetic run (Ada Fixture, Grace Fixture, and a URN skip) into the database `DATABASE_URL` points at. If a real run is `waiting` on a `trn_…` id, the command refuses so it does not download that report. The dashboard route is `/linkedin-engagers`.

For the session you are in, also write this folder so the user can open the CSVs. It is a copy of the rows you inserted. Do not commit it unless they ask. Do not treat it as the copy the daily job keeps.

```
linkedin-engagers/
  <yyyy-mm-dd>-<slug>/
    README.md
    engagers.csv
    verified.csv
    excluded.csv
```

`<slug>` is the profile username or `post-<activity id>`. If that slug already exists, append `-2`, `-3`, and so on. The same slug is the unique `linkedin_engager_runs.slug`.

`engagers.csv` is everyone scraped: name, title, company, country, linkedin_url, engagement_type, comment_text, source_post_url, email, email_status, verification_result.

`verified.csv` is `ok` and `catch_all`, not excluded. `excluded.csv` is CRM matches, with `excluded_reason`.

Show the user the new run id and `SELECT id, slug, status, engagers, emails, verified, excluded, not_found, created_at FROM linkedin_engager_runs ORDER BY created_at DESC`. When the project database is already in the cloud, that query is:

```sh
graphed databases query --database primary --project <project_slug> --account <account_id> -- 'SELECT id, slug, status, engagers, emails, verified, excluded, not_found, created_at FROM linkedin_engager_runs ORDER BY created_at DESC'
```

## 7. Daily cron

After the run is saved, tell the user this can be deployed as a cron job that tracks one or more LinkedIn influencers every day. Each run pulls their new posts, scrapes engagers, finds emails, excludes CRM contacts when they asked for that, verifies with MillionVerifier, and inserts a new `linkedin_engager_runs` row plus its people. The daily pass only processes posts that are between 24 and 72 hours old.

Ask if they want that job. If they do, keep the influencer usernames in `linkedin-engagers/influencers.txt` in the repo, one per line (`templates/influencers.txt` is the empty starter). That file ships with the image. The report does not. Optional: `linkedin-engagers/exclude-emails.txt`, one email per line, is applied before verification.

Copy `templates/job.ts` to `packages/jobs/src/linkedin-engagers.ts`. `templates/jobs-package.json` already adds the script and `@graphed-inc/sdk`. Add the root proxy next to the self-check script:

```json
"job:linkedin-engagers": "npm run -w @app/jobs job:linkedin-engagers"
```

`npm run` executes that script with the working directory set to `packages/jobs`. The job resolves `linkedin-engagers/influencers.txt` from `projectRoot()` (the directory that contains `graphed.yaml`), not from the jobs package. It then calls `runLinkedinEngagersJob`: resume a `waiting` MillionVerifier report when one is stored, otherwise scrape posts that are 24–72 hours old, drop `groupPost` URLs, dedupe (a comment wins over a reaction), skip `/in/ACo` URLs for email matching, match with Apollo, verify each remaining email with `million-verifier:validate`, and insert one `linkedin_engager_runs` row per influencer. A live run needs Graphed credentials. Locally that is `graphed dev run -- npm run job:linkedin-engagers`. In the cloud the platform injects them. Do not put `GRAPHED_TOKEN` or `DATABASE_URL` in the job `env` list.

```yaml
jobs:
  linkedin-engagers:
    command: npm run job:linkedin-engagers
    schedule:
      cron: "0 13 * * *"
      timezone: UTC
    timeout_seconds: 7200
    retries: 0
```

`retries` stays `0`. The job pays for scraping and matching, and a platform retry would start those calls again. Resume a `waiting` row from Postgres instead. Do not hardcode a run id. Do not run `graphed deploy` unless they explicitly say to. Leave the manifest alone until they ask for the cron.

## Done

Reply with the Postgres run id, the session folder path, and the counts: scraped, emailed, verified, excluded, not found. Repeat the cron offer if you have not already made it. If a stage failed, say which one and whether a `trn_…` id is stored on the run row.
