// Agent side of the app.
//   1. /agent/*  per-project bearer token (graphed.yaml makes /agent/ public; this file checks the token)
//      REST:  POST /agent/<tool> {json args}     GET /agent/tools
//      MCP:   POST /agent/mcp  (JSON-RPC, streamable HTTP, plain JSON replies, no sessions)
//      Both run the same TOOLS table below.
//   2. "@agent ..." comments -> agent_tasks rows that an agent claims, works and answers.
//   3. Background worker: transcribe every uploaded source (one mic = one speaker = the source label).
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, rmSync, statSync } from "node:fs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Graphed } from "@graphed-inc/sdk";
import { db, s3, Bucket, signGet, getText, newToken, exportList, upsertProject, SITE, setSite, PART_SIZE, createMultipart, signPart, completeMultipart,
  listParts, removeSource, retireCuts, sourceAudioKey, withVerified, RUNNER, IS_LEAD } from "./lib.mjs";
import { toWords, mergeSources } from "./words.mjs";
import { projectSources, normalizeEdit, planChunks, queueRender, syncSources, CHUNK_S } from "./render.mjs";

export const AGENT = "Agent";
export const mentionsAgent = (body) => /(^|[^\w@])@agent\b/i.test(body || "");
export const newAgentToken = () => "ave_" + newToken() + newToken().slice(0, 8);

// ---------- @agent tasks ----------
export async function taskForComment(c) {
  if (!mentionsAgent(c.body) || c.author === AGENT) return null;
  const { rows } = await db.query(`insert into agent_tasks (project, comment_id) values ($1, $2)
    on conflict (comment_id) do nothing returning *`, [c.asset, c.id]);
  return rows[0] || null;
}

// ---------- first cut: the owner's brief -> a task with no comment ----------
const FORMATS = ["vertical", "square", "landscape"];
export function briefText(b) {
  if (!b) return "";
  return [`First cut request${b.by ? ` from ${b.by}` : ""}.`, `Goal: ${b.goal}`,
    b.format && `Format: ${{ vertical: "vertical 9:16 (1080x1920)", square: "square 1:1 (1080x1080)", landscape: "landscape 16:9 (1920x1080)" }[b.format] || b.format}`,
    b.length && `Target length: ${b.length}`, b.notes && `Keep / avoid / style: ${b.notes}`].filter(Boolean).join("\n");
}
export async function requestFirstCut(slug, b = {}) {
  const goal = String(b.goal || "").trim().slice(0, 3000);
  if (!goal) throw new Error("goal required: say what the video is for");
  const brief = { goal, format: FORMATS.includes(b.format) ? b.format : null, length: String(b.length || "").trim().slice(0, 80) || null,
    notes: String(b.notes || "").trim().slice(0, 3000) || null, by: String(b.by || "").trim().slice(0, 80) || null };
  const { rows: [open] } = await db.query(`select id from agent_tasks where project = $1 and kind = 'first_cut' and status in ('queued','working')`, [slug]);
  if (open) throw new Error("a first cut is already queued or in progress");
  const { rows: [t] } = await db.query(`insert into agent_tasks (project, kind, brief) values ($1, 'first_cut', $2) returning *`, [slug, JSON.stringify(brief)]);
  return t;
}
export async function firstCutState(slug) {
  const { rows: [t] } = await db.query(`select id, status, note, brief, result_version, created_at, claimed_at, done_at
    from agent_tasks where project = $1 and kind = 'first_cut' order by id desc limit 1`, [slug]);
  return t || null;
}

// ---------- token ----------
export async function agentToken(slug, { rotate } = {}) {
  const { rows: [p] } = await db.query(`select agent_token from projects where slug = $1`, [slug]);
  if (!p) throw new Error("no such project");
  if (p.agent_token && !rotate) return p.agent_token;
  const t = newAgentToken();
  await db.query(`update projects set agent_token = $2 where slug = $1`, [slug, t]);
  return t;
}
async function projectForToken(req) {
  const raw = req.headers["x-agent-token"] ? `Bearer ${req.headers["x-agent-token"]}` : req.headers.authorization || "";
  const m = raw.match(/^Bearer\s+(ave_[\w-]{20,80})$/);
  if (!m) return null;
  return (await db.query(`select slug, title, version, transcript, playlist is not null as has_edit, share_on, share_token
    from projects where agent_token = $1`, [m[1]])).rows[0] || null;
}

// ---------- helpers for tools ----------
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function transcriptText(tr, from = 0, to = Infinity) {   // compact, readable: one line per speaker turn
  const W = (tr?.words || []).filter((w) => w[1] >= from && w[0] <= to);
  const out = []; let cur = null;
  for (const w of W) {
    if (!cur || cur.spk !== w[3] || w[0] - cur.end > 2500) { cur = { spk: w[3], t: w[0], end: w[1], words: [] }; out.push(cur); }
    cur.words.push(w[2]); cur.end = w[1];
  }
  return out.map((p) => `[${mmss(p.t)}] ${tr.speakers?.[p.spk] ?? `Speaker ${p.spk + 1}`}: ${p.words.join(" ")}`).join("\n");
}
async function taskRows(slug, where = "", args = []) {
  const { rows } = await db.query(`select t.*, c.body, c.author, c.t_ms, c.t_end_ms, c.parent_id, c.resolved
    from agent_tasks t left join comments c on c.id = t.comment_id where t.project = $1 ${where} order by t.id`, [slug, ...args]);
  return rows;
}
async function taskFor(p, id) {
  const [t] = await taskRows(p.slug, "and t.id = $2", [Number(id)]);
  if (!t) throw new Error(`no task ${id} in this project`);
  return t;
}
async function addComment(p, { t_ms, t_end_ms, body, parent_id, author }) {
  if (!String(body || "").trim()) throw new Error("body required");
  if (parent_id) {
    const par = await db.query(`select t_ms from comments where id = $1 and asset = $2`, [parent_id, p.slug]);
    if (!par.rowCount) throw new Error("no such parent comment");
    if (!Number.isFinite(t_ms)) t_ms = par.rows[0].t_ms;
  }
  const { rows } = await db.query(`insert into comments (asset, t_ms, t_end_ms, author, body, parent_id) values ($1,$2,$3,$4,$5,$6) returning *`,
    [p.slug, Math.round(t_ms || 0), Number.isFinite(t_end_ms) ? Math.round(t_end_ms) : null, (author || AGENT).slice(0, 80), String(body).trim().slice(0, 5000), parent_id || null]);
  return rows[0];
}

// Make a new review version live from storage: videos/<slug>/<version>/{meta.json, hls/index.m3u8, transcript.json}
// (scripts/add-video.mjs uploads those). Keeps title, chapters, share link and comments.
export async function publishVersion(slug, { version, title, changes, by }) {
  if (!/^[\w.-]{1,20}$/.test(version || "")) throw new Error("version like v2 required");
  const prefix = `videos/${slug}/${version}/`;
  let meta = {};
  try { meta = JSON.parse(await getText(prefix + "meta.json")); } catch { /* optional */ }
  let playlist;
  try { playlist = await getText(prefix + "hls/index.m3u8"); }
  catch { throw new Error(`no ${prefix}hls/index.m3u8 in storage: run scripts/add-video.mjs first`); }
  let transcript = null;
  try { transcript = JSON.parse(await getText(prefix + "transcript.json")); } catch { /* no transcript */ }
  const { rows: [cur] } = await db.query(`select title from projects where slug = $1`, [slug]);
  await retireCuts(slug, version);   // the same version name again: its cuts point into the old transcript
  await upsertProject({ ...meta, slug, version, title: title || cur?.title || meta.title || slug, hls_prefix: prefix + "hls/", playlist, transcript });
  await db.query(`insert into versions (project, version, changes, by) values ($1,$2,$3,$4)`, [slug, version, changes || null, by || null]);
  return { version, review_url: `${SITE}/p/${slug}/`, words: transcript?.words?.length || 0 };
}

// ---------- the tool table: REST and MCP both call these ----------
const S = (props, required = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const int = (d) => ({ type: "integer", description: d }), str = (d) => ({ type: "string", description: d });
// AGENTS.md says __SITE__ where the app's own URL goes
export const guide = () => readFileSync(new URL("./AGENTS.md", import.meta.url), "utf8").replaceAll("__SITE__", SITE || "<app url>");
export const TOOLS = [
  { name: "get_guide", description: "Read this first: how the app works, the rules, every tool, how to work the @agent queue and publish a version (AGENTS.md).",
    input: S({}), run: async () => guide() },
  { name: "get_project", description: "Project overview: title, current version, version history, review link, source files with transcript status, open comments and @agent tasks.",
    input: S({}), run: async (p) => {
      const sources = (await db.query(`select id, label, file_name, size, status, tx_status, tx_words, tx_error from sources where project = $1 order by id`, [p.slug])).rows;
      const versions = (await db.query(`select version, changes, by, created_at from versions where project = $1 order by id`, [p.slug])).rows;
      const [{ open }] = (await db.query(`select count(*)::int as open from comments where asset = $1 and parent_id is null and not resolved`, [p.slug])).rows;
      const tasks = (await db.query(`select status, count(*)::int as n from agent_tasks where project = $1 group by status`, [p.slug])).rows;
      return { slug: p.slug, title: p.title, version: p.has_edit ? p.version : null, review_url: `${SITE}/p/${p.slug}/`,
        share_url: p.share_on ? `${SITE}/public/${p.share_token}/` : null, versions, sources, open_comments: open,
        tasks: Object.fromEntries(tasks.map((t) => [t.status, t.n])) };
    } },
  { name: "get_notes", description: "Edit notes on the current review version: every comment (timecode, range, author, replies, resolved) and every script cut. format md (default) or json.",
    input: S({ format: { type: "string", enum: ["md", "json"] } }), run: async (p, a) => {
      if (a.format === "json") {
        const comments = (await db.query(`select c.id, c.parent_id, c.t_ms, c.t_end_ms, c.author, c.body, c.resolved, c.drawing is not null as has_drawing, c.created_at,
          t.id as task_id, t.status as task_status from comments c left join agent_tasks t on t.comment_id = c.id where c.asset = $1 order by c.t_ms, c.id`, [p.slug])).rows;
        const cuts = (await db.query(`select id, w0, w1, author from cuts where asset = $1 and version = $2 order by w0`, [p.slug, p.version])).rows
          .map((c) => ({ ...c, t0_ms: p.transcript?.words?.[c.w0]?.[0], t1_ms: p.transcript?.words?.[c.w1]?.[1],
            text: (p.transcript?.words || []).slice(c.w0, c.w1 + 1).map((w) => w[2]).join(" ") }));
        return { version: p.version, comments, cuts };
      }
      return exportList({ ...p, W: p.transcript?.words || [] }, "md");
    } },
  { name: "get_transcript", description: "Transcript as readable speaker turns. Default: the current review video. source_id: one source file (speaker = its label). sources: true merges all transcribed sources in time order (clean podcast speaker labels). from_ms / to_ms limit the range; format json gives word timings [t0_ms, t1_ms, word, speaker, master0_ms, master1_ms]: for the review video of a cloud edit, the last two are the word's time on the master clock, which is what clips use.",
    input: S({ source_id: int("one source file"), sources: { type: "boolean", description: "merge every transcribed source" }, from_ms: int("start"), to_ms: int("end"), format: { type: "string", enum: ["text", "json"] } }),
    run: async (p, a) => {
      let tr = p.transcript;
      if (a.source_id) tr = (await db.query(`select transcript from sources where id = $1 and project = $2`, [a.source_id, p.slug])).rows[0]?.transcript;
      else if (a.sources) tr = mergeSources((await db.query(`select label, transcript from sources where project = $1 and tx_status = 'done' order by id`, [p.slug])).rows);
      if (!tr) return "No transcript yet.";
      if (a.format === "json") {
        const from = a.from_ms ?? 0, to = a.to_ms ?? Infinity;
        return { speakers: tr.speakers, fields: ["t0_ms", "t1_ms", "word", "speaker", "master0_ms", "master1_ms"],
          words: tr.words.filter((w) => w[1] >= from && w[0] <= to).map((w) => w.slice(0, 6)) };
      }
      return transcriptText(tr, a.from_ms ?? 0, a.to_ms ?? Infinity) || "No words in that range.";
    } },
  { name: "get_source_url", description: "Signed download URL (valid 1 hour) for a source file: camera angle, screen recording, audio. Download with curl -L -o.",
    input: S({ source_id: int("source id from get_project") }, ["source_id"]), run: async (p, a) => {
      const s = (await db.query(`select * from sources where id = $1 and project = $2`, [a.source_id, p.slug])).rows[0];
      if (!s) throw new Error("no such source");
      if (s.status !== "ready") throw new Error("upload not finished");
      return { id: s.id, label: s.label, file_name: s.file_name, size: Number(s.size), url: await signGet(s.key), audio_url: s.tx_status === "done" ? await signGet(`videos/${p.slug}/sources/${s.id}-audio.mp3`).catch(() => null) : null };
    } },
  { name: "list_tasks", description: "The @agent queue. kind comment: a reviewer asked for a change (the comment, its time range, the transcript words in that range). kind first_cut: the owner's brief for the first edit from the sources (guide section 7). status queued (default), working, done, failed or all.",
    input: S({ status: { type: "string", enum: ["queued", "working", "done", "failed", "all"] } }), run: async (p, a) => {
      const st = a.status || "queued";
      const rows = st === "all" ? await taskRows(p.slug) : await taskRows(p.slug, "and t.status = $2", [st]);
      return rows.map((t) => t.kind === "first_cut"
        ? { task_id: t.id, kind: "first_cut", status: t.status, note: t.note, author: t.brief?.by || null, request: briefText(t.brief), brief: t.brief,
            how: "Propose the first edit from the source files: guide section 7 (get_guide). No video exists yet, so there is no time range.",
            result_version: t.result_version, created_at: t.created_at }
        : { task_id: t.id, kind: "comment", status: t.status, note: t.note, comment_id: t.comment_id, author: t.author, request: t.body,
            t_ms: t.t_ms, t_end_ms: t.t_end_ms, at: mmss(t.t_ms) + (t.t_end_ms != null ? "–" + mmss(t.t_end_ms) : ""),
            words_in_range: transcriptText(p.transcript, t.t_ms - 1500, (t.t_end_ms ?? t.t_ms) + 1500) || null,
            result_version: t.result_version, created_at: t.created_at });
    } },
  { name: "claim_task", description: "Take a queued task so no other agent works it. Fails if it is not queued.",
    input: S({ task_id: int("task id") }, ["task_id"]), run: async (p, a) => {
      const { rows } = await db.query(`update agent_tasks set status = 'working', claimed_at = now(), note = 'Working on it'
        where id = $1 and project = $2 and status = 'queued' returning id, status`, [a.task_id, p.slug]);
      if (!rows[0]) throw new Error("task is not queued (already claimed, done or not in this project)");
      return rows[0];
    } },
  { name: "update_task", description: "Show a short progress line on the comment, e.g. 'Rendering v3'.",
    input: S({ task_id: int("task id"), note: str("progress line") }, ["task_id", "note"]), run: async (p, a) => {
      await taskFor(p, a.task_id);
      await db.query(`update agent_tasks set note = $2 where id = $1`, [a.task_id, String(a.note).slice(0, 300)]);
      return { ok: true };
    } },
  { name: "complete_task", description: "Finish a task: posts your reply under the comment (say what changed), links the version you published and resolves the comment (resolve: false to leave it open).",
    input: S({ task_id: int("task id"), reply: str("what you changed and where"), version: str("version you published for it, e.g. v3"), resolve: { type: "boolean" } }, ["task_id", "reply"]),
    run: async (p, a) => {
      const t = await taskFor(p, a.task_id);
      if (!t.comment_id) {   // first cut: the reply becomes the first comment on the new video, at 0:00
        const r = await addComment(p, { t_ms: 0, body: `First cut${a.version ? ` (${a.version})` : ""}: ${a.reply}` });
        await db.query(`update agent_tasks set status = 'done', done_at = now(), note = null, result_version = $2, comment_id = $3 where id = $1`, [t.id, a.version || null, r.id]);
        if (a.resolve !== false) await db.query(`update comments set resolved = true where id = $1`, [r.id]);
        return { ok: true, comment_id: r.id };
      }
      const r = await addComment(p, { parent_id: t.comment_id, body: a.version ? `${a.reply}\n\nNew version: ${a.version}` : a.reply });
      await db.query(`update agent_tasks set status = 'done', done_at = now(), note = null, result_version = $2 where id = $1`, [t.id, a.version || null]);
      if (a.resolve !== false) await db.query(`update comments set resolved = true where id = $1`, [t.comment_id]);
      return { ok: true, reply_id: r.id };
    } },
  { name: "fail_task", description: "Give up on a task and tell the reviewer why (posted as a reply).",
    input: S({ task_id: int("task id"), reason: str("why") }, ["task_id", "reason"]), run: async (p, a) => {
      const t = await taskFor(p, a.task_id);
      if (t.comment_id) await addComment(p, { parent_id: t.comment_id, body: `Could not do this: ${a.reason}` });   // first cut: the reason shows on the page
      await db.query(`update agent_tasks set status = 'failed', done_at = now(), note = $2 where id = $1`, [t.id, String(a.reason).slice(0, 300)]);
      return { ok: true };
    } },
  { name: "post_comment", description: "Leave a comment at a timecode (optionally a range), or reply with parent_id.",
    input: S({ body: str("text"), t_ms: int("time in ms"), t_end_ms: int("range end in ms"), parent_id: int("reply to this comment") }, ["body"]),
    run: async (p, a) => addComment(p, a) },
  { name: "resolve_comment", description: "Mark a comment resolved (or open again with resolved: false).",
    input: S({ comment_id: int("comment id"), resolved: { type: "boolean" } }, ["comment_id"]), run: async (p, a) => {
      const { rows } = await db.query(`update comments set resolved = $3 where id = $1 and asset = $2 returning id, resolved`, [a.comment_id, p.slug, a.resolved !== false]);
      if (!rows[0]) throw new Error("no such comment");
      return rows[0];
    } },
  { name: "add_source", description: "Start uploading a raw source file (camera, mic, screen) from your machine: returns the source id, the part size and signed PUT URLs for the first parts. PUT each part's bytes, then complete_source. scripts/upload-sources.mjs does all of it.",
    input: S({ file_name: str("file name"), size: int("bytes"), label: str("who/what it is, e.g. 'Sam mic' or 'Wide camera'"), content_type: str("MIME type") }, ["file_name", "size"]),
    run: async (p, a) => {
      const size = Number(a.size), name = String(a.file_name || "").slice(0, 200);
      if (!name || !(size > 0)) throw new Error("file_name and size required");
      const label = (a.label?.trim() || name.replace(/\.[^.]+$/, "")).slice(0, 120);
      const { rows: [row] } = await db.query(`insert into sources (project, label, file_name, content_type, size, key) values ($1,$2,$3,$4,$5,'') returning id`,
        [p.slug, label, name, a.content_type || null, size]);
      const key = `videos/${p.slug}/sources/${row.id}-${name.replace(/[^\w.-]+/g, "_").slice(-120)}`;
      const uploadId = await createMultipart(key, a.content_type);
      await db.query(`update sources set key = $2, upload_id = $3 where id = $1`, [row.id, key, uploadId]);
      const parts = Math.ceil(size / PART_SIZE), urls = {};
      for (let n = 1; n <= Math.min(parts, 20); n++) urls[n] = await signPart(key, uploadId, n);
      return { source_id: row.id, label, part_size: PART_SIZE, parts, urls };
    } },
  { name: "source_parts", description: "More signed PUT URLs for an upload started with add_source (up to 50 part numbers per call), and the part numbers already uploaded (to resume).",
    input: S({ source_id: int("source id"), parts: { type: "array", items: { type: "integer" } } }, ["source_id", "parts"]),
    run: async (p, a) => {
      const { rows: [s] } = await db.query(`select * from sources where id = $1 and project = $2`, [a.source_id, p.slug]);
      if (!s || s.status !== "uploading") throw new Error("no upload in progress for that source");
      const urls = {};
      for (const n of (a.parts || []).map(Number).filter((n) => n >= 1 && n <= 10000).slice(0, 50)) urls[n] = await signPart(s.key, s.upload_id, n);
      const done = (await listParts(s.key, s.upload_id)).map((x) => ({ n: x.PartNumber, size: x.Size }));
      return { urls, uploaded: done, size: Number(s.size), part_size: PART_SIZE, file_name: s.file_name, label: s.label };
    } },
  { name: "complete_source", description: "Finish an upload: joins the parts, marks the source ready and queues its transcription (about 0.144 credits per second of audio).",
    input: S({ source_id: int("source id") }, ["source_id"]),
    run: async (p, a) => {
      const { rows: [s] } = await db.query(`select * from sources where id = $1 and project = $2`, [a.source_id, p.slug]);
      if (!s) throw new Error("no such source");
      if (s.status === "ready") return { ok: true };
      const bytes = await completeMultipart(s.key, s.upload_id);
      await db.query(`update sources set status = 'ready', upload_id = null where id = $1`, [s.id]);
      await queueSourceTranscript({ ...s, status: "ready" });
      return { ok: true, bytes };
    } },
  { name: "delete_source", description: "Delete a source file (and an unfinished upload of it) from the project.",
    input: S({ source_id: int("source id") }, ["source_id"]),
    run: async (p, a) => {
      const { rows: [s] } = await db.query(`select * from sources where id = $1 and project = $2`, [a.source_id, p.slug]);
      if (!s) throw new Error("no such source");
      await removeSource(s);       // the file (or its unfinished upload) and the audio made from it
      return { ok: true };
    } },
  { name: "get_edit", description: "The cloud edit: the current draft edit document (or the one behind the current version), every source with its probe (duration, video size, fps, audio) and audio sync offset, and the edit format. Read guide section 8 for the edit document.",
    input: S({}), run: async (p) => {
      const sources = (await projectSources(p.slug)).map((s) => ({ id: s.id, label: s.label, file_name: s.file_name, transcript: s.tx_status,
        duration_ms: s.meta?.duration_ms ?? null, video: s.meta?.video ?? null, has_audio: !!s.meta?.has_audio, probe_error: s.meta?.error,
        sync_offset_ms: s.sync_offset_ms, sync_score: s.sync_score, sync_ref: s.sync_ref }));
      const { rows: [d] } = await db.query(`select edit_draft from projects where slug = $1`, [p.slug]);
      const { rows: [v] } = await db.query(`select version, edit from versions where project = $1 and edit is not null order by id desc limit 1`, [p.slug]);
      return { draft: d?.edit_draft || null, current_version_edit: v ? { version: v.version, edit: v.edit } : null, sources,
        rules: `Master timeline = the sync reference source's clock. source_time = master_time + sources[id].offset_ms. Clips play in order; each is ${CHUNK_S} s or less per render chunk automatically.` };
    } },
  { name: "save_edit", description: "Check and save the draft edit document (does not render). Returns the normalized edit, its length and the chunk count. Errors name the bad field.",
    input: S({ edit: { type: "object", description: "{format?, sources?, audio?, transcript_sources?, clips:[{in_ms, out_ms, video, crop?}]}" } }, ["edit"]),
    run: async (p, a) => {
      const sources = await projectSources(p.slug);
      const e = normalizeEdit(a.edit, sources);
      await db.query(`update projects set edit_draft = $2 where slug = $1`, [p.slug, JSON.stringify(e)]);
      return { ok: true, duration_ms: e.duration_ms, clips: e.clips.length, chunks: planChunks(e, sources).length, edit: e };
    } },
  { name: "sync_sources", description: "Line up every transcribed source on one clock by cross-correlating their audio (first 10 minutes). Runs in the background (a few seconds to a minute); then get_edit shows sync_offset_ms and sync_score (higher is surer; under ~6 check by ear) per source.",
    input: S({}), run: async (p) => {
      const { rows: [j] } = await db.query(`insert into jobs (kind, project, ref) values ('sync', $1, $1) returning id`, [p.slug]);
      return { ok: true, job_id: j.id };
    } },
  { name: "render", description: "Render the saved draft edit in the cloud (ffmpeg on parallel Modal sandboxes, 30 s chunks; chunks that did not change since an earlier render are reused) and publish it as a new review version when done. Poll render_status.",
    input: S({ version: str("e.g. v2 (default: next number)"), changes: str("one paragraph: what changed in this cut") }),
    run: async (p, a) => {
      const { rows: [d] } = await db.query(`select edit_draft from projects where slug = $1`, [p.slug]);
      if (!d?.edit_draft) throw new Error("no draft edit: save_edit first");
      return queueRender(p.slug, { edit: d.edit_draft, version: a.version, changes: a.changes, by: AGENT });
    } },
  { name: "render_status", description: "A render's progress: status (queued, rendering, done, failed), chunks total / reused / done, error, timings and cost. Default: the latest render.",
    input: S({ render_id: int("render id from render") }), run: async (p, a) => {
      const { rows: [r] } = await db.query(`select id, version, status, chunks_total, chunks_cached, chunks_done, error, stats, created_at, started_at, finished_at
        from renders where project = $1 ${a.render_id ? "and id = $2" : ""} order by id desc limit 1`, a.render_id ? [p.slug, a.render_id] : [p.slug]);
      if (!r) throw new Error("no render yet");
      return { ...r, review_url: r.status === "done" ? `${SITE}/p/${p.slug}/` : null };
    } },
  { name: "publish_version", description: "Make a new review version live. Upload it first with scripts/add-video.mjs (it puts videos/<slug>/<version>/ in storage and calls this for you when given --token). Keeps title, share link and comments; old comments keep their old timecodes.",
    input: S({ version: str("e.g. v2"), changes: str("one paragraph: what changed in this cut"), title: str("optional new title") }, ["version"]),
    run: async (p, a) => publishVersion(p.slug, { ...a, by: AGENT }) },
];

// ---------- HTTP: REST + MCP ----------
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const SERVER_INFO = { name: "ai-video-editor", version: "1.0.0" };
const INSTRUCTIONS = "AI Video Editor: one video project. Call get_guide first (rules, tools, workflows), then get_project. Work the @agent queue with list_tasks -> claim_task -> edit (tesseract-video skill) -> scripts/add-video.mjs --token -> complete_task. A first_cut task is the owner's brief for the first edit from the sources (guide section 7).";

export async function agentRoute(req, res, path, readBody) {
  const p = await projectForToken(req);
  if (!p) return send(res, 401, { error: "Send Authorization: Bearer <agent token>. Get the token from Copy for agent on the project page." });
  setSite(req);
  if (path === "/agent/mcp") {
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); return res.end(); }
    const body = await readBody(req);
    const one = async (m) => {
      if (m.id === undefined) return null;                       // notification: no reply
      try { return { jsonrpc: "2.0", id: m.id, result: await mcpCall(p, m.method, m.params || {}) }; }
      catch (e) { return { jsonrpc: "2.0", id: m.id, error: { code: e.code || -32603, message: e.message } }; }
    };
    const out = Array.isArray(body) ? (await Promise.all(body.map(one))).filter(Boolean) : await one(body);
    if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202); return res.end(); }
    return send(res, 200, out);
  }
  if (path === "/agent/tools" || path === "/agent" || path === "/agent/")
    return send(res, 200, { project: p.slug, tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input: t.input })),
      usage: "POST /agent/<tool> with a JSON body; MCP at POST /agent/mcp; guide: GET /agent/guide" });
  if (path === "/agent/guide") { res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" }); return res.end(guide()); }
  const tool = TOOLS.find((t) => `/agent/${t.name}` === path);
  if (!tool) return send(res, 404, { error: "no such tool; GET /agent/tools lists them" });
  try {
    const args = req.method === "GET" ? Object.fromEntries(new URL(req.url, "http://x").searchParams) : await readBody(req);
    for (const [k, v] of Object.entries(args)) if (typeof v === "string" && tool.input.properties[k]?.type === "integer") args[k] = Number(v);
    for (const [k, v] of Object.entries(args)) if (typeof v === "string" && tool.input.properties[k]?.type === "boolean") args[k] = v === "true";
    const r = await tool.run(p, args);
    if (typeof r === "string") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); return res.end(r); }
    return send(res, 200, r);
  } catch (e) { return send(res, 400, { error: e.message }); }
}

async function mcpCall(p, method, params) {
  if (method === "initialize")
    return { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS };
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input })) };
  if (method === "tools/call") {
    const t = TOOLS.find((x) => x.name === params.name);
    if (!t) throw Object.assign(new Error(`unknown tool ${params.name}`), { code: -32602 });
    try {
      const r = await t.run(p, params.arguments || {});
      return { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r, null, 2) }] };
    } catch (e) { return { content: [{ type: "text", text: e.message }], isError: true }; }
  }
  throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
}

// ---------- source transcription worker ----------
const MEDIA = /\.(mp4|mov|m4v|mkv|webm|avi|mxf|mts|m4a|mp3|wav|aac|aif|aiff|flac|ogg|opus)$/i;
export const isMedia = (s) => /^(video|audio)\//.test(s.content_type || "") || MEDIA.test(s.file_name || "");

export async function queueSourceTranscript(s) {
  if (!isMedia(s)) { await db.query(`update sources set tx_status = 'skipped', tx_error = 'not audio or video' where id = $1`, [s.id]); return; }
  await db.query(`update sources set tx_status = 'queued', tx_error = null where id = $1`, [s.id]);
  await db.query(`insert into jobs (kind, project, ref) values ('source_tx', $1, $2)`, [s.project, String(s.id)]);
}

const run = (cmd, args) => new Promise((ok, bad) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] }); let err = "";
  p.stderr.on("data", (d) => { err = (err + d).slice(-3000); });
  p.on("error", bad);
  p.on("close", (c) => c === 0 ? ok() : bad(new Error(err.trim().split("\n").slice(-3).join(" ") || `${cmd} exit ${c}`)));
});

// Seconds of sound in a file or behind a link: the first audio stream, or (unless trackOnly) the whole file when
// the stream has no length of its own. null = not known.
const execFileP = promisify(execFile);
async function audioSeconds(input, { trackOnly = false } = {}) {
  for (let i = 0; i < 2; i++) {
    try {
      const raw = JSON.parse((await execFileP("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration:format=duration", "-of", "json", input],
        { maxBuffer: 4e6 })).stdout);
      const s = Number(raw.streams?.[0]?.duration), f = Number(raw.format?.duration);
      return s > 0 ? s : !trackOnly && f > 0 ? f : null;
    } catch { /* one more try */ }
  }
  return null;
}
// The audio made from a source is short when it misses more than 2 s (or 0.5 %) of the source's sound.
export const audioShort = (got, want) => got != null && want != null && got < want - Math.max(2, want * 0.005);

let graphed;
async function transcribeSource(job) {
  const { rows: [s] } = await db.query(`select * from sources where id = $1`, [Number(job.ref)]);
  if (!s || s.status !== "ready") return;
  await db.query(`update sources set tx_status = 'working', tx_error = null where id = $1`, [s.id]);
  const mp3 = join(tmpdir(), `src-${s.id}-${Date.now()}.mp3`);
  try {
    // mono 16 kHz 32k MP3: speech only, ~14 MB per hour (one PutObject stays under the 64 MiB gateway limit up to ~4 h)
    // ffmpeg reads the source through a size-checked local link (lib.mjs withVerified): every byte it asks for comes
    // whole from storage, or this throws and no transcript is made or paid for. The stored size must also equal the
    // uploaded size.
    let want = null;
    try {
      await withVerified(s.key, { size: s.size }, async (url) => {
        want = await audioSeconds(url, { trackOnly: true });
        await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", url, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", mp3]);
      });
    } catch (e) {
      if (/does not contain any stream|matches no streams|Output file is empty/i.test(e.message)) {
        await db.query(`update sources set tx_status = 'skipped', tx_error = 'no audio track' where id = $1`, [s.id]); return;
      }
      throw e;
    }
    // Second gate, when the source states its sound track's own length (MP4, MOV, WAV, ...; WebM and MKV state only
    // the file's length, which says nothing about the track): the audio must be as long as that track. Every byte
    // was read, so a short result means a damaged file. It is refused, not transcribed short.
    const got = await audioSeconds(mp3);
    if (audioShort(got, want)) throw new Error(`the audio came out ${got.toFixed(1)} s long, the source's sound track is ${want.toFixed(1)} s. The file may be damaged: export it again and upload it again.`);
    const key = sourceAudioKey(s);
    await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: readFileSync(mp3), ContentType: "audio/mpeg", ContentLength: statSync(mp3).size }));
    graphed ||= new Graphed();
    // Graphed Tools sometimes answers a good request with 502/503: retry those (Nov 2026)
    let raw;
    for (let i = 1; ; i++) {
      try { raw = await graphed.tools.run("graphed:transcription", { url: await signGet(key), language: "en" }, { timeoutSeconds: 3600, downloadTimeoutMs: 600000 }); break; }
      catch (e) { if (i >= 4 || !/50[234]|ECONNRESET|fetch failed/i.test(String(e.message))) throw e; await new Promise((r) => setTimeout(r, 5000 * i)); }
    }
    const { rows: [cur] } = await db.query(`select label from sources where id = $1`, [s.id]);
    const tr = toWords(raw, raw.duration_seconds, { speaker: cur?.label || s.label });
    await db.query(`update sources set tx_status = 'done', transcript = $2, tx_words = $3 where id = $1`, [s.id, JSON.stringify(tr), tr.words.length]);
  } finally { rmSync(mp3, { force: true }); }
}

export async function startWorker() {
  await db.query(`update jobs set status = 'queued' where status = 'working'`);
  await db.query(`update sources set tx_status = 'queued' where tx_status = 'working'`);
  let busy = false;
  setInterval(async () => {
    if (busy) return; busy = true;
    let job;
    try {
      ({ rows: [job] } = await db.query(`update jobs set status = 'working', started_at = now(), attempts = attempts + 1
        where id = (select id from jobs where status = 'queued' order by id for update skip locked limit 1) and ${IS_LEAD} returning *`, [RUNNER]));
      if (!job) return;
      if (job.kind === "source_tx") await transcribeSource(job);
      if (job.kind === "sync") await syncSources(job.project);
      await db.query(`update jobs set status = 'done', finished_at = now() where id = $1`, [job.id]);
    } catch (e) {
      console.error(`job ${job?.id} ${job?.kind}:`, e.message);
      if (job) {
        await db.query(`update jobs set status = 'failed', error = $2, finished_at = now() where id = $1`, [job.id, e.message.slice(0, 1000)]).catch(() => {});
        if (job.kind === "source_tx") await db.query(`update sources set tx_status = 'failed', tx_error = $2 where id = $1`, [Number(job.ref), e.message.slice(0, 500)]).catch(() => {});
      }
    } finally { busy = false; }
  }, 4000).unref();
}
