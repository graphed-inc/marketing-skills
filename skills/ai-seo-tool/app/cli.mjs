// Terminal access (run with `graphed exec --project <slug> -- node cli.mjs …`).
// Research commands run inline and print JSON; results are saved as jobs, visible in the UI.
//
//   node cli.mjs projects                                list projects
//   node cli.mjs add <domain> ["comp1, comp2"] [location] [language]  new project (finds GSC + GA4, suggests competitors);
//                                                        location = DataForSEO code (2840 US), language = en|es|de|fr|nl|it|pt
//   node cli.mjs domain <domain> [limit]                 Site Explorer
//   node cli.mjs keywords <seed> [limit]                 Keywords Explorer
//   node cli.mjs serp "<keyword>" [domain]               SERP + link barrier
//   node cli.mjs gap <projectId> [perDomain] [barrierTop] keyword gap → top 20
//   node cli.mjs links <domain> [limit]                  backlinks: referring domains, anchors, new / lost
//   node cli.mjs linkgap <projectId>                     sites that link to competitors and not to the project
//   node cli.mjs mentions "<domain | keyword>"           AI answers that mention it (Google AI + ChatGPT)
//   node cli.mjs local "<business + city>" "<keyword>" [size]  Google Maps rank grid
//   node cli.mjs token "<name>"                          make an MCP token (printed one time)
//   node cli.mjs track <projectId> "<kw>, <kw>"          add tracked keywords
//   node cli.mjs ranks <projectId> [check]               rank table (check = run a check first)
//   node cli.mjs audit <projectId> [maxPages]            site audit
//   node cli.mjs ai <projectId> [runs]                   AI visibility run
//   node cli.mjs gsc <projectId> [days]                  Search Console + GA4 summary
//   node cli.mjs jobs | job <id> | credits | sql "<select>"
import { q, one, pool, migrate } from "./lib/db.mjs";
import { enqueue, runJob, project } from "./lib/jobs.mjs";
import { rankTable } from "./lib/rank.mjs";
import { gscReport } from "./lib/gsc.mjs";

const [cmd, a, b, c, d] = process.argv.slice(2);
const out = (x) => process.stdout.write((typeof x === "string" ? x : JSON.stringify(x, null, 2)) + "\n");
// The job is inserted already running, so the web worker cannot claim it and run it a second time.
const runInline = async (kind, input, pid = null) => { const j = await enqueue(kind, input, pid, { running: true }); const r = await runJob(j); const done = await one("SELECT credits FROM jobs WHERE id = $1", [j.id]); return { job: j.id, credits: done.credits, result: r }; };
const brief = (k, r) => {
  if (k === "domain") return { domain: r.domain, overview: r.overview, backlinks: r.backlinks && { rank: r.backlinks.rank, referringDomains: r.backlinks.referringDomains }, topKeywords: r.keywords.slice(0, 25), topPages: r.pages.slice(0, 10), competitors: r.competitors.slice(0, 10) };
  if (k === "keywords") return { seed: r.seedRow, keywords: r.keywords.slice(0, 50) };
  if (k === "gap") return { candidates: r.candidates, shortlist: r.rows.filter((x) => x.shortlist).map(({ keyword, score, volume, kd, intent, fit, yourPos, comps, weakestRd, medianRd, verdict }) => ({ keyword, score, volume, kd, intent, fit, yourPos, comps, weakestRd, medianRd, verdict })) };
  if (k === "audit") return { health: r.health, crawled: r.crawled, counts: r.counts, diff: r.diff && { new: r.diff.newIssues.length, fixed: r.diff.fixed.length }, speed: r.speed };
  return r;
};
try {
  await migrate();
  const pr = async () => project(Number(a));
  if (cmd === "projects") for (const p of await q("SELECT id, name, domain, competitors FROM projects ORDER BY id")) out(`${p.id}\t${p.domain}\t${p.name}\t${p.competitors.join(", ")}`);
  else if (cmd === "add") {
    const comps = String(b || "").split(/[\s,]+/).filter(Boolean);
    const { cleanDomain, locOf, langOf } = await import("./lib/seo.mjs");
    const p = await one("INSERT INTO projects (name, domain, competitors, location, language) VALUES ($1, $1, $2, $3, $4) RETURNING *", [cleanDomain(a), comps.map(cleanDomain).slice(0, 4), locOf(c), langOf(d, c)]);
    const r = await runInline("setup", {}, p.id); out({ project: p.id, ...r.result });
  }
  else if (cmd === "domain") { const r = await runInline("domain", { domain: a, limit: Number(b) || 1000 }); out({ job: r.job, credits: r.credits, ...brief("domain", r.result) }); }
  else if (cmd === "keywords") { const r = await runInline("keywords", { seed: a, limit: Number(b) || 300 }); out({ job: r.job, credits: r.credits, ...brief("keywords", r.result) }); }
  else if (cmd === "serp") { const r = await runInline("serp", { keyword: a, domain: b }); out({ job: r.job, credits: r.credits, ...r.result }); }
  else if (cmd === "gap") { const p = await pr(); const r = await runInline("gap", { domain: p.domain, competitors: p.competitors, about: p.about, brandTerms: p.brand_terms, loc: p.location, lang: p.language, perDomain: Number(b) || 1000, barrierTop: c != null ? Number(c) : 10 }, p.id); out({ job: r.job, credits: r.credits, ...brief("gap", r.result) }); }
  else if (cmd === "links") { const r = await runInline("links", { domain: a, limit: Number(b) || 500 }); const x = r.result; out({ job: r.job, credits: r.credits, summary: x.summary, totals: x.totals, referringDomains: x.referringDomains.slice(0, 30), anchors: x.anchors.slice(0, 15), topPages: x.pages.slice(0, 10), newLost: x.newLost }); }
  else if (cmd === "linkgap") { const p = await pr(); const r = await runInline("linkgap", { domain: p.domain, competitors: p.competitors }, p.id); out({ job: r.job, credits: r.credits, total: r.result.total, linkToAll: r.result.all, rows: r.result.rows.slice(0, 40) }); }
  else if (cmd === "mentions") { const r = await runInline("mentions", { target: a, limit: 50 }); const x = r.result; out({ job: r.job, credits: r.credits, mentions: x.mentions, volume: x.volume, platforms: x.platforms, citedDomains: x.citedDomains.slice(0, 15), questions: x.questions.slice(0, 25).map(({ question, platform, volume, yourPosition }) => ({ question, platform, volume, yourPosition })) }); }
  else if (cmd === "local") { const r = await runInline("local", { business: a, keyword: b, size: Number(c) || 5 }); const x = r.result; out({ job: r.job, credits: r.credits, business: x.business, avgRank: x.avgRank, found: `${x.found}/${x.total}`, top3: x.top3, grid: x.grid.map((g) => g.rank), competitors: x.competitors.slice(0, 10) }); }
  else if (cmd === "token") { const { createToken } = await import("./lib/mcp.mjs"); out(await createToken(a || "CLI")); }
  else if (cmd === "track") { const p = await pr(); for (const k of String(b || "").split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)) await pool.query("INSERT INTO tracked (project_id, keyword) VALUES ($1,$2) ON CONFLICT DO NOTHING", [p.id, k]); out(await rankTable(p.id)); }
  else if (cmd === "ranks") { const p = await pr(); if (b === "check") await runInline("rank", {}, p.id); out((await rankTable(p.id)).map(({ keyword, position, change1, change7, best, url }) => ({ keyword, position, change1, change7, best, url }))); }
  else if (cmd === "audit") { const p = await pr(); const r = await runInline("audit", { domain: p.domain, maxPages: Number(b) || 300 }, p.id); out({ job: r.job, ...brief("audit", r.result) }); }
  else if (cmd === "ai") { const p = await pr(); const r = await runInline("ai", { runs: Number(b) || 3 }, p.id); out({ job: r.job, credits: r.credits, rate: r.result.rate, engines: r.result.engines, shareOfVoice: r.result.shareOfVoice, gaps: r.result.gaps.slice(0, 10), cited: r.result.cited.slice(0, 20) }); }
  else if (cmd === "gsc") { const p = await pr(); const r = await gscReport(p, { days: Number(b) || 28 }); out(r.connected ? { totals: r.totals, ga4: r.ga4, almostThere: r.almostThere.slice(0, 30), lost: r.lost.slice(0, 20), cannibal: r.cannibal.slice(0, 10) } : r); }
  else if (cmd === "jobs") for (const j of await q("SELECT id, kind, status, title, credits, created_at FROM jobs ORDER BY id DESC LIMIT 30")) out(`${j.id}\t${j.kind}\t${j.status}\t${Number(j.credits).toFixed(2)} cr\t${j.title}`);
  else if (cmd === "job") out(await one("SELECT * FROM jobs WHERE id = $1", [a]));
  else if (cmd === "credits") out(await q("SELECT tool, count(*)::int calls, round(sum(credits)::numeric, 2) credits FROM credit_log WHERE at > now() - interval '30 days' GROUP BY tool ORDER BY 3 DESC"));
  else if (cmd === "sql") { if (!/^\s*(select|with)\b/i.test(a || "")) throw new Error("sql: SELECT only"); out(await q(a)); }
  else out("commands: projects | add | domain | keywords | serp | gap | links | linkgap | mentions | local | track | ranks | audit | ai | gsc | token | jobs | job | credits | sql");
} catch (e) { process.stderr.write(`error: ${e.message}\n`); process.exitCode = 1; }
await pool.end();
