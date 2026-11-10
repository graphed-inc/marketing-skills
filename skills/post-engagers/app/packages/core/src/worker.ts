// Background worker: one job at a time. Stages run in order and the job row records which
// stage is done, so a restart (deploy, crash) resumes where it stopped. Every Graphed Tools call
// carries an idempotency key, so a resumed stage replays finished runs instead of paying again.
// Scrape pages and profile batches commit their rows together with that progress, so a replay
// does not add people, comments, or credits a second time.
//
//   reactions → comments → profiles (harvest) → emails (waterfall + Million Verifier) → done
import { coreEnv, numberEnv } from "./config";
import { pool, refreshCounts, instanceId, saveScrapePage, profileBatchKey, PROFILE_BATCH, withTx, type JobRow } from "./store";
import { graphed, tool, TOOLS, RATES } from "./tools";
import { emailWaterfall, enrichPeople } from "./enrich";
import { parseReactions, reactionsTotal, parseComments, commentsSummary, flattenProfile } from "./parse";

export { RATES, emailWaterfall };

const PAGE = 100;
const MAX_PAGES = 100; // 10k reactions / 10k comments per post
const PARALLEL = 4;

const STAGES = ["queued", "reactions", "comments", "profiles", "emails", "done"];
const after = (job: JobRow, stage: string) => STAGES.indexOf(job.stage) >= STAGES.indexOf(stage);

function refreshDays(): number {
  return numberEnv(coreEnv().PROFILE_REFRESH_DAYS, 30);
}

function harvestEmail(): boolean {
  return emailWaterfall().includes("harvest");
}

const setJob = (id: number, fields: Record<string, unknown>) => {
  const keys = Object.keys(fields);
  return pool.query(
    `UPDATE jobs SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, heartbeat_at = now() WHERE id = $1`,
    [id, ...keys.map((k) => fields[k])],
  );
};
const addCredits = (id: number, n: number) => pool.query("UPDATE jobs SET credits = credits + $2 WHERE id = $1", [id, n]);

async function scrapeReactions(job: JobRow, key: string): Promise<void> {
  for (let page = Number(job.reactions_page || 0) + 1; page <= MAX_PAGES; page++) {
    const items = await tool(TOOLS.reactions, { post_urls: [job.post_url], page_number: page, reaction_type: "ALL", limit: PAGE }, `${key}-r${page}`);
    const rows = parseReactions(items);
    const raw = (items || []).filter((it: { reactor?: unknown }) => it && it.reactor).length;
    const total = reactionsTotal(items);
    await saveScrapePage(job.id, { kind: "reaction", rows, raw, credits: raw * RATES.engagement, page, total });
    job.reactions_page = page;
    await refreshCounts(job.id);
    if (raw < PAGE || (total != null && page * PAGE >= total)) break;
  }
}

async function scrapeComments(job: JobRow, key: string): Promise<void> {
  for (let page = Number(job.comments_page || 0) + 1; page <= MAX_PAGES; page++) {
    const items = await tool(TOOLS.comments, { postIds: [job.post_url], page_number: page, limit: PAGE }, `${key}-c${page}`);
    const rows = parseComments(items);
    const sum = commentsSummary(items);
    await saveScrapePage(job.id, {
      kind: "comment", rows, raw: rows.length, credits: rows.length * RATES.engagement, page,
      total: sum && sum.totalComments != null ? sum.totalComments : null,
    });
    job.comments_page = page;
    await refreshCounts(job.id);
    const got = sum ? Number(sum.commentsExtracted || 0) : rows.filter((r: { isReply?: boolean }) => !r.isReply).length;
    if (got < PAGE) break;
  }
}

export interface ProfileBatch {
  batch_key: string;
  urns: string[];
}

// Fix the batch list before any profile call. A restart keeps that membership and
// replays its result, even if some of the people were already saved.
export async function planProfileBatches(job: Pick<JobRow, "id" | "max_profiles">): Promise<ProfileBatch[]> {
  const days = refreshDays();
  const { rows: freshRows } = await pool.query<{ fresh: number }>(
    `SELECT count(*)::int fresh FROM job_people jp JOIN people p ON p.urn = jp.urn
     WHERE jp.job_id = $1 AND p.profiled_at > now() - make_interval(days => $2)`,
    [job.id, days]);
  const fresh = freshRows[0]?.fresh ?? 0;
  const { rows: heldRows } = await pool.query<{ held: number }>(
    `SELECT count(DISTINCT u)::int held
     FROM profile_batches b
     CROSS JOIN LATERAL unnest(b.urns) AS u
     JOIN people p ON p.urn = u
     WHERE b.job_id = $1 AND NOT b.done
       AND (p.profiled_at IS NULL OR p.profiled_at <= now() - make_interval(days => $2))`,
    [job.id, days]);
  const held = heldRows[0]?.held ?? 0;
  const budget = Math.max(0, job.max_profiles - fresh - held);
  if (budget > 0) {
    const { rows } = await pool.query<{ urn: string }>(
      `SELECT p.urn FROM job_people jp JOIN people p ON p.urn = jp.urn
       WHERE jp.job_id = $1
         AND (p.profiled_at IS NULL OR p.profiled_at <= now() - make_interval(days => $2))
         AND (p.profile_failed_at IS NULL OR p.profile_failed_at <= now() - interval '7 days')
         AND NOT EXISTS (
           SELECT 1 FROM profile_batches b
           WHERE b.job_id = $1 AND NOT b.done AND p.urn = ANY(b.urns)
         )
       ORDER BY jp.commented DESC, p.urn LIMIT $3`,
      [job.id, days, budget]);
    for (let i = 0; i < rows.length; i += PROFILE_BATCH) {
      const ids = rows.slice(i, i + PROFILE_BATCH).map((r) => r.urn);
      await pool.query(
        `INSERT INTO profile_batches (job_id, batch_key, urns) VALUES ($1, $2, $3)
         ON CONFLICT (job_id, batch_key) DO NOTHING`,
        [job.id, profileBatchKey(ids), ids]);
    }
  }
  const { rows } = await pool.query<ProfileBatch>(
    "SELECT batch_key, urns FROM profile_batches WHERE job_id = $1 AND NOT done ORDER BY batch_key",
    [job.id]);
  return rows.map((row) => ({ ...row, urns: asTextArray(row.urns) }));
}

function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value.slice(1, -1).split(",").filter(Boolean);
  }
  return [];
}

// Save every profile in the batch, then mark the batch done and add its credits.
// Either all of that commits, or the batch stays open and the credits are not counted.
export async function applyProfileBatch(jobId: number, batch: ProfileBatch, items: Array<Record<string, unknown>> | null): Promise<void> {
  const ids = asTextArray(batch.urns);
  const rate = harvestEmail() ? RATES.profileEmail : RATES.profile;
  await withTx(async (client) => {
    const seen = new Set<string>();
    for (const x of items || []) {
      const original = x.originalQuery as { profileId?: string } | undefined;
      const urn = (x.id as string | undefined) || original?.profileId;
      if (!urn || !ids.includes(urn)) continue;
      seen.add(urn);
      const p = flattenProfile({ ...x, id: urn });
      await client.query(
        `UPDATE people SET data = $2::jsonb, name = COALESCE(NULLIF($3,''), name),
           headline = COALESCE(NULLIF($4,''), headline), profile_url = COALESCE(NULLIF($5,''), profile_url),
           enriched_at = CASE WHEN COALESCE(data->>'company','') = $6 THEN enriched_at ELSE NULL END,
           profiled_at = now(), profile_failed_at = NULL, updated_at = now() WHERE urn = $1`,
        [urn, JSON.stringify(p), p.name, p.headline, p.profileUrl, p.company || ""],
      );
    }
    const missed = ids.filter((u) => !seen.has(u));
    if (missed.length) await client.query("UPDATE people SET profile_failed_at = now() WHERE urn = ANY($1)", [missed]);
    const { rowCount } = await client.query(
      "UPDATE profile_batches SET done = true WHERE job_id = $1 AND batch_key = $2 AND NOT done",
      [jobId, batch.batch_key]);
    if (rowCount) await client.query("UPDATE jobs SET credits = credits + $2, heartbeat_at = now() WHERE id = $1", [jobId, seen.size * rate]);
  });
  await refreshCounts(jobId);
}

// Stop handing out more work after the first failure, and wait for the batches
// already running before the caller marks the job failed.
export async function runLanes<T>(items: T[], width: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  let error: unknown;
  const lane = async () => {
    while (true) {
      if (failed) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        await fn(items[i]);
      } catch (e) {
        failed = true;
        error ??= e;
        return;
      }
    }
  };
  const n = Math.min(width, items.length);
  if (n > 0) await Promise.all(Array.from({ length: n }, lane));
  if (failed) throw error;
}

async function scrapeProfiles(job: JobRow, key: string): Promise<void> {
  const batches = await planProfileBatches(job);
  const mode = harvestEmail() ? "Profile details + email search ($10 per 1k)" : "Profile details no email ($4 per 1k)";
  await runLanes(batches, PARALLEL, async (batch) => {
    const items = await tool(TOOLS.profiles, { profileScraperMode: mode, profileIds: batch.urns }, `${key}-p${batch.batch_key}`);
    await applyProfileBatch(job.id, batch, items);
  });
}

async function findEmails(job: JobRow, key: string): Promise<void> {
  for (let round = 0; round < 1000; round++) {
    const { rows } = await pool.query(
      `SELECT p.urn, p.data FROM job_people jp JOIN people p ON p.urn = jp.urn
       WHERE jp.job_id = $1 AND p.profiled_at IS NOT NULL AND p.enriched_at IS NULL
       ORDER BY jp.commented DESC, p.urn LIMIT 50`, [job.id]);
    if (!rows.length) break;
    const credits = await enrichPeople(rows, `${key}-e`, async (urn: string, r: { email?: string; source?: string | null; verify?: string | null; tried?: unknown; firmo?: Record<string, unknown> }) => {
      const domain = r.email && !/@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail)\./i.test(r.email) ? r.email.split("@")[1] : null;
      await pool.query(
        `UPDATE people SET email = NULLIF($2,''), email_source = $3, email_verify = $4, enrich = $5::jsonb,
           data = data || $6::jsonb || CASE WHEN $7::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('companyDomain', $7::text) END,
           enriched_at = now(), updated_at = now()
         WHERE urn = $1`,
        [urn, r.email ?? "", r.source ?? null, r.verify ?? null, JSON.stringify(r.tried ?? {}), JSON.stringify(r.firmo ?? {}), domain]);
    });
    await addCredits(job.id, credits);
    await refreshCounts(job.id);
  }
}

async function runJob(job: JobRow): Promise<void> {
  const key = `pe-${instanceId}-${job.post_id}-j${job.id}-a${job.attempt}`;
  const beat = setInterval(() => pool.query("UPDATE jobs SET heartbeat_at = now() WHERE id = $1", [job.id]).catch(() => {}), 30_000);
  const next = async (stage: string) => { await setJob(job.id, { stage }); job.stage = stage; };
  try {
    if (!after(job, "reactions")) await next("reactions");
    if (job.stage === "reactions") { await scrapeReactions(job, key); await next("comments"); }
    if (job.stage === "comments") { await scrapeComments(job, key); await next("profiles"); }
    if (job.stage === "profiles") { await scrapeProfiles(job, key); await next("emails"); }
    if (job.stage === "emails") { await findEmails(job, key); }
    await refreshCounts(job.id);
    await setJob(job.id, { stage: "done", status: "done", error: null, finished_at: new Date() });
    await pool.query("UPDATE posts SET scrapes = scrapes + 1, last_scraped_at = now() WHERE post_id = $1", [job.post_id]);
  } catch (e) {
    console.error(`job ${job.id} failed:`, e);
    const message = e instanceof Error ? e.message : String(e);
    await setJob(job.id, { status: "failed", error: message.slice(0, 1000), finished_at: new Date() });
  } finally {
    clearInterval(beat);
  }
}

async function claim(): Promise<JobRow | undefined> {
  const { rows } = await pool.query<JobRow>(
    `UPDATE jobs SET status = 'running', started_at = COALESCE(started_at, now()), heartbeat_at = now()
     WHERE id = (SELECT id FROM jobs
                 WHERE status = 'queued' OR (status = 'running' AND heartbeat_at < now() - interval '3 minutes')
                 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`);
  return rows[0];
}

export function startWorker(): void {
  if (!graphed.isConfigured()) console.warn("Graphed credentials missing: jobs will fail. Run under `graphed dev run` locally.");
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      let job: JobRow | undefined;
      while ((job = await claim())) await runJob(job);
    } catch (e) {
      console.error("worker tick:", e);
    } finally {
      busy = false;
    }
  };
  setInterval(tick, 5000);
  tick();
}
