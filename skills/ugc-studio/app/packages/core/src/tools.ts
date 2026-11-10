// @ts-nocheck
// Every paid call goes through here: Graphed Tools (fal TTS / whisper / voice clone, kie Seedance / Kling,
// ScrapeCreators Reddit) and the Graphed OpenRouter LLM proxy. Billed to the Graphed account's credits.
import { Graphed } from "@graphed-inc/sdk";
import { z } from "zod";
import { envSlice } from "./config";

export const graphed = new Graphed();

function runtimeEnv() {
  return envSlice(z.object({
    LLM_MODEL: z.string().optional(),
    UGC_TOOL_RETRY_MS: z.string().optional(),
  }));
}

export function defaultModel(): string {
  return runtimeEnv().LLM_MODEL || "anthropic/claude-sonnet-5.5";
}

// Tests swap in fakes. Never set in production.
let fakeTool = null, fakeLlm = null;
export const setFake = (t, l) => { fakeTool = t; fakeLlm = l; };

// A 429 or 5xx is worth another try. The message usually contains the status; the SDK also sets .status.
function retryableError(e) {
  const status = e && typeof e.status === "number" ? e.status : 0;
  const m = String((e && e.message) || e);
  return status === 429 || (status >= 500 && status <= 504) || /\b(429|50[0-4])\b|ECONNRESET|ETIMEDOUT|fetch failed/i.test(m);
}

// start (idempotency key) → wait → download. A replayed key returns the finished run for free, so a
// worker restart mid-Seedance does not pay twice. A 429 / 5xx while starting, waiting or downloading
// retries that same key and run. A new key (a second paid run) is used only after that run has failed.
export async function tool(id, input, key, { timeoutSeconds = 900 } = {}) {
  if (fakeTool) return fakeTool(id, input, key);
  let attempt = 0;
  let runId = null;
  let idem = key ? key.slice(0, 200) : undefined;
  const pause = Number(runtimeEnv().UGC_TOOL_RETRY_MS ?? 4000);
  for (;;) {
    let failedRun = false;
    try {
      if (!runId) {
        const started = await graphed.tools.start(id, input, idem ? { idempotencyKey: idem } : {});
        runId = started.id;
      }
      const run = await graphed.tools.wait(runId, { timeoutSeconds, pollMs: 3000 });
      if (run.status !== "ready") {
        failedRun = true;
        throw new Error(`${id} ${run.status}: ${run.statusMessage || "no result"}`);
      }
      return await graphed.tools.downloadResult(runId, { timeoutMs: 5 * 60_000 });
    } catch (e) {
      if (!retryableError(e) || attempt >= 2) throw e;
      attempt++;
      await sleep(pause * attempt);
      // The run itself failed: the next try is a new paid call. A read error keeps this run id.
      if (failedRun) {
        runId = null;
        if (key) idem = `${key}-r${attempt}`.slice(0, 200);
      }
    }
  }
}

export const SPEND = { llm: 0 };

// Chat completion through the Graphed LLM proxy. Returns { text, credits }.
export async function llm(messages, { model = defaultModel(), maxTokens = 8000, temperature = 0.8 } = {}) {
  if (fakeLlm) return fakeLlm(messages);
  const url = graphed.openRouter.baseUrl().replace(/\/$/, "") + "/chat/completions";
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${graphed.token}`, "content-type": "application/json", "user-agent": "graphed-ugc-studio" },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages }),
      signal: AbortSignal.timeout(300_000),
    });
    if (r.ok) {
      const d = await r.json();
      const credits = ((d.usage && d.usage.cost) || 0) * 100;
      SPEND.llm += credits;
      const ch = (d.choices && d.choices[0]) || {};
      return { text: (ch.message && ch.message.content) || "", credits, finish: ch.finish_reason || "" };
    }
    if (![429, 500, 502, 503, 504].includes(r.status) || attempt >= 2) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
    await sleep(5000 * (attempt + 1));
  }
}

// llm() that must return JSON; one repair turn if it does not parse.
export async function llmJson(messages, opts) {
  let { text, credits } = await llm(messages, opts);
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = parseJson(text);
    if (parsed) return { data: parsed, credits };
    if (attempt === 0) {
      const r = await llm([...messages, { role: "assistant", content: text }, { role: "user", content: "That was not valid JSON. Reply with the JSON only." }], opts);
      text = r.text; credits += r.credits;
    }
  }
  throw new Error("LLM did not return JSON: " + text.slice(0, 300));
}

export function parseJson(text) {
  text = String(text || "");
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  let raw = fence ? fence[1] : text;
  const i = raw.search(/[{[]/);
  if (i < 0) return null;
  raw = raw.slice(i, Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]")) + 1);
  try { return JSON.parse(raw); } catch { return null; }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run fn over items with at most n in flight.
export async function lanes(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// One heavy local job at a time (ffmpeg / python fixer): the container has 0.5 CPU and 512 MB.
export function semaphore(n) {
  let active = 0; const waiting = [];
  return async (fn) => {
    if (active >= n) await new Promise((r) => waiting.push(r));
    active++;
    try { return await fn(); } finally { active--; const w = waiting.shift(); if (w) w(); }
  };
}
