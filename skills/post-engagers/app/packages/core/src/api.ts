import { coreEnv, numberEnv, projectSlug } from "./config";
import { agentPrompt } from "./prompt";
import { pool, listPeople, insertManualJob, retryJob, HttpError, type JobRow } from "./store";
import { RATES, emailWaterfall } from "./worker";
import { checkProfile, parseUsername, type TrackedProfile } from "./tracker";
import { parsePostUrl, toCsv } from "./parse";
import { personRow, COLUMNS } from "./rows";

const DEFAULT_MAX = () => numberEnv(coreEnv().MAX_PROFILES_PER_JOB, 1000);

function json(code: number, body: unknown): Response {
  return Response.json(body, { status: code, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
}

function csv(name: string, rows: unknown[]): Response {
  return new Response(toCsv(rows, COLUMNS), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

function jobOut(j: JobRow) {
  return {
    id: j.id, postUrl: j.post_url, postId: j.post_id, status: j.status, stage: j.stage, error: j.error,
    engagements: j.engagements, uniquePeople: j.unique_people, profiles: j.profiles, emails: j.emails,
    totalReactions: j.total_reactions, totalComments: j.total_comments, maxProfiles: j.max_profiles,
    credits: Number(j.credits), createdAt: j.created_at, startedAt: j.started_at, finishedAt: j.finished_at,
    source: j.source, trackedId: j.tracked_id, newPeople: j.new_people, verified: j.verified,
  };
}

interface TrackedRow extends TrackedProfile {
  posts?: number;
  people?: number;
  new7?: number;
  verified?: number;
}

const checking = new Set<number>();

function trackedOut(t: TrackedRow) {
  return {
    id: t.id, username: t.username, name: t.name, headline: t.headline, active: t.active,
    backfillDays: t.backfill_days, maxProfiles: t.max_profiles, lastCheckedAt: t.last_checked_at,
    lastError: t.last_error, createdAt: t.created_at, checking: checking.has(t.id),
    posts: t.posts ?? 0, people: t.people ?? 0, new7: t.new7 ?? 0, verified: t.verified ?? 0,
  };
}

const TRACKED_SQL = `SELECT t.*,
    (SELECT count(*) FROM posts WHERE tracked_id = t.id)::int posts,
    (SELECT count(DISTINCT jp.urn) FROM job_people jp JOIN jobs j ON j.id = jp.job_id WHERE j.tracked_id = t.id)::int people,
    (SELECT count(DISTINCT jp.urn) FROM job_people jp JOIN jobs j ON j.id = jp.job_id JOIN people p ON p.urn = jp.urn
       WHERE j.tracked_id = t.id AND p.created_at > now() - interval '7 days')::int new7,
    (SELECT count(DISTINCT jp.urn) FROM job_people jp JOIN jobs j ON j.id = jp.job_id JOIN people p ON p.urn = jp.urn
       WHERE j.tracked_id = t.id AND p.email_verify = 'ok')::int verified
  FROM tracked_profiles t`;

function peopleOpts(url: URL) {
  return {
    sinceDays: Number(url.searchParams.get("since")) || null,
    trackedId: Number(url.searchParams.get("tracked")) || null,
  };
}

function checkInBackground(t: TrackedProfile): void {
  if (checking.has(t.id)) return;
  checking.add(t.id);
  checkProfile(t).then((r) => console.log("track", r)).catch((e) => console.error("track", e)).finally(() => checking.delete(t.id));
}

function asBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

async function route(method: string, url: URL, body: unknown): Promise<Response> {
  const p = url.pathname;
  const m = p.match(/^\/api\/jobs\/(\d+)(\/[a-z.]+)?$/);
  const tm = p.match(/^\/api\/tracked\/(\d+)(\/[a-z]+)?$/);
  const input = asBody(body);

  if (p === "/health" || p === "/api/health") return json(200, { ok: true });

  if (method === "GET" && p === "/api/stats") {
    const { rows } = await pool.query<Record<string, number>>(`SELECT
      (SELECT count(*) FROM jobs)::int posts,
      (SELECT count(DISTINCT urn) FROM job_people)::int people,
      (SELECT count(*) FROM people WHERE profiled_at IS NOT NULL)::int profiles,
      (SELECT count(*) FROM people WHERE email IS NOT NULL AND email <> '')::int emails,
      (SELECT count(*) FROM people WHERE email_verify = 'ok')::int verified,
      (SELECT count(*) FROM people WHERE created_at > now() - interval '1 day')::int new1,
      (SELECT count(*) FROM people WHERE created_at > now() - interval '7 days')::int new7,
      (SELECT count(*) FROM tracked_profiles WHERE active)::int tracked,
      (SELECT COALESCE(sum(credits),0) FROM jobs)::float credits`);
    const slug = projectSlug();
    return json(200, { ...rows[0], rates: RATES, waterfall: emailWaterfall(), defaultMaxProfiles: DEFAULT_MAX(), slug, agentPrompt: agentPrompt(slug) });
  }

  if (method === "GET" && p === "/api/jobs") {
    const { rows } = await pool.query<JobRow>("SELECT * FROM jobs ORDER BY id DESC LIMIT 2000");
    return json(200, rows.map(jobOut));
  }

  if (method === "POST" && p === "/api/jobs") {
    const post = parsePostUrl(input.url);
    if (!post) return json(400, { error: "That does not look like a LinkedIn post URL. Use a linkedin.com/posts/… or feed/update/… link." });
    const requested = Number(input.maxProfiles);
    const max = Math.max(0, Math.min(10_000, Number.isFinite(requested) ? requested : DEFAULT_MAX()));
    try {
      return json(201, jobOut(await insertManualJob(post.url, post.postId, max)));
    } catch (e) {
      if (e instanceof HttpError && e.statusCode === 409) return json(409, { error: e.message });
      throw e;
    }
  }

  if (m) {
    const id = Number(m[1]);
    const sub = m[2] || "";
    const { rows } = await pool.query<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
    const j = rows[0];
    if (!j) return json(404, { error: "No such job" });
    if (method === "GET" && sub === "") return json(200, jobOut(j));
    if (method === "GET" && sub === "/people") return json(200, (await listPeople(id)).map(personRow));
    if (method === "GET" && sub === "/export.csv") return csv(`post-engagers-${j.post_id}.csv`, (await listPeople(id)).map(personRow));
    if (method === "POST" && sub === "/retry") {
      try {
        const r = await retryJob(id);
        if (!r) return json(404, { error: "No such job" });
        return json(200, jobOut(r));
      } catch (e) {
        if (e instanceof HttpError && e.statusCode === 409) return json(409, { error: e.message });
        if ((e as { code?: string })?.code === "23505") return json(409, { error: "Another scrape for this post is already queued." });
        throw e;
      }
    }
  }

  if (method === "GET" && p === "/api/people") return json(200, (await listPeople(null, peopleOpts(url))).map(personRow));
  if (method === "GET" && p === "/api/people/export.csv") {
    const o = peopleOpts(url);
    const name = `post-engagers-${o.trackedId ? `tracked-${o.trackedId}-` : ""}${o.sinceDays ? `new-${o.sinceDays}d` : "all"}.csv`;
    return csv(name, (await listPeople(null, o)).map(personRow));
  }

  if (method === "GET" && p === "/api/tracked") {
    const { rows } = await pool.query<TrackedRow>(`${TRACKED_SQL} ORDER BY t.id`);
    return json(200, rows.map(trackedOut));
  }
  if (method === "POST" && p === "/api/tracked") {
    const username = parseUsername(String(input.url || ""));
    if (!username) return json(400, { error: "Use a LinkedIn profile URL like linkedin.com/in/<name>, or the username." });
    const backfill = Math.max(0, Math.min(90, Number(input.backfillDays ?? 7)));
    const max = Math.max(0, Math.min(10_000, Number(input.maxProfiles ?? DEFAULT_MAX())));
    const { rows } = await pool.query<TrackedProfile>(
      `INSERT INTO tracked_profiles (username, backfill_days, max_profiles) VALUES ($1,$2,$3)
       ON CONFLICT (username) DO UPDATE SET active = true, backfill_days = EXCLUDED.backfill_days, max_profiles = EXCLUDED.max_profiles
       RETURNING *`, [username, backfill, max]);
    const t = rows[0];
    checkInBackground(t);
    return json(201, trackedOut(t));
  }
  if (tm) {
    const id = Number(tm[1]);
    const sub = tm[2] || "";
    const { rows } = await pool.query<TrackedProfile>("SELECT * FROM tracked_profiles WHERE id = $1", [id]);
    const t = rows[0];
    if (!t) return json(404, { error: "No such tracked profile" });
    if (method === "POST" && sub === "/check") { checkInBackground(t); return json(202, { started: true }); }
    if (method === "POST" && sub === "/toggle") {
      const updated = await pool.query<TrackedProfile>("UPDATE tracked_profiles SET active = NOT active WHERE id = $1 RETURNING *", [id]);
      return json(200, trackedOut(updated.rows[0]));
    }
    if (method === "GET" && sub === "/posts") {
      const posts = await pool.query(
        `SELECT po.*, j.id job_id, j.status, j.unique_people, j.new_people, j.verified
         FROM posts po LEFT JOIN LATERAL (SELECT * FROM jobs WHERE post_id = po.post_id ORDER BY id DESC LIMIT 1) j ON true
         WHERE po.tracked_id = $1 ORDER BY po.posted_at DESC LIMIT 100`, [id]);
      return json(200, posts.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          postId: row.post_id, url: row.url, postedAt: row.posted_at, type: row.post_type, snippet: row.snippet,
          reactions: row.reactions, comments: row.comments, jobId: row.job_id, status: row.status,
          people: row.unique_people, newPeople: row.new_people, verified: row.verified,
        };
      }));
    }
  }

  return json(404, { error: "Not found" });
}

export async function handleApi(method: string, url: URL, body: unknown): Promise<Response> {
  try {
    return await route(method, url, body);
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error" });
  }
}
