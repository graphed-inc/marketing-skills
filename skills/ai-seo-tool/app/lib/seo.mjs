// Research features on DataForSEO + Serper (Graphed Tools): Site Explorer, Keywords Explorer,
// SERP + link barrier, Keyword gap → top-20 shortlist, Backlinks.
import { call, dfsResult, chatJson, lanes } from "./tools.mjs";

// DataForSEO location codes, the Serper country (gl) and the language used when none is chosen.
export const LOCATIONS = [
  { code: 2840, name: "United States", gl: "us", lang: "en" }, { code: 2826, name: "United Kingdom", gl: "uk", lang: "en" },
  { code: 2124, name: "Canada", gl: "ca", lang: "en" }, { code: 2036, name: "Australia", gl: "au", lang: "en" },
  { code: 2276, name: "Germany", gl: "de", lang: "de" }, { code: 2250, name: "France", gl: "fr", lang: "fr" },
  { code: 2724, name: "Spain", gl: "es", lang: "es" }, { code: 2528, name: "Netherlands", gl: "nl", lang: "nl" },
  { code: 2380, name: "Italy", gl: "it", lang: "it" }, { code: 2484, name: "Mexico", gl: "mx", lang: "es" },
  { code: 2076, name: "Brazil", gl: "br", lang: "pt" }, { code: 2356, name: "India", gl: "in", lang: "en" },
  { code: 2554, name: "New Zealand", gl: "nz", lang: "en" },
];
export const LANGUAGES = [
  { code: "en", name: "English" }, { code: "es", name: "Spanish" }, { code: "de", name: "German" }, { code: "fr", name: "French" },
  { code: "nl", name: "Dutch" }, { code: "it", name: "Italian" }, { code: "pt", name: "Portuguese" },
];
const locRow = (loc) => LOCATIONS.find((l) => l.code === Number(loc)) || LOCATIONS[0];
export const glOf = (loc) => locRow(loc).gl;
export const locOf = (loc) => locRow(loc).code;
// A known language code, else the location's own language.
export const langOf = (lang, loc) => (LANGUAGES.some((l) => l.code === lang) ? lang : locRow(loc).lang);

export function cleanDomain(d) {
  return String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const rootOf = (d) => cleanDomain(d).split(".").slice(-2).join(".");
const sameSite = (u, domain) => { const h = hostOf(u); const d = cleanDomain(domain); return h === d || h.endsWith("." + d); };
const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
export const BIG = /(^|\.)(youtube|wikipedia|reddit|amazon|linkedin|facebook|google|medium|quora|github|x|twitter|instagram|tiktok|apple|microsoft|forbes|pinterest|yahoo|bing|nytimes|indeed|glassdoor|g2|capterra|trustpilot|yelp|stackoverflow|stackexchange|geeksforgeeks|w3schools|coursera|udemy|hubspot|wix|shopify|wordpress)\.[a-z.]+$/;
const UGC = /(^|\.)(reddit\.com|quora\.com|stackexchange\.com|stackoverflow\.com|medium\.com|linkedin\.com|facebook\.com|youtube\.com|tiktok\.com)$|forum|community|discuss/;

const loclang = (o) => ({ locationCode: locOf(o.loc), languageCode: langOf(o.lang, o.loc) });

// One keyword row from a DataForSEO Labs keyword_data object.
export function kwRow(kd) {
  if (!kd) return null;
  const ki = kd.keyword_info || {}, props = kd.keyword_properties || {}, bl = kd.avg_backlinks_info || {};
  const features = (kd.serp_info && kd.serp_info.serp_item_types) || [];
  return {
    keyword: kd.keyword,
    volume: ki.search_volume ?? null,
    kd: props.keyword_difficulty ?? null,
    cpc: ki.cpc ?? null,
    competition: ki.competition ?? null,
    intent: (kd.search_intent_info && kd.search_intent_info.main_intent) || null,
    trend: (ki.monthly_searches || []).slice(0, 12).reverse().map((m) => m.search_volume || 0),
    yoy: ki.search_volume_trend ? ki.search_volume_trend.yearly : null,
    features,
    aio: features.includes("ai_overview"),
    avgRd: bl.referring_domains != null ? Math.round(bl.referring_domains) : null,
  };
}

// ---------- Site Explorer ----------
export async function rankedKeywords(domain, o, ctx, progress = () => {}) {
  const limit = Math.min(Number(o.limit) || 1000, 10000);
  const rows = [];
  let total = 0, metrics = null;
  for (let offset = 0; offset < limit; offset += 1000) {
    const r = dfsResult(await call("dataforseo:labs.ranked_keywords.live", {
      target: domain, ...loclang(o), limit: Math.min(1000, limit - offset), offset,
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
    }, { ctx, ttlDays: 7 }));
    if (!r) break;
    total = r.total_count || 0;
    metrics = metrics || r.metrics;
    for (const it of r.items || []) {
      const k = kwRow(it.keyword_data);
      const si = (it.ranked_serp_element && it.ranked_serp_element.serp_item) || {};
      const ch = si.rank_changes || {};
      rows.push({
        ...k, pos: si.rank_group ?? null, url: si.url || null, etv: si.etv != null ? Math.round(si.etv * 10) / 10 : null,
        prev: ch.previous_rank_absolute ?? null, isNew: !!ch.is_new, up: !!ch.is_up, down: !!ch.is_down,
      });
    }
    progress(`keywords ${rows.length.toLocaleString()} of ${Math.min(total, limit).toLocaleString()}`);
    if (!r.items || r.items.length < 1000) break;
  }
  return { rows, total, metrics };
}

export async function domainReport(input, ctx, progress) {
  const domain = cleanDomain(input.domain);
  if (!domain.includes(".")) throw new Error("enter a domain, like example.com");
  progress("overview");
  const [ov, bl, tech] = await Promise.all([
    call("dataforseo:labs.domain_rank_overview.live", { target: domain, ...loclang(input) }, { ctx }),
    call("dataforseo:backlinks.summary.live", { target: domain }, { ctx }).catch(() => null),
    call("dataforseo:technologies.domain_technologies.live", { target: domain }, { ctx, ttlDays: 30 }).catch(() => null),
  ]);
  const ovr = dfsResult(ov), item = ovr && ovr.items && ovr.items[0];
  const organic = (item && item.metrics && item.metrics.organic) || {};
  const paid = (item && item.metrics && item.metrics.paid) || {};
  const kw = await rankedKeywords(domain, input, ctx, progress);
  progress("competitors + top pages");
  const [compRaw, pagesRaw] = await Promise.all([
    call("dataforseo:labs.competitors_domain.live", { target: domain, ...loclang(input), limit: 30 }, { ctx }),
    call("dataforseo:labs.relevant_pages.live", { target: domain, ...loclang(input), limit: 300, order_by: ["metrics.organic.etv,desc"] }, { ctx }).catch(() => null),
  ]);
  const comp = dfsResult(compRaw);
  const competitors = ((comp && comp.items) || []).filter((c) => cleanDomain(c.domain) !== domain && !BIG.test(cleanDomain(c.domain))).map((c) => ({
    domain: c.domain, common: c.intersections, avgPos: c.avg_position != null ? Math.round(c.avg_position * 10) / 10 : null,
    keywords: c.full_domain_metrics && c.full_domain_metrics.organic ? c.full_domain_metrics.organic.count : null,
    etv: c.full_domain_metrics && c.full_domain_metrics.organic ? Math.round(c.full_domain_metrics.organic.etv) : null,
  }));
  const pages = new Map();
  for (const r of kw.rows) {
    if (!r.url) continue;
    const p = pages.get(r.url) || { url: r.url, keywords: 0, etv: 0, top: null, topVolume: 0, best: 999 };
    p.keywords++; p.etv += r.etv || 0; p.best = Math.min(p.best, r.pos || 999);
    if ((r.volume || 0) > p.topVolume) { p.top = r.keyword; p.topVolume = r.volume || 0; }
    pages.set(r.url, p);
  }
  const t = dfsResult(tech) || {};
  return {
    domain,
    overview: {
      keywords: organic.count || 0, etv: Math.round(organic.etv || 0), trafficValue: Math.round(organic.estimated_paid_traffic_cost || 0),
      top3: (organic.pos_1 || 0) + (organic.pos_2_3 || 0), top10: (organic.pos_1 || 0) + (organic.pos_2_3 || 0) + (organic.pos_4_10 || 0),
      buckets: ["pos_1", "pos_2_3", "pos_4_10", "pos_11_20", "pos_21_30", "pos_31_40", "pos_41_50", "pos_51_60", "pos_61_70", "pos_71_80", "pos_81_90", "pos_91_100"].map((k) => [k.replace("pos_", "").replace("_", "–"), organic[k] || 0]),
      isNew: organic.is_new || 0, isUp: organic.is_up || 0, isDown: organic.is_down || 0, isLost: organic.is_lost || 0,
      paidKeywords: paid.count || 0, paidEtv: Math.round(paid.etv || 0),
    },
    backlinks: backlinkSummary(dfsResult(bl)),
    tech: { title: t.title || "", description: t.description || "", technologies: t.technologies || {} },
    keywords: kw.rows,
    keywordsTotal: kw.total,
    pages: topPages(dfsResult(pagesRaw), pages),
    pagesTotal: (dfsResult(pagesRaw) || {}).total_count ?? pages.size,
    competitors,
  };
}

// Labs gives traffic + keyword counts for every page; the pulled keywords add the top keyword per page.
function topPages(labs, fromKeywords) {
  const strip = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const known = new Map([...fromKeywords.values()].map((p) => [strip(p.url), p]));
  const rows = ((labs && labs.items) || []).map((it) => {
    const o = (it.metrics && it.metrics.organic) || {}, k = known.get(strip(it.page_address)) || {};
    return { url: it.page_address, etv: Math.round(o.etv || 0), keywords: o.count || 0, top10: (o.pos_1 || 0) + (o.pos_2_3 || 0) + (o.pos_4_10 || 0),
      value: Math.round(o.estimated_paid_traffic_cost || 0), top: k.top || null, topVolume: k.topVolume || null, best: k.best && k.best < 999 ? k.best : null };
  });
  if (rows.length) return rows;
  return [...fromKeywords.values()].map((p) => ({ ...p, etv: Math.round(p.etv), top10: null, value: null })).sort((a, b) => b.etv - a.etv);
}

export function backlinkSummary(b) {
  if (!b) return null;
  const top = (o, n = 8) => Object.entries(o || {}).filter(([k]) => k).sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    target: b.target, rank: b.rank, backlinks: b.backlinks, referringDomains: b.referring_domains,
    referringMainDomains: b.referring_main_domains, nofollowDomains: b.referring_domains_nofollow,
    dofollowDomains: (b.referring_domains || 0) - (b.referring_domains_nofollow || 0),
    referringIps: b.referring_ips, referringSubnets: b.referring_subnets, brokenBacklinks: b.broken_backlinks,
    brokenPages: b.broken_pages, spamScore: b.backlinks_spam_score, firstSeen: b.first_seen,
    tld: top(b.referring_links_tld), platforms: top(b.referring_links_platform_types), attributes: top(b.referring_links_attributes),
    countries: top(b.referring_links_countries), locations: top(b.referring_links_semantic_locations),
  };
}

// ---------- Keywords Explorer ----------
const QUESTION = /^(how|what|why|when|where|who|which|can|does|do|is|are|should|will|could)\b/i;

export async function keywordsReport(input, ctx, progress) {
  const seed = String(input.seed || "").trim().toLowerCase();
  if (!seed) throw new Error("enter a seed keyword");
  const limit = Math.min(Number(input.limit) || 300, 1000);
  const ll = loclang(input);
  progress("ideas + suggestions");
  const [ideas, sugg, rel, ...auto] = await Promise.all([
    call("dataforseo:labs.keyword_ideas.live", { keywords: [seed], ...ll, limit }, { ctx }),
    call("dataforseo:labs.keyword_suggestions.live", { keyword: seed, ...ll, limit, order_by: ["keyword_info.search_volume,desc"] }, { ctx }),
    call("dataforseo:labs.related_keywords.live", { keyword: seed, ...ll, depth: 2, limit: Math.min(limit, 300) }, { ctx }),
    ...["", "how ", "best ", "what ", "why "].map((p) =>
      call("serper:autocomplete", { q: p + seed, gl: glOf(input.loc), hl: ll.languageCode }, { ctx }).catch(() => null)),
  ]);
  const rows = new Map();
  const add = (k, source) => { if (!k || !k.keyword) return; const cur = rows.get(k.keyword); if (cur) { if (!cur.source.includes(source)) cur.source.push(source); } else rows.set(k.keyword, { ...k, source: [source] }); };
  for (const it of (dfsResult(ideas) || {}).items || []) add(kwRow(it), "ideas");
  for (const it of (dfsResult(sugg) || {}).items || []) add(kwRow(it), "suggestions");
  for (const it of (dfsResult(rel) || {}).items || []) add(kwRow(it.keyword_data), "related");
  // Autocomplete has no metrics: look them up in one overview call with the seed.
  const ac = [...new Set(auto.flatMap((a) => ((a && a.suggestions) || []).map((s) => String(s.value).toLowerCase())))].filter((k) => !rows.has(k));
  progress("seed + autocomplete metrics");
  const ov = dfsResult(await call("dataforseo:labs.keyword_overview.live", { keywords: [seed, ...ac].slice(0, 700), ...ll }, { ctx }));
  let seedRow = null;
  for (const it of (ov && ov.items) || []) {
    const k = kwRow(it);
    if (k.keyword === seed) seedRow = k;
    else add(k, "autocomplete");
  }
  for (const k of ac) if (!rows.has(k)) rows.set(k, { keyword: k, volume: null, kd: null, cpc: null, intent: null, trend: [], features: [], aio: false, avgRd: null, source: ["autocomplete"] });
  rows.delete(seed);
  // Ideas come from DataForSEO categories and drift wide ("digital marketing" for "ai marketing agent", typos).
  // Keep an idea only when it shares real words with the seed; suggestions, related and autocomplete always match.
  const STOP = new Set(["the", "for", "and", "with", "how", "what", "best", "free", "top", "near", "you", "your", "are", "can"]);
  const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, ""));
  const seedT = new Set(toks(seed));
  const need = Math.min(2, seedT.size);
  for (const [k, r] of rows) {
    if (r.source.some((s) => s !== "ideas")) continue;
    const hit = new Set(toks(k).filter((w) => seedT.has(w))).size;
    if (hit < need) rows.delete(k);
  }
  const list = [...rows.values()].map((r) => ({ ...r, question: QUESTION.test(r.keyword), source: r.source.join(", ") }))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return { seed, seedRow, keywords: list };
}

// ---------- SERP + link barrier ----------
export async function serpReport(input, ctx, progress = () => {}) {
  const keyword = String(input.keyword || "").trim();
  if (!keyword) throw new Error("enter a keyword");
  const ll = loclang(input);
  const pages = Math.max(1, Math.min(10, Math.ceil((Number(input.depth) || 10) / 10)));
  progress("search results");
  const [ov, dfs, ...sp] = await Promise.all([
    call("dataforseo:labs.keyword_overview.live", { keywords: [keyword], ...ll }, { ctx }).catch(() => null),
    call("dataforseo:serp.google.organic.live.advanced", { query: keyword, ...ll, depth: 10 }, { ctx, ttlDays: 3 }).catch(() => null),
    ...Array.from({ length: pages }, (_, i) => call("serper:search", { q: keyword, gl: glOf(input.loc), hl: ll.languageCode, page: i + 1 }, { ctx, ttlDays: 1 })),
  ]);
  const organic = [];
  sp.forEach((p, i) => ((p && p.organic) || []).forEach((o) => organic.push({
    pos: i * 10 + (o.position || 0), title: o.title, url: o.link, domain: hostOf(o.link), snippet: o.snippet || "", date: o.date || null,
  })));
  const d = dfsResult(dfs) || {};
  const items = d.items || [];
  const aioItem = items.find((i) => i.type === "ai_overview");
  const features = [...new Set(items.map((i) => i.type))];
  const paa = items.filter((i) => i.type === "people_also_ask").flatMap((i) => (i.items || []).map((x) => x.title)).filter(Boolean);
  const metrics = kwRow(((dfsResult(ov) || {}).items || [])[0]);
  const domain = input.domain ? cleanDomain(input.domain) : null;
  const out = {
    keyword, metrics, organic, features, paa,
    aio: aioItem ? { present: true, refs: (aioItem.references || []).map((r) => ({ domain: (r.domain || "").replace(/^www\./, ""), url: r.url, title: r.title, source: r.source })) } : { present: false, refs: [] },
    yourPos: domain ? (organic.find((o) => sameSite(o.url, domain)) || {}).pos || null : null,
    ugcTop5: organic.filter((o) => o.pos <= 5 && UGC.test(o.domain)).length,
    barrier: null,
  };
  if (input.barrier !== false) out.barrier = await linkBarrier(organic.filter((o) => o.pos <= 10), ctx, progress);
  return out;
}

export async function linkBarrier(top, ctx, progress = () => {}) {
  progress(`link barrier: ${top.length} page-1 URLs`);
  // One bulk call for every URL (2.77 credits), not one summary call per URL (27.6). Counts match the summary endpoint.
  const urls = [...new Set(top.map((o) => o.url).filter(Boolean))];
  const bulk = urls.length ? dfsResult(await call("dataforseo:backlinks.bulk_referring_domains.live", { targets: urls }, { ctx, ttlDays: 30 }).catch(() => null)) : null;
  const by = new Map(((bulk && bulk.items) || []).map((x) => [x.target, x]));
  for (const o of top) {
    const b = by.get(o.url);
    o.rd = b ? b.referring_domains || 0 : null;
    o.mainRd = b ? b.referring_main_domains || 0 : null;
    o.dofollowRd = b ? (b.referring_domains || 0) - (b.referring_domains_nofollow || 0) : null;
  }
  const rds = top.map((o) => o.rd).filter((x) => x != null);
  const weakest = top.filter((o) => o.rd != null).sort((a, b) => a.rd - b.rd)[0] || null;
  const med = median(rds), min = rds.length ? Math.min(...rds) : null;
  let verdict = "No data";
  if (min != null) {
    const rd = (k) => `${k} referring domain${k === 1 ? "" : "s"}`;
    if (min <= 5) verdict = `Open: a page-1 result has only ${rd(min)}`;
    else if (min <= 25) verdict = `Beatable: the weakest page-1 result has ${rd(min)}`;
    else if (med <= 100) verdict = `Hard: every page-1 result has ${min}+ referring domains`;
    else verdict = `Very hard: median page-1 result has ${med} referring domains`;
  }
  return { median: med, min, weakest: weakest && { pos: weakest.pos, url: weakest.url, rd: weakest.rd }, verdict, pages: top.map((o) => ({ pos: o.pos, url: o.url, rd: o.rd, dofollowRd: o.dofollowRd, mainRd: o.mainRd })) };
}

// ---------- Keyword gap → shortlist ----------
const INTENT_W = { transactional: 1, commercial: 1, informational: 0.6, navigational: 0.3 };
const FIT_W = [0, 0.08, 0.6, 1];

export async function gapReport(input, ctx, progress) {
  const you = cleanDomain(input.domain);
  const comps = [...new Set((input.competitors || []).map(cleanDomain).filter((d) => d && d !== you))].slice(0, 4);
  if (!you || !comps.length) throw new Error("need your domain and 1–4 competitors");
  const per = Math.min(Number(input.perDomain) || 1000, 5000);
  const minVolume = Number(input.minVolume ?? 50);
  const barrierTop = Math.min(Number(input.barrierTop ?? 10), 40);
  const data = {};
  for (const d of [you, ...comps]) {
    progress(`ranked keywords: ${d}`);
    data[d] = (await rankedKeywords(d, { ...input, limit: d === you ? Math.max(per, 2000) : per }, ctx)).rows;
  }
  const yours = new Map(data[you].map((r) => [r.keyword, r]));
  const brand = new Set([...comps, you].map((d) => rootOf(d).split(".")[0]).concat((input.brandTerms || []).map((s) => String(s).toLowerCase())).filter((s) => s.length > 2));
  const map = new Map();
  for (const d of comps) for (const r of data[d]) {
    if (!r.pos || r.pos > 20) continue;
    const cur = map.get(r.keyword) || { ...r, comps: {}, compUrls: {}, best: 999 };
    cur.comps[d] = r.pos; cur.compUrls[d] = r.url; cur.best = Math.min(cur.best, r.pos);
    map.set(r.keyword, cur);
  }
  let rows = [];
  for (const r of map.values()) {
    const y = yours.get(r.keyword);
    if (y && y.pos && y.pos <= 20) continue;
    if ((r.volume || 0) < minVolume) continue;
    if ([...brand].some((b) => r.keyword.includes(b))) continue;
    rows.push({
      keyword: r.keyword, volume: r.volume, kd: r.kd, cpc: r.cpc, intent: r.intent, aio: r.aio, avgRd: r.avgRd,
      yourPos: y ? y.pos : null, yourUrl: y ? y.url : null, gap: y ? "weak" : "missing",
      comps: r.comps, compUrls: r.compUrls, compCount: Object.keys(r.comps).length, best: r.best,
    });
  }
  rows.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  // Fit check: does this keyword match what the site sells?
  const about = input.about || "";
  const checkN = Math.min(rows.length, 600);
  if (input.fit !== false && checkN) {
    for (let i = 0; i < checkN; i += 120) {
      progress(`fit check ${Math.min(i + 120, checkN)} of ${checkN}`);
      const batch = rows.slice(i, i + 120);
      try {
        const j = await chatJson([{ role: "user", content:
`You judge SEO keyword fit for one business.
Business: ${you}
About: ${about || "(not given — infer from the domain and competitors: " + comps.join(", ") + ")"}

For each keyword, score 0-3: how likely a searcher could become a customer, or the page would earn relevant traffic for this business.
3 = core buyer keyword, 2 = related topic the site should cover, 1 = loose, 0 = unrelated or another brand.
Return JSON only: {"s":[score for keyword 0, score for keyword 1, ...]} in order, ${batch.length} numbers.

${batch.map((r, k) => `${k}. ${r.keyword}`).join("\n")}` }], { ctx });
        (j.s || []).forEach((s, k) => { if (batch[k]) batch[k].fit = Math.max(0, Math.min(3, Number(s) || 0)); });
      } catch { /* fit stays unknown */ }
    }
  }
  for (const r of rows) {
    const fit = r.fit == null ? 2 : r.fit;
    const base = (r.volume || 0) * (INTENT_W[r.intent] ?? 0.6) * (r.aio ? 0.6 : 1) * FIT_W[fit] * (1 + 0.15 * (r.compCount - 1));
    r.score = base / (1 + (r.avgRd || 0) / 20);
  }
  rows = rows.filter((r) => r.fit !== 0);
  rows.sort((a, b) => b.score - a.score);
  // Precise barrier (median + weakest page-1 RDs) for the top candidates only.
  const top = rows.slice(0, barrierTop);
  let n = 0;
  await lanes(top, 2, async (r) => {
    const s = await serpReport({ keyword: r.keyword, loc: input.loc, lang: input.lang, domain: you }, ctx).catch(() => null);
    progress(`link barrier ${++n} of ${top.length}`);
    if (!s || !s.barrier) return;
    r.weakestRd = s.barrier.min; r.medianRd = s.barrier.median; r.verdict = s.barrier.verdict; r.aio = s.aio.present; r.ugcTop5 = s.ugcTop5;
    const fit = r.fit == null ? 2 : r.fit;
    const base = (r.volume || 0) * (INTENT_W[r.intent] ?? 0.6) * (r.aio ? 0.6 : 1) * FIT_W[fit] * (1 + 0.15 * (r.compCount - 1));
    r.score = base / (1 + (s.barrier.min ?? r.avgRd ?? 0) / 5) * (1 + 0.2 * (s.ugcTop5 || 0));
  });
  rows.sort((a, b) => b.score - a.score);
  const max = rows.length ? rows[0].score || 1 : 1;
  rows.forEach((r, i) => { r.score = Math.round((r.score / max) * 100); r.rank = i + 1; r.shortlist = i < 20; });
  return {
    you, competitors: comps,
    counts: Object.fromEntries([you, ...comps].map((d) => [d, data[d].length])),
    candidates: rows.length, missing: rows.filter((r) => r.gap === "missing").length, weak: rows.filter((r) => r.gap === "weak").length,
    rows,
  };
}

// ---------- Backlinks (summary level: Graphed has no full backlink list yet) ----------
export async function backlinksReport(input, ctx, progress) {
  const domains = [...new Set([input.domain, ...(input.competitors || [])].map(cleanDomain).filter(Boolean))].slice(0, 6);
  progress(`backlink summaries for ${domains.length} domains`);
  const out = [];
  await lanes(domains, 3, async (d) => {
    out.push(backlinkSummary(dfsResult(await call("dataforseo:backlinks.summary.live", { target: d }, { ctx }).catch(() => null))) || { target: d });
  });
  out.sort((a, b) => domains.indexOf(cleanDomain(a.target)) - domains.indexOf(cleanDomain(b.target)));
  return { domains: out };
}
