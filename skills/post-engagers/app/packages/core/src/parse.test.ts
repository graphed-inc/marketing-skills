// Offline check of the parsers. Usage: tsx packages/core/src/parse.test.ts [reactions.json comments.json profiles.json]
// With no args it runs the built-in cases only.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parsePostUrl, parseReactions, parseComments, commentsSummary, flattenProfile, seniorityOf, toCsv } from "./parse.ts";
import { fetchSince, morePostPages, parseUsername } from "./tracker.ts";

assert.equal(parsePostUrl("https://www.linkedin.com/feed/update/urn:li:activity:7488547667665530882/").postId, "7488547667665530882");
assert.equal(parsePostUrl("https://www.linkedin.com/posts/jane-doe_ai-agents-activity-7488547667665530882-AbCd?utm_source=share").postId, "7488547667665530882");
assert.equal(parsePostUrl("https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A7460434027041431553").postId, "7460434027041431553");
assert.equal(parsePostUrl("7488547667665530882").postId, "7488547667665530882");
assert.equal(parsePostUrl("https://x.com/foo/status/123"), null);
assert.equal(parsePostUrl("not a url"), null);
assert.equal(parsePostUrl("https://www.linkedin.com/feed/update/%ZZ"), null);
assert.equal(parseUsername("https://www.linkedin.com/in/%ZZ"), null);
assert.equal(parseUsername("https://www.linkedin.com/in/Ada-Lovelace"), "ada-lovelace");
const since = new Date("2026-01-01T00:00:00Z");
assert.equal(morePostPages(new Date("2026-01-02T00:00:00Z"), 20, since, 20), true);
assert.equal(morePostPages(new Date("2025-12-01T00:00:00Z"), 20, since, 20), false);
assert.equal(morePostPages(new Date("2026-01-02T00:00:00Z"), 7, since, 20), false);
assert.equal(morePostPages(null, 20, since, 20), false);
const created = new Date("2026-06-01T00:00:00Z");
assert.equal(fetchSince(created, 7, null, 20).toISOString(), "2026-05-25T00:00:00.000Z");
assert.equal(fetchSince(created, 7, new Date("2026-11-01T00:00:00Z"), 20).toISOString(), "2026-10-31T04:00:00.000Z");
assert.equal(seniorityOf("Co-Founder & CEO"), "Owner / Founder");
assert.equal(seniorityOf("VP Growth"), "VP");
assert.equal(seniorityOf("Head of Sales"), "Director");
assert.ok(toCsv([{ a: "=SUM(A1)" }], [["a", (r) => r.a]]).includes(`"'=SUM(A1)"`));

const [rf, cf, pf] = process.argv.slice(2);
if (rf) {
  const r = parseReactions(JSON.parse(readFileSync(rf, "utf8")));
  const c = parseComments(JSON.parse(readFileSync(cf, "utf8")));
  console.log("reactions", r.length, r[0]);
  console.log("comments", c.length, c.filter((x) => x.isReply).length, "replies", commentsSummary(JSON.parse(readFileSync(cf, "utf8"))));
  if (pf) for (const p of JSON.parse(readFileSync(pf, "utf8"))) console.log(flattenProfile(p));
}
console.log("ok");
