// Offline tests: npm test. No Graphed login, no network, no credits.
//   1. Pure checks: transcript format, playlists, the edit document, the chunk plan, the sandbox scripts, audio sync.
//   2. The app on an embedded Postgres (PGlite): projects, comments, the @agent queue, first-cut briefs,
//      the agent API (REST + MCP), save_edit / get_edit. Nothing here starts a render or calls a vendor.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

// storage is never reached: presigned links are computed locally
Object.assign(process.env, { GRAPHED_STORAGE_ENDPOINT: "http://127.0.0.1:9", GRAPHED_STORAGE_BUCKET: "test-bucket",
  GRAPHED_STORAGE_ACCESS_KEY_ID: "test", GRAPHED_STORAGE_SECRET_ACCESS_KEY: "test" });

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log("FAIL", m); } else if (process.env.VERBOSE) console.log("ok  ", m); };
const throws = async (fn, re, m) => { try { await fn(); ok(false, `${m} (did not throw)`); } catch (e) { ok(re.test(e.message), `${m}: ${e.message}`); } };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

// the embedded Postgres (PGlite) starts first, so lib.mjs in this process reaches it too
const { PGlite } = await import("@electric-sql/pglite");
const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
const pgPort = await freePort(), port = await freePort();
const pglite = await PGlite.create();
const pgServer = new PGLiteSocketServer({ db: pglite, port: pgPort, host: "127.0.0.1", maxConnections: 20 });
await pgServer.start();
const DATABASE_URL = `postgres://postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable`;
process.env.DATABASE_URL = DATABASE_URL;

// ---------- 1. pure checks ----------
const { toWords, mergeSources } = await import("./words.mjs");
const { segmentsOf, isCloudRender, retireCuts, projectKeys, openVerified, withVerified, db: libDb } = await import("./lib.mjs");
const { mentionsAgent, briefText, audioShort } = await import("./agent.mjs");
const { normalizeEdit, planChunks, playlistSeconds, chunkScript, prepScript, xcorrLag, CHUNK_S } = await import("./render.mjs");

const tr = toWords({ duration_seconds: 3, segments: [{ speaker: "SPEAKER_00", words: [{ word: "Hello", start: 0.1, end: 0.4 }, { word: "42" }, { word: "world", start: 1.0, end: 1.3 }] }] }, 3, { speaker: "Sam mic" });
ok(tr.speakers[0] === "Sam mic" && tr.words.length === 3 && tr.words[1][0] === 400 && tr.words[1][1] === 1000, "toWords: one speaker, a word with no time gets the gap");
const merged = mergeSources([{ label: "A", transcript: { words: [[500, 700, "two", 0, 500, 700]] } }, { label: "B", transcript: { words: [[100, 300, "one", 0, 100, 300]] } }]);
ok(merged.words.map((w) => w[2]).join(" ") === "one two" && merged.speakers.join() === "A,B" && merged.words[0][3] === 1, "mergeSources: time order, speaker = source");

ok(segmentsOf("#EXTM3U\n#EXTINF:6,\nseg_0000.m4s\n#EXTINF:6,\nseg_0001.m4s\n").join() === "init.mp4,seg_0000.m4s,seg_0001.m4s", "segmentsOf: flat playlist");
ok(segmentsOf('#EXTM3U\n#EXT-X-MAP:URI="chunks/aa/init.mp4"\n#EXTINF:6,\nchunks/aa/seg_000.m4s\n#EXT-X-DISCONTINUITY\n#EXT-X-MAP:URI="chunks/bb/init.mp4"\n#EXTINF:6,\nchunks/bb/seg_000.m4s\n').length === 4, "segmentsOf: chunked playlist lists every init + segment");
ok(Math.abs(playlistSeconds("#EXTINF:6.000000,\na\n#EXTINF:5.5,\nb\n") - 11.5) < 1e-9, "playlistSeconds");
ok(mentionsAgent("@agent cut this") && mentionsAgent("please @Agent fix") && !mentionsAgent("mail me at x@agent.com") && !mentionsAgent("agent"), "mentionsAgent");
ok(/Goal: 30 s ad/.test(briefText({ goal: "30 s ad", format: "vertical", length: "30 s" })) && /1080x1920/.test(briefText({ goal: "x", format: "vertical" })), "briefText");

// two cameras with their own mics (a remote podcast), a screen recording and a 9:16 ad
const cam = (id, label, ms, extra = {}) => ({ id, label, key: `videos/t/sources/${id}-${label}.mp4`, size: 1000 + id, tx_status: "done", sync_offset_ms: 0,
  meta: { duration_ms: ms, has_audio: true, video: { width: 1920, height: 1080, fps: 30 } }, ...extra });
const SOURCES = [cam(1, "host", 600_000), cam(2, "guest", 500_000, { sync_offset_ms: -100_000 }),
  { id: 3, label: "screen", key: "videos/t/sources/3-screen.mp4", size: 3000, sync_offset_ms: -200_000, meta: { duration_ms: 120_000, has_audio: false, video: { width: 1730, height: 1080, fps: 30 } } },
  { id: 4, label: "ad", key: "videos/t/sources/4-ad.mp4", size: 4000, sync_offset_ms: 0, meta: { duration_ms: 29_000, has_audio: true, video: { width: 1080, height: 1920, fps: 30 } } }];
const EDIT = { audio: ["1", "2"], sources: { 4: { offset_ms: -400_000 } }, clips: [
  { in_ms: 10_000, out_ms: 50_000, video: "1" },                                       // guest has not joined yet: silence for that mic
  { in_ms: 150_000, out_ms: 170_000, video: "2", crop: { x: 0.5, y: 0.3, zoom: 1.5 } },
  { in_ms: 210_000, out_ms: 240_000, video: "3", fit: "contain" },
  { in_ms: 400_000, out_ms: 429_000, video: "4", fit: "contain", audio: "own", note: "ad" }] };
const edit = normalizeEdit(EDIT, SOURCES);
ok(edit.format.width === 1920 && edit.format.fps === 30 && edit.duration_ms === 119_000, `normalizeEdit: format + length (${edit.duration_ms})`);
ok(edit.sources["2"].offset_ms === -100_000 && edit.sources["4"].offset_ms === -400_000, "normalizeEdit: offsets default to sync, the edit's own win");
ok(edit.clips[1].crop.zoom === 1.5 && edit.clips[3].audio === "own" && edit.clips[2].fit === "contain", "normalizeEdit: keeps crop, fit, own audio");
ok(JSON.stringify(normalizeEdit(edit, SOURCES)) === JSON.stringify(edit), "normalizeEdit: a normalized edit stays the same");
{ const big = normalizeEdit({ ...EDIT, format: { width: 1e9, height: 99999, fps: 30 } }, SOURCES).format;
  ok(big.width === 4096 && big.height === 4096, "normalizeEdit: the frame is at most 4096 on a side"); }
await throws(() => normalizeEdit({ clips: [] }, SOURCES), /at least one/, "no clips");
await throws(() => normalizeEdit({ clips: [{ in_ms: 5, out_ms: 5, video: "1" }] }, SOURCES), /out_ms must be greater/, "empty clip");
await throws(() => normalizeEdit({ clips: [{ in_ms: 0, out_ms: 10, video: "99" }] }, SOURCES), /no ready source 99/, "unknown source");
await throws(() => normalizeEdit({ clips: [{ in_ms: 590_000, out_ms: 640_000, video: "1" }] }, SOURCES), /only 600000 ms long/, "clip past the end of its source");
await throws(() => normalizeEdit({ clips: [{ in_ms: 0, out_ms: 50_000, video: "2" }] }, SOURCES), /before source 2/, "clip before a late joiner starts");
await throws(() => normalizeEdit({ audio: ["3"], clips: [{ in_ms: 0, out_ms: 10, video: "1" }] }, SOURCES), /no audio/, "audio source with no sound");
await throws(() => normalizeEdit({ clips: [{ in_ms: 210_000, out_ms: 220_000, video: "3", audio: "own" }] }, SOURCES), /no sound of its own/, "own audio on a silent source");

const chunks = planChunks(edit, SOURCES);
const frames = chunks.reduce((t, c) => t + c.frames, 0);
ok(frames === 119 * 30 && chunks.length === 4 && chunks.slice(0, -1).every((c) => c.frames === CHUNK_S * 30), `planChunks: ${chunks.length} chunks, ${frames} frames`);
ok(new Set(chunks.map((c) => c.key)).size === chunks.length && /^[0-9a-f]{32}$/.test(chunks[0].key), "planChunks: one key per chunk");
ok(planChunks(edit, SOURCES).every((c, i) => c.key === chunks[i].key), "planChunks: same edit, same keys");
const moved = structuredClone(EDIT); moved.clips[3].in_ms += 1000; moved.clips[3].out_ms += 1000;
const chunks2 = planChunks(normalizeEdit(moved, SOURCES), SOURCES);
ok(chunks2[0].key === chunks[0].key && chunks2[1].key === chunks[1].key && chunks2[3].key !== chunks[3].key, "planChunks: a change at the end keeps the earlier chunks' keys");
ok(chunks[0].pieces[0].video_ms === 10_000 && chunks.at(-1).pieces.at(-1).own_audio === true, "planChunks: source time and own-audio pieces");

const script = await chunkScript(chunks[0], edit, "t");
ok(!/https?:\/\/[^\s'"]*sources\//.test(script) && /-i \/tmp\/src\/[0-9a-f]{16}\.mp4/.test(script), "chunkScript: reads local files, never a storage URL");
ok(/aevalsrc=0\|0/.test(script), "chunkScript: silence for a mic that has not started");
ok(/nb_read_packets/.test(script) && /of 900 frames|of \d+ frames/.test(script), "chunkScript: checks every piece's frame count");
ok((script.match(/X-Amz-Signature/g) || []).length >= 7 && /curl -sf --retry 4/.test(script), "chunkScript: presigned PUTs with retries");
const adScript = await chunkScript(chunks.at(-1), edit, "t");
ok(/force_original_aspect_ratio=decrease,pad=1920:1080/.test(adScript), "chunkScript: contain fit pads to the frame");
// own sound plays at its source's gain, and the gain is part of the chunk's key
const loud = structuredClone(EDIT); loud.sources[4] = { offset_ms: -400_000, gain_db: 6 };
const loudEdit = normalizeEdit(loud, SOURCES), chunksLoud = planChunks(loudEdit, SOURCES);
ok(chunksLoud.at(-1).key !== chunks.at(-1).key && chunksLoud.slice(0, -1).every((c, i) => c.key === chunks[i].key), "planChunks: gain on an own-audio clip changes that chunk's key only");
ok(/volume=6dB/.test(await chunkScript(chunksLoud.at(-1), loudEdit, "t")) && /volume=0dB/.test(adScript) && !/volume=6dB/.test(adScript), "chunkScript: a clip's own sound plays at its source's gain");
const camOnly = normalizeEdit({ audio: [], sources: { 1: { gain_db: -3 } }, clips: [{ in_ms: 0, out_ms: 10_000, video: "1" }] }, SOURCES);
ok(/volume=-3dB/.test(await chunkScript(planChunks(camOnly, SOURCES)[0], camOnly, "t")), "chunkScript: camera sound with no audio mix uses the camera's gain");

ok(audioShort(3500, 3600) && audioShort(57, 60) && !audioShort(3590, 3600) && !audioShort(59, 60) && !audioShort(null, 60) && !audioShort(60, null), "audioShort: more than 2 s or 0.5 % missing");
const fmp4 = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6.0,\nseg_0000.m4s\n#EXT-X-ENDLIST\n';
ok(!isCloudRender({ slug: "a", playlist: fmp4, hls_prefix: "videos/a/v1/hls/" }) && isCloudRender({ slug: "a", playlist: fmp4, hls_prefix: "videos/a/renders/" }) && !isCloudRender({ slug: "a", playlist: null, hls_prefix: "videos/a/renders/" }),
  "isCloudRender: an imported fMP4 video is not a cloud render");

// size-checked reads (what ffmpeg and ffprobe get in place of a storage link): a fake storage here stops two of
// three answers early, one with no error at all and one with a dropped connection
const blob = randomBytes(300_000); let upCalls = 0, upCut = 0, upMode = "flaky";
const up = http.createServer((req, res) => {
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range), a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), blob.length - 1) : blob.length - 1;
  const full = blob.subarray(a, b + 1), head = { "Content-Range": `bytes ${a}-${b}/${blob.length}` };
  upCalls++;
  if (upMode === "dead" && a >= 100_000) { res.writeHead(206, head); return res.end(); }
  if (upMode === "good" || full.length < 2 || upCalls % 3 === 0) { res.writeHead(206, { ...head, "Content-Length": full.length }); return res.end(full); }
  upCut++;
  if (upCalls % 2) { res.writeHead(206, head); return res.end(full.subarray(0, Math.floor(full.length * 0.4))); }       // the body just ends
  res.writeHead(206, { ...head, "Content-Length": full.length }); res.write(full.subarray(0, Math.floor(full.length * 0.6))); setTimeout(() => res.destroy(), 5);
});
await new Promise((res) => up.listen(0, "127.0.0.1", res));
const upSign = async () => `http://127.0.0.1:${up.address().port}/a.mp4`;
const bytes = async (url, range) => Buffer.from(await (await fetch(url, range ? { headers: { Range: range } } : {})).arrayBuffer());
const v = await openVerified("videos/t/sources/1-a.mp4", { size: blob.length, sign: upSign, piece: 40_000 });
ok((await bytes(v.url)).equals(blob) && upCut >= 5 && !v.failed(), `openVerified: the whole object comes through byte for byte (${upCut} of ${upCalls} storage answers were cut short)`);
ok((await bytes(v.url, "bytes=123456-")).equals(blob.subarray(123456)) && (await bytes(v.url, "bytes=10-19")).equals(blob.subarray(10, 20)) && !v.failed(), "openVerified: byte ranges (ffmpeg seeks)");
ok((await fetch(v.url, { headers: { Range: `bytes=${blob.length}-` } })).status === 416, "openVerified: a range past the end is refused");
v.close();
ok((await withVerified("k", { sign: upSign, piece: 40_000 }, async (url) => (await bytes(url)).length)) === blob.length, "withVerified: returns the reader's result");
await throws(() => openVerified("k", { size: blob.length - 1, sign: upSign }), /bytes expected/, "openVerified: the stored size must equal the uploaded size");
upMode = "dead";
await throws(() => withVerified("videos/t/sources/1-a.mp4", { sign: upSign, piece: 40_000 }, async (url) => { try { return (await bytes(url)).length; } catch { return -1; } }),
  /did not complete .*no bytes at 1\d{5}/, "withVerified: storage that stops for good makes the read fail, whatever the reader returned");
up.closeAllConnections(); up.close();

// the review page's upload: every part gets a signed link, part 1 included (the page code runs here with stubs)
const uploadSrc = readFileSync(new URL("./index.html", import.meta.url), "utf8").match(/async function uploadOne\(u\) \{[\s\S]*?\n\}\n/)?.[0];
ok(!!uploadSrc, "index.html has uploadOne");
{ // chapter and insert marks from a published version cannot put markup on the page
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const src = page.match(/function cleanMarks\(asset\) \{[\s\S]*?\n\}\n/)?.[0];
  const cleanMarks = new Function(`${src}; return cleanMarks;`)();
  const bad = '"><img src=x onerror=alert(1)>';
  const m = cleanMarks({ chapters: [[bad, 7], [12.5, "Intro"], "x"], inserts: [{ t0: bad, label: 5 }, null, { t0: "3", label: bad }] });
  ok(JSON.stringify(m.chapters) === JSON.stringify([[0, "7"], [12.5, "Intro"]]), "page: chapter times are numbers, names are text");
  ok(m.inserts.length === 2 && m.inserts[0].t0 === 0 && m.inserts[0].label === "5" && m.inserts[1].t0 === 3, "page: insert times are numbers, labels are text");
  ok(cleanMarks({}).chapters.length === 0 && cleanMarks({ chapters: "x", inserts: 4 }).inserts.length === 0, "page: marks that are not lists are dropped");
  ok(!/\$\{INSERTS\[ins\]\.label\}/.test(page) && (page.match(/\$\{esc\(INSERTS\[ins\]\.label\)\}/g) || []).length === 2, "page: insert labels are escaped where they are drawn");
}
for (const [parts, size] of [[23, 23 * 10 - 3], [1, 7]]) {
  const puts = []; let completed = 0;
  const rootStub = async (path, opts) => {
    if (path.endsWith("/sources")) return { id: 7, part_size: 10, parts };
    if (path.endsWith("/parts")) return { urls: Object.fromEntries(JSON.parse(opts.body).parts.map((n) => [n, `https://storage.test/part/${n}`])) };
    if (path.endsWith("/complete")) completed++;
    return { ok: true };
  };
  class XHR { constructor() { this.upload = {}; } open(m, url) { this.url = String(url); } send(blob) { puts.push([this.url, blob.size]); queueMicrotask(() => { this.status = 200; this.onload(); }); } }
  const uploadOne = new Function("root", "XMLHttpRequest", "BOOT", "uploads", "renderSources", "toast", "refreshSources", `${uploadSrc}; return uploadOne;`)(
    rootStub, XHR, { slug: "x" }, new Map(), () => {}, () => {}, async () => {});
  await uploadOne({ id: "tmp", label: "A", file: { name: "a.mp4", type: "video/mp4", size, slice: (a, b) => ({ size: b - a }) } });
  const urls = puts.map(([u]) => u).sort();
  ok(puts.length === parts && urls.join() === Array.from({ length: parts }, (_, i) => `https://storage.test/part/${i + 1}`).sort().join() && puts.reduce((t, [, b]) => t + b, 0) === size && completed === 1,
    `page upload, ${parts} part(s): every part PUT once to its signed link (${puts.length} PUTs, ${urls.filter((u) => !u.startsWith("https://")).length} without a link)`);
}

const prep = await prepScript([{ key: SOURCES[0].key, size: 1001 }, { key: SOURCES[2].key, size: 3000 }]);
ok((prep.match(/^fetch /gm) || []).length === 2 && /xargs -P 48/.test(prep) && /size mismatch/.test(prep) && / 1001 \/tmp\/src\//.test(prep), "prepScript: whole files, parallel ranges, size check");

// audio sync: the same envelope 37 steps later is found
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;   // fixed noise, like speech loudness
const env = Float64Array.from({ length: 4000 }, rnd);
const late = new Float64Array(4000); late.set(env.subarray(0, 4000 - 37), 37);
const x = xcorrLag(env, late, 500);
ok(x.lag === 37 && x.score > 6, `xcorrLag: lag ${x.lag}, score ${x.score}`);

// ---------- 2. the app on an embedded Postgres ----------
const srv = spawn("node", ["server.mjs"], { env: { ...process.env, DATABASE_URL, PORT: String(port), PUBLIC_URL: `http://127.0.0.1:${port}` }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; srv.stdout.on("data", (d) => { log += d; }); srv.stderr.on("data", (d) => { log += d; });
const B = `http://127.0.0.1:${port}`;
const j = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { "Content-Type": "application/json", ...(o.headers || {}) } }); const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; } return { s: r.status, b }; };
try {
  for (let i = 0; i < 100; i++) { if ((await fetch(B + "/health").catch(() => null))?.ok) break; await new Promise((r) => setTimeout(r, 150)); }
  ok((await fetch(B + "/health")).ok, "server boots on an empty database (migrate)");
  ok((await (await fetch(B + "/")).text()).includes("AI Video Editor"), "home page");
  { // a path under the open prefixes that normalizes to a private route gets no route
    const raw = (path) => new Promise((res, rej) => http.request({ host: "127.0.0.1", port, path, method: "GET" }, (r) => { r.resume(); r.on("end", () => res(r.statusCode)); }).on("error", rej).end());
    const codes = [];
    for (const path of ["/public/../api/projects", "/agent/../api/projects", "/public/%2e%2e/api/projects", "/public/x/../../AGENTS.md", "/agent\\..\\api/projects", "//x/api/projects", "/public/../"])
      codes.push(await raw(path));
    ok(codes.every((c) => c === 404), `dot-dot paths under /public and /agent get 404 (${codes.join(" ")})`);
    ok((await raw("/api/projects")) === 200 && (await raw("/api/projects?x=/../y")) === 200, "a normal path and a query with dots still work");
  }
  const np = await j("/api/projects", { method: "POST", body: JSON.stringify({ title: "Test Podcast" }) });
  ok(np.b.slug === "test-podcast", "new project");
  const P = "/api/projects/test-podcast";
  const meta = (await j("/p/test-podcast/api/project")).b;
  ok(meta.has_edit === false && meta.render === null, "empty project: no edit, no render");
  ok((await fetch(B + "/p/test-podcast/hls/index.m3u8")).status === 404, "no playlist yet");

  // the agent token and the two prompts
  const prompt = await (await fetch(B + P + "/agent-prompt")).text();
  const tok = prompt.match(/ave_[\w-]+/)?.[0];
  ok(tok && prompt.includes(`${B}/agent/mcp`) && prompt.includes("save_edit") && prompt.includes("upload-sources.mjs") && prompt.includes("add-video.mjs"), "project prompt: token, MCP line, cloud edit, scripts");
  ok(!/act_[0-9a-z]{20}|graphed\.cloud/.test(prompt), "project prompt has no account id or foreign URL");
  ok((await (await fetch(B + "/api/agent-prompt")).text()).includes("add-video.mjs"), "new-video prompt");
  const A = (tool, body = {}, t = tok) => j("/agent/" + tool, { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer " + t } });
  ok((await A("get_project", {}, "ave_wrongwrongwrongwrongwrongwrong")).s === 401 && (await j("/agent/tools")).s === 401, "agent API refuses a wrong or missing token");
  const tools = (await j("/agent/tools", { headers: { Authorization: "Bearer " + tok } })).b;
  ok(tools.project === "test-podcast" && ["save_edit", "render", "sync_sources", "add_source", "delete_source"].every((t) => tools.tools.some((x) => x.name === t)), `agent tools (${tools.tools.length})`);
  const guide = (await A("get_guide")).b;
  ok(typeof guide === "string" && guide.includes("7a. The cloud edit") && guide.includes(B) && !guide.includes("__SITE__"), "get_guide fills in the app's URL");
  const mcp = await j("/agent/mcp", { method: "POST", body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { jsonrpc: "2.0", id: 2, method: "tools/list" }]), headers: { Authorization: "Bearer " + tok } });
  ok(mcp.b[0].result.serverInfo.name === "ai-video-editor" && mcp.b[1].result.tools.length === tools.tools.length, "MCP initialize + tools/list");

  // first-cut brief -> task -> progress -> done
  ok((await j(P + "/first-cut", { method: "POST", body: "{}" })).s === 400, "first cut: goal required");
  const fc = await j(P + "/first-cut", { method: "POST", body: JSON.stringify({ goal: "Tighten the episode", format: "landscape", length: "full length", by: "Sam" }) });
  ok(fc.b.task?.status === "queued", "first cut queued");
  ok((await j(P + "/first-cut", { method: "POST", body: JSON.stringify({ goal: "again" }) })).s === 400, "second request refused while queued");
  const lt = (await A("list_tasks")).b;
  ok(lt.length === 1 && lt[0].kind === "first_cut" && /Goal: Tighten the episode/.test(lt[0].request), "list_tasks shows the brief");
  ok((await A("claim_task", { task_id: lt[0].task_id })).b.status === "working" && (await A("claim_task", { task_id: lt[0].task_id })).s === 400, "claim once");
  await A("update_task", { task_id: lt[0].task_id, note: "Reading transcripts" });
  ok((await j(P + "/first-cut")).b.task.note === "Reading transcripts", "the page sees the progress note");

  // sources (rows straight into the database: no upload, no probe) and the edit document
  const pg = (await import("pg")).default;
  const db = new pg.Client({ connectionString: DATABASE_URL }); await db.connect();
  for (const s of SOURCES)
    await db.query(`insert into sources (project, label, file_name, size, key, status, tx_status, meta, sync_offset_ms, transcript, tx_words) values ($1,$2,$3,$4,$5,'ready',$6,$7,$8,$9,$10)`,
      ["test-podcast", s.label, `${s.label}.mp4`, s.size, s.key, s.meta.has_audio ? "done" : "skipped", JSON.stringify(s.meta), s.sync_offset_ms,
       s.id <= 2 ? JSON.stringify({ speakers: [s.label], words: [[12_000 + s.sync_offset_ms * -0 + (s.id === 2 ? 50_000 : 0), 12_400 + (s.id === 2 ? 50_000 : 0), s.label === "host" ? "hello" : "hi", 0, 0, 0]] }) : null, s.id <= 2 ? 1 : null]);
  const ge = (await A("get_edit")).b;
  ok(ge.sources.length === 4 && ge.draft === null && ge.sources[1].sync_offset_ms === -100_000 && ge.sources[2].has_audio === false, "get_edit lists sources with probe + sync");
  const bad = await A("save_edit", { edit: { clips: [{ in_ms: 590_000, out_ms: 640_000, video: "1" }] } });
  ok(bad.s === 400 && /only 600000 ms long/.test(bad.b.error), "save_edit refuses a clip past its source");
  const saved = await A("save_edit", { edit: EDIT });
  ok(saved.b.ok && saved.b.chunks === 4 && saved.b.duration_ms === 119_000, "save_edit: normalized, 4 chunks");
  ok((await A("get_edit")).b.draft.clips.length === 4, "the draft is kept");
  ok((await A("render_status")).s === 400, "no render yet");
  const txt = (await A("get_transcript", { sources: true })).b;
  ok(typeof txt === "string" && /host: hello/.test(txt), "get_transcript merges sources by label");

  // finish the first cut: the reply becomes a comment at 0:00
  const done = await A("complete_task", { task_id: lt[0].task_id, version: "v1", reply: "Kept the last take of the intro." });
  const cm = (await j("/p/test-podcast/api/comments")).b;
  ok(done.b.ok && cm.length === 1 && cm[0].t_ms === 0 && cm[0].resolved && cm[0].author === "Agent" && cm[0].task_status === "done", "first cut note at 0:00, resolved, linked to the task");

  // @agent comment -> task -> reply
  const c = await j("/p/test-podcast/api/comments", { method: "POST", body: JSON.stringify({ t_ms: 5000, t_end_ms: 9000, author: "Sam", body: "@agent tighten this" }) });
  ok(c.b.task_status === "queued", "@agent comment makes a task");
  ok((await j("/p/test-podcast/api/comments", { method: "POST", body: JSON.stringify({ t_ms: 1, author: "Sam", body: "plain note" }) })).b.task_status === undefined, "a plain comment does not");
  const q = (await A("list_tasks")).b;
  ok(q.length === 1 && q[0].kind === "comment" && q[0].at === "0:05–0:09", "comment task listed with its range");
  await A("claim_task", { task_id: q[0].task_id });
  ok((await A("complete_task", { task_id: q[0].task_id, reply: "Cut 0:06–0:08", version: "v2" })).b.reply_id > 0, "comment task completes with a reply");
  ok((await A("list_tasks", { status: "all" })).b.length === 2 && (await A("get_notes")).b.includes("Cut 0:06"), "task history + notes export");
  const fail = await j(P + "/first-cut", { method: "POST", body: JSON.stringify({ goal: "another" }) });
  ok((await j(P + "/first-cut", { method: "DELETE" })).b.task.status === "canceled" && fail.b.task.status === "queued", "cancel a queued first cut");

  // share link scope
  const sh = await j(P + "/share", { method: "POST", body: JSON.stringify({ on: true }) });
  ok(sh.b.share?.startsWith("/public/") && (await fetch(B + sh.b.share + "/")).ok, "share link on");
  ok((await j(sh.b.share + "/api/project")).b.share === null && (await fetch(B + "/public/not-a-real-token-xxxxxx/")).status === 404, "share view hides the admin; unknown token 404");
  await j(P + "/share", { method: "POST", body: JSON.stringify({ on: false }) });
  ok((await fetch(B + sh.b.share + "/")).status === 404, "share off -> 404");

  // another project's token cannot see this one
  await j("/api/projects", { method: "POST", body: JSON.stringify({ title: "Other" }) });
  const tok2 = (await (await fetch(B + "/api/projects/other/agent-prompt")).text()).match(/ave_[\w-]+/)[0];
  ok((await A("get_project", {}, tok2)).b.slug === "other" && (await A("get_edit", {}, tok2)).b.sources.length === 0, "a token sees only its project");
  ok((await A("delete_source", { source_id: 1 }, tok2)).s === 400, "a token cannot delete another project's source");

  // script cuts belong to the version they were made on; an imported video is not a cloud render
  const W20 = Array.from({ length: 20 }, (_, i) => [i * 400, i * 400 + 300, `w${i}`, 0, i * 400, i * 400 + 300]);
  await db.query(`update projects set playlist = $1, hls_prefix = 'videos/test-podcast/v1/hls/', transcript = $2, version = 'v1', updated_at = now() where slug = 'test-podcast'`,
    [fmp4, JSON.stringify({ speakers: ["A"], words: W20 })]);
  const m1 = (await j("/p/test-podcast/api/project")).b;
  ok(m1.has_edit === true && m1.rendered === false && m1.version === "v1", "an imported fMP4 version: rendered is false (Download MP4 stays on)");
  const cut = await j("/p/test-podcast/api/cuts", { method: "POST", body: JSON.stringify({ w0: 2, w1: 4, author: "Sam" }) });
  const count = async () => [(await j("/p/test-podcast/api/cuts")).b.length, (await j("/api/projects")).b.find((p) => p.slug === "test-podcast").cuts, (await A("get_notes", { format: "json" })).b.cuts.length].join();
  ok(cut.b.text === "w2 w3 w4" && (await count()) === "1,1,1", "a cut on v1 shows on v1 (page, list, notes)");
  await db.query(`update projects set version = 'v2', hls_prefix = 'videos/test-podcast/renders/', updated_at = now() + interval '1 second' where slug = 'test-podcast'`);
  const m2 = (await j("/p/test-podcast/api/project")).b;
  ok(m2.version === "v2" && m2.rendered === true && (await count()) === "0,0,0", "v2 starts with no cuts, and a renders/ version is a cloud render");
  ok(!/w2 w3 w4/.test((await A("get_notes")).b) && (await db.query(`select version from cuts where asset = 'test-podcast'`)).rows[0]?.version === "v1", "the v1 cut is kept in the table, out of the v2 notes");
  await retireCuts("test-podcast", "v1");
  ok(/^v1 \(replaced /.test((await db.query(`select version from cuts where asset = 'test-podcast'`)).rows[0].version), "retireCuts sets aside the cuts of a version that is published again");

  // deleting a project: the storage keys come from the database (versions, rendered chunks), then the rows go
  await db.query(`insert into chunk_cache (key, project, playlist, duration_ms) values ('abc123', 'test-podcast', $1, 6000)`, [fmp4]);
  await db.query(`insert into versions (project, version) values ('test-podcast', 'v1')`);
  const pk = await projectKeys({ slug: "test-podcast", version: "v2", hls_prefix: "videos/test-podcast/renders/", playlist: fmp4.replace("init.mp4", "chunks/zzz/init.mp4").replace("seg_0000", "chunks/zzz/seg_0000") });
  ok(["renders/chunks/abc123/init.mp4", "renders/chunks/abc123/seg_0000.m4s", "renders/chunks/abc123/index.m3u8", "renders/chunks/zzz/seg_0000.m4s", "renders/index.m3u8", "v1/meta.json", "v2/transcript.json", "meta.json"]
    .every((k) => pk.includes("videos/test-podcast/" + k)) && pk.every((k) => k.startsWith("videos/test-podcast/")), `projectKeys: versions, rendered chunks and project files (${pk.length} keys)`);
  await db.query(`delete from versions where project = 'test-podcast' and version = 'v1'`);

  // background work: only the newest process that started its workers takes it
  const lead = (await db.query(`select value from settings where key = 'lead'`)).rows[0]?.value;
  ok(/^[0-9a-f]{12}$/.test(lead || ""), "the app takes the lead on boot");
  const job = async (id) => (await db.query(`select status from jobs where id = $1`, [id])).rows[0].status;
  const until = async (fn, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms; ) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };
  await db.query(`update settings set value = 'a-newer-process' where key = 'lead'`);
  const { rows: [q1] } = await db.query(`insert into jobs (kind, project, ref) values ('noop', 'test-podcast', 'x') returning id`);
  await new Promise((r) => setTimeout(r, 5500));
  ok((await job(q1.id)) === "queued", "a process that lost the lead takes no new work");
  await db.query(`update settings set value = $1 where key = 'lead'`, [lead]);
  ok(await until(async () => (await job(q1.id)) === "done", 9000), "the lead process takes the queued work");

  // AVE_WORKERS=off (smoke.mjs): a second copy of the app leaves the lead and work in progress alone
  const { rows: [w1] } = await db.query(`insert into jobs (kind, project, ref, status) values ('noop', 'test-podcast', 'y', 'working') returning id`);
  const { rows: [r1] } = await db.query(`insert into renders (project, version, edit, status, runner) values ('test-podcast', 'v9', '{}', 'rendering', $1) returning id`, [lead]);
  const port2 = await freePort();
  const srv2 = spawn("node", ["server.mjs"], { env: { ...process.env, DATABASE_URL, PORT: String(port2), AVE_WORKERS: "off" }, stdio: "ignore" });
  const up2 = await until(async () => (await fetch(`http://127.0.0.1:${port2}/health`).catch(() => null))?.ok, 15000);
  const { rows: [q2] } = await db.query(`insert into jobs (kind, project, ref) values ('noop', 'test-podcast', 'z') returning id`);
  ok(up2 && (await (await fetch(`http://127.0.0.1:${port2}/api/projects`)).json()).some((p) => p.slug === "test-podcast"), "a copy with AVE_WORKERS=off serves the API");
  ok((await job(w1.id)) === "working" && (await db.query(`select status, runner from renders where id = $1`, [r1.id])).rows[0].status === "rendering"
    && (await db.query(`select value from settings where key = 'lead'`)).rows[0].value === lead, "that copy does not requeue work in progress or take the lead");
  ok(await until(async () => (await job(q2.id)) === "done", 9000), "new work still goes to the live process");
  srv2.kill();
  await db.query(`delete from renders where id = $1`, [r1.id]);
  const delOther = await j("/api/projects/other", { method: "DELETE" });
  ok(delOther.b.ok === true && !(await j("/api/projects")).b.some((p) => p.slug === "other"), "delete a project (storage is not reachable here: the rows still go)");
  await db.end();
} catch (e) { ok(false, `${e.stack}\n--- server log ---\n${log.slice(-1500)}`); }
srv.kill();
await libDb.end().catch(() => {});
await pgServer.stop().catch(() => {});
await pglite.close().catch(() => {});
console.log(fails ? `${fails} of ${n} checks FAILED` : `all ${n} checks passed`);
process.exit(fails ? 1 : 0);
