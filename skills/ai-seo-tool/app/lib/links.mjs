// Backlinks explorer + link gap on the DataForSEO backlinks endpoints in Graphed Tools.
import { call, dfsResult, lanes } from "./tools.mjs";
import { cleanDomain, backlinkSummary } from "./seo.mjs";

const day = (s) => (s ? String(s).slice(0, 10) : null);
const monthsAgo = (n) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
const items = (r) => ((dfsResult(r) || {}).items) || [];
const total = (r) => (dfsResult(r) || {}).total_count ?? null;

// One domain: backlinks, referring domains, anchors, top linked pages, history, new / lost per month.
export async function linksReport(input, ctx, progress = () => {}) {
  const domain = cleanDomain(input.domain);
  if (!domain.includes(".")) throw new Error("enter a domain, like example.com");
  const limit = Math.min(Number(input.limit) || 1000, 5000);
  const comps = [...new Set((input.competitors || []).map(cleanDomain).filter((d) => d && d !== domain))].slice(0, 4);
  const filters = input.dofollow ? ["dofollow", "=", true] : undefined;
  const mode = input.allLinks ? "as_is" : "one_per_domain";
  progress("backlinks, referring domains, anchors, pages, history");
  const safe = (p) => p.catch((e) => { console.error("links", e.message); return null; });
  const [sum, bl, rd, an, pg, hist, nl] = await Promise.all([
    safe(call("dataforseo:backlinks.summary.live", { target: domain }, { ctx })),
    safe(call("dataforseo:backlinks.backlinks.live", { target: domain, limit, mode, order_by: ["rank,desc"], backlinks_status_type: "live", ...(filters ? { filters } : {}) }, { ctx })),
    safe(call("dataforseo:backlinks.referring_domains.live", { target: domain, limit, order_by: ["rank,desc"] }, { ctx })),
    safe(call("dataforseo:backlinks.anchors.live", { target: domain, limit: 300, order_by: ["backlinks,desc"] }, { ctx })),
    safe(call("dataforseo:backlinks.domain_pages_summary.live", { target: domain, limit: 300, order_by: ["referring_domains,desc"] }, { ctx })),
    safe(call("dataforseo:backlinks.history.live", { target: domain, date_from: monthsAgo(24) }, { ctx })),
    safe(call("dataforseo:backlinks.timeseries_new_lost_summary.live", { target: domain, date_from: monthsAgo(12), date_to: new Date().toISOString().slice(0, 10), group_range: "month" }, { ctx })),
  ]);
  if (!bl && !rd) throw new Error("backlink data is not available for this domain");
  const compare = [];
  if (comps.length) {
    progress(`comparing with ${comps.length} competitors`);
    await lanes(comps, 4, async (d) => { compare.push(backlinkSummary(dfsResult(await safe(call("dataforseo:backlinks.summary.live", { target: d }, { ctx })))) || { target: d }); });
    compare.sort((a, b) => comps.indexOf(cleanDomain(a.target)) - comps.indexOf(cleanDomain(b.target)));
  }
  const summary = backlinkSummary(dfsResult(sum));
  return {
    domain, summary, compare: summary ? [summary, ...compare] : compare,
    totals: { backlinks: total(bl), referringDomains: total(rd), anchors: total(an), pages: total(pg) },
    backlinks: items(bl).map((b) => ({
      from: b.url_from, domainFrom: String(b.domain_from || "").replace(/^www\./, ""), title: b.page_from_title || "", to: b.url_to, anchor: b.anchor || b.alt || "",
      dofollow: !!b.dofollow, domainRank: b.domain_from_rank ?? null, rank: b.rank ?? null, firstSeen: day(b.first_seen), lastSeen: day(b.last_seen),
      isNew: !!b.is_new, isLost: !!b.is_lost, spam: b.backlink_spam_score ?? null, type: b.item_type || "anchor", location: b.semantic_location || "",
    })),
    referringDomains: items(rd).map((d) => ({
      domain: d.domain, rank: d.rank ?? null, backlinks: d.backlinks ?? 0, firstSeen: day(d.first_seen), lost: day(d.lost_date), spam: d.backlinks_spam_score ?? null,
      dofollow: (d.referring_pages || 0) > (d.referring_pages_nofollow || 0),
    })),
    anchors: items(an).map((a) => ({ anchor: a.anchor || "(empty)", backlinks: a.backlinks ?? 0, referringDomains: a.referring_domains ?? 0, rank: a.rank ?? null, firstSeen: day(a.first_seen) })),
    pages: items(pg).map((p) => ({ url: p.url, rank: p.rank ?? null, backlinks: p.backlinks ?? 0, referringDomains: p.referring_domains ?? 0, dofollowDomains: (p.referring_domains || 0) - (p.referring_domains_nofollow || 0), firstSeen: day(p.first_seen) })),
    history: items(hist).map((h) => ({ date: day(h.date), rank: h.rank ?? null, backlinks: h.backlinks ?? 0, referringDomains: h.referring_domains ?? 0 })),
    newLost: items(nl).map((h) => ({ date: day(h.date), newRd: h.new_referring_domains ?? 0, lostRd: h.lost_referring_domains ?? 0, newBacklinks: h.new_backlinks ?? 0, lostBacklinks: h.lost_backlinks ?? 0 })),
  };
}

// Link gap: sites that link to your competitors and not to you.
export async function linkGapReport(input, ctx, progress = () => {}) {
  const you = cleanDomain(input.domain);
  const comps = [...new Set((input.competitors || []).map(cleanDomain).filter((d) => d && d !== you))].slice(0, 4);
  if (!you || !comps.length) throw new Error("need your domain and 1–4 competitors");
  const limit = Math.min(Number(input.limit) || 1000, 5000);
  progress(`sites that link to ${comps.join(", ")} and not to ${you}`);
  // One call per competitor (sites that link to it and not to you), plus one call for the sites that link to
  // every competitor. DataForSEO's own intersection only returns sites that link to 2 or more targets.
  const one = (targets, order) => call("dataforseo:backlinks.domain_intersection.live", { targets, exclude_targets: [you], limit, order_by: [order] }, { ctx }).then(dfsResult).catch((e) => { console.error("linkgap", e.message); return null; });
  const [all, ...singles] = await Promise.all([
    comps.length > 1 ? one(Object.fromEntries(comps.map((d, i) => [String(i + 1), d])), "1.rank,desc") : Promise.resolve(null),
    ...comps.map((c) => one({ 1: c }, "1.rank,desc")),
  ]);
  const map = new Map();
  const add = (v, comp) => {
    if (!v || !v.backlinks || !v.target) return;
    const x = map.get(v.target) || { domain: v.target, rank: 0, links: {}, spam: 0, dofollow: false, firstSeen: null };
    x.links[comp] = v.backlinks; x.rank = Math.max(x.rank, v.rank || 0); x.spam = Math.max(x.spam, v.backlinks_spam_score || 0);
    if ((v.referring_pages || 0) > (v.referring_pages_nofollow || 0)) x.dofollow = true;
    const f = day(v.first_seen); if (f && (!x.firstSeen || f > x.firstSeen)) x.firstSeen = f;
    map.set(v.target, x);
  };
  singles.forEach((r, i) => ((r && r.items) || []).forEach((it) => add((it.domain_intersection || {})["1"], comps[i])));
  ((all && all.items) || []).forEach((it) => comps.forEach((c, i) => add((it.domain_intersection || {})[String(i + 1)], c)));
  if (!map.size && singles.every((r) => !r)) throw new Error("link gap data is not available for these domains");
  const rows = [...map.values()].map((x) => ({ ...x, count: Object.keys(x.links).length }));
  rows.sort((a, b) => b.count - a.count || b.rank - a.rank);
  return {
    you, competitors: comps, rows,
    total: rows.length, perCompetitor: Object.fromEntries(comps.map((c, i) => [c, (singles[i] && singles[i].total_count) ?? null])),
    all: comps.length > 1 ? ((all && all.total_count) ?? rows.filter((x) => x.count === comps.length).length) : rows.length, multi: rows.filter((x) => x.count >= 2).length,
  };
}
