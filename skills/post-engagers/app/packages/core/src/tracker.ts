// Profile tracking: pull a tracked profile's latest posts and queue a scrape job for each new
// one. The web worker then runs it like any other job (engagers → profiles → email waterfall).
//
// Each post is scraped once, after it is MIN_AGE_HOURS old (default 20), so most of its
// engagement is in. Called by the daily "track" cron and by "Check now" in the UI.
import { coreEnv, numberEnv } from "./config";
import { pool, instanceId, queueTrackedJob } from "./store";
import { tool, TOOLS } from "./tools";
import { parsePostUrl } from "./parse";

const POSTS_PER_CHECK = 20;

export interface TrackedProfile {
  id: number;
  username: string;
  name: string | null;
  headline: string | null;
  active: boolean;
  backfill_days: number;
  max_profiles: number;
  last_checked_at: string | Date | null;
  fetched_at: string | Date | null;
  last_error: string | null;
  created_at: string | Date;
}

export function parseUsername(input: string): string | null {
  const s = String(input || "").trim();
  const m = s.match(/linkedin\.com\/in\/([^/?#]+)/i);
  let decoded: string;
  try { decoded = decodeURIComponent(m ? m[1] : s); } catch { return null; }
  const u = decoded.replace(/\/$/, "").toLowerCase();
  return /^[a-z0-9][a-z0-9\-_%.]{1,99}$/i.test(u) && !u.startsWith("acoa") ? u : null;
}

const MAX_POST_PAGES = 15;

// Another page exists when this page was full and its oldest post is still inside the window.
export function morePostPages(oldest: Date | null, count: number, since: Date, pageSize: number): boolean {
  if (count < pageSize || !oldest) return false;
  return oldest >= since;
}

// The first check walks back through the backfill. After that, fetched_at is the
// last time posts were saved. A claim that dies before then does not move it, so
// the next run still covers the posts that were never stored. The overlap is one
// minimum age, for a post that was missing from the feed.
export function fetchSince(createdAt: Date, backfillDays: number, fetchedAt: Date | null, minAgeHours: number): Date {
  const backfill = new Date(createdAt.getTime() - backfillDays * 86400_000);
  if (!fetchedAt) return backfill;
  const recent = new Date(fetchedAt.getTime() - minAgeHours * 3600_000);
  return recent > backfill ? recent : backfill;
}

function postedAtOf(it: { posted_at?: { timestamp?: string | number } }): Date | null {
  return it.posted_at && it.posted_at.timestamp ? new Date(it.posted_at.timestamp) : null;
}

// Posts saved while they were too new have no job yet. Once they are old enough,
// queue them even if a later check no longer returns them on the first page.
export async function queueSavedPosts(tp: TrackedProfile, minAgeHours: number): Promise<number> {
  const since = new Date(new Date(tp.created_at).getTime() - tp.backfill_days * 86400_000);
  const { rows } = await pool.query<{ url: string; post_id: string }>(
    `SELECT url, post_id FROM posts
     WHERE tracked_id = $1
       AND posted_at IS NOT NULL
       AND posted_at <= now() - make_interval(hours => $2::int)
       AND posted_at >= $3
       AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.post_id = posts.post_id)
     ORDER BY posted_at`,
    [tp.id, minAgeHours, since],
  );
  let queued = 0;
  for (const row of rows) queued += await queueTrackedJob(row.url, row.post_id, tp.max_profiles, tp.id);
  return queued;
}

export async function checkProfile(tp: TrackedProfile): Promise<{ username: string; posts?: number; queued?: number; error?: string }> {
  const day = new Date().toISOString().slice(0, 13);
  const minAgeHours = numberEnv(coreEnv().TRACK_MIN_AGE_HOURS, 20);
  try {
    const since = fetchSince(
      new Date(tp.created_at),
      tp.backfill_days,
      tp.fetched_at ? new Date(tp.fetched_at) : null,
      minAgeHours,
    );
    const items: Array<Record<string, any>> = [];
    for (let page = 1; page <= MAX_POST_PAGES; page++) {
      const pageItems: Array<{
        url?: string; text?: string; post_type?: string;
        author?: { username?: string; first_name?: string; last_name?: string; headline?: string };
        urn?: { activity_urn?: string };
        stats?: { total_reactions?: number; comments?: number };
        posted_at?: { timestamp?: string | number };
      }> = await tool(TOOLS.profilePosts, { username: tp.username, limit: POSTS_PER_CHECK, page_number: page },
        `pe-${instanceId}-tp${tp.id}-${day}-p${page}`) || [];
      items.push(...pageItems);
      const dated = pageItems.map(postedAtOf).filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
      const oldest = dated.length ? new Date(Math.min(...dated.map((d) => d.getTime()))) : null;
      if (!morePostPages(oldest, pageItems.length, since, POSTS_PER_CHECK)) break;
    }
    let queued = 0, seen = 0;
    for (const it of items) {
      if (!it || !it.url) continue;
      const author = it.author || {};
      if (author.username && String(author.username).toLowerCase() !== tp.username) continue;
      const post = parsePostUrl(it.url) || (it.urn && it.urn.activity_urn ? parsePostUrl(it.urn.activity_urn) : null);
      if (!post) continue;
      const postedAt = postedAtOf(it);
      if (!postedAt || postedAt < since) continue;
      seen++;
      const st = it.stats || {};
      const { rows } = await pool.query(
        `INSERT INTO posts (post_id, tracked_id, url, posted_at, post_type, snippet, reactions, comments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (post_id) DO UPDATE SET reactions = EXCLUDED.reactions, comments = EXCLUDED.comments,
           tracked_id = COALESCE(posts.tracked_id, EXCLUDED.tracked_id)
         RETURNING *`,
        [post.postId, tp.id, post.url, postedAt, it.post_type || null, String(it.text || "").slice(0, 280),
         st.total_reactions ?? null, st.comments ?? null]);
      const row = rows[0] as { url: string };
      const ageH = (Date.now() - postedAt.getTime()) / 3600_000;
      if (ageH < minAgeHours) continue;
      queued += await queueTrackedJob(row.url, post.postId, tp.max_profiles, tp.id);
    }
    queued += await queueSavedPosts(tp, minAgeHours);
    const a = items.find((it: { author?: { username?: string } }) => it && it.author && String(it.author.username || "").toLowerCase() === tp.username);
    await pool.query(
      `UPDATE tracked_profiles SET last_checked_at = now(), fetched_at = now(), last_error = NULL,
         name = COALESCE($2, name), headline = COALESCE($3, headline) WHERE id = $1`,
      [tp.id, a ? `${a.author.first_name || ""} ${a.author.last_name || ""}`.trim() || null : null, a ? a.author.headline || null : null]);
    return { username: tp.username, posts: seen, queued };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await pool.query("UPDATE tracked_profiles SET last_checked_at = now(), last_error = $2 WHERE id = $1",
      [tp.id, message.slice(0, 500)]);
    return { username: tp.username, error: message };
  }
}

// Claim one profile that is due. last_checked_at becomes "now" so two runs do not
// pick it at once. fetched_at stays at the last completed fetch.
export async function claimDueProfile(): Promise<TrackedProfile | undefined> {
  const { rows } = await pool.query<TrackedProfile>(
    `UPDATE tracked_profiles SET last_checked_at = now()
     WHERE id = (SELECT id FROM tracked_profiles
                 WHERE active AND (last_checked_at IS NULL OR last_checked_at < now() - interval '20 hours')
                 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`);
  return rows[0];
}

export async function checkDue(): Promise<Array<{ username: string; posts?: number; queued?: number; error?: string }>> {
  const out = [];
  for (;;) {
    const tp = await claimDueProfile();
    if (!tp) break;
    out.push(await checkProfile(tp));
  }
  return out;
}
