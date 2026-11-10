// @ts-nocheck
// For uitest.mjs. Fill a local PGlite DB: seed avatars, 6 scripts, a campaign 6 x 12, done clips (posters), running + failed ones.
const { pool, one, q } = await import("./db/sql");
const { migrate } = await import("./db/migrate");
const { seed } = await import("./worker");
const store = await import("./storage");
await migrate(); await seed();
const av = await q("SELECT id, thumb_key FROM avatars WHERE NOT archived ORDER BY id LIMIT 12");
const texts = ["I almost scrolled past this myself. I was spending every Sunday night writing posts for my business. Now an agent drafts them from my real numbers, and I just approve them. Click the link.",
  "My agency quoted four thousand a month to run our ads. I tried this instead. It watches every campaign, pauses the losers, and tells me why. Click the link.",
  "Nobody tells you how much time reporting eats. Three hours every Monday, gone. Now the dashboard writes itself and I just read it. Click the link.",
  "If you hate surprise bills, listen. We cut our ad waste by a third in two weeks, and I did not hire anyone. Click the link.",
  "I run marketing alone. No team, no analyst. This thing finds the keywords my competitors miss and writes the posts. Click the link.",
  "This one is long ".repeat(40) + "Click the link."];
const sids = [];
for (const t of texts) sids.push((await one("INSERT INTO scripts (style, text, words, fits) VALUES ('pasted',$1,$2,$3) RETURNING id", [t, t.split(" ").length, t.split(" ").length <= 105])).id);
await pool.query("UPDATE boards SET name='Graphed launch', script_ids=$1::jsonb, avatar_ids=$2::jsonb WHERE id=1", [JSON.stringify(sids), JSON.stringify(av.map((a) => a.id))]);
let n = 0;
for (const [r, sid] of sids.slice(0, 3).entries()) for (const [c, a] of av.entries()) {
  if ((r * 12 + c) % 3 === 2) continue;
  const status = r === 2 && c > 6 ? "running" : (r === 1 && c === 4) ? "bad_take" : (r === 1 && c === 7) ? "error" : "done";
  const v = await one(`INSERT INTO videos (script_id, script, avatar_id, status, stage, words, secs, board_id, keys, report, error, steps)
    VALUES ($1,$2,$3,$4,$5,34,10.2,1,$6::jsonb,$7::jsonb,$8,$9::jsonb) RETURNING id`, [sid, texts[r], a.id, status, status === "running" ? "seedance" : null,
    JSON.stringify(status === "done" || status === "bad_take" ? { final: `videos/x/final.mp4`, poster: a.thumb_key } : {}),
    JSON.stringify(c === 3 ? { unfixed: [{ at: 8.2 }] } : {}), status === "error" ? "kie timeout" : null,
    JSON.stringify(status === "running" ? { voice: { start: Date.now() - 400000, end: Date.now() - 300000 }, film: { start: Date.now() - 120000 } } : {})]);
  n++;
}
console.log("videos", n);
await pool.end?.(); process.exit(0);
