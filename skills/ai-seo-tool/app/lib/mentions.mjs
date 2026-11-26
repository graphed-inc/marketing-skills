// AI mentions: DataForSEO's database of Google AI Overview and ChatGPT answers that mention a
// domain or a keyword. No prompts are run; this reads what the engines already answered.
import { call, dfsResult } from "./tools.mjs";
import { cleanDomain, langOf } from "./seo.mjs";

const host = (d) => String(d || "").replace(/^www\./, "");
const group = (arr) => (arr || []).map((g) => ({ key: g.key, mentions: g.mentions || 0, volume: g.ai_search_volume || 0 }));

export async function mentionsReport(input, ctx, progress = () => {}) {
  const raw = String(input.target || "").trim();
  if (!raw) throw new Error("enter a domain or a keyword");
  const isDomain = /^[^\s]+\.[a-z]{2,}$/i.test(raw.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  const entity = isDomain ? { domain: cleanDomain(raw) } : { keyword: raw.toLowerCase() };
  const label = isDomain ? entity.domain : entity.keyword;
  const L = { locationCode: Number(input.loc) || 2840, languageCode: langOf(input.lang, input.loc) };
  const limit = Math.min(Number(input.limit) || 100, 500);
  const platforms = (input.platforms && input.platforms.length ? input.platforms : ["google", "chat_gpt"]).filter((p) => ["google", "chat_gpt"].includes(p));
  progress(`AI answers that mention ${label}`);
  const safe = (p) => p.catch((e) => { console.error("mentions", e.message); return null; });
  const [agg, top, ...searches] = await Promise.all([
    safe(call("dataforseo:ai_optimization.llm_mentions.aggregated_metrics.live", { target: [entity], ...L }, { ctx, ttlDays: 14 })),
    safe(call("dataforseo:ai_optimization.llm_mentions.top_pages.live", { target: [entity], ...L, limit: 50 }, { ctx, ttlDays: 14 })),
    ...platforms.map((platform) => safe(call("dataforseo:ai_optimization.llm_mentions.search.live", { target: [entity], platform, ...L, limit, order_by: ["ai_search_volume,desc"] }, { ctx, ttlDays: 14 }))),
  ]);
  const a = (dfsResult(agg) || {}).total || {};
  const questions = [];
  let found = 0;
  searches.forEach((s, i) => {
    const r = dfsResult(s) || {};
    found += r.total_count || 0;
    for (const it of r.items || []) {
      const sources = (it.sources || []).map((x) => ({ domain: host(x.domain), url: x.url, title: x.title || x.source_name || "" }));
      const pos = isDomain ? sources.findIndex((x) => x.domain === entity.domain || x.domain.endsWith("." + entity.domain)) : -1;
      questions.push({
        question: it.question, platform: it.platform || platforms[i], model: it.model_name || "", volume: it.ai_search_volume ?? null,
        answer: String(it.answer || "").slice(0, 4000), sources, sourceCount: sources.length, yourPosition: pos >= 0 ? pos + 1 : null,
        brands: (it.brand_entities || []).map((b) => b.title || b.name).filter(Boolean), firstSeen: String(it.first_response_at || "").slice(0, 10), lastSeen: String(it.last_response_at || "").slice(0, 10),
      });
    }
  });
  questions.sort((x, y) => (y.volume || 0) - (x.volume || 0));
  // Merge www. and bare host in the cited-domain totals.
  const dom = new Map();
  for (const g of group(a.sources_domain)) { const k = host(g.key); const c = dom.get(k) || { domain: k, mentions: 0, volume: 0 }; c.mentions += g.mentions; c.volume += g.volume; dom.set(k, c); }
  const platformsOut = group(a.platform);
  return {
    target: label, kind: isDomain ? "domain" : "keyword",
    mentions: platformsOut.reduce((s, p) => s + p.mentions, 0), volume: platformsOut.reduce((s, p) => s + p.volume, 0), found,
    platforms: platformsOut,
    citedDomains: [...dom.values()].sort((x, y) => y.mentions - x.mentions).slice(0, 60).map((d) => ({ ...d, you: isDomain && (d.domain === entity.domain || d.domain.endsWith("." + entity.domain)) })),
    brands: group(a.brand_entities_title).slice(0, 40),
    topPages: (((dfsResult(top) || {}).items) || []).map((p) => ({ url: p.key, mentions: (p.platform || []).reduce((s, x) => s + (x.mentions || 0), 0), volume: (p.platform || []).reduce((s, x) => s + (x.ai_search_volume || 0), 0),
      google: ((p.platform || []).find((x) => x.key === "google") || {}).mentions || 0, chatgpt: ((p.platform || []).find((x) => x.key === "chat_gpt") || {}).mentions || 0 })),
    questions,
  };
}
