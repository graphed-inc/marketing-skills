---
name: ai-seo-tool
description: "Deploy AI SEO Tool, a hosted Ahrefs / Semrush-style SEO app on Graphed that a coding agent can also drive over MCP. Research any site or keyword: Site Explorer (organic keywords, top pages, competitors), Keywords Explorer (volume, difficulty, CPC, intent, trend), SERP checker with the referring domains it takes to reach page 1, backlinks (referring domains, anchors, top linked pages, new and lost links), AI mentions (Google AI Overview and ChatGPT answers that cite a domain), and keyword lists. Per project: keyword gap with a top-20 shortlist, link gap, a daily rank tracker, Search Console + GA4 from the Graphed warehouse, a weekly site audit with Lighthouse, AI visibility across ChatGPT, Perplexity, Gemini, Claude and AI Overviews, and a Google Maps local rank grid. DataForSEO and Serper run through Graphed Tools and every lookup is cached, billed in Graphed credits. By default ask for the user's domain and 2-4 competitors, deploy, make the project, run a site overview and the keyword gap, and give the shortlist. Say the cost before any run over 10 credits. Use when the user wants an Ahrefs or Semrush alternative, keyword research, a keyword or backlink gap, rank tracking, an SEO audit, AI search visibility, local SEO rankings, an SEO MCP server for their agent, or invokes /graphed:ai-seo-tool."
argument-hint: "[your domain and competitors, e.g. \"acme.com vs rival.com, other.com\" | a keyword to research]"
---

# AI SEO Tool

An SEO app the agent deploys into the user's own Graphed project. One Node process serves the page, the JSON
API, an MCP server and the job worker. Postgres holds projects, every saved run, a cache of every paid lookup,
rank history and AI answers. The app is private behind the Graphed gateway (Graphed login), except `/mcp`,
which refuses every request without a bearer token.

The deeper reference (every page, MCP tool, CLI command, table and limit) is `app/AGENTS.md`.

```bash
<skill-dir>/scripts/deploy.sh --account <act_…> --timezone <IANA zone>   # deploy or update (apps/ai-seo-tool in the cwd)
graphed exec --project ai-seo-tool --account <act_…> -- node cli.mjs projects
graphed exec --project ai-seo-tool --account <act_…> -- node smoke.mjs   # cloud check, read-only, free
```

Find the account id with `graphed --format json accounts list`. `deploy.sh` copies `<skill-dir>/app/` to
`apps/<slug>/`, builds the page, runs the offline tests, and deploys. Re-running it updates the same project; the
data stays. Flags: `--slug`, `--name`, `--dir`, `--timezone` (for the daily and weekly jobs; default
America/New_York, kept on later deploys), `--dry-run`.

## Where the data comes from

| Data | Source | Cost |
|---|---|---|
| Keywords, rankings, competitors, difficulty, top pages | DataForSEO Labs (Graphed Tools) | credits |
| Backlinks, referring domains, anchors, link gap, history | DataForSEO Backlinks (Graphed Tools) | credits |
| AI mentions | DataForSEO AI Optimization `llm_mentions` (Graphed Tools) | credits |
| Live Google results and positions, Maps rankings | Serper (Graphed Tools) | credits |
| AI Overview, People Also Ask, Lighthouse | DataForSEO SERP and On-Page (Graphed Tools) | credits |
| AI visibility answers, fit checks, summaries | Graphed LLM proxy (OpenRouter) | credits |
| Clicks, impressions, queries, sessions, key events | Search Console + GA4 in the Graphed warehouse | free |

Search Console and GA4 need the user's Google Search Console and Google Analytics 4 sources connected in Graphed
and synced once. Without them every other page works and those pages say "not connected".

## Default run

1. **Ask first.**
   - Their domain, and 2–4 real business competitors (not big generic sites). If they have none, the app suggests
     some; check the suggestions with the user.
   - The country and language they sell in (default United States, English).
   - Their timezone, for the daily rank check.
   - Is Search Console / GA4 connected in Graphed? If not, tell them it is free data they should add.
2. **Deploy** (once per account) with `--timezone`. Give the user the URL.
3. **Make the project:** `node cli.mjs add <domain> "<comp1>, <comp2>" [location code] [language]` (about 3 credits; location default 2840 United States, language default = the location's language). It finds their Search
   Console site and GA4 property in the warehouse and writes a short "about". Say what it found.
4. **Run the first research** (say the cost first; about 60–120 credits in all):
   - `node cli.mjs domain <domain>`: where they stand now.
   - `node cli.mjs gap <projectId>`: the keyword gap and the top-20 shortlist.
   - `node cli.mjs gsc <projectId>` when Search Console is connected (free): almost-there queries, lost clicks.
5. **Report.** The app URL, the 5 keywords to go after first and why (volume, difficulty, fit, the referring
   domains page 1 needs), the almost-there queries, and what each page of the app is for.
6. **Offer, do not start:** the weekly site audit and weekly AI check are off for a new project; turn one on in Settings only after the user says yes to the weekly cost. Also offer tracking the shortlist in the rank tracker (≈ 0.115 credits per keyword per day at
   top 10), a site audit, AI visibility prompts, a link gap, the local grid for a business with a Maps listing,
   and an MCP token so their coding agent can use the app.

## What the user sees

- **Research** (sidebar): Site Explorer, Keywords Explorer, SERP checker, Backlinks, AI mentions, Keyword lists.
  Every keyword table can save rows to a list or send them to the rank tracker.
- **Projects**: Overview (printable report), Keyword gap, Link gap, Backlinks, Rank tracker, Search Console,
  Site audit, AI visibility, Local grid, Settings (competitors, brand terms, location and language, warehouse site and
  property, rank depth, weekly audit and AI check on / off).
- **History** on every research page: past runs open again for free.
- **Agent access**: make or revoke MCP tokens, with the `claude mcp add` line. **Credits**: spend by tool and day.

## MCP

`claude mcp add --transport http ai-seo-tool <app url>/mcp --header "Authorization: Bearer <seo_…>"`

Make the token on the Agent access page, or `node cli.mjs token "<name>"` (printed one time). 18 tools: projects,
site overview, keyword research, SERP check, keyword gap, backlinks, link gap, AI mentions, local rank grid, rank
tracker, track keywords, Search Console, site audit, AI visibility, keyword lists, get job, credits. A long run
returns a `job_id`; call `get_job` until it is done.

## Costs

| Run | Credits (1 credit = 1¢) |
|---|---|
| New project | ≈ 3 |
| Site Explorer | ≈ 21 per 1,000 keywords |
| Keywords Explorer | ≈ 6–16 |
| SERP check with link barrier | ≈ 4.5 |
| Keyword gap | ≈ 40 + 4.6 per keyword checked for the link barrier (top 10 from the terminal, top 20 in the page) |
| Backlinks | ≈ 25 |
| Link gap | ≈ 6 per competitor |
| AI mentions | ≈ 47–70 |
| Rank tracker | 0.115 per keyword per day per 10 results of depth |
| Site audit | crawl free, Lighthouse 0.575 per page (top 4 pages) |
| AI visibility | ≈ 0.8 per answer (prompts × engines × runs) |
| Local rank grid | 0.345 per grid point (5×5 = 8.6) |
| Search Console + GA4, opening saved runs | free |

## Rules

- **Money first.** Say the cost before a run over 10 credits, and before anything that repeats (tracking, weekly
  AI checks). Get a yes. A saved run opens for free; do not run it again.
- **Recurring costs are opt-in.** New projects have the weekly audit and weekly AI check off. Rank tracking starts only for keywords someone adds.
- **Small first.** Track 10–20 keywords, not hundreds. Run AI visibility with a few prompts and 1 run before 3.
- **Competitors are businesses.** Drop generic sites (Wikipedia, Reddit, YouTube, Stack Overflow, big news) from
  a competitor list; they make the gap noise.
- **Tokens are secrets.** Keep MCP tokens out of commits, logs and chat. Revoke one the user no longer needs.
- **Use the warehouse for their own site.** Search Console is real data; DataForSEO traffic numbers are estimates.
  Say which one a number comes from.

## Limits

- DataForSEO SERP result URLs come back as Google redirect links, so positions come from Serper.
- No Google Business Profile data (the DataForSEO endpoint returns 400). The local grid uses Maps results.
- Lighthouse takes about 80 s per page. A long run returns a job id; poll it.
- No WebSockets at the gateway, and a response is cut at about 110 s: the page and the MCP tools poll jobs.
- `graphed exec` can drop the output of a short command. Read `graphed logs --project <slug> --since 3m`, or open
  the run in the page (every CLI run is saved).

## Files

```
app/server.mjs        page, JSON API, /mcp, job worker
app/lib/seo.mjs       Site Explorer, Keywords Explorer, SERP + link barrier, keyword gap
app/lib/links.mjs     backlinks explorer, link gap
app/lib/mentions.mjs  AI mentions
app/lib/local.mjs     local rank grid
app/lib/lists.mjs     keyword lists
app/lib/rank.mjs      rank tracker
app/lib/gsc.mjs       Search Console + GA4 from the warehouse
app/lib/audit.mjs     crawler, 36 rules, Lighthouse
app/lib/ai.mjs        AI visibility engines and analysis
app/lib/mcp.mjs       MCP server and tokens
app/lib/jobs.mjs      job queue, project setup, schedules
app/lib/tools.mjs     Graphed Tools, cache, credit log, retries
app/lib/db.mjs        Postgres schema
app/ui/               page source (run node build-ui.mjs after a change)
app/cli.mjs           terminal access
app/cron.mjs          daily + weekly jobs (queue work for the worker)
app/test.mjs          offline tests with fixtures (npm test)
app/smoke.mjs         cloud check
app/AGENTS.md         the full reference
```

## Done

Reply with the app URL, the project id, what was found in the warehouse, the top 5 keywords with their numbers,
the credits spent, and what you offered to set up next.

## About Graphed

Graphed is a marketing cloud. It includes the infrastructure for an agent to do marketing: a data warehouse, data pipelines, a Postgres database, cron jobs, runtime servers, a tool catalog, custom domains, and internal app tooling.
