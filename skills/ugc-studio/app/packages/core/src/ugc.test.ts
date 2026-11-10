// @ts-nocheck
// Offline test: fake Graphed Tools + LLM, embedded Postgres, local storage, real ffmpeg + python fixer.
// node test.mjs   (needs ffmpeg + python3; spends nothing)
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { readFileSync } from "node:fs";

const T = mkdtempSync(join(tmpdir(), "ugc-test-"));
process.env.PGLITE_DIR = "memory";
process.env.LOCAL_STORAGE_DIR = join(T, "storage");
process.env.WORK_DIR = join(T, "work");
for (const k of ["DATABASE_URL", "GRAPHED_STORAGE_ENDPOINT", "GRAPHED_STORAGE_ACCESS_KEY_ID"]) delete process.env[k];

const { q, one, pool, retryVideo } = await import("./db/sql");
const { migrate } = await import("./db/migrate");
const { setFake, graphed, tool } = await import("./tools");
const { seed, processProject, heavy, releaseFinishedHolders } = await import("./worker");
const { plan, createVideos } = await import("./plan");
const { renderVideo, TX, chunksFromTranscript } = await import("./render");
const { ffmpeg, duration, spoken } = await import("./media");
const { clean } = await import("./writer");

let fails = 0;
const ok = (c, m) => { console.log(`${c ? "ok  " : "FAIL"} ${m}`); if (!c) fails++; };
ok(TX.token && TX.token === process.env.UGC_TX_TOKEN, "the word-check token is one process value");
{
  const heard = chunksFromTranscript({ segments: [{ words: [{ word: " And", start: 0.1, end: 0.4 }, { word: "so", start: 0.5, end: 0.7 }] }] });
  ok(heard.chunks[0].text === " And" && heard.chunks[0].timestamp[0] === 0.1 && heard.chunks[1].text === " so", "transcription words become timed chunks");
  ok(heard.text === "And so", `transcription text joins the words (${heard.text})`);
  const gap = chunksFromTranscript({ segments: [{ words: [
    { word: "And", start: 0.1, end: 0.4 },
    { word: "so", start: null, end: null },
    { word: "my", start: 0.8, end: 1.0 },
  ] }] });
  ok(gap.text === "And so my" && gap.chunks.length === 3, `an untimed word stays in the transcript (${gap.text})`);
  ok(gap.chunks[1].timestamp[0] >= 0.4 && gap.chunks[1].timestamp[1] <= 0.8, `an untimed word sits between its neighbors (${gap.chunks[1].timestamp})`);
}

const { pgliteDir } = await import("./db/pglite");
ok(pgliteDir("memory") === "memory", "an explicit database dir is kept");
{
  const back = process.cwd();
  process.chdir(join(back, "packages", "dashboard"));
  const rooted = pgliteDir(undefined);
  process.chdir(back);
  ok(rooted === join(back, ".data", "pglite"), "the default database stays at the app root");
}

// test media served over http (the pipeline downloads vendor results by URL)
await ffmpeg(["-f", "lavfi", "-i", "sine=f=200:d=6", "-c:a", "libmp3lame", join(T, "tts.mp3")]);
await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=480x854:r=24:d=6", "-f", "lavfi", "-i", "sine=f=300:d=6", "-c:v", "libx264", "-preset", "ultrafast",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(T, "take.mp4")]);
const files = http.createServer((req, res) => { res.end(readFileSync(join(T, req.url.slice(1)))); }).listen(0);
const base = `http://127.0.0.1:${files.address().port}`;

const SCRIPT = "My front desk missed a third of our calls. Then I found Acme. Now every call gets answered. If your phones ring off the hook, click the link.";
const calls = [];
setFake(async (id, input) => {
  calls.push(id);
  if (id.includes("speech")) return { audio: { url: `${base}/tts.mp3` } };
  if (id.includes("seedance") || id.includes("kling")) return { resultUrls: [`${base}/take.mp4`] };
  if (id.includes("reddit/search")) return { posts: [{ id: "p1", subreddit: "smallbusiness", title: "front desk missing calls every day", selftext: "we miss calls",
    url: "https://www.reddit.com/r/smallbusiness/comments/p1/x/", num_comments: 9, score: 5 }] };
  if (id.includes("reddit/post/comments")) return { comments: [{ author: "a", score: 3, body: "we lose patients when nobody picks up" }] };
  if (id.includes("whisper")) return { text: "", chunks: [] };
  throw new Error("unexpected tool " + id);
}, async (messages) => {
  const m = messages[0].content;
  if (m.includes("plan Reddit research")) return { text: JSON.stringify({ brand: "Acme", what: "AI receptionist", buyers: "clinic owners", jobs: ["answers calls"],
    proof: ["answers 100 percent of calls"], cta: "Book a demo", queries: ["front desk missing calls", "how do you handle missed calls"] }), credits: 1 };
  if (m.includes("voice-of-customer")) return { text: "```json\n" + JSON.stringify({ pains: [{ pain: "missed calls", summary: "they miss calls", quote: "we lose patients when nobody picks up",
    url: "https://www.reddit.com/r/smallbusiness/comments/p1/x/", threads: 1 }, { pain: "fake", summary: "x", quote: "never said this", url: "https://www.reddit.com/r/fake" }],
    outcomes: [{ outcome: "every call answered", detail: "x", url: "" }], angles: [{ headline: "No more missed calls", pain: "missed calls" }], language: ["nobody picks up"], gaps: "" }) + "\n```", credits: 1 };
  if (m.includes("write scripts for vertical UGC")) return { text: JSON.stringify({ scripts: [
    { style: "story", angle: "missed calls", pain: "missed calls", persona: "clinic owner", script: SCRIPT + " “quoted” — dash", claims: ["a third"] },
    { style: "hook", angle: "illegal", pain: "missed calls", persona: "owner", script: "this feels illegal to know. Acme answers every call. Click the link.", claims: [] }] }), credits: 1 };
  throw new Error("unexpected prompt");
});

await migrate();
// an avatar seeded before the v2 photos (old image key) must get the new photo in place, not a duplicate
await pool.query("INSERT INTO avatars (name, persona, image_key) VALUES ('Maria · Car', 'old', 'avatars/seed-01-latina-wavy--car.jpg')");
await seed();
const thumbs = await q("SELECT thumb_key FROM avatars WHERE NOT archived");
ok(thumbs.every((a) => a.thumb_key && existsSync(join(process.env.LOCAL_STORAGE_DIR, a.thumb_key))), `avatar thumbs made (${thumbs.filter((a) => a.thumb_key).length}/${thumbs.length})`);
ok((await one("SELECT count(*)::int n FROM boards")).n === 1, "first board created on seed");
const upd = await one("SELECT count(*)::int n, max(image_key) k FROM avatars WHERE name = 'Maria · Car'");
ok(upd.n === 1 && upd.k === "avatars/seed-01-latina-wavy--car-v2.jpg", `v2 photo swapped in place (${upd.n} row, ${upd.k})`);
ok((await one("SELECT count(*)::int n FROM avatars")).n === 65, "65 built-in avatars");
await seed();
ok((await one("SELECT count(*)::int n FROM avatars")).n === 65, "seed is idempotent");
ok((await one("SELECT voice_id FROM voices WHERE id = 'default'")).voice_id, "seed voice");

// cleaning + spoken
ok(clean('He said "hi" — it’s 24/7: 95% at 9:45 p.m.') === "He said hi, it's 24/7 95 percent at 9:45 p.m.", "clean keeps 24/7 and 9:45");
ok((await spoken("It's 24/7 at 2am")).spoken.includes("twenty-four seven"), "spoken spells numbers");

// research → scripts
const p = await one("INSERT INTO projects (url, n) VALUES ('https://acme.test', 2) RETURNING *");
const fakeSite = http.createServer((req, res) => res.end("<title>Acme</title><h1>AI receptionist</h1><p>Answers every call.</p>")).listen(0);
await pool.query("UPDATE projects SET url = $1 WHERE id = $2", [`http://127.0.0.1:${fakeSite.address().port}`, p.id]);
await processProject({ ...(await one("SELECT * FROM projects WHERE id = $1", [p.id])) });
const pr = await one("SELECT * FROM projects WHERE id = $1", [p.id]);
ok(pr.status === "done", `project done (${pr.status} ${pr.error || ""})`);
ok(pr.insights.pains.length === 2 && pr.insights.pains[1].url === "" && pr.insights.pains[1].quote === "", "made-up quote + link dropped");
const scripts = await q("SELECT * FROM scripts WHERE project_id = $1 ORDER BY id", [p.id]);
ok(scripts.length === 2 && !scripts[0].text.includes("“") && !scripts[0].text.includes("—"), "2 scripts written and cleaned");

// estimate + guard
const est = await plan({ items: scripts.map((s) => ({ script_id: s.id })), avatar_ids: [1], engine: "seedance" });
ok(est.rows.length === 2 && est.total > 0, `estimate ${est.total} credits`);
const long = await plan({ items: [{ text: Array(140).fill("word").join(" ") }], avatar_ids: [1], engine: "seedance" });
ok(long.rows[0].tooLong, "too-long script flagged");
const all = await plan({ items: scripts.map((s) => ({ script_id: s.id })), avatar_ids: [1, 1], pair: "all", engine: "kling" });
ok(all.rows.length === 4, "pair=all multiplies");

// pasted scripts are saved once and linked to their videos
const before0 = (await one("SELECT count(*)::int n FROM scripts")).n;
const pv = await createVideos({ items: [{ text: "Pasted script here. Click the link." }, { text: "Pasted script here. Click the link." }], avatar_ids: [1], engine: "kling" });
const after0 = (await one("SELECT count(*)::int n FROM scripts")).n;
ok(after0 === before0 + 1 && (await one("SELECT count(*)::int n FROM videos WHERE id = ANY($1) AND script_id IS NOT NULL", [pv.ids])).n === 2, "pasted script saved once, both videos linked");
await pool.query("DELETE FROM videos WHERE id = ANY($1)", [pv.ids]);

// Kling render (no fixer)
const k = await createVideos({ items: [{ script_id: scripts[0].id }], avatar_ids: [1], engine: "kling" });
let v = await one("SELECT * FROM videos WHERE id = $1", [k.ids[0]]);
await renderVideo(v, { heavy });
v = await one("SELECT * FROM videos WHERE id = $1", [v.id]);
ok(v.keys.voice && v.keys.raw && v.keys.fixed && v.keys.final, "kling: all steps stored");
const fin = join(process.env.LOCAL_STORAGE_DIR, v.keys.final);
const dims = (await import("node:child_process")).execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", fin]).toString().trim();
ok(dims === "1080,1920", `final is 1080x1920 (${dims})`);

// poster + browser links (local mode: /files/<key>; cloud: presigned api.graphed.com)
ok(v.keys.poster && existsSync(join(process.env.LOCAL_STORAGE_DIR, v.keys.poster)), `poster made (${v.keys.poster})`);
const pw = (await import("node:child_process")).execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", join(process.env.LOCAL_STORAGE_DIR, v.keys.poster)]).toString().trim();
ok(pw === "360", `poster is 360 px wide (${pw})`);
const L = await import("./links");
const vl = await L.videoLinks({ ...v, avatar: "Maria · Car" });
ok(vl.url === `/files/videos/${v.id}/final.mp4` && vl.file === `maria-car-${v.id}.mp4` && vl.poster.endsWith("poster.jpg"), `video links (${vl.url}, ${vl.file})`);
await pool.query("UPDATE videos SET keys = keys - 'poster' WHERE id = $1", [v.id]);
await L.backfill(heavy);
ok((await one("SELECT keys FROM videos WHERE id = $1", [v.id])).keys.poster, "backfill remakes a missing poster");

// board cells: explicit (script, avatar) pairs, scripts measured once
const pp = await plan({ pairs: [{ script_id: scripts[0].id, avatar_id: 1 }, { script_id: scripts[0].id, avatar_id: 2 }, { script_id: scripts[1].id, avatar_id: 2 }] });
ok(pp.rows.length === 3 && pp.rows[1].avatar_id === 2 && pp.total > 0, `pairs plan (${pp.rows.length} rows, ${pp.total} cr)`);
const pc = await createVideos({ pairs: [{ script_id: scripts[1].id, avatar_id: 3 }], board_id: 1 });
ok((await one("SELECT board_id, avatar_id FROM videos WHERE id = $1", [pc.ids[0]])).board_id === 1, "video keeps its board");
await pool.query("DELETE FROM videos WHERE id = ANY($1)", [pc.ids]);
let big = null; try { await plan({ pairs: Array.from({ length: 101 }, (_, i) => ({ script_id: scripts[0].id, avatar_id: (i % 60) + 1 })) }); } catch (e) { big = e.message; }
ok(big && big.includes("100"), "more than 100 cells refused");

// step times + estimates
ok(v.steps && v.steps.voice?.end && v.steps.film?.end && v.steps.finish?.end, `steps recorded (${Object.keys(v.steps || {}).join(",")})`);
const eta = await import("./eta");
const t13 = eta.total(eta.stepTimes(13, "seedance"));
ok(t13 > 300 && t13 < 600, `13 s Seedance video ~${Math.round(t13 / 60)} min`);
ok(eta.batchSeconds([{ secs: 29, engine: "seedance" }, { secs: 29, engine: "seedance" }]) > eta.total(eta.stepTimes(29, "seedance")), "batch takes longer than one video");
const prg = eta.progress({ status: "running", stage: "seedance", words: 47, engine: "seedance", steps: { film: { start: Date.now() - 60_000 } } });
ok(prg.pct > 0.1 && prg.pct < 0.95 && prg.left > 60 && prg.label === "Filming", `progress mid-film ${Math.round(prg.pct * 100)}%, ${Math.round(prg.left / 60)} min left`);
ok(eta.progress({ status: "done" }).pct === 1, "done = 100%");
const est2 = await plan({ items: [{ script_id: scripts[0].id }], avatar_ids: [1], engine: "seedance" });
ok(est2.seconds > 0 && est2.rows[0].seconds > 0, `estimate has time (${Math.round(est2.seconds / 60)} min)`);

// Seedance render: the python fixer asks the worker for transcripts; fake transcriber returns the script exactly
const words = (await spoken(scripts[0].text)).spoken.split(" ");
let garble = false;
const tx = http.createServer((req, res) => {
  let b = ""; req.on("data", (d) => b += d); req.on("end", () => {
    if (req.headers["x-tx-token"] !== TX.token) { res.statusCode = 403; return res.end("{}"); }
    const take = /\/(render|cr\d|try|sp|base|cutcheck|splicetest)/.test(JSON.parse(b || "{}").path || "");
    const said = garble && take ? words.map((w, i) => (i % 3 ? "blah" : w)) : words;  // garbled take: 2 of 3 words wrong
    res.end(JSON.stringify({ text: " " + said.join(" "), chunks: said.map((w, i) => ({ timestamp: [i * 0.3, i * 0.3 + 0.25], text: " " + w })) }));
  });
}).listen(TX.port = 0 || 0);
await new Promise((r) => tx.on("listening", r));
TX.port = tx.address().port;
const s = await createVideos({ items: [{ script_id: scripts[0].id }], avatar_ids: [1], engine: "seedance" });
v = await one("SELECT * FROM videos WHERE id = $1", [s.ids[0]]);
await renderVideo(v, { heavy });
v = await one("SELECT * FROM videos WHERE id = $1", [v.id]);
ok(v.keys.final && Array.isArray(v.report.unfixed) && v.report.unfixed.length === 0, `seedance + fixer: clean report (${JSON.stringify(v.report).slice(0, 120)})`);
ok(calls.filter((c) => c.includes("seedance")).length === 1 && calls.includes("kie:bytedance/seedance-2-5"), "one seedance call, on kie");

// garbled take: most words wrong after the fix -> wrong_pct over the bad-take line
garble = true;
const g = await createVideos({ items: [{ script_id: scripts[0].id }], avatar_ids: [1], engine: "seedance" });
let gv = await one("SELECT * FROM videos WHERE id = $1", [g.ids[0]]);
await renderVideo(gv, { heavy });
gv = await one("SELECT * FROM videos WHERE id = $1", [gv.id]);
const { BAD_TAKE } = await import("./render");
ok(gv.report.wrong_pct > BAD_TAKE, `garbled take flagged (${Math.round(gv.report.wrong_pct * 100)}% wrong)`);
ok((v.report.wrong_pct || 0) === 0, "clean take has 0% wrong");
garble = false;

// resume: a second render of the same row reuses stored steps (no new paid calls)
const before = calls.length;
await renderVideo({ ...v, keys: { voice: v.keys.voice, raw: v.keys.raw } }, { heavy });
ok(calls.filter((c, i) => i >= before && (c.includes("speech") || c.includes("seedance"))).length === 0, "resume skips paid steps");

// cancel stops before any paid call; retry waits until the worker drops the clip
{
  const c = await createVideos({ items: [{ script_id: scripts[0].id }], avatar_ids: [1], engine: "seedance" });
  await pool.query("UPDATE videos SET status = 'canceled', holder = 'h1' WHERE id = $1", [c.ids[0]]);
  const nCalls = calls.length;
  let stopped = false;
  try { await renderVideo(await one("SELECT * FROM videos WHERE id = $1", [c.ids[0]]), { heavy, holder: "h1" }); }
  catch (e) { stopped = e.canceled === true; }
  ok(stopped && calls.length === nCalls, "canceled clip makes no paid call");
  const held = await retryVideo(c.ids[0]);
  ok(held.held === true && (await one("SELECT status FROM videos WHERE id = $1", [c.ids[0]])).status === "canceled", "retry waits while the worker holds the clip");
  await pool.query("UPDATE videos SET holder = NULL WHERE id = $1", [c.ids[0]]);
  const again = await retryVideo(c.ids[0]);
  const row = await one("SELECT status, attempt FROM videos WHERE id = $1", [c.ids[0]]);
  ok(again.ok === true && row.status === "queued" && row.attempt === 1, "retry queues once the clip is free");

  await pool.query("UPDATE videos SET status = 'canceled', holder = 'dead', heartbeat_at = now() - interval '10 minutes' WHERE id = $1", [c.ids[0]]);
  await releaseFinishedHolders({ stale: true });
  let left = await one("SELECT status, holder FROM videos WHERE id = $1", [c.ids[0]]);
  ok(left.status === "canceled" && left.holder == null, "a stale canceled clip drops its holder and stays canceled");
  await pool.query("UPDATE videos SET status = 'done', holder = 'dead', heartbeat_at = now() - interval '10 minutes' WHERE id = $1", [c.ids[0]]);
  await releaseFinishedHolders({ stale: true });
  left = await one("SELECT status, holder FROM videos WHERE id = $1", [c.ids[0]]);
  ok(left.status === "done" && left.holder == null, "a stale finished clip drops its holder and stays finished");
  await pool.query("UPDATE videos SET holder = 'live', heartbeat_at = now() WHERE id = $1", [c.ids[0]]);
  await releaseFinishedHolders({ stale: true });
  left = await one("SELECT status, holder FROM videos WHERE id = $1", [c.ids[0]]);
  ok(left.holder === "live", "a clip that is still stopping keeps its holder");
  await releaseFinishedHolders({ stale: false });
  left = await one("SELECT status, holder FROM videos WHERE id = $1", [c.ids[0]]);
  ok(left.status === "done" && left.holder == null, "boot clears a finished holder without queueing the clip");
}

// a failed fix still deletes its scratch dir (spliced.mp4 and wavs)
{
  const { execFileSync } = await import("node:child_process");
  const lines = execFileSync("python3", ["-c", `
import os, sys, tempfile
sys.path.insert(0, "engine")
import fix_words
seen = []
real = tempfile.mkdtemp
def spy():
    d = real()
    seen.append(d)
    return d
tempfile.mkdtemp = spy
open("/tmp/ugc-fix-script.txt", "w").write("hello there\\n")
try:
    fix_words.fix("missing.mp4", "missing.mp3", "/tmp/ugc-fix-script.txt", "/tmp/ugc-fix-out.mp4")
except Exception:
    pass
print(seen[0] if seen else "none")
print("gone" if seen and not os.path.isdir(seen[0]) else "left")
`], { cwd: process.cwd() }).toString().trim().split("\n");
  ok(lines.at(-1) === "gone", `fixer scratch dir removed (${lines.at(-1)})`);
}

// HTTP: the server's board API, links in /api/state, local /files (own process, own in-memory DB, no worker)
{
  const { spawn } = await import("node:child_process");
  const port = 39000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, ["--import", "tsx", "packages/core/src/http.ts"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NO_WORKER: "1",
    LOCAL_STORAGE_DIR: join(T, "storage2"), WORK_DIR: join(T, "work2") }, stdio: ["ignore", "pipe", "pipe"] });
  let srvErr = ""; srv.stderr.on("data", (d) => srvErr += d);
  const u = (p) => `http://127.0.0.1:${port}${p}`;
  const J = async (p, body, method) => { const r = await fetch(u(p), body !== undefined || method ? { method: method || "POST", headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined } : {}); return { status: r.status, d: await r.json() }; };
  for (let i = 0; i < 100; i++) { try { if ((await fetch(u("/health"))).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  let st; for (let i = 0; i < 150; i++) { st = (await J("/api/state")).d; if (st.avatars?.length === 65 && st.avatars.every((a) => a.thumb !== a.img)) break; await new Promise((r) => setTimeout(r, 400)); }
  ok(st.avatars.length === 65 && st.avatars[0].thumb.startsWith("/files/") && !("image_key" in st.avatars[0]), `state has avatar links, no keys (${st.avatars[0].thumb})`);
  const th = await fetch(u(st.avatars[0].thumb));
  ok(th.ok && th.headers.get("content-type") === "image/jpeg", "/files serves the thumb");
  ok((await fetch(u("/files/../server.mjs"))).status >= 400, "/files refuses ..");
  const nb = (await J("/api/boards", { name: "Test board", avatar_ids: [1, 2, 2] })).d;
  const add = (await J(`/api/boards/${nb.id}/scripts`, { texts: ["First script. Click the link.", "Second script here. Click the link."] })).d;
  ok(add.added === 2, "board: 2 pasted scripts added");
  const bd = (await J(`/api/boards/${nb.id}`)).d;
  ok(bd.scripts.length === 2 && bd.avatars.length === 2 && bd.avatars[0].thumb && Array.isArray(bd.cells), `board grid ${bd.scripts.length}x${bd.avatars.length}`);
  const be = (await J("/api/estimate", { pairs: bd.scripts.flatMap((s) => bd.avatars.map((a) => ({ script_id: s.id, avatar_id: a.id }))) })).d;
  ok(be.rows?.length === 4 && be.total > 0, `board estimate 4 cells, ${be.total} cr`);
  const nv = (await J("/api/videos", { pairs: [{ script_id: bd.scripts[0].id, avatar_id: 1 }], board_id: nb.id })).status;
  ok(nv === 400, "generate without confirm is refused");
  await J(`/api/boards/${nb.id}`, { name: "Renamed", avatar_ids: [2] }, "PATCH");
  const b2 = (await J(`/api/boards/${nb.id}`)).d;
  ok(b2.name === "Renamed" && b2.avatars.length === 1 && b2.scripts.length === 2, "board rename + remove column keeps rows");
  await J(`/api/boards/${nb.id}`, { name: "Name only" }, "PATCH");
  const b3 = (await J(`/api/boards/${nb.id}`)).d;
  ok(b3.name === "Name only" && b3.scripts.length === 2 && b3.avatars.length === 1, "name-only patch keeps rows and columns");
  const made = await J("/api/videos", { pairs: [{ script_id: b3.scripts[0].id, avatar_id: 1 }], board_id: nb.id, confirm: true });
  const vid = made.d.ids && made.d.ids[0];
  ok(made.status === 200 && vid, "confirmed generate queues a clip");
  ok((await J(`/api/videos/${vid}/cancel`)).status === 404, "cancel without a body is not found");
  ok((await J(`/api/videos/${vid}/cancel`, {})).status === 200, "cancel POST");
  ok((await J(`/api/videos/${vid}`)).d.status === "canceled", "clip is canceled");
  ok((await J(`/api/videos/${vid}/retry`)).status === 404, "retry without a body is not found");
  ok((await J(`/api/videos/${vid}/retry`, {})).d.ok === true, "retry POST");
  ok((await J(`/api/videos/${vid}`)).d.status === "queued", "retry queues the clip");
  ok((await fetch(u("/health"))).ok, "health");
  ok((await fetch(u("/api/health"))).ok, "api health");
  srv.kill();
  if (fails) console.log(srvErr.slice(-2000));
}

// a 503 while reading a finished run must not start a second paid run; a failed run may
setFake(null, null);
process.env.UGC_TOOL_RETRY_MS = "0";
{
  const orig = { start: graphed.tools.start, wait: graphed.tools.wait, downloadResult: graphed.tools.downloadResult };
  const starts = [];
  graphed.tools.start = async (_id, _input, opts) => { const idem = opts && opts.idempotencyKey; starts.push(idem); return { id: "run-" + idem }; };
  let waits = 0;
  graphed.tools.wait = async (id) => { waits++; if (waits === 1) { const e = new Error("upstream unavailable"); e.status = 503; throw e; } return { id, status: "ready" }; };
  let downloads = 0;
  graphed.tools.downloadResult = async (id) => { downloads++; if (downloads === 1) throw new Error("502 bad gateway"); return { ok: id }; };
  const res = await tool("kie:test", {}, "key-1");
  ok(starts.length === 1 && starts[0] === "key-1" && res.ok === "run-key-1", `read errors reuse the run (${starts.join(",")})`);
  starts.length = 0;
  graphed.tools.wait = async (id) => ({ id, status: id.endsWith("key-2") ? "failed" : "ready", statusMessage: id.endsWith("key-2") ? "503 upstream" : "" });
  graphed.tools.downloadResult = async (id) => ({ ok: id });
  const res2 = await tool("kie:test", {}, "key-2");
  ok(starts.length === 2 && starts[1] === "key-2-r1" && res2.ok === "run-key-2-r1", `failed run starts another (${starts.join(",")})`);
  Object.assign(graphed.tools, orig);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
files.close(); fakeSite.close(); tx.close();
process.exit(fails ? 1 : 0);
