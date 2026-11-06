import { loadBreakdown, loadDaily, loadMatrix, warehouseConfigured } from "@app/core/board";

import {
  BarChart,
  CalendarHeatmap,
  ColumnChart,
  DonutChart,
  Histogram,
  LineChart,
  MatrixHeatmap,
} from "./charts";
import { compact, donutSlices, weekdayTotals } from "./format";
import { DateRange } from "./date-range";
import {
  addUtcDays,
  percentChange,
  priorWindow,
  readWindow,
  utcToday,
} from "./dates";
import { KpiCard } from "./kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sum(rows: { value: number }[]): number {
  return rows.reduce((total, row) => total + row.value, 0);
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const today = utcToday();
  const window = readWindow(firstParam(searchParams.start), firstParam(searchParams.end));
  const previous = priorWindow(window.start, window.end);
  const presets = [
    { label: "7 days", start: addUtcDays(today, -6), end: today },
    { label: "30 days", start: addUtcDays(today, -29), end: today },
    { label: "90 days", start: addUtcDays(today, -89), end: today },
  ];

  if (!warehouseConfigured()) {
    return (
      <Card>
        <CardHeader className="space-y-1 p-4 pb-2">
          <CardTitle>Warehouse token missing</CardTitle>
          <CardDescription>
            Start the dashboard with `graphed dev run -- npm run dev` so GRAPHED_TOKEN is present.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [daily, prior, breakdown, matrix] = await Promise.all([
    loadDaily(window.start, window.end),
    loadDaily(previous.start, previous.end),
    loadBreakdown(window.start, window.end),
    loadMatrix(window.start, window.end),
  ]);

  const failure = [daily, prior, breakdown, matrix].find((result) => !result.ok);
  if (failure && !failure.ok) {
    return (
      <Card>
        <CardHeader className="space-y-1 p-4 pb-2">
          <CardTitle>{failure.kind === "config" ? "Warehouse token missing" : "Query failed"}</CardTitle>
          <CardDescription>{failure.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!daily.ok || !prior.ok || !breakdown.ok || !matrix.ok) return null;

  const currentTotal = sum(daily.rows);
  const priorTotal = sum(prior.rows);
  const delta = percentChange(currentTotal, priorTotal);
  const slices = donutSlices(breakdown.rows, currentTotal);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Sum of sessions on ga4_example.events, by date. Breakdown is session_source.
          </p>
        </div>
        <DateRange start={window.start} end={window.end} presets={presets} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="This window"
          value={compact(currentTotal)}
          delta={delta}
          hint={delta ? "vs the previous window" : "No prior rows to compare"}
          series={daily.rows.map((row) => row.value)}
        />
        <KpiCard label="Previous window" value={compact(priorTotal)} hint={`${previous.start} – ${previous.end}`} />
        <KpiCard label="Days with rows" value={String(daily.rows.length)} hint="Missing days stay blank" />
      </div>

      <Card>
        <CardHeader className="space-y-1 p-4 pb-2">
          <CardTitle>Daily trend</CardTitle>
          <CardDescription>
            {window.start} to {window.end}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <LineChart data={daily.rows} label="Daily sessions" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1 p-4 pb-2">
          <CardTitle>Calendar</CardTitle>
          <CardDescription>Each cell is one day. Blank cells had no rows.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <CalendarHeatmap data={daily.rows} start={window.start} end={window.end} label="Sessions by day" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardTitle>Weekday</CardTitle>
            <CardDescription>Same rows, summed by weekday</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ColumnChart data={weekdayTotals(daily.rows)} label="Sessions by weekday" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardTitle>Share</CardTitle>
            <CardDescription>Top sources, plus everything else</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {slices ? (
              <DonutChart data={slices} label="Session share" />
            ) : (
              <p className="py-8 text-sm text-muted-foreground">
                Share needs every group, and the window total, to be zero or positive.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardTitle>Daily spread</CardTitle>
            <CardDescription>How many days landed in each size</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Histogram data={daily.rows.map((row) => row.value)} label="Daily session spread" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardTitle>Source by week</CardTitle>
            <CardDescription>Top sources across Mondays in the window</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <MatrixHeatmap data={matrix.rows} label="Sessions by source and week" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-1 p-4 pb-2">
          <CardTitle>Source</CardTitle>
          <CardDescription>Top 8 by sessions</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <BarChart data={breakdown.rows} label="Sessions by source" />
        </CardContent>
      </Card>
    </div>
  );
}
