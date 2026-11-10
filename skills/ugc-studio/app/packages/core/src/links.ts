// @ts-nocheck
// Browser links. Every image and video the page loads comes straight from project storage on api.graphed.com
// with a presigned URL; the app server never streams media bytes (0.5 CPU / 512 MB container).
// Locally (no cloud storage) the links point at /files/<key>, served from ./.data/storage.
// Signing is local HMAC (no network). The gateway refuses links that live longer than 1 hour ("Invalid presigned
// URL expiration", 403, Nov 2026), so links live 1 h and are reused for 40 min: a page that polls gets the same URL
// (browser cache keeps working) and every link it holds is good for 20+ min. Pages reload their lists every 10 min.
// The gateway ignores response-content-disposition, so downloads are fetched by the page (CORS *) and saved as
// `file` (see the studio player's download()).
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { pool, q } from "./db/sql";
import * as store from "./storage";
import { ffmpeg } from "./media";

import { coreEnv } from "./config";

const WORK = coreEnv().WORK_DIR || "/tmp/ugc-work";

const LIFE = 3600, REUSE = 40 * 60_000;
const cache = new Map();

export async function link(key, filename = null) {
  if (!key) return null;
  if (!store.isCloud()) return `/files/${key.split("/").map(encodeURIComponent).join("/")}${filename ? `?dl=${encodeURIComponent(filename)}` : ""}`;
  const ck = filename ? `${key}|${filename}` : key;
  const c = cache.get(ck);
  if (c && c.exp > Date.now()) return c.url;
  const url = await store.url(key, LIFE, filename);
  if (cache.size > 20000) cache.clear();
  cache.set(ck, { url, exp: Date.now() + REUSE });
  return url;
}

// Avatar row → { img, thumb } links (thumb falls back to the full photo until it exists).
export async function avatarLinks(a) {
  const img = await link(a.image_key);
  return { img, thumb: a.thumb_key ? await link(a.thumb_key) : img };
}

// Video row → { url (play + download), file (download name), poster, avatar_thumb }.
export async function videoLinks(v) {
  const k = v.keys || {};
  const name = `${String(v.avatar || "ugc").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${v.id}.mp4`;
  return {
    url: await link(k.final), file: name, poster: await link(k.poster),
    avatar_thumb: await link(v.avatar_thumb_key || v.avatar_image_key),
  };
}

// ---------- small JPEGs for the grids ----------
// One frame (from a local path or a presigned URL; ffmpeg reads only the bytes it needs) → 360 px wide JPEG.
export async function frame(src, out, at = 0) {
  mkdirSync(WORK, { recursive: true });
  await ffmpeg([...(at ? ["-ss", String(at)] : []), "-i", src, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", out]);
  return out;
}

// Avatar thumb: 360 px JPEG next to the photo.
export async function makeThumb(avatarId, imageKey, heavy) {
  const src = store.isCloud() ? await store.url(imageKey, 3600) : store.localPath(imageKey)?.path;
  if (!src) return null;
  const key = imageKey.replace(/\.(jpe?g|png)$/i, "") + "-thumb.jpg";
  const out = join(WORK, `thumb-a${avatarId}-${Date.now()}.jpg`);
  await heavy(() => frame(src, out));
  await store.putFile(key, out, "image/jpeg");
  rmSync(out, { force: true });
  await pool.query("UPDATE avatars SET thumb_key = $2 WHERE id = $1", [avatarId, key]);
  return key;
}

// Video poster: frame at 0.5 s of the final.
export async function makePoster(videoId, finalKey, heavy, localFile = null) {
  const src = localFile || (store.isCloud() ? await store.url(finalKey, 3600) : store.localPath(finalKey)?.path);
  if (!src) return null;
  const key = `videos/${videoId}/poster.jpg`;
  const out = join(WORK, `poster-v${videoId}-${Date.now()}.jpg`);
  await heavy(() => frame(src, out, 0.5));
  await store.putFile(key, out, "image/jpeg");
  rmSync(out, { force: true });
  await pool.query("UPDATE videos SET keys = keys || jsonb_build_object('poster', $2::text) WHERE id = $1", [videoId, key]);
  return key;
}

// Boot: make the thumbs + posters that are missing (older rows), one at a time, never failing the server.
export async function backfill(heavy) {
  for (const a of await q("SELECT id, image_key FROM avatars WHERE thumb_key IS NULL ORDER BY id"))
    await makeThumb(a.id, a.image_key, heavy).catch((e) => console.error(`thumb a${a.id}:`, e.message));
  for (const v of await q(`SELECT id, keys->>'final' AS final FROM videos WHERE keys ? 'final' AND NOT keys ? 'poster' ORDER BY id DESC`))
    await makePoster(v.id, v.final, heavy).catch((e) => console.error(`poster v${v.id}:`, e.message));
}
