---
name: analytics-dashboard
description: "Build an analytics dashboard from the data in your warehouse. Use when the user wants analytics, KPIs, or charts from connected sources: draw a large smooth chart and a bar breakdown, query with @graphed-inc/sdk, and skip tables unless they ask for rows."
---

# Analytics Dashboard

Add a read-only analytics page to a Graphed cloud project. The page should
look like a chart, not a report: a large smooth area chart, two scorecards,
and a horizontal bar chart when there is a breakdown. Discover the
warehouse, choose the board with the rules below, and query with
`@graphed-inc/sdk`.

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

Board, in this order:

1. Time series of that measure (or `count()`) for the latest 30 UTC days,
   when a date column exists. Skip the chart when it does not, and say so.
2. Two scorecards from those daily rows: the sum of the last 7 UTC days, and
   the sum of the 30-day window. Do not add `count()` or `uniq()` queries
   unless the user asked for a count or for uniques.
3. A breakdown bar chart only when the user names the group-by column, or a
   column's type contains `String`. Do not group by an identifier unless
   they asked. One query, top rows by the measure, `LIMIT 8`.

Show those numbers as charts. Do not render a table unless the user asked
to see the rows. Say which table and column each number uses. Do not join
across schemas unless they asked. Days with no rows are absent; do not fill
them.

The window includes today and stops there. `end` is today's UTC date,
`YYYY-MM-DD`. `start` is 29 days before `end`, so the query covers 30
calendar dates. The 7-day scorecard sums returned rows whose `day` is on or
after 6 days before `end` (7 dates). Compute `start` and `end` in the page
and pass both into SQL. Do not count dates after `end`.

## 3. Query with the SDK

Install the client in the project when it is not already a dependency:

```sh
npm install @graphed-inc/sdk
```

Put the function in `packages/core/src/<route>.ts`. The dashboard imports
`@app/core/<route>`. One `new Graphed()` in that module. Export
`warehouseConfigured()` from the same module.

```ts
import { Graphed } from "@graphed-inc/sdk";

const client = new Graphed();

export function warehouseConfigured(): boolean {
  return client.isConfigured();
}

export async function loadDaily(start: string, end: string): Promise<DailyRow[]> {
  if (!client.isConfigured()) return [];
  const { results } = await client.warehouse.query<DailyRow>(
    `SELECT toDate(paid_at) AS day, sum(amount) AS value
     FROM billing_acme.invoices
     WHERE toDate(paid_at) >= toDate(%(start)s)
       AND toDate(paid_at) <= toDate(%(end)s)
     GROUP BY day
     ORDER BY day`,
    { start, end },
  );
  return results;
}

export interface DailyRow {
  day: string;
  value: number;
}
```

Replace `billing_acme.invoices`, `paid_at`, and `amount` with the table,
date column, and measure the rules picked. For `count()`, select
`count() AS value` and drop the `sum`.

A breakdown, only when section 2 asks for one:

```ts
const { results } = await client.warehouse.query<BreakdownRow>(
  `SELECT ifNull(toString(channel), '(none)') AS label, sum(amount) AS value
   FROM billing_acme.invoices
   WHERE toDate(paid_at) >= toDate(%(start)s)
     AND toDate(paid_at) <= toDate(%(end)s)
   GROUP BY label
   ORDER BY value DESC
   LIMIT 8`,
  { start, end },
);
```

Rules:

- `isConfigured()` is true when `GRAPHED_TOKEN` or a constructor token is
  set. An unconfigured `loadDaily` returns `[]`. The page checks
  `warehouseConfigured()` first so a missing token is not the empty chart.
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

## 4. Embed the charts

The page is the chart. Cloud project dashboards do not use a chart library.
Draw inline SVG inside shadcn `Card`s. A straight polyline and a data table
are not the design. Do not add Recharts, visx, Nivo, or Chart.js. Do not
edit the theme files. Put gradients in the SVG `<defs>`, using `#34d399`
(the same green as `stroke-emerald-400`).

Write these files and nothing under the theme:

- `packages/dashboard/app/<route>/page.tsx` — server component,
  `export const dynamic = "force-dynamic"`.
- `packages/dashboard/app/<route>/<route>-chart.tsx` — the area chart and
  the bar chart.
- `packages/dashboard/app/<route>/kpi-card.tsx` — the scorecard, with a
  sparkline on the 30-day card.
- Append one entry to `packages/dashboard/lib/plugins.ts`: `key`, `label`,
  `href: "/<route>"`, `group` (the source name, or else the schema name),
  `enabled: true`.

Compose `Card`, `CardHeader`, `CardTitle`, `CardDescription`, and
`CardContent` from `components/ui/`. Add a missing shadcn component with
`npx shadcn@latest add <name>`. Do not add `Table` unless the user asked
to see the rows.

Page order:

1. Token card or error card, only when that state is real.
2. Two scorecards in `grid gap-4 md:grid-cols-2`.
3. One full-width hero card. Title is the measure in plain language
   ("Sessions"). Description is "Last 30 days". The chart is `h-80`.
4. When section 2 includes a breakdown, a second card whose bars are the
   chart. Title is the group column in plain language. No table under it.

Token card copy, when `warehouseConfigured()` is false or the call throws
`GraphedConfigError`:

> Start the dashboard with `graphed dev run -- npm run dev` so
> `GRAPHED_TOKEN` is present.

Empty `data` returns the message div and no SVG. Rows whose values are all
0 still draw the SVG. One series only, unless the user named a second
metric. Set `aria-label` to the measure you actually plot.

Shared helpers, in the chart file:

```tsx
export function compact(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 1 : 0;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(digits)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function shortDay(day: string): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function smoothLine(points: { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M${first.x},${first.y}`;
  let path = `M${first.x},${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    const mid = (from.x + to.x) / 2;
    path += ` C${mid},${from.y} ${mid},${to.y} ${to.x},${to.y}`;
  }
  return path;
}

function clipLabel(label: string | null): string {
  const text = label == null || label === "" ? "(none)" : label;
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}
```

Hero chart. Copy this shape. Keep the gradient, the soft understroke, the
dashed grid, the three date labels, and the peak plus last-point dots.

```tsx
export function TrendChart({
  data,
  label,
}: {
  data: { day: string; value: number }[];
  label: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
        No rows in this window.
      </div>
    );
  }

  const width = 720;
  const height = 320;
  const pad = { top: 24, right: 20, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = data.map((row) => row.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const span = maxValue - minValue || 1;
  const yFor = (value: number) =>
    pad.top + innerH - ((value - minValue) / span) * innerH;
  const points = data.map((row, index) => {
    const x =
      pad.left +
      (data.length === 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
    return { x, y: yFor(row.value), row };
  });
  const line = smoothLine(points);
  const zeroY = yFor(0);
  const area = `${line} L${points[points.length - 1]?.x ?? pad.left},${zeroY} L${points[0]?.x ?? pad.left},${zeroY} Z`;
  const peak = points.reduce((best, point) =>
    point.row.value > best.row.value ? point : best,
  );
  const last = points[points.length - 1] ?? peak;
  const tickValues = minValue < 0 ? [minValue, 0, maxValue] : [0, maxValue / 2, maxValue];
  const ticks = tickValues.map((value) => ({
    y: yFor(value),
    text: compact(value),
  }));
  const dateIndexes = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-80 w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => (
        <g key={`${tick.text}-${tick.y}`}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={tick.y}
            y2={tick.y}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="3 6"
          />
          <text x={pad.left - 10} y={tick.y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {tick.text}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#trend-fill)" />
      <path d={line} fill="none" className="stroke-emerald-400/30" strokeWidth="8" strokeLinecap="round" />
      <path d={line} fill="none" className="stroke-emerald-400" strokeWidth="2.5" strokeLinecap="round" />
      {[peak, last].map((point) => (
        <g key={`${point.x}-${point.row.day}`}>
          <circle cx={point.x} cy={point.y} r="7" className="fill-emerald-400/20" />
          <circle cx={point.x} cy={point.y} r="3.5" className="fill-card stroke-emerald-400" strokeWidth="2" />
        </g>
      ))}
      {dateIndexes.map((index) => {
        const point = points[index];
        if (!point) return null;
        const anchor = index === 0 ? "start" : index === data.length - 1 ? "end" : "middle";
        return (
          <text key={point.row.day} x={point.x} y={height - 10} textAnchor={anchor} className="fill-muted-foreground text-[11px]">
            {shortDay(point.row.day)}
          </text>
        );
      })}
    </svg>
  );
}
```

Breakdown chart, when section 2 includes one. Eight rounded bars, a muted
track behind each bar, the value at the right. Truncate long labels.

```tsx
export function BreakdownChart({
  data,
  label,
}: {
  data: { label: string | null; value: number }[];
  label: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No breakdown rows in this window.
      </div>
    );
  }

  const rows = data.slice(0, 8);
  const width = 720;
  const rowH = 40;
  const height = rows.length * rowH + 8;
  const labelW = 180;
  const valueW = 56;
  const barX = labelW;
  const barMax = width - labelW - valueW - 12;
  const maxValue = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id="bar-fill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="1" />
        </linearGradient>
      </defs>
      {rows.map((row, index) => {
        const y = 8 + index * rowH;
        const magnitude = Math.abs(row.value);
        const barW = magnitude === 0 ? 0 : Math.max((magnitude / maxValue) * barMax, 10);
        return (
          <g key={`${clipLabel(row.label)}-${index}`}>
            <text x={0} y={y + 18} className="fill-foreground text-[12px]">
              {clipLabel(row.label)}
            </text>
            <rect x={barX} y={y + 6} width={barMax} height={16} rx={8} className="fill-muted" />
            <rect x={barX} y={y + 6} width={barW} height={16} rx={8} fill="url(#bar-fill)" />
            <text x={width} y={y + 18} textAnchor="end" className="fill-foreground text-[12px] tabular-nums">
              {compact(row.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

Scorecard: `Card`, uppercase tracking-wide `text-muted-foreground` label,
`text-3xl font-semibold tabular-nums` value. The 7-day card's hint is the
30-day total in `text-sm text-muted-foreground`. The 30-day card also draws
`TrendChart`'s series as a sparkline: the same `smoothLine`, viewBox
`0 0 120 36`, class `h-10 w-28`, gradient id `spark-fill`, no axes and no
dots. Use a `Badge` only for a percent delta you actually computed.

The Graphed product chat is a different embed. In `front/`, markdown
`<Chart id="chr_…" />` renders `EmbeddedChart`
(`front/components/chart/embedded-chart.tsx`), which loads
`GET /charts/:id` and draws the saved chart with Recharts through
`ChartVersion`. `<Dashboard id="dsh_…" />` renders `EmbeddedDashboard`, a
button that opens the dashboard; it stays disabled on public links. Those
components are not part of a cloud project. Do not import `front/components`
into `packages/dashboard`.
