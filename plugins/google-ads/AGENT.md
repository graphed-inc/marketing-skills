# Integrate: google-ads

You are the **implementing coding agent**. This file is your playbook.
Work the steps in order. The `files/` directory beside this runbook is
reference source — adapt it into the project, don't rewrite it.

What gets built: a Mastra agent that **manages** an already-set-up Google
Ads account (daily Testing → Winners loop, locked tool belt) plus a
dashboard at `/google-ads`. Default config has `writes.enabled: false`,
so Ads mutates are `validateOnly` until a human turns writes on.

The Mastra job does **not** research keywords or invent a first seed
list. You and the user do that during setup (existing account keywords
or DataForSEO). After Testing has positives, the daily agent only
harvests search terms, negatives, promotions, and budgets.

## Decide with the user first

Collect (or leave as placeholders and come back):

1. **Google Ads customer id** and MCC / login customer id.
2. **Campaign IDs** for Testing, Winners, and Brand (Brand is read-only).
   Empty IDs are allowed — the agent reports and refuses writes. A human
   still has to create those three campaigns in the Ads UI; you cannot.
3. **Warehouse schema** for the account's Google Ads source
   (`google_ads_*` from `graphed warehouse query -- "SHOW DATABASES"`).
4. Whether they have a **service-account JSON** now, or later. Without it
   the daily job still runs warehouse tools and reports.
5. **Where first Testing keywords come from** — already in the Ads
   account, or researched with DataForSEO. Work that in
   [Find Testing keywords with the user](#find-testing-keywords-with-the-user).
   Do not leave this to the Mastra agent.

Default `writes.enabled` stays `false`. Do not flip it on unless the user
explicitly wants live Ads mutations.

## Find Testing keywords with the user

This is setup work. Do it with the user. Do not add `research_keywords`
or `seed_testing_keywords` to the Mastra tool belt.

Someone new to Ads still needs Testing / Winners / Brand created in the
Ads UI, with IDs in `client.config.json`. You are finding what Testing
should bid on.

### 1. Look at the account first

Ask: do they already buy search keywords?

If the warehouse schema is set, list what is already live. Prefer the
`npx tsx` form so flags are not swallowed by npm:

```bash
graphed dev run -- npx tsx packages/jobs/src/google-ads-seed.ts --from-account
```

A bare run (no `--target` / `--from-json`) does the same thing and does
**not** call DataForSEO. That prints Testing and Winners
positives/negatives from Fivetran history
(`ad_group_criterion_history`, plus `campaign_criterion_history` when
the source syncs it). Show the user the list.

- **Testing already has positives** → you are done unless they want
  more. Tell them the daily agent will manage those terms.
- **Keywords live on Winners / other campaigns, Testing is empty** →
  pick a short PHRASE list with the user (on-intent, 2+ tokens) and
  seed only those onto Testing (step 3). Do not copy the whole account.
- **Account is empty / no Ads source yet** → go to DataForSEO.

If they paste keywords themselves, seed that list with `--terms` and skip
the catalog call.

### 2. Research with DataForSEO when the account cannot supply seeds

Confirm the product host (`seed.target`, or the hostname of
`promotion.landing_page_url`). Example: `graphed.com`.

Live catalog pull (`GRAPHED_TOKEN` via `graphed dev run`). Do **not**
call DataForSEO unless the user asked and you pass `--target` or
`--from-json`:

```bash
graphed dev run -- npx tsx packages/jobs/src/google-ads-seed.ts --target graphed.com
```

Or call the catalog yourself from the project directory:

```bash
graphed tools run dataforseo:google_ads.keywords_for_site.live --wait \
  --body '{"target":"graphed.com","locationCode":2840,"languageCode":"en"}'
```

That tool is **10.35 credits per domain**. Prefer it over
`dataforseo:labs.keyword_ideas.live`. Ideas seeded with a brand token
(`graphed`) return off-intent giants like "desmos graphing".

The seed job applies mechanical filters: 2+ tokens, not brand-only,
search volume ≥ `seed.min_search_volume` (10), cap `seed.max_keywords`
(25). It also runs the intent classifier when Graphed is configured.

Offline, no catalog spend — saved envelope or the shipped example:

```bash
graphed dev run -- npx tsx packages/jobs/src/google-ads-seed.ts --from-json clients/google-ads/seed.example.json
```

`clients/google-ads/seed.example.json` is a live `keywords_for_site`
pull for **graphed.com** (US/en, 2026-09-17): 225 rows → 25 keepers.
`--from-json` keeps rows with no search volume so a hand-written list
works; `--target` drops those rows. Use `--terms` for a reviewed list.
Top terms were `ad agent`, `ai advertising`, `ai marketing tools`,
`marketing analytics`. Some rows are still loose (`salesforce and ai`,
`google agent`) — drop those with the user. Do **not** `--apply` this
example against Graphed's production Ads account.

### 3. Review together, then seed Testing

Walk the keeper list with the user. Drop anything they would not want
to pay for. Only then:

```bash
graphed dev run -- npx tsx packages/jobs/src/google-ads-seed.ts --terms "ai ads agent,warehouse analytics" --apply
graphed dev run -- npx tsx packages/jobs/src/google-ads-seed.ts --target graphed.com --apply
```

`--apply` needs `--terms`, `--target`, or `--from-json`. A hand-picked
list uses `--terms` (comma-separated) — no catalog call and no volume
floor. `--from-json` rows with no search volume also skip the volume
floor. `--apply` is still
`validateOnly` until `writes.enabled` is true. The
job attaches PHRASE (or `seed.match_type`) positives to
`seed.testing_ad_group_id` or the first enabled Testing ad group. If
Testing has no ad group, it creates **Discovery** + an RSA from
`promotion.*`.

Do not apply against a live Ads account just to try the kit.

### Config knobs (`seed` in `client.config.json`)

| Field | Default | Role |
| --- | --- | --- |
| `max_keywords` | 25 | Cap on new Testing positives per seed |
| `min_search_volume` | 10 | Drop long-tail catalog noise |
| `match_type` | `PHRASE` | `PHRASE` or `BROAD` |
| `location_code` | 2840 | DataForSEO location (US) |
| `language_code` | `en` | DataForSEO language |
| `testing_ad_group_id` | `""` | Pin the ad group; otherwise first enabled or create Discovery |
| `target` | `""` | Catalog host; empty → landing-page hostname |

## Scaffold 0.1.0

This kit needs scaffold `>=0.2.0`. `graphed plugins add` stops on a `0.1.0`
stamp. `--force` only stages this kit. Upgrade the project first, then set
`scaffold.version` in `graphed.yaml` to `0.2.0`.

- `packages/core`: `kysely` `^0.29.9`, `zod` `^4.6.7`.
- `packages/dashboard`: `next` `^16.4.6`. If `postcss` is a direct
  dependency, `^8.5.23`.
- In `packages/core/src/config.ts`, import `ZodType` instead of
  `ZodTypeAny`. Add this and use it anywhere a schema used `required_error`:

  ```ts
  export function requiredString(message: string) {
    return z.string({
      error: (issue) => (issue.input === undefined ? message : undefined),
    });
  }
  ```

- Import `Migrator` and `FileMigrationProvider` from `kysely/migration`.
- Next 16: `await cookies()`, and await `params` and `searchParams`. In
  `next.config.mjs`, move `outputFileTracingRoot` to the top level, rename
  `experimental.serverComponentsExternalPackages` to `serverExternalPackages`,
  and drop `experimental.instrumentationHook`.
- `npm install`, then `npm audit` should be clean.

## Steps

1. **Add npm dependencies and nested exports** in
   `packages/core/package.json`. Dependencies:

   ```json
   "@ai-sdk/openai": "^3.0.97",
   "@graphed-inc/sdk": "^0.0.4",
   "@mastra/core": "^1.67.0",
   "google-auth-library": "^10.0.0"
   ```

   Jobs and the dashboard import `@app/core/google-ads/run` (and friends).
   Add this export if those imports fail to resolve:

   ```json
   "./google-ads/*": "./src/google-ads/*.ts"
   ```

   Then `npm install` from the project root.

2. **Copy the pipeline source.**
   - `files/packages/core/src/google-ads/` → `packages/core/src/google-ads/`
   - `files/packages/jobs/src/google-ads-daily.ts` → `packages/jobs/src/google-ads-daily.ts`
   - `files/packages/jobs/src/google-ads-seed.ts` → `packages/jobs/src/google-ads-seed.ts`
   - `files/clients/google-ads/client.config.json` → `clients/google-ads/client.config.json`
   - `files/clients/google-ads/seed.example.json` → `clients/google-ads/seed.example.json`

   If `packages/core/src/warehouse.ts` or `packages/core/src/seo/warehouse.ts`
   already exists, keep one copy and point `google-ads/warehouse.ts` imports
   at it (or delete the ads copy).

3. **Add the migration.** Copy
   `files/packages/core/src/migrations/0000_google_ads.ts` into
   `packages/core/src/migrations/`. The kit ships the whole plugin schema in
   this one file; `0000` is a placeholder — **rename it to the project's next
   free migration number** (e.g. `0002_google_ads.ts` in a fresh scaffold).

4. **Register table types — one place only.** In
   `packages/core/src/db/types.ts`:

   ```ts
   import type {
     GoogleAdsActionsTable,
     GoogleAdsMemoryTable,
     GoogleAdsRunsTable,
   } from "../google-ads/tables";

   export interface Database {
     // ... existing tables ...
     google_ads_memory: GoogleAdsMemoryTable;
     google_ads_runs: GoogleAdsRunsTable;
     google_ads_actions: GoogleAdsActionsTable;
   }
   ```

5. **Add the npm scripts.** In `packages/jobs/package.json`:

   ```json
   "job:google-ads-daily": "tsx src/google-ads-daily.ts",
   "job:google-ads-seed": "tsx src/google-ads-seed.ts"
   ```

   and root `package.json` proxies. The trailing `--` on the seed script
   forwards flags such as `--from-account`; without it npm treats them
   as npm config. Prefer the `npx tsx …/google-ads-seed.ts` form in
   [Find Testing keywords with the user](#find-testing-keywords-with-the-user)
   anyway:

   ```json
   "job:google-ads-daily": "npm run -w @app/jobs job:google-ads-daily",
   "job:google-ads-seed": "npm run -w @app/jobs job:google-ads-seed --"
   ```

6. **Fill in the client config.** Edit
   `clients/google-ads/client.config.json`:
   - `display_name`, `product_one_liner`, `relevance.product_context`
   - `google_ads.customer_id` / `login_customer_id`
   - campaign IDs and names (empty string if unknown)
   - thresholds, budget cap, promotion RSA copy
   - `metrics.googleAdsSchema` (step 7)
   - `seed.target` if the product host is not the landing-page hostname
   - leave `writes.enabled: false` until the user asks for live writes

7. **Wire warehouse KPIs.** Find the Ads schema:

   ```bash
   graphed warehouse query -- "SHOW DATABASES"
   ```

   Use the `google_ads_*` entry (e.g. `google_ads_gfeuj3`) as
   `metrics.googleAdsSchema`. If the account has no Ads source yet, tell the
   user to connect one in Graphed settings and skip — Overview shows a
   setup hint. Warehouse credentials come from the runtime (cloud, or
   locally via `graphed dev run -- npm run dev`).

8. **Find and seed Testing keywords with the user.** Follow
   [Find Testing keywords with the user](#find-testing-keywords-with-the-user)
   now that config + schema exist. Do this before calling the setup done.

9. **Add the dashboard page.** Copy
   `files/packages/dashboard/app/google-ads/` →
   `packages/dashboard/app/google-ads/`, then append to `pluginNavEntries`
   in `packages/dashboard/lib/plugins.ts`:

   ```ts
   { key: "google-ads", label: "Google Ads", href: "/google-ads", group: "Channels", enabled: true },
   ```

10. **Wire the manifest.** If `graphed plugins add google-ads --apply-manifest`
    was used, the `google-ads-daily` job is already in `graphed.yaml` —
    verify it. Otherwise merge the kit's `manifest.yaml` by hand. Keep
    `retries: 0`. When the service-account JSON is available, add
    `GOOGLE_ADS_SA_KEY_JSON` to the **job** `env` list. Secrets are
    injected only for names in that list. Do not add the key to the
    dashboard service — the dashboard does not call the Ads API. The LLM
    uses Graphed Tools OpenRouter (`GRAPHED_TOKEN`, injected — do not
    declare it).

    Do **not** add `google-ads-seed` as a cron job. It is a hand-run
    setup script.

11. **Set secrets** (skip until the JSON is ready):

    ```bash
    # when the user has the service-account key:
    graphed secrets set GOOGLE_ADS_SA_KEY_JSON
    ```

    `secrets set` takes ONE secret per invocation. For local Ads JSON, put
    the full key file in `.env` as `GOOGLE_ADS_SA_KEY_JSON` (never commit
    it). Cloud and `graphed dev run` inject `GRAPHED_TOKEN` for warehouse
    + OpenRouter + DataForSEO; do not declare it on the job.

12. **Leave a pointer in the project's `AGENTS.md`.** That file is the
    entry point for later coding agents. Append:

    ```md
    ## Google Ads keywords (setup, not the daily job)

    The Mastra `google-ads-daily` job only manages an already-seeded
    account. Keyword research and Testing seeds are setup work — do them
    with the user, do not add catalog tools to the Mastra agent.

    - Existing account: `graphed dev run -- npx tsx packages/jobs/src/google-ads-seed.ts --from-account`
    - Hand-picked list: `… --terms "phrase one,phrase two" --apply`
    - DataForSEO: `graphed dev run -- npx tsx packages/jobs/src/google-ads-seed.ts --target <host>`
    - Bare seed (no `--target` / `--from-json` / `--terms`) only lists warehouse keywords
    - Review the list with the user, then `--apply` only if they confirm
      (`writes.enabled: false` is validateOnly)

    Full playbook: `.graphed/plugins/google-ads/AGENT.md` (or the kit
    `AGENT.md` if you still have it).
    ```

## Verify (do all of this, locally, before deploying)

```bash
docker compose up -d
npm run db:migrate
npm run typecheck
npm run build
```

1. `npm run typecheck` and `npm run build` must succeed. Optional:
   `npx tsx --test packages/core/src/google-ads/**/*.test.ts` for the
   small lag / search-term / fallback suite.
2. `graphed dev run -- npm run dev` → open `/google-ads`:
   - Sidebar has **Google Ads** under Channels.
   - Overview shows the segmented control, Writes-off badge, and either
     KPIs or the schema/warehouse setup hint.
   - Sessions is empty until a run exists.
3. You completed [Find Testing keywords with the user](#find-testing-keywords-with-the-user)
   (account list and/or DataForSEO preview). The user saw the keeper
   list. Testing is not going live empty unless they chose that.
4. `graphed dev run -- npm run job:google-ads-daily` → expect a report
   (URGENT if warehouse is stale or campaigns are unconfigured). Reload
   Sessions and confirm the Mastra trace (`memory_get`, `get_scoreboard`,
   …). There should be **no** `research_keywords` / `seed_testing_keywords`
   calls. With `writes.enabled: false`, no live Ads mutate should apply.
5. Deploy: `graphed deploy`. The expected first-deploy loop:
   - If you listed Ads secrets on the job before setting them, deploy
     reports `waiting_for_secrets` — set them, then `graphed deploy` again.
   - If the re-deploy fails with `API error (409)`, the first build is
     still running. Wait and re-run.
   - Once `ready`: `graphed jobs run google-ads-daily`, then
     `graphed logs --job google-ads-daily --tail 50`.

## Notes

- Safety is the default config (`writes.enabled: false`), not a DRY_RUN
  env flag. Flip that boolean only when the user asks for live writes,
  campaign IDs are set, and the warehouse lag is under 12 hours.
- Brand is always read-only. Combined daily budget cannot be raised.
- `promote_search_term` runs a brand-impersonation guard before the Ads
  mutate: own-brand tokens (`display_name` + `promotion.brand_terms` —
  not `brand_headline`, which is RSA copy), `promotion.competitor_names`,
  memory key `blocked_terms`, then an LLM judge. Default policy is
  `refuse` (do not bid). `safe_copy` still creates the Winners EXACT
  keyword but never puts the term in RSA headlines. A down judge refuses
  (`classifier_unavailable`). A below-threshold competitor/own-brand
  verdict refuses (`low_confidence`). An unreadable `blocked_terms` note
  refuses (`blocked_terms_unreadable`). A structurally invalid note
  refuses (`blocked_terms_invalid`) until a human fixes the key — the
  note must be a JSON string array (`["runway","kling ai"]`) or
  `{ "terms": [...] }`, each entry a name of at most 4 words.
  Config `promotion.competitor_names` / `brand_terms` use the same
  name heuristic but drop a bad entry instead of failing config load
  (`loadClientConfig` backs the dashboard and the daily job). The
  Overview badge and the run report name what was dropped.
  Low-confidence generic still bids but omits the term from headlines.
  Do not add a `force` override.
- The Mastra agent has no shell, git, raw SQL, or DataForSEO. Tools:
  `memory_get`, `memory_set`, `get_scoreboard`, `list_search_terms`,
  `list_keywords`, `get_serving_health`, `add_negative`,
  `remove_negative`, `promote_search_term`, `pause_ad_group`,
  `rebalance_budgets`, `classify_terms`.
- Reads hit the warehouse first (`ad_group_criterion_history`,
  `ad_group_history`, `*_stats`). Missing Fivetran tables must not
  throw — those queries return empty rows. Campaign negatives fall
  back to Ads `googleAds:search` only when `campaign_criterion_history`
  is missing (a synced empty table is trusted). Daily budgets fill any
  campaign id the warehouse omitted from Ads (REST v25, service-account
  only). Mutates use the same client (`validateOnly`
  until `writes.enabled`). Write tools also refuse when warehouse lag
  is over 12 hours (same bar as the Overview banner).
- Mastra + `@ai-sdk/openai` must use `.chat(model)` against Graphed Tools
  OpenRouter (`new Graphed().openRouter.baseUrl()`). Graphed authenticates
  with `GRAPHED_TOKEN` — no OpenRouter API key. The default Responses API
  401s.
- A second Ads account is another `clients/google-ads/` config (or a
  second project), not a fork of the agent.
