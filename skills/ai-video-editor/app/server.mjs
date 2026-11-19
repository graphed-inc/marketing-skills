// AI Video Editor: many projects (one video each), each with its own transcript, comments and script cuts.
//
// Private (Graphed login at the gateway):
//   GET  /                              project list (home.html)
//   GET  /api/projects                  list with comment / cut counts and share links
//   PATCH /api/projects/:slug           {title?, chapters?, inserts?}
//   POST /api/projects/:slug/share      {on: bool} or {rotate: true}
//   GET|POST|DELETE /api/projects/:slug/first-cut   the brief for the agent's first edit (POST {goal, format, length, notes, by})
//   DELETE /api/projects/:slug          drops the project, its comments + cuts and its storage objects
//   /p/:slug[/...]                      review page + project API (below)
//
// Public (graphed.yaml public.paths ^/public/): only a project with sharing on, by its share token
//   /public/:token[/...]                review page + project API (below)
//
// Project API, under either prefix:
//   GET  /                     review page (index.html)
//   GET  /hls/<file>           index.m3u8 from Postgres, segments 302 -> presigned storage URL
//   GET  /api/project          title, duration, chapters, inserts, segment count
//   GET  /api/transcript       words
//   GET|POST /api/comments, PATCH|DELETE /api/comments/:id
//   GET|POST /api/cuts, DELETE /api/cuts/:id
//   GET  /api/segments, GET /api/export.md|csv
import http from "node:http";
import { readFileSync } from "node:fs";
import { db, migrate, signGet, delKeys, projectKeys, removeSource, isCloudRender, takeLead, newToken, segmentsOf, tc, cutInfo, exportList, PART_SIZE, createMultipart,
  signPart, completeMultipart, SLUG, newVideoPrompt, projectPrompt, setSite } from "./lib.mjs";
import { startRenderWorker } from "./render.mjs";
import { guide } from "./agent.mjs";
import { agentRoute, startWorker, taskForComment, queueSourceTranscript, agentToken, requestFirstCut, firstCutState } from "./agent.mjs";

const PORT = Number(process.env.PORT || 3000);
const file = (n) => readFileSync(new URL(n, import.meta.url), "utf8");
await migrate();
// AVE_WORKERS=off (smoke.mjs): pages and API only. That process takes no background work and leaves work in
// progress alone, so a check can run next to the live app.
if (process.env.AVE_WORKERS !== "off") { await takeLead(); await startWorker(); startRenderWorker(); }

// ---------- project cache (playlist + transcript are big; load once per updated_at) ----------
const cache = new Map();
async function loadProject(where, val) {
  const { rows } = await db.query(`select slug, updated_at, share_on, share_token from projects where ${where} = $1`, [val]);
  if (!rows[0]) return null;
  let p = cache.get(rows[0].slug);
  if (!p || +p.updated_at !== +rows[0].updated_at) {
    p = (await db.query(`select * from projects where slug = $1`, [rows[0].slug])).rows[0];
    p.segments = segmentsOf(p.playlist);
    p.W = p.transcript?.words || [];
    cache.set(p.slug, p);
  }
  // sharing changes without touching updated_at: always take it fresh
  return { ...p, share_on: rows[0].share_on, share_token: rows[0].share_token };
}
const bySlug = (slug) => loadProject("slug", slug);
const byToken = async (tok) => {
  const p = await loadProject("share_token", tok);
  return p && p.share_on ? p : null;
};

// ---------- helpers ----------
const json = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((ok, bad) => {
  let s = "";
  req.on("data", (c) => { s += c; if (s.length > 2e6) bad(new Error("too big")); });
  req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } });
});
const html = (res, s) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(s); };
const sharePath = (p) => p.share_on && p.share_token ? `/public/${p.share_token}` : null;

function reviewPage(p, base, shared) {
  const boot = { base, shared, slug: shared ? null : p.slug };
  return file("./index.html").replace("<!--BOOT-->",
    `<script>window.BOOT=${JSON.stringify(boot).replace(/</g, "\\u003c")}</script>`)
    .replace("<title>Review</title>", `<title>AI Video Editor · ${p.title.replace(/[<&]/g, "")}</title>`);
}



// ---------- one project's page + API; `rest` is the path after /p/:slug or /public/:token ----------
async function projectRoute(req, res, u, p, rest, base, shared) {
  const W = p.W;
  let m;
  if (rest === "" || rest === "/") {
    if (rest === "") { res.writeHead(302, { Location: base + "/" + u.search }); return res.end(); }
    return html(res, reviewPage(p, base, shared));
  }
  if ((m = rest.match(/^\/hls\/([\w./-]+)$/)) && !m[1].includes("..")) {
    if (!p.playlist) return json(res, 404, { error: "no review video yet" });
    if (m[1] === "index.m3u8") {
      res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" });
      return res.end(p.playlist);
    }
    if (!p.segments.includes(m[1])) return json(res, 404, { error: "no such segment" });
    res.writeHead(302, { Location: await signGet(p.hls_prefix + m[1]), "Cache-Control": "no-store" });
    return res.end();
  }
  if (rest === "/api/project")
    return json(res, 200, { slug: p.slug, title: p.title, version: p.version, duration: p.duration, size: p.size,
      file: p.file, chapters: p.chapters, inserts: p.inserts, segments: p.segments.length, words: W.length, shared,
      has_edit: !!p.playlist,
      rendered: isCloudRender(p),     // chunked HLS from the cloud renderer: the browser MP4 rebuild does not apply
      render: shared ? undefined : (await db.query(`select id, version, status, chunks_total, chunks_cached, chunks_done, error, stats, finished_at
        from renders where project = $1 order by id desc limit 1`, [p.slug])).rows[0] || null,
      versions: shared ? undefined : (await db.query(`select version, changes, by, created_at from versions where project = $1 order by id`, [p.slug])).rows,
      share: shared ? null : sharePath(p) });
  if (rest === "/api/transcript") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(p.transcript || { speakers: [], words: [] }));
  }
  if (rest === "/api/segments") return json(res, 200, p.segments);

  if (rest === "/api/cuts" && req.method === "GET") {
    const { rows } = await db.query(`select * from cuts where asset = $1 and version = $2 order by w0`, [p.slug, p.version]);
    return json(res, 200, rows.map(cutInfo(W)));
  }
  if (rest === "/api/cuts" && req.method === "POST") {
    const b = await readBody(req);
    const w0 = Math.min(b.w0, b.w1), w1 = Math.max(b.w0, b.w1);
    if (!b.author?.trim() || !(w0 >= 0) || !(w1 < W.length)) return json(res, 400, { error: "author, w0, w1 required" });
    const { rows } = await db.query(`insert into cuts (asset, w0, w1, author, version) values ($1,$2,$3,$4,$5) returning *`,
      [p.slug, w0, w1, b.author.trim().slice(0, 80), p.version]);
    return json(res, 200, cutInfo(W)(rows[0]));
  }
  if ((m = rest.match(/^\/api\/cuts\/(\d+)$/)) && req.method === "DELETE") {
    await db.query(`delete from cuts where id = $1 and asset = $2`, [Number(m[1]), p.slug]);
    return json(res, 200, { ok: true });
  }

  if (rest === "/api/comments" && req.method === "GET") {
    const { rows } = await db.query(`select c.*, t.id as task_id, t.status as task_status, t.note as task_note, t.result_version as task_version
      from comments c left join agent_tasks t on t.comment_id = c.id where c.asset = $1 order by c.t_ms, c.id`, [p.slug]);
    return json(res, 200, rows);
  }
  if (rest === "/api/comments" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.body?.trim() || !b.author?.trim() || !Number.isFinite(b.t_ms)) return json(res, 400, { error: "t_ms, author, body required" });
    if (b.parent_id) {
      const par = await db.query(`select 1 from comments where id = $1 and asset = $2`, [b.parent_id, p.slug]);
      if (!par.rowCount) return json(res, 400, { error: "no such parent" });
    }
    const { rows } = await db.query(
      `insert into comments (asset, t_ms, t_end_ms, author, body, drawing, parent_id) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [p.slug, Math.round(b.t_ms), Number.isFinite(b.t_end_ms) ? Math.round(b.t_end_ms) : null, b.author.trim().slice(0, 80),
       b.body.trim().slice(0, 5000), b.drawing ? JSON.stringify(b.drawing) : null, b.parent_id || null]);
    const task = await taskForComment(rows[0]);          // "@agent ..." -> the agent queue
    return json(res, 200, { ...rows[0], task_id: task?.id, task_status: task?.status });
  }
  if ((m = rest.match(/^\/api\/comments\/(\d+)$/))) {
    const id = Number(m[1]);
    if (req.method === "DELETE") {
      await db.query(`delete from comments where id = $1 and asset = $2`, [id, p.slug]);
      return json(res, 200, { ok: true });
    }
    if (req.method === "PATCH") {
      const b = await readBody(req);
      const { rows } = await db.query(
        `update comments set resolved = coalesce($3, resolved), body = coalesce($4, body) where id = $1 and asset = $2 returning *`,
        [id, p.slug, typeof b.resolved === "boolean" ? b.resolved : null, b.body?.trim() || null]);
      return json(res, 200, rows[0] || {});
    }
  }
  if ((m = rest.match(/^\/api\/export\.(md|csv)$/))) {
    res.writeHead(200, { "Content-Type": m[1] === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
                         "Content-Disposition": `attachment; filename="${p.slug}-notes.${m[1]}"` });
    return res.end(await exportList(p, m[1]));
  }
  return json(res, 404, { error: "not found" });
}

// ---------- private project admin ----------
async function listProjects() {
  const { rows } = await db.query(`
    select p.slug, p.title, p.version, p.duration, p.share_on, p.share_token, p.created_at, p.updated_at,
      p.playlist is not null as has_edit,
      (select count(*)::int from sources s where s.project = p.slug and s.status = 'ready') as sources,
      jsonb_array_length(coalesce(p.transcript->'words', '[]'::jsonb)) as words,
      (select count(*)::int from comments c where c.asset = p.slug and c.parent_id is null) as comments,
      (select count(*)::int from comments c where c.asset = p.slug and c.parent_id is null and not c.resolved) as open,
      (select count(*)::int from cuts k where k.asset = p.slug and k.version = p.version) as cuts,
      greatest(p.updated_at, (select max(created_at) from comments c where c.asset = p.slug),
               (select max(created_at) from cuts k where k.asset = p.slug and k.version = p.version),
               (select max(created_at) from sources s where s.project = p.slug)) as active_at
    from projects p order by p.created_at desc`);
  return rows.map(({ share_token, ...r }) => ({ ...r, share: r.share_on && share_token ? `/public/${share_token}` : null }));
}

async function adminRoute(req, res, p) {
  let m;
  if (p === "/" || p === "/index.html") return html(res, file("./home.html"));
  if (p === "/AGENTS.md") { res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" }); return res.end(guide()); }
  if (p === "/api/projects" && req.method === "GET") return json(res, 200, await listProjects());
  if (p === "/api/projects" && req.method === "POST") {           // empty project: upload sources now, the edit comes later
    const b = await readBody(req);
    const title = b.title?.trim()?.slice(0, 200);
    if (!title) return json(res, 400, { error: "title required" });
    const base = (b.slug || title).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "video";
    for (let i = 1; i < 100; i++) {
      const slug = i === 1 ? base : `${base}-${i}`;
      if (!SLUG.test(slug)) return json(res, 400, { error: "bad slug" });
      const r = await db.query(`insert into projects (slug, title, hls_prefix, playlist) values ($1, $2, null, null)
        on conflict (slug) do nothing returning slug`, [slug, title]);
      if (r.rowCount) return json(res, 200, { slug });
    }
    return json(res, 409, { error: "slug taken" });
  }
  if (p === "/api/agent-prompt") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); return res.end(newVideoPrompt()); }
  if ((m = p.match(/^\/api\/projects\/([\w-]+)\/agent-token$/)) && req.method === "POST") {
    await agentToken(m[1], { rotate: true });
    return json(res, 200, { ok: true });
  }
  if ((m = p.match(/^\/api\/projects\/([\w-]+)\/agent-prompt$/))) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(await projectPrompt(m[1]));
  }

  // ---------- first cut: the owner's brief becomes an agent task (agent.mjs) ----------
  if ((m = p.match(/^\/api\/projects\/([\w-]+)\/first-cut$/))) {
    if (!(await bySlug(m[1]))) return json(res, 404, { error: "no such project" });
    if (req.method === "GET") return json(res, 200, { task: await firstCutState(m[1]) });
    if (req.method === "POST") {
      try { const t = await requestFirstCut(m[1], await readBody(req)); return json(res, 200, { task: await firstCutState(m[1]), id: t.id }); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (req.method === "DELETE") {          // cancel a request no agent has claimed yet
      await db.query(`update agent_tasks set status = 'canceled', done_at = now() where project = $1 and kind = 'first_cut' and status = 'queued'`, [m[1]]);
      return json(res, 200, { task: await firstCutState(m[1]) });
    }
  }

  // ---------- source files (camera angles, screen recordings, audio) ----------
  if ((m = p.match(/^\/api\/projects\/([\w-]+)\/sources$/)) && req.method === "GET") {
    const { rows } = await db.query(`select id, label, file_name, content_type, size, status, tx_status, tx_words, tx_error, created_at
      from sources where project = $1 order by id`, [m[1]]);
    return json(res, 200, rows);
  }
  if ((m = p.match(/^\/api\/projects\/([\w-]+)\/sources$/)) && req.method === "POST") {
    const b = await readBody(req);
    if (!(await bySlug(m[1]))) return json(res, 404, { error: "no such project" });
    const size = Number(b.size), name = String(b.file_name || "").slice(0, 200);
    if (!name || !(size > 0)) return json(res, 400, { error: "file_name and size required" });
    const safe = name.replace(/[^\w.-]+/g, "_").slice(-120);
    const label = (b.label?.trim() || name.replace(/\.[^.]+$/, "")).slice(0, 120);
    const { rows: [row] } = await db.query(`insert into sources (project, label, file_name, content_type, size, key)
      values ($1,$2,$3,$4,$5,'') returning id`, [m[1], label, name, b.content_type || null, size]);
    const key = `videos/${m[1]}/sources/${row.id}-${safe}`;
    const uploadId = await createMultipart(key, b.content_type);
    await db.query(`update sources set key = $2, upload_id = $3 where id = $1`, [row.id, key, uploadId]);
    return json(res, 200, { id: row.id, label, part_size: PART_SIZE, parts: Math.ceil(size / PART_SIZE) });
  }
  if ((m = p.match(/^\/api\/sources\/(\d+)(\/[a-z]+)?$/))) {
    const { rows: [s] } = await db.query(`select * from sources where id = $1`, [Number(m[1])]);
    if (!s) return json(res, 404, { error: "no such source" });
    const act = m[2] || "";
    if (act === "/parts" && req.method === "POST") {        // signed PUT URLs for a batch of part numbers
      if (s.status !== "uploading") return json(res, 409, { error: "upload already finished" });
      const nums = ((await readBody(req)).parts || []).map(Number).filter((n) => n >= 1 && n <= 10000).slice(0, 50);
      const urls = {};
      for (const n of nums) urls[n] = await signPart(s.key, s.upload_id, n);
      return json(res, 200, { urls });
    }
    if (act === "/complete" && req.method === "POST") {
      if (s.status === "ready") return json(res, 200, { ok: true });
      const bytes = await completeMultipart(s.key, s.upload_id);
      if (bytes && bytes !== Number(s.size)) console.warn(`source ${s.id}: got ${bytes} bytes, expected ${s.size}`);
      await db.query(`update sources set status = 'ready', upload_id = null where id = $1`, [s.id]);
      await queueSourceTranscript({ ...s, status: "ready" });    // one mic = one speaker: label every word with this source
      return json(res, 200, { ok: true, bytes });
    }
    if (act === "/file" && req.method === "GET") {           // preview / download: presigned GET, 1 h
      if (s.status !== "ready") return json(res, 409, { error: "still uploading" });
      res.writeHead(302, { Location: await signGet(s.key), "Cache-Control": "no-store" });
      return res.end();
    }
    if (act === "/transcribe" && req.method === "POST") {
      if (s.status !== "ready") return json(res, 409, { error: "still uploading" });
      await queueSourceTranscript(s);
      return json(res, 200, { ok: true });
    }
    if (act === "/transcript" && req.method === "GET") return json(res, 200, s.transcript || { speakers: [], words: [] });
    if (act === "" && req.method === "PATCH") {
      const label = (await readBody(req)).label?.trim()?.slice(0, 120);
      if (label) await db.query(`update sources set label = $2 where id = $1`, [s.id, label]);
      return json(res, 200, { ok: true });
    }
    if (act === "" && req.method === "DELETE") {
      await removeSource(s);
      return json(res, 200, { ok: true });
    }
  }
  if ((m = p.match(/^\/api\/projects\/([\w-]+)\/share$/)) && req.method === "POST") {
    const b = await readBody(req);
    const cur = await bySlug(m[1]); if (!cur) return json(res, 404, { error: "no such project" });
    const on = b.rotate ? true : !!b.on;
    const token = b.rotate || !cur.share_token ? newToken() : cur.share_token;
    await db.query(`update projects set share_on = $2, share_token = $3 where slug = $1`, [m[1], on, token]);
    return json(res, 200, { share_on: on, share: on ? `/public/${token}` : null });
  }
  if ((m = p.match(/^\/api\/projects\/([\w-]+)$/)) && req.method === "PATCH") {
    const b = await readBody(req);
    await db.query(`update projects set title = coalesce($2, title), chapters = coalesce($3, chapters),
      inserts = coalesce($4, inserts), updated_at = now() where slug = $1`,
      [m[1], b.title?.trim()?.slice(0, 200) || null, Array.isArray(b.chapters) ? JSON.stringify(b.chapters) : null,
       Array.isArray(b.inserts) ? JSON.stringify(b.inserts) : null]);
    return json(res, 200, { ok: true });
  }
  if ((m = p.match(/^\/api\/projects\/([\w-]+)$/)) && req.method === "DELETE") {
    const cur = await bySlug(m[1]); if (!cur) return json(res, 404, { error: "no such project" });
    await db.query(`delete from comments where asset = $1`, [cur.slug]);
    await db.query(`delete from cuts where asset = $1`, [cur.slug]);
    // storage: every version, every rendered chunk, the sources and the audio made from them
    const keys = await projectKeys(cur).catch((e) => { console.warn(`project ${cur.slug} storage keys: ${e.message}`); return []; });
    for (const s of (await db.query(`select * from sources where project = $1`, [cur.slug])).rows) await removeSource(s);
    await db.query(`delete from chunk_cache where project = $1`, [cur.slug]);
    await db.query(`delete from projects where slug = $1`, [cur.slug]);
    cache.delete(cur.slug);
    return json(res, 200, { ok: true, removed: await delKeys(keys) });
  }
  return null;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;
  const t0 = Date.now();
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.on("finish", () => { if (p !== "/health") console.log(`${req.method} ${p.replace(/^\/public\/[^/]+/, "/public/…")} ${res.statusCode} ${Date.now() - t0}ms`); });
  try {
    if (p === "/health") return res.end("ok");
    // The gateway opens /public/ and /agent/ without a login, by the path as it was sent. A path that reads
    // differently once it is normalized ("/public/../api/projects", "/agent\..\api", "//x/api") gets no route here.
    if (req.url.startsWith("/") && req.url.split("?")[0] !== p) return json(res, 404, { error: "not found" });
    if (p === "/" || p.startsWith("/p/") || p.startsWith("/api/")) setSite(req);   // private pages: the gateway has checked the login
    if (p === "/agent" || p.startsWith("/agent/")) return await agentRoute(req, res, p, readBody);   // bearer token, see agent.mjs
    let m;
    if ((m = p.match(/^\/public\/([\w-]{16,64})(\/.*)?$/))) {
      const proj = await byToken(m[1]);
      if (!proj) return json(res, 404, { error: "This share link is off or does not exist. Ask the owner for a new link." });
      return await projectRoute(req, res, u, proj, m[2] || "", `/public/${m[1]}`, true);
    }
    if (p.startsWith("/public/")) return json(res, 404, { error: "not found" });
    if ((m = p.match(/^\/p\/([\w-]+)(\/.*)?$/))) {
      const proj = await bySlug(m[1]);
      if (!proj) return json(res, 404, { error: "no such project" });
      return await projectRoute(req, res, u, proj, m[2] || "", `/p/${m[1]}`, false);
    }
    if ((await adminRoute(req, res, p)) !== null) return;
    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, "0.0.0.0", () => console.log(`review on ${PORT}`));
