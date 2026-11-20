import { getDb } from "@app/core";
import { markdownToHtml } from "@app/core/seo/markdown";
import { loadSeoMetrics, type SeoMetrics } from "@app/core/seo/metrics";
import {
  loadPlaybooks,
  loadPlaybookOverrides,
  DEFAULT_PLAYBOOKS,
  PLAYBOOK_STAGES,
} from "@app/core/seo/playbooks";
import {
  ExternalLink,
  Eye,
  Play,
  TriangleAlert,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  deleteKeywordAction,
  importKeywordsAction,
  runKeywordAction,
  unpublishAction,
} from "./actions";
import { PlaybookStudio } from "./playbook-studio";

export const dynamic = "force-dynamic";

// Warehouse/ClickHouse errors can run to multiple kilobytes (the full SQL,
// every URL in the query, ...). Keep the rendered hint short.
const ERROR_DETAIL_MAX = 160;
function truncateDetail(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();
  return singleLine.length > ERROR_DETAIL_MAX
    ? `${singleLine.slice(0, ERROR_DETAIL_MAX)}…`
    : singleLine;
}

interface QueueRow {
  keywordId: number;
  keyword: string;
  keywordStatus: string;
  priority: number | null;
  lastError: string | null;
  articleId: number | null;
  articleTitle: string | null;
  articleStatus: string | null;
  publicUrl: string | null;
  publishedAt: Date | null;
}

interface ArticleView {
  id: number;
  slug: string;
  title: string | null;
  metaDescription: string | null;
  markdown: string | null;
  status: string;
  cms: string | null;
  publicUrl: string | null;
  publishedAt: Date | null;
}

async function loadQueue(): Promise<QueueRow[] | { error: string }> {
  try {
    const db = getDb();
    const rows = await db
      .selectFrom("seo_keywords as keyword")
      .leftJoin("seo_articles as article", "article.keyword_id", "keyword.id")
      .select([
        "keyword.id as keywordId",
        "keyword.keyword",
        "keyword.status as keywordStatus",
        "keyword.priority",
        "keyword.last_error as lastError",
        "article.id as articleId",
        "article.title as articleTitle",
        "article.status as articleStatus",
        "article.public_url as publicUrl",
        "article.published_at as publishedAt",
      ])
      .orderBy("keyword.priority", "asc")
      .orderBy("keyword.created_at", "asc")
      .limit(100)
      .execute();
    return rows;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "query failed",
    };
  }
}

async function loadArticle(id: number): Promise<ArticleView | null> {
  const row = await getDb()
    .selectFrom("seo_articles")
    .select([
      "id",
      "slug",
      "title",
      "meta_description as metaDescription",
      "markdown",
      "status",
      "cms",
      "public_url as publicUrl",
      "published_at as publishedAt",
    ])
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "published"
      ? "success"
      : status === "failed"
        ? "destructive"
        : status === "generated"
          ? "info"
          : status === "generating"
            ? "warning"
            : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

const TABS = [
  { key: "queue", label: "Queue" },
  { key: "playbook", label: "Playbook & Test" },
] as const;

type SeoTab = (typeof TABS)[number]["key"];

export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    article?: string;
    notice?: string;
    error?: string;
    playbook?: string;
  }>;
}) {
  const query = await searchParams;
  const tab: SeoTab = TABS.some((t) => t.key === query.tab)
    ? (query.tab as SeoTab)
    : "queue";
  const queue = tab === "queue" ? await loadQueue() : [];
  // Metrics are best-effort: a warehouse outage must not break the console —
  // but surface the real error so cloud misconfiguration is debuggable
  // instead of masked as missing credentials.
  const { metrics, reason, detail } =
    tab === "queue"
      ? await loadSeoMetrics().catch((error) => {
          // Full error goes to the server log; the hint gets a bounded one-liner.
          console.error("seo metrics failed", error);
          return {
            metrics: null,
            reason: "error" as const,
            detail: truncateDetail(
              error instanceof Error ? error.message : String(error),
            ),
          };
        })
      : { metrics: null, reason: null, detail: undefined };
  const playbooks = tab === "playbook" ? await loadPlaybooks() : null;
  const playbookOverrides =
    tab === "playbook" ? await loadPlaybookOverrides() : new Set<string>();

  const articleId = query.article ? Number(query.article) : null;
  const openArticle =
    articleId && Number.isFinite(articleId) ? await loadArticle(articleId) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SEO</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keyword queue and generated articles. The seo-publish-daily job
            takes one keyword per run.
          </p>
        </div>
        <nav className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "queue" ? "/seo" : `/seo?tab=${t.key}`}
              className={
                t.key === tab
                  ? "rounded-sm bg-background px-3 py-1 text-xs font-medium shadow-sm"
                  : "rounded-sm px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {query.error ? (
        <Banner tone="error" message={query.error} />
      ) : null}
      {query.notice ? (
        <Banner tone="notice" message={query.notice} />
      ) : null}

      {tab === "queue" ? (
        metrics ? (
          <MetricsStrip metrics={metrics} />
        ) : reason === "no-search-console-schema" ? (
          <p className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
            Metrics: set <code>metrics.searchConsoleSchema</code> in{" "}
            <code>clients/seo/client.config.json</code> to this client&apos;s
            Search Console schema (find it with{" "}
            <code>graphed warehouse query -- &quot;SHOW DATABASES&quot;</code> —
            the <code>search_*</code> entry).
          </p>
        ) : reason === "error" ? (
          <p className="rounded-md border border-dashed border-destructive/50 px-4 py-3 text-xs text-destructive">
            Metrics query failed: {detail}
          </p>
        ) : (
          <p className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
            Metrics need warehouse credentials — run the dashboard via{" "}
            <code>graphed dev run -- npm run dev</code> (they&apos;re injected
            automatically in the cloud runtime).
          </p>
        )
      ) : null}

      {tab === "queue" ? (
        <>
          <details className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <Upload className="h-4 w-4" />
              Import keywords from CSV
              <span className="ml-auto text-xs group-open:rotate-180">▾</span>
            </summary>
            <form action={importKeywordsAction} className="border-t px-4 py-4">
              <textarea
                name="csv"
                rows={4}
                placeholder={"keyword, slug, priority\nbest crm for plumbers, best-crm-for-plumbers, 1\nhow to price landscaping jobs"}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  One per line; slug and priority optional. Duplicates are
                  skipped.
                </p>
                <Button type="submit" size="sm">
                  Import
                </Button>
              </div>
            </form>
          </details>

          {"error" in queue ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              SEO tables not found
            </CardTitle>
            <CardDescription>{queue.error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apply the plugin migration with <code>npm run db:migrate</code>.
          </CardContent>
        </Card>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            The queue is empty — import keywords above to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword / article</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row) => (
                <TableRow key={row.keywordId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground/90">
                        {row.articleTitle ?? row.keyword}
                      </span>
                      {row.publicUrl ? (
                        <a
                          href={row.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-sky-400 hover:text-sky-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {row.keyword}
                      {row.publishedAt
                        ? ` · published ${new Date(row.publishedAt).toLocaleDateString()}`
                        : ""}
                      {row.keywordStatus === "failed" && row.lastError
                        ? ` · ${row.lastError}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={row.articleStatus ?? row.keywordStatus}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {row.articleId ? (
                        <Button variant="ghost" size="icon" asChild title="View article">
                          <Link href={`/seo?article=${row.articleId}`}>
                            <Eye />
                          </Link>
                        </Button>
                      ) : null}
                      {row.keywordStatus === "pending" ||
                      row.keywordStatus === "failed" ? (
                        <form action={runKeywordAction}>
                          <input
                            type="hidden"
                            name="keywordId"
                            value={row.keywordId}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            title="Run now (generate + publish)"
                          >
                            <Play />
                          </Button>
                        </form>
                      ) : null}
                      {row.articleStatus === "published" && row.articleId ? (
                        <form action={unpublishAction}>
                          <input
                            type="hidden"
                            name="articleId"
                            value={row.articleId}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            title="Unpublish (revert to draft)"
                          >
                            <Undo2 />
                          </Button>
                        </form>
                      ) : null}
                      <form action={deleteKeywordAction}>
                        <input
                          type="hidden"
                          name="keywordId"
                          value={row.keywordId}
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          title="Remove from queue (does not touch the CMS)"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
          )}
        </>
      ) : null}

      {tab === "playbook" && playbooks ? (
        <PlaybookStudio
          stages={PLAYBOOK_STAGES}
          defaults={DEFAULT_PLAYBOOKS}
          initial={playbooks}
          overridden={[...playbookOverrides]}
          initialStage={query.playbook}
        />
      ) : null}

      {openArticle ? <ArticlePanel article={openArticle} /> : null}
    </div>
  );
}

function formatCompact(value: number): string {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

// The plugin funnel: what the system produced (published) and what Google
// did with it (indexed → impressions → clicks), trailing 28 days.
function MetricsStrip({ metrics }: { metrics: SeoMetrics }) {
  const cards: { label: string; value: string; hint?: string }[] = [
    {
      label: "Posts published",
      value: formatCompact(metrics.publishedPosts),
      hint: "all time",
    },
    {
      label: "Indexed",
      value: formatCompact(metrics.indexedPosts),
      hint: "of published · impressions > 0, 28d",
    },
    {
      label: "Impressions",
      value: formatCompact(metrics.postImpressions),
      hint: "our posts · 28d",
    },
    {
      label: "Clicks",
      value: formatCompact(metrics.postClicks),
      hint: "our posts · 28d",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                {card.value}
              </p>
              {card.hint ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {card.hint}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {metrics.site ? (
        <p className="text-xs text-muted-foreground">
          Site-wide (Search Console, 28d): {formatCompact(metrics.site.pages)}{" "}
          pages with impressions · {formatCompact(metrics.site.impressions)}{" "}
          impressions · {formatCompact(metrics.site.clicks)} clicks
        </p>
      ) : null}
    </div>
  );
}

function Banner({ tone, message }: { tone: "notice" | "error"; message: string }) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          : "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
      }
    >
      {message}
    </div>
  );
}

// Server-rendered slide-over (no client JS): /seo?article=<id> renders the
// panel, the backdrop and the X are plain links back to /seo.
function ArticlePanel({ article }: { article: ArticleView }) {
  const html = article.markdown ? markdownToHtml(article.markdown) : null;

  return (
    <>
      <Link
        href="/seo"
        aria-label="Close"
        className="fixed inset-0 z-40 bg-black/60"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {article.title ?? article.slug}
              </h2>
              <StatusBadge status={article.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              /{article.slug}
              {article.cms ? ` · ${article.cms}` : ""}
              {article.publishedAt
                ? ` · published ${new Date(article.publishedAt).toLocaleString()}`
                : ""}
            </p>
            {article.metaDescription ? (
              <p className="mt-2 text-sm italic text-muted-foreground">
                {article.metaDescription}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {article.status === "published" ? (
              <form action={unpublishAction}>
                <input type="hidden" name="articleId" value={article.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  title="Unpublish (revert to draft)"
                >
                  <Undo2 />
                  Unpublish
                </Button>
              </form>
            ) : null}
            <Button variant="ghost" size="icon" asChild title="Close">
              <Link href="/seo">
                <X />
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {article.publicUrl ? (
            <a
              href={article.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-sky-400 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {article.publicUrl}
            </a>
          ) : null}
          {html ? (
            <div
              className="[&_a]:text-sky-400 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_li]:text-sm [&_li]:text-foreground/80 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-foreground/80 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No article body stored for this row.
            </p>
          )}
          {article.markdown ? (
            <details className="mt-6 rounded-md border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                Raw markdown
              </summary>
              <pre className="overflow-x-auto border-t px-3 py-3 text-xs text-muted-foreground">
                {article.markdown}
              </pre>
            </details>
          ) : null}
        </div>
      </aside>
    </>
  );
}
