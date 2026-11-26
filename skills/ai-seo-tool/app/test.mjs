// Offline test: in-memory Postgres, Graphed Tools / LLM / warehouse faked from fixtures/. No credits.
//   node test.mjs
// Never touch a configured database: lib/db.mjs prefers DATABASE_URL over PGLite.
delete process.env.DATABASE_URL;
process.env.PGLITE_DIR = "memory";
const { readFileSync } = await import("node:fs");
const { migrate, one, q, pool } = await import("./lib/db.mjs");
const { setFake } = await import("./lib/tools.mjs");
const { enqueue, runJob } = await import("./lib/jobs.mjs");
const { analyze } = await import("./lib/ai.mjs");

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));
const MAP = {
  "dataforseo:labs.keyword_overview.live": "keyword_overview", "dataforseo:labs.keyword_ideas.live": "keyword_ideas",
  "dataforseo:labs.related_keywords.live": "related_keywords", "dataforseo:labs.keyword_suggestions.live": "keyword_suggestions",
  "dataforseo:labs.domain_rank_overview.live": "domain_rank_overview", "dataforseo:labs.competitors_domain.live": "competitors_domain",
  "dataforseo:labs.ranked_keywords.live": "ranked_keywords", "dataforseo:backlinks.summary.live": "backlinks_summary",
  "dataforseo:serp.google.organic.live.advanced": "serp", "dataforseo:technologies.domain_technologies.live": "technologies",
  "serper:search": "serper_search", "serper:autocomplete": "serper_autocomplete", "serper:maps": "serper_maps",
  "dataforseo:backlinks.backlinks.live": "bl_backlinks", "dataforseo:backlinks.referring_domains.live": "bl_referring_domains", "dataforseo:backlinks.anchors.live": "bl_anchors",
  "dataforseo:backlinks.domain_pages_summary.live": "bl_pages", "dataforseo:backlinks.history.live": "bl_history", "dataforseo:backlinks.timeseries_new_lost_summary.live": "bl_new_lost",
  "dataforseo:backlinks.domain_intersection.live": "bl_intersection", "dataforseo:labs.relevant_pages.live": "relevant_pages", "dataforseo:labs.serp_competitors.live": "serp_competitors",
  "dataforseo:ai_optimization.llm_mentions.search.live": "llm_search", "dataforseo:ai_optimization.llm_mentions.aggregated_metrics.live": "llm_agg",
  "dataforseo:ai_optimization.llm_mentions.top_pages.live": "llm_top_pages", "dataforseo:on_page.lighthouse.live.json": "lighthouse",
};
let calls = 0;
let llmFail = null;   // (model) => true makes that model's request fail
let toolOverride = null;   // (id, input) => result, or undefined to use the fixtures
setFake(
  async (id, input) => {
    if (toolOverride) { const o = await toolOverride(id, input); if (o !== undefined) return o; }
    calls++;
    if (id === "serper:scrape") return { markdown: "We sell AI agents for marketing teams." };
    // One bulk call returns a count for every URL it was sent.
    if (id === "dataforseo:backlinks.bulk_referring_domains.live") return { cost: 0.024, tasks: [{ status_code: 20000, result: [{ items: input.targets.map((t, i) => ({ target: t, referring_domains: 3 + i * 4, referring_domains_nofollow: 1, referring_main_domains: 3 + i * 3 })) }] }] };
    const f = MAP[id];
    if (!f) throw new Error(`no fixture for ${id}`);
    const j = fx(f);
    // Make each domain's ranked keywords differ so the gap has candidates.
    if (id === "dataforseo:labs.ranked_keywords.live" && input.target !== "graphed.com") {
      for (const it of j.tasks[0].result[0].items) { it.keyword_data.keyword += " tool " + input.target.length; it.ranked_serp_element.serp_item.rank_group = 4; }
    }
    return j;
  },
  async (model, messages) => {
    if (llmFail && llmFail(model)) throw new Error(`provider down: ${model}`);
    const m = messages[0].content;
    let content = "Semrush and Ahrefs are popular. Graphed is also good. https://zapier.com/blog/x";
    if (/score 0-3/.test(m)) content = JSON.stringify({ s: Array(200).fill(3) });
    if (/Write 15 questions/.test(m)) content = JSON.stringify({ prompts: ["best seo tool for agencies", "ahrefs alternative cheap"] });
    if (/2 plain sentences/.test(m)) content = "Graphed sells AI marketing agents. For founder-led companies.";
    return { choices: [{ message: { content, annotations: [{ type: "url_citation", url_citation: { url: "https://zapier.com/blog/x" } }] } }], usage: { cost: 0.001 } };
  },
  async (sql) => (/system\.tables/.test(sql) ? [] : []),
);

let fails = 0;
const check = async (name, fn) => { try { const note = await fn(); console.log(`ok   ${name}${note ? `  ${note}` : ""}`); } catch (e) { fails++; console.log(`FAIL ${name}: ${e.stack || e.message}`); } };
const run = async (kind, input, pid = null) => { const j = await enqueue(kind, input, pid); return runJob(j); };

await migrate();
const p = await one(`INSERT INTO projects (name, domain, competitors) VALUES ('Graphed', 'graphed.com', '{semrush.com,ahrefs.com}') RETURNING *`);

await check("setup", async () => { const r = await run("setup", {}, p.id); return `about: ${r.about.slice(0, 40)}…`; });
await check("domain", async () => { const r = await run("domain", { domain: "https://www.graphed.com/", limit: 1000 }); if (!r.keywords.length || !r.pages.length) throw new Error("empty"); return `${r.keywords.length} kw, ${r.pages.length} pages, ${r.competitors.length} competitors, rank ${r.backlinks.rank}`; });
await check("keywords", async () => { const r = await run("keywords", { seed: "seo tool", limit: 5 }); if (!r.seedRow) throw new Error("no seed row"); return `${r.keywords.length} keywords, seed volume ${r.seedRow.volume}`; });
await check("serp", async () => { const r = await run("serp", { keyword: "best seo tool", domain: "graphed.com" }); if (!r.barrier || r.barrier.median == null) throw new Error("no barrier"); return `${r.organic.length} organic, aio ${r.aio.present} (${r.aio.refs.length} refs), ${r.barrier.verdict}`; });
await check("gap", async () => { const r = await run("gap", { domain: "graphed.com", competitors: ["semrush.com", "ahrefs.com"], minVolume: 0, barrierTop: 2 }, p.id); if (!r.rows.length) throw new Error("no candidates"); return `${r.candidates} candidates, top: ${r.rows[0].keyword} (${r.rows[0].score})`; });
await check("backlinks", async () => { const r = await run("backlinks", { domain: "graphed.com", competitors: ["semrush.com"] }, p.id); return `${r.domains.length} domains`; });
await check("rank", async () => {
  await pool.query("INSERT INTO tracked (project_id, keyword) VALUES ($1, 'best seo tool')", [p.id]);
  await run("rank", {}, p.id);
  const r = await one("SELECT * FROM ranks LIMIT 1");
  return `position ${r.position}, ${r.top.length} results stored`;
});
await check("ai", async () => {
  await pool.query("INSERT INTO prompts (project_id, prompt) VALUES ($1, 'best seo tool')", [p.id]);
  const r = await run("ai", { runs: 1, engines: ["chatgpt", "aio"] }, p.id);
  return `rate ${r.rate}%, sov ${r.shareOfVoice.map((x) => x.domain).join(",")}`;
});
await check("analyze", async () => {
  const a = analyze({ domain: "graphed.com", competitors: ["semrush.com"], brand_terms: [] }, "Try Semrush first, then Graphed.", []);
  if (!a.mentioned || a.position !== 2) throw new Error(JSON.stringify(a));
});
await check("link barrier = 1 bulk call", async () => { const r = await run("serp", { keyword: "bulk barrier test" }); if (r.barrier.min !== 3 || r.barrier.pages[1].rd !== 7) throw new Error(JSON.stringify(r.barrier)); const n = await one("SELECT count(*)::int n FROM credit_log WHERE tool LIKE '%bulk_referring%'"); return `min ${r.barrier.min}, median ${r.barrier.median}; ${n.n} bulk calls logged`; });
await check("top pages (Labs)", async () => { const r = await run("domain", { domain: "graphed.com", limit: 1000 }); if (!r.pages.length || r.pages[0].keywords == null || r.pagesTotal == null) throw new Error("pages"); return `${r.pages.length} pages of ${r.pagesTotal}, first: ${r.pages[0].etv} visits, ${r.pages[0].keywords} keywords`; });
await check("links", async () => { const r = await run("links", { domain: "graphed.com", competitors: ["semrush.com"] }, p.id); if (!r.backlinks.length || !r.referringDomains.length || !r.anchors.length || !r.pages.length || !r.history.length || !r.newLost.length) throw new Error("empty section"); return `${r.backlinks.length} backlinks (${r.totals.backlinks} total), ${r.referringDomains.length} domains, ${r.anchors.length} anchors, ${r.history.length} history points, compare ${r.compare.length}`; });
await check("link gap", async () => { const r = await run("linkgap", { domain: "graphed.com", competitors: ["julius.ai", "thebricks.com"] }, p.id); if (!r.rows.length || r.rows[0].count < 1) throw new Error("no rows"); return `${r.rows.length} sites (${r.total} total), top ${r.rows[0].domain} links to ${r.rows[0].count}`; });
await check("ai mentions", async () => { const r = await run("mentions", { target: "graphed.com" }); if (!r.questions.length || !r.citedDomains.length || !r.topPages.length) throw new Error("empty"); return `${r.mentions} mentions, ${r.questions.length} questions, top cited ${r.citedDomains[0].domain}, you flagged: ${r.citedDomains.some((d) => d.you)}`; });
await check("local grid", async () => { const r = await run("local", { business: "Third Wheel Coffee San Francisco", keyword: "coffee shop", size: 3 }, p.id); if (r.grid.length !== 9 || r.avgRank == null) throw new Error(JSON.stringify(r).slice(0, 200)); return `${r.business.title}: avg rank ${r.avgRank}, top 3 at ${r.top3}/${r.total}, ${r.competitors.length} competitors`; });
await check("lighthouse", async () => { const { lighthouse } = await import("./lib/audit.mjs"); const r = await lighthouse("https://www.graphed.com/"); if (!r.scores || r.scores.performance == null || !r.failed.length) throw new Error(JSON.stringify(r).slice(0, 200)); return `performance ${r.scores.performance}, seo ${r.scores.seo}, LCP ${r.lcp} ms, ${r.failed.length} failed checks`; });
await check("keyword lists", async () => {
  const L = await import("./lib/lists.mjs");
  const l = await L.createList("Test list"); const n = await L.addKeywords(l.id, [{ keyword: "SEO Tool", volume: 100, kd: 20 }, "ahrefs alternative"]);
  await L.addKeywords(l.id, ["seo tool"]); // must keep the metrics
  const rows = await L.listRows(l.id); if (rows.length !== 2 || rows.find((r) => r.keyword === "seo tool").volume !== 100) throw new Error(JSON.stringify(rows));
  const ref = await L.refreshList(l.id); const who = await L.listCompetitors(l.id);
  return `${n} added, ${ref.refreshed} refreshed, ${who.domains.length} ranking domains`;
});
await check("mcp", async () => {
  const M = await import("./lib/mcp.mjs");
  const tk = await M.createToken("test");
  const call = async (headers, body) => { let code = 0, out = ""; const res = { setHeader() {}, writeHead(c) { code = c; }, end(s) { out = s || ""; } }; await M.mcpRoute({ method: "POST", headers }, res, async () => body); return { code, json: out ? JSON.parse(out) : null }; };
  const no = await call({}, { jsonrpc: "2.0", id: 1, method: "tools/list" }); if (no.code !== 401) throw new Error(`no token → ${no.code}`);
  const bad = await call({ authorization: "Bearer seo_" + "0".repeat(48) }, { jsonrpc: "2.0", id: 1, method: "tools/list" }); if (bad.code !== 401) throw new Error(`bad token → ${bad.code}`);
  const H = { authorization: `Bearer ${tk.token}` };
  const init = await call(H, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }); if (!init.json.result.serverInfo) throw new Error("initialize");
  const tools = (await call(H, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json.result.tools;
  const lp = await call(H, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_projects", arguments: {} } });
  const projects = JSON.parse(lp.json.result.content[0].text); if (!projects.length) throw new Error("no projects");
  const rk = await call(H, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "rank_tracker", arguments: { project_id: p.id } } }); if (rk.json.result.isError) throw new Error(rk.json.result.content[0].text);
  const note = await call(H, { jsonrpc: "2.0", method: "notifications/initialized" }); if (note.code !== 202) throw new Error(`notification → ${note.code}`);
  await M.revokeToken(tk.id); const gone = await call(H, { jsonrpc: "2.0", id: 5, method: "tools/list" }); if (gone.code !== 401) throw new Error("revoked token still works");
  return `${tools.length} tools; 401 without, with a wrong and with a revoked token`;
});
await check("cache", async () => { const before = calls; await run("serp", { keyword: "best seo tool", domain: "graphed.com" }); if (calls !== before) throw new Error(`${calls - before} uncached calls`); return "repeat run made 0 tool calls"; });
await check("credits", async () => { const r = await one("SELECT round(sum(credits)::numeric, 2) c, count(*)::int n FROM credit_log"); return `${r.n} log rows, ${r.c} credits`; });
await check("audit parse", async () => {
  const { RULES } = await import("./lib/audit.mjs");
  return `${Object.keys(RULES).length} rules`;
});

// ---------- review fixes ----------
await check("test db is in memory", async () => { if (process.env.DATABASE_URL) throw new Error("DATABASE_URL still set"); });
await check("new projects: weekly paid work off", async () => {
  const x = await one("INSERT INTO projects (name, domain) VALUES ('x', 'x.com') RETURNING weekly_audit, weekly_ai");
  if (x.weekly_audit || x.weekly_ai) throw new Error(JSON.stringify(x));
  return "weekly_audit and weekly_ai default to false";
});
await check("cli job is inserted running", async () => {
  const j = await enqueue("keywords", { seed: "x" }, null, { running: true });
  if (j.status !== "running" || !j.heartbeat_at) throw new Error(JSON.stringify(j));
  const free = await one("SELECT id FROM jobs WHERE id = $1 AND (status = 'queued' OR (status = 'running' AND heartbeat_at < now() - interval '2 minutes'))", [j.id]);
  if (free) throw new Error("worker could claim it");
  await pool.query("UPDATE jobs SET status = 'done' WHERE id = $1", [j.id]);
  return "the worker's claim query does not match it";
});
await check("retries keep the run id", async () => {
  const T = await import("./lib/tools.mjs");
  T.retryTiming.baseMs = 0;
  let starts = 0, waits = 0, downloads = 0;
  const tools = {
    start: async () => { starts++; return { id: "run_1" }; },
    wait: async (id) => { if (id !== "run_1") throw new Error("wrong id"); if (++waits === 1) throw new Error("fetch failed: ETIMEDOUT"); return { status: "ready" }; },
    downloadResult: async (id) => { if (id !== "run_1") throw new Error("wrong id"); if (++downloads < 3) throw new Error("Download timed out"); return { ok: 1 }; },
  };
  const r = await T.runWith(tools, "dataforseo:x", {});
  if (!r.ok || starts !== 1) throw new Error(`starts ${starts}, waits ${waits}, downloads ${downloads}`);
  let s2 = 0;
  const bad = { start: async () => { s2++; throw new Error("400 bad request"); }, wait: async () => ({}), downloadResult: async () => ({}) };
  await T.runWith(bad, "dataforseo:x", {}).then(() => { throw new Error("no error"); }, (e) => { if (s2 !== 1) throw new Error(`non-transient error retried ${s2} times`); });
  return `1 start, ${waits} waits, ${downloads} downloads; a 400 is not retried`;
});
await check("same lookup at once pays once", async () => {
  const T = await import("./lib/tools.mjs");
  let n = 0;
  toolOverride = async (id) => { if (id !== "serper:search") return undefined; n++; await new Promise((r) => setTimeout(r, 50)); return { credits: 1, organic: [] }; };
  const before = (await one("SELECT count(*)::int c FROM credit_log")).c;
  const input = { q: "inflight test " + Date.now() };
  const [a, b, c] = await Promise.all([T.call("serper:search", input), T.call("serper:search", input), T.call("serper:search", input)]);
  const after = (await one("SELECT count(*)::int c FROM credit_log")).c;
  toolOverride = null;
  if (n !== 1 || after - before !== 1 || a !== b || b !== c) throw new Error(`${n} vendor calls, ${after - before} credit rows`);
  return "3 callers, 1 vendor call, 1 credit row";
});
await check("serper credits use the vendor count", async () => {
  const { creditsOf } = await import("./lib/tools.mjs");
  const maps = creditsOf("serper:maps", fx("serper_maps")), search = creditsOf("serper:search", fx("serper_search")), none = creditsOf("serper:scrape", {});
  if (maps !== 0.345 || search !== 0.115 || none !== 0.115) throw new Error(`${maps} ${search} ${none}`);
  return "maps 0.345, search 0.115";
});
await check("AI run: all failed = error", async () => {
  llmFail = () => true;
  try {
    await run("ai", { runs: 1, engines: ["chatgpt"] }, p.id).then(() => { throw new Error("job finished"); }, (e) => { if (!/every AI request failed/.test(e.message)) throw e; });
    const j = await one("SELECT status FROM jobs WHERE kind = 'ai' ORDER BY id DESC LIMIT 1"); if (j.status !== "error") throw new Error(j.status);
  } finally { llmFail = null; }
  return "job status error, not a 0% rate";
});
await check("AI run: partial failure is shown", async () => {
  llmFail = (m) => m.startsWith("openai/");
  try {
    const r = await run("ai", { runs: 1, engines: ["chatgpt", "claude"] }, p.id);
    if (r.failed !== 1 || r.runs !== 1 || !r.errors.length) throw new Error(JSON.stringify({ failed: r.failed, runs: r.runs }));
    const { summary } = await import("./lib/ai.mjs");
    const s = await summary(p); if (s.failed !== 1) throw new Error(`page summary failed = ${s.failed}`);
    return `1 failed, 1 counted; page summary says ${s.failed} failed`;
  } finally { llmFail = null; }
});
await check("language", async () => {
  const { langOf, locOf } = await import("./lib/seo.mjs");
  const cases = [[langOf("", 2276), "de"], [langOf(undefined, 2840), "en"], [langOf("es", 2840), "es"], [langOf("xx", 2250), "fr"], [langOf(null, 2076), "pt"], [String(locOf(9999)), "2840"]];
  const bad = cases.filter(([a, b]) => a !== b); if (bad.length) throw new Error(JSON.stringify(bad));
  let sent = null;
  const T = await import("./lib/tools.mjs");
  toolOverride = (id, input) => { if (id === "dataforseo:labs.keyword_overview.live") sent = input; return undefined; };
  const L = await import("./lib/lists.mjs");
  const l = await L.createList("de list"); await L.addKeywords(l.id, ["seo werkzeug"]); await L.refreshList(l.id, { loc: 2276 });
  toolOverride = null;
  if (!sent || sent.languageCode !== "de" || sent.locationCode !== 2276) throw new Error(JSON.stringify(sent));
  return "location default + explicit language reach DataForSEO";
});
await check("crawler blocks private hosts", async () => {
  const A = await import("./lib/audit.mjs");
  const priv = ["127.0.0.1", "10.0.0.5", "169.254.169.254", "172.31.255.1", "192.168.0.1", "100.64.0.1", "0.0.0.0", "::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"];
  const pub = ["8.8.8.8", "1.1.1.1", "2606:4700::1111"];
  const wrong = [...priv.filter((x) => !A.privateIp(x)), ...pub.filter((x) => A.privateIp(x))]; if (wrong.length) throw new Error(`misclassified ${wrong}`);
  for (const u of ["http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "file:///etc/passwd", "http://foo.internal/"]) {
    const ok = await A.assertPublicUrl(u).then(() => true, () => false); if (ok) throw new Error(`allowed ${u}`);
  }
  // A test site on 127.0.0.1 (let through for the test) that redirects to the metadata address, and lists a private sitemap.
  const http = await import("node:http");
  const srv = http.createServer((req, res) => {
    if (req.url === "/go") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); return res.end(); }
    if (req.url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\nSitemap: http://127.0.0.2:9/sitemap.xml\n"); }
    res.writeHead(200, { "content-type": "text/html" }); res.end("<html><head><title>t</title></head><body><a href='/go'>go</a></body></html>");
  }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  A.guardAllow.add(origin);
  try {
    const home = await A.get(origin + "/"); if (home.status !== 200) throw new Error("allowed test origin failed");
    const hop = await A.get(origin + "/go", { redirect: "follow" }).then(() => "followed", (e) => e.message);
    if (!/blocked/.test(hop)) throw new Error(`redirect hop: ${hop}`);
    const chain = await A.fetchChain(origin + "/go").then(() => "followed", (e) => e.message);
    if (!/blocked/.test(chain)) throw new Error(`fetchChain hop: ${chain}`);
    const sm = await A.get("http://127.0.0.2:9/sitemap.xml").then(() => "fetched", (e) => e.message);
    if (!/blocked/.test(sm)) throw new Error(`sitemap: ${sm}`);
  } finally { A.guardAllow.delete(origin); srv.close(); }
  const audit = await run("audit", { domain: "localhost" }).then(() => "ran", (e) => e.message);
  if (!/blocked/.test(audit)) throw new Error(`audit of localhost: ${audit}`);
  return `${priv.length} private + ${pub.length} public addresses, redirect hop, sitemap and localhost audit blocked`;
});
await check("save to list keeps its anchor", async () => {
  const src = readFileSync(new URL("./ui/app.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function saveToList"), src.indexOf("const rankB"));
  const iAnchor = fn.indexOf("const anchor = e.currentTarget"), iAwait = fn.indexOf("await api(");
  if (iAnchor < 0 || iAnchor > iAwait || !/\], anchor\);\s*\}$/.test(fn.trim())) throw new Error("anchor is not saved before the await, or not passed to menu()");
  return "button saved before the await and passed to menu()";
});
await pool.end();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
