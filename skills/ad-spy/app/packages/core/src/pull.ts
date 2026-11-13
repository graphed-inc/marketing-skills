// @ts-nocheck
// Pull a brand's ads from every connected ad library, store new creatives in object storage,
// save rows in Postgres and queue each new ad for Gemini analysis.
import { q, one, pool } from "./db/sql";
import { PLATFORMS, normalizeFacebook, normalizeGoogle, normalizeLinkedin } from "./sources";
import { copyUrl } from "./storage";
import { lanes } from "./tools";

const GEMINI_INLINE_MAX = 14 * 1024 * 1024; // base64 grows ×1.33; Gemini (AI Studio) caps a request at 20 MB

async function storeMedia(ad, { timeoutMs } = {}) {
  const base = `ads/${ad.platform}/${ad.external_id}`;
  const out = [];
  let storageFailed = false;
  await lanes((ad.media || []).map((m, i) => [m, i]), 3, async ([m, i]) => {
    try {
      let file = await copyUrl(m.src, `${base}/${i}`, { timeoutMs });
      if (!file && m.kind === "video" && m.sd && m.sd !== m.src) file = await copyUrl(m.sd, `${base}/${i}`, { timeoutMs });
      if (!file) return; // HTTP error or empty body: the link itself is dead
      const item = { kind: m.kind, key: file.key, type: file.type, bytes: file.bytes };
      if (m.title) item.title = m.title;
      if (m.youtube) item.youtube = m.youtube;
      if (m.kind === "video" && m.poster) {
        const p = await copyUrl(m.poster, `${base}/${i}-poster`, { timeoutMs }).catch(() => null);
        if (p) item.poster = p.key;
      }
      // Gemini takes the video inline (base64); keep a small copy when the HD file is big.
      if (m.kind === "video" && file.bytes > GEMINI_INLINE_MAX && m.sd && m.sd !== m.src) {
        const sd = await copyUrl(m.sd, `${base}/${i}-sd`, { timeoutMs }).catch(() => null);
        if (sd) item.sd = sd.key;
      }
      out[i] = item;
    } catch {
      // Storage or the network threw. Leave the slot empty so the next pull retries it.
      storageFailed = true;
    }
  });
  const media = out.filter(Boolean);
  return { media, incomplete: storageFailed || media.length < expectedFiles(ad) };
}

function expectedFiles(ad) {
  return (ad.media || []).filter((m) => m && m.src).length;
}

const running = new Set();
export const isPulling = (brandId) => running.has(Number(brandId));

// Pull one brand. platforms: subset of facebook|google|linkedin (default: every connected one).
export async function pullBrand(brandId, { platforms, log = () => {} } = {}) {
  brandId = Number(brandId);
  if (running.has(brandId)) return { skipped: "already running" };
  running.add(brandId);
  const summary = {};
  try {
    const brand = await one("SELECT * FROM brands WHERE id = $1", [brandId]);
    if (!brand) throw new Error(`brand ${brandId} not found`);
    for (const [platform, p] of Object.entries(PLATFORMS)) {
      if (platforms && !platforms.includes(platform)) continue;
      if (!p.ready(brand)) continue;
      summary[platform] = await pullPlatform(brand, platform, p, log);
    }
    await pool.query("UPDATE brands SET last_pulled_at = now() WHERE id = $1", [brandId]);
    return summary;
  } finally {
    running.delete(brandId);
  }
}

async function pullPlatform(brand, platform, p, log) {
  const pull = await one("INSERT INTO pulls (brand_id, platform) VALUES ($1, $2) RETURNING id", [brand.id, platform]);
  const known = new Set((await q("SELECT external_id FROM ads WHERE brand_id = $1 AND platform = $2", [brand.id, platform])).map((r) => r.external_id));
  const firstPull = known.size === 0;
  let seen = 0; let added = 0; let credits = 0;
  try {
    // Facebook lists ACTIVE ads only, so read the whole list every day to know which stopped.
    // Google and LinkedIn give dates per ad: stop at the first page with nothing new.
    const stop = platform === "facebook" || firstPull ? null : async (ads) => ads.every((a) => known.has(a.external_id));
    const res = await p.list(brand, { max: brand.max_ads, stop, known });
    credits += res.credits;
    const seenIds = [];
    const fresh = [];
    for (const ad of res.ads) {
      if (seenIds.includes(ad.external_id)) continue;
      seenIds.push(ad.external_id);
      if (known.has(ad.external_id)) await touchKnown(platform, ad);
      else fresh.push(ad);
    }
    seen = seenIds.length;
    log(`${brand.name} ${platform}: ${seen} ads listed, ${fresh.length} new`);

    if (!brand.logo_key) {
      const logo = res.ads.map((a) => a.page_logo).find(Boolean);
      if (logo) {
        const f = await copyUrl(logo, `brands/${brand.id}/logo`).catch(() => null);
        if (f) { await pool.query("UPDATE brands SET logo_key = $2 WHERE id = $1", [brand.id, f.key]); brand.logo_key = f.key; }
      }
    }

    await lanes(fresh, 4, async (ad) => {
      const stored = await storeMedia(ad);
      const raw = { ...ad.raw, _poster: ad.poster || undefined };
      if (stored.incomplete) raw._media_incomplete = true;
      const r = await pool.query(
        `INSERT INTO ads (brand_id, platform, external_id, url, format, is_active, started_at, ended_at, days_running,
           headline, body, cta, link_url, landing_domain, placements, impressions, variants, media, youtube_url, raw,
           analysis_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'queued')
         ON CONFLICT (platform, external_id) DO NOTHING RETURNING id`,
        [brand.id, platform, ad.external_id, ad.url, ad.format, ad.is_active, ad.started_at, ad.ended_at, ad.days_running,
          ad.headline, ad.body, ad.cta, ad.link_url, ad.landing_domain, ad.placements, ad.impressions, ad.variants,
          JSON.stringify(stored.media), ad.youtube_url, JSON.stringify(raw)]);
      added += r.rows.length;
    });

    // Old creatives retry after today's ads are saved. A hung CDN must not use up the daily job.
    await retryUnseen(brand.id, platform, seenIds);

    // Status for ads not in today's list. An empty complete Meta list means the competitor
    // stopped everything. Google paging stops at the first known page, so only a full list
    // may expire ads from a saved last-shown date.
    if (platform === "facebook" && res.complete) {
      if (seenIds.length) {
        await pool.query(
          "UPDATE ads SET is_active = false WHERE brand_id = $1 AND platform = 'facebook' AND is_active AND NOT (external_id = ANY($2::text[]))",
          [brand.id, seenIds]);
      } else {
        await pool.query("UPDATE ads SET is_active = false WHERE brand_id = $1 AND platform = 'facebook' AND is_active", [brand.id]);
      }
    }
    if (platform === "google" && res.complete) {
      await pool.query("UPDATE ads SET is_active = false WHERE brand_id = $1 AND platform = 'google' AND is_active AND ended_at < now() - interval '3 days'", [brand.id]);
    }
    await pool.query("UPDATE pulls SET status = 'done', seen = $2, new_ads = $3, credits = $4, finished_at = now() WHERE id = $1",
      [pull.id, seen, added, credits]);
    return { seen, new: added, credits: +credits.toFixed(2) };
  } catch (e) {
    await pool.query("UPDATE pulls SET status = 'error', error = $2, seen = $3, new_ads = $4, credits = $5, finished_at = now() WHERE id = $1",
      [pull.id, String(e.message || e).slice(0, 500), seen, added, credits]);
    log(`${brand.name} ${platform}: ERROR ${e.message}`);
    return { error: String(e.message || e), seen, new: added };
  }
}

// A later Google or LinkedIn pull stops at the first known page and does not refetch details,
// so the ad object in hand often has no file URLs. The URLs from the first pull are on raw.
function sourceFromRaw(platform, ad, raw) {
  if (expectedFiles(ad) > 0) return ad;
  if (platform === "google" && raw?.detail) return normalizeGoogle(raw.item || { creativeId: ad.external_id, adUrl: ad.url }, raw.detail);
  if (platform === "facebook" && raw?.snapshot) return normalizeFacebook(raw);
  if (platform === "linkedin" && raw?.id) return normalizeLinkedin(raw);
  return ad;
}

async function writeMedia(row, source, raw, { timeoutMs } = {}) {
  const next = await storeMedia(source, { timeoutMs });
  const stored = Array.isArray(row.media) ? row.media.length : 0;
  const nextRaw = { ...raw };
  if (next.media.length <= stored) {
    // A dead link stays short. Remember the attempt so it does not block every later ad.
    if (stored >= expectedFiles(source)) return;
    nextRaw._media_incomplete = true;
    nextRaw._media_retry_at = new Date().toISOString();
    await pool.query("UPDATE ads SET raw = $2 WHERE id = $1", [row.id, JSON.stringify(nextRaw)]);
    return;
  }
  if (next.incomplete) {
    nextRaw._media_incomplete = true;
    nextRaw._media_retry_at = new Date().toISOString();
  } else {
    delete nextRaw._media_incomplete;
    delete nextRaw._media_retry_at;
  }
  await pool.query(
    `UPDATE ads SET media = $2, raw = $3, analysis_status = CASE WHEN analysis_status = 'running' THEN 'running' ELSE 'queued' END,
       analysis_error = NULL WHERE id = $1`,
    [row.id, JSON.stringify(next.media), JSON.stringify(nextRaw)]);
}

// Known ads only refresh status, unless their creatives never landed in storage.
async function touchKnown(platform, ad) {
  await pool.query(
    `UPDATE ads SET is_active = $3, ended_at = coalesce($4, ended_at), days_running = coalesce($5, days_running),
       impressions = coalesce($6, impressions), variants = coalesce($7, variants), last_seen_at = now()
     WHERE platform = $1 AND external_id = $2`,
    [platform, ad.external_id, ad.is_active, ad.ended_at, ad.days_running, ad.impressions, ad.variants]);
  const expected = expectedFiles(ad);
  const row = await one("SELECT id, media, raw FROM ads WHERE platform = $1 AND external_id = $2", [platform, ad.external_id]);
  if (!row) return;
  const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
  const stored = Array.isArray(row.media) ? row.media.length : 0;
  const source = sourceFromRaw(platform, ad, raw);
  const needed = Math.max(expected, expectedFiles(source));
  // Older rows never got `_media_incomplete`. Missing files in the saved detail are enough.
  if (stored >= needed) {
    if (raw._media_incomplete && needed > 0) {
      const nextRaw = { ...raw };
      delete nextRaw._media_incomplete;
      await pool.query("UPDATE ads SET raw = $2 WHERE id = $1", [row.id, JSON.stringify(nextRaw)]);
    }
    return;
  }
  await writeMedia(row, source, raw);
}

// A few old creatives per pull. Each file gives up after 20s, so this cannot spend the daily hour.
const RETRY_LIMIT = 4;
const RETRY_FILE_TIMEOUT_MS = 20_000;

// Ads that failed to store and are not on today's page. Google stops early, so they would
// otherwise never be visited again. A short file list with no incomplete flag still counts:
// compare what is stored with the files rebuilt from raw.
async function retryUnseen(brandId, platform, seenIds) {
  const rows = await q(
    `SELECT id, external_id, media, raw FROM ads
     WHERE brand_id = $1 AND platform = $2
       AND NOT (external_id = ANY($3::text[]))
       AND (
         raw->>'_media_incomplete' = 'true'
         OR raw->'detail' IS NOT NULL
         OR raw->'snapshot' IS NOT NULL
         OR jsonb_typeof(raw->'videoSources') = 'array'
         OR jsonb_typeof(raw->'imageSources') = 'array'
         OR jsonb_typeof(raw->'carouselImages') = 'array'
         OR jsonb_typeof(raw->'thumbnailSources') = 'array'
         OR raw->>'video' LIKE 'http%'
         OR raw->>'image' LIKE 'http%'
       )
     ORDER BY raw->>'_media_retry_at' ASC NULLS FIRST, id`,
    [brandId, platform, seenIds]);
  const due = [];
  for (const row of rows) {
    if (due.length >= RETRY_LIMIT) break;
    const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
    const ad = { platform, external_id: row.external_id, url: raw.item?.adUrl || raw.url || null, media: [] };
    const source = sourceFromRaw(platform, ad, raw);
    const stored = Array.isArray(row.media) ? row.media.length : 0;
    if (stored >= expectedFiles(source)) continue;
    due.push({ row, raw, source });
  }
  await lanes(due, 2, ({ row, raw, source }) => writeMedia(row, source, raw, { timeoutMs: RETRY_FILE_TIMEOUT_MS }));
}

// Daily job: every active brand, one after another.
export async function pullAll({ log = console.log } = {}) {
  const brands = await q("SELECT id, name FROM brands WHERE active ORDER BY id");
  const out = {};
  for (const b of brands) out[b.name] = await pullBrand(b.id, { log });
  return out;
}
