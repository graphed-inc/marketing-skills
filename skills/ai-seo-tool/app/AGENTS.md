# AI SEO Tool: reference

An SEO research and tracking app on Graphed Cloud. One Node process serves the page (`public/index.html`), the
JSON API, the MCP server at `/mcp` and the job worker. Postgres holds projects, saved runs, the lookup cache,
rank history and AI answers. Every paid lookup is a Graphed Tool (DataForSEO, Serper) or the Graphed LLM proxy,
billed in Graphed credits (1 credit = 1¢). Search Console and GA4 come from the Graphed warehouse, free.

The app is private behind the Graphed gateway (Graphed login). Only `/mcp` is open at the gateway, and
`lib/mcp.mjs` refuses every request there without a bearer token made on the Agent access page.

## Pages

| Page | What it does | Credits |
|---|---|---|
| Site Explorer | Domain overview, up to 10k organic keywords, top pages by traffic, competitors, backlink summary, technologies | ≈ 21 per 1k keywords |
| Keywords Explorer | Seed → ideas (filtered to the seed's words), suggestions, related, autocomplete; volume, difficulty, CPC, intent, 12-month trend | ≈ 6–16 |
| SERP checker | Top 10–50 from Serper (real URLs) + AI Overview, People Also Ask and features from DataForSEO + **link barrier**: median and weakest referring domains on page 1 | ≈ 4.5 |
| Backlinks | Referring domains, backlinks with anchors, anchors, top linked pages, 24-month history, new / lost per month, profile next to competitors | ≈ 25 |
| AI mentions | Google AI Overview and ChatGPT answers that cite a domain or cover a keyword: questions, answers, cited sites, most cited pages | ≈ 47–70 |
| Keyword lists | Save keywords from any table, refresh their metrics, see who ranks for the list, send them to the rank tracker | ≈ 1.4 per refresh |
| Project: Overview | One-page report, printable | free |
| Project: Keyword gap | You + 1–4 competitors → candidates → brand filter → Haiku fit check → score → link barrier on the top N → top-20 shortlist | ≈ 40 + 4.6 per barrier keyword |
| Project: Link gap | Sites that link to competitors and not to you (one call per competitor + one for all of them) | ≈ 6 per competitor |
| Project: Rank tracker | Daily Serper checks, depth 10–100, competitor positions, 60-day history, import keywords from Search Console | 0.115 per 10 results per keyword per day |
| Project: Search Console + GA4 | Clicks and impressions vs the previous period, almost-there queries (positions 8–20, non-brand), lost clicks, cannibalization, pages joined with GA4 sessions and key events | free |
| Project: Site audit | Own crawler with 36 rules and a diff against the last audit; Lighthouse (DataForSEO) on the top 4 pages. The crawler only calls public addresses (every redirect hop and sitemap URL is checked) | crawl free, Lighthouse 0.575 per page |
| Project: AI visibility | Buyer prompts × ChatGPT, Perplexity, Gemini, Claude (web search, Graphed LLM proxy) × runs + Google AI Overview: mention rate, share of voice, competitor wins, cited sites, trend | ≈ 0.8 per answer |
| Project: Local rank grid | Google Maps rank of one business for one keyword on a 3×3, 5×5 or 7×7 grid (Serper maps, matched by place id), and who ranks around it | 0.345 per grid point |
| Agent access | Make and revoke MCP tokens; the `claude mcp add` line | free |
| Credits | Spend by tool, by day, by run | free |

Every paid lookup is cached in `lookups` with a time to live per tool, so opening a saved run again costs nothing.

## Projects and the warehouse

A project is one domain plus up to 4 competitors, in one market: a location (DataForSEO code, default 2840 United States) and a language (en, es, de, fr, nl, it, pt; default = the location's own language). Every research page has the same two fields. On create, `setupProject` (lib/jobs.mjs):

1. Looks in the warehouse for a Search Console site and a GA4 property that match the domain (`lib/gsc.mjs`
   `sources()` / `detect()`: any schema with `keyword_page_report` is Search Console, any schema with
   `page_engagement_report` + `properties` is GA4). No match = those pages say "not connected".
2. Reads the home page (Serper scrape) and writes a short "about" with Haiku.
3. Suggests competitors: DataForSEO competing domains minus big generic sites, then Haiku keeps real
   business competitors. Only when the user gave none.

To connect Search Console or GA4, the user adds the Google Search Console / Google Analytics 4 source in Graphed
(the data pipeline), waits for the first sync, then opens the project's Settings page and picks the site and
property (or makes the project again).

## Schedules

`graphed.yaml` has two jobs. They only queue work; the web process's worker runs it. The weekly audit and the weekly AI check are **off** for a new project (they cost credits every week); turn them on in Settings, or with `UPDATE projects SET weekly_audit = true`, after the user says yes.

- `ranks` (`node cron.mjs daily`, 6am): rank checks for every tracked keyword.
- `weekly` (`node cron.mjs weekly`, Mondays 7am): site audit and AI visibility for projects that turned them on.

The timezone is set in `graphed.yaml` (`deploy.sh --timezone`).

## MCP

- Endpoint `<app url>/mcp`: streamable HTTP, JSON-RPC (`initialize`, `tools/list`, `tools/call`), no sessions.
- Token: Agent access page (shown one time; only its sha256 is stored in `api_tokens`), or `node cli.mjs token "<name>"`.
- `claude mcp add --transport http ai-seo-tool <app url>/mcp --header "Authorization: Bearer <token>"`
- Tools: `list_projects`, `create_project`, `site_overview`, `keyword_research`, `serp_check`, `keyword_gap`,
  `backlinks`, `link_gap`, `ai_mentions`, `local_rank_grid`, `rank_tracker`, `track_keywords`, `search_console`,
  `site_audit`, `ai_visibility`, `keyword_lists`, `get_job`, `credits`.
- `create_project`, `site_overview`, `keyword_research`, `serp_check` and `ai_mentions` take optional `location` and `language`.
- A tool waits up to 50 s. A longer run returns a `job_id`; call `get_job` until it is done. Results are trimmed;
  `get_job` with `section`, `offset`, `limit` pages through the full tables.

## Terminal

`graphed exec --project <slug> --account <act_…> -- node cli.mjs <command>`

| Command | Does |
|---|---|
| `projects` | List projects |
| `add <domain> ["comp1, comp2"] [location] [language]` | New project (warehouse match, about, competitors) |
| `domain <domain> [limit]` | Site Explorer |
| `keywords <seed> [limit]` | Keywords Explorer |
| `serp "<keyword>" [domain]` | SERP + link barrier |
| `gap <projectId> [perDomain] [barrierTop]` | Keyword gap → top 20 |
| `links <domain> [limit]` | Backlinks |
| `linkgap <projectId>` | Link gap |
| `mentions "<domain or keyword>"` | AI mentions |
| `local "<business + city>" "<keyword>" [size]` | Local rank grid |
| `track <projectId> "<kw>, <kw>"` | Add tracked keywords |
| `ranks <projectId> [check]` | Rank table (`check` runs a check first) |
| `audit <projectId> [maxPages]` | Site audit |
| `ai <projectId> [runs]` | AI visibility run |
| `gsc <projectId> [days]` | Search Console + GA4 summary |
| `token "<name>"` | Make an MCP token (printed one time) |
| `jobs`, `job <id>`, `credits`, `sql "<select>"` | Saved runs, spend, read-only SQL |

Research commands run inline, print JSON and save the run as a job, so it shows in the page too. The job is inserted already running, so the web worker never runs it a second time.

## Data (Postgres)

| Table | Holds |
|---|---|
| `projects` | Domain, competitors, brand terms, warehouse links (`gsc_schema`, `gsc_site`, `ga4_schema`, `ga4_property`), settings |
| `jobs` | Every run: kind, input, status, progress, result JSON, credits |
| `lookups` | Cached tool results (tool id + input hash, expiry). Two callers in one process that ask for the same uncached lookup share one paid call |
| `credit_log` | One row per paid call: tool, credits, job. Serper is logged per vendor credit (a Maps search is 3) |
| `tracked`, `ranks` | Tracked keywords and their daily positions (with competitors) |
| `prompts`, `ai_runs` | AI visibility prompts and every engine answer with its analysis |
| `lists`, `list_keywords` | Keyword lists |
| `api_tokens` | MCP tokens (sha256 only) |

## Code

- `server.mjs`: HTTP API, the page, `/mcp`, the worker (3 slots; `NO_WORKER=1` turns it off).
- `lib/seo.mjs` research, `lib/links.mjs` backlinks + link gap, `lib/mentions.mjs` AI mentions, `lib/local.mjs`
  rank grid, `lib/lists.mjs`, `lib/mcp.mjs`, `lib/gsc.mjs` warehouse, `lib/rank.mjs`, `lib/audit.mjs`,
  `lib/ai.mjs`, `lib/jobs.mjs` (queue, project setup, schedules), `lib/tools.mjs` (Graphed SDK, cache, credits,
  retries), `lib/db.mjs` (schema; PGlite when there is no `DATABASE_URL`).
- UI source in `ui/` (clay-tables look). **Run `node build-ui.mjs` after you change `ui/`**; it writes `public/index.html`.
- `test.mjs`: offline (fixtures in `fixtures/` stand in for every tool, in-memory Postgres). `smoke.mjs`: read-only
  check inside the deployed image.

## Limits and gotchas

- DataForSEO SERP organic URLs come back as `google.com/goto?...` links, so positions come from Serper. DataForSEO
  SERP is used only for AI Overview, People Also Ask and feature types.
- Serper returns at most 10 results per call; deeper checks page through.
- `backlinks.domain_intersection` returns only sites that link to 2+ of the targets; the link gap makes one call
  per competitor and merges them.
- `backlinks.timeseries_new_lost_summary` needs both `date_from` and `date_to`.
- `business_data.google.my_business_info` returns 400 for every input, so there is no Google Business Profile data.
- Lighthouse takes about 80 s per URL.
- Warehouse query parameters arrive as quoted strings; day counts are validated integers written into the SQL.
  ClickHouse resolves output aliases inside aggregates, so never alias `sum(impressions) AS impressions`.
- Tool calls retry transient errors (429, 5xx, timeouts) step by step: a failed wait or download keeps the run id and never starts (and pays for) the lookup again. A 400 is not retried.
- An AI visibility run where every request fails ends as an error; a run with some failures shows how many failed and counts only the answers that came back.
- The crawler's address check runs before each request; it does not pin the connection to the checked address, so a host that changes its DNS answer between the check and the request is not covered.
- Local grid matches the business by `cid` / `placeId`; a title match would count every branch of a chain.
- No WebSockets at the gateway; the page polls jobs.
