import assert from "node:assert/strict";
import { migrate } from "./db/migrate.ts";
import * as db from "./store.ts";
import { planProfileBatches, applyProfileBatch, runLanes } from "./worker.ts";
import { batchKey, enrichPeople } from "./enrich.ts";
import { confirmedMiss, graphed, tryTool, ToolTransientError } from "./tools.ts";
import { claimDueProfile, fetchSince, queueSavedPosts, type TrackedProfile } from "./tracker.ts";
import { resetCoreEnvCache } from "./config.ts";

// A project .env must not steer this file at a real database. loadLocalEnv()
// would copy DATABASE_URL back in after `env -u`; memory mode has to win.
process.env.PGLITE_DIR = "memory";
process.env.DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:1/post-engagers-test-must-not-connect";
resetCoreEnvCache();

await migrate();
assert.equal(batchKey([{ linkedinUrl: "https://www.linkedin.com/in/a" }]), batchKey([{ linkedinUrl: "https://www.linkedin.com/in/a" }]));
assert.notEqual(
  batchKey([{ linkedinUrl: "https://www.linkedin.com/in/a" }]),
  batchKey([{ linkedinUrl: "https://www.linkedin.com/in/a" }, { linkedinUrl: "https://www.linkedin.com/in/b" }]),
);
assert.equal(confirmedMiss(Object.assign(new Error("missing"), { status: 404 })), true);
assert.equal(confirmedMiss(Object.assign(new Error("no credits"), { status: 402 })), false);
assert.equal(confirmedMiss(Object.assign(new Error("slow"), { name: "GraphedTimeoutError" })), false);
assert.equal(confirmedMiss(new Error("actor crashed")), false);
assert.equal(confirmedMiss(new Error("vendor 404 not found")), true);
graphed.tools.start = async () => { throw Object.assign(new Error("insufficient credits"), { status: 402 }); };
await assert.rejects(() => tryTool("leadmagic:people.email-finder", {}, "k"), ToolTransientError);
let saved = false;
await assert.rejects(() => enrichPeople(
  [{ urn: "ACoAA1", data: { profileUrl: "https://www.linkedin.com/in/jane" } }],
  "k",
  async () => { saved = true; },
), ToolTransientError);
assert.equal(saved, false);

const person = (urn, comment) => ({
  urn, name: urn, headline: "CEO", profileUrl: `https://www.linkedin.com/in/${urn}`,
  comment, commentUrl: `https://www.linkedin.com/feed/update/${urn}`, reactionType: "LIKE",
});

async function job(postId) {
  return db.insertManualJob(`https://www.linkedin.com/feed/update/urn:li:activity:${postId}/`, postId, 1000);
}

// A repeated scrape page does not double comments, engagements, or credits.
{
  const j = await job("100");
  const row = person("ACoAA100", "nice post");
  const page = { kind: "comment", rows: [row], raw: 1, credits: 0.5, page: 1, total: 1 };
  await db.saveScrapePage(j.id, page);
  await db.saveScrapePage(j.id, page);
  const { rows: [saved] } = await db.pool.query(
    "SELECT engagements, credits, comments_page FROM jobs WHERE id = $1", [j.id]);
  assert.equal(saved.engagements, 1);
  assert.equal(Number(saved.credits), 0.5);
  assert.equal(saved.comments_page, 1);
  const { rows: [jp] } = await db.pool.query("SELECT comment FROM job_people WHERE job_id = $1", [j.id]);
  assert.equal(jp.comment, "nice post");
  await db.saveScrapePage(j.id, { ...page, page: 2, rows: [person("ACoAA100", "and a reply")], total: 2 });
  const { rows: [both] } = await db.pool.query("SELECT comment FROM job_people WHERE job_id = $1", [j.id]);
  assert.equal(both.comment, "nice post\n---\nand a reply");
  await db.saveScrapePage(j.id, { ...page, page: 3, rows: [person("ACoAA100", "nice")], total: 3 });
  const { rows: [shorter] } = await db.pool.query("SELECT comment, (SELECT engagements FROM jobs WHERE id = $1) AS engagements FROM job_people WHERE job_id = $1", [j.id]);
  assert.equal(shorter.comment, "nice post\n---\nand a reply\n---\nnice");
  assert.equal(shorter.engagements, 3);
  await db.saveScrapePage(j.id, { ...page, page: 3, rows: [person("ACoAA100", "nice")], total: 3 });
  const { rows: [replayed] } = await db.pool.query("SELECT comment FROM job_people WHERE job_id = $1", [j.id]);
  assert.equal(replayed.comment, "nice post\n---\nand a reply\n---\nnice");
  const { rows: [again] } = await db.pool.query("SELECT engagements FROM jobs WHERE id = $1", [j.id]);
  assert.equal(again.engagements, 3);
}

// A page that fails to commit leaves no rows and no progress.
{
  const j = await job("101");
  await assert.rejects(() => db.withTx(async (c) => {
    await db.addEngagers(j.id, [person("ACoAA101", "lost")], "comment", c);
    throw new Error("crash");
  }));
  const { rows: people } = await db.pool.query("SELECT 1 FROM job_people WHERE job_id = $1", [j.id]);
  const { rows: [saved] } = await db.pool.query("SELECT comments_page FROM jobs WHERE id = $1", [j.id]);
  assert.equal(people.length, 0);
  assert.equal(saved.comments_page, 0);
}

// Profile batch membership stays put when a restart saved only some of the people.
{
  const j = await job("102");
  await db.saveScrapePage(j.id, {
    kind: "reaction", raw: 3, credits: 1, page: 1, total: 3,
    rows: [person("ACoAA102a"), person("ACoAA102b"), person("ACoAA102c")],
  });
  const first = await planProfileBatches(j);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].urns, ["ACoAA102a", "ACoAA102b", "ACoAA102c"]);
  await db.pool.query("UPDATE people SET profiled_at = now() WHERE urn = 'ACoAA102a'");
  const second = await planProfileBatches(j);
  assert.equal(second.length, 1);
  assert.equal(second[0].batch_key, first[0].batch_key);
  assert.deepEqual(second[0].urns, first[0].urns);

  const items = [
    { id: "ACoAA102a", firstName: "Ada", lastName: "L", headline: "CEO" },
    { id: "ACoAA102b", firstName: "Bea", lastName: "Lee", headline: "VP" },
  ];
  await applyProfileBatch(j.id, second[0], items);
  await applyProfileBatch(j.id, second[0], items);
  const { rows: [credits] } = await db.pool.query("SELECT credits FROM jobs WHERE id = $1", [j.id]);
  assert.ok(Math.abs(Number(credits.credits) - (1 + 2 * 0.414)) < 1e-6);
  const { rows: [open] } = await db.pool.query(
    "SELECT count(*)::int n FROM profile_batches WHERE job_id = $1 AND NOT done", [j.id]);
  assert.equal(open.n, 0);
  const { rows: [missed] } = await db.pool.query(
    "SELECT profile_failed_at FROM people WHERE urn = 'ACoAA102c'");
  assert.ok(missed.profile_failed_at);
}

// A manual scrape is attached to the tracked profile, and two checks insert one job.
{
  const j = await job("103");
  await db.saveScrapePage(j.id, {
    kind: "reaction", raw: 1, credits: 1, page: 1, total: 1, rows: [person("ACoAA103")],
  });
  const url = j.post_url;
  assert.equal(await db.queueTrackedJob(url, "103", 1000, 7), 0);
  const { rows: [attached] } = await db.pool.query("SELECT tracked_id, source FROM jobs WHERE id = $1", [j.id]);
  assert.equal(attached.tracked_id, 7);
  assert.equal(attached.source, "manual");
  const listed = await db.listPeople(null, { trackedId: 7 });
  assert.ok(listed.some((r) => r.urn === "ACoAA103"));

  const postId = "104";
  const postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${postId}/`;
  const inserted = await Promise.all([
    db.queueTrackedJob(postUrl, postId, 1000, 8),
    db.queueTrackedJob(postUrl, postId, 1000, 8),
    db.queueTrackedJob(postUrl, postId, 1000, 8),
  ]);
  assert.equal(inserted.reduce((n, x) => n + x, 0), 1);
  const { rows } = await db.pool.query(
    "SELECT tracked_id FROM jobs WHERE post_id = $1 AND status <> 'failed'", [postId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tracked_id, 8);

  await db.pool.query("UPDATE jobs SET status = 'failed' WHERE post_id = $1", [postId]);
  assert.equal(await db.queueTrackedJob(postUrl, postId, 1000, 8), 0);
  const { rows: afterFail } = await db.pool.query("SELECT count(*)::int n FROM jobs WHERE post_id = $1", [postId]);
  assert.equal(afterFail[0].n, 1);
}

// A second manual scrape of a live post is refused. A failed one can be replaced.
{
  await assert.rejects(() => job("100"), (e) => e.statusCode === 409);
  await db.pool.query("UPDATE jobs SET status = 'failed' WHERE post_id = '100'");
  const again = await job("100");
  assert.equal(again.status, "queued");
}

// Finished retry clears profiles and emails and bumps the attempt. A running job does not.
{
  const j = await job("105");
  await db.saveScrapePage(j.id, {
    kind: "reaction", raw: 1, credits: 1, page: 1, total: 1, rows: [person("ACoAA105")],
  });
  await db.pool.query(
    "UPDATE people SET profiled_at = now(), enriched_at = now(), profile_failed_at = now() WHERE urn = 'ACoAA105'");
  await db.pool.query(
    "INSERT INTO profile_batches (job_id, batch_key, urns, done) VALUES ($1, 'old', ARRAY['ACoAA105'], true)",
    [j.id]);
  await db.pool.query("UPDATE jobs SET status = 'done', stage = 'done' WHERE id = $1", [j.id]);
  const refreshed = await db.retryJob(j.id);
  assert.equal(refreshed.status, "queued");
  assert.equal(refreshed.stage, "profiles");
  assert.equal(refreshed.attempt, 2);
  const { rows: [p] } = await db.pool.query(
    "SELECT profiled_at, enriched_at, profile_failed_at FROM people WHERE urn = 'ACoAA105'");
  assert.equal(p.profiled_at, null);
  assert.equal(p.enriched_at, null);
  assert.equal(p.profile_failed_at, null);
  const { rows: batches } = await db.pool.query("SELECT urns FROM profile_batches WHERE job_id = $1 AND NOT done", [j.id]);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].urns, ["ACoAA105"]);

  await db.pool.query("UPDATE jobs SET status = 'running' WHERE id = $1", [j.id]);
  await assert.rejects(() => db.retryJob(j.id), (e) => e.statusCode === 409);
}

// Refresh resets only the capped set. People past the cap keep their saved profile.
{
  const j = await db.insertManualJob("https://www.linkedin.com/feed/update/urn:li:activity:106/", "106", 1);
  await db.saveScrapePage(j.id, {
    kind: "reaction", raw: 2, credits: 1, page: 1, total: 2,
    rows: [person("ACoAA106a"), person("ACoAA106b")],
  });
  await db.pool.query("UPDATE job_people SET commented = true WHERE job_id = $1 AND urn = 'ACoAA106b'", [j.id]);
  await db.pool.query(
    "UPDATE people SET profiled_at = now(), enriched_at = now(), email = 'kept@example.com' WHERE urn IN ('ACoAA106a', 'ACoAA106b')");
  await db.pool.query("UPDATE jobs SET status = 'done', stage = 'done' WHERE id = $1", [j.id]);
  await db.retryJob(j.id);
  const { rows } = await db.pool.query(
    "SELECT urn, profiled_at, enriched_at, email FROM people WHERE urn IN ('ACoAA106a', 'ACoAA106b') ORDER BY urn");
  assert.equal(rows[0].urn, "ACoAA106a");
  assert.ok(rows[0].profiled_at);
  assert.ok(rows[0].enriched_at);
  assert.equal(rows[0].email, "kept@example.com");
  assert.equal(rows[1].urn, "ACoAA106b");
  assert.equal(rows[1].profiled_at, null);
  assert.equal(rows[1].enriched_at, null);
  const planned = await planProfileBatches(j);
  assert.deepEqual(planned.map((b) => b.urns).flat(), ["ACoAA106b"]);
}

// A saved post that is old enough gets a job. A failed post does not get a second one.
{
  const { rows: [tp] } = await db.pool.query<TrackedProfile>(
    `INSERT INTO tracked_profiles (username, backfill_days, max_profiles, created_at)
     VALUES ('ada', 30, 1000, now()) RETURNING *`);
  await db.pool.query(
    `INSERT INTO posts (post_id, tracked_id, url, posted_at) VALUES
      ('201', $1, 'https://www.linkedin.com/feed/update/urn:li:activity:201/', now() - interval '2 days'),
      ('202', $1, 'https://www.linkedin.com/feed/update/urn:li:activity:202/', now() - interval '1 hour')`,
    [tp.id]);
  assert.equal(await queueSavedPosts(tp, 20), 1);
  assert.equal(await queueSavedPosts(tp, 20), 0);
  await db.pool.query("UPDATE jobs SET status = 'failed' WHERE post_id = '201'");
  assert.equal(await queueSavedPosts(tp, 20), 0);
  const { rows: jobs } = await db.pool.query("SELECT post_id, status FROM jobs WHERE post_id IN ('201', '202') ORDER BY post_id");
  assert.deepEqual(jobs.map((r) => r.post_id), ["201"]);
  assert.equal(jobs[0].status, "failed");
}

// A failed profile lane does not start the remaining batches, and in-flight work finishes first.
{
  let started = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const running = runLanes([1, 2, 3, 4], 2, async (n) => {
    started++;
    if (n === 1) throw new Error("lane failed");
    await gate;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(started, 2);
  release();
  await assert.rejects(running, /lane failed/);
  assert.equal(started, 2);
}

// Claiming a profile stamps last_checked_at and leaves the last completed fetch alone.
{
  await db.pool.query("UPDATE tracked_profiles SET last_checked_at = now()");
  const checked = new Date(Date.now() - 48 * 3600_000);
  const fetched = new Date(Date.now() - 2 * 86400_000);
  const { rows: [made] } = await db.pool.query<{ id: number }>(
    `INSERT INTO tracked_profiles (username, backfill_days, max_profiles, last_checked_at, fetched_at)
     VALUES ('grace', 7, 1000, $1, $2) RETURNING id`,
    [checked, fetched]);
  const claimed = await claimDueProfile();
  assert.equal(claimed?.id, made.id);
  assert.ok(claimed?.fetched_at);
  assert.ok(Math.abs(new Date(claimed.fetched_at).getTime() - fetched.getTime()) < 1000);
  assert.ok(new Date(claimed.last_checked_at!).getTime() > checked.getTime());
  const bound = fetchSince(new Date(claimed.created_at), claimed.backfill_days, new Date(claimed.fetched_at), 20);
  assert.ok(Math.abs(bound.getTime() - (fetched.getTime() - 20 * 3600_000)) < 1000);
}

await db.pool.end();
console.log("resume ok");

