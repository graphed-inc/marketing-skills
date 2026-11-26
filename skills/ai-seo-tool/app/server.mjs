// AI SEO Tool on Graphed Cloud: HTTP API + the UI (public/index.html) + the job worker.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { pool, q, one, migrate } from "./lib/db.mjs";
import { enqueue, startWorker, project } from "./lib/jobs.mjs";
import { LOCATIONS, LANGUAGES, locOf, langOf, cleanDomain } from "./lib/seo.mjs";
import { RULES } from "./lib/audit.mjs";
import { ENGINES, suggestPrompts, summary as aiSummary, answers, trend as aiTrend } from "./lib/ai.mjs";
import { rankTable } from "./lib/rank.mjs";
import { gscReport, sources, topQueries } from "./lib/gsc.mjs";
import { allLists, createList, listRows, addKeywords, removeKeywords, refreshList, listCompetitors } from "./lib/lists.mjs";
import { mcpRoute, createToken, listTokens, revokeToken, TOOLS } from "./lib/mcp.mjs";

const PORT = Number(process.env.PORT || 3000);
const html = new URL("./public/index.html", import.meta.url);

const routes = [];
const route = (method, pattern, fn) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, fn });
};
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (msg) => { throw new HttpError(400, msg); };
const need = (v, msg) => { if (!v) throw new HttpError(404, msg || "not found"); return v; };
async function body(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 5 * 1024 * 1024) throw new HttpError(413, "body too large"); chunks.push(c); }
  const s = Buffer.concat(chunks).toString("utf8");
  if (!s) return {};
  try { return JSON.parse(s); } catch { bad("body must be JSON"); }
}
const list = (v) => (Array.isArray(v) ? v : String(v || "").split(/[\n,]+/)).map((s) => String(s).trim()).filter(Boolean);

route("GET", "/health", async () => ({ ok: true }));
route("GET", "/api/meta", async () => ({ locations: LOCATIONS, languages: LANGUAGES, engines: ENGINES.map(({ id, name }) => ({ id, name })), rules: RULES }));

// ---------- projects ----------
route("GET", "/api/projects", async () => q(`SELECT p.*,
  (SELECT count(*)::int FROM tracked t WHERE t.project_id = p.id) AS tracked,
  (SELECT count(*)::int FROM prompts x WHERE x.project_id = p.id) AS prompts
  FROM projects p ORDER BY p.name`));
route("POST", "/api/projects", async (_, b) => {
  const domain = cleanDomain(b.domain);
  if (!domain.includes(".")) bad("enter a domain, like example.com");
  const p = await one(`INSERT INTO projects (name, domain, competitors, brand_terms, location, language) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [String(b.name || domain).slice(0, 120), domain, list(b.competitors).map(cleanDomain).slice(0, 4), list(b.brandTerms), locOf(b.location), langOf(b.language, b.location)]);
  const job = await enqueue("setup", {}, p.id);
  return { ...p, setupJob: job.id };
});
route("GET", "/api/projects/:id", async ({ id }) => project(Number(id)));
route("PATCH", "/api/projects/:id", async ({ id }, b) => {
  const p = await project(Number(id));
  const f = {
    name: b.name != null ? String(b.name).slice(0, 120) : p.name,
    competitors: b.competitors != null ? list(b.competitors).map(cleanDomain).slice(0, 4) : p.competitors,
    brand_terms: b.brandTerms != null ? list(b.brandTerms) : p.brand_terms,
    location: b.location != null ? locOf(b.location) : p.location,
    about: b.about != null ? String(b.about).slice(0, 2000) : p.about,
    gsc: b.gsc !== undefined ? b.gsc : (p.gsc_schema ? { schema: p.gsc_schema, site: p.gsc_site } : null),
    ga4: b.ga4 !== undefined ? b.ga4 : (p.ga4_schema ? { schema: p.ga4_schema, property: p.ga4_property } : null),
    rank_depth: b.rankDepth != null ? Number(b.rankDepth) : p.rank_depth,
    weekly_audit: b.weeklyAudit != null ? !!b.weeklyAudit : p.weekly_audit,
    weekly_ai: b.weeklyAi != null ? !!b.weeklyAi : p.weekly_ai,
  };
  f.language = b.language != null || b.location != null ? langOf(b.language != null ? b.language : p.language, f.location) : p.language;
  return one(`UPDATE projects SET name=$2, competitors=$3, brand_terms=$4, location=$5, about=$6, gsc_schema=$7, gsc_site=$8, ga4_schema=$9, ga4_property=$10, rank_depth=$11, weekly_audit=$12, weekly_ai=$13, language=$14 WHERE id=$1 RETURNING *`,
    [p.id, f.name, f.competitors, f.brand_terms, f.location, f.about, f.gsc && f.gsc.schema, f.gsc && f.gsc.site, f.ga4 && f.ga4.schema, f.ga4 && f.ga4.property, f.rank_depth, f.weekly_audit, f.weekly_ai, f.language]);
});
route("DELETE", "/api/projects/:id", async ({ id }) => { await pool.query("DELETE FROM projects WHERE id = $1", [id]); return { ok: true }; });

// ---------- jobs (every research run) ----------
route("POST", "/api/jobs", async (_, b) => {
  const pid = b.projectId ? Number(b.projectId) : null;
  const input = b.input || {};
  if (pid) {
    const p = await project(pid);
    input.loc = input.loc || p.location; input.lang = input.lang || p.language;
    if (["gap", "audit", "backlinks", "links", "linkgap"].includes(b.kind)) {
      input.domain = input.domain || p.domain;
      if (b.kind !== "audit") input.competitors = input.competitors && input.competitors.length ? input.competitors : p.competitors;
      input.about = input.about || p.about; input.brandTerms = p.brand_terms;
    }
    if (b.kind === "serp") input.domain = input.domain || p.domain;
  }
  return enqueue(b.kind, input, pid);
});
route("GET", "/api/jobs", async (_, __, url) => {
  const kind = url.searchParams.get("kind"), pid = url.searchParams.get("project");
  const params = [], where = [];
  if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
  if (pid) { params.push(Number(pid)); where.push(`project_id = $${params.length}`); }
  params.push(Math.min(Number(url.searchParams.get("limit") || 30), 200));
  return q(`SELECT id, project_id, kind, title, input, status, progress, error, credits, created_at, finished_at FROM jobs
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT $${params.length}`, params);
});
route("GET", "/api/jobs/:id", async ({ id }) => need(await one("SELECT * FROM jobs WHERE id = $1", [id]), "job not found"));
route("DELETE", "/api/jobs/:id", async ({ id }) => { await pool.query("DELETE FROM jobs WHERE id = $1", [id]); return { ok: true }; });

// ---------- rank tracker ----------
route("GET", "/api/projects/:id/ranks", async ({ id }) => rankTable(Number(id)));
route("POST", "/api/projects/:id/tracked", async ({ id }, b) => {
  const kws = [...new Set(list(b.keywords).map((k) => k.toLowerCase()))].slice(0, 1000);
  for (const k of kws) await pool.query("INSERT INTO tracked (project_id, keyword) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, k]);
  const ids = (await q("SELECT id FROM tracked WHERE project_id = $1 AND keyword = ANY($2::text[])", [id, kws])).map((r) => r.id);
  const job = b.check === false || !ids.length ? null : await enqueue("rank", { ids }, Number(id));
  return { added: kws.length, job: job && job.id };
});
route("POST", "/api/projects/:id/tracked/import-gsc", async ({ id }, b) => {
  const p = await project(Number(id));
  const kws = await topQueries(p, Math.min(Number(b.limit) || 50, 500));
  for (const k of kws) await pool.query("INSERT INTO tracked (project_id, keyword) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, k]);
  return { added: kws.length };
});
route("DELETE", "/api/tracked/:id", async ({ id }) => { await pool.query("DELETE FROM tracked WHERE id = $1", [id]); return { ok: true }; });
route("GET", "/api/tracked/:id/serp", async ({ id }) => one("SELECT day, position, url, top, competitors FROM ranks WHERE tracked_id = $1 ORDER BY day DESC LIMIT 1", [id]));
route("POST", "/api/projects/:id/check-now", async ({ id }) => enqueue("rank", {}, Number(id)));

// ---------- Search Console + GA4 (warehouse) ----------
route("GET", "/api/warehouse/sources", async () => sources());
route("GET", "/api/projects/:id/gsc", async ({ id }, _, url) => gscReport(await project(Number(id)), { days: url.searchParams.get("days") }));

// ---------- AI visibility ----------
route("GET", "/api/projects/:id/prompts", async ({ id }) => q("SELECT * FROM prompts WHERE project_id = $1 ORDER BY id", [id]));
route("POST", "/api/projects/:id/prompts", async ({ id }, b) => {
  for (const pr of list(b.prompts).slice(0, 200)) await pool.query("INSERT INTO prompts (project_id, prompt) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, pr]);
  return q("SELECT * FROM prompts WHERE project_id = $1 ORDER BY id", [id]);
});
route("POST", "/api/projects/:id/prompts/suggest", async ({ id }, b) => ({ prompts: await suggestPrompts(await project(Number(id)), b.keywords || "", { projectId: Number(id) }) }));
route("DELETE", "/api/prompts/:id", async ({ id }) => { await pool.query("DELETE FROM prompts WHERE id = $1", [id]); return { ok: true }; });
route("GET", "/api/projects/:id/ai", async ({ id }, _, url) => aiSummary(await project(Number(id)), url.searchParams.get("job") ? Number(url.searchParams.get("job")) : null));
route("GET", "/api/projects/:id/ai/trend", async ({ id }) => aiTrend(Number(id)));
route("GET", "/api/prompts/:id/answers", async ({ id }, _, url) => answers(Number(id), url.searchParams.get("job") ? Number(url.searchParams.get("job")) : null));

// ---------- keyword lists ----------
route("GET", "/api/lists", async () => allLists());
route("POST", "/api/lists", async (_, b) => createList(b.name));
route("GET", "/api/lists/:id", async ({ id }) => ({ list: need(await one("SELECT * FROM lists WHERE id = $1", [id]), "list not found"), rows: await listRows(Number(id)) }));
route("DELETE", "/api/lists/:id", async ({ id }) => { await pool.query("DELETE FROM lists WHERE id = $1", [id]); return { ok: true }; });
route("POST", "/api/lists/:id/keywords", async ({ id }, b) => ({ added: await addKeywords(Number(id), Array.isArray(b.keywords) ? b.keywords : list(b.keywords)) }));
route("POST", "/api/lists/:id/remove", async ({ id }, b) => { await removeKeywords(Number(id), b.keywords || []); return { ok: true }; });
route("POST", "/api/lists/:id/refresh", async ({ id }, b) => refreshList(Number(id), { loc: b.loc, lang: b.lang }));
route("POST", "/api/lists/:id/competitors", async ({ id }, b) => listCompetitors(Number(id), { loc: b.loc, lang: b.lang }));

// ---------- agent access (MCP tokens) ----------
route("GET", "/api/tokens", async () => ({ tokens: await listTokens(), tools: TOOLS.map((t) => ({ name: t.name, description: t.description })) }));
route("POST", "/api/tokens", async (_, b) => createToken(b.name));
route("DELETE", "/api/tokens/:id", async ({ id }) => { await revokeToken(Number(id)); return { ok: true }; });

// ---------- report ----------
const latest = (pid, kind) => one("SELECT id, result, finished_at FROM jobs WHERE project_id = $1 AND kind = $2 AND status = 'done' ORDER BY id DESC LIMIT 1", [pid, kind]);
route("GET", "/api/projects/:id/report", async ({ id }) => {
  const p = await project(Number(id));
  const [gsc, ranks, audit, gap, bl, ai] = await Promise.all([
    gscReport(p).catch((e) => ({ connected: false, error: e.message })),
    rankTable(p.id), latest(p.id, "audit"), latest(p.id, "gap"), latest(p.id, "links"), aiSummary(p).catch(() => null),
  ]);
  const linkgap = await latest(p.id, "linkgap");
  const pos = ranks.filter((r) => r.position != null);
  return {
    project: p,
    gsc: gsc.connected ? { totals: gsc.totals, daily: gsc.daily, almostThere: gsc.almostThere.slice(0, 10), ga4: gsc.ga4, lost: gsc.lost.slice(0, 5) } : { connected: false },
    ranks: { tracked: ranks.length, top3: pos.filter((r) => r.position <= 3).length, top10: pos.filter((r) => r.position <= 10).length,
      up: ranks.filter((r) => r.change7 > 0).length, down: ranks.filter((r) => r.change7 < 0).length,
      movers: [...ranks].filter((r) => r.change7).sort((a, b) => Math.abs(b.change7) - Math.abs(a.change7)).slice(0, 8) },
    audit: audit && { at: audit.finished_at, health: audit.result.health, crawled: audit.result.crawled, counts: audit.result.counts, diff: audit.result.diff && { newIssues: audit.result.diff.newIssues.length, fixed: audit.result.diff.fixed.length } },
    gap: gap && { at: gap.finished_at, jobId: gap.id, candidates: gap.result.candidates, shortlist: gap.result.rows.filter((r) => r.shortlist).slice(0, 10) },
    backlinks: bl && bl.result.compare && bl.result.compare.length ? bl.result.compare : null,
    linkgap: linkgap && { total: linkgap.result.total, multi: linkgap.result.multi, top: linkgap.result.rows.slice(0, 8) },
    ai: ai && ai.runs ? { rate: ai.rate, engines: ai.engines, shareOfVoice: ai.shareOfVoice.slice(0, 6), gaps: ai.gaps.slice(0, 5).map((g) => ({ prompt: g.prompt, rate: g.rate, lostTo: g.lostTo.slice(0, 3) })) } : null,
  };
});

// ---------- credits ----------
route("GET", "/api/credits", async () => {
  const [tot, tools, projects, days] = await Promise.all([
    one(`SELECT coalesce(sum(credits) FILTER (WHERE at > now() - interval '1 day'),0)::float d1, coalesce(sum(credits) FILTER (WHERE at > now() - interval '7 days'),0)::float d7,
         coalesce(sum(credits) FILTER (WHERE at > now() - interval '30 days'),0)::float d30, coalesce(sum(credits),0)::float total FROM credit_log`),
    q(`SELECT tool, count(*)::int calls, sum(credits)::float credits FROM credit_log WHERE at > now() - interval '30 days' GROUP BY tool ORDER BY credits DESC`),
    q(`SELECT coalesce(p.name, '(no project)') AS name, sum(c.credits)::float credits FROM credit_log c LEFT JOIN projects p ON p.id = c.project_id WHERE c.at > now() - interval '30 days' GROUP BY 1 ORDER BY credits DESC`),
    q(`SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, sum(credits)::float credits FROM credit_log WHERE at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
  ]);
  const cached = await one("SELECT count(*)::int n, coalesce(sum(credits),0)::float saved FROM lookups");
  return { ...tot, tools, projects, days, cachedLookups: cached.n };
});

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // The gateway opens /mcp without a login (graphed.yaml public.paths). Match the raw path exactly: a path that
    // only reads as /mcp after normalizing gets no route. mcpRoute refuses every request without a valid token.
    if (req.url.split("?")[0] === "/mcp") return await mcpRoute(req, res, body);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(await readFile(html));
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const b = ["POST", "PUT", "PATCH"].includes(req.method) ? await body(req) : {};
      const out = await r.fn(params, b, url);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(out ?? null));
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500;
    if (code === 500) console.error(req.method, url.pathname, e);
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
});

await migrate();
if (process.env.NO_WORKER !== "1") startWorker();
server.listen(PORT, () => console.log(`ai-seo-tool on :${PORT}`));
