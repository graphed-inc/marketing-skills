// AI visibility: buyer prompts × engines × runs. Engines with web search through the Graphed
// OpenRouter proxy, plus Google AI Overviews from the DataForSEO SERP.
import { q, one, pool } from "./db.mjs";
import { chat, chatJson, call, dfsResult, lanes } from "./tools.mjs";
import { cleanDomain, langOf } from "./seo.mjs";

export const ENGINES = [
  { id: "chatgpt", name: "ChatGPT", model: "openai/gpt-5-mini:online", max_tokens: 3000 },
  { id: "perplexity", name: "Perplexity", model: "perplexity/sonar", max_tokens: 1200 },
  { id: "gemini", name: "Gemini", model: "google/gemini-2.5-flash:online", max_tokens: 1500 },
  { id: "claude", name: "Claude", model: "anthropic/claude-haiku-4.5:online", max_tokens: 1500 },
  { id: "aio", name: "Google AI Overview", model: null },
];

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const brandName = (d) => cleanDomain(d).split(".")[0];
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Brand list: you + competitors, each matched by name or domain.
function brands(p) {
  const mk = (d, extra = []) => ({ domain: cleanDomain(d), terms: [...new Set([brandName(d), cleanDomain(d), ...extra].map((s) => s.toLowerCase()).filter((s) => s.length > 2))] });
  return [mk(p.domain, p.brand_terms || []), ...(p.competitors || []).map((c) => mk(c))];
}
function firstIndex(text, terms) {
  let best = -1;
  for (const t of terms) { const m = new RegExp(`(^|[^a-z0-9])${reEsc(t)}`, "i").exec(text); if (m && (best < 0 || m.index < best)) best = m.index; }
  return best;
}

export function analyze(p, text, citations) {
  const list = brands(p);
  const found = list.map((b) => ({ domain: b.domain, at: firstIndex(text, b.terms) }))
    .concat([]).map((b) => ({ ...b, cited: citations.some((c) => hostOf(c) === b.domain || hostOf(c).endsWith("." + b.domain)) }))
    .filter((b) => b.at >= 0 || b.cited)
    .sort((a, b) => (a.at < 0 ? 1e9 : a.at) - (b.at < 0 ? 1e9 : b.at));
  const me = cleanDomain(p.domain);
  const idx = found.findIndex((b) => b.domain === me);
  return { mentioned: idx >= 0, position: idx >= 0 ? idx + 1 : null, brands: found.map((b) => b.domain) };
}

export async function suggestPrompts(p, extra, ctx) {
  const j = await chatJson([{ role: "user", content:
`Write 15 questions a real buyer would type into ChatGPT or Perplexity while choosing a product like the one this business sells.
Business: ${p.domain}
About: ${p.about || "(infer from the domain)"}
Competitors: ${(p.competitors || []).join(", ") || "(unknown)"}
${extra ? `Keywords they want to win: ${extra}` : ""}
Rules: do not name the business or any competitor. Mix "best X for Y", "how do I…", "X vs Y alternatives", and problem-first questions with a real constraint (budget, team size, industry, location).
Return JSON only: {"prompts":["...", ...]}` }], { ctx });
  return (j.prompts || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 25);
}

export async function runAi(p, input, ctx, jobId, progress = () => {}) {
  const runs = Math.max(1, Math.min(Number(input.runs) || 3, 5));
  const engines = ENGINES.filter((e) => !input.engines || input.engines.includes(e.id));
  const prompts = await q(`SELECT * FROM prompts WHERE project_id = $1 ${input.promptIds ? "AND id = ANY($2::int[])" : ""} ORDER BY id`, input.promptIds ? [p.id, input.promptIds] : [p.id]);
  if (!prompts.length) throw new Error("add prompts first");
  const tasks = [];
  for (const pr of prompts) for (const e of engines) for (let r = 1; r <= (e.id === "aio" ? 1 : runs); r++) tasks.push({ pr, e, r });
  let done = 0, ok = 0;
  const failed = {}, errors = [];
  await lanes(tasks, 6, async ({ pr, e, r }) => {
    try {
      let text = "", citations = [];
      if (e.id === "aio") {
        const s = dfsResult(await call("dataforseo:serp.google.organic.live.advanced", { query: pr.prompt, locationCode: p.location || 2840, languageCode: langOf(p.language, p.location), depth: 10 }, { ctx, ttlDays: 3 }));
        const a = s && (s.items || []).find((i) => i.type === "ai_overview");
        if (!a) { text = ""; citations = []; }
        else { text = a.markdown || (a.items || []).map((x) => x.text || "").join("\n"); citations = (a.references || []).map((x) => x.url).filter(Boolean); }
      } else {
        const out = await chat(e.model, [{ role: "user", content: pr.prompt }], { ctx, max_tokens: e.max_tokens });
        text = out.text;
        citations = out.citations.length ? out.citations : [...new Set((text.match(/https?:\/\/[^\s)\]"'>]+/g) || []))];
      }
      const a = analyze(p, text, citations);
      ok++;
      await pool.query(`INSERT INTO ai_runs (job_id, prompt_id, engine, run_no, mentioned, position, brands, citations, answer) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [jobId, pr.id, e.id, r, a.mentioned, a.position, a.brands, citations.slice(0, 40), (text || (e.id === "aio" ? "(no AI Overview for this query)" : "")).slice(0, 12000)]);
    } catch (err) {
      console.error("ai run", e.id, err.message);
      failed[e.id] = (failed[e.id] || 0) + 1;
      if (errors.length < 5) errors.push(`${e.name || e.id}: ${String(err.message).slice(0, 200)}`);
    }
    progress(`answers ${++done} of ${tasks.length}`);
  });
  const nFailed = tasks.length - ok;
  // No answer at all is a failed run, not a 0% mention rate.
  if (!ok) throw new Error(`every AI request failed (${tasks.length}). ${errors[0] || ""}`.trim());
  return { ...(await summary(p, jobId)), failed: nFailed, failedByEngine: failed, errors };
}

// Per-prompt + per-engine mention rates, share of voice, cited domains (outreach list).
export async function summary(p, jobId = null) {
  const rows = await q(`
    SELECT r.*, pr.prompt FROM ai_runs r JOIN prompts pr ON pr.id = r.prompt_id
    WHERE pr.project_id = $1 AND ${jobId ? "r.job_id = $2" : "r.job_id = (SELECT max(job_id) FROM ai_runs r2 JOIN prompts p2 ON p2.id = r2.prompt_id WHERE p2.project_id = $1)"}`,
    jobId ? [p.id, jobId] : [p.id]);
  const me = cleanDomain(p.domain);
  const engines = {}, prompts = {}, sov = {}, cited = {};
  for (const r of rows) {
    const e = engines[r.engine] || (engines[r.engine] = { engine: r.engine, runs: 0, mentioned: 0 });
    e.runs++; if (r.mentioned) e.mentioned++;
    const k = prompts[r.prompt_id] || (prompts[r.prompt_id] = { id: r.prompt_id, prompt: r.prompt, runs: 0, mentioned: 0, engines: {}, competitors: {} });
    k.runs++; if (r.mentioned) k.mentioned++;
    const ke = k.engines[r.engine] || (k.engines[r.engine] = { runs: 0, mentioned: 0 });
    ke.runs++; if (r.mentioned) ke.mentioned++;
    for (const b of r.brands) { sov[b] = (sov[b] || 0) + 1; if (b !== me) k.competitors[b] = (k.competitors[b] || 0) + 1; }
    for (const c of new Set(r.citations.map(hostOf).filter(Boolean))) cited[c] = (cited[c] || 0) + 1;
  }
  const total = rows.length || 1;
  const list = Object.values(prompts).map((k) => ({ ...k, rate: k.runs ? Math.round((k.mentioned / k.runs) * 100) : 0,
    lostTo: Object.entries(k.competitors).sort((a, b) => b[1] - a[1]).map(([d]) => d) }));
  // Requests that failed in the run shown (stored on the job when it finished).
  const jid = jobId || (rows[0] && rows[0].job_id) || null;
  let failed = 0, errors = [];
  if (!jobId && jid) { const j = await one("SELECT result FROM jobs WHERE id = $1", [jid]); if (j && j.result) { failed = j.result.failed || 0; errors = j.result.errors || []; } }
  return {
    jobId: jid, runs: rows.length, failed, errors,
    rate: rows.length ? Math.round((rows.filter((r) => r.mentioned).length / rows.length) * 100) : 0,
    engines: Object.values(engines).map((e) => ({ ...e, name: (ENGINES.find((x) => x.id === e.engine) || {}).name || e.engine, rate: Math.round((e.mentioned / e.runs) * 100) })),
    shareOfVoice: Object.entries(sov).sort((a, b) => b[1] - a[1]).map(([domain, n]) => ({ domain, answers: n, share: Math.round((n / total) * 100), you: domain === me })),
    cited: Object.entries(cited).sort((a, b) => b[1] - a[1]).slice(0, 100).map(([domain, n]) => ({ domain, answers: n, you: domain === me || domain.endsWith("." + me) })),
    prompts: list,
    gaps: list.filter((k) => k.lostTo.length && k.rate < 50).sort((a, b) => a.rate - b.rate),
  };
}

export const answers = (promptId, jobId) => q(
  `SELECT engine, run_no, mentioned, position, brands, citations, answer, at FROM ai_runs WHERE prompt_id = $1 ${jobId ? "AND job_id = $2" : ""} ORDER BY at DESC, engine, run_no LIMIT 60`,
  jobId ? [promptId, jobId] : [promptId]);

// Mention rate of every past run (one point per run).
export const trend = (projectId) => q(
  `SELECT r.job_id, to_char(min(r.at), 'YYYY-MM-DD') AS day, count(*)::int AS runs, round(100.0 * count(*) FILTER (WHERE r.mentioned) / count(*))::int AS rate
   FROM ai_runs r JOIN prompts p ON p.id = r.prompt_id WHERE p.project_id = $1 AND r.job_id IS NOT NULL GROUP BY r.job_id ORDER BY min(r.at)`, [projectId]);
