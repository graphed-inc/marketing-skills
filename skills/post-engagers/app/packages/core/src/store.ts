import { createHash } from "node:crypto";
import { pool, withTx, type SqlClient } from "./db/sql";

export const PROFILE_BATCH = 25;
export { pool, withTx };

export let instanceId = "";

export function setInstanceId(id: string): void {
  instanceId = id;
}

export function profileBatchKey(ids: string[]): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 12)}-${day}`;
}

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export interface EngagerRow {
  urn: string;
  name?: string;
  headline?: string;
  profileUrl?: string;
  reactionType?: string;
  comment?: string;
  commentUrl?: string;
}

export interface JobRow {
  id: number;
  post_url: string;
  post_id: string;
  status: string;
  stage: string;
  error: string | null;
  engagements: number;
  unique_people: number;
  profiles: number;
  emails: number;
  total_reactions: number | null;
  total_comments: number | null;
  max_profiles: number;
  credits: string | number;
  created_at: string | Date;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  attempt: number;
  reactions_page: number;
  comments_page: number;
  tracked_id: number | null;
  source: string;
  new_people: number;
  verified: number;
}

// Upsert engagers for a job. Commenters overwrite reactor-only rows' comment fields, never the reverse.
// Pass a client to join the caller's transaction. A comment already stored as its own segment is not appended again.
// Segments are split on a newline, "---", and a newline, so a shorter prefix ("Great post") is not "Great post, thanks".
export async function addEngagers(jobId: number, rows: EngagerRow[], kind: "reaction" | "comment", client: SqlClient | null = null): Promise<void> {
  if (!rows.length) return;
  const run = async (c: SqlClient) => {
    for (const r of rows) {
      await c.query(
        `INSERT INTO people (urn, name, headline, profile_url, first_job_id) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (urn) DO UPDATE SET
           name = COALESCE(NULLIF(people.name,''), EXCLUDED.name),
           headline = COALESCE(NULLIF(people.headline,''), EXCLUDED.headline),
           profile_url = CASE WHEN people.profile_url LIKE '%/in/ACoA%' AND EXCLUDED.profile_url NOT LIKE '%/in/ACoA%'
                              THEN EXCLUDED.profile_url ELSE people.profile_url END,
           updated_at = now()`,
        [r.urn, r.name ?? "", r.headline ?? "", r.profileUrl ?? "", jobId],
      );
      if (kind === "reaction") {
        await c.query(
          `INSERT INTO job_people (job_id, urn, reacted, reaction_type) VALUES ($1,$2,true,$3)
           ON CONFLICT (job_id, urn) DO UPDATE SET reacted = true, reaction_type = EXCLUDED.reaction_type`,
          [jobId, r.urn, r.reactionType ?? null],
        );
      } else {
        await c.query(
          `INSERT INTO job_people (job_id, urn, commented, comment, comment_url) VALUES ($1,$2,true,$3,$4)
           ON CONFLICT (job_id, urn) DO UPDATE SET commented = true,
             comment = CASE
               WHEN job_people.comment IS NULL OR job_people.comment = '' THEN EXCLUDED.comment
               WHEN job_people.comment = EXCLUDED.comment
                 OR position(
                   E'\\n---\\n' || EXCLUDED.comment || E'\\n---\\n'
                   IN E'\\n---\\n' || job_people.comment || E'\\n---\\n'
                 ) > 0
                 THEN job_people.comment
               ELSE job_people.comment || E'\\n---\\n' || EXCLUDED.comment
             END,
             comment_url = COALESCE(job_people.comment_url, EXCLUDED.comment_url)`,
          [jobId, r.urn, r.comment ?? "", r.commentUrl ?? ""],
        );
      }
    }
  };
  if (client) await run(client);
  else await withTx(run);
}

// Commit one scrape page's rows, counts, and credits together. A repeated page
// (restart that lost its place) does not add engagements or credits again.
export async function saveScrapePage(jobId: number, page: {
  kind: "reaction" | "comment";
  rows: EngagerRow[];
  raw: number;
  credits: number;
  page: number;
  total: number | null;
}): Promise<void> {
  const pageCol = page.kind === "reaction" ? "reactions_page" : "comments_page";
  const totalCol = page.kind === "reaction" ? "total_reactions" : "total_comments";
  await withTx(async (c) => {
    await addEngagers(jobId, page.rows, page.kind, c);
    await c.query(
      `UPDATE jobs SET
         engagements = CASE WHEN $5 > ${pageCol} THEN engagements + $2 ELSE engagements END,
         credits = CASE WHEN $5 > ${pageCol} THEN credits + $3 ELSE credits END,
         ${totalCol} = COALESCE($4, ${totalCol}),
         ${pageCol} = GREATEST(${pageCol}, $5),
         heartbeat_at = now()
       WHERE id = $1`,
      [jobId, page.raw, page.credits, page.total, page.page],
    );
  });
}

export async function insertManualJob(url: string, postId: string, maxProfiles: number): Promise<JobRow> {
  try {
    const { rows } = await pool.query<JobRow>(
      "INSERT INTO jobs (post_url, post_id, max_profiles) VALUES ($1,$2,$3) RETURNING *",
      [url, postId, maxProfiles],
    );
    return rows[0];
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new HttpError(409, "That post already has a scrape. Open the existing one, or retry it if it failed.");
    }
    throw e;
  }
}

function insertedFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

// One job per post. A live job is attached to the tracked profile. A failed job
// stays failed until someone retries it, so the daily check does not start a
// second scrape and pay for the same reactions and comments again.
// Returns 1 when a new job was inserted.
export async function queueTrackedJob(url: string, postId: string, maxProfiles: number, trackedId: number): Promise<number> {
  const { rows } = await pool.query<{ inserted: unknown }>(
    `WITH live AS (
       UPDATE jobs SET tracked_id = COALESCE(tracked_id, $4)
       WHERE post_id = $2 AND status <> 'failed'
       RETURNING id
     ),
     ins AS (
       INSERT INTO jobs (post_url, post_id, max_profiles, tracked_id, source)
       SELECT $1, $2, $3, $4, 'tracker'
       WHERE NOT EXISTS (SELECT 1 FROM live)
         AND NOT EXISTS (SELECT 1 FROM jobs WHERE post_id = $2)
       ON CONFLICT (post_id) WHERE status <> 'failed'
       DO UPDATE SET tracked_id = COALESCE(jobs.tracked_id, EXCLUDED.tracked_id)
       RETURNING (xmax = 0) AS inserted
     )
     SELECT COALESCE((SELECT inserted FROM ins), false) AS inserted`,
    [url, postId, maxProfiles, trackedId],
  );
  return rows[0] && insertedFlag(rows[0].inserted) ? 1 : 0;
}

// Failed retry starts the saved stage over with a new attempt. Finished retry
// refreshes profiles and emails for the capped set only (commenters first).
// Everyone past the cap keeps the profile and email they already have.
export async function retryJob(id: number): Promise<JobRow | null> {
  return withTx(async (c) => {
    const { rows: locked } = await c.query<JobRow>("SELECT * FROM jobs WHERE id = $1 FOR UPDATE", [id]);
    const j = locked[0];
    if (!j) return null;
    if (j.status === "running") throw new HttpError(409, "Job is still running");
    if (j.status === "done") {
      const { rows: chosen } = await c.query<{ urn: string }>(
        `SELECT jp.urn FROM job_people jp
         WHERE jp.job_id = $1
         ORDER BY jp.commented DESC, jp.urn
         LIMIT $2`,
        [id, j.max_profiles],
      );
      const urns = chosen.map((r) => r.urn);
      await c.query("DELETE FROM profile_batches WHERE job_id = $1", [id]);
      for (let i = 0; i < urns.length; i += PROFILE_BATCH) {
        const ids = urns.slice(i, i + PROFILE_BATCH);
        await c.query(
          `INSERT INTO profile_batches (job_id, batch_key, urns) VALUES ($1, $2, $3)
           ON CONFLICT (job_id, batch_key) DO NOTHING`,
          [id, profileBatchKey(ids), ids],
        );
      }
      if (urns.length) {
        await c.query(
          `UPDATE people SET profiled_at = NULL, enriched_at = NULL, profile_failed_at = NULL, updated_at = now()
           WHERE urn = ANY($1)`,
          [urns],
        );
      }
      const { rows } = await c.query<JobRow>(
        `UPDATE jobs SET status = 'queued', error = NULL, finished_at = NULL,
           attempt = attempt + 1, stage = 'profiles'
         WHERE id = $1 RETURNING *`,
        [id],
      );
      return rows[0];
    }
    const { rows } = await c.query<JobRow>(
      `UPDATE jobs SET status = 'queued', error = NULL, finished_at = NULL, attempt = attempt + 1
       WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0];
  });
}

export async function refreshCounts(jobId: number): Promise<void> {
  await pool.query(
    `UPDATE jobs j SET
       unique_people = s.n, profiles = s.p, emails = s.e, verified = s.v, new_people = s.nw, heartbeat_at = now()
     FROM (SELECT count(*)::int n,
                  count(*) FILTER (WHERE p.profiled_at IS NOT NULL)::int p,
                  count(*) FILTER (WHERE p.email IS NOT NULL AND p.email <> '')::int e,
                  count(*) FILTER (WHERE p.email_verify = 'ok')::int v,
                  count(*) FILTER (WHERE p.first_job_id = $1)::int nw
           FROM job_people jp JOIN people p ON p.urn = jp.urn WHERE jp.job_id = $1) s
     WHERE j.id = $1`,
    [jobId],
  );
}

export async function listPeople(jobId: number | null, { trackedId = null, sinceDays = null }: { trackedId?: number | null; sinceDays?: number | null } = {}): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (jobId) { params.push(jobId); where.push(`jp.job_id = $${params.length}`); }
  if (trackedId) { params.push(trackedId); where.push(`j.tracked_id = $${params.length}`); }
  if (sinceDays) { params.push(sinceDays); where.push(`p.created_at > now() - make_interval(days => $${params.length})`); }
  const { rows } = await pool.query(
    `SELECT p.urn, p.name, p.headline, p.profile_url, p.email, p.email_source, p.email_verify, p.data,
            p.profiled_at, p.enriched_at, p.created_at,
            bool_or(jp.reacted) reacted, max(jp.reaction_type) reaction_type,
            bool_or(jp.commented) commented, string_agg(jp.comment, E'\\n---\\n') comment,
            count(DISTINCT jp.job_id)::int posts, min(j.created_at) first_seen,
            string_agg(DISTINCT j.post_url, ' ') post_urls
     FROM job_people jp JOIN people p ON p.urn = jp.urn JOIN jobs j ON j.id = jp.job_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY p.urn
     ORDER BY (p.email_verify = 'ok') DESC NULLS LAST, (p.email IS NOT NULL AND p.email <> '') DESC, p.created_at DESC`,
    params,
  );
  return rows;
}
