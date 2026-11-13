// @ts-nocheck
// Graphed SDK wrapper. Every paid call goes through here: Graphed Tools (ScrapeCreators ad
// libraries, Reddit, YouTube, Exa) and the Graphed OpenRouter proxy (Gemini 2.5 Flash, Claude),
// all billed to the Graphed account's credits. No vendor keys.
import { Graphed } from "@graphed-inc/sdk";
import { coreEnv } from "./config";

let graphed;
const g = () => (graphed ||= new Graphed());

// Graphed credits per ScrapeCreators call (graphed tools catalog, Nov 2026).
export const TOOL_RATE = 0.2162;

// Tests swap in fakes. Never set in production.
let fakeTool = null;
let fakeLlm = null;
export const setFakes = ({ tool, llm } = {}) => { fakeTool = tool || null; fakeLlm = llm || null; };

const transient = (e) => /\b(429|50[0-4])\b|ECONNRESET|ETIMEDOUT|fetch failed|timed out/i.test(String((e && e.message) || e));

// start (idempotency key) → wait → download. Vendor 429 / 5xx retried twice.
export async function tool(id, input, key) {
  for (let attempt = 0; ; attempt++) {
    try {
      if (fakeTool) return await fakeTool(id, input);
      const started = await g().tools.start(id, input, key ? { idempotencyKey: `${key}-${attempt}`.slice(0, 200) } : {});
      const run = await g().tools.wait(started.id, { timeoutSeconds: 600, pollMs: 1500 });
      if (run.status !== "ready") throw new Error(`${id} ${run.status}: ${run.statusMessage || "no result"}`);
      return await g().tools.downloadResult(started.id, { timeoutMs: 120_000 });
    } catch (e) {
      if (!transient(e) || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
    }
  }
}

// OpenAI-compatible chat completions through the Graphed OpenRouter proxy, with plain fetch.
async function createCompletion(body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${g().openRouter.baseUrl().replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${g().token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e.message || e) }));
    if (res.ok) return res.json();
    const text = (await res.text()).slice(0, 400);
    const err = new Error(`${res.status} ${text}`);
    if (!transient(err) || attempt >= 2) throw err;
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
}

export function llm() {
  if (fakeLlm) return fakeLlm;
  return { chat: { completions: { create: createCompletion } } };
}

export const visionModel = () => coreEnv().VISION_MODEL || "google/gemini-2.5-flash";
export const writerModel = () => coreEnv().WRITER_MODEL || "anthropic/claude-sonnet-5.5";

// OpenRouter reports usage.cost in dollars → credits (1 credit = 1¢).
export const usageCredits = (u) => (u && typeof u.cost === "number" ? u.cost * 100 : 0);

// Run fn over items with at most n in flight.
export async function lanes(items, n, fn) {
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
}
