// Every paid call goes through here: Graphed Tools (DataForSEO, Serper), the OpenRouter LLM
// proxy and the warehouse. Tool results are cached in `lookups`, so a repeat call is free.
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { Graphed } from "@graphed-inc/sdk";
import { pool, one } from "./db.mjs";

export const graphed = new Graphed();

// Tests swap in fakes. Never set in production.
let fake = null, fakeLlm = null, fakeWh = null;
export const setFake = (tools, llm, wh) => { fake = tools; fakeLlm = llm; fakeWh = wh; };

// Credits (1 credit = 1 cent). DataForSEO reports its own USD cost.
// Serper bills per vendor credit (a search is 1, a Maps search is 3) and returns the count as `credits`.
const SERPER_CREDIT = 0.115;
export function creditsOf(id, result) {
  if (id.startsWith("serper:")) {
    const n = result && Number(result.credits);
    return Math.round((n > 0 ? n : 1) * SERPER_CREDIT * 1000) / 1000;
  }
  const usd = result && typeof result.cost === "number" ? result.cost : null;
  return usd != null ? Math.round(usd * 115 * 1000) / 1000 : 1.4;
}

const keyOf = (id, input) => createHash("sha1").update(id + JSON.stringify(input)).digest("hex");

// Lookups in flight in this process, by cache key. A second caller for the same uncached lookup waits for the
// first one instead of paying for it again. (The worker and the MCP tools share this process.)
const inflight = new Map();

// ctx: { projectId, jobId, spend(credits) } — attributes spend to a job and project.
export async function call(id, input, { ttlDays = 7, ctx = {}, fresh = false } = {}) {
  const key = keyOf(id, input);
  if (!fresh) {
    const hit = await one(`SELECT result FROM lookups WHERE key = $1 AND fetched_at > now() - ($2 || ' days')::interval`, [key, String(ttlDays)]);
    if (hit) return hit.result;
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const work = (async () => {
    const result = await run(id, input);
    if (result && result.tasks && result.tasks[0] && result.tasks[0].status_code >= 40000) {
      throw new Error(`${id}: ${result.tasks[0].status_message}`);
    }
    const credits = creditsOf(id, result);
    await pool.query(
      `INSERT INTO lookups (key, tool, input, result, credits, fetched_at) VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (key) DO UPDATE SET result = $4, credits = $5, fetched_at = now()`,
      [key, id, JSON.stringify(input), JSON.stringify(result), credits]);
    await spend(ctx, id, credits);
    return result;
  })();
  inflight.set(key, work);
  try { return await work; } finally { inflight.delete(key); }
}

export async function spend(ctx, tool, credits) {
  if (!credits) return;
  await pool.query("INSERT INTO credit_log (project_id, job_id, tool, credits) VALUES ($1,$2,$3,$4)", [ctx.projectId || null, ctx.jobId || null, tool, credits]);
  if (ctx.jobId) await pool.query("UPDATE jobs SET credits = credits + $2 WHERE id = $1", [ctx.jobId, credits]);
}

const TRANSIENT = /\b(429|50[0-4])\b|ECONNRESET|ETIMEDOUT|fetch failed|socket|timed out|Timeout|request failed with status/i;

// Retry one step on a transient error. Each step is retried on its own, so a failed wait or download never
// starts (and pays for) the lookup again: it keeps the run id and asks for the same result.
export const retryTiming = { baseMs: 2500 };   // tests set this to 0
async function retry(fn, tries = 4) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      const m = String(e && e.message) + " " + String(e && e.name);
      if (!TRANSIENT.test(m) || attempt >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, retryTiming.baseMs * (attempt + 1 + Math.random() * 0.6)));
    }
  }
}

export async function run(id, input) {
  if (fake) return fake(id, input);
  const started = await retry(() => graphed.tools.start(id, input));
  const r = await retry(() => graphed.tools.wait(started.id, { timeoutSeconds: 600, pollMs: 1200 }));
  if (r.status !== "ready") throw new Error(`${id} ${r.status}: ${r.statusMessage || "no result"}`);
  return retry(() => graphed.tools.downloadResult(started.id, { timeoutMs: 5 * 60_000 }));
}

// Tests only: run the real retry path against a stand-in for graphed.tools.
export async function runWith(tools, id, input) {
  const saved = graphed.tools, savedFake = fake;
  Object.defineProperty(graphed, "tools", { value: tools, configurable: true, writable: true });
  fake = null;
  try { return await run(id, input); } finally { graphed.tools = saved; fake = savedFake; }
}

// DataForSEO: first result object of the first task.
export const dfsResult = (r) => (r && r.tasks && r.tasks[0] && r.tasks[0].result && r.tasks[0].result[0]) || null;

// ---------- LLM (OpenRouter via Graphed) ----------
let openai;
const client = () => openai || (openai = new OpenAI({ baseURL: graphed.openRouter.baseUrl(), apiKey: graphed.token }));
export const FAST_MODEL = "anthropic/claude-haiku-4.5";

export async function chat(model, messages, { ctx = {}, max_tokens = 1500, json = false } = {}) {
  let r;
  if (fakeLlm) r = await fakeLlm(model, messages);
  else {
    r = await client().chat.completions.create({ model, messages, max_tokens, ...(json ? { response_format: { type: "json_object" } } : {}) });
  }
  const credits = r.usage && typeof r.usage.cost === "number" ? r.usage.cost * 100 : 0;
  await spend(ctx, `llm:${model}`, credits);
  const msg = (r.choices && r.choices[0] && r.choices[0].message) || {};
  const cites = (msg.annotations || []).filter((a) => a.type === "url_citation").map((a) => a.url_citation && a.url_citation.url).filter(Boolean);
  return { text: msg.content || "", citations: cites, credits };
}

export async function chatJson(messages, opts = {}) {
  const { text } = await chat(opts.model || FAST_MODEL, messages, { ...opts, json: false });
  const m = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error("model did not return JSON");
  return JSON.parse(m[0]);
}

// ---------- Warehouse (free, read-only ClickHouse) ----------
export async function wh(sql, params = {}) {
  if (fakeWh) return fakeWh(sql, params);
  const r = await graphed.warehouse.query(sql, params, { timeoutMs: 90_000 });
  return r.results || [];
}

// Run fn over items with at most n in flight.
export async function lanes(items, n, fn) {
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
}
