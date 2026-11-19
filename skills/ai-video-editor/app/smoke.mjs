// graphed exec --project <slug> --account <act_…> -- node smoke.mjs
// Starts a second copy of the app on :3999 with AVE_WORKERS=off (pages and API only: it takes no background work
// and leaves renders, transcriptions and sandboxes of the live app alone), checks the private + share-link routes,
// the project scoping and the agent API, then cleans up. The live app does the one test transcription.
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { db, migrate, upsertProject, signGet } from "./lib.mjs";
import { TOOLS } from "./agent.mjs";
const srv = spawn("node", ["server.mjs"], { env: { ...process.env, PORT: "3999", AVE_WORKERS: "off" }, stdio: "inherit" });
await new Promise((r) => setTimeout(r, 4000));
const B = "http://127.0.0.1:3999";
const ok = (c, m) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
const J = { "Content-Type": "application/json" };
const post = (u, b, method = "POST") => fetch(B + u, { method, headers: J, body: JSON.stringify(b) }).then((r) => r.json());
// two throwaway projects with a made-up review video (3 segments, 40 words): no real project is touched
const SLUG = "smoke-test", OTHER = "smoke-test-other", P = `/p/${SLUG}`;
await migrate();
const fake = (slug) => ({ slug, title: "Smoke test (delete me)", version: "v1", hls_prefix: `videos/${slug}/v1/hls/`, duration: 18, size: 1000, share_on: false,
  playlist: '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6.0,\nseg_0000.m4s\n#EXTINF:6.0,\nseg_0001.m4s\n#EXTINF:6.0,\nseg_0002.m4s\n#EXT-X-ENDLIST\n',
  transcript: { speakers: ["A", "B"], total_ms: 16000, fields: ["t0", "t1", "word", "speaker", "rec0", "rec1"],
    words: Array.from({ length: 40 }, (_, i) => [i * 400, i * 400 + 350, `word${i}`, i % 2, i * 400, i * 400 + 350]) } });
await upsertProject(fake(SLUG)); await upsertProject(fake(OTHER));
try {
  const list = await (await fetch(B + "/api/projects")).json();
  const first = list.find((p) => p.slug === SLUG);
  ok(first && first.words === 40, `projects: ${list.map((p) => p.slug).join(", ")} (${first?.words} words)`);
  ok((await (await fetch(B + "/")).text()).includes("AI Video Editor"), "home page");
  const page = await (await fetch(B + P + "/")).text();
  ok(page.includes(`"base":"${P}"`) && page.includes('"shared":false'), "review page boots with /p base");
  const meta = await (await fetch(B + P + "/api/project")).json();
  ok(meta.segments === 4 && meta.has_edit === true, `project meta: ${meta.segments} segment files`);
  ok(meta.rendered === false, "an imported video is not a cloud render (Download MP4 works for it)");
  ok((await (await fetch(B + P + "/hls/index.m3u8")).text()).startsWith("#EXTM3U"), "playlist from Postgres");
  const r = await fetch(B + P + "/hls/init.mp4", { redirect: "manual" });
  ok(r.status === 302, `init.mp4 -> ${r.status}`);
  if (process.env.GRAPHED_STORAGE_ENDPOINT) {
    const seg = await fetch(r.headers.get("location"), { headers: { Range: "bytes=0-15" } });
    ok(seg.status === 404 || seg.ok, `signed init.mp4 link reaches storage (${seg.status}; the made-up video has no files)`);
  }

  // share link: off -> 404, on -> works for this project only, rotate kills the old one
  const on = await post(`/api/projects/${SLUG}/share`, { on: true });
  ok(on.share?.startsWith("/public/"), `share on: ${on.share.slice(0, 16)}…`);
  const S = on.share;
  const sp = await (await fetch(B + S + "/")).text();
  ok(sp.includes('"shared":true') && !sp.includes(`"slug":"${SLUG}"`), "shared page boots with shared base");
  ok((await (await fetch(B + S + "/api/project")).json()).share === null, "shared view does not leak the share admin");
  const c = await post(S + "/api/comments", { t_ms: 12345, author: "smoke", body: "test note",
    drawing: [{ tool: "arrow", color: "#ff3b30", pts: [[0.1, 0.1], [0.4, 0.4]] }] });
  ok(c.id > 0 && c.asset === SLUG, `comment via share link #${c.id}`);
  const rep = await post(S + "/api/comments", { t_ms: 12345, author: "smoke", body: "reply", parent_id: c.id });
  ok((await post(S + `/api/comments/${c.id}`, { resolved: true }, "PATCH")).resolved === true, "resolve");
  const md = await (await fetch(B + S + "/api/export.md")).text();
  ok(md.includes("0:12:10") && md.includes("smoke: reply"), "export.md via share link");
  const cut = await post(S + "/api/cuts", { w0: 12, w1: 10, author: "smoke" });
  ok(cut.w0 === 10 && cut.w1 === 12 && cut.text.split(" ").length === 3, `cut #${cut.id}: "${cut.text}"`);
  ok((await (await fetch(B + P + "/api/cuts")).json()).some((x) => x.id === cut.id), "owner sees the shared cut");

  // another project must not be reachable through this one's link
  const other = list.find((p) => p.slug === OTHER);
  if (other) {
    const oc = await post(`/p/${other.slug}/api/comments`, { t_ms: 1, author: "smoke", body: "other" });
    await fetch(B + S + `/api/comments/${oc.id}`, { method: "DELETE" });
    ok((await (await fetch(B + `/p/${other.slug}/api/comments`)).json()).some((x) => x.id === oc.id), "share link cannot delete another project's comment");
    await fetch(B + `/p/${other.slug}/api/comments/${oc.id}`, { method: "DELETE" });
  }

  const rot = await post(`/api/projects/${SLUG}/share`, { rotate: true });
  ok((await fetch(B + S + "/api/project")).status === 404 && (await fetch(B + rot.share + "/api/project")).ok, "rotate: old link 404, new link works");
  await post(`/api/projects/${SLUG}/share`, { on: false });
  ok((await fetch(B + rot.share + "/")).status === 404, "share off -> 404");
  ok((await fetch(B + "/public/not-a-real-token-xxxxxx/")).status === 404, "unknown token -> 404");

  await fetch(B + rot.share + `/api/cuts/${cut.id}`, { method: "DELETE" });       // link is off: must not delete
  ok((await (await fetch(B + P + "/api/cuts")).json()).some((x) => x.id === cut.id), "link off: cannot write");
  await fetch(B + P + `/api/cuts/${cut.id}`, { method: "DELETE" });
  await fetch(B + P + `/api/comments/${c.id}`, { method: "DELETE" });
  const left = await (await fetch(B + P + "/api/comments")).json();
  ok(!left.some((x) => x.id === c.id || x.id === rep.id), "cleanup: delete cascades to replies");

  // new project with source files only: 2-part browser-style multipart upload through presigned URLs
  const np = await post("/api/projects", { title: "Smoke Sources Test" });
  ok(np.slug === "smoke-sources-test", `new project ${np.slug}`);
  const npMeta = await (await fetch(B + `/p/${np.slug}/api/project`)).json();
  ok(npMeta.has_edit === false && (await fetch(B + `/p/${np.slug}/hls/index.m3u8`)).status === 404, "empty project: no edit, no playlist");
  const size = 20 * 1024 * 1024 + 123, buf = Buffer.alloc(size, 7);
  const src = await post(`/api/projects/${np.slug}/sources`, { file_name: "Alex cam.bin", size, content_type: "application/octet-stream", label: "Alex camera" });
  ok(src.id > 0 && src.parts === 2, `source #${src.id}: ${src.parts} parts of ${src.part_size}`);
  const { urls } = await post(`/api/sources/${src.id}/parts`, { parts: [1, 2] });
  for (const n of [1, 2]) {
    const r = await fetch(urls[n], { method: "PUT", body: buf.subarray((n - 1) * src.part_size, Math.min(size, n * src.part_size)) });
    ok(r.ok, `PUT part ${n} -> ${r.status}`);
  }
  const done = await post(`/api/sources/${src.id}/complete`, {});
  ok(done.ok && done.bytes === size, `complete: ${done.bytes} bytes`);
  const fr = await fetch(B + `/api/sources/${src.id}/file`, { redirect: "manual" });
  const got = await fetch(fr.headers.get("location"), { headers: { Range: "bytes=0-9" } });
  ok(fr.status === 302 && got.ok && (await got.arrayBuffer()).byteLength === 10, `source file via presigned GET ${got.status}`);
  const srcs = await (await fetch(B + `/api/projects/${np.slug}/sources`)).json();
  ok(srcs.length === 1 && srcs[0].status === "ready" && srcs[0].label === "Alex camera", "source listed ready");
  const prompt = await (await fetch(B + `/api/projects/${np.slug}/agent-prompt`)).text();
  ok(prompt.includes(`#${src.id} Alex camera: Alex cam.bin`) && prompt.includes("add-video.mjs"), "agent prompt lists the source key");
  ok((await (await fetch(B + "/api/agent-prompt")).text()).includes("add-video.mjs"), "new-video agent prompt");
  ok((await (await fetch(B + "/api/projects")).json()).find((p) => p.slug === np.slug)?.sources === 1, "project list counts sources");

  // ---- agent API: token, REST, MCP, @agent queue ----
  const token = prompt.match(/ave_[\w-]+/)?.[0];
  ok(token && prompt.includes("/agent/mcp"), `agent token in prompt (${token?.slice(0, 8)}…)`);
  const A = (tool, args = {}, tok = token) => fetch(B + `/agent/${tool}`, { method: "POST", headers: { ...J, Authorization: `Bearer ${tok}` }, body: JSON.stringify(args) });
  ok((await A("get_project", {}, "ave_wrongwrongwrongwrongwrong")).status === 401 && (await fetch(B + "/agent/get_project")).status === 401, "no or wrong token -> 401");
  const gp = await (await A("get_project")).json();
  ok(gp.slug === np.slug && gp.sources.length === 1 && gp.sources[0].tx_status === "skipped", `REST get_project: ${gp.slug}, source tx ${gp.sources[0]?.tx_status}`);
  const xh = await (await fetch(B + "/agent/get_project", { method: "POST", headers: { ...J, "X-Agent-Token": token }, body: "{}" })).json();
  ok(xh.slug === np.slug, "X-Agent-Token header works too");
  const rpc = (method, params, id = 1) => fetch(B + "/agent/mcp", { method: "POST", headers: { ...J, Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }).then((r) => r.json());
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
  ok(init.result?.serverInfo?.name === "ai-video-editor", "MCP initialize");
  const tl = await rpc("tools/list", {});
  const names = (tl.result?.tools || []).map((t) => t.name).sort().join(), want = TOOLS.map((t) => t.name).sort().join();
  ok(names === want && ["get_guide", "list_tasks", "add_source", "save_edit", "render", "render_status", "publish_version"].every((t) => names.split(",").includes(t)),
    `MCP tools/list: ${tl.result?.tools?.length} tools${names === want ? "" : ` (got ${names}; want ${want})`}`);
  const g = await rpc("tools/call", { name: "get_guide", arguments: {} });
  ok(g.result?.content?.[0]?.text?.startsWith("# AI Video Editor: guide for coding agents"), "MCP get_guide returns AGENTS.md");
  ok((await (await fetch(B + "/agent/guide", { headers: { Authorization: `Bearer ${token}` } })).text()).includes("## 6. Work the @agent queue"), "REST /agent/guide");
  ok((await (await fetch(B + "/AGENTS.md")).text()).includes("## 4. Access model"), "private /AGENTS.md");
  const call = await rpc("tools/call", { name: "get_project", arguments: {} });
  ok(JSON.parse(call.result.content[0].text).slug === np.slug, "MCP tools/call get_project");
  ok((await A("publish_version", { version: "v9" })).status === 400, "publish_version without upload -> 400");
  const ask = await post(`/p/${np.slug}/api/comments`, { t_ms: 4000, t_end_ms: 9000, author: "Sam", body: "@agent tighten this part" });
  ok(ask.task_id > 0 && ask.task_status === "queued", `@agent comment -> task #${ask.task_id}`);
  const plain = await post(`/p/${np.slug}/api/comments`, { t_ms: 1, author: "Sam", body: "email@agent.com is not a mention" });
  ok(!plain.task_id, "no task without a real @agent mention");
  const q = await (await A("list_tasks")).json();
  ok(q.length === 1 && q[0].request.includes("tighten") && q[0].at === "0:04–0:09", `list_tasks: ${q.length} queued at ${q[0]?.at}`);
  ok((await A("claim_task", { task_id: ask.task_id })).ok && (await A("claim_task", { task_id: ask.task_id })).status === 400, "claim once, second claim refused");
  await A("update_task", { task_id: ask.task_id, note: "Rendering v2" });
  let cs = await (await fetch(B + `/p/${np.slug}/api/comments`)).json();
  ok(cs.find((c) => c.id === ask.id)?.task_note === "Rendering v2", "progress note shows on the comment");
  ok((await A("complete_task", { task_id: ask.task_id, reply: "Cut 2.1 s of dead air at 0:05.", version: "v2" })).ok, "complete_task");
  cs = await (await fetch(B + `/p/${np.slug}/api/comments`)).json();
  const asked = cs.find((c) => c.id === ask.id), rep2 = cs.find((c) => c.parent_id === ask.id);
  ok(asked.resolved && asked.task_status === "done" && asked.task_version === "v2" && rep2?.author === "Agent" && rep2.body.includes("v2"), "comment resolved, Agent reply posted");
  ok((await (await A("list_tasks")).json()).length === 0, "queue empty");
  const notes = await (await A("get_notes")).text();
  ok(notes.includes("tighten this part") && notes.includes("Agent: Cut 2.1 s"), "get_notes md");
  const otherTok = (await (await fetch(B + `/api/projects/${SLUG}/agent-prompt`)).text()).match(/ave_[\w-]+/)?.[0];
  ok((await (await A("list_tasks", { status: "all" }, otherTok)).json()).length === 0, "another project's token sees none of these tasks");
  await fetch(B + `/api/projects/${np.slug}/agent-token`, { method: "POST" });
  ok((await A("get_project")).status === 401, "New token: old token stops working");

  // ---- transcribe a source on upload (real Graphed transcription, a 4 s clip: under 1 credit) ----
  let audioUrl;
  if (process.env.GRAPHED_STORAGE_ENDPOINT && !process.env.SKIP_TX) {
    const mp3 = `${tmpdir()}/smoke-voice.mp3`;
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=4", "-ac", "1", mp3]);
    const data = readFileSync(mp3);
    const vs = await post(`/api/projects/${np.slug}/sources`, { file_name: "Sam mic.mp3", size: data.length, content_type: "audio/mpeg", label: "Sam" });
    const { urls: u1 } = await post(`/api/sources/${vs.id}/parts`, { parts: [1] });
    await fetch(u1[1], { method: "PUT", body: data });
    await post(`/api/sources/${vs.id}/complete`, {});
    let st;
    for (let i = 0; i < 60; i++) {
      st = (await (await fetch(B + `/api/projects/${np.slug}/sources`)).json()).find((x) => x.id === vs.id);
      if (["done", "failed", "skipped"].includes(st.tx_status)) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    ok(st.tx_status === "done", `source transcribed on upload: ${st.tx_status} ${st.tx_error || ""} (${st.tx_words} words; a tone has none)`);
    const tr = await (await fetch(B + `/api/sources/${vs.id}/transcript`)).json();
    ok(tr.speakers?.[0] === "Sam", `source transcript speaker = label (${tr.speakers})`);
    audioUrl = await signGet(`videos/${np.slug}/sources/${vs.id}-audio.mp3`);
    ok((await fetch(audioUrl, { headers: { Range: "bytes=0-9" } })).ok, "the audio made for the transcript is in storage");
  }

  const delNp = await (await fetch(B + `/api/projects/${np.slug}`, { method: "DELETE" })).json();
  ok(delNp.ok === true, `delete project: ${delNp.removed} storage keys cleared`);
  if (audioUrl) { const a = await fetch(audioUrl, { headers: { Range: "bytes=0-9" } }); ok(a.status === 404 || a.status === 403, `delete project removes the audio made from a source (${a.status})`); }
  const gone = await fetch(fr.headers.get("location"), { headers: { Range: "bytes=0-9" } });
  ok(gone.status === 404 || gone.status === 403, `delete project removes the source file (${gone.status})`);

  const del = await (await fetch(B + `/api/projects/${SLUG}`, { method: "DELETE" })).json();
  ok(del.ok, "delete test project");
  ok(!(await (await fetch(B + "/api/projects")).json()).some((p) => p.slug === SLUG), "test project gone");
} catch (e) { ok(false, e.stack); }
await db.query(`delete from comments where asset = any($1)`, [[SLUG, OTHER]]).catch(() => {});
await db.query(`delete from projects where slug = any($1)`, [[SLUG, OTHER, "smoke-sources-test"]]).catch(() => {});
await db.end();
srv.kill();
process.exit();
