// @ts-nocheck
// Background worker. Two queues in Postgres:
//   projects  website → research → scripts (2 at a time)
//   videos    script x avatar → MP4 (VIDEO_LANES at a time, default 10; the paid steps are remote waits)
// Heavy local work (ffmpeg, the python word fixer) runs one at a time: the container has
// half a CPU and 512 MB. A job whose heartbeat goes stale (worker restart) is queued again and resumes
// from its saved files; paid tool calls replay for free through their idempotency keys.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pool, q, one, setProject, setVideo, logVideo } from "./db/sql";
import { semaphore, sleep } from "./tools";
import * as store from "./storage";
import { renderVideo, BAD_TAKE } from "./render";
import { fetchSite, product as productBrief, reddit, insights as findInsights } from "./research";
import { writeScripts } from "./writer";
import { APP } from "./media";
import { backfill, makeThumb } from "./links";
import { coreEnv } from "./config";

const VIDEO_LANES = Number(coreEnv().VIDEO_LANES || 10);
const PROJECT_LANES = 2;
export const heavy = semaphore(Number(coreEnv().HEAVY_LANES || 1));
let stop = false, started = false;
const active = { videos: 0, projects: 0 };

// ---------- research project ----------
export async function processProject(p) {
  const beat = setInterval(() => pool.query("UPDATE projects SET heartbeat_at = now() WHERE id = $1", [p.id]).catch(() => {}), 60_000);
  try {
    let prod = p.product, credits = p.credits || 0;
    if (!prod) {
      await setProject(p.id, { stage: "reading the website" });
      const site = await fetchSite(p.url);
      const r = await productBrief(p.url, site);
      prod = r.data; credits += r.credits;
      await setProject(p.id, { product: prod, brand: prod.brand, credits });
    }
    let corpusKey = `projects/${p.id}/corpus.md`, threads = p.threads;
    if (!(await store.exists(corpusKey))) {
      await setProject(p.id, { stage: `searching Reddit (${(prod.queries || []).length} searches)` });
      const r = await reddit(prod.queries || [], { key: `ugc-p${p.id}` });
      await store.putBuffer(corpusKey, Buffer.from(r.corpus), "text/markdown");
      threads = r.threads; credits += r.calls * 0.22;
      await setProject(p.id, { threads, credits });
    }
    let ins = p.insights;
    if (!ins) {
      await setProject(p.id, { stage: `finding pains + desired outcomes in ${threads} threads` });
      const tmp = join("/tmp", `corpus-${p.id}.md`);
      await store.getFile(corpusKey, tmp);
      const r = await findInsights(p.url, prod, readFileSync(tmp, "utf8"));
      ins = r.data; credits += r.credits;
      await setProject(p.id, { insights: ins, credits });
    }
    const have = await one("SELECT count(*)::int n FROM scripts WHERE project_id = $1", [p.id]);
    if (p.n > 0 && have.n === 0) await addScripts(p.id, p.n, p.styles);
    await setProject(p.id, { status: "done", stage: null, error: null });
  } catch (e) {
    await setProject(p.id, { status: "error", stage: null, error: String(e.message || e).slice(0, 1000) });
  } finally { clearInterval(beat); }
}

export async function addScripts(projectId, n, styles, extra = "") {
  const p = await one("SELECT * FROM projects WHERE id = $1", [projectId]);
  await setProject(projectId, { stage: `writing ${n} scripts` });
  const av = p.avatar_id ? await one("SELECT persona FROM avatars WHERE id = $1", [p.avatar_id]) : null;
  const avoid = (await q("SELECT text FROM scripts WHERE project_id = $1", [projectId])).map((s) => s.text.split(".")[0]);
  const r = await writeScripts({ url: p.url, product: p.product, insights: p.insights, n, styles, speaker: av && av.persona, extra, avoid });
  const ids = [];
  for (const s of r.scripts) {
    ids.push((await one(`INSERT INTO scripts (project_id, style, angle, pain, persona, text, words, fits, claims, brand)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING id`, [projectId, s.style, s.angle, s.pain, s.persona, s.text, s.words, s.fits, JSON.stringify(s.claims), p.brand])).id);
  }
  // Research started from a board: the new scripts become rows on that board.
  if (p.board_id && ids.length) await pool.query("UPDATE boards SET script_ids = script_ids || $2::jsonb, updated_at = now() WHERE id = $1", [p.board_id, JSON.stringify(ids)]);
  await pool.query("UPDATE projects SET credits = credits + $2, stage = NULL WHERE id = $1", [projectId, r.credits]);
  return r.scripts.length;
}

// ---------- video ----------
async function processVideo(v) {
  const holder = randomUUID();
  const beat = setInterval(() => pool.query("UPDATE videos SET heartbeat_at = now() WHERE id = $1", [v.id]).catch(() => {}), 60_000);
  let took = false;
  try {
    // Cancel may have landed between claim and here. Leave the row alone in that case.
    const owned = await one("UPDATE videos SET holder = $2 WHERE id = $1 AND status = 'running' RETURNING id", [v.id, holder]);
    if (!owned) { await logVideo(v.id, "stopped before start"); return; }
    took = true;
    await logVideo(v.id, `start (attempt ${v.attempt}, ${v.engine})`);
    await renderVideo(v, { heavy, holder });
    const fin = await one("SELECT status, report, holder FROM videos WHERE id = $1", [v.id]);
    const pct = (fin && fin.report && fin.report.wrong_pct) || 0;
    if (fin && fin.holder === holder && fin.status === "running") {
      await setVideo(v.id, pct > BAD_TAKE
        ? { status: "bad_take", stage: null, finished_at: new Date().toISOString(), error: `Take failed: words are wrong (${Math.round(pct * 100)}% of the script)` }
        : { status: "done", stage: null, finished_at: new Date().toISOString(), error: null });
      await logVideo(v.id, "done");
    }
  } catch (e) {
    const fin = await one("SELECT status, holder FROM videos WHERE id = $1", [v.id]);
    if (!fin || fin.holder !== holder) { await logVideo(v.id, "stopped"); return; }
    if (e.canceled || fin.status === "canceled") {
      if (fin.status === "running") await setVideo(v.id, { status: "canceled", stage: null });
      await logVideo(v.id, "canceled");
      return;
    }
    const msg = String(e.message || e);
    await setVideo(v.id, { status: "error", stage: null, error: msg.slice(0, 1000) });
    await logVideo(v.id, "error: " + msg.slice(0, 1500));
  } finally {
    clearInterval(beat);
    if (took) await pool.query("UPDATE videos SET holder = NULL WHERE id = $1 AND holder = $2", [v.id, holder]);
  }
}

async function claim(table, n) {
  if (n <= 0) return [];
  return q(`UPDATE ${table} SET status = 'running', heartbeat_at = now()${table === "videos" ? ", started_at = coalesce(started_at, now())" : ""}
    WHERE id IN (SELECT id FROM ${table} WHERE status = 'queued' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [n]);
}

async function loop() {
  let lastStale = 0;
  while (!stop) {
    try {
      if (Date.now() - lastStale > 60_000) {
        lastStale = Date.now();
        await pool.query("UPDATE videos SET status = 'queued', holder = NULL WHERE status = 'running' AND heartbeat_at < now() - interval '5 minutes'");
        await releaseFinishedHolders({ stale: true });
        await pool.query("UPDATE projects SET status = 'queued' WHERE status = 'running' AND heartbeat_at < now() - interval '5 minutes'");
      }
      for (const v of await claim("videos", VIDEO_LANES - active.videos)) {
        active.videos++;
        processVideo(v).finally(() => { active.videos--; });
      }
      for (const p of await claim("projects", PROJECT_LANES - active.projects)) {
        active.projects++;
        processProject(p).finally(() => { active.projects--; });
      }
      await sleep(1500);
    } catch (e) {
      console.error("worker:", e && e.message);
      await sleep(5000);
    }
  }
}

export function startWorker() {
  if (started) return;
  started = true; stop = false;
  // Anything "running" when this process started belongs to a dead process: queue it again now.
  // A crash after cancel or finish can leave holder set. Clear those without queueing them.
  pool.query("UPDATE videos SET status = 'queued', holder = NULL WHERE status = 'running'")
    .then(() => releaseFinishedHolders({ stale: false }))
    .then(() => pool.query("UPDATE projects SET status = 'queued' WHERE status = 'running'"))
    .finally(loop);
  // Small JPEGs for older avatars + videos (one at a time, after the seed has had a head start).
  setTimeout(() => backfill(heavy).catch((e) => console.error("backfill:", e && e.message)), 20_000);
}
export function stopWorker() { stop = true; }

// A finished clip (canceled, done, bad take, error) should not keep a holder. Retry and a new
// take both refuse while holder is set. A live worker heartbeats every minute, so the sweep
// waits until that heartbeat is 5 minutes old. Boot passes stale=false: this process just
// started, so every holder belongs to a dead process. Neither path queues the clip again.
const FINISHED = "('canceled', 'done', 'bad_take', 'error')";
export async function releaseFinishedHolders({ stale = true } = {}) {
  const age = stale ? " AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '5 minutes')" : "";
  await pool.query(`UPDATE videos SET holder = NULL WHERE holder IS NOT NULL AND status IN ${FINISHED}${age}`);
}
export const workerStats = () => ({ ...active });

// ---------- boot: built-in avatars + the shared voice ----------
export const SEED_VOICE_ID = "Voice3f1a8bc91792169825";
export async function seed() {
  const v = await one("SELECT count(*)::int n FROM voices");
  if (!v.n) {
    const ref = join(APP, "seed", "voice-ref.mp3");
    const key = existsSync(ref) ? await store.putFile("voices/default/voice-ref.mp3", ref) : null;
    await pool.query("INSERT INTO voices (id, name, voice_id, ref_key) VALUES ('default', 'Default voice', $1, $2) ON CONFLICT DO NOTHING", [SEED_VOICE_ID, key]);
  }
  // Built-in avatars: app/seed/avatars/<slug>/avatar.jpg + avatar.json. Each is added once, so a new folder shows up
  // on the next deploy and an avatar someone removed stays removed. avatar.json "version" (default 1) is part of the
  // image key: a higher version swaps the photo on the SAME avatar row (id, name, render history stay).
  const dir = join(APP, "seed", "avatars");
  const slugs = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, "avatar.jpg"))).sort() : [];
  for (const slug of slugs) {
    const meta = JSON.parse(readFileSync(join(dir, slug, "avatar.json"), "utf8"));
    const ver = Number(meta.version || 1);
    const key = ver > 1 ? `avatars/seed-${slug}-v${ver}.jpg` : `avatars/seed-${slug}.jpg`;
    if (await one("SELECT id FROM avatars WHERE image_key = $1", [key])) continue;
    const any = `^avatars/seed-${slug.replace(/[^a-z0-9-]/g, "")}(-v[0-9]+)?\\.jpg$`;  // this slug's older versions only
    const old = await one("SELECT id FROM avatars WHERE image_key ~ $1 ORDER BY id LIMIT 1", [any]);
    await store.putFile(key, join(dir, slug, "avatar.jpg"));
    let id;
    if (old) { id = old.id; await pool.query("UPDATE avatars SET image_key = $2, persona = $3, tags = $4::jsonb, thumb_key = NULL WHERE id = $1",
      [old.id, key, meta.persona || "", JSON.stringify(meta.tags || [])]); }
    else id = (await one(`INSERT INTO avatars (name, persona, tags, voice, image_key) VALUES ($1,$2,$3::jsonb,'default',$4) RETURNING id`,
      [meta.name, meta.persona || "", JSON.stringify(meta.tags || []), key])).id;
    await makeThumb(id, key, heavy).catch((e) => console.error(`thumb ${slug}:`, e.message));
  }
  // The first test avatar (Maria, Oct 2026) is the same look as 01-latina-wavy: hide it, keep its videos.
  await pool.query("UPDATE avatars SET archived = true WHERE image_key = 'avatars/seed-maria.jpg'");
  // First board: everything rendered so far, so the grid is not empty on the first visit.
  if (!(await one("SELECT count(*)::int n FROM boards")).n) {
    const s = await q("SELECT script_id FROM videos WHERE script_id IS NOT NULL GROUP BY script_id ORDER BY min(id)");
    const a = await q("SELECT avatar_id FROM videos GROUP BY avatar_id ORDER BY min(id)");
    await pool.query("INSERT INTO boards (name, script_ids, avatar_ids) VALUES ($1, $2::jsonb, $3::jsonb)",
      [s.length ? "First board" : "My first board", JSON.stringify(s.map((r) => r.script_id)), JSON.stringify(a.map((r) => r.avatar_id))]);
  }
}
