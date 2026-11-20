import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  instantlyConnected,
  listOutboundCampaigns,
} from "@app/core/outbound/campaigns";
import {
  getCampaignAnalytics,
  readInstantlyApiKey,
  type CampaignAnalytics,
} from "@app/core/outbound/instantly";
import {
  instantlyStatusLabel,
  replyModeLabel,
} from "@app/core/outbound/playbook";
import { syncCampaignsAction } from "./actions";
import { CampaignsTable, type CampaignTableRow } from "./campaigns-table";
import { Notices } from "./notices";

export const dynamic = "force-dynamic";

function modeVariant(mode: string): CampaignTableRow["modeVariant"] {
  if (mode === "send") return "success";
  if (mode === "draft") return "info";
  return "secondary";
}

function statusVariant(
  status: number | null,
): CampaignTableRow["statusVariant"] {
  if (status === 1) return "success";
  if (status === 2) return "warning";
  if (status !== null && status < 0) return "destructive";
  return "secondary";
}

function formatStat(value: number | undefined): string {
  if (value === undefined) return "—";
  return value.toLocaleString("en-US");
}

export default async function OutboundPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const connected = instantlyConnected();
  let loadError: string | null = null;
  let campaigns: Awaited<ReturnType<typeof listOutboundCampaigns>> = [];
  try {
    campaigns = await listOutboundCampaigns();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  let stats = new Map<string, CampaignAnalytics>();
  let statsError: string | null = null;
  const apiKey = readInstantlyApiKey();
  if (apiKey && campaigns.length > 0) {
    try {
      const rows = await getCampaignAnalytics(apiKey);
      stats = new Map(rows.map((row) => [row.campaignId, row]));
    } catch (error) {
      statsError = error instanceof Error ? error.message : String(error);
    }
  }

  const rows: CampaignTableRow[] = [...campaigns]
    .sort((left, right) => {
      const leftLeads = stats.get(left.instantlyId)?.leads ?? -1;
      const rightLeads = stats.get(right.instantlyId)?.leads ?? -1;
      if (rightLeads !== leftLeads) return rightLeads - leftLeads;
      return left.name.localeCompare(right.name);
    })
    .map((campaign) => {
      const stat = stats.get(campaign.instantlyId);
      return {
        id: campaign.instantlyId,
        href: `/outbound/${encodeURIComponent(campaign.instantlyId)}`,
        name: campaign.name,
        status: instantlyStatusLabel(campaign.instantlyStatus),
        statusVariant: statusVariant(campaign.instantlyStatus),
        mode: replyModeLabel(campaign.replyMode),
        modeVariant: modeVariant(campaign.replyMode),
        leads: formatStat(stat?.leads),
        contacted: formatStat(stat?.contacted),
        sent: formatStat(stat?.sent),
        opens: formatStat(stat?.opens),
        replies: formatStat(stat?.replies),
        bounced: formatStat(stat?.bounced),
      };
    });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Instantly campaigns and their top-line numbers. Open one to work
            the unibox, test the playbook, or browse leads.
          </p>
        </div>
        <form action={syncCampaignsAction}>
          <Button type="submit" variant="outline" size="sm">
            <RefreshCw />
            Sync from Instantly
          </Button>
        </form>
      </div>

      <Notices notice={query.notice} error={query.error} />
      {loadError ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Could not read campaigns ({loadError}). Run <code>npm run db:migrate</code>{" "}
          if this database is new.
        </p>
      ) : null}
      {statsError ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Campaigns are listed. Instantly stats did not load ({statsError}).
        </p>
      ) : null}
      {!connected ? (
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardHeader>
            <CardTitle className="text-base">Connect Instantly</CardTitle>
            <CardDescription>
              The only credential is an Instantly API v2 key. Add{" "}
              <code>INSTANTLY_API_KEY</code> with{" "}
              <code>graphed secrets set INSTANTLY_API_KEY</code>, list it on
              the dashboard service and the <code>outbound-replies</code> job,
              then redeploy.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length === 0 ? "No campaigns yet" : `${rows.length} campaigns`}
          </CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Sync from Instantly to fill this table. New campaigns stay Off."
              : "Leads, contacted, sent, unique opens, unique replies, and bounces."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? <CampaignsTable rows={rows} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
