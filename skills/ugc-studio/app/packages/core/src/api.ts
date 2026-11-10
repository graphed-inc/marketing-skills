import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { q, one, pool, retryVideo } from "./db/sql";
import { startWorker, seed, addScripts, workerStats } from "./worker";
import { transcribe, cloneVoice, TX, WORK } from "./render";
import * as store from "./storage";
import { spoken } from "./media";
import { clean } from "./writer";
import { plan, createVideos } from "./plan";
import { calibration, progress } from "./eta";
import { avatarLinks, videoLinks, makeThumb } from "./links";
import { heavy } from "./worker";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.code = status;
  }
  code: number;
}

const bad = (msg: string) => { throw new HttpError(400, msg); };
const need = <T>(v: T, msg?: string): T => { if (!v) throw new HttpError(404, msg || "not found"); return v; };

type Handler = (body: any, params: Record<string, string>, query: Record<string, string>, headers: Headers) => Promise<unknown>;
const routes: { method: string; re: RegExp; keys: string[]; fn: Handler }[] = [];
function route(method: string, pattern: string, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, fn });
}

function dataUrl(s: unknown, kinds: string[]) {
  const m = String(s || "").match(/^data:([\w/+.-]+);base64,(.+)$/s);
  if (!m || !kinds.some((k) => m[1].includes(k))) return null;
  return { type: m[1], buf: Buffer.from(m[2], "base64") };
}

const withAvatarLinks = async (rows: any[]) => Promise.all(rows.map(async (a) => {
  const { image_key, thumb_key, ...rest } = a;
  return { ...rest, ...(await avatarLinks(a)) };
}));

route("GET", "/api/state", async () => ({
  avatars: await withAvatarLinks(await q("SELECT id, name, persona, tags, voice, archived, image_key, thumb_key FROM avatars WHERE NOT archived ORDER BY id")),
  voices: await q("SELECT id, name, voice_id, status, error, updated_at, ref_key IS NOT NULL AS has_ref FROM voices ORDER BY id"),
  worker: workerStats(),
  counts: await one(`SELECT count(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
    count(*) FILTER (WHERE status = 'done')::int AS done, count(*)::int AS videos,
    (SELECT count(*)::int FROM scripts) AS scripts FROM videos`),
}));

route("POST", "/api/avatars", async (b) => {
  if (!String(b.name || "").trim()) bad("name is required");
  const img = dataUrl(b.image, ["jpeg", "jpg", "png"]) || bad("a .jpg or .png image is required");
  const key = `avatars/${randomUUID()}.${img.type.includes("png") ? "png" : "jpg"}`;
  await store.putBuffer(key, img.buf, img.type);
  const tags = Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
  const a = await one(`INSERT INTO avatars (name, persona, tags, voice, image_key) VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING id, name`,
    [b.name.trim(), b.persona || "", JSON.stringify(tags), b.voice || "default", key]);
  await makeThumb(a.id, key, heavy).catch((e: any) => console.error("thumb:", e.message));
  return a;
});

route("PATCH", "/api/avatars/:id", async (b, { id }) => {
  const a = need(await one("SELECT * FROM avatars WHERE id = $1", [id]));
  const tags = b.tags === undefined ? a.tags : Array.isArray(b.tags) ? b.tags : String(b.tags).split(",").map((t: string) => t.trim()).filter(Boolean);
  await pool.query("UPDATE avatars SET name=$2, persona=$3, tags=$4::jsonb, voice=$5, archived=$6 WHERE id=$1",
    [id, b.name ?? a.name, b.persona ?? a.persona, JSON.stringify(tags), b.voice ?? a.voice, b.archived ?? a.archived]);
  return { ok: true };
});

route("POST", "/api/voices/:id/clone", async (b, { id }) => {
  const v = need(await one("SELECT * FROM voices WHERE id = $1", [id]));
  if (!b.confirm) bad("cloning costs about 172 credits: send confirm: true");
  let refKey = v.ref_key;
  const ref = dataUrl(b.ref, ["audio", "mpeg", "mp3", "wav"]);
  if (ref) { refKey = `voices/${id}/voice-ref-${Date.now()}.${ref.type.includes("wav") ? "wav" : "mp3"}`; await store.putBuffer(refKey, ref.buf, ref.type); }
  if (!refKey) bad("upload a voice sample first");
  await pool.query("UPDATE voices SET status = 'cloning', error = NULL, ref_key = $2, updated_at = now() WHERE id = $1", [id, refKey]);
  cloneVoice({ ...v, ref_key: refKey })
    .then((vid: string) => pool.query("UPDATE voices SET voice_id = $2, status = 'ready', updated_at = now() WHERE id = $1", [id, vid]))
    .catch((e: any) => pool.query("UPDATE voices SET status = 'error', error = $2 WHERE id = $1", [id, String(e.message || e).slice(0, 500)]));
  return { ok: true };
});

route("GET", "/api/projects", async () => q(`SELECT p.id, p.url, p.brand, p.status, p.stage, p.error, p.threads, p.credits, p.created_at,
  (SELECT count(*)::int FROM scripts s WHERE s.project_id = p.id) AS scripts FROM projects p ORDER BY p.id DESC`));

route("POST", "/api/projects", async (b) => {
  const url = String(b.url || "").trim();
  if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(url)) bad("enter a website URL");
  return one("INSERT INTO projects (url, n, styles, avatar_id, board_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [/^https?:\/\//.test(url) ? url : "https://" + url, Math.max(0, Math.min(30, Number(b.n ?? 10))), b.styles || "story,hook", b.avatar_id || null, Number(b.board_id) || null]);
});

route("GET", "/api/projects/:id", async (_, { id }) => ({
  ...need(await one("SELECT * FROM projects WHERE id = $1", [id])),
  scripts: await q("SELECT * FROM scripts WHERE project_id = $1 ORDER BY id", [id]),
}));

route("POST", "/api/projects/:id/scripts", async (b, { id }) => {
  const p = need(await one("SELECT * FROM projects WHERE id = $1", [id]));
  if (!p.product) bad("research is not finished yet");
  addScripts(Number(id), Math.max(1, Math.min(20, Number(b.n || 10))), b.styles || p.styles, b.extra || "")
    .catch((e: any) => pool.query("UPDATE projects SET stage = NULL, error = $2 WHERE id = $1", [id, String(e.message || e).slice(0, 500)]));
  await pool.query("UPDATE projects SET stage = 'writing scripts' WHERE id = $1", [id]);
  return { ok: true };
});

route("POST", "/api/projects/:id/retry", async (_, { id }) => {
  await pool.query("UPDATE projects SET status = 'queued', error = NULL WHERE id = $1 AND status = 'error'", [id]);
  return { ok: true };
});
route("DELETE", "/api/projects/:id", async (_, { id }) => { await pool.query("DELETE FROM projects WHERE id = $1", [id]); return { ok: true }; });

route("GET", "/api/scripts", async () => q(`SELECT s.id, s.text, s.words, s.fits, s.style, s.angle, s.created_at,
    coalesce(s.brand, p.brand) AS brand, s.project_id,
    (SELECT count(*)::int FROM videos v WHERE v.script_id = s.id) AS used
  FROM scripts s LEFT JOIN projects p ON p.id = s.project_id ORDER BY s.id DESC LIMIT 300`));

route("POST", "/api/scripts", async (b) => {
  const text = clean(b.text || "");
  if (!text) bad("script text is required");
  const sp = await spoken(text);
  return one(`INSERT INTO scripts (project_id, style, text, words, fits, brand, angle) VALUES ($1,'pasted',$2,$3,$4,$5,$6) RETURNING *`,
    [b.project_id || null, text, sp.words, sp.words <= 105, b.brand || null, b.angle || ""]);
});
route("PATCH", "/api/scripts/:id", async (b, { id }) => {
  const text = clean(b.text || "");
  if (!text) bad("script text is required");
  const sp = await spoken(text);
  return one("UPDATE scripts SET text = $2, words = $3, fits = $4 WHERE id = $1 RETURNING *", [id, text, sp.words, sp.words <= 105]);
});
route("DELETE", "/api/scripts/:id", async (_, { id }) => { await pool.query("DELETE FROM scripts WHERE id = $1", [id]); return { ok: true }; });

route("POST", "/api/estimate", async (b) => plan(b));

route("POST", "/api/videos", async (b) => {
  if (b.confirm !== true) bad("rendering spends credits: send confirm: true after the person approves the cost");
  return createVideos(b);
});

const VIDEO_COLS = `v.id, v.batch, v.board_id, v.title, v.script_id, v.script, v.brand, v.avatar_id, a.name AS avatar, v.engine, v.status, v.stage,
  v.words, v.secs, v.est_credits, v.credits, v.keys, v.report, v.steps, v.error, v.attempt, v.created_at, v.started_at, v.finished_at`;
const withEta = async (rows: any[]) => {
  const cal = await calibration();
  return Promise.all(rows.map(async (v) => {
    const { keys, steps, avatar_image_key, avatar_thumb_key, ...rest } = v;
    return { ...rest, progress: progress(v, cal), ...(await videoLinks(v)) };
  }));
};
const VIDEO_FROM = `${VIDEO_COLS}, a.image_key AS avatar_image_key, a.thumb_key AS avatar_thumb_key FROM videos v LEFT JOIN avatars a ON a.id = v.avatar_id`;
route("GET", "/api/videos", async (_, __, query) => withEta(await q(`SELECT ${VIDEO_FROM}
  ${query.batch ? "WHERE v.batch = $1" : ""} ORDER BY v.id DESC LIMIT ${Math.min(5000, Number(query.limit) || 2000)}`, query.batch ? [query.batch] : [])));
route("GET", "/api/videos/:id", async (_, { id }) => (await withEta([need(await one(`SELECT ${VIDEO_FROM.replace(" FROM", ", v.log FROM")} WHERE v.id = $1`, [id]))]))[0]);

const ids = (x: unknown) => [...new Set((Array.isArray(x) ? x : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
route("GET", "/api/boards", async () => q(`SELECT b.id, b.name, jsonb_array_length(b.script_ids)::int AS scripts,
  jsonb_array_length(b.avatar_ids)::int AS avatars, b.updated_at FROM boards b ORDER BY b.id`));
route("POST", "/api/boards", async (b) => one("INSERT INTO boards (name, script_ids, avatar_ids) VALUES ($1, $2::jsonb, $3::jsonb) RETURNING id, name",
  [String(b.name || "").trim() || "Untitled board", JSON.stringify(ids(b.script_ids)), JSON.stringify(ids(b.avatar_ids))]));
route("PATCH", "/api/boards/:id", async (b, { id }) => {
  const x = need(await one("SELECT id, name FROM boards WHERE id = $1", [id]));
  const sets = ["updated_at = now()"], params: unknown[] = [id];
  if (b.name !== undefined) { params.push(String(b.name).trim() || x.name); sets.push(`name = $${params.length}`); }
  if (b.script_ids !== undefined) { params.push(JSON.stringify(ids(b.script_ids))); sets.push(`script_ids = $${params.length}::jsonb`); }
  if (b.avatar_ids !== undefined) { params.push(JSON.stringify(ids(b.avatar_ids))); sets.push(`avatar_ids = $${params.length}::jsonb`); }
  if (sets.length > 1) await pool.query(`UPDATE boards SET ${sets.join(", ")} WHERE id = $1`, params);
  return { ok: true };
});
route("DELETE", "/api/boards/:id", async (_, { id }) => { await pool.query("DELETE FROM boards WHERE id = $1", [id]); return { ok: true }; });
route("POST", "/api/boards/:id/scripts", async (b, { id }) => {
  const before = need(await one("SELECT script_ids FROM boards WHERE id = $1", [id]));
  const add = ids(b.script_ids);
  for (const t of (Array.isArray(b.texts) ? b.texts : []).map((t: string) => clean(t || "")).filter(Boolean)) {
    const sp = await spoken(t);
    add.push((await one(`INSERT INTO scripts (style, text, words, fits, brand) VALUES ('pasted',$1,$2,$3,$4) RETURNING id`,
      [t, sp.words, sp.words <= 105, b.brand || null])).id);
  }
  const row = await one(`UPDATE boards AS b SET script_ids = (
      SELECT coalesce(jsonb_agg(to_jsonb(id) ORDER BY ord), '[]'::jsonb) FROM (
        SELECT id, min(ord) AS ord FROM (
          SELECT elem::int AS id, ord::int AS ord
          FROM jsonb_array_elements_text(b.script_ids) WITH ORDINALITY AS t(elem, ord)
          UNION ALL
          SELECT elem::int, (1000000 + ord)::int
          FROM jsonb_array_elements_text($2::jsonb) WITH ORDINALITY AS u(elem, ord)
        ) s WHERE id > 0 GROUP BY id
      ) d
    ), updated_at = now() WHERE b.id = $1 RETURNING script_ids`, [id, JSON.stringify(add)]);
  return { ok: true, added: ids(row.script_ids).length - ids(before.script_ids).length };
});
route("GET", "/api/boards/:id", async (_, { id }) => {
  const x = need(await one("SELECT * FROM boards WHERE id = $1", [id]));
  const sids = ids(x.script_ids), aids = ids(x.avatar_ids);
  const sm = new Map((await q(`SELECT s.id, s.text, s.words, s.fits, s.angle, coalesce(s.brand, p.brand) AS brand FROM scripts s
    LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ANY($1)`, [sids])).map((r) => [r.id, r]));
  const am = new Map((await withAvatarLinks(await q("SELECT id, name, persona, archived, image_key, thumb_key FROM avatars WHERE id = ANY($1)", [aids]))).map((r) => [r.id, r]));
  const scripts = sids.filter((i) => sm.has(i)).map((i) => sm.get(i));
  const avatars = aids.filter((i) => am.has(i)).map((i) => am.get(i));
  const cells = scripts.length && avatars.length ? await withEta(await q(`SELECT DISTINCT ON (v.script_id, v.avatar_id) ${VIDEO_FROM}
    WHERE v.script_id = ANY($1) AND v.avatar_id = ANY($2) ORDER BY v.script_id, v.avatar_id, v.id DESC`, [scripts.map((s: any) => s.id), avatars.map((a: any) => a.id)])) : [];
  const research = await q("SELECT id, url, brand, status, stage, error FROM projects WHERE board_id = $1 AND (status IN ('queued','running') OR (status = 'error' AND created_at > now() - interval '1 day')) ORDER BY id", [id]);
  return { id: x.id, name: x.name, scripts, avatars, cells, research };
});

route("POST", "/api/videos/:id/retry", async (_, { id }) => {
  const r = await retryVideo(id);
  if (r.held) throw new HttpError(409, "this clip is still stopping; try again in a moment");
  return { ok: true };
});
route("POST", "/api/videos/:id/rerender", async (b, { id }) => {
  if (b.confirm !== true) bad("a new take costs a full render: send confirm: true");
  const v = need(await one("SELECT keys FROM videos WHERE id = $1", [id]));
  const keys = { voice: v.keys.voice };
  const row = await one(`UPDATE videos SET status = 'queued', error = NULL, keys = $2::jsonb, report = '{}'::jsonb,
    attempt = attempt + 1, finished_at = NULL WHERE id = $1 AND status IN ('done','bad_take','error','canceled') AND holder IS NULL RETURNING id`,
    [id, JSON.stringify(keys)]);
  if (!row) {
    const cur = await one("SELECT holder IS NOT NULL AS held FROM videos WHERE id = $1", [id]);
    if (cur && cur.held) throw new HttpError(409, "this clip is still rendering");
  }
  return { ok: true };
});
route("POST", "/api/videos/:id/cancel", async (_, { id }) => {
  await pool.query("UPDATE videos SET status = 'canceled', stage = NULL WHERE id = $1 AND status IN ('queued','running')", [id]);
  return { ok: true };
});
route("DELETE", "/api/videos/:id", async (_, { id }) => { await pool.query("DELETE FROM videos WHERE id = $1 AND status <> 'running'", [id]); return { ok: true }; });

route("POST", "/internal/transcribe", async (b, _, __, headers) => {
  if (headers.get("x-tx-token") !== TX.token) throw new HttpError(403, "forbidden");
  const p = resolve(String(b.path || ""));
  if (!p.startsWith(resolve(WORK)) && !p.startsWith("/tmp/")) bad("path outside the work dir");
  return transcribe(p);
});

route("GET", "/health", async () => ({ ok: true }));
route("GET", "/api/health", async () => ({ ok: true }));

function statusOf(e: any): number {
  if (e instanceof HttpError) return e.status;
  if (e && Number.isInteger(e.code)) return e.code;
  return 500;
}

export async function handleApi(method: string, url: URL, body: unknown, headers: Headers = new Headers()): Promise<Response> {
  try {
    for (const r of routes) {
      if (r.method !== method) continue;
      const mm = url.pathname.match(r.re);
      if (!mm) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(mm[i + 1] || "")]));
      const out = await r.fn(body ?? {}, params, Object.fromEntries(url.searchParams), headers);
      return Response.json(out ?? {}, { headers: { "cache-control": "no-store" } });
    }
    throw new HttpError(404, "not found");
  } catch (e: any) {
    const code = statusOf(e);
    if (code === 500) console.error(method, url.pathname, e);
    return Response.json({ error: String(e?.message || e) }, { status: code });
  }
}

export async function fileResponse(key: string, downloadName: string | null): Promise<Response> {
  if (key.includes("..")) return Response.json({ error: "bad key" }, { status: 400 });
  const file = store.readLocal(key);
  if (!file) return Response.json({ error: "not found" }, { status: 404 });
  const headers: Record<string, string> = { "content-type": file.type, "content-length": String(file.size) };
  if (downloadName) headers["content-disposition"] = `attachment; filename="${downloadName.replace(/[^\w.-]+/g, "-")}"`;
  return new Response(Readable.toWeb(createReadStream(file.path)) as ReadableStream, { headers });
}

export async function mediaResponse(pathname: string): Promise<Response | null> {
  let m: RegExpMatchArray | null;
  if ((m = pathname.match(/^\/media\/avatar\/(\d+)$/))) {
    const a = need(await one("SELECT image_key FROM avatars WHERE id = $1", [m[1]]));
    return redirectOrFile(a.image_key);
  }
  if ((m = pathname.match(/^\/media\/video\/(\d+)\/(final|raw|fixed|voice)$/))) {
    const v = need(await one("SELECT keys FROM videos WHERE id = $1", [m[1]]));
    return redirectOrFile(v.keys?.[m[2]]);
  }
  return null;
}

async function redirectOrFile(key: string | undefined): Promise<Response> {
  if (!key) return Response.json({ error: "not ready" }, { status: 404 });
  if (!store.isCloud()) return fileResponse(key, null);
  return new Response(null, { status: 302, headers: { location: await store.url(key, 3600), "cache-control": "private, max-age=300" } });
}

export { seed, startWorker };
