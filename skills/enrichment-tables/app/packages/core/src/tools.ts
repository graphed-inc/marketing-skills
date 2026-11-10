// Graphed SDK wrapper. Every paid call in the app goes through here: Graphed Tools (vendor APIs)
// and the OpenRouter LLM proxy, both billed to the Graphed account's credits.
import OpenAI from "openai";
import { Graphed } from "@graphed-inc/sdk";

export const graphed = new Graphed();

const WAIT_SECONDS = 15 * 60;

type Fake = (id: string, input: unknown, key?: string) => Promise<any>;
let fake: Fake | null = null;
export const setFake = (fn: Fake | null) => { fake = fn; };

export async function tool(id: string, input: unknown, key?: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tool1(id, input, key && attempt ? `${key}-r${attempt}` : key);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const transient = /\b(429|50[0-4])\b|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message);
      if (!transient || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
    }
  }
}

async function tool1(id: string, input: unknown, key?: string): Promise<any> {
  if (fake) return fake(id, input, key);
  const started = await graphed.tools.start(id, input as Record<string, unknown>, key ? { idempotencyKey: key.slice(0, 200) } : {});
  const run = await graphed.tools.wait(started.id, { timeoutSeconds: WAIT_SECONDS, pollMs: 1500 });
  if (run.status !== "ready") throw new Error(`${id} ${run.status}: ${run.statusMessage || "no result"}`);
  return graphed.tools.downloadResult(started.id, { timeoutMs: 5 * 60_000 });
}

export function isNoMatch(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /\b(404|422)\b|not found|no match|no results/i.test(message);
}

let openai: OpenAI | undefined;
export function llm(): OpenAI {
  if (!openai) openai = new OpenAI({ baseURL: graphed.openRouter.baseUrl(), apiKey: graphed.token });
  return openai;
}

export const MODELS = [
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5 (fast, cheap)" },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5 (best)" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini (cheapest)" },
];
export const DEFAULT_MODEL = MODELS[0]!.id;

export function usageCredits(u: unknown): number {
  if (!u || typeof u !== "object" || !("cost" in u)) return 0;
  const cost = (u as { cost?: unknown }).cost;
  return typeof cost === "number" ? cost * 100 : 0;
}

export async function lanes<T>(items: T[], n: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; await fn(items[i] as T, i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
}
