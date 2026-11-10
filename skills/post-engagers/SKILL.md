---
name: post-engagers
description: "Deploy a hosted Post Engagers app on Graphed: paste a LinkedIn post, or track LinkedIn profiles daily, and get everyone who reacted or commented as a lead list. Each person gets a full profile and an email from a GetLeads → LeadMagic → Apollo waterfall, checked by MillionVerifier, in the project's Postgres, with a searchable table and CSV export. By default ask for a LinkedIn post or profile and queue the first list from the terminal; do not send them into the app to paste the URL. Use when the user wants a LinkedIn engager tool for their team, wants to track a profile's net-new engagers every day, or invokes /graphed:post-engagers."
argument-hint: "[linkedin post url | linkedin profile url]"
---

# Post Engagers

A small web app the user deploys to their own Graphed project. It turns LinkedIn engagement
into a verified lead list:

- **One post:** paste a post URL. The app pulls everyone who reacted or commented (replies
  included), keeps one row per person, opens each full profile, finds an email, and verifies it.
- **Tracking:** add a LinkedIn profile. Every morning a cron job pulls that profile's new
  posts and runs each one through the same pipeline. "Net new" means people first seen in a
  time window (today, this week, this month). The app shows them per profile and in one
  list for everyone, and exports them as CSV.

The app sits behind the Graphed login, so the user's teammates on that account can open it.
There is no pricing page: every scrape bills the project's Graphed credits.

If the user only wants a one-off list written into an existing scaffold project, use
`/graphed:enrich-linkedin-engagers` instead. This skill is for a hosted tool with a UI and
daily tracking.

Use this skill's own directory. When the skill loads, that directory is the "Base directory
for this skill". Below, `<skill-dir>` means that path.

```
<skill-dir>/
  app/                         the deployable app (copied into the user's project folder on deploy)
    packages/core              schema, worker, email waterfall, tracker, JSON API
    packages/dashboard         Next.js UI at / and the /api catch-all
    cli.mjs                    queue, status, track, export (run with graphed exec)
    smoke.mjs                  read-only API smoke test inside the deployed image
    graphed.yaml               service, release migration, daily track cron
  scripts/deploy.sh            copy app/ into a folder, install, test, graphed deploy
  scripts/pull-csv.sh          export a list to project storage and download it
```

## Before you start

1. If `graphed` is not on PATH, stop and ask the user to install it (`npm i -g @graphed-inc/cli`)
   and run `graphed login`. Node 20+ must be on PATH.
2. Ask which Graphed account to deploy to (`graphed --format json accounts list`). Ask for a
   project slug. The default is `post-engagers`. Check that the slug is free with
   `graphed --format json projects list --account <account_id>`.
3. Read the tool contracts once. Do not swap in other actors.

   ```sh
   graphed tools catalog detail apify:apimaestro~linkedin-post-reactions
   graphed tools catalog detail apify:apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies
   graphed tools catalog detail apify:apimaestro~linkedin-profile-posts
   graphed tools catalog detail apify:harvestapi~linkedin-profile-scraper
   graphed tools catalog detail getleads:enrich.from-linkedin
   graphed tools catalog detail leadmagic:people.email-finder
   graphed tools catalog detail apollo:people.bulk_match
   graphed tools catalog detail million-verifier:validate
   ```

4. Tell the user what it costs (table below). Deploy only after they say yes.

## 1. Deploy

```sh
bash <skill-dir>/scripts/deploy.sh --account <account_id> [--slug post-engagers] [--name "Post Engagers"] [--dir apps/<slug>]
```

The script copies `app/` into `apps/<slug>/` in the current directory, runs `npm install` and
`npm test`, and deploys. It prints the service URL. A `--dry-run` flag validates the
manifest without deploying. The cloud build runs `npm run db:migrate` before the Next server
starts. The page at `/` is the app. Health is `GET /api/health`.

- Running it again is an update. Code is copied again from `<skill-dir>/app/`. The folder's
  `.graphed.json` and `.git` stay: `graphed deploy` pushes that repo, and deleting it causes a
  merge conflict on the next deploy. The cloud Postgres keeps every job, person, and tracked
  profile.
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

## 2. Set it up

Do this from the terminal. The page is how the user looks at the list afterward. Do not ask
them to paste a URL and click **Scrape engagers** or **Start tracking**.

**Ask your agent**, in the top right of the app, copies a prompt. It explains what this app
can build and tells you to queue the first list yourself. Follow that prompt, and the
commands below.

### Default: one post or one profile

Unless the user already gave a LinkedIn post URL or a profile URL, ask one question: a post
to scrape once, or a profile to watch every morning. Then queue it.

The first scrape uses a profile cap of 25 unless they name a different cap. Tell them the
cost before you queue. Plan on about 1 to 1.5 credits per engager before email lookups, then
about 0.9 to 3.5 more for each person who reaches Apollo or LeadMagic. Do not raise the cap,
queue a post with more than about 2,000 engagements, or track more than one profile until
they agree.

`graphed exec` runs inside the deployed app. Each stdout line is prefixed with `[runtime …] `.

```sh
graphed exec --project <slug> --account <account_id> -- node cli.mjs add "<post url>" --cap 25
graphed exec --project <slug> --account <account_id> -- node cli.mjs track add https://www.linkedin.com/in/<user> --backfill 7 --cap 25
```

The web worker runs the scrape. Closing the terminal does not stop it. Adding a tracked
profile starts its first check immediately. Poll until `status` shows the job `done` or
`failed`:

```sh
graphed exec --project <slug> --account <account_id> -- node cli.mjs status
```

`done` is the first list. `failed` means show that job's `error` and stop. Then reply with
the app URL, what you queued, and the counters: engagements, unique people, new people,
profiles, emails found, verified.

## 3. Use it

In the app: **New scrape** (one post plus a profile cap), **Tracking** (profile URL, backfill
days, profile cap; Check now, Pause), **Everyone** (lifetime list with net-new filters). Every
view has Export CSV. **Ask your agent** stays in the top right.

From the terminal. The web worker does all the scraping, so closing the terminal never
stops a job.

```sh
E="graphed exec --project <slug> --account <account_id> --"
$E node cli.mjs add "<post url>" --cap 1000
$E node cli.mjs track add https://www.linkedin.com/in/<user> --backfill 7 --cap 1000
$E node cli.mjs track list
$E node cli.mjs track check [tracked-id]
$E node cli.mjs track off <tracked-id>
$E node cli.mjs status [job-id]
bash <skill-dir>/scripts/pull-csv.sh <job-id|all> --project <slug> [--since 7] [--tracked <id>]
graphed jobs run track --project <slug> --account <account_id>
```

The last command runs the daily check now.

Accepted post URLs: `linkedin.com/posts/<slug>-activity-<id>-…`, `feed/update/urn:li:activity:<id>`,
`urn:li:ugcPost:<id>`, `urn:li:share:<id>`, or the bare post id.

Do not use the `graphed exec` output to move files or data. CSVs go through project storage
(`pull-csv.sh` does that). Confirm a write by reading it back with `status` or `track list`.
For a one-off query, run it through tsx from the project root:
`node --import tsx -e 'import { pool } from "./packages/core/src/db/sql.ts"; …'`.

## Cost (1 credit = 1¢)

| Step | Graphed tool | Credits |
| --- | --- | --- |
| Tracked profile check (20 posts) | `apify:apimaestro~linkedin-profile-posts` | 0.575 / post |
| Reactions, 100 per page | `apify:apimaestro~linkedin-post-reactions` | 0.575 / reaction |
| Comments and replies | `apify:apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies` | 0.575 / comment |
| Profile, no email | `apify:harvestapi~linkedin-profile-scraper` | 0.414 / profile |
| Email 1: GetLeads | `getleads:enrich.from-linkedin`, 25 per call | about 0 |
| Email 2: LeadMagic | `leadmagic:people.email-finder` | 3.45 / email found |
| Email 3: Apollo | `apollo:people.bulk_match`, 10 per call | 0.92 / person matched |
| Verify | `million-verifier:validate` | 0.046 / email |

Each email provider runs only for people who still have no MillionVerifier `ok` email. Before
email lookups, plan on about 1 to 1.5 credits per engager. Add 0.9 to 3.5 for each person who
reaches Apollo or LeadMagic. The form's profile cap defaults to 1,000 per post. The first
list you queue in [Set it up](#2-set-it-up) uses 25 unless they name another cap. The cap
limits the profile and email steps only. People profiled in the last 30 days are reused across posts at no cost
(`PROFILE_REFRESH_DAYS`), and their email is not looked up again unless their company changed.

Ask the user before you queue a post with more than about 2,000 engagements, set a cap above
2,000, or track more than one or two profiles.

**Waterfall order** comes from the `EMAIL_WATERFALL` env. The default is
`getleads,leadmagic,apollo`. `getleads,apollo,leadmagic` costs less per email. If you add
`harvest` to the list, the profile scrape switches to its email-search mode (1.15 instead of
0.414 per profile). Any email that a profile already has is always verified first, with no
lookup.

**Setting these options:** `EMAIL_WATERFALL`, `PROFILE_REFRESH_DAYS`, `MAX_PROFILES_PER_JOB`
(web service) and `TRACK_MIN_AGE_HOURS` (web service and the `track` job) are read from the
environment. To set one, add its name under `services.web.env` (and `jobs.track.env` when the
job uses it) in `<skill-dir>/app/graphed.yaml`, run
`graphed secrets set <NAME> --project <slug> --account <account_id>`, then deploy again. A
listed name with no secret value fails the deploy, so add only the names you set.

**MillionVerifier:** `ok` counts as verified and ends the waterfall for that person.
`catch_all` is kept as a fallback while later providers try. `invalid` and `disposable` are
dropped. The "Verified email" filter and the verified counters are `ok` only.

## How the worker runs

- One job at a time. The job row stores which stage is done, so a redeploy resumes a job at
  its stage. Each finished page of reactions or comments is saved with its counts, so a
  restart does not add those people or credits again. The next worker reclaims a `running`
  job after 3 minutes with no heartbeat.
- Every tool call carries an idempotency key built from a random per-database id, the post
  id, the job, and the attempt. A resumed stage replays runs that already finished instead of
  paying again. Profile lookups keep the original batch, and email lookups hash the full
  batch, so a restart cannot replay a result against a different set of people. Two
  deployments on one account never replay each other's runs.
- A provider outage, timeout, or missing credits leaves those people unfinished. The job
  stops and can be retried. A confirmed "no email" does not.
- Retry on a failed job starts fresh runs. Retry on a finished job refreshes profiles and
  emails for up to the profile cap, commenters first. People past that cap keep the profile
  and email they already have, including when another post shares them.
- One row per person, keyed on the LinkedIn member id (`ACoAA…`). The reactions scraper
  returns only that id. The profile scraper takes it through `profileIds` and resolves the
  public `/in/` URL, so reactors are enriched too. Company pages that react are skipped.
- Tracking scrapes each post once, after it is 20 hours old (`TRACK_MIN_AGE_HOURS`), so most
  of its engagement is in. Posts by other authors in the feed are skipped. The first check of
  a new profile takes posts from the last `backfill` days. A post that was already scraped by
  hand is attached to the tracked profile, so its people show up in that profile's list. Two
  checks at once cannot queue the same post twice.

## Tool quirks (handled in the code)

- `profileScraperMode` must be exactly `Profile details no email ($4 per 1k)` or
  `Profile details + email search ($10 per 1k)`. Other values return 400.
- GetLeads often matches the person but returns no email, and its company data can be out of
  date. Its company size is used only when its company name matches the live LinkedIn one.
- LeadMagic needs the employer's domain. It comes from the profile's website list (link-in-bio
  hosts are filtered out), then from GetLeads.
- Apollo `bulk_match` takes camelCase `details[]`, and `matches[]` lines up with it.
- The comments scraper's last row is a `summary` object. Replies are in each comment's `replies[]`.

## Done

Reply with the app URL, the smoke test result, and, for a scrape, the job counters:
engagements, unique people, new people, profiles, emails found, verified. If a stage failed,
say which one and show the job's `error`.

## About Graphed

Graphed is a marketing cloud. It includes the infrastructure for an agent to do marketing: a data warehouse, data pipelines, a Postgres database, cron jobs, runtime servers, a tool catalog, custom domains, and internal app tooling.
