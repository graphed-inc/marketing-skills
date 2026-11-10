// @ts-nocheck
// Graphed Tools wrapper: start (with idempotency key) → wait → download. Every vendor call in the
// app goes through here, billed to the Graphed account's credits.
import { Graphed } from "@graphed-inc/sdk";

export const graphed = new Graphed();

export const TOOLS = {
  reactions: "apify:apimaestro~linkedin-post-reactions",
  comments: "apify:apimaestro~linkedin-post-comments-replies-engagements-scraper-no-cookies",
  profiles: "apify:harvestapi~linkedin-profile-scraper",
  profilePosts: "apify:apimaestro~linkedin-profile-posts",
  getleads: "getleads:enrich.from-linkedin",
  leadmagic: "leadmagic:people.email-finder",
  apollo: "apollo:people.bulk_match",
  verify: "million-verifier:validate",
};

// Credits per unit (1 credit = 1 cent), from `graphed tools catalog`. Used for the estimates in the UI.
export const RATES = {
  engagement: 0.575,   // per reaction or comment
  profile: 0.414,      // harvest profile, no email
  profileEmail: 1.15,  // harvest profile + email search (only when "harvest" is in the waterfall)
  post: 0.575,         // per post returned by the profile-posts scraper
  getleads: 0.000115,
  leadmagic: 3.45,     // per email found
  apollo: 0.92,        // per person matched
  verify: 0.046,
};

const WAIT_SECONDS = 20 * 60;

export async function tool(id: string, input: unknown, key?: string): Promise<any> {
  const started = await graphed.tools.start(id, input, key ? { idempotencyKey: key } : {});
  const run = await graphed.tools.wait(started.id, { timeoutSeconds: WAIT_SECONDS, pollMs: 3000 });
  if (run.status !== "ready") throw new Error(`${id} ${run.status}: ${run.statusMessage || "no result"}`);
  return graphed.tools.downloadResult(started.id, { timeoutMs: 5 * 60_000 });
}

export class ToolTransientError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolTransientError";
  }
}

// A vendor 404 is a confirmed miss. Timeouts, credit errors, and failed runs are not:
// callers must leave that lookup unfinished so a later job can try it again.
export function confirmedMiss(e) {
  if (e && e.name === "GraphedTimeoutError") return false;
  if (e && typeof e.status === "number") return e.status === 404;
  const msg = String(e && e.message || e);
  return /\b404\b/.test(msg) || /\bnot[_ ]found\b/i.test(msg) || /\bno match\b/i.test(msg);
}

export async function tryTool(id, input, key) {
  try {
    return await tool(id, input, key);
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 200);
    if (confirmedMiss(e)) {
      console.warn(`${id}: no match (${msg})`);
      return null;
    }
    console.warn(`${id}: transient failure (${msg})`);
    throw new ToolTransientError(`${id}: ${msg}`);
  }
}

// Run fn over items with at most n in flight.
export async function pool(items, n, fn) {
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
}
