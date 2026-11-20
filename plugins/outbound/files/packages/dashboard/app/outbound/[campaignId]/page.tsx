import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  getOutboundCampaign,
  listThreadActivity,
  type OutboundActivity,
} from "@app/core/outbound/campaigns";
import {
  getThread,
  listCampaignEmails,
  listCampaignLeads,
  readInstantlyApiKey,
  type InstantlyEmail,
  type InstantlyLead,
} from "@app/core/outbound/instantly";
import { instantlyStatusLabel } from "@app/core/outbound/playbook";
import { LeadsTable } from "../leads";
import { Notices } from "../notices";
import { Segmented } from "../segmented";
import { PlaybookStudio } from "../studio";
import { threadsFromEmails, Unibox } from "../unibox";

export const dynamic = "force-dynamic";

type CampaignTab = "unibox" | "playbook" | "leads";

function readTab(value: string | undefined): CampaignTab {
  if (value === "playbook" || value === "leads" || value === "unibox") return value;
  return "unibox";
}

function statusVariant(
  status: number | null,
): "secondary" | "success" | "warning" | "destructive" {
  if (status === 1) return "success";
  if (status === 2) return "warning";
  if (status !== null && status < 0) return "destructive";
  return "secondary";
}

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<{
    tab?: string;
    thread?: string;
    after?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const { campaignId } = await params;
  const filters = (await searchParams) ?? {};
  const campaign = await getOutboundCampaign(campaignId);
  if (!campaign) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/outbound"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <p className="text-sm text-muted-foreground">
          This campaign is not in the local list. Sync from Instantly on the
          campaigns page, then open it again.
        </p>
      </div>
    );
  }

  const tab = readTab(filters.tab);
  const base = `/outbound/${encodeURIComponent(campaign.instantlyId)}`;
  const apiKey = readInstantlyApiKey();

  let mailboxError: string | null = null;
  let threads: ReturnType<typeof threadsFromEmails> = [];
  let messages: InstantlyEmail[] = [];
  let activity: OutboundActivity[] = [];
  let selectedId: string | null = null;

  if (tab === "unibox") {
    if (!apiKey) {
      mailboxError =
        "INSTANTLY_API_KEY is not set, so the unibox cannot load mail.";
    } else {
      try {
        const [received, sent] = await Promise.all([
          listCampaignEmails({
            apiKey,
            campaignId: campaign.instantlyId,
            emailType: "received",
            limit: 50,
          }),
          listCampaignEmails({
            apiKey,
            campaignId: campaign.instantlyId,
            emailType: "sent",
            limit: 50,
          }),
        ]);
        const byId = new Map<string, InstantlyEmail>();
        for (const email of [...received, ...sent]) byId.set(email.id, email);
        threads = threadsFromEmails([...byId.values()]);
        const requested = filters.thread;
        selectedId =
          threads.find((thread) => thread.threadId === requested)?.threadId ??
          threads[0]?.threadId ??
          null;
      } catch (error) {
        mailboxError = error instanceof Error ? error.message : String(error);
      }
      if (apiKey && selectedId && !mailboxError) {
        try {
          const [threadMessages, threadActivity] = await Promise.all([
            getThread(apiKey, selectedId),
            listThreadActivity(campaign.instantlyId, selectedId),
          ]);
          messages = threadMessages;
          activity = threadActivity;
        } catch (error) {
          mailboxError = error instanceof Error ? error.message : String(error);
        }
      }
    }
  }

  let leads: InstantlyLead[] = [];
  let leadsError: string | null = null;
  let nextHref: string | null = null;
  if (tab === "leads") {
    if (!apiKey) {
      leadsError = "INSTANTLY_API_KEY is not set, so leads cannot load.";
    } else {
      try {
        const page = await listCampaignLeads({
          apiKey,
          campaignId: campaign.instantlyId,
          startingAfter: filters.after || null,
          limit: 100,
        });
        leads = page.leads;
        if (page.next) {
          const query = new URLSearchParams({
            tab: "leads",
            after: page.next,
          });
          nextHref = `${base}?${query.toString()}`;
        }
      } catch (error) {
        leadsError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="space-y-3">
        <Link
          href="/outbound"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <Badge variant={statusVariant(campaign.instantlyStatus)}>
            {instantlyStatusLabel(campaign.instantlyStatus)}
          </Badge>
        </div>
        <Segmented
          items={[
            { href: `${base}?tab=unibox`, label: "Unibox", active: tab === "unibox" },
            {
              href: `${base}?tab=playbook`,
              label: "Playbook testing",
              active: tab === "playbook",
            },
            { href: `${base}?tab=leads`, label: "Leads", active: tab === "leads" },
          ]}
        />
      </div>

      <Notices notice={filters.notice} error={filters.error} />

      {tab === "unibox" ? (
        <Unibox
          instantlyId={campaign.instantlyId}
          mode={campaign.replyMode}
          playbook={campaign.playbook}
          threads={threads}
          selectedId={selectedId}
          messages={messages}
          activity={activity}
          error={mailboxError}
          hrefFor={(threadId) =>
            `${base}?${new URLSearchParams({ tab: "unibox", thread: threadId }).toString()}`
          }
        />
      ) : null}

      {tab === "playbook" ? (
        <PlaybookStudio
          key={campaign.instantlyId}
          instantlyId={campaign.instantlyId}
          savedPlaybook={campaign.playbook}
        />
      ) : null}

      {tab === "leads" ? (
        leadsError ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {leadsError}
          </p>
        ) : (
          <LeadsTable leads={leads} nextHref={nextHref} totalHint={null} />
        )
      ) : null}
    </div>
  );
}
