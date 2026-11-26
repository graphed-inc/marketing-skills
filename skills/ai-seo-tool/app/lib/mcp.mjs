// MCP server at POST /mcp (JSON-RPC, streamable HTTP, plain JSON replies, no sessions).
// The gateway lets /mcp through without a Graphed login, so every request needs a bearer token
// made on the Agent access page. Only the token's hash is stored.
import { createHash, randomBytes } from "node:crypto";
import { pool, q, one } from "./db.mjs";
import { runAndWait, enqueue, project } from "./jobs.mjs";
import { cleanDomain, locOf, langOf } from "./seo.mjs";
import { rankTable } from "./rank.mjs";
import { gscReport } from "./gsc.mjs";
import { summary as aiSummary } from "./ai.mjs";
import { allLists, createList, addKeywords, listRows } from "./lists.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
export async function createToken(name) {
  const token = "seo_" + randomBytes(24).toString("hex");
  const row = await one("INSERT INTO api_tokens (name, prefix, hash) VALUES ($1, $2, $3) RETURNING id, name, prefix, created_at", [String(name || "Agent").slice(0, 80), token.slice(0, 10), sha(token)]);
  return { ...row, token };
}
export const listTokens = () => q("SELECT id, name, prefix, created_at, last_used_at FROM api_tokens ORDER BY id");
export const revokeToken = (id) => pool.query("DELETE FROM api_tokens WHERE id = $1", [id]);
async function tokenOf(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(seo_[0-9a-f]{48})$/);
  if (!m) return null;
  const row = await one("UPDATE api_tokens SET last_used_at = now() WHERE hash = $1 RETURNING id, name", [sha(m[1])]);
  return row;
}

// ---------- results → small, agent-sized answers ----------
const head = (rows, n = 25) => (rows || []).slice(0, n);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
const KW = ["keyword", "volume", "kd", "cpc", "intent", "avgRd", "aio"];
const SECTIONS = {
  domain: ["keywords", "pages", "competitors"], keywords: ["keywords"], serp: ["organic"], gap: ["rows"], links: ["backlinks", "referringDomains", "anchors", "pages", "history", "newLost"],
  linkgap: ["rows"], mentions: ["questions", "citedDomains", "topPages"], local: ["grid", "competitors"], audit: ["pages"],
};
function brief(kind, r, n = 25) {
  if (!r) return r;
  if (kind === "domain") return { domain: r.domain, overview: pick(r.overview, ["keywords", "etv", "trafficValue", "top3", "top10", "isNew", "isUp", "isDown", "isLost"]), backlinks: r.backlinks && pick(r.backlinks, ["rank", "referringDomains", "dofollowDomains", "backlinks", "spamScore"]),
    keywords_total: r.keywordsTotal, keywords: head(r.keywords, n).map((k) => pick(k, [...KW, "pos", "url", "etv"])), pages: head(r.pages, 15).map((p) => pick(p, ["url", "etv", "keywords", "top"])), competitors: head(r.competitors, 10) };
  if (kind === "keywords") return { seed: r.seedRow && pick(r.seedRow, KW), keywords_total: r.keywords.length, keywords: head(r.keywords, n).map((k) => pick(k, [...KW, "source"])) };
  if (kind === "serp") return { keyword: r.keyword, metrics: r.metrics && pick(r.metrics, KW), link_barrier: r.barrier && pick(r.barrier, ["verdict", "median", "min", "weakest"]), ai_overview: r.aio.present, ai_overview_sources: head(r.aio.refs, 8).map((x) => x.url),
    forums_in_top5: r.ugcTop5, your_position: r.yourPos, people_also_ask: r.paa, organic: head(r.organic, 10).map((o) => ({ pos: o.pos, url: o.url, title: o.title, referring_domains: ((r.barrier && r.barrier.pages) || []).find((p) => p.url === o.url)?.rd ?? null })) };
  if (kind === "gap") return { you: r.you, competitors: r.competitors, candidates: r.candidates, missing: r.missing, weak: r.weak,
    shortlist: r.rows.filter((x) => x.shortlist).map((x) => pick(x, ["rank", "keyword", "score", "volume", "kd", "intent", "fit", "yourPos", "comps", "weakestRd", "medianRd", "verdict"])) };
  if (kind === "links") return { domain: r.domain, summary: r.summary && pick(r.summary, ["rank", "referringDomains", "dofollowDomains", "backlinks", "spamScore"]), totals: r.totals, compare: (r.compare || []).map((c) => pick(c, ["target", "rank", "referringDomains", "backlinks"])),
    referring_domains: head(r.referringDomains, n), backlinks: head(r.backlinks, n).map((b) => pick(b, ["from", "to", "anchor", "dofollow", "domainRank", "firstSeen"])), anchors: head(r.anchors, 15), top_linked_pages: head(r.pages, 10), new_lost_by_month: r.newLost };
  if (kind === "linkgap") return { you: r.you, competitors: r.competitors, total: r.total, link_to_all: r.all, link_to_2_or_more: r.multi, rows: head(r.rows, n) };
  if (kind === "mentions") return { target: r.target, mentions: r.mentions, ai_search_volume: r.volume, platforms: r.platforms, cited_domains: head(r.citedDomains, 15), top_pages: head(r.topPages, 10),
    questions: head(r.questions, n).map((x) => ({ question: x.question, platform: x.platform, volume: x.volume, your_position: x.yourPosition, sources: x.sources.slice(0, 5).map((s) => s.domain) })) };
  if (kind === "local") return { business: r.business, keyword: r.keyword, avg_rank: r.avgRank, found_at: `${r.found} of ${r.total} points`, top3_points: r.top3, grid: r.grid.map((p) => [p.r, p.c, p.rank]), competitors: head(r.competitors, 10) };
  if (kind === "audit") return { domain: r.domain, health: r.health, crawled: r.crawled, issue_counts: r.counts, lighthouse: r.speed, new_vs_last: r.diff && { new: r.diff.newIssues.length, fixed: r.diff.fixed.length },
    pages_with_errors: head(r.pages.filter((p) => p.issues.length), n).map((p) => ({ url: p.url, status: p.status, issues: p.issues.map(([i]) => i) })) };
  return r;
}
const answer = (job, n) => {
  if (!job) return { error: "job not found" };
  if (job.status === "error") return { job_id: Number(job.id), status: "error", error: job.error };
  if (job.status !== "done") return { job_id: Number(job.id), status: job.status, progress: job.progress, note: "Still running. Call get_job with this job_id in a few seconds." };
  return { job_id: Number(job.id), credits: Math.round(job.credits * 100) / 100, more: SECTIONS[job.kind] ? `Full rows: get_job with section = ${SECTIONS[job.kind].join(" | ")}` : undefined, ...brief(job.kind, job.result, n) };
};
const proj = async (a) => { if (!a.project_id) throw new Error("project_id is required (list_projects shows the ids)"); return project(Number(a.project_id)); };
const S = (props, required = []) => ({ type: "object", properties: props, required });
const str = (d) => ({ type: "string", description: d }), int = (d) => ({ type: "integer", description: d });
// Market: DataForSEO location code + language. Leave language out to use the location's own language.
const GEO = { location: int("DataForSEO location code (default 2840 = United States; 2826 UK, 2124 Canada, 2036 Australia, 2276 Germany, 2250 France, 2724 Spain, 2528 Netherlands, 2380 Italy, 2484 Mexico, 2076 Brazil, 2356 India, 2554 New Zealand)"),
  language: str("Language code: en, es, de, fr, nl, it, pt (default: the location's language)") };
const geo = (a) => ({ loc: locOf(a.location), lang: langOf(a.language, a.location) });

export const TOOLS = [
  { name: "list_projects", description: "Projects (one tracked site each) with their competitors.", input: S({}), run: async () => (await q("SELECT id, name, domain, competitors, about FROM projects ORDER BY id")) },
  { name: "create_project", description: "Add a site to track. Finds its Search Console + GA4 in the Graphed warehouse and suggests competitors (≈3 credits).", input: S({ domain: str("example.com"), competitors: { type: "array", items: { type: "string" }, description: "Up to 4 competitor domains (optional)" }, ...GEO }, ["domain"]),
    run: async (a) => { const d = cleanDomain(a.domain); const g = geo(a); const p = await one("INSERT INTO projects (name, domain, competitors, location, language) VALUES ($1, $1, $2, $3, $4) RETURNING *", [d, (a.competitors || []).map(cleanDomain).slice(0, 4), g.loc, g.lang]); const j = await runAndWait("setup", {}, p.id, 45000); return { project_id: p.id, domain: d, setup: j.status, ...(j.result || {}) }; } },
  { name: "site_overview", description: "Any domain: organic keywords, estimated traffic, top pages, competitors, backlink summary (≈21 credits per 1,000 keywords; cached 7 days).", input: S({ domain: str("example.com"), keywords_limit: int("Keywords to pull, default 1000"), ...GEO }, ["domain"]),
    run: async (a) => answer(await runAndWait("domain", { domain: a.domain, limit: a.keywords_limit || 1000, ...geo(a) })) },
  { name: "keyword_research", description: "Keyword ideas for a seed: volume, difficulty, CPC, intent, page-1 referring domains (≈9–16 credits).", input: S({ seed: str("Seed keyword"), limit: int("Ideas per source, default 100"), ...GEO }, ["seed"]),
    run: async (a) => answer(await runAndWait("keywords", { seed: a.seed, limit: a.limit || 100, ...geo(a) }), 40) },
  { name: "serp_check", description: "Page-1 results for a keyword with the link barrier (median + weakest referring domains), AI Overview sources and People Also Ask (≈4.5 credits).", input: S({ keyword: str("Keyword"), domain: str("Your domain, to get your position (optional)"), ...GEO }, ["keyword"]),
    run: async (a) => answer(await runAndWait("serp", { keyword: a.keyword, domain: a.domain, ...geo(a) })) },
  { name: "keyword_gap", description: "Keywords competitors rank top 20 for and the project does not, scored into a top-20 shortlist (≈40 credits + 4.5 per link-barrier keyword). Can take 1–3 minutes.", input: S({ project_id: int("Project id"), barrier_top: int("Check the link barrier for the top N, default 10") }, ["project_id"]),
    run: async (a) => { const p = await proj(a); return answer(await runAndWait("gap", { domain: p.domain, competitors: p.competitors, about: p.about, brandTerms: p.brand_terms, loc: p.location, lang: p.language, barrierTop: a.barrier_top ?? 10 }, p.id)); } },
  { name: "backlinks", description: "Backlink profile of any domain: referring domains, backlinks, anchors, top linked pages, new and lost per month (≈25 credits).", input: S({ domain: str("example.com"), dofollow_only: { type: "boolean" }, limit: int("Rows per table, default 500") }, ["domain"]),
    run: async (a) => answer(await runAndWait("links", { domain: a.domain, dofollow: !!a.dofollow_only, limit: a.limit || 500 })) },
  { name: "link_gap", description: "Sites that link to the project's competitors and not to the project: the outreach list (≈6 credits).", input: S({ project_id: int("Project id") }, ["project_id"]),
    run: async (a) => { const p = await proj(a); return answer(await runAndWait("linkgap", { domain: p.domain, competitors: p.competitors }, p.id), 40); } },
  { name: "ai_mentions", description: "Questions where Google AI Overviews and ChatGPT already mention a domain or a keyword, with cited sources (≈47 credits).", input: S({ target: str("A domain (example.com) or a keyword"), ...GEO }, ["target"]),
    run: async (a) => answer(await runAndWait("mentions", { target: a.target, limit: 50, ...geo(a) })) },
  { name: "local_rank_grid", description: "Google Maps rank of a business for one keyword on a grid around it (≈0.35 credits per grid point).", input: S({ business: str("Business name + city"), keyword: str("Keyword, e.g. plumber"), size: int("Grid size 3, 5 or 7 (default 5)"), spacing_km: { type: "number", description: "Distance between points, default 1.5" } }, ["business", "keyword"]),
    run: async (a) => answer(await runAndWait("local", { business: a.business, keyword: a.keyword, size: a.size || 5, spacingKm: a.spacing_km || 1.5 })) },
  { name: "rank_tracker", description: "Tracked keywords of a project with position, 1/7/30-day change and competitor positions. Free.", input: S({ project_id: int("Project id") }, ["project_id"]),
    run: async (a) => (await rankTable(Number(a.project_id))).map((r) => pick(r, ["keyword", "position", "change1", "change7", "change30", "best", "url", "competitors", "checked"])) },
  { name: "track_keywords", description: "Add keywords to a project's rank tracker and start a check (0.115 credits per 10 results per keyword).", input: S({ project_id: int("Project id"), keywords: { type: "array", items: { type: "string" } } }, ["project_id", "keywords"]),
    run: async (a) => { const p = await proj(a); const kws = [...new Set((a.keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 500); for (const k of kws) await pool.query("INSERT INTO tracked (project_id, keyword) VALUES ($1, $2) ON CONFLICT DO NOTHING", [p.id, k]); const j = await enqueue("rank", {}, p.id); return { added: kws.length, rank_check_job: Number(j.id) }; } },
  { name: "search_console", description: "Search Console + GA4 from the Graphed warehouse: totals vs the previous period, almost-there queries (positions 8–20), lost clicks, cannibalization, top pages. Free.", input: S({ project_id: int("Project id"), days: int("7, 28 or 90 (default 28)") }, ["project_id"]),
    run: async (a) => { const r = await gscReport(await proj(a), { days: a.days }); return r.connected ? { site: r.site, days: r.days, totals: r.totals, ga4: r.ga4, almost_there: head(r.almostThere, 30), lost_clicks: head(r.lost, 20), cannibalization: head(r.cannibal, 10), top_pages: head(r.pages, 20) } : { connected: false, note: "Pick the Search Console site in the project's Settings." }; } },
  { name: "site_audit", description: "Run a technical audit of the project's site (crawl + Lighthouse). The crawl is free; Lighthouse is ≈2 credits. Takes 1–3 minutes: poll get_job.", input: S({ project_id: int("Project id"), max_pages: int("Default 300"), latest: { type: "boolean", description: "true = return the last finished audit, do not run a new one" } }, ["project_id"]),
    run: async (a) => { const p = await proj(a); if (a.latest) return answer(await one("SELECT * FROM jobs WHERE project_id = $1 AND kind = 'audit' AND status = 'done' ORDER BY id DESC LIMIT 1", [p.id])); return answer(await runAndWait("audit", { domain: p.domain, maxPages: a.max_pages || 300 }, p.id, 40000)); } },
  { name: "ai_visibility", description: "Latest AI visibility run of a project: how often ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews name it, who is named instead, cited sites. Free to read.", input: S({ project_id: int("Project id") }, ["project_id"]),
    run: async (a) => { const s = await aiSummary(await proj(a)); return { runs: s.runs, mention_rate: s.rate, engines: s.engines, share_of_voice: s.shareOfVoice, competitor_wins: head(s.gaps, 15).map((g) => pick(g, ["prompt", "rate", "lostTo"])), cited_sites: head(s.cited, 30) }; } },
  { name: "keyword_lists", description: "Saved keyword lists. No arguments = all lists. With list_id = its keywords. With name + keywords = save keywords into that list (created if missing).", input: S({ list_id: int("List id"), name: str("List name to save into"), keywords: { type: "array", items: { type: "string" } } }),
    run: async (a) => { if (a.name && a.keywords) { const l = (await one("SELECT * FROM lists WHERE name = $1", [a.name])) || (await createList(a.name)); return { list_id: l.id, added: await addKeywords(l.id, a.keywords) }; } if (a.list_id) return listRows(Number(a.list_id)); return allLists(); } },
  { name: "get_job", description: "Status or result of a job. With section (and offset / limit) returns the full rows of one table of the result.", input: S({ job_id: int("Job id"), section: str("Table name from the result's `more` hint"), offset: int("Default 0"), limit: int("Default 100, max 500") }, ["job_id"]),
    run: async (a) => { const j = await one("SELECT * FROM jobs WHERE id = $1", [a.job_id]); if (!a.section || !j || j.status !== "done") return answer(j); const rows = j.result && j.result[a.section]; if (!Array.isArray(rows)) throw new Error(`no section "${a.section}"; this ${j.kind} job has: ${(SECTIONS[j.kind] || []).join(", ")}`); const off = Number(a.offset) || 0, lim = Math.min(Number(a.limit) || 100, 500); return { job_id: Number(j.id), section: a.section, total: rows.length, offset: off, rows: rows.slice(off, off + lim) }; } },
  { name: "credits", description: "Graphed credits this app spent (1 credit = 1 cent): today, 7 days, 30 days, and by tool.", input: S({}),
    run: async () => ({ ...(await one(`SELECT round(coalesce(sum(credits) FILTER (WHERE at > now() - interval '1 day'),0)::numeric,2) AS today, round(coalesce(sum(credits) FILTER (WHERE at > now() - interval '7 days'),0)::numeric,2) AS d7, round(coalesce(sum(credits) FILTER (WHERE at > now() - interval '30 days'),0)::numeric,2) AS d30 FROM credit_log`)),
      by_tool: await q(`SELECT tool, count(*)::int AS calls, round(sum(credits)::numeric, 2) AS credits FROM credit_log WHERE at > now() - interval '30 days' GROUP BY tool ORDER BY 3 DESC LIMIT 15`) }) },
];

const INFO = { name: "ai-seo-tool", version: "1.0.0" };
const INSTRUCTIONS = "AI SEO Tool on Graphed Cloud: keyword research, site overview, SERP + link barrier, keyword gap, backlinks, link gap, AI mentions, rank tracking, Search Console + GA4, site audit, AI visibility, local rank grid. Most tools cost Graphed credits (1 credit = 1 cent; the cost is in each description) and results are cached, so a repeat call is cheap. Start with list_projects. Long jobs return a job_id: call get_job until status is done. Results are trimmed; use get_job with section for full tables.";

async function rpc(method, params) {
  if (method === "initialize") return { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: INFO, instructions: INSTRUCTIONS };
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input })) };
  if (method === "tools/call") {
    const t = TOOLS.find((x) => x.name === params.name);
    if (!t) throw Object.assign(new Error(`unknown tool ${params.name}`), { code: -32602 });
    try { const r = await t.run(params.arguments || {}); return { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r, null, 1) }] }; }
    catch (e) { return { content: [{ type: "text", text: String(e.message || e) }], isError: true }; }
  }
  throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
}

export async function mcpRoute(req, res, readBody) {
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
  if (!(await tokenOf(req))) { res.setHeader("www-authenticate", "Bearer"); return send(401, { error: "Send Authorization: Bearer <token>. Make a token on the Agent access page of AI SEO Tool." }); }
  if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); return res.end(); }
  const body = await readBody(req);
  const one1 = async (m) => {
    if (!m || m.id === undefined) return null; // notification
    try { return { jsonrpc: "2.0", id: m.id, result: await rpc(m.method, m.params || {}) }; }
    catch (e) { return { jsonrpc: "2.0", id: m.id, error: { code: e.code || -32603, message: e.message } }; }
  };
  const out = Array.isArray(body) ? (await Promise.all(body.map(one1))).filter(Boolean) : await one1(body);
  if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202); return res.end(); }
  return send(200, out);
}
