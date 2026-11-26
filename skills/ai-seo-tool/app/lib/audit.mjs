// Site audit: own crawler (no credits) + optional PageSpeed Insights field data (free Google API).
import { cleanDomain } from "./seo.mjs";
import { call } from "./tools.mjs";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const UA = "Mozilla/5.0 (compatible; SEOExplorerBot/1.0; site audit)";

export const RULES = {
  // errors
  http4xx: ["error", "4XX page"], http5xx: ["error", "5XX page"], fetch_failed: ["error", "Page failed to load"],
  broken_internal: ["error", "Has broken internal links"], redirect_loop: ["error", "Redirect loop or too many redirects"],
  canonical_localhost: ["error", "Canonical points to localhost / dev host"], canonical_broken: ["error", "Canonical points to a broken or redirected URL"],
  noindex_in_sitemap: ["error", "Noindex page in sitemap"], title_missing: ["error", "Missing title"], sitemap_bad: ["error", "Sitemap URL is not 200"],
  // warnings
  redirect_chain: ["warning", "Redirect chain (2+ hops)"], title_long: ["warning", "Title over 60 characters"], title_short: ["warning", "Title under 20 characters"],
  title_dup: ["warning", "Duplicate title"], desc_missing: ["warning", "Missing meta description"], desc_dup: ["warning", "Duplicate meta description"],
  desc_long: ["warning", "Meta description over 160 characters"], h1_missing: ["warning", "Missing H1"], h1_multiple: ["warning", "Multiple H1 tags"],
  slow: ["warning", "Slow response (over 1.5 s)"], thin: ["warning", "Thin content (under 200 words)"], img_alt: ["warning", "Images missing alt text"],
  canonical_missing: ["warning", "Missing canonical"], orphan: ["warning", "Orphan page (in sitemap, no internal links to it)"],
  http_links: ["warning", "Links to http:// URLs"], robots_blocked: ["warning", "Sitemap URL blocked by robots.txt"], large_html: ["warning", "HTML over 1 MB"],
  // notices
  canonical_other: ["notice", "Canonical points to another URL"], noindex: ["notice", "Noindex page"], viewport_missing: ["notice", "Missing viewport meta"],
  lang_missing: ["notice", "Missing html lang"], og_missing: ["notice", "Missing Open Graph title"], redirect: ["notice", "Redirects (3XX)"],
  // site level
  robots_missing: ["notice", "No robots.txt"], sitemap_missing: ["warning", "No XML sitemap found"], robots_blocks_all: ["error", "robots.txt blocks the whole site"],
};

const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? decode(m[1] ?? m[2] ?? m[3]) : null; };

// ---------- outbound guard ----------
// The crawler fetches URLs that the audited site controls (redirects, robots.txt sitemaps, links). Every request,
// and every redirect hop, must go to a public address: never loopback, private, link-local (cloud metadata),
// carrier-grade NAT, multicast or reserved ranges.
function v4Private(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && ip.split(".")[2] === "0") ||
    (a === 198 && (b === 18 || b === 19));
}
export function privateIp(ip) {
  const v = isIP(ip);
  if (v === 4) return v4Private(ip);
  if (v !== 6) return true;
  const x = ip.toLowerCase();
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(x)) {
    const [h, l] = x.slice(7).split(":").map((p) => parseInt(p, 16));
    return v4Private(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`);
  }
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("100::") || x.startsWith("2001:db8:");
}
// Tests only: origins (like http://127.0.0.1:PORT) the guard lets through.
export const guardAllow = new Set();
export async function assertPublicUrl(url) {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`blocked: ${u.protocol} URL`);
  if (guardAllow.has(u.origin)) return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw new Error(`blocked: private host ${host}`);
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(privateIp)) throw new Error(`blocked: ${host} is a private address`);
}

async function fetchOne(url, timeout) {
  await assertPublicUrl(url);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: "manual", signal: ac.signal, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } });
    const ms = Date.now() - t0;
    const type = r.headers.get("content-type") || "";
    const body = r.status >= 300 && r.status < 400 ? "" : (/html|xml|text/.test(type) ? await r.text() : "");
    return { status: r.status, location: r.headers.get("location"), type, body, ms, xrobots: r.headers.get("x-robots-tag") || "" };
  } finally { clearTimeout(t); }
}

// redirect "follow" follows up to 5 hops by hand, so every hop passes the guard.
export async function get(url, { timeout = 20000, redirect = "manual" } = {}) {
  let cur = url;
  for (let hop = 0; ; hop++) {
    const r = await fetchOne(cur, timeout);
    if (redirect !== "follow" || !(r.status >= 300 && r.status < 400 && r.location) || hop >= 5) return { ...r, url: cur };
    cur = new URL(r.location, cur).href;
  }
}

export async function fetchChain(url) {
  const chain = [];
  let cur = url;
  for (let i = 0; i < 7; i++) {
    const r = await get(cur);
    chain.push({ url: cur, status: r.status });
    if (r.status >= 300 && r.status < 400 && r.location) {
      const next = new URL(r.location, cur).href;
      if (chain.some((c) => c.url === next)) return { ...r, chain, final: next, loop: true };
      cur = next; continue;
    }
    return { ...r, chain, final: cur, loop: false };
  }
  return { status: 0, chain, final: cur, loop: true, body: "", ms: 0 };
}

function parseRobots(txt) {
  const rules = [], sitemaps = [];
  let applies = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2].trim()];
    if (k === "user-agent") applies = v === "*";
    else if (k === "disallow" && applies && v) rules.push(v);
    else if (k === "sitemap") sitemaps.push(v);
  }
  return { disallow: rules, sitemaps };
}
const blocked = (path, disallow) => disallow.some((d) => { const re = new RegExp("^" + d.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")); return re.test(path); });

async function readSitemaps(urls, limit = 5000) {
  const out = new Set(), seen = new Set();
  const queue = [...urls];
  while (queue.length && seen.size < 25 && out.size < limit) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    try {
      const r = await get(u, { redirect: "follow" });
      if (r.status !== 200) continue;
      const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
      if (/<sitemapindex/i.test(r.body)) queue.push(...locs);
      else for (const l of locs) { if (out.size >= limit) break; out.add(l); }
    } catch { /* skip */ }
  }
  return { urls: [...out], read: seen.size };
}

function parsePage(html, url) {
  const head = html.slice(0, 200000);
  const title = decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const metas = head.match(/<meta\b[^>]*>/gi) || [];
  const meta = (n) => { for (const m of metas) { const k = (attr(m, "name") || attr(m, "property") || "").toLowerCase(); if (k === n) return attr(m, "content") || ""; } return null; };
  const canonTag = (head.match(/<link\b[^>]*rel\s*=\s*["']?canonical["']?[^>]*>/i) || [])[0];
  const canonical = canonTag ? attr(canonTag, "href") : null;
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, " ")));
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const links = [];
  for (const a of html.match(/<a\b[^>]*>/gi) || []) {
    const href = attr(a, "href");
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try { links.push({ href: new URL(href, url).href.replace(/#.*$/, ""), nofollow: /nofollow/i.test(attr(a, "rel") || "") }); } catch { /* bad href */ }
  }
  const text = html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  return {
    title, description: meta("description"), robots: (meta("robots") || "").toLowerCase(), canonical: canonical ? (() => { try { return new URL(canonical, url).href; } catch { return canonical; } })() : null,
    h1, viewport: meta("viewport") != null, ogTitle: meta("og:title") != null, lang: /<html\b[^>]*\slang\s*=/i.test(head),
    imgNoAlt: imgs.filter((i) => attr(i, "alt") == null).length, images: imgs.length, links,
    words: decode(text).split(" ").filter((w) => /[a-z0-9]/i.test(w)).length,
  };
}

const norm = (u) => { try { const x = new URL(u); x.hash = ""; return x.href.replace(/\/$/, x.pathname === "/" ? "/" : ""); } catch { return u; } };

export async function runAudit(input, ctx, progress = () => {}) {
  const domain = cleanDomain(input.domain);
  const maxPages = Math.min(Number(input.maxPages) || 300, 2000);
  progress("robots.txt + sitemaps");
  const home = await fetchChain(`https://${domain}/`).catch(() => fetchChain(`http://${domain}/`));
  const origin = new URL(home.final).origin;
  const host = new URL(origin).hostname;
  const internal = (u) => { try { const h = new URL(u).hostname; return h === host || h.replace(/^www\./, "") === domain; } catch { return false; } };
  const robotsRes = await get(`${origin}/robots.txt`, { redirect: "follow" }).catch(() => ({ status: 0, body: "" }));
  const robots = robotsRes.status === 200 ? parseRobots(robotsRes.body) : { disallow: [], sitemaps: [] };
  const sm = await readSitemaps(robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]);
  const inSitemap = new Set(sm.urls.map(norm));

  const pages = new Map();       // url → page record
  const inlinks = new Map();     // url → count
  const queue = [norm(home.final)];
  const queued = new Set(queue);
  for (const u of sm.urls) { const n = norm(u); if (internal(n) && !queued.has(n)) { queued.add(n); queue.push(n); } }
  let active = 0;
  await new Promise((resolve) => {
    const pump = () => {
      if (!queue.length && !active) return resolve();
      while (active < 6 && queue.length && pages.size + active < maxPages) {
        const url = queue.shift();
        let path = "/"; try { path = new URL(url).pathname; } catch {}
        if (blocked(path, robots.disallow)) { pages.set(url, { url, blocked: true, status: null, issues: [] }); continue; }
        active++;
        fetchChain(url).then((r) => {
          const rec = { url, status: r.status, final: r.final, chain: r.chain, loop: r.loop, ms: r.ms, size: (r.body || "").length, xrobots: r.xrobots, issues: [] };
          if (r.status === 200 && /html/.test(r.type || "")) {
            const p = parsePage(r.body, r.final);
            Object.assign(rec, { title: p.title, description: p.description, robots: p.robots, canonical: p.canonical, h1: p.h1, viewport: p.viewport, ogTitle: p.ogTitle, lang: p.lang, imgNoAlt: p.imgNoAlt, images: p.images, words: p.words });
            rec.out = [];
            for (const l of p.links) {
              if (!internal(l.href)) { if (/^http:\/\//.test(l.href)) rec.httpLinks = (rec.httpLinks || 0) + 1; continue; }
              const n = norm(l.href);
              if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|css|js|ico|xml)(\?|$)/i.test(n)) continue;
              rec.out.push(n);
              inlinks.set(n, (inlinks.get(n) || 0) + 1);
              if (!queued.has(n) && queued.size < maxPages * 3) { queued.add(n); queue.push(n); }
            }
            rec.out = [...new Set(rec.out)];
          }
          pages.set(url, rec);
        }).catch((e) => pages.set(url, { url, status: 0, error: String(e.message || e).slice(0, 120), issues: [] }))
          .finally(() => { active--; if (pages.size % 10 === 0) progress(`crawled ${pages.size} pages`); pump(); });
      }
      if (!queue.length && !active) resolve();
      else if (pages.size + active >= maxPages && !active) resolve();
    };
    pump();
  });

  // ---------- issues ----------
  const list = [...pages.values()];
  const byUrl = new Map(list.map((p) => [p.url, p]));
  const statusOf = (u) => { const p = byUrl.get(norm(u)); return p ? p.status : null; };
  const dupT = new Map(), dupD = new Map();
  for (const p of list) if (p.status === 200 && p.title != null) {
    if (p.title) dupT.set(p.title, (dupT.get(p.title) || 0) + 1);
    if (p.description) dupD.set(p.description, (dupD.get(p.description) || 0) + 1);
  }
  const add = (p, id, detail) => p.issues.push(detail ? [id, String(detail).slice(0, 200)] : [id]);
  for (const p of list) {
    const sm2 = inSitemap.has(p.url);
    if (p.blocked) { if (sm2) add(p, "robots_blocked"); continue; }
    if (!p.status) { add(p, "fetch_failed", p.error); continue; }
    if (p.loop) add(p, "redirect_loop");
    if (p.status >= 500) add(p, "http5xx", p.status);
    else if (p.status >= 400) add(p, "http4xx", p.status);
    if (p.chain && p.chain.length > 1) add(p, p.chain.length > 2 ? "redirect_chain" : "redirect", p.chain.map((c) => c.status).join(" → ") + " " + p.final);
    if (sm2 && (p.status !== 200 || (p.chain && p.chain.length > 1))) add(p, "sitemap_bad", p.status);
    if (p.status !== 200 || p.title === undefined) continue;
    const noindex = /noindex/.test(p.robots || "") || /noindex/i.test(p.xrobots || "");
    if (noindex) add(p, sm2 ? "noindex_in_sitemap" : "noindex");
    if (!p.title) add(p, "title_missing");
    else { if (p.title.length > 60) add(p, "title_long", p.title.length); if (p.title.length < 20) add(p, "title_short", p.title.length); if (dupT.get(p.title) > 1) add(p, "title_dup", p.title); }
    if (!p.description) add(p, "desc_missing");
    else { if (p.description.length > 160) add(p, "desc_long", p.description.length); if (dupD.get(p.description) > 1) add(p, "desc_dup"); }
    if (!p.h1.length) add(p, "h1_missing"); else if (p.h1.length > 1) add(p, "h1_multiple", p.h1.length);
    if (p.ms > 1500) add(p, "slow", `${p.ms} ms`);
    if (p.words < 200 && !noindex) add(p, "thin", `${p.words} words`);
    if (p.imgNoAlt) add(p, "img_alt", `${p.imgNoAlt} of ${p.images}`);
    if (!p.viewport) add(p, "viewport_missing");
    if (!p.lang) add(p, "lang_missing");
    if (!p.ogTitle) add(p, "og_missing");
    if (p.size > 1_000_000) add(p, "large_html", `${Math.round(p.size / 1024)} KB`);
    if (p.httpLinks) add(p, "http_links", p.httpLinks);
    if (!p.canonical) add(p, "canonical_missing");
    else {
      let ch = ""; try { ch = new URL(p.canonical).hostname; } catch {}
      if (/^(localhost|127\.|0\.0\.0\.0|.*\.local$|.*staging|.*vercel\.app$|.*netlify\.app$)/i.test(ch)) add(p, "canonical_localhost", p.canonical);
      else if (norm(p.canonical) !== norm(p.final)) {
        const s = statusOf(p.canonical), cp = byUrl.get(norm(p.canonical));
        if ((s && s !== 200) || (cp && cp.chain && cp.chain.length > 1)) add(p, "canonical_broken", `${p.canonical} (${s})`);
        else add(p, "canonical_other", p.canonical);
      }
    }
    const broken = (p.out || []).filter((u) => { const s = statusOf(u); return s && s >= 400; });
    if (broken.length) add(p, "broken_internal", broken.slice(0, 5).join(" "));
    if (sm2 && !inlinks.get(p.url) && p.url !== norm(home.final)) add(p, "orphan");
  }
  const site = [];
  if (robotsRes.status !== 200) site.push(["robots_missing"]);
  if (!sm.urls.length) site.push(["sitemap_missing"]);
  if (robots.disallow.includes("/")) site.push(["robots_blocks_all"]);

  // ---------- Lighthouse (DataForSEO through Graphed Tools, 0.575 credits per page) ----------
  let speed = [];
  if (input.lighthouse !== false && input.pagespeed !== false) {
    const top = [norm(home.final), ...list.filter((p) => p.status === 200 && p.url !== norm(home.final)).sort((a, b) => (inlinks.get(b.url) || 0) - (inlinks.get(a.url) || 0)).slice(0, 3).map((p) => p.url)];
    progress(`Lighthouse on ${top.length} pages (about 80 s each)`);
    speed = await Promise.all(top.map((u) => lighthouse(u, ctx)));
  }

  const counts = {};
  for (const p of list) for (const [id] of p.issues) counts[id] = (counts[id] || 0) + 1;
  for (const [id] of site) counts[id] = (counts[id] || 0) + 1;
  const crawled = list.filter((p) => !p.blocked);
  const withErrors = crawled.filter((p) => p.issues.some(([id]) => RULES[id][0] === "error")).length;
  return {
    domain, origin, crawled: crawled.length, sitemapUrls: sm.urls.length, robots: robotsRes.status === 200,
    health: crawled.length ? Math.round(((crawled.length - withErrors) / crawled.length) * 100) : 0,
    counts, site, speed,
    pages: list.map((p) => ({ url: p.url, status: p.status, final: p.final !== p.url ? p.final : null, ms: p.ms, title: p.title ?? null, words: p.words ?? null,
      inlinks: inlinks.get(p.url) || 0, sitemap: inSitemap.has(p.url), issues: p.issues })),
  };
}

// One Lighthouse run: category scores, core metrics and the failed checks.
export async function lighthouse(url, ctx = {}) {
  try {
    const r = await call("dataforseo:on_page.lighthouse.live.json", { url, for_mobile: true }, { ctx, ttlDays: 1 });
    const lh = r && r.tasks && r.tasks[0] && r.tasks[0].result && r.tasks[0].result[0];
    if (!lh || !lh.categories) return { url, error: "Lighthouse returned no result" };
    const A = lh.audits || {}, num = (k) => (A[k] && A[k].numericValue != null ? Math.round(A[k].numericValue) : null);
    const score = (k) => (lh.categories[k] && lh.categories[k].score != null ? Math.round(lh.categories[k].score * 100) : null);
    const failed = Object.values(A).filter((x) => x.score != null && x.score < 0.9 && ["numeric", "binary", "metricSavings"].includes(x.scoreDisplayMode))
      .sort((x, y) => x.score - y.score).slice(0, 12).map((x) => ({ title: x.title, value: x.displayValue || "" }));
    return { url, lighthouse: true, scores: { performance: score("performance"), accessibility: score("accessibility"), bestPractices: score("best-practices"), seo: score("seo") },
      lcp: num("largest-contentful-paint"), fcp: num("first-contentful-paint"), tbt: num("total-blocking-time"), speedIndex: num("speed-index"),
      cls: A["cumulative-layout-shift"] && A["cumulative-layout-shift"].numericValue != null ? Math.round(A["cumulative-layout-shift"].numericValue * 1000) / 1000 : null, failed };
  } catch (e) { return { url, error: String(e.message || e).slice(0, 100) }; }
}

// New / fixed issues vs the previous audit.
export function diffAudits(cur, prev) {
  if (!prev) return null;
  const keys = (a) => new Set(a.pages.flatMap((p) => p.issues.map(([id]) => `${id}|${p.url}`)));
  const c = keys(cur), p = keys(prev);
  return { newIssues: [...c].filter((k) => !p.has(k)).map((k) => k.split("|")), fixed: [...p].filter((k) => !c.has(k)).map((k) => k.split("|")) };
}
