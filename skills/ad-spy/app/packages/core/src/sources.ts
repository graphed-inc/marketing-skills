// @ts-nocheck
// Ad library adapters. Each platform: find the brand, then page through its ads and return them
// in one normalized shape. All calls are ScrapeCreators through Graphed Tools (~0.22 credits each).
import { tool, TOOL_RATE } from "./tools";

const SC = "scrapecreators:v1";
const day = 86400_000;
const iso = (v) => { if (v == null || v === "") return null; const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return isNaN(d) ? null : d.toISOString(); };
const domainOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const isUrl = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const lower = (s) => (s ? String(s).toLowerCase() : null);
const daysBetween = (a, b) => (a && b ? Math.max(1, Math.round((new Date(b) - new Date(a)) / day) + 1) : null);

// ───────────────────────── brand lookup (Add brand dialog) ─────────────────────────

export async function findBrand(query) {
  const q = String(query || "").trim();
  const domain = /\.[a-z]{2,}$/i.test(q) ? domainOf(q) : null;
  const name = domain ? domain.split(".")[0] : q;
  const [fb, google, linkedin] = await Promise.all([
    tool(`${SC}/facebook/adLibrary/search/companies`, { query: name }).catch((e) => ({ error: e.message })),
    tool(`${SC}/google/adLibrary/advertisers/search`, { query: name }).catch((e) => ({ error: e.message })),
    tool(`${SC}/linkedin/ads/search`, { company: name }).catch((e) => ({ error: e.message })),
  ]);
  const li = new Map();
  for (const a of linkedin.ads || []) {
    const id = String(a.advertiserLinkedinPage || "").match(/company\/(\d+)/)?.[1];
    if (!id) continue;
    const cur = li.get(id) || { id, name: a.advertiser, logo: a.advertiserLogo, ads: 0 };
    cur.ads++;
    li.set(id, cur);
  }
  return {
    query: q, domain, credits: 3 * TOOL_RATE,
    facebook: (fb.searchResults || []).slice(0, 8).map((p) => ({
      id: p.page_id, name: p.name, logo: p.image_uri, likes: p.likes, category: p.category,
      ig: p.ig_username, igFollowers: p.ig_followers, verified: p.verification === "BLUE_VERIFIED",
    })),
    google: {
      advertisers: (google.advertisers || []).slice(0, 8).map((a) => ({ id: a.advertiser_id, name: a.name, region: a.region, ads: a.number_of_ads_estimate })),
      domains: [...new Set([domain, ...(google.websites || []).map((w) => w.domain)].filter(Boolean))].slice(0, 6),
    },
    linkedin: [...li.values()],
    errors: [fb.error, google.error, linkedin.error].filter(Boolean),
  };
}

// ───────────────────────── Facebook / Instagram (Meta Ad Library) ─────────────────────────

export function normalizeFacebook(r) {
  const s = r.snapshot || {};
  const media = [];
  for (const v of s.videos || []) media.push({ kind: "video", src: v.video_hd_url || v.video_sd_url, sd: v.video_sd_url, poster: v.video_preview_image_url });
  for (const i of s.images || []) media.push({ kind: "image", src: i.original_image_url || i.resized_image_url });
  for (const c of s.cards || []) {
    if (c.video_hd_url || c.video_sd_url) media.push({ kind: "video", src: c.video_hd_url || c.video_sd_url, sd: c.video_sd_url, poster: c.video_preview_image_url, title: c.title, body: c.body });
    else if (c.original_image_url || c.resized_image_url) media.push({ kind: "image", src: c.original_image_url || c.resized_image_url, title: c.title, body: c.body });
  }
  const fmt = lower(s.display_format);
  const card0 = (s.cards || [])[0] || {};
  const started = iso(r.start_date_string || r.start_date);
  const ended = iso(r.end_date_string || r.end_date);
  const body = s.body?.text && !/^\{\{.*\}\}$/.test(s.body.text.trim()) ? s.body.text : card0.body || s.body?.text || null;
  return {
    platform: "facebook",
    external_id: String(r.ad_archive_id),
    url: r.url || `https://www.facebook.com/ads/library/?id=${r.ad_archive_id}`,
    format: fmt === "dco" || fmt === "dpa" ? (media.some((m) => m.kind === "video") ? "video" : media.length > 1 ? "carousel" : "image")
      : fmt === "carousel" || (s.cards || []).length > 1 ? "carousel" : fmt === "video" ? "video" : fmt === "image" ? "image" : fmt || "image",
    is_active: !!r.is_active,
    started_at: started,
    ended_at: ended,
    days_running: daysBetween(started, r.is_active ? new Date().toISOString() : ended),
    headline: s.title && !/^\{\{/.test(s.title) ? s.title : card0.title || s.title || null,
    body,
    cta: s.cta_text || card0.cta_text || null,
    link_url: s.link_url || card0.link_url || null,
    landing_domain: domainOf(s.link_url || card0.link_url || s.caption || ""),
    placements: (r.publisher_platform || []).map(lower),
    impressions: r.impressions_with_index?.impressions_text || null,
    variants: r.collation_count || null,
    media: media.filter((m) => isUrl(m.src)).slice(0, 10),
    youtube_url: null,
    page_name: r.page_name || s.page_name,
    page_logo: s.page_profile_picture_url,
    raw: r,
  };
}

// Pages of 30, newest first. Stops at `max` ads or when `stop(ads)` says the page was all known.
export async function listFacebook(brand, { max, stop }) {
  const out = []; let cursor = null; let calls = 0; let complete = false;
  for (;;) {
    const body = { pageId: brand.fb_page_id, status: "ACTIVE", trim: false };
    if (cursor) body.cursor = cursor;
    const r = await tool(`${SC}/facebook/adLibrary/company/ads`, body); calls++;
    const ads = (r.results || []).map(normalizeFacebook);
    out.push(...ads);
    cursor = r.cursor;
    if (!cursor || !ads.length) { complete = true; break; }
    if (out.length >= max || (stop && (await stop(ads)))) break;
  }
  return { ads: out.slice(0, max), credits: calls * TOOL_RATE, complete: complete && out.length <= max };
}

// ───────────────────────── Google (Ads Transparency Center) ─────────────────────────

export function normalizeGoogle(item, detail) {
  const vars = (detail?.variations || []).filter((v) => v && Object.keys(v).length);
  const v = vars.find((x) => x.youtubeUrl) || vars.find((x) => x.headline) || vars[0] || {};
  const yt = vars.map((x) => x.youtubeUrl).find(Boolean) || null;
  const ytId = yt && (yt.match(/[?&]v=([\w-]{6,})/) || [])[1];
  const img = item.imageUrl || vars.map((x) => x.imageUrl || x.image).find(isUrl) || null;
  const media = [];
  if (ytId) media.push({ kind: "image", src: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, youtube: yt });
  if (img) media.push({ kind: "image", src: img });
  const started = iso(detail?.firstShown || item.firstShown);
  const last = iso(detail?.lastShown || item.lastShown);
  const imp = detail?.overallImpressions;
  const placements = new Set();
  for (const r of detail?.regionStats || []) for (const p of r.platformImpressions || []) placements.add(lower(p.platform));
  const dest = v.destinationUrl || vars.map((x) => x.destinationUrl).find(Boolean) || null;
  return {
    platform: "google",
    external_id: String(item.creativeId),
    url: item.adUrl || detail?.url,
    format: lower(item.format || detail?.format) || "text",
    is_active: !!last && Date.now() - new Date(last) < 3 * day,
    started_at: started,
    ended_at: last,
    days_running: daysBetween(started, last),
    headline: v.headline || null,
    body: v.description || v.allText || null,
    cta: v.callToAction || null,
    link_url: dest,
    landing_domain: domainOf(dest || item.domain || ""),
    placements: [...placements],
    impressions: imp && (imp.min || imp.max) ? `${imp.min || 0}-${imp.max || "?"}` : null,
    variants: vars.length || null,
    media,
    youtube_url: yt,
    page_name: item.advertiserName,
    raw: { item, detail },
  };
}

export async function listGoogle(brand, { max, stop, known }) {
  const items = []; let cursor = null; let calls = 0; let complete = false;
  for (;;) {
    const body = brand.google_advertiser_id ? { advertiser_id: brand.google_advertiser_id } : { domain: brand.google_domain };
    if (cursor) body.cursor = cursor;
    const r = await tool(`${SC}/google/company/ads`, body); calls++;
    const page = r.ads || [];
    items.push(...page);
    cursor = r.cursor;
    if (!cursor || !page.length) { complete = true; break; }
    if (items.length >= max) break;
    if (stop && (await stop(page.map((a) => ({ platform: "google", external_id: String(a.creativeId) }))))) break;
  }
  // Details (copy, YouTube link, impressions) only for ads we have not stored yet.
  const ads = [];
  for (const it of items.slice(0, max)) {
    const id = String(it.creativeId);
    if (known && known.has(id)) { ads.push(normalizeGoogle(it, null)); continue; }
    let detail = null;
    try { detail = await tool(`${SC}/google/ad`, { url: it.adUrl }); calls++; } catch { /* keep the list fields */ }
    ads.push(normalizeGoogle(it, detail));
  }
  return { ads, credits: calls * TOOL_RATE, complete };
}

// ───────────────────────── LinkedIn (Ad Library) ─────────────────────────

export function normalizeLinkedin(a) {
  const media = [];
  const vids = (a.videoSources || []).filter((v) => isUrl(v.src)).sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0));
  const video = vids[0]?.src || (isUrl(a.video) ? a.video : null);
  const poster = (a.thumbnailSources || [])[0] || null;
  if (video) media.push({ kind: "video", src: video, sd: vids[vids.length - 1]?.src || video, poster });
  else if (poster) media.push({ kind: "image", src: poster });
  for (const i of a.imageSources || []) if (isUrl(i)) media.push({ kind: "image", src: i });
  if (!a.imageSources?.length && isUrl(a.image) && !poster) media.push({ kind: "image", src: a.image });
  for (const c of a.carouselImages || []) { const u = typeof c === "string" ? c : c?.url || c?.src || c?.image; if (isUrl(u)) media.push({ kind: "image", src: u, title: c?.title }); }
  const started = iso(a.startDate);
  const ended = iso(a.endDate);
  const active = !ended || Date.now() - new Date(ended) < 3 * day;
  const t = String(a.adType || "").toLowerCase();
  const dest = a.destinationUrl || a.landingPage || null;
  return {
    platform: "linkedin",
    external_id: String(a.id),
    url: a.url,
    format: t.includes("video") ? "video" : t.includes("carousel") || (a.carouselImages || []).length > 1 ? "carousel" : t.includes("text") ? "text" : t.includes("message") || t.includes("conversation") ? "text" : "image",
    is_active: active,
    started_at: started,
    ended_at: ended,
    days_running: daysBetween(started, active ? new Date().toISOString() : ended),
    headline: a.headline || null,
    body: a.description || null,
    cta: a.cta || null,
    link_url: dest,
    landing_domain: domainOf(dest || ""),
    placements: ["linkedin"],
    impressions: a.totalImpressions || null,
    variants: null,
    media: media.slice(0, 10),
    youtube_url: null,
    page_name: a.advertiser,
    page_logo: a.advertiserLogo,
    poster: a.poster ? `${a.poster}${a.posterTitle ? ` · ${a.posterTitle}` : ""}` : null,
    raw: a,
  };
}

export async function listLinkedin(brand, { max, stop }) {
  const out = []; let token = null; let calls = 0; let complete = false;
  for (;;) {
    const body = brand.linkedin_company_id ? { companyId: brand.linkedin_company_id } : { company: brand.linkedin_company };
    if (token) body.paginationToken = token;
    const r = await tool(`${SC}/linkedin/ads/search`, body); calls++;
    const ads = (r.ads || []).map(normalizeLinkedin);
    out.push(...ads);
    token = r.paginationToken;
    if (r.isLastPage || !token || !ads.length) { complete = true; break; }
    if (out.length >= max || (stop && (await stop(ads)))) break;
  }
  return { ads: out.slice(0, max), credits: calls * TOOL_RATE, complete };
}

export const PLATFORMS = {
  facebook: { ready: (b) => !!b.fb_page_id, list: listFacebook },
  google: { ready: (b) => !!(b.google_domain || b.google_advertiser_id), list: listGoogle },
  linkedin: { ready: (b) => !!(b.linkedin_company_id || b.linkedin_company), list: listLinkedin },
};
