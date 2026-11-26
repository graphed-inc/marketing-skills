// Job queue in Postgres. Every research run is a job; its result stays in the table, so opening it
// again costs nothing. The web service runs the worker; the CLI can run a job inline.
import { pool, q, one } from "./db.mjs";
import { domainReport, keywordsReport, serpReport, gapReport, backlinksReport, cleanDomain, BIG, locOf, langOf } from "./seo.mjs";
import { runAudit, diffAudits } from "./audit.mjs";
import { runAi } from "./ai.mjs";
import { checkRanks } from "./rank.mjs";
import { detect } from "./gsc.mjs";
import { call, chat, chatJson, dfsResult, FAST_MODEL } from "./tools.mjs";
import { linksReport, linkGapReport } from "./links.mjs";
import { mentionsReport } from "./mentions.mjs";
import { localGridReport } from "./local.mjs";


export const KINDS = {
  domain: { title: (i) => cleanDomain(i.domain), run: (i, ctx, pr) => domainReport(i, ctx, pr) },
  keywords: { title: (i) => i.seed, run: (i, ctx, pr) => keywordsReport(i, ctx, pr) },
  serp: { title: (i) => i.keyword, run: (i, ctx, pr) => serpReport(i, ctx, pr) },
  backlinks: { title: (i) => cleanDomain(i.domain), run: (i, ctx, pr) => backlinksReport(i, ctx, pr) },
  links: { title: (i) => cleanDomain(i.domain), run: (i, ctx, pr) => linksReport(i, ctx, pr) },
  linkgap: { title: (i) => `${cleanDomain(i.domain)} vs ${(i.competitors || []).length} competitors`, run: (i, ctx, pr) => linkGapReport(i, ctx, pr) },
  mentions: { title: (i) => String(i.target || ""), run: (i, ctx, pr) => mentionsReport(i, ctx, pr) },
  local: { title: (i) => `${i.keyword} · ${i.business}`, run: (i, ctx, pr) => localGridReport(i, ctx, pr) },
  gap: { title: (i) => `${cleanDomain(i.domain)} vs ${(i.competitors || []).length} competitors`, run: (i, ctx, pr) => gapReport(i, ctx, pr) },
  audit: {
    title: (i) => cleanDomain(i.domain),
    run: async (i, ctx, pr) => {
      const r = await runAudit(i, ctx, pr);
      const prev = ctx.projectId ? await one(`SELECT result FROM jobs WHERE project_id = $1 AND kind = 'audit' AND status = 'done' AND id <> $2 ORDER BY id DESC LIMIT 1`, [ctx.projectId, ctx.jobId]) : null;
      r.diff = diffAudits(r, prev && prev.result);
      return r;
    },
  },
  ai: { title: () => "AI visibility", run: async (i, ctx, pr) => runAi(await project(ctx.projectId), i, ctx, ctx.jobId, pr) },
  rank: { title: () => "Rank check", run: async (i, ctx, pr) => checkRanks(await project(ctx.projectId), ctx, pr, i.ids || null) },
  setup: { title: () => "Project setup", run: (i, ctx, pr) => setupProject(ctx.projectId, ctx, pr) },
};

export const project = async (id) => { const p = await one("SELECT * FROM projects WHERE id = $1", [id]); if (!p) throw new Error("project not found"); return p; };

// New project: find its Search Console + GA4 in the warehouse, write a short "about", suggest competitors.
async function setupProject(id, ctx, progress) {
  const p = await project(id);
  progress("Search Console + GA4");
  const d = await detect(p.domain);
  await pool.query(`UPDATE projects SET gsc_schema = coalesce(gsc_schema, $2), gsc_site = coalesce(gsc_site, $3), ga4_schema = coalesce(ga4_schema, $4), ga4_property = coalesce(ga4_property, $5) WHERE id = $1`,
    [id, d.gsc_schema, d.gsc_site, d.ga4_schema, d.ga4_property]);
  let about = p.about;
  if (!about) {
    progress("reading the homepage");
    const page = await call("serper:scrape", { url: `https://${p.domain}/`, includeMarkdown: true }, { ctx, ttlDays: 30 }).catch(() => null);
    const text = String((page && (page.markdown || page.text)) || "").slice(0, 6000);
    if (text) {
      about = (await chat(FAST_MODEL, [{ role: "user", content: `In 2 plain sentences: what does this business sell, and to whom? No marketing words.\n\n${text}` }], { ctx, max_tokens: 200 })).text.trim();
      await pool.query("UPDATE projects SET about = $2 WHERE id = $1", [id, about]);
    }
  }
  let competitors = p.competitors;
  if (!competitors.length) {
    progress("competitors");
    const c = dfsResult(await call("dataforseo:labs.competitors_domain.live", { target: p.domain, locationCode: locOf(p.location), languageCode: langOf(p.language, p.location), limit: 40 }, { ctx }).catch(() => null));
    const pool40 = ((c && c.items) || []).map((x) => cleanDomain(x.domain)).filter((x) => x !== cleanDomain(p.domain) && !BIG.test(x));
    // Keyword overlap alone picks content sites (Stack Overflow, tutorial blogs). Keep only businesses that sell something similar.
    try {
      const j = await chatJson([{ role: "user", content:
`Business: ${p.domain}
About: ${about || "(unknown)"}
These domains share Google keywords with it:
${pool40.join("\n")}

Pick up to 4 that are real business competitors: they sell a similar product or service to similar buyers. Skip content sites, forums, tutorials, news, directories and marketplaces.
Return JSON only: {"competitors":["domain", ...]}` }], { ctx });
      competitors = (j.competitors || []).map(cleanDomain).filter((d) => pool40.includes(d)).slice(0, 4);
    } catch { competitors = []; }
    if (!competitors.length) competitors = pool40.slice(0, 4);
    await pool.query("UPDATE projects SET competitors = $2 WHERE id = $1", [id, competitors]);
  }
  return { ...d, about, competitors };
}

// running: true inserts the job already claimed (status running, fresh heartbeat), for a caller that runs it itself
// (cli.mjs). The worker only claims queued jobs or running ones with no heartbeat for 2 minutes, so it never
// picks this one up while runJob() keeps its heartbeat.
export async function enqueue(kind, input, projectId = null, { running = false } = {}) {
  if (!KINDS[kind]) throw new Error(`unknown job kind ${kind}`);
  const title = String(KINDS[kind].title(input) || kind).slice(0, 200);
  return one(running
    ? "INSERT INTO jobs (project_id, kind, title, input, status, started_at, heartbeat_at) VALUES ($1,$2,$3,$4,'running',now(),now()) RETURNING *"
    : "INSERT INTO jobs (project_id, kind, title, input) VALUES ($1,$2,$3,$4) RETURNING *", [projectId, kind, title, JSON.stringify(input)]);
}

export async function runJob(job) {
  const ctx = { jobId: job.id, projectId: job.project_id };
  let last = 0;
  const progress = (s) => { const now = Date.now(); if (now - last < 700) return; last = now; pool.query("UPDATE jobs SET progress = $2, heartbeat_at = now() WHERE id = $1", [job.id, String(s).slice(0, 200)]).catch(() => {}); };
  const beat = setInterval(() => pool.query("UPDATE jobs SET heartbeat_at = now() WHERE id = $1", [job.id]).catch(() => {}), 15000);
  try {
    const result = await KINDS[job.kind].run(job.input, ctx, progress);
    await pool.query("UPDATE jobs SET status = 'done', result = $2, progress = '', finished_at = now() WHERE id = $1", [job.id, JSON.stringify(result)]);
    return result;
  } catch (e) {
    console.error("job", job.id, job.kind, e);
    await pool.query("UPDATE jobs SET status = 'error', error = $2, finished_at = now() WHERE id = $1", [job.id, String((e && e.message) || e).slice(0, 1000)]);
    throw e;
  } finally { clearInterval(beat); }
}

// Claim the next queued job (or one whose worker died: no heartbeat for 2 minutes).
async function claim() {
  return one(`UPDATE jobs SET status = 'running', started_at = coalesce(started_at, now()), heartbeat_at = now()
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' OR (status = 'running' AND heartbeat_at < now() - interval '2 minutes')
                ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`);
}

export function startWorker(slots = 3) {
  let active = 0;
  const tick = async () => {
    try {
      while (active < slots) {
        const job = await claim();
        if (!job) break;
        active++;
        runJob(job).catch(() => {}).finally(() => { active--; });
      }
    } catch (e) { console.error("worker", e.message); }
    setTimeout(tick, 1000);
  };
  tick();
}

// Scheduled work (graphed.yaml jobs): daily rank checks; weekly audits + AI visibility on Mondays.
export async function scheduled(which) {
  const projects = await q("SELECT * FROM projects ORDER BY id");
  const out = [];
  for (const p of projects) {
    if (which === "daily" && (await one("SELECT 1 FROM tracked WHERE project_id = $1 LIMIT 1", [p.id]))) out.push(await enqueue("rank", {}, p.id));
    if (which === "weekly") {
      if (p.weekly_audit) out.push(await enqueue("audit", { domain: p.domain, maxPages: 500 }, p.id));
      if (p.weekly_ai && (await one("SELECT 1 FROM prompts WHERE project_id = $1 LIMIT 1", [p.id]))) out.push(await enqueue("ai", { runs: 3 }, p.id));
    }
  }
  return out;
}

// Queue a job and wait for it (MCP + REST callers). Returns the finished job row, or the row as it is after waitMs.
export async function runAndWait(kind, input, projectId = null, waitMs = 50000) {
  const j = await enqueue(kind, input, projectId);
  const t0 = Date.now();
  for (;;) {
    const cur = await one("SELECT * FROM jobs WHERE id = $1", [j.id]);
    if (!cur || cur.status === "done" || cur.status === "error" || Date.now() - t0 > waitMs) return cur;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
