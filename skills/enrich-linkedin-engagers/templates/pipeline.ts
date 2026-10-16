import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./config";
import type { EngagerPersonInput } from "./linkedin-engagers";
import {
  applyVerificationResults,
  findWaitingEngagerRun,
  finishEngagerRun,
  insertEngagerRun,
  listEngagers,
  replaceEngagers,
} from "./linkedin-engagers";

// Copy to packages/core/src/linkedin-engagers-pipeline.ts.
//
// npm runs job scripts with cwd = packages/jobs. Resolve repo files from
// projectRoot(), which walks up to graphed.yaml.

const POSTS_TOOL = "apify:apimaestro~linkedin-profile-posts";
const COMMENTS_TOOL =
  "apify:apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies";
const REACTIONS_TOOL = "apify:apimaestro~linkedin-post-reactions";
const APOLLO_BATCH = 10;
const DAILY_POSTS_FETCH = 20;
const HOUR_MS = 60 * 60 * 1000;

export interface ToolRunOptions {
  timeoutSeconds?: number;
}

export interface ToolRunStatus {
  id: string;
  status: string;
  statusMessage?: string | null;
  resultUrl?: string | null;
}

/** What the job uses to call Graphed Tools. Tests pass a fake. */
export interface ToolRunner {
  run<T = unknown>(
    tool: string,
    input: object,
    options?: ToolRunOptions,
  ): Promise<T>;
  get(runId: string): Promise<ToolRunStatus>;
  downloadText(runId: string): Promise<string>;
}

export interface EngagerRunSummary {
  runId: number;
  slug: string;
  status: "running" | "waiting" | "succeeded" | "failed";
  engagers: number;
  emails: number;
  verified: number;
  excluded: number;
  notFound: number;
  skippedUrn: number;
  lastError?: string;
}

export interface EngagerJobResult {
  resumed: boolean;
  stillWaiting?: boolean;
  runs: EngagerRunSummary[];
}

export interface ScrapedPost {
  activityId: string;
  postUrl: string;
  postedAt: string | null;
  groupPost: boolean;
}

export function influencersFile(from: string = process.cwd()): string {
  return join(projectRoot(from), "linkedin-engagers", "influencers.txt");
}

export function excludeEmailsFile(from: string = process.cwd()): string {
  return join(projectRoot(from), "linkedin-engagers", "exclude-emails.txt");
}

export function isUrnUrl(linkedinUrl: string | null | undefined): boolean {
  return Boolean(linkedinUrl && linkedinUrl.toLowerCase().includes("/in/aco"));
}

export function isDeliverable(result: string | null | undefined): boolean {
  return result === "ok" || result === "catch_all";
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "GraphedTimeoutError" || /timed out/i.test(error.message)
  );
}

export function canonicalLinkedinUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export function parseInfluencerLine(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return (match?.[1] ?? trimmed).replace(/\/$/, "");
}

export function readNameList(filePath: string): string[] {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(parseInfluencerLine)
    .filter((line) => line.length > 0);
}

export function isPostInDailyWindow(
  postedAt: string | null,
  now: Date,
): boolean {
  if (!postedAt) return false;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return false;
  const ageMs = now.getTime() - posted.getTime();
  return ageMs >= 24 * HOUR_MS && ageMs < 72 * HOUR_MS;
}

export function activityIdFromText(value: string): string | null {
  const urn = value.match(/urn:li:activity:(\d+)/);
  if (urn?.[1]) return urn[1];
  const dashed = value.match(/activity-(\d+)/);
  if (dashed?.[1]) return dashed[1];
  return null;
}

export function extractPosts(body: unknown): ScrapedPost[] {
  const posts: ScrapedPost[] = [];
  for (const row of asRows(body)) {
    const url = readString(row.url) ?? "";
    const urnText =
      typeof row.urn === "object" && row.urn
        ? readString((row.urn as Record<string, unknown>).activity_urn)
        : readString(row.urn);
    const activityId = activityIdFromText(urnText ?? "") ?? activityIdFromText(url);
    if (!activityId) continue;
    const postedAt = readPostedAt(row);
    posts.push({
      activityId,
      postUrl: url || `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`,
      postedAt,
      groupPost: url.includes("groupPost"),
    });
  }
  return posts;
}

export function selectDailyPosts(posts: ScrapedPost[], now: Date): ScrapedPost[] {
  return posts.filter(
    (post) => !post.groupPost && isPostInDailyWindow(post.postedAt, now),
  );
}

export function dedupeEngagers(
  people: EngagerPersonInput[],
): EngagerPersonInput[] {
  const byUrl = new Map<string, EngagerPersonInput>();
  for (const person of people) {
    if (!person.linkedinUrl?.trim()) continue;
    const key = canonicalLinkedinUrl(person.linkedinUrl);
    const previous = byUrl.get(key);
    if (!previous) {
      byUrl.set(key, person);
      continue;
    }
    if (
      previous.engagementType === "reaction" &&
      person.engagementType === "comment"
    ) {
      byUrl.set(key, { ...person, linkedinUrl: person.linkedinUrl });
    }
  }
  return [...byUrl.values()];
}

/** URN profiles stay on the run but are not sent to Apollo or MillionVerifier. */
export function markUrnSkips(people: EngagerPersonInput[]): EngagerPersonInput[] {
  return people.map((person) =>
    isUrnUrl(person.linkedinUrl)
      ? { ...person, excludedReason: person.excludedReason ?? "skipped_urn" }
      : person,
  );
}

export function markExclusions(
  people: EngagerPersonInput[],
  emails: ReadonlySet<string>,
): EngagerPersonInput[] {
  return people.map((person) => {
    const email = person.email?.trim().toLowerCase();
    if (!email || !emails.has(email) || person.excludedReason === "skipped_urn") {
      return person;
    }
    return { ...person, excludedReason: person.excludedReason ?? "crm" };
  });
}

export function countEngagers(people: EngagerPersonInput[]): {
  engagers: number;
  emails: number;
  verified: number;
  excluded: number;
  notFound: number;
  skippedUrn: number;
} {
  return {
    engagers: people.length,
    emails: people.filter((person) => Boolean(person.email)).length,
    verified: people.filter(
      (person) =>
        isDeliverable(person.verificationResult) &&
        person.excludedReason !== "crm",
    ).length,
    excluded: people.filter((person) => person.excludedReason === "crm").length,
    notFound: people.filter(
      (person) =>
        !person.email &&
        person.excludedReason !== "crm" &&
        person.excludedReason !== "skipped_urn",
    ).length,
    skippedUrn: people.filter((person) => person.excludedReason === "skipped_urn")
      .length,
  };
}

export function alignBulkMatches(
  urls: string[],
  body: unknown,
): { linkedinUrl: string; person: Record<string, unknown> | null }[] {
  const root =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const matches = (
    Array.isArray(root.matches)
      ? root.matches
      : Array.isArray(nested?.matches)
        ? nested.matches
        : []
  ) as Array<Record<string, unknown> | null>;
  return urls.map((linkedinUrl, index) => ({
    linkedinUrl,
    person: matches[index] ?? null,
  }));
}

export function parseVerifierCsv(
  text: string,
): { email: string; result: string }[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const key of ["csv", "report", "result", "text"]) {
        if (typeof parsed[key] === "string") {
          return parseVerifierCsv(parsed[key]);
        }
      }
    } catch {
      // Not JSON. Fall through to CSV.
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0] ?? "").map((cell) =>
    cell.trim().toLowerCase(),
  );
  const emailIndex = headers.findIndex(
    (header) => header === "email" || header === "email_address",
  );
  const resultIndex = headers.findIndex(
    (header) => header === "result" || header === "status",
  );
  if (emailIndex < 0) return [];
  const rows: { email: string; result: string }[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const email = cells[emailIndex]?.trim();
    if (!email) continue;
    const result = cells[resultIndex]?.trim().toLowerCase() || "unknown";
    rows.push({ email, result });
  }
  return rows;
}

export async function runLinkedinEngagersJob(options: {
  tools: ToolRunner;
  influencersPath: string;
  excludeEmailsPath?: string;
  now?: Date;
}): Promise<EngagerJobResult> {
  const now = options.now ?? new Date();
  const waiting = await findWaitingEngagerRun();
  if (waiting) {
    return {
      resumed: true,
      ...(await resumeWaitingRun(options.tools, waiting)),
    };
  }

  const usernames = readNameList(options.influencersPath);
  const excluded = readExcludedEmails(options.excludeEmailsPath);
  const runs: EngagerRunSummary[] = [];
  for (const username of usernames) {
    runs.push(
      await enrichInfluencer({
        tools: options.tools,
        username,
        excluded,
        now,
      }),
    );
  }
  return { resumed: false, runs };
}

export function fixtureToolRunner(now = new Date()): ToolRunner {
  const hoursAgo = (hours: number) =>
    new Date(now.getTime() - hours * HOUR_MS).toISOString();
  return {
    async run<T>(tool: string, input: object): Promise<T> {
      const record = input as Record<string, unknown>;
      if (tool === POSTS_TOOL) {
        return [
          post("1001", hoursAgo(36), false),
          post("1002", hoursAgo(2), false),
          post("1003", hoursAgo(100), false),
          post("1004", hoursAgo(36), true),
        ] as T;
      }
      if (tool === COMMENTS_TOOL) {
        const ids = Array.isArray(record.postIds) ? record.postIds : [];
        if (!ids.includes("1001")) return [] as T;
        return [
          {
            summary: { totalComments: 1 },
          },
          {
            text: "Useful writeup",
            author: {
              profile_url: "https://www.linkedin.com/in/ada-fixture",
              name: "Ada Fixture",
              headline: "Engineer",
            },
          },
          { text: "no profile" },
        ] as T;
      }
      if (tool === REACTIONS_TOOL) {
        const page = Number(record.page_number ?? 1);
        const ids = Array.isArray(record.post_urls) ? record.post_urls : [];
        if (!ids.includes("1001") || page > 1) return [] as T;
        return [
          reaction("https://www.linkedin.com/in/ada-fixture", "Ada Fixture", "Engineer"),
          reaction(
            "https://www.linkedin.com/in/ACoFIXTUREURN",
            "Urn Fixture",
            "Hidden",
          ),
          reaction(
            "https://www.linkedin.com/in/grace-fixture",
            "Grace Fixture",
            "Operator",
          ),
        ] as T;
      }
      if (tool === "apollo:people.bulk_match") {
        const details = Array.isArray(record.details) ? record.details : [];
        return {
          matches: details.map((detail) => {
            const url = String(
              (detail as { linkedinUrl?: string }).linkedinUrl ?? "",
            );
            if (!url.includes("ada-fixture")) return null;
            return {
              email: "ada.fixture@example.com",
              email_status: "verified",
              organization: { name: "Fixture Labs" },
              country: "US",
            };
          }),
        } as T;
      }
      if (tool === "apollo:people.email") {
        return { person: { email: null } } as T;
      }
      if (tool === "million-verifier:validate") {
        const email = String(record.email ?? "");
        return {
          email,
          result: email === "ada.fixture@example.com" ? "ok" : "invalid",
        } as T;
      }
      throw new Error(`fixture has no tool ${tool}`);
    },
    async get(runId: string): Promise<ToolRunStatus> {
      if (runId !== "trn_selfcheck") {
        return { id: runId, status: "pending", resultUrl: null };
      }
      return {
        id: runId,
        status: "ready",
        resultUrl: "fixture://trn_selfcheck",
      };
    },
    async downloadText(runId: string): Promise<string> {
      if (runId !== "trn_selfcheck") {
        throw new Error(`fixture has no report for ${runId}`);
      }
      return "email,result\nada.fixture@example.com,ok\n";
    },
  };
}

async function resumeWaitingRun(
  tools: ToolRunner,
  waiting: { id: number; slug: string; millionverifierRunId: string },
): Promise<Pick<EngagerJobResult, "stillWaiting" | "runs">> {
  const status = await tools.get(waiting.millionverifierRunId);
  if (status.status !== "ready" && status.status !== "failed") {
    console.log(
      JSON.stringify({
        resume: true,
        stillWaiting: true,
        runId: waiting.id,
        millionverifierRunId: waiting.millionverifierRunId,
      }),
    );
    return {
      stillWaiting: true,
      runs: [
        {
          runId: waiting.id,
          slug: waiting.slug,
          status: "waiting",
          engagers: 0,
          emails: 0,
          verified: 0,
          excluded: 0,
          notFound: 0,
          skippedUrn: 0,
        },
      ],
    };
  }
  if (status.status === "failed") {
    const lastError = status.statusMessage || "MillionVerifier run failed";
    await finishEngagerRun(waiting.id, { status: "failed", lastError });
    return {
      runs: [
        emptySummary(waiting.id, waiting.slug, "failed", lastError),
      ],
    };
  }
  const csv = await tools.downloadText(waiting.millionverifierRunId);
  await applyVerificationResults(waiting.id, parseVerifierCsv(csv));
  const people = await listEngagers(waiting.id);
  const counts = countEngagers(people);
  await finishEngagerRun(waiting.id, {
    status: "succeeded",
    ...counts,
    millionverifierRunId: waiting.millionverifierRunId,
  });
  console.log(
    JSON.stringify({ resume: true, runId: waiting.id, ...counts }),
  );
  return {
    runs: [
      {
        runId: waiting.id,
        slug: waiting.slug,
        status: "succeeded",
        ...counts,
      },
    ],
  };
}

async function enrichInfluencer(options: {
  tools: ToolRunner;
  username: string;
  excluded: Set<string>;
  now: Date;
}): Promise<EngagerRunSummary> {
  const sourceUrl = `https://www.linkedin.com/in/${options.username}`;
  const slug = await insertUniqueSlug({
    sourceUrl,
    sourceKind: "profile",
    slug: `${slugPart(options.username)}-${options.now.toISOString().slice(0, 10)}`,
    crmEnabled: options.excluded.size > 0,
    crmSystem: options.excluded.size > 0 ? "exclude-file" : null,
  });
  try {
    const postsBody = await options.tools.run(
      POSTS_TOOL,
      { username: options.username, total_posts: DAILY_POSTS_FETCH },
      { timeoutSeconds: 120 },
    );
    const posts = selectDailyPosts(extractPosts(postsBody), options.now);
    const scraped: EngagerPersonInput[] = [];
    for (const post of posts) {
      scraped.push(
        ...(await scrapePost(options.tools, post.activityId, post.postUrl)),
      );
    }
    let people = markUrnSkips(dedupeEngagers(scraped));
    await attachEmails(
      people.filter((person) => !person.excludedReason),
      options.tools,
    );
    people = markExclusions(people, options.excluded);
    await replaceEngagers(slug.id, people);
    await verifyEmails(people, options.tools);
    await replaceEngagers(slug.id, people);
    const counts = countEngagers(people);
    await finishEngagerRun(slug.id, { status: "succeeded", ...counts });
    console.log(JSON.stringify({ influencer: options.username, runId: slug.id, ...counts }));
    return { runId: slug.id, slug: slug.slug, status: "succeeded", ...counts };
  } catch (error) {
    const lastError = error instanceof Error ? error.message : String(error);
    await finishEngagerRun(slug.id, {
      status: "failed",
      lastError: lastError.slice(0, 500),
    });
    console.error(
      JSON.stringify({
        influencer: options.username,
        runId: slug.id,
        failed: lastError,
      }),
    );
    return emptySummary(slug.id, slug.slug, "failed", lastError.slice(0, 500));
  }
}

async function scrapePost(
  tools: ToolRunner,
  activityId: string,
  postUrl: string,
): Promise<EngagerPersonInput[]> {
  const commentsBody = await tools.run(
    COMMENTS_TOOL,
    { postIds: [activityId], limit: 100, sortOrder: "most recent" },
    { timeoutSeconds: 120 },
  );
  const people = asRows(commentsBody)
    .map((row) => normalizeComment(row, postUrl))
    .filter((person): person is EngagerPersonInput => person !== null);

  const reactions: EngagerPersonInput[] = [];
  for (let page = 1; page <= 3; page += 1) {
    let body: unknown;
    try {
      body = await tools.run(
        REACTIONS_TOOL,
        { post_urls: [activityId], page_number: page, limit: 100 },
        { timeoutSeconds: 240 },
      );
    } catch (error) {
      if (!isTimeoutError(error)) throw error;
      console.warn(
        `reactions timed out on page ${page} for ${activityId}; keeping ${reactions.length}`,
      );
      break;
    }
    const rows = asRows(body)
      .map((row) => normalizeReaction(row, postUrl))
      .filter((person): person is EngagerPersonInput => person !== null);
    if (rows.length === 0) break;
    reactions.push(...rows);
  }
  return [...people, ...reactions];
}

async function attachEmails(
  people: EngagerPersonInput[],
  tools: ToolRunner,
): Promise<void> {
  for (let index = 0; index < people.length; index += APOLLO_BATCH) {
    const batch = people.slice(index, index + APOLLO_BATCH);
    const body = await tools.run("apollo:people.bulk_match", {
      details: batch.map((person) => ({ linkedinUrl: person.linkedinUrl })),
    });
    const matches = alignBulkMatches(
      batch.map((person) => person.linkedinUrl),
      body,
    );
    for (let offset = 0; offset < batch.length; offset += 1) {
      const person = batch[offset];
      if (!person) continue;
      let extracted = extractApolloEmail(matches[offset]?.person ?? null);
      if (!extracted.email) {
        const revealed = await tools.run("apollo:people.email", {
          linkedinUrl: person.linkedinUrl,
        });
        extracted = extractApolloEmail(unwrapPerson(revealed));
      }
      person.email = extracted.email;
      person.emailStatus = extracted.email ? extracted.emailStatus : "not_found";
      person.company = person.company ?? extracted.company;
      person.country = person.country ?? extracted.country;
    }
  }
}

async function verifyEmails(
  people: EngagerPersonInput[],
  tools: ToolRunner,
): Promise<void> {
  for (const person of people) {
    if (!person.email || person.excludedReason) continue;
    const body = await tools.run(
      "million-verifier:validate",
      { email: person.email, timeout: 20 },
      { timeoutSeconds: 60 },
    );
    person.verificationResult = readVerifierResult(body);
  }
}

async function insertUniqueSlug(input: {
  sourceUrl: string;
  sourceKind: "post" | "profile";
  slug: string;
  crmEnabled: boolean;
  crmSystem: string | null;
}): Promise<{ id: number; slug: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? input.slug : `${input.slug}-${attempt + 1}`;
    try {
      const id = await insertEngagerRun({ ...input, slug });
      return { id, slug };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(`Could not allocate a slug for ${input.slug}`);
}

function readExcludedEmails(filePath: string | undefined): Set<string> {
  if (!filePath || !existsSync(filePath)) return new Set();
  return new Set(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );
}

function normalizeComment(
  row: Record<string, unknown>,
  postUrl: string,
): EngagerPersonInput | null {
  const author =
    row.author && typeof row.author === "object"
      ? (row.author as Record<string, unknown>)
      : null;
  const linkedinUrl = readString(author?.profile_url);
  if (!linkedinUrl) return null;
  return {
    linkedinUrl,
    fullName: readString(author?.name),
    title: readString(author?.headline),
    commentText: readString(row.text),
    engagementType: "comment",
    sourcePostUrl: postUrl,
  };
}

function normalizeReaction(
  row: Record<string, unknown>,
  postUrl: string,
): EngagerPersonInput | null {
  const reactor =
    row.reactor && typeof row.reactor === "object"
      ? (row.reactor as Record<string, unknown>)
      : null;
  const linkedinUrl = readString(reactor?.profile_url);
  if (!linkedinUrl) return null;
  return {
    linkedinUrl,
    fullName: readString(reactor?.name),
    title: readString(reactor?.headline),
    commentText: null,
    engagementType: "reaction",
    sourcePostUrl: postUrl,
  };
}

function extractApolloEmail(person: Record<string, unknown> | null): {
  email: string | null;
  emailStatus: string | null;
  company: string | null;
  country: string | null;
} {
  if (!person) {
    return { email: null, emailStatus: null, company: null, country: null };
  }
  const personal = Array.isArray(person.personal_emails)
    ? person.personal_emails
    : [];
  const personalEmail = personal
    .map((entry) =>
      entry && typeof entry === "object"
        ? readString((entry as Record<string, unknown>).email)
        : null,
    )
    .find((email): email is string => Boolean(email));
  const email = readString(person.email) ?? personalEmail ?? null;
  const organization =
    person.organization && typeof person.organization === "object"
      ? (person.organization as Record<string, unknown>)
      : null;
  return {
    email,
    emailStatus: email ? readString(person.email_status) ?? "unknown" : null,
    company: readString(organization?.name),
    country: readString(person.country),
  };
}

function unwrapPerson(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.person && typeof record.person === "object") {
    return record.person as Record<string, unknown>;
  }
  return record;
}

function readVerifierResult(body: unknown): string {
  const record = unwrapPerson(body);
  const result = record ? readString(record.result) : null;
  return result ? result.toLowerCase() : "unknown";
}

function asRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !isSummaryRow(row),
    );
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["comments", "items", "data", "results"]) {
      if (Array.isArray(record[key])) return asRows(record[key]);
    }
  }
  return [];
}

function isSummaryRow(row: object): boolean {
  const record = row as Record<string, unknown>;
  return "summary" in record && !("author" in record) && !("reactor" in record);
}

function readPostedAt(row: Record<string, unknown>): string | null {
  const posted = row.posted_at ?? row.postedAt;
  if (typeof posted === "string") return posted;
  if (posted && typeof posted === "object") {
    return readString((posted as Record<string, unknown>).date);
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function slugPart(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 48) || "profile";
}

function isUniqueViolation(error: unknown): boolean {
  const candidates = [error, error instanceof Error ? error.cause : null];
  return candidates.some((candidate) => {
    if (candidate === null || typeof candidate !== "object") return false;
    return (
      "code" in candidate && (candidate as { code?: string }).code === "23505"
    );
  });
}

function post(activityId: string, postedAt: string, groupPost: boolean) {
  return {
    urn: `urn:li:activity:${activityId}`,
    url: groupPost
      ? `https://www.linkedin.com/feed/update/urn:li:groupPost:${activityId}/`
      : `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`,
    text: "Fixture post",
    posted_at: { date: postedAt },
  };
}

function reaction(profileUrl: string, name: string, headline: string) {
  return {
    reaction_type: "LIKE",
    reactor: { profile_url: profileUrl, name, headline },
  };
}

function emptySummary(
  runId: number,
  slug: string,
  status: EngagerRunSummary["status"],
  lastError?: string,
): EngagerRunSummary {
  return {
    runId,
    slug,
    status,
    engagers: 0,
    emails: 0,
    verified: 0,
    excluded: 0,
    notFound: 0,
    skippedUrn: 0,
    ...(lastError ? { lastError } : {}),
  };
}
