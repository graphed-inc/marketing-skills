import {
  Graphed,
  GraphedApiError,
  GraphedConfigError,
  GraphedTimeoutError,
} from "@graphed-inc/sdk";

const client = new Graphed();

export function warehouseConfigured(): boolean {
  return client.isConfigured();
}

export interface DailyRow {
  day: string;
  value: number;
}

export interface BreakdownRow {
  label: string;
  value: number;
}

export interface MatrixRow {
  label: string;
  week: string;
  value: number;
}

export type QueryFailure = { ok: false; kind: "config" | "query"; message: string };
export type QueryRows<T> = { ok: true; rows: T[] } | QueryFailure;

const TOKEN_MESSAGE =
  "Start the dashboard with `graphed dev run -- npm run dev` so GRAPHED_TOKEN is present.";

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asDay(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  return "";
}

function asLabel(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  return "(none)";
}

async function run<T extends object>(
  sql: string,
  parameters: Record<string, string>,
): Promise<{ ok: true; rows: T[] } | QueryFailure> {
  if (!client.isConfigured()) {
    return { ok: false, kind: "config", message: TOKEN_MESSAGE };
  }
  try {
    const { results } = await client.warehouse.query<T>(sql, parameters);
    return { ok: true, rows: results };
  } catch (error) {
    if (error instanceof GraphedConfigError) {
      return { ok: false, kind: "config", message: TOKEN_MESSAGE };
    }
    if (error instanceof GraphedApiError || error instanceof GraphedTimeoutError) {
      return { ok: false, kind: "query", message: error.message };
    }
    throw error;
  }
}

/**
 * Replace billing_acme, invoices, paid_at, amount, and channel with the
 * schema, table, date column, measure, and group column the skill picked.
 * TOTAL_SQL and GROUPS_SQL are the Board C pair: no date column and no
 * window filter. Schema and table names are not SQL parameters. They must
 * match /^[A-Za-z_][A-Za-z0-9_]*$/. For count(), use `count() AS value`.
 */
const DAILY_SQL = `SELECT toDate(paid_at) AS day, sum(amount) AS value
  FROM billing_acme.invoices
  WHERE toDate(paid_at) >= toDate(%(start)s)
    AND toDate(paid_at) <= toDate(%(end)s)
  GROUP BY day
  ORDER BY day`;

const BREAKDOWN_SQL = `SELECT ifNull(toString(channel), '(none)') AS label, sum(amount) AS value
  FROM billing_acme.invoices
  WHERE toDate(paid_at) >= toDate(%(start)s)
    AND toDate(paid_at) <= toDate(%(end)s)
  GROUP BY label
  ORDER BY value DESC
  LIMIT 8`;

/**
 * Top groups over the whole window, then every week of those groups.
 * Ordering by week and then LIMIT would drop the latest weeks once a
 * table has many groups.
 */
const MATRIX_SQL = `WITH top_groups AS (
  SELECT ifNull(toString(channel), '(none)') AS label
  FROM billing_acme.invoices
  WHERE toDate(paid_at) >= toDate(%(start)s)
    AND toDate(paid_at) <= toDate(%(end)s)
  GROUP BY label
  ORDER BY sum(amount) DESC
  LIMIT 6
)
SELECT ifNull(toString(channel), '(none)') AS label,
    toMonday(toDate(paid_at)) AS week,
    sum(amount) AS value
  FROM billing_acme.invoices
  WHERE toDate(paid_at) >= toDate(%(start)s)
    AND toDate(paid_at) <= toDate(%(end)s)
    AND ifNull(toString(channel), '(none)') IN (SELECT label FROM top_groups)
  GROUP BY label, week
  ORDER BY week, value DESC`;

/** Board C. No date column, so there is no window filter. */
const TOTAL_SQL = `SELECT sum(amount) AS value FROM billing_acme.invoices`;

/** Board C breakdown. Same group column as BREAKDOWN_SQL, with no date filter. */
const GROUPS_SQL = `SELECT ifNull(toString(channel), '(none)') AS label, sum(amount) AS value
  FROM billing_acme.invoices
  GROUP BY label
  ORDER BY value DESC
  LIMIT 8`;

export async function loadDaily(
  start: string,
  end: string,
): Promise<QueryRows<DailyRow>> {
  const result = await run<{ day: unknown; value: unknown }>(DAILY_SQL, { start, end });
  if (!result.ok) return result;
  return {
    ok: true,
    rows: result.rows.map((row) => ({ day: asDay(row.day), value: asNumber(row.value) })),
  };
}

export async function loadBreakdown(
  start: string,
  end: string,
): Promise<QueryRows<BreakdownRow>> {
  const result = await run<{ label: unknown; value: unknown }>(BREAKDOWN_SQL, {
    start,
    end,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    rows: result.rows.map((row) => ({
      label: asLabel(row.label),
      value: asNumber(row.value),
    })),
  };
}

export async function loadTotal(): Promise<{ ok: true; value: number } | QueryFailure> {
  const result = await run<{ value: unknown }>(TOTAL_SQL, {});
  if (!result.ok) return result;
  return { ok: true, value: asNumber(result.rows[0]?.value) };
}

export async function loadGroups(): Promise<QueryRows<BreakdownRow>> {
  const result = await run<{ label: unknown; value: unknown }>(GROUPS_SQL, {});
  if (!result.ok) return result;
  return {
    ok: true,
    rows: result.rows.map((row) => ({
      label: asLabel(row.label),
      value: asNumber(row.value),
    })),
  };
}

export async function loadMatrix(start: string, end: string): Promise<QueryRows<MatrixRow>> {
  const result = await run<{ label: unknown; week: unknown; value: unknown }>(MATRIX_SQL, {
    start,
    end,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    rows: result.rows.map((row) => ({
      label: asLabel(row.label),
      week: asDay(row.week),
      value: asNumber(row.value),
    })),
  };
}
