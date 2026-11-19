// Shared by server.mjs and cli.mjs: Postgres schema, storage client, project loading.
import { readFileSync } from "node:fs";
import http from "node:http";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand,
  ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
export const s3 = new S3Client({
  region: "us-west-2", endpoint: process.env.GRAPHED_STORAGE_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: process.env.GRAPHED_STORAGE_ACCESS_KEY_ID,
                 secretAccessKey: process.env.GRAPHED_STORAGE_SECRET_ACCESS_KEY },
});
export const Bucket = process.env.GRAPHED_STORAGE_BUCKET;

export const signGet = (key) => getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 3600 });
// ---------- size-checked reads for ffmpeg and ffprobe ----------
// One long GET from storage can stop before the end of the object with no error, and ffmpeg then takes what it got
// for the whole file (a short transcript, a wrong sync). So ffmpeg never reads a storage link. openVerified()
// gives it a local link. Behind that link every byte range ffmpeg asks for is fetched from storage in pieces of
// a known size; a piece that stops early is asked for again from the byte where it stopped. When a range cannot be
// completed, the local connection is cut and failed() returns the error: the caller throws its output away.
// The object's size comes from storage and must equal `size` (the uploaded size) when that is given.
const waitDrain = (res) => new Promise((ok) => { const done = () => { res.off("drain", done); res.off("close", done); ok(); }; res.on("drain", done); res.on("close", done); });
export async function openVerified(key, { size, sign = signGet, piece = 8 * 1024 * 1024 } = {}) {
  const first = await fetch(await sign(key), { headers: { Range: "bytes=0-0" } });
  const total = Number((first.headers.get("content-range") || "").split("/")[1]);
  await first.arrayBuffer().catch(() => {});
  if (!(total > 0)) throw new Error(`storage gave no size for ${key} (HTTP ${first.status})`);
  if (size != null && Number(size) !== total) throw new Error(`${key} is ${total} bytes in storage, ${size} bytes expected`);
  let error = null;
  const server = http.createServer(async (req, res) => {
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = m ? Number(m[1]) : 0, end = m?.[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${total}` }); return res.end(); }
    res.writeHead(m ? 206 : 200, { "Content-Type": "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1),
      ...(m ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}) });
    if (req.method === "HEAD") return res.end();
    let gone = false, at = start, stuck = 0;
    res.on("close", () => { gone = true; });                 // ffmpeg seeks by dropping the connection and opening a new one
    try {
      while (at <= end && !gone) {
        const to = Math.min(end, at + piece - 1), before = at, ac = new AbortController(), stop = () => ac.abort();
        let err = null;
        res.on("close", stop);
        try {
          const r = await fetch(await sign(key), { headers: { Range: `bytes=${at}-${to}` }, signal: ac.signal });
          if (r.status !== 206) { await r.arrayBuffer().catch(() => {}); throw new Error(`storage answered HTTP ${r.status} for bytes ${at}-${to}`); }
          for await (const chunk of r.body) {
            const buf = at + chunk.length > to + 1 ? chunk.subarray(0, to + 1 - at) : chunk;
            at += buf.length;
            if (!res.write(buf)) await waitDrain(res);
            if (at > to || gone) break;
          }
        } catch (e) { err = e; }
        finally { res.off("close", stop); }
        if (gone) return;
        // the piece stopped early: the next turn asks again from `at`. Six turns with no new byte = give up.
        if (at > before) stuck = 0;
        else if (++stuck >= 6) throw err || new Error(`storage sent no bytes at ${at} of ${key}`);
        else await new Promise((r) => setTimeout(r, 150 * stuck));
      }
      if (!gone) res.end();
    } catch (e) { error ||= e; res.destroy(); }
  });
  await new Promise((ok, bad) => { server.once("error", bad); server.listen(0, "127.0.0.1", ok); });
  return { url: `http://127.0.0.1:${server.address().port}/${encodeURIComponent(key.split("/").pop())}`, total,
    failed: () => error, close: () => { server.closeAllConnections?.(); server.close(); } };
}
// Run fn(local link) on a storage object. Throws when a read behind the link did not complete, whatever fn returned.
export async function withVerified(key, opts, fn) {
  const v = await openVerified(key, opts);
  const bad = () => new Error(`reading ${key.split("/").pop()} from storage did not complete (${v.failed().message}); run it again`);
  try { const out = await fn(v.url); if (v.failed()) throw bad(); return out; }
  catch (e) { throw v.failed() ? bad() : e; }
  finally { v.close(); }
}

// presigned PUT for a sandbox to upload one render output (one PUT is at most 64 MiB at the gateway)
export const signPut = (key) => getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key }), { expiresIn: 3600 });

// Browser multipart upload (same as hd-recorder): the server opens the upload and signs each part,
// the browser PUTs parts straight to storage, the server reads the ETags back with ListParts and completes.
export const PART_SIZE = 16 * 1024 * 1024;   // gateway takes up to 64 MiB per part; S3 minimum is 5 MiB
export async function createMultipart(key, contentType) {
  return (await s3.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType || "application/octet-stream" }))).UploadId;
}
export const signPart = (key, uploadId, n) =>
  getSignedUrl(s3, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: n }), { expiresIn: 3600 });
export async function listParts(key, uploadId) {
  const parts = []; let marker;
  do {
    const r = await s3.send(new ListPartsCommand({ Bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }));
    for (const p of r.Parts ?? []) parts.push({ PartNumber: p.PartNumber, ETag: p.ETag, Size: p.Size });
    marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
  } while (marker);
  return parts.sort((a, b) => a.PartNumber - b.PartNumber);
}
export async function completeMultipart(key, uploadId) {
  const parts = await listParts(key, uploadId);
  if (!parts.length) throw new Error("no parts uploaded");
  await s3.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })) } }));
  return parts.reduce((n, p) => n + (p.Size || 0), 0);
}
export const abortMultipart = (key, uploadId) => s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
export async function getText(key) {
  const r = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
  return r.Body.transformToString();
}
export const delObject = (key) => s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
// Delete many keys, 16 at a time. Returns how many delete calls went through.
export async function delKeys(keys) {
  let removed = 0;
  for (let i = 0; i < keys.length; i += 16)
    removed += (await Promise.allSettled(keys.slice(i, i + 16).map(delObject))).filter((x) => x.status === "fulfilled").length;
  return removed;
}
// A source's files: the upload itself (or its unfinished multipart) and the audio the transcription step made from it.
export const sourceAudioKey = (s) => `videos/${s.project}/sources/${s.id}-audio.mp3`;
export async function removeSource(s) {
  try { if (s.status === "uploading" && s.upload_id) await abortMultipart(s.key, s.upload_id); else if (s.key) await delObject(s.key); }
  catch (e) { console.warn(`source ${s.id} storage cleanup: ${e.message}`); }
  await delObject(sourceAudioKey(s)).catch(() => {});
  await db.query(`delete from sources where id = $1`, [s.id]);
}

// 24 chars of base62-ish: the share link is the only secret, so make it unguessable.
export const newToken = () => randomBytes(18).toString("base64url");
export const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
// A version the cloud renderer made (render.mjs) plays from videos/<slug>/renders/. An imported video
// (add-video.mjs) is fMP4 too, so the playlist alone does not tell them apart.
export const isCloudRender = (p) => !!p?.playlist && p.hls_prefix === `videos/${p.slug}/renders/`;

// One process at a time takes background work (transcription, audio sync, renders): the newest one that started
// its workers. A process that is being replaced sees the change and takes no new work.
export const RUNNER = randomBytes(6).toString("hex");
export const takeLead = () => db.query(`insert into settings (key, value) values ('lead', $1) on conflict (key) do update set value = excluded.value`, [RUNNER]);
export const IS_LEAD = `exists (select 1 from settings where key = 'lead' and value = $1)`;   // $1 = RUNNER

// Script cuts hold word numbers of one version's transcript, so they belong to that version: the page, the notes
// and the agent read only the current version's cuts. A version published again under the same name gets a new
// transcript; its old cuts are set aside (kept in the table, shown nowhere).
export const retireCuts = (slug, version) => db.query(
  `update cuts set version = version || ' (replaced ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || ')' where asset = $1 and version = $2`, [slug, version]);
// Every file a playlist may ask for. add-video.mjs playlists have one init.mp4 and flat seg_*.m4s;
// rendered playlists (render.mjs) have chunks/<key>/init.mp4 per chunk (EXT-X-MAP) and chunks/<key>/seg_*.m4s.
export const segmentsOf = (playlist) => {
  if (!playlist) return [];
  const maps = [...playlist.matchAll(/#EXT-X-MAP:URI="([^"]+)"/g)].map((m) => m[1]);
  return [...(maps.length ? maps : ["init.mp4"]), ...playlist.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.endsWith(".m4s"))];
};

export async function migrate() {
  // comments.asset and cuts.asset hold projects.slug (the first video kept its old asset id as its slug)
  await db.query(`create table if not exists comments (
    id serial primary key, asset text not null, t_ms integer not null, t_end_ms integer,
    author text not null, body text not null, drawing jsonb,
    parent_id integer references comments(id) on delete cascade,
    resolved boolean not null default false, created_at timestamptz not null default now())`);
  await db.query(`create index if not exists comments_asset on comments(asset, t_ms)`);
  await db.query(`create table if not exists cuts (
    id serial primary key, asset text not null, w0 integer not null, w1 integer not null,
    author text not null, created_at timestamptz not null default now())`);
  await db.query(`create table if not exists projects (
    slug text primary key,
    title text not null,
    version text not null default 'v1',
    hls_prefix text not null,          -- storage key prefix of init.mp4 + seg_*.m4s
    duration real,
    size bigint,
    file text,                         -- suggested name for Download MP4
    playlist text not null,            -- index.m3u8
    transcript jsonb,                  -- {speakers, total_ms, fields, words: [[t0,t1,word,spk,rec0,rec1]]}
    chapters jsonb not null default '[]',
    inserts jsonb not null default '[]',
    share_on boolean not null default false,
    share_token text unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now())`);
  // a project can start with source files only; the review video (HLS) comes later from add-video.mjs
  await db.query(`alter table projects alter column playlist drop not null`);
  // a cut belongs to the version it was made on; cuts from before this column go to the project's current version
  await db.query(`alter table cuts add column if not exists version text`);
  await db.query(`update cuts c set version = p.version from projects p where p.slug = c.asset and c.version is null`);
  await db.query(`alter table projects alter column hls_prefix drop not null`);
  // raw files for the edit: camera angles, screen recordings, audio. Stored at videos/<slug>/sources/<id>-<name>
  await db.query(`create table if not exists sources (
    id serial primary key,
    project text not null references projects(slug) on delete cascade,
    label text not null,
    file_name text not null,
    content_type text,
    size bigint not null,
    key text not null,
    upload_id text,                     -- set while uploading
    status text not null default 'uploading',   -- uploading | ready
    created_at timestamptz not null default now())`);
  await db.query(`create index if not exists sources_project on sources(project, id)`);
  // per-source transcript: one mic per speaker, so every word in a source gets the source label as speaker
  await db.query(`alter table sources add column if not exists tx_status text not null default 'none'`);  // none|queued|working|done|failed|skipped
  await db.query(`alter table sources add column if not exists tx_error text`);
  await db.query(`alter table sources add column if not exists tx_words integer`);
  await db.query(`alter table sources add column if not exists transcript jsonb`);
  // agent access: one bearer token per project for /agent/* (REST + MCP)
  await db.query(`alter table projects add column if not exists agent_token text unique`);
  // "@agent ..." comments become tasks an agent claims, works and answers
  await db.query(`create table if not exists agent_tasks (
    id serial primary key,
    project text not null references projects(slug) on delete cascade,
    comment_id integer not null unique references comments(id) on delete cascade,
    status text not null default 'queued',      -- queued | working | done | failed | canceled
    note text,                                  -- latest progress line from the agent
    result_version text,
    created_at timestamptz not null default now(), claimed_at timestamptz, done_at timestamptz)`);
  // kind 'first_cut': the owner's brief asks the agent to propose the first edit from the sources.
  // It has no comment (there is no video to comment on yet); the brief holds the request.
  await db.query(`alter table agent_tasks alter column comment_id drop not null`);
  await db.query(`alter table agent_tasks add column if not exists kind text not null default 'comment'`);   // comment | first_cut
  await db.query(`alter table agent_tasks add column if not exists brief jsonb`);   // {goal, format, length, notes, by}
  // cloud render (render.mjs): edit drafts, renders, the chunk cache, source probe + audio sync
  await db.query(`alter table projects add column if not exists edit_draft jsonb`);
  await db.query(`alter table sources add column if not exists meta jsonb`);              // {duration_ms, has_audio, video:{width,height,fps}}
  await db.query(`alter table sources add column if not exists sync_offset_ms integer`);  // on the reference source's clock
  await db.query(`alter table sources add column if not exists sync_score real`);
  await db.query(`alter table sources add column if not exists sync_ref integer`);
  await db.query(`create table if not exists renders (
    id serial primary key,
    project text not null references projects(slug) on delete cascade,
    version text not null, changes text, by text, edit jsonb not null,
    status text not null default 'queued',           -- queued | rendering | done | failed
    chunks_total integer, chunks_cached integer, chunks_done integer, error text, stats jsonb,
    created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz)`);
  await db.query(`alter table renders add column if not exists runner text`);
  await db.query(`create table if not exists sandboxes (id text primary key, opened_at timestamptz not null default now(), stopped_at timestamptz)`);
  await db.query(`create table if not exists chunk_cache (
    key text primary key, project text not null, playlist text not null, duration_ms integer, bytes bigint,
    created_at timestamptz not null default now())`);
  await db.query(`create table if not exists versions (
    id serial primary key,
    project text not null references projects(slug) on delete cascade,
    version text not null, changes text, by text,
    created_at timestamptz not null default now())`);
  await db.query(`alter table versions add column if not exists edit jsonb`);
  await db.query(`alter table versions add column if not exists render_id integer`);
  // background work in the web process (source transcription); 'working' rows go back to the queue on boot
  await db.query(`create table if not exists jobs (
    id serial primary key, kind text not null,
    project text not null references projects(slug) on delete cascade,
    ref text not null, status text not null default 'queued', error text, attempts integer not null default 0,
    created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz)`);
  // the app's own public URL, learned from the first page request (setSite) and kept for the CLI and the workers
  await db.query(`create table if not exists settings (key text primary key, value text)`);
  if (!process.env.PUBLIC_URL) SITE = (await db.query(`select value from settings where key = 'site'`)).rows[0]?.value || SITE;
}

// Every storage key the database knows for a project (project storage has no list call): the files of each
// imported version, every rendered chunk, and the project-level files. Call it before the rows are deleted.
// Sources and the audio made from them go one by one (removeSource).
export async function projectKeys(p) {
  const base = `videos/${p.slug}/`, keys = new Set([base + "meta.json", base + "transcript.json", base + "audio.mp3"]);
  const hls = (prefix, playlist) => { keys.add(prefix + "index.m3u8"); for (const f of segmentsOf(playlist)) keys.add(prefix + f); };
  if (p.hls_prefix?.startsWith(base)) hls(p.hls_prefix, p.playlist);
  const imported = (await db.query(`select version from versions where project = $1 and render_id is null`, [p.slug])).rows.map((r) => r.version);
  for (const v of new Set([p.version, ...imported])) {
    if (!/^[\w.-]{1,20}$/.test(v || "")) continue;
    const vp = `${base}${v}/`;
    keys.add(vp + "meta.json"); keys.add(vp + "transcript.json");
    try { hls(vp + "hls/", await getText(vp + "hls/index.m3u8")); } catch { /* this version has no files of its own */ }
  }
  for (const c of (await db.query(`select key, playlist from chunk_cache where project = $1`, [p.slug])).rows)
    hls(`${base}renders/chunks/${c.key}/`, c.playlist);
  return [...keys];
}

export async function upsertProject(p) {
  if (!SLUG.test(p.slug)) throw new Error(`bad slug "${p.slug}" (a-z, 0-9, dashes)`);
  const { rows } = await db.query(
    `insert into projects (slug, title, version, hls_prefix, duration, size, file, playlist, transcript, chapters, inserts, share_on, share_token)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (slug) do update set title = excluded.title, version = excluded.version, hls_prefix = excluded.hls_prefix,
       duration = excluded.duration, size = excluded.size, file = excluded.file, playlist = excluded.playlist,
       transcript = excluded.transcript,
       chapters = case when excluded.chapters = '[]'::jsonb then projects.chapters else excluded.chapters end,
       inserts = case when excluded.inserts = '[]'::jsonb then projects.inserts else excluded.inserts end, updated_at = now()
     returning slug`,
    [p.slug, p.title, p.version || "v1", p.hls_prefix, p.duration ?? null, p.size ?? null, p.file ?? `${p.slug}.mp4`,
     p.playlist, p.transcript ? JSON.stringify(p.transcript) : null, JSON.stringify(p.chapters || []),
     JSON.stringify(p.inserts || []), !!p.share_on, p.share_on ? newToken() : null]);
  return rows[0];
}


// ---------- edit notes (server export + cli.mjs notes) ----------
export const tc = (ms) => {
  const s = Math.floor(ms / 1000), f = Math.floor((ms % 1000) / (1000 / 30));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};
export const cutInfo = (W) => (c) => ({ ...c, t0_ms: W[c.w0]?.[0], t1_ms: W[c.w1]?.[1], rec0_ms: W[c.w0]?.[4], rec1_ms: W[c.w1]?.[5],
  text: W.slice(c.w0, c.w1 + 1).map((w) => w[2]).join(" ") });

export async function exportList(p, fmt) {   // p needs slug, title, version, W (transcript words)
  const { rows } = await db.query(
    `select c.*, (select json_agg(r order by r.created_at) from comments r where r.parent_id = c.id) as replies
     from comments c where c.asset = $1 and c.parent_id is null order by c.t_ms, c.id`, [p.slug]);
  if (fmt === "csv") {
    const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = ["timecode,end,status,author,comment,drawing,replies"];
    for (const c of rows)
      lines.push([tc(c.t_ms), c.t_end_ms != null ? tc(c.t_end_ms) : "", c.resolved ? "resolved" : "open", c.author,
        c.body, c.drawing ? "yes" : "", (c.replies || []).map((r) => `${r.author}: ${r.body}`).join(" | ")].map(q).join(","));
    return lines.join("\n");
  }
  const out = [`# Edit notes: ${p.title} ${p.version}`, ""];
  for (const c of rows) {
    out.push(`- [${c.resolved ? "x" : " "}] **${tc(c.t_ms)}${c.t_end_ms != null ? `–${tc(c.t_end_ms)}` : ""}** ` +
      `(${c.author})${c.drawing ? " ✎" : ""}: ${c.body}`);
    for (const r of c.replies || []) out.push(`  - ${r.author}: ${r.body}`);
  }
  const cuts = (await db.query(`select * from cuts where asset = $1 and version = $2 order by w0`, [p.slug, p.version])).rows.map(cutInfo(p.W));
  if (cuts.length) {
    out.push("", "## Script cuts (words deleted in the transcript)", "");
    for (const c of cuts)
      out.push(`- **${tc(c.t0_ms)}–${tc(c.t1_ms)}** (${c.author}) rec ${(c.rec0_ms / 1000).toFixed(2)}–${(c.rec1_ms / 1000).toFixed(2)}: ~~${c.text}~~`);
  }
  return out.join("\n") + "\n";
}

// ---------- prompts a person copies into a coding agent (Claude Code, Cursor) ----------
// The app's public URL: PUBLIC_URL when set, else learned from the first trusted request and kept in the
// settings table, so the CLI and the workers know it too.
export let SITE = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
// Set once, from a request that is already trusted (a page behind the Graphed login, or an agent call with a
// valid token): a later request with another Host header cannot move it. PUBLIC_URL overrides it.
export function setSite(req) {
  if (process.env.PUBLIC_URL || SITE) return;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!/^[\w.-]+(:\d+)?$/.test(host)) return;
  const origin = `${String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || (/^(localhost|127\.)/.test(host) ? "http" : "https")}://${host}`;
  SITE = origin;
  db.query(`insert into settings (key, value) values ('site', $1) on conflict (key) do update set value = excluded.value`, [origin]).catch(() => {});
}
// This Graphed project's slug (graphed.yaml), for the commands the prompts print.
export const PROJECT_SLUG = (() => {
  try { return readFileSync(new URL("./graphed.yaml", import.meta.url), "utf8").match(/^slug:\s*(\S+)/m)?.[1] || "ai-video-editor"; }
  catch { return "ai-video-editor"; }
})();
const gb = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`;

// Same setup block in every prompt.
const SETUP = `Setup (check once before you start; install only what is missing):
- Graphed CLI: \`graphed --version\`. If missing: \`npm i -g @graphed-inc/cli\` then \`graphed login\`.
  Then \`graphed skills sync\`: it installs the Graphed skills, with /graphed:ai-video-editor (the runbook for this app).
- ffmpeg: \`ffmpeg -version\` (macOS: \`brew install ffmpeg\`). You need it to measure files and to publish a finished MP4.
- Motion graphics are optional and are made on this machine: /graphed:tesseract-motion.
`;

export function newVideoPrompt() {
  return `Add a finished video to the AI Video Editor (the review app for our video edits): ${SITE}

Read the guide first: ${SITE}/AGENTS.md (Graphed login), or the /graphed:ai-video-editor skill.

${SETUP}
Then:
1. Ask me for the video file path, a title and the speaker names if I did not give them.
2. From the app's folder (apps/${PROJECT_SLUG}, where scripts/ is), run (pick a short lowercase slug from the title):
   node scripts/add-video.mjs <video.mp4> --slug <slug> --title "<title>" --speakers "<Name 1>,<Name 2>" --site ${SITE}
   It makes an HLS stream with ffmpeg, uploads it to Graphed project storage, transcribes it with
   Graphed transcription (about 0.14 credits per second of audio: tell me the cost first) and adds the project.
   It starts private. Add --no-transcript to skip the transcript. A re-run continues where it stopped.
3. Give me the review link: ${SITE}/p/<slug>/

To edit raw files (cameras, mics, screen recordings) with the agent, make a New project in the app, upload the
files there and use that project's Copy for agent prompt.
`;
}

export async function projectPrompt(slug) {
  const p = (await db.query(`select slug, title, version, playlist is not null as has_edit from projects where slug = $1`, [slug])).rows[0];
  if (!p) throw new Error("no such project");
  const src = (await db.query(`select id, label, file_name, size, tx_status from sources where project = $1 and status = 'ready' order by id`, [slug])).rows;
  const notes = (await db.query(`select count(*)::int as n from comments where asset = $1 and parent_id is null and not resolved`, [slug])).rows[0].n;
  const tasks = (await db.query(`select count(*)::int as n from agent_tasks where project = $1 and status = 'queued'`, [slug])).rows[0].n;
  let token = (await db.query(`select agent_token from projects where slug = $1`, [slug])).rows[0].agent_token;
  if (!token) {
    const { newAgentToken } = await import("./agent.mjs");
    token = newAgentToken();
    await db.query(`update projects set agent_token = $2 where slug = $1 and agent_token is null`, [slug, token]);
    token = (await db.query(`select agent_token from projects where slug = $1`, [slug])).rows[0].agent_token;
  }
  const next = p.has_edit ? Number(String(p.version).replace(/\D/g, "") || 1) + 1 : 1;
  return `Help me edit the video project "${p.title}" in the AI Video Editor (our review app).

Read the guide first: the get_guide tool (MCP), or GET ${SITE}/agent/guide with the token below. It has the rules,
every tool and the step-by-step workflows. The /graphed:ai-video-editor skill is the runbook for the whole job.
Project slug: ${p.slug}
Review page (Graphed login): ${SITE}/p/${p.slug}/
Review video: ${p.has_edit ? `${p.version} is up` : "none yet"}${notes ? `, ${notes} open comments` : ""}

${SETUP}
Agent access (this project only; keep the token private):
  Token: ${token}
  MCP for Claude Code (run once):
    claude mcp add --transport http video-${p.slug} ${SITE}/agent/mcp --header "Authorization: Bearer ${token}"
  Same tools over REST: POST ${SITE}/agent/<tool> with that header and a JSON body; GET ${SITE}/agent/tools lists them.
  Tools: get_guide, get_project, get_notes, get_transcript, get_source_url, add_source, sync_sources, get_edit, save_edit,
         render, render_status, list_tasks, claim_task, update_task, complete_task, fail_task, post_comment,
         resolve_comment, publish_version.

Source files${src.length ? "" : ": none uploaded yet"}${src.length ? ` (each is transcribed on upload; one file = one speaker, so
get_transcript {"sources": true} gives clean speaker labels):\n` + src.map((s) => `- #${s.id} ${s.label}: ${s.file_name}, ${gb(Number(s.size))}, transcript ${s.tx_status}`).join("\n") : ""}
Upload more from this machine (scripts/ is in the app folder, apps/${PROJECT_SLUG}). Transcription starts on upload
and costs about 0.144 credits per second of audio: tell me the cost and wait for my yes first.
  AVE_TOKEN=${token} node scripts/upload-sources.mjs --site ${SITE} "<file>=<who or what is on it>"

Make the edit in the cloud (guide section 7a): put the sources on one clock (sync_sources for same-room recordings,
offsets by hand for remote ones), write the clips, save_edit, render, then poll render_status. A one-hour video
renders in about 4 minutes, and a change renders only its chunks. The new version shows up on the review page.

@agent queue${tasks ? ` (${tasks} waiting)` : ""}: reviewers write "@agent ..." on a comment or a script range. The owner can
also ask for a first cut from the sources (a task with kind first_cut and a brief: follow guide section 7). To work it:
  list_tasks -> claim_task -> change the edit document -> save_edit -> render -> complete_task with a reply that says
  what changed (it resolves the comment). Use update_task for progress lines. To keep watching, run in Claude Code:
  /loop 15m work the @agent queue for video project ${p.slug}

Motion graphics are not in the cloud edit. Make those on this machine, then publish the finished MP4 as a version:
  node scripts/add-video.mjs <edit.mp4> --slug ${p.slug} --version v${next} --site ${SITE} \\
    --token ${token} --changes "<what changed in this cut>"
That path transcribes the MP4 again (about 0.14 credits per second): ask me before you run it.
`;
}
