import { loadClientConfig } from "@app/core/google-ads/config";
import { formatDroppedNameListNote } from "@app/core/google-ads/name-list";
import {
  isWarehouseStale,
  WAREHOUSE_STALE_HOURS,
} from "@app/core/google-ads/dates";
import { getServingHealth } from "@app/core/google-ads/health";
import {
  campaignBreakdown,
  totalsForWindow,
} from "@app/core/google-ads/overview";
import { getScoreboard } from "@app/core/google-ads/scoreboard";
import { getRun, listActions, listRuns } from "@app/core/google-ads/store";
import { parseStoredTrace } from "@app/core/google-ads/trace";
import { writesEnabled } from "@app/core/google-ads/types";
import { warehouseConfigured } from "@app/core/google-ads/warehouse";
import { Activity, Clock3, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  deltaPct,
  formatCpa,
  formatNumber,
  formatUsd,
  formatWhen,
  headlineOf,
  withoutTrailingPunctuation,
} from "./format";
import { KpiCard } from "./kpi-card";
import { SegmentedControl } from "./segmented-control";
import { SessionTrace } from "./session-trace";
import { SpendChart } from "./spend-chart";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string; run?: string };

function roleBadge(role: string) {
  if (role === "testing") return <Badge variant="info">Testing</Badge>;
  if (role === "winners") return <Badge variant="success">Winners</Badge>;
  if (role === "brand") return <Badge variant="warning">Brand</Badge>;
  return <Badge variant="secondary">Other</Badge>;
}

export default async function GoogleAdsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const tab = query.tab === "sessions" ? "sessions" : "overview";
  const client = loadClientConfig();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-500">
            Google Ads
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {client.display_name}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {withoutTrailingPunctuation(client.product_one_liner)}. Daily
            Testing → Winners loop with a locked tool belt.
          </p>
        </div>
        <SegmentedControl tab={tab} />
      </div>

      {tab === "overview" ? (
        <Overview />
      ) : (
        <Sessions
          clientKey={client.client_key}
          selectedId={query.run}
        />
      )}
    </div>
  );
}

async function Overview() {
  const client = loadClientConfig();
  const schema = client.metrics.googleAdsSchema.trim();
  const liveWrites = writesEnabled(client);

  let boardError: string | null = null;
  const board =
    schema && warehouseConfigured()
      ? await getScoreboard(client, [7, 30], "campaign").catch(
          (error: unknown) => {
            boardError =
              error instanceof Error ? error.message : "warehouse error";
            return null;
          },
        )
      : null;
  const health = board
    ? await getServingHealth(client).catch(() => null)
    : null;

  const d7 = board ? totalsForWindow(board.rows, 7) : null;
  const d30 = board ? totalsForWindow(board.rows, 30) : null;
  const campaigns = board ? campaignBreakdown(board.rows) : [];
  const lagHours = board?.warehouseLagHours;
  const stale = isWarehouseStale(lagHours ?? null);
  const droppedNames = client.nameListDrops;
  const droppedCount = droppedNames.reduce(
    (total, row) => total + row.entries.length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={liveWrites ? "success" : "warning"}>
          {liveWrites ? "Live writes" : "Writes off"}
        </Badge>
        <Badge variant="secondary" className="font-mono">
          {client.google_ads.customer_id}
        </Badge>
        {schema ? (
          <Badge variant="info" className="font-mono">
            {schema}
          </Badge>
        ) : (
          <Badge variant="warning">warehouse schema unset</Badge>
        )}
        {droppedCount > 0 ? (
          <Badge variant="warning">
            {droppedCount} name{droppedCount === 1 ? "" : "s"} ignored
          </Badge>
        ) : null}
        {board?.asOfDate ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            as of {board.asOfDate}
          </span>
        ) : null}
      </div>

      {!schema ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Set the Google Ads warehouse schema
            </CardTitle>
            <CardDescription>
              Run <code>graphed warehouse query -- &quot;SHOW DATABASES&quot;</code>{" "}
              and put the <code>google_ads_*</code> name in{" "}
              <code>metrics.googleAdsSchema</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {schema && !warehouseConfigured() ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Warehouse credentials not injected
            </CardTitle>
            <CardDescription>
              Start the dashboard with{" "}
              <code>graphed dev run -- npm run dev</code> so GRAPHED_TOKEN
              is present.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {droppedCount > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Config ignored {droppedCount} name
              {droppedCount === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription>
              {formatDroppedNameListNote(droppedNames)}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {stale ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Warehouse is stale
            </CardTitle>
            <CardDescription>
              Last warehouse sync was {Math.round(lagHours ?? 0)} hours
              ago. The agent will not write until that is under{" "}
              {WAREHOUSE_STALE_HOURS} hours.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {boardError ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Could not load warehouse KPIs
            </CardTitle>
            <CardDescription>{boardError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Spend · 7d"
          value={d7 ? formatUsd(d7.spend) : "—"}
          hint={d30 ? `${formatUsd(d30.spend)} / 30d` : undefined}
          delta={d7 && d30 ? deltaPct(d7.spend, d30.spend / (30 / 7)) : null}
        />
        <KpiCard
          label="Conversions · 7d"
          value={d7 ? formatNumber(d7.conversions) : "—"}
          hint={d30 ? `${formatNumber(d30.conversions)} / 30d` : undefined}
          delta={
            d7 && d30
              ? deltaPct(d7.conversions, d30.conversions / (30 / 7))
              : null
          }
        />
        <KpiCard
          label="CPA · 7d"
          value={d7 ? formatCpa(d7.cpa) : "—"}
          hint={`target ${formatUsd(client.thresholds.success_cpa_target)}`}
          delta={d7 && d30 ? deltaPct(d7.cpa ?? 0, d30.cpa ?? 0) : null}
          invert
        />
        <KpiCard
          label="Clicks · 7d"
          value={d7 ? formatNumber(d7.clicks) : "—"}
          hint={d7 ? `${formatNumber(d7.impressions)} impr` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily spend</CardTitle>
            <CardDescription>
              Last 30 days in the warehouse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SpendChart data={board?.daily ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serving health</CardTitle>
            <CardDescription>
              Recent impressions vs the {client.safeguard.baseline_days}d
              baseline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(
              [
                ["Testing", health?.testing],
                ["Winners", health?.winners],
              ] as const
            ).map(([label, snap]) => (
              <div key={label} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  {snap ? (
                    <Badge
                      variant={
                        snap.configured === false
                          ? "secondary"
                          : snap.healthy
                            ? "success"
                            : "destructive"
                      }
                    >
                      {snap.configured === false
                        ? "Not configured"
                        : snap.healthy
                          ? "Healthy"
                          : "Unhealthy"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Unknown</Badge>
                  )}
                </div>
                {snap?.reasons.length ? (
                  <p className="mt-2 text-xs text-amber-400">
                    {snap.reasons.join(" · ")}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {snap
                      ? `${formatNumber(snap.impressionsRecent)} impr / day recently`
                      : "Health is computed from warehouse stats."}
                  </p>
                )}
              </div>
            ))}
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5" />
              Brand is read-only. Combined daily budget cap is{" "}
              {formatUsd(client.budget.max_total_daily_budget)}.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
          <CardDescription>
            7-day and 30-day performance. Unlabeled IDs are campaigns the
            agent has not been assigned yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaign stats in this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">7d spend</TableHead>
                  <TableHead className="text-right">7d conv</TableHead>
                  <TableHead className="text-right">7d CPA</TableHead>
                  <TableHead className="text-right">30d spend</TableHead>
                  <TableHead className="text-right">30d CPA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((row) => (
                  <TableRow key={row.campaignId}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {roleBadge(row.campaign)}
                          <span className="font-medium">
                            {row.campaignName}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {row.campaignId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(row.d7.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.d7.conversions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCpa(row.d7.cpa)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(row.d30.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCpa(row.d30.cpa)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function Sessions({
  clientKey,
  selectedId,
}: {
  clientKey: string;
  selectedId?: string;
}) {
  const runs = await listRuns(clientKey, 40).catch(() => []);
  const runId = selectedId ?? runs[0]?.id;
  const selected = runId
    ? await getRun(runId, clientKey).catch(() => undefined)
    : undefined;
  const actions = selected ? await listActions(selected.id) : [];
  const trace = parseStoredTrace(selected?.messages);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Runs</CardTitle>
          <CardDescription>Persisted Mastra sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 p-2">
          {runs.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No sessions yet. The agent runs at 8:00 AM ET.
            </div>
          ) : (
            runs.map((run) => {
              const active = selected?.id === run.id;
              return (
                <Link
                  key={run.id}
                  href={`/google-ads?tab=sessions&run=${run.id}`}
                  className={`block rounded-lg px-3 py-2.5 transition-colors ${
                    active
                      ? "bg-muted ring-1 ring-border"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {formatWhen(run.started_at)}
                    </span>
                    <Badge
                      variant={
                        run.status === "succeeded"
                          ? "success"
                          : run.status === "failed"
                            ? "destructive"
                            : "info"
                      }
                    >
                      {run.status}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {headlineOf(run.report)}
                  </p>
                  {run.dry_run ? (
                    <span className="mt-1 inline-block text-[10px] uppercase tracking-wider text-amber-500">
                      writes off
                    </span>
                  ) : null}
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-emerald-500" />
            {selected ? formatWhen(selected.started_at) : "Session"}
          </CardTitle>
          <CardDescription>
            {selected
              ? `${actions.length} recorded write${actions.length === 1 ? "" : "s"}`
              : "Pick a run to inspect the Mastra trace."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selected ? (
            <SessionTrace trace={trace} report={selected.report} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Trigger a run with{" "}
              <code>graphed jobs run google-ads-daily</code> to see a
              trace here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
