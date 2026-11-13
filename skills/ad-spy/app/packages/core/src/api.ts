// @ts-nocheck
// JSON API for the dashboard (packages/dashboard/app/api/[...path]/route.ts) and the media
// redirect route (/m/<key>). Ad library: brands, ads, pulls. Positioning gaps: market research,
// persona matrix, cells, ad concepts.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { q, one, pool } from "./db/sql";
import { findBrand } from "./sources";
import { pullBrand, pullAll, isPulling } from "./pull";
import { requeue } from "./analyze";
import { createMarket, runMarket } from "./research";
import { currentMarket, matrix, cell, startBrief, brief } from "./gaps";
import { urlFor, localPath, storageMode, presign, isRemote } from "./storage";
import { agentPrompt } from "./prompt";

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };
const json = (code: number, body: unknown) => Response.json(body, { status: code, headers: HEADERS });

const MIME = { mp4: "video/mp4", jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// /m/<key>: stored ad media. Remote → 302 to a fresh presigned URL (max 1 hour). Local → the file.
async function media(key: string): Promise<Response> {
  if (!/^(ads|brands)\//.test(key) || key.includes("..")) return new Response(null, { status: 404 });
  if (isRemote()) return new Response(null, { status: 302, headers: { location: presign(key, 3600), "cache-control": "private, max-age=3000" } });
  const f = localPath(key);
  if (!f || !existsSync(f)) return new Response(null, { status: 404 });
  return new Response(await readFile(f), { headers: { "content-type": MIME[f.split(".").pop()] || "application/octet-stream" } });
}

// ───────────── shaping ─────────────

async function mediaOut(media) {
  return Promise.all((media || []).map(async (m) => ({
    kind: m.kind, type: m.type, title: m.title || null, youtube: m.youtube || null,
    url: await urlFor(m.key), poster: m.poster ? await urlFor(m.poster) : null,
  })));
}

const CARD_COLS = `a.id, a.brand_id, a.platform, a.external_id, a.url, a.format, a.is_active, a.started_at, a.ended_at, a.days_running,
  a.headline, a.body, a.cta, a.landing_domain, a.placements, a.media, a.youtube_url, a.analysis_status, a.hook, a.summary,
  a.creative_style, a.hook_type, a.tags, a.variants, a.first_seen_at, b.name brand_name, b.logo_key`;

async function cardOut(a) {
  const m = (a.media || [])[0];
  return {
    id: Number(a.id), brandId: a.brand_id, brand: a.brand_name, logo: a.logo_key ? await urlFor(a.logo_key) : null,
    platform: a.platform, url: a.url, format: a.format, active: a.is_active, startedAt: a.started_at, endedAt: a.ended_at,
    days: a.days_running, headline: a.headline, body: a.body, cta: a.cta, domain: a.landing_domain, placements: a.placements || [],
    youtube: a.youtube_url, analysis: a.analysis_status, hook: a.hook, summary: a.summary, style: a.creative_style,
    hookType: a.hook_type, tags: a.tags || [], variants: a.variants, firstSeen: a.first_seen_at, mediaCount: (a.media || []).length,
    thumb: m ? { kind: m.kind, url: await urlFor(m.key), poster: m.poster ? await urlFor(m.poster) : null } : null,
  };
}

const SORTS = {
  newest: "a.started_at DESC NULLS LAST, a.id DESC",
  found: "a.first_seen_at DESC, a.id DESC",
  longest: "a.days_running DESC NULLS LAST, a.id DESC",
  oldest: "a.started_at ASC NULLS LAST, a.id",
};

async function listAds(p) {
  const where = []; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll("$?", `$${params.length}`)); };
  if (p.get("brand")) add("a.brand_id = $?", Number(p.get("brand")));
  if (p.get("platform")) add("a.platform = $?", p.get("platform"));
  if (p.get("format")) add("a.format = $?", p.get("format"));
  if (p.get("style")) add("a.creative_style = $?", p.get("style"));
  if (p.get("status") === "active") where.push("a.is_active");
  if (p.get("status") === "inactive") where.push("NOT a.is_active");
  if (p.get("new")) add("a.first_seen_at > now() - ($? || ' days')::interval", String(Number(p.get("new")) || 7));
  if (p.get("ids")) add("a.id = ANY($?::bigint[])", p.get("ids").split(",").map(Number).filter(Boolean));
  if (p.get("q")) {
    add(`concat_ws(' ', a.headline, a.body, a.transcript, a.hook, a.summary, a.angle, a.offer, a.on_screen_text,
           a.target_audience, array_to_string(a.tags, ' '), b.name) ILIKE $?`, `%${p.get("q")}%`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(p.get("limit")) || 60, 200);
  const offset = Number(p.get("offset")) || 0;
  const [rows, total] = await Promise.all([
    q(`SELECT ${CARD_COLS} FROM ads a JOIN brands b ON b.id = a.brand_id ${w} ORDER BY ${SORTS[p.get("sort")] || SORTS.newest} LIMIT ${limit} OFFSET ${offset}`, params),
    one(`SELECT count(*)::int n FROM ads a JOIN brands b ON b.id = a.brand_id ${w}`, params),
  ]);
  return { total: total.n, ads: await Promise.all(rows.map(cardOut)) };
}

async function adDetail(id) {
  const a = await one(`SELECT a.*, b.name brand_name, b.logo_key FROM ads a JOIN brands b ON b.id = a.brand_id WHERE a.id = $1`, [id]);
  if (!a) return null;
  const card = await cardOut(a);
  const raw = a.raw || {};
  const detail = raw.detail || {};
  return {
    ...card, media: await mediaOut(a.media), link: a.link_url, impressions: a.impressions, lastSeen: a.last_seen_at,
    transcript: a.transcript, onScreenText: a.on_screen_text, visual: a.visual_description, angle: a.angle, offer: a.offer,
    audience: a.target_audience, emotions: a.emotions || [], pains: a.pain_points || [], benefits: a.benefits || [],
    language: a.language, duration: a.duration_seconds, analyzedAt: a.analyzed_at, analysisError: a.analysis_error,
    credits: a.credits, extra: a.analysis ? { speaker: a.analysis.speaker, people: a.analysis.people_on_screen, productShown: a.analysis.product_shown } : null,
    poster: raw._poster || null,
    regions: (detail.creativeRegions || []).map((r) => r.regionName).slice(0, 30),
    targeting: raw.targeting || null,
  };
}

async function brandsOut() {
  const rows = await q(`SELECT b.*,
      (SELECT count(*) FROM ads WHERE brand_id = b.id)::int ads,
      (SELECT count(*) FROM ads WHERE brand_id = b.id AND is_active)::int active_ads,
      (SELECT count(*) FROM ads WHERE brand_id = b.id AND first_seen_at > now() - interval '7 days')::int new7,
      (SELECT count(*) FROM ads WHERE brand_id = b.id AND analysis_status IN ('queued','running'))::int queued
    FROM brands b ORDER BY lower(b.name)`);
  return Promise.all(rows.map(async (b) => ({
    id: b.id, name: b.name, domain: b.domain, logo: b.logo_key ? await urlFor(b.logo_key) : null,
    fbPageId: b.fb_page_id, fbPageName: b.fb_page_name, googleDomain: b.google_domain, googleAdvertiserId: b.google_advertiser_id,
    linkedinCompanyId: b.linkedin_company_id, linkedinCompany: b.linkedin_company, maxAds: b.max_ads, active: b.active,
    lastPulledAt: b.last_pulled_at, ads: b.ads, activeAds: b.active_ads, new7: b.new7, queued: b.queued, pulling: isPulling(b.id),
  })));
}

async function brandStats(id) {
  const [byPlatform, byFormat, byStyle, byHook, weekly, pulls, top, offers] = await Promise.all([
    q("SELECT platform k, count(*)::int n, count(*) FILTER (WHERE is_active)::int active FROM ads WHERE brand_id = $1 GROUP BY 1 ORDER BY 2 DESC", [id]),
    q("SELECT format k, count(*)::int n FROM ads WHERE brand_id = $1 AND is_active GROUP BY 1 ORDER BY 2 DESC", [id]),
    q("SELECT creative_style k, count(*)::int n FROM ads WHERE brand_id = $1 AND creative_style IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8", [id]),
    q("SELECT hook_type k, count(*)::int n FROM ads WHERE brand_id = $1 AND hook_type IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8", [id]),
    q(`SELECT to_char(date_trunc('week', started_at), 'YYYY-MM-DD') k, count(*)::int n FROM ads
       WHERE brand_id = $1 AND started_at > now() - interval '12 weeks' GROUP BY 1 ORDER BY 1`, [id]),
    q("SELECT platform, status, seen, new_ads, credits, error, started_at, finished_at FROM pulls WHERE brand_id = $1 ORDER BY id DESC LIMIT 12", [id]),
    q("SELECT avg(days_running)::float avg, max(days_running)::int max FROM ads WHERE brand_id = $1 AND is_active", [id]),
    q("SELECT offer k, count(*)::int n FROM ads WHERE brand_id = $1 AND offer IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6", [id]),
  ]);
  return { byPlatform, byFormat, byStyle, byHook, weekly, pulls, running: top[0], offers };
}

async function state() {
  const t = await one(`SELECT
      (SELECT count(*) FROM ads)::int ads,
      (SELECT count(*) FROM ads WHERE is_active)::int active,
      (SELECT count(*) FROM ads WHERE first_seen_at > now() - interval '7 days')::int new7,
      (SELECT count(*) FROM ads WHERE analysis_status IN ('queued','running'))::int queued,
      (SELECT count(*) FROM ads WHERE analysis_status = 'error')::int errors,
      (SELECT coalesce(sum(credits),0) FROM pulls)::float + (SELECT coalesce(sum(credits),0) FROM ads)::float
        + (SELECT coalesce(sum(credits),0) FROM markets)::float credits,
      (SELECT max(finished_at) FROM pulls) last_pull`);
  const styles = await q("SELECT creative_style k, count(*)::int n FROM ads WHERE creative_style IS NOT NULL GROUP BY 1 ORDER BY 2 DESC");
  const m = await currentMarket();
  return { totals: t, brands: await brandsOut(), styles: styles.map((s) => s.k), storage: storageMode(), market: m && marketOut(m) };
}

const marketOut = (m) => ({
  id: m.id, url: m.url, name: m.name, status: m.status, stage: m.stage, progress: m.progress, error: m.error,
  credits: m.credits, createdAt: m.created_at, finishedAt: m.finished_at,
  profile: m.profile && { oneLiner: m.profile.one_liner, category: m.profile.category, buyers: m.profile.buyers, competitors: m.profile.competitors },
});
const gapFilter = (p) => ({ brand: p.get("brand") || null, platform: p.get("platform") || null, active: p.get("active") === "1" });

// ───────────── routes ─────────────

const BRAND_FIELDS = {
  name: "name", domain: "domain", fbPageId: "fb_page_id", fbPageName: "fb_page_name", googleDomain: "google_domain",
  googleAdvertiserId: "google_advertiser_id", linkedinCompanyId: "linkedin_company_id", linkedinCompany: "linkedin_company",
  maxAds: "max_ads", active: "active",
};

const bg = (p) => p.catch((e) => console.error("background:", e.message));

export async function handleApi(method: string, url: URL, body: any): Promise<Response> {
  const m = (re) => url.pathname.match(re);
  let r;

  if (url.pathname === "/health") return json(200, { ok: true });
  if (method === "GET" && url.pathname === "/api/state") return json(200, await state());
  if (method === "GET" && url.pathname === "/api/ads") return json(200, await listAds(url.searchParams));
  if (method === "GET" && (r = m(/^\/api\/ads\/(\d+)$/))) {
    const a = await adDetail(Number(r[1]));
    return a ? json(200, a) : json(404, { error: "not found" });
  }
  if (method === "POST" && (r = m(/^\/api\/ads\/(\d+)\/reanalyze$/))) {
    await requeue("id = $1", [Number(r[1])]);
    return json(200, { ok: true });
  }
  if (method === "POST" && url.pathname === "/api/reanalyze-errors") return json(200, { queued: (await requeue()).length });

  if (method === "POST" && url.pathname === "/api/brands/find") {
    const { query } = (body || {});
    if (!query) return json(400, { error: "query required" });
    return json(200, await findBrand(query));
  }
  if (method === "POST" && url.pathname === "/api/brands") {
    const b = (body || {});
    if (!b.name) return json(400, { error: "name required" });
    const cols = []; const vals = [];
    for (const [k, c] of Object.entries(BRAND_FIELDS)) if (b[k] !== undefined && b[k] !== "") { cols.push(c); vals.push(b[k]); }
    const row = await one(`INSERT INTO brands (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`, vals);
    bg(pullBrand(row.id, { log: console.log }));
    return json(200, { id: row.id });
  }
  if ((r = m(/^\/api\/brands\/(\d+)$/))) {
    const id = Number(r[1]);
    if (method === "PATCH") {
      const b = (body || {});
      const sets = []; const vals = [id];
      for (const [k, c] of Object.entries(BRAND_FIELDS)) if (b[k] !== undefined) { vals.push(b[k] === "" ? null : b[k]); sets.push(`${c} = $${vals.length}`); }
      if (sets.length) await pool.query(`UPDATE brands SET ${sets.join(", ")} WHERE id = $1`, vals);
      return json(200, { ok: true });
    }
    if (method === "DELETE") { await pool.query("DELETE FROM brands WHERE id = $1", [id]); return json(200, { ok: true }); }
    if (method === "GET") return json(200, await brandStats(id));
  }
  if (method === "POST" && (r = m(/^\/api\/brands\/(\d+)\/pull$/))) {
    bg(pullBrand(Number(r[1]), { log: console.log }));
    return json(200, { started: true });
  }
  if (method === "POST" && url.pathname === "/api/pull-all") { bg(pullAll()); return json(200, { started: true }); }

  if (method === "GET" && url.pathname === "/api/market") { const m = await currentMarket(); return json(200, m ? marketOut(m) : null); }
  if (method === "POST" && url.pathname === "/api/market") {
    const { url: site } = (body || {});
    if (!site) return json(400, { error: "url required" });
    let id;
    try { id = await createMarket(String(site).trim()); } catch { return json(400, { error: "That does not look like a website URL" }); }
    bg(runMarket(id));
    return json(200, { id });
  }
  if (method === "POST" && url.pathname === "/api/market/rerun") {
    const m = await currentMarket(); const { from } = (body || {});
    if (!m) return json(404, { error: "no market" });
    if (!["site", "collect", "matrix", "tag_voices", "tag_ads"].includes(from)) return json(400, { error: "bad stage" });
    bg(runMarket(m.id, { from }));
    return json(200, { started: true });
  }
  if (method === "GET" && url.pathname === "/api/gaps") {
    const m = await currentMarket();
    if (!m) return json(404, { error: "no market" });
    return json(200, { market: marketOut(m), ...(await matrix(m.id, gapFilter(url.searchParams))) });
  }
  if (method === "GET" && url.pathname === "/api/gaps/cell") {
    const m = await currentMarket();
    const c = m && await cell(m.id, Number(url.searchParams.get("p")), Number(url.searchParams.get("t")), gapFilter(url.searchParams));
    if (!c) return json(404, { error: "not found" });
    const ids = c.ads.map((a) => a.id).join(",");
    const cards = ids ? (await listAds(new URLSearchParams({ ids, limit: "60" }))).ads : [];
    const byId = new Map(c.ads.map((a) => [Number(a.id), a]));
    return json(200, { ...c, ads: cards.map((a) => ({ ...a, strength: byId.get(a.id)?.strength, reason: byId.get(a.id)?.reason })).sort((a, b) => b.strength - a.strength) });
  }
  if (method === "POST" && url.pathname === "/api/gaps/brief") {
    const m = await currentMarket(); const { p, t } = (body || {});
    if (!m || !p || !t) return json(400, { error: "p and t required" });
    return json(200, { id: await startBrief(m.id, Number(p), Number(t)) });
  }
  if (method === "GET" && (r = m(/^\/api\/briefs\/(\d+)$/))) return json(200, await brief(Number(r[1])));

  if (method === "GET" && url.pathname.startsWith("/m/")) return media(decodeURIComponent(url.pathname.slice(3)));
  if (url.pathname === "/api/agent-prompt") return json(200, { prompt: agentPrompt() });
  return json(404, { error: "not found" });
}

