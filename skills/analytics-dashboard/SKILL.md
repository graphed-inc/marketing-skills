---
name: analytics-dashboard
description: "Build an analytics dashboard from the data in your warehouse. Use when the user wants analytics, KPIs, or charts: copy the chart templates, add a date range the user can change, and query with @graphed-inc/sdk."
---

# Analytics Dashboard

Add a read-only analytics page to a Graphed cloud project. Discover the
warehouse, ask which source and metric to show when you do not already know,
query with `@graphed-inc/sdk`, and copy the chart templates in this skill.

Do not ship the usual page: two scorecards, one area chart, and horizontal
bars. That layout is not this skill. A page uses at least three chart types
from `templates/charts.tsx` (line, area, columns, horizontal bars, donut,
sparkline, calendar heatmap, histogram, matrix heatmap), plus the shadcn
date picker when a date column exists.

Do not invent schemas, tables, columns, endpoints, or parameter syntax. Do
not edit the dashboard theme (`app/globals.css`, `tailwind.config.ts`, or
`app/layout.tsx`). Writing SQL from the patterns in this skill is required.

## 1. Discover the warehouse

When `graphed` is on PATH, read the packaged docs once before writing SQL.
They match the installed CLI:

```sh
graphed docs warehouse
graphed docs sdk
```

If `graphed` is not on PATH, write the page from this skill and tell the
user to install it (`npm i -g @graphed-inc/cli`). Do not block the page on
that install.

Use schema JSON the user already pasted. Do not ask them to re-run
discovery. Otherwise list sources, then one schema. Pass `--account` when
the shell is not already in a project that resolves one.

```sh
graphed sources list --account <account_id>
graphed --format json sources list --account <account_id>
graphed warehouse schema <schema_name> --account <account_id>
graphed --format json warehouse schema <schema_name> --account <account_id>
```

Sources JSON:

```json
{ "sources": [{ "schema_name": "ga4_xxxx", "name": "GA4", "status": "ready" }] }
```

`schema_name` may be null. Table columns are `SCHEMA_NAME`, `NAME`, `STATUS`.

Schema JSON:

```json
{
  "schema_name": "ga4_xxxx",
  "tables": [{ "name": "events", "columns": [{ "name": "date", "type": "Date" }] }]
}
```

Stop and do not write SQL when you still have no schema JSON:

- No token or account. Ask for `graphed login`, then `graphed sources list`.
- `sources` is empty, or the source they want is not connected. Send them to
  create it. See "Connect a source" below.
- `schema_name` is null, or `warehouse schema` returns no tables. The sync
  may still be running. If they need a different connector, send them to
  create it.

A pasted `schema_name` is enough. It does not also have to appear in a
sources listing.

A one-off probe sends an empty parameters object. Use the SDK when the
query needs parameters.

```sh
graphed warehouse query --account <account_id> -- 'SELECT 1'
```

A missing runtime token does not stop you from writing the page. The page
shows the token card at runtime.

## Connect a source

The create flow is `/warehouse/create/<handle>`. `<handle>` is the connector
slug from the catalog (`shopify`, `google-analytics`), not an account id
and not a warehouse schema name. `/warehouse/<handle>/create` is not a page.

Look up the link. Do not guess the slug:

```sh
graphed sources catalog --query <keyword>
graphed --format json sources catalog --query <keyword>
```

Each row is `name`, `slug`, `create_url`. Send the user that `create_url`.
It is `{app}/warehouse/create/{slug}`.

When they have not named a connector, send them to `/warehouse/create` (the
picker titled "Add source"). They need to be signed in to Graphed.

After they connect it, run `graphed sources list` again. Wait until the row
has a `schema_name` before writing SQL.

## 2. Ask, then choose what to show

If you do not already know both answers, ask before you pick a source or a
metric. One message, then wait:

1. Which connected source should this board use? List the ready rows from
   `graphed sources list` by `name` and `schema_name`. Do not offer a source
   that is not in that list.
2. Which metric do they care about? Ask for the business number (sessions,
   spend, revenue), not a SQL expression.

Skip the questions when the user already named the source and the metric,
or told you to choose. "You pick" means: one ready source, or the only
source they named, and the measure rules below.

If they name a source that is not connected, send the create link and stop.
Do not build a board for a schema you have not listed.

Classify columns on the source they chose, then build the board. After they
have answered, do not ask again when these rules pick a single measure.

- A date column's type contains `Date` or `DateTime`.
- An identifier's name is `id` or ends with `_id`.
- A measure is not an identifier, and its type contains `Int`, `UInt`,
  `Float`, or `Decimal`.

Measure:

- The user named a column. `sum` that column. If they asked for a count,
  how many, or volume, use `count()` instead.
- Otherwise exactly one measure: `sum` it.
- Otherwise no measure and a date column: `count()` per day.
- Otherwise two or more measures and the user named none: ask which column.
  Do not write the page yet.

Pick one board. Do not mix in the old two-scorecard area page.

- **Board A** — a date column, one measure, and a string column (or the user
  named a group-by). This is the usual warehouse table. Copy
  `templates/page.tsx` and keep every chart on it: line, calendar heatmap,
  weekday columns, histogram, matrix heatmap, donut, horizontal bars, and
  the sparkline on the window scorecard.
- **Board B** — a date column and one measure, and no string column the user
  asked to group by. Copy the page, delete the donut card, the horizontal
  bar card, and the matrix heatmap card. Do not call `loadMatrix`. Render
  `AreaChart` instead of `LineChart`. Still keep the weekday columns, the
  calendar heatmap, the histogram, the three scorecards, and the date picker.
- **Board C** — no date column. Do not call `loadDaily`, `loadBreakdown`,
  or `loadMatrix`. Those three queries filter on a date column. Call
  `loadTotal()` for the scorecard and `loadGroups()` for the donut and the
  horizontal bars. `loadTotal` and `loadGroups` have no date filter. Delete
  the date picker, the line, the weekday columns, the calendar heatmap, the
  histogram, and the matrix heatmap. Keep one scorecard of the total plus
  the donut and the horizontal bars. Say that there is no time series.

A string column counts for Board A when its type contains `String` and its
name is not `id` and does not end with `_id`, or when the user named it.
Do not invent a breakdown for Board B. Do not render a table unless the user
asked to see the rows. Say which table and column each number uses, in the
muted line under the title. Do not join across schemas unless they asked.
Days with no rows are absent from the line, the area, and the histogram.
Do not fill those series with zeros. The calendar heatmap still draws every
date in the window: a day with no row is an empty cell whose tooltip says
"No rows". A measured zero stays a filled cell.

The default window includes today and stops there. `end` is today's UTC
date, `YYYY-MM-DD`. `start` is 29 days before `end` (30 dates). The date
range on the page replaces that default. A range longer than 366 inclusive
dates keeps `end` and moves `start` forward. An invalid calendar date, such
as `2026-99-99`, falls back to the default window. The previous scorecard
uses the window of the same length immediately before `start`. Pass `start`
and `end` into SQL. Do not count dates after `end`. `templates/dates.ts` is
that math. Copy it. Do not reimplement the window.

## 3. Query with the SDK

Install the client in the project when it is not already a dependency:

```sh
npm install @graphed-inc/sdk -w @app/core
```

Copy `templates/query.ts` to `packages/core/src/<route>.ts`. The dashboard
imports `@app/core/<route>`.
One `new Graphed()` lives in that module. Replace only the schema, table,
date column, measure, and group column inside the SQL strings. The daily,
breakdown, matrix, total, and groups queries use those same identifiers.
Do not invent another client, path, or parameter syntax. For `count()`,
select `count() AS value` and drop the `sum`. Omit `loadBreakdown` on
Board B. Omit `loadMatrix` on Board B. On Board C, call `loadTotal` and
`loadGroups` only. `loadMatrix` keeps every week of the top six groups.
Do not add a `LIMIT` that orders by week first. That drops the latest
weeks once a table has many groups. A share chart is only for measures
whose groups and window total are zero or positive. When `donutSlices`
returns null, show the sentence from the page instead of the donut.

Rules:

- `isConfigured()` is true when `GRAPHED_TOKEN` or a constructor token is
  set. An unconfigured query returns the token failure from `query.ts`.
  The page checks `warehouseConfigured()` first so a missing token is not
  an empty chart.
- Hosted services, jobs, and `graphed dev run` inject `GRAPHED_TOKEN`,
  `GRAPHED_WAREHOUSE_URL`, and `GRAPHED_TOOLS_URL`. Do not declare those
  names as secrets in `graphed.yaml`. Do not pass a token or URL unless you
  already have one.
- Do not `fetch` or curl the warehouse. Do not copy the Google Ads kit's
  `fetch(GRAPHED_WAREHOUSE_URL)` helper.
- `query(sql, parameters?, options?)` POSTs `{ sql, parameters }` to
  `GRAPHED_WAREHOUSE_URL` (default `{apiUrl}/cloud/warehouse/query`) with
  `Authorization: Bearer <token>`.
- The response is `{ id, columns, sql, parameters, results }`. `id` is a
  saved query id (`mcp_q_…`). `results` is an array of row objects. `T
  extends object` is an assertion, not a runtime check.
- Placeholders are `%(name)s`. `name` is letters, digits, and underscore.
  A missing key throws `Missing SQL parameter: %(name)s` before the query
  runs. Every value is bound as a ClickHouse `String`. `toDate(%(start)s)`
  is the cast. `undefined` keys are dropped by `JSON.stringify`.
- Schema and table names cannot be parameters. Interpolate a schema only
  after it matches `^[A-Za-z_][A-Za-z0-9_]*$`.
- Compare dates with `toDate(<date_column>) >= toDate(%(start)s) AND
  toDate(<date_column>) <= toDate(%(end)s)` for both `Date` and `DateTime`
  columns. `end` is today, so a future-dated row stays out of the totals.
- A breakdown label uses `ifNull(toString(<group_column>), '(none)')`.
  `toString` accepts a string, number, or date, so the `'(none)'` fallback
  type-checks. A null must not reach the chart as `null`.
- The warehouse user is read-only (`readonly=2`). `FINAL` is applied for
  you; do not write it. Do not send `INSERT`, `ALTER`, or `DELETE`.
- Per-request timeout is `timeoutMs` (default 30 seconds). Pass `signal` to
  cancel.
- Catch `GraphedConfigError` as the token card, and `GraphedApiError` or
  `GraphedTimeoutError` as a card whose description is `error.message`.
  Rethrow anything else.

Locally:

```sh
graphed dev run --project <project_slug> --account <account_id> -- npm run dev
```

## 4. Copy the templates

Cloud dashboards do not use a chart library. The charts in this skill are
inline SVG. Do not add Recharts, visx, Nivo, or Chart.js. Do not edit
`app/globals.css`, `tailwind.config.ts`, or `app/layout.tsx`. Do not redraw
the SVGs. Copy these files and change only the SQL identifiers, the titles,
and the route name.

| Template | Copy to |
| --- | --- |
| `templates/query.ts` | `packages/core/src/<route>.ts` |
| `templates/page.tsx` | `packages/dashboard/app/<route>/page.tsx` |
| `templates/charts.tsx` | `packages/dashboard/app/<route>/charts.tsx` |
| `templates/format.ts` | `packages/dashboard/app/<route>/format.ts` |
| `templates/date-range.tsx` | `packages/dashboard/app/<route>/date-range.tsx` |
| `templates/kpi-card.tsx` | `packages/dashboard/app/<route>/kpi-card.tsx` |
| `templates/dates.ts` | `packages/dashboard/app/<route>/dates.ts` |
| `templates/ui/calendar.tsx` | `packages/dashboard/components/ui/calendar.tsx` |
| `templates/ui/popover.tsx` | `packages/dashboard/components/ui/popover.tsx` |

`page.tsx` is Board A. For Board B or C, delete the cards the board section
names. `AreaChart` is already exported from `charts.tsx`. Swap it in for
`LineChart` on Board B.

The page wrapper is `w-full`. Do not add `max-w-5xl` or any other width cap.
The shell already lets the page use the space beside the sidebar. The line,
area, columns, bars, and histogram measure that width and draw across it.
Hovering a mark shows the label and value. Keep that hover.

Then append one entry to `packages/dashboard/lib/plugins.ts`: `key`, `label`,
`href: "/<route>"`, `group` (the source name, or else the schema name),
`enabled: true`.

The date control is the shadcn date picker: `templates/ui/calendar.tsx`
(`react-day-picker` v9, `mode="range"`) inside `templates/ui/popover.tsx`.
Copy both into `components/ui/` before the page imports them. Install the
two packages on the dashboard. Do not run `npx shadcn add`. That command
rewrites `app/globals.css` and the theme.

```sh
npm install react-day-picker@^9.7.0 @radix-ui/react-popover@^1.1.14 -w @app/dashboard
```

`templates/date-range.tsx` is a client component. Preset links and the
picker's Apply button navigate to `?start=YYYY-MM-DD&end=YYYY-MM-DD`. The
server page reads those search params and passes them to `loadDaily`,
`loadBreakdown`, and `loadMatrix`. Changing the dates must change the
numbers on every chart. Do not hard-code the window after the first render.
Format a picked day with `getFullYear`, `getMonth`, and `getDate`. Do not
turn that Date into a day with `toISOString()`, which can shift the day.

Chart types in `charts.tsx`, and when the copied page uses them:

- **Line** — daily trend on Board A. Smooth stroke, glow, peak and last dots.
- **Area** — daily trend on Board B. Gradient down to the zero line.
- **Columns** — weekday totals from the same daily rows. Rounded gradient bars.
- **Calendar heatmap** — one cell per date in the window, weeks across and
  Monday–Sunday down. A day with no row is a blank cell. This is the only
  chart that paints dates the query did not return.
- **Histogram** — how the daily values spread, in contiguous buckets.
- **Matrix heatmap** — top groups by week, from `loadMatrix`
  (`toMonday(toDate(<date_column>))`). Board A only.
- **Horizontal bars** — top 8 groups. A zero value draws no bar.
- **Donut** — top 5 groups plus Other (window total minus those five).
- **Sparkline** — the daily series inside the window scorecard.

Both themes already exist on the scaffold. Use the semantic classes in the
templates (`bg-card`, `text-muted-foreground`, `fill-muted`). Do not add a
theme toggle or edit the sidebar.

## About Graphed

Graphed is a marketing cloud. It includes the infrastructure for an agent to do marketing: a data warehouse, data pipelines, a Postgres database, cron jobs, runtime servers, a tool catalog, custom domains, and internal app tooling.
