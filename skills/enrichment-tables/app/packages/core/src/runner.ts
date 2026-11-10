// @ts-nocheck — cell runner, ported in place. enrichment.test.ts locks the results.
// Compute one cell. ctx = Map(columnName → { display, value }) for the row.
// Returns { status: "done" | "skipped", display, value, credits, note? }. Throws on real failure.
import { createHash } from "node:crypto";
import { byId } from "./presets";
import { compileFormula as parseFormula, runFormula as evalFormula } from "./formula";
import { tokens, lookup, render, renderDeep, getPath, display, isEmpty, resolveToken } from "./template";
import { tool, isNoMatch, llm, usageCredits, DEFAULT_MODEL } from "./tools";

// ---------- formulas ----------
// Expressions run in formula.mjs, not in the server process. A saved formula cannot read
// process.env or call the host Function constructor.
export function compileFormula(expr) {
  return parseFormula(expr);
}

export function runFormula(expr, ctx) {
  return evalFormula(expr, ctx, lookup);
}

const truthy = (v: unknown) => !(v == null || v === false || v === "" || v === 0 || (Array.isArray(v) && !v.length));

// ---------- tools ----------
function pickValue(result: unknown, paths?: string[]) {
  for (const p of paths || []) {
    const v = getPath(result, p);
    if (!isEmpty(v)) return v;
  }
  return (paths && paths.length) ? "" : result;
}

// Run one enrichment preset (also used by waterfall steps). → { result, picked, credits, skipped? }
async function runPreset(cfg: any, ctx: any, key: string) {
  const preset = byId[cfg.preset];
  if (!preset) throw new Error(`unknown enrichment ${cfg.preset}`);
  let id = preset.tool, body, rate = preset.rate;
  const missing = [];
  if (preset.id === "custom") {
    id = String(cfg.tool || "").trim();
    if (!id) throw new Error("custom tool: no tool id");
    let tpl;
    try { tpl = JSON.parse(cfg.body || "{}"); } catch (e) { throw new Error(`custom tool: body is not JSON (${e.message})`); }
    body = renderDeep(tpl, ctx, missing);
    rate = Number(cfg.rate) || 0;
    if (missing.length && cfg.skipIfMissing !== false) return { skipped: `empty: ${missing.join(", ")}` };
  } else {
    const inp = {};
    for (const f of preset.inputs) {
      const v = render(cfg.inputs?.[f.key] ?? "", ctx).trim();
      if (v) inp[f.key] = v;
      else if (f.required) missing.push(f.label);
    }
    if (missing.length) return { skipped: `empty: ${missing.join(", ")}` };
    if (!Object.keys(inp).length) return { skipped: "no inputs" };
    body = preset.body ? preset.body(inp) : inp;
  }
  // Local presets need no tool call (e.g. "use a value already in the table").
  if (preset.local) return { result: body, picked: body.value ?? "", credits: 0 };
  let result;
  try {
    result = await tool(id, body, key);
  } catch (e) {
    if (isNoMatch(e)) return { result: null, picked: "", credits: rate >= 1 ? 0 : rate, noMatch: true };
    throw e;
  }
  const paths = cfg.pick ? [cfg.pick] : preset.pick;
  const picked = pickValue(result, paths);
  // Pay-per-found vendors (LeadMagic) do not bill a miss.
  const credits = rate >= 3 && isEmpty(picked) ? 0 : rate;
  return { result, picked, credits };
}

async function runEnrich(col: any, ctx: any, key: string) {
  const r = await runPreset(col.config, ctx, key);
  if (r.skipped) return { status: "skipped", display: "", value: null, credits: 0, note: r.skipped };
  if (r.noMatch) return { status: "done", display: "", value: { noMatch: true }, credits: r.credits, note: "no match" };
  return { status: "done", display: display(r.picked), value: r.result, credits: r.credits };
}

// Try each step until one returns a value. Emails can be checked with Million Verifier:
// "ok" stops the waterfall, "catch_all" is kept as a fallback, "invalid" is dropped.
async function runWaterfall(col: any, ctx: any, key: string) {
  const steps = col.config.steps || [];
  const verifyEmails = !!col.config.verify;
  const tried = [];
  let best = null, credits = 0, ran = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const r = await runPreset(s, ctx, `${key}-s${i}`);
    if (r.skipped) { tried.push({ step: s.preset, skipped: r.skipped }); continue; }
    ran++;
    credits += r.credits || 0;
    const v = display(r.picked).trim();
    if (!v) { tried.push({ step: s.preset, value: null }); continue; }
    let verdict = null;
    if (verifyEmails && v.includes("@")) {
      try {
        const mv = await tool("million-verifier:validate", { email: v }, `${key}-mv-${v}`);
        verdict = String(mv.result || "unknown");
      } catch { verdict = "unknown"; }
      credits += 0.046;
    }
    tried.push({ step: s.preset, value: v, verify: verdict });
    if (verdict === "invalid" || verdict === "disposable") continue;
    const rank = (x) => ({ ok: 3, catch_all: 2, unknown: 1 }[x] ?? 3);
    if (!best || rank(verdict) > rank(best.verify)) best = { value: v, source: s.preset, verify: verdict, result: r.result };
    if (!verifyEmails || verdict === "ok") break;
  }
  if (!ran && !best) return { status: "skipped", display: "", value: { tried }, credits: 0, note: "every step had empty inputs" };
  return {
    status: "done",
    display: best ? best.value : "",
    value: { value: best?.value ?? null, source: best?.source ?? null, verify: best?.verify ?? null, tried, result: best?.result ?? null },
    credits,
  };
}

// ---------- AI ----------
const AI_SYSTEM = `You fill ONE cell of a spreadsheet for a go-to-market team.
Reply with only the value for the cell. No preamble, no markdown, no quotes.
If you cannot find or infer the answer, reply with nothing at all (an empty reply).
Never explain what you cannot do, never apologise, never guess facts.`;

const WEB_TOOLS = [
  { type: "function", function: { name: "web_search", description: "Google search. Returns top results (title, link, snippet).", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "read_page", description: "Read the text of a web page.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
];

function parseFields(text: unknown, fields: string[]) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  let obj = {};
  if (m) { try { obj = JSON.parse(m[0]); } catch {} }
  const out = {};
  for (const f of fields) out[f] = obj[f] ?? obj[f.toLowerCase()] ?? "";
  return out;
}

export async function askAi({ prompt, model, web, fields, maxSteps = 6, key = "ai" }: { prompt: string; model?: string; web?: boolean; fields?: string[]; maxSteps?: number; key?: string }) {
  const client = llm();
  let credits = 0;
  const sources = [];
  let sys = AI_SYSTEM;
  if (fields?.length) sys += `\nReply with ONE JSON object with exactly these keys: ${JSON.stringify(fields)}. Use "" for unknown values.`;
  if (web) sys += `\nYou can use web_search and read_page. Search first, read the best 1–2 pages, then answer. Keep it short.`;
  const messages = [{ role: "system", content: sys }, { role: "user", content: prompt }];
  let text = "";
  for (let step = 0; step < (web ? maxSteps : 1); step++) {
    const last = web && step === maxSteps - 1;
    const res = await client.chat.completions.create({
      model: model || DEFAULT_MODEL,
      max_tokens: 1200,
      temperature: 0.2,
      messages,
      ...(web && !last ? { tools: WEB_TOOLS } : {}),
    });
    credits += usageCredits(res.usage);
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) { text = msg.content || ""; break; }
    messages.push(msg);
    for (const call of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
      let out;
      try {
        if (call.function.name === "web_search") {
          const q = String(args.query || "").slice(0, 300);
          // Keyed by the query, not the model's call id, so a restart replays the same search.
          const r = await tool("serper:search", { q, num: 8 }, stableKey(key, "search", q));
          credits += 0.115;
          out = (r.organic || []).slice(0, 8).map((o) => ({ title: o.title, link: o.link, snippet: o.snippet }));
          if (r.knowledgeGraph) out.unshift({ knowledgeGraph: r.knowledgeGraph });
        } else if (call.function.name === "read_page") {
          const url = /^https?:\/\//.test(args.url || "") ? args.url : `https://${args.url}`;
          const r = await tool("serper:scrape", { url }, stableKey(key, "page", url));
          credits += 0.115;
          sources.push(url);
          out = String(r.text || "").slice(0, 12000);
        } else out = "unknown tool";
      } catch (e) { out = `error: ${String(e.message || e).slice(0, 200)}`; }
      messages.push({ role: "tool", tool_call_id: call.id, content: typeof out === "string" ? out : JSON.stringify(out) });
    }
  }
  text = String(text).trim().replace(/^["']|["']$/g, "");
  if (fields?.length) {
    const obj = parseFields(text, fields);
    return { value: { ...obj, ...(sources.length ? { sources } : {}) }, display: display(obj), credits };
  }
  return { value: { answer: text, ...(sources.length ? { sources } : {}) }, display: text, credits };
}

async function runAi(col: any, ctx: any, key: string) {
  const cfg = col.config;
  const missing = [];
  const prompt = render(cfg.prompt, ctx, missing);
  const toks = tokens(cfg.prompt);
  if (toks.length && missing.length === toks.length) return { status: "skipped", display: "", value: null, credits: 0, note: "all inputs empty" };
  const r = await askAi({ prompt, model: cfg.model, web: !!cfg.web, fields: (cfg.fields || []).filter(Boolean), maxSteps: cfg.maxSteps || 6, key });
  return { status: "done", display: r.display, value: r.value, credits: r.credits };
}

// ---------- HTTP API ----------
async function runHttp(col: any, ctx: any) {
  const cfg = col.config;
  const missing = [];
  const url = render(cfg.url, ctx, missing);
  if (!url || missing.length) return { status: "skipped", display: "", value: null, credits: 0, note: `empty: ${missing.join(", ")}` };
  let headers = {};
  if (cfg.headers) { try { headers = renderDeep(JSON.parse(cfg.headers), ctx); } catch (e) { throw new Error(`headers are not JSON (${e.message})`); } }
  let body;
  const method = (cfg.method || "GET").toUpperCase();
  if (cfg.body && method !== "GET") {
    try { body = JSON.stringify(renderDeep(JSON.parse(cfg.body), ctx)); } catch (e) { throw new Error(`body is not JSON (${e.message})`); }
    headers["content-type"] ||= "application/json";
  }
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) });
  const txt = await res.text();
  let value = txt;
  try { value = JSON.parse(txt); } catch {}
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${String(txt).slice(0, 200)}`);
  const picked = cfg.pick ? getPath(value, cfg.pick) : value;
  return { status: "done", display: display(picked), value: typeof value === "object" ? value : { body: value }, credits: 0 };
}

// ---------- entry ----------
export async function runCell(col: any, ctx: any, key: string) {
  const cfg = col.config || {};
  if (cfg.runIf && String(cfg.runIf).trim()) {
    let ok = false;
    try { ok = truthy(runFormula(cfg.runIf, ctx)); } catch (e) { throw new Error(`run condition: ${e.message}`); }
    if (!ok) return { status: "skipped", display: "", value: null, credits: 0, note: "run condition is false" };
  }
  switch (col.type) {
    case "formula": {
      const v = runFormula(cfg.expr, ctx);
      return { status: "done", display: display(v), value: v != null && typeof v === "object" ? v : null, credits: 0 };
    }
    case "enrich": return runEnrich(col, ctx, key);
    case "waterfall": return runWaterfall(col, ctx, key);
    case "ai": return runAi(col, ctx, key);
    case "http": return runHttp(col, ctx);
    default: return { status: "done", display: ctx.get(col.name)?.display ?? "", value: null, credits: 0 };
  }
}

// Estimated credits for one cell of a column (the "Run column" cost preview).
export function estimate(col: any): number {
  const cfg = col.config || {};
  if (col.type === "enrich") return byId[cfg.preset]?.id === "custom" ? Number(cfg.rate) || 0 : byId[cfg.preset]?.rate || 0;
  if (col.type === "waterfall") return (cfg.steps || []).reduce((s, x) => s + (byId[x.preset]?.rate || 0), 0) + (cfg.verify ? 0.046 : 0);
  if (col.type === "ai") return cfg.web ? 2.5 : (String(cfg.model || "").includes("sonnet") ? 0.6 : 0.1);
  return 0;
}

export { resolveToken };

// Same attempt + same request replays a finished tool run instead of paying again.
export function stableKey(key, kind, payload) {
  const h = createHash("sha256").update(`${kind}\n${payload}`).digest("hex").slice(0, 20);
  return `${key}-${h}`;
}
