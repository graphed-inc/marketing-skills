import { getDb } from "./db/index";
import type { LinkedinEngagerRunStatus } from "./db/types";

// Copy to packages/core/src/linkedin-engagers.ts. Jobs call getDb() from
// @app/core — never a second pool.

export interface EngagerRunInput {
  sourceUrl: string;
  sourceKind: "post" | "profile";
  slug: string;
  crmEnabled: boolean;
  crmSystem?: string | null;
}

export interface EngagerPersonInput {
  fullName?: string | null;
  title?: string | null;
  company?: string | null;
  country?: string | null;
  linkedinUrl: string;
  engagementType: "comment" | "reaction";
  commentText?: string | null;
  sourcePostUrl?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  verificationResult?: string | null;
  excludedReason?: string | null;
}

export interface EngagerRunPatch {
  status: LinkedinEngagerRunStatus;
  engagers?: number;
  emails?: number;
  verified?: number;
  excluded?: number;
  notFound?: number;
  skippedUrn?: number;
  millionverifierRunId?: string | null;
  lastError?: string | null;
}

export async function insertEngagerRun(
  input: EngagerRunInput,
): Promise<number> {
  const row = await getDb()
    .insertInto("linkedin_engager_runs")
    .values({
      source_url: input.sourceUrl,
      source_kind: input.sourceKind,
      slug: input.slug,
      crm_enabled: input.crmEnabled,
      crm_system: input.crmSystem ?? null,
      status: "running",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return Number(row.id);
}

/**
 * Replaces every person on a run. Delete and insert commit together: a failed
 * insert rolls the delete back, so a bad save cannot leave the run empty.
 */
export async function replaceEngagers(
  runId: number,
  people: EngagerPersonInput[],
): Promise<void> {
  await getDb()
    .transaction()
    .execute(async (trx) => {
      await trx
        .deleteFrom("linkedin_engagers")
        .where("run_id", "=", runId)
        .execute();
      if (people.length === 0) return;
      await trx
        .insertInto("linkedin_engagers")
        .values(
          people.map((person) => ({
            run_id: runId,
            full_name: person.fullName ?? null,
            title: person.title ?? null,
            company: person.company ?? null,
            country: person.country ?? null,
            linkedin_url: person.linkedinUrl,
            engagement_type: person.engagementType,
            comment_text: person.commentText ?? null,
            source_post_url: person.sourcePostUrl ?? null,
            email: person.email ?? null,
            email_status: person.emailStatus ?? null,
            verification_result: person.verificationResult ?? null,
            excluded_reason: person.excludedReason ?? null,
          })),
        )
        .execute();
    });
}

export async function finishEngagerRun(
  runId: number,
  patch: EngagerRunPatch,
): Promise<void> {
  await getDb()
    .updateTable("linkedin_engager_runs")
    .set({
      status: patch.status,
      ...(patch.engagers === undefined ? {} : { engagers: patch.engagers }),
      ...(patch.emails === undefined ? {} : { emails: patch.emails }),
      ...(patch.verified === undefined ? {} : { verified: patch.verified }),
      ...(patch.excluded === undefined ? {} : { excluded: patch.excluded }),
      ...(patch.notFound === undefined ? {} : { not_found: patch.notFound }),
      ...(patch.skippedUrn === undefined
        ? {}
        : { skipped_urn: patch.skippedUrn }),
      ...(patch.millionverifierRunId === undefined
        ? {}
        : { millionverifier_run_id: patch.millionverifierRunId }),
      last_error: patch.lastError ?? null,
      finished_at: patch.status === "waiting" ? null : new Date(),
    })
    .where("id", "=", runId)
    .execute();
}

/** Newest run that still needs a MillionVerifier download. Resume this before paying for another scrape. */
export async function findWaitingEngagerRun(): Promise<{
  id: number;
  slug: string;
  sourceUrl: string;
  millionverifierRunId: string;
} | null> {
  const row = await getDb()
    .selectFrom("linkedin_engager_runs")
    .select(["id", "slug", "source_url", "millionverifier_run_id"])
    .where("status", "=", "waiting")
    .where("millionverifier_run_id", "is not", null)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();
  if (!row?.millionverifier_run_id) return null;
  return {
    id: Number(row.id),
    slug: row.slug,
    sourceUrl: row.source_url,
    millionverifierRunId: row.millionverifier_run_id,
  };
}

export async function listEngagers(
  runId: number,
): Promise<EngagerPersonInput[]> {
  const rows = await getDb()
    .selectFrom("linkedin_engagers")
    .selectAll()
    .where("run_id", "=", runId)
    .orderBy("id", "asc")
    .execute();
  return rows.map((row) => ({
    fullName: row.full_name,
    title: row.title,
    company: row.company,
    country: row.country,
    linkedinUrl: row.linkedin_url,
    engagementType: row.engagement_type === "comment" ? "comment" : "reaction",
    commentText: row.comment_text,
    sourcePostUrl: row.source_post_url,
    email: row.email,
    emailStatus: row.email_status,
    verificationResult: row.verification_result,
    excludedReason: row.excluded_reason,
  }));
}

export async function applyVerificationResults(
  runId: number,
  results: { email: string; result: string }[],
): Promise<void> {
  if (results.length === 0) return;
  await getDb()
    .transaction()
    .execute(async (trx) => {
      const rows = await trx
        .selectFrom("linkedin_engagers")
        .select(["id", "email"])
        .where("run_id", "=", runId)
        .execute();
      const byEmail = new Map<string, number>();
      for (const row of rows) {
        if (!row.email) continue;
        byEmail.set(row.email.trim().toLowerCase(), Number(row.id));
      }
      for (const result of results) {
        const id = byEmail.get(result.email.trim().toLowerCase());
        if (id === undefined) continue;
        await trx
          .updateTable("linkedin_engagers")
          .set({ verification_result: result.result })
          .where("id", "=", id)
          .execute();
      }
    });
}
