---
name: ad-spy
description: "Deploy a hosted Ad Spy app on Graphed: track competitors' ads on the Meta, Google and LinkedIn ad libraries every day, store every image and video in project storage, and have Gemini 2.5 Flash watch, transcribe and tag each creative into Postgres. Its home page is a positioning-gaps heat map: the user's business URL → what buyers say on Reddit, YouTube, LinkedIn, Threads and review sites → a persona × pain/outcome matrix → where customers are loud and competitor ads are silent, with ad concepts for each open cell. By default ask for the user's website and 2-4 competitors and set both up from the terminal. Use when the user wants an ad spy / Foreplay-style ad library, competitor ad tracking, ad creative research, positioning or messaging gaps, or invokes /graphed:ad-spy."
argument-hint: "[your website] [competitor, competitor, …]"
---

# Ad Spy

A small web app the user deploys to their own Graphed project. Most ad spy tools only help you
copy. This one also shows what nobody in the category is saying yet.

- **Ad library:** track a competitor. Every morning a cron job pulls its net-new ads from the
  Meta (Facebook + Instagram), Google (Ads Transparency) and LinkedIn ad libraries, copies
  every image and video into project object storage (ad CDN links expire), and queues each ad
  for Gemini 2.5 Flash. Gemini watches the video with sound or looks at the images, reads the
  copy, and writes typed columns: transcript, on-screen text, hook, hook type, angle, offer,
  creative style, audience, emotions, pain points, benefits, tags.
- **Positioning gaps (home page):** the user pastes their business URL once. The app reads the
  site, collects what buyers say about the problem (Reddit threads and comments, YouTube
  comments, LinkedIn and Threads posts, Exa web pages), builds a persona × pain / desired
  outcome matrix from those comments, then tags every comment and every competitor ad into its
  cells. The heat map shows demand (customers) against coverage (competitor ads). A cell that
  is loud with customers and quiet in the ads is an opening. Click it for the customer quotes,
  the competitor ads in it, and **Write ad concepts** (3 concepts in the customers' own words
  that avoid what competitors already say).
- **No chat in the app.** The user's coding agent queries the database with
  `node cli.mjs sql "<select …>"`. **Ask your agent** in the sidebar copies that prompt with the
  table list.

The app sits behind the Graphed login, so the user's teammates on that account can open it.
Every vendor call is a Graphed Tool or the Graphed OpenRouter proxy, billed to the project's
Graphed credits. There are no vendor keys.

Use this skill's own directory. When the skill loads, that directory is the "Base directory
for this skill". Below, `<skill-dir>` means that path.

```
<skill-dir>/
  app/                         the deployable app (copied into the user's project folder on deploy)
    packages/core              schema, ad library adapters, pull, Gemini analysis, research, gaps, JSON API
    packages/dashboard         Next.js UI at / (React app in components/spy), /api and /m (media) routes
    cli.mjs                    daily job, pull, research, gaps, sql (run with graphed exec)
    smoke.mjs                  read-only smoke test inside the deployed image
    graphed.yaml               service, release migration, daily-pull cron (6am America/Denver)
  scripts/deploy.sh            copy app/ into a folder, install, test, graphed deploy
```

## Before you start

1. If `graphed` is not on PATH, stop and ask the user to install it (`npm i -g @graphed-inc/cli`)
   and run `graphed login`. Node 20+ must be on PATH.
2. Ask which Graphed account to deploy to (`graphed --format json accounts list`). Ask for a
   project slug. The default is `ad-spy`. Check that the slug is free with
   `graphed --format json projects list --account <account_id>`.
3. Read the tool contracts once. Do not swap in other tools.

   ```sh
   graphed tools catalog detail scrapecreators:v1/facebook/adLibrary/search/companies
   graphed tools catalog detail scrapecreators:v1/facebook/adLibrary/company/ads
   graphed tools catalog detail scrapecreators:v1/google/adLibrary/advertisers/search
   graphed tools catalog detail scrapecreators:v1/google/company/ads
   graphed tools catalog detail scrapecreators:v1/google/ad
   graphed tools catalog detail scrapecreators:v1/linkedin/ads/search
   graphed tools catalog detail scrapecreators:v1/reddit/search
   graphed tools catalog detail scrapecreators:v1/reddit/post/comments
   graphed tools catalog detail scrapecreators:v1/youtube/search
   graphed tools catalog detail scrapecreators:v1/youtube/video/comments
   graphed tools catalog detail scrapecreators:v1/linkedin/search/posts
   graphed tools catalog detail scrapecreators:v1/threads/search
   graphed tools catalog detail exa:search
   graphed tools catalog detail serper:scrape
   ```

4. Tell the user what it costs (table below). Deploy only after they say yes.

## 1. Deploy

```sh
bash <skill-dir>/scripts/deploy.sh --account <account_id> [--slug ad-spy] [--name "Ad Spy"] [--dir apps/<slug>]
```

The script copies `app/` into `apps/<slug>/` in the current directory, runs `npm install` and
`npm test`, and deploys. It prints the service URL. A `--dry-run` flag validates the manifest
without deploying. The cloud build runs `npm run db:migrate` before the Next server starts.
The page at `/` is the app. Health is `GET /api/health`.

- Running it again is an update. Code is copied again from `<skill-dir>/app/`. The folder's
  `.graphed.json` and `.git` stay: `graphed deploy` pushes that repo. The cloud Postgres and
  object storage keep every brand, ad, file and market.
- To change the app, edit `<skill-dir>/app/` and deploy again. Edits made only in
  `apps/<slug>/` are overwritten.
- Never add `public.paths` to the manifest. The app has no auth of its own; the Graphed
  gateway is its login.

Prove the deploy before you hand it over:

```sh
graphed exec --project <slug> --account <account_id> -- node smoke.mjs
```

It exits 0 and ends with `SMOKE ALL PASS`. It starts a second copy of the server with the
worker off, calls the read endpoints (state, ads, a stored media file, gaps, agent prompt),
and writes nothing.

## 2. Set it up

Do this from the terminal. The page is how the user looks at the results afterward.

Unless the user already gave them, ask two things: their website, and 2-4 competitors (names
or websites). Then run both steps. `graphed exec` runs inside the deployed app; each stdout
line is prefixed with `[runtime …] `.

```sh
E="graphed exec --project <slug> --account <account_id> --"
```

### Competitors

Look each competitor up in all three ad libraries (3 calls, ≈0.65 credits), pick the right
Meta page, Google domain or advertiser id, and LinkedIn company id from the output, then add
it with a small cap for the first pull:

```sh
$E node cli.mjs find "<name or domain>"
$E node cli.mjs add "<Name>" --fb <page_id> --google <domain> --linkedin <company_id> --max 20
$E node cli.mjs pull <brand id|name>
```

Leave out a platform the brand does not advertise on. `--google-id <AR…>` takes an advertiser
id instead of a domain. `pull` lists the ads, stores the media, and analyzes every new ad
before it returns. The web worker also analyzes anything still queued. Raise the cap
(`max_ads`, per platform per pull; default 150) only after the user agrees.

### Positioning gaps

```sh
$E node cli.mjs research <their website>
$E node cli.mjs gaps
```

`research` runs 5 stages and resumes where it stopped: `site` (read the URL, plan queries,
name 4-8 competitors) → `collect` (≈60 tool calls, ≈3 minutes) → `matrix` (4-6 buyer personas
× 6-9 pains + 5-8 desired outcomes) → `tag_voices` → `tag_ads`. `gaps` prints the top openings:
persona × theme, how many customers say it, how many competitor ads do. The UI can start the
same run: the home page asks for the website when no market exists.

Reply with the app URL, the brands and ad counts, the matrix size, and the top 3 gaps with one
customer quote each.

## 3. Use it

In the app:

- **Positioning gaps** (home): onboarding, research progress, suggested competitors (one-click
  Track), the 6 biggest openings, and the heat map with three views (Gaps, Customer demand,
  Competitor ads) and filters (competitor, platform, active only). Click a cell for quotes,
  competitor ads, and **Write ad concepts**. **Re-run** collects new conversations, rebuilds
  the matrix, re-maps ads, or starts over with a different website.
- **All ads / New this week / a brand page:** Foreplay-style grid with platform, format,
  status, creative style and sort filters, and full-text search over copy, transcripts, hooks
  and tags. A brand page adds active ads, new this week, longest running, the format mix, ads
  launched per week, and creative style and hook type breakdowns. Click an ad for the player
  and the Analysis, Transcript, Copy and Details tabs.
- **Ask your agent** copies the database prompt for Claude Code or Cursor.

From the terminal:

```sh
$E node cli.mjs status                         # brands, ad counts, analysis queue, credits, last pulls
$E node cli.mjs daily                          # what the cron runs: pull all, analyze, map into the matrix
$E node cli.mjs analyze                        # drain the analysis queue
$E node cli.mjs research --from matrix         # rebuild the matrix from the same comments (also collect, tag_ads)
$E node cli.mjs sql "select hook, days_running from ads where is_active order by days_running desc limit 10"
$E node cli.mjs sql "<select …>" --key out/result.json
graphed storage download out/result.json . --project <slug> --account <account_id>
graphed jobs run daily-pull --project <slug> --account <account_id>
```

`sql` runs one read-only transaction and refuses anything but SELECT / WITH. The exec log
stream sometimes drops output: when a command prints nothing, add `--key` and download the
file.

## Cost (1 credit = 1¢)

Measured on a live run, Nov 2026.

| Step | Graphed tool | Credits |
| --- | --- | --- |
| Ad library page (Meta 30 ads, Google 40, LinkedIn 10) | `scrapecreators:v1/{facebook,google,linkedin}/…` | 0.22 / call |
| Google ad detail (copy, YouTube link, impressions), new ads only | `scrapecreators:v1/google/ad` | 0.22 / ad |
| Gemini on an image or text ad | `google/gemini-2.5-flash` (OpenRouter proxy) | 0.15–0.4 / ad |
| Gemini on a video (inline MP4 or YouTube link) | `google/gemini-2.5-flash` | 0.5–1.4 / ad |
| Gaps research (site + ≈60 searches + matrix + tagging) | ScrapeCreators, Exa, Serper, Claude Sonnet, Gemini | ≈40 / run |
| Rebuild the matrix from the same comments | Claude Sonnet + Gemini | ≈8 |
| Map 50 new ads into the matrix | Gemini | ≈1 |
| One set of 3 ad concepts | Claude Sonnet | ≈3 |

A first pull of 20 ads per platform for one brand is about 25 credits. A quiet daily pull is
about 1 credit per brand. Meta is listed in full every day (only ACTIVE ads are listed, so a
missing ad means it stopped); Google and LinkedIn stop at the first page with nothing new.

Models: `VISION_MODEL` (default `google/gemini-2.5-flash`) and `WRITER_MODEL` (default
`anthropic/claude-sonnet-5.5`). To change one, add it under `services.web.env` (and
`jobs.daily-pull.env`) in `<skill-dir>/app/graphed.yaml`, run
`graphed secrets set <NAME> --project <slug> --account <account_id>`, and deploy again.

## How the gap score works

Per persona × theme cell: demand = Σ comment intensity (1-3), coverage = Σ ad strength (1-3),
both scaled 0-1 across the matrix. `gap = demand × (1 − coverage)`. A cell with high coverage
and little demand is marked CROWDED. Openings need at least 2 customer comments. Personas must
be buyers: comments from non-buyers (workers worried about their jobs, vendors, students) are
skipped.

## Tool quirks (handled in the code)

- **Storage presigned URLs** over 1 hour are rejected by the Graphed gateway. The UI uses
  `/m/<key>`, which redirects to a fresh presigned URL each time.
- **Gemini (AI Studio) caps a request at 20 MB.** Videos go inline as base64 (×1.33), so the
  inline limit is 14 MB. A bigger Meta video also stores its SD file for analysis.
- **Google video ads are YouTube links.** Gemini takes them directly. Long or private ones fail
  upstream; the ad is then analyzed from its thumbnail and copy, and `analysis.analysis_note`
  says so.
- **Meta DCO ads** keep their creatives in `snapshot.cards`; `{{product.name}}` placeholders are
  skipped. Meta lists 30 ads per page and ignores smaller page sizes.
- **Some LinkedIn video ads** have no video file in the library, only a cover image.
- **Exa cannot read Reddit.** Reddit goes through ScrapeCreators `reddit/search` and
  `reddit/post/comments`; Exa is used for reviews, forums and blogs with `excludeDomains`.
- **Threads search** often returns nothing for B2B categories. The other sources cover it.

## Done

Reply with the app URL, the smoke test result, each brand with its ad count, and, after
research, the matrix size and the top gaps (persona × theme, customers vs competitor ads, one
quote). If a stage failed, say which one and show its error (`status` for pulls, the market
`error` in `gaps` output or the home page).

## About Graphed

Graphed is a marketing cloud. It includes the infrastructure for an agent to do marketing: a data warehouse, data pipelines, a Postgres database, cron jobs, runtime servers, a tool catalog, custom domains, and internal app tooling.
