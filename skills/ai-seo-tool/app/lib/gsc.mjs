// Search Console + GA4 from the Graphed warehouse (synced by Graphed connectors). Free: no Tools credits.
import { wh } from "./tools.mjs";
import { cleanDomain } from "./seo.mjs";

const ident = (s) => { if (!/^[a-z0-9_]+$/i.test(String(s || ""))) throw new Error(`bad schema name: ${s}`); return s; };
const cache = new Map();
async function cached(key, ms, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ms) return c.v;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  return v;
}

// Every Search Console site and GA4 property in the account warehouse.
export async function sources() {
  return cached("sources", 10 * 60_000, async () => {
    const t = await wh(`SELECT database, name FROM system.tables WHERE name IN ('keyword_page_report', 'page_engagement_report', 'properties')`);
    const gscDbs = [...new Set(t.filter((r) => r.name === "keyword_page_report").map((r) => r.database))];
    const ga4Dbs = [...new Set(t.filter((r) => r.name === "page_engagement_report").map((r) => r.database))]
      .filter((db) => t.some((r) => r.database === db && r.name === "properties"));
    const gsc = [], ga4 = [];
    for (const db of gscDbs) {
      for (const r of await wh(`SELECT site, max(date) AS last FROM ${ident(db)}.keyword_site_report_by_site GROUP BY site`).catch(() => [])) gsc.push({ schema: db, site: r.site, last: r.last });
    }
    for (const db of ga4Dbs) {
      for (const r of await wh(`SELECT name, display_name FROM ${ident(db)}.properties`).catch(() => [])) ga4.push({ schema: db, property: r.name, name: r.display_name });
    }
    return { gsc, ga4 };
  });
}

// Best Search Console site + GA4 property for a domain.
export async function detect(domain) {
  const d = cleanDomain(domain);
  const s = await sources().catch(() => ({ gsc: [], ga4: [] }));
  const g = s.gsc.find((x) => cleanDomain(String(x.site).replace(/^sc-domain:/, "")) === d) || s.gsc.find((x) => String(x.site).includes(d));
  const a = s.ga4.find((x) => String(x.name || "").toLowerCase().includes(d)) || s.ga4.find((x) => String(x.name || "").toLowerCase().includes(d.split(".")[0]));
  return { gsc_schema: g ? g.schema : null, gsc_site: g ? g.site : null, ga4_schema: a ? a.schema : null, ga4_property: a ? a.property : null };
}

const pathOf = (u) => { try { return new URL(u).pathname; } catch { return u; } };

export async function gscReport(p, { days = 28 } = {}) {
  if (!p.gsc_schema || !p.gsc_site) return { connected: false };
  const db = ident(p.gsc_schema);
  const n = Math.max(7, Math.min(Number(days) || 28, 180));
  const P = { site: p.gsc_site, n, n2: n * 2 };
  return cached(`gsc:${p.id}:${p.gsc_site}:${p.ga4_property}:${n}:${(p.brand_terms || []).join(",")}`, 10 * 60_000, async () => {
    const brand = [cleanDomain(p.domain).split(".")[0], ...(p.brand_terms || [])].map((s) => String(s).toLowerCase()).filter((s) => s.length > 2);
    const brandSql = brand.length ? `AND NOT multiSearchAny(lower(query), [${brand.map((b) => `'${b.replace(/'/g, "")}'`).join(",")}])` : "";
    const cur = `date > today() - ${n}`;
    const prev = `date <= today() - ${n} AND date > today() - ${n * 2}`;
    // Output aliases (clk / impr / pos) must not reuse column names: ClickHouse resolves aliases inside aggregates.
    const W = `site = %(site)s AND search_type = 'web'`;
    const POS = (c = "") => `round(sum${c ? "If" : ""}(position * impressions${c ? ", " + c : ""}) / nullIf(sum${c ? "If" : ""}(impressions${c ? ", " + c : ""}), 0), 1)`;
    const [totals, daily, almost, lost, cannibal, pages] = await Promise.all([
      wh(`SELECT if(${cur}, 'cur', 'prev') AS period, sum(clicks) AS clk, sum(impressions) AS impr, ${POS()} AS pos
          FROM ${db}.site_report_by_site WHERE ${W} AND date > today() - ${n * 2} GROUP BY period`, P),
      wh(`SELECT toString(date) AS day, sum(clicks) AS clk, sum(impressions) AS impr
          FROM ${db}.site_report_by_site WHERE ${W} AND ${cur} GROUP BY date ORDER BY date`, P),
      wh(`SELECT query, sum(clicks) AS clk, sum(impressions) AS impr, ${POS()} AS pos, argMax(page, impressions) AS top_page
          FROM ${db}.keyword_page_report WHERE ${W} AND ${cur} ${brandSql}
          GROUP BY query HAVING pos >= 8 AND pos <= 20 ORDER BY impr DESC LIMIT 300`, P),
      wh(`SELECT query, sumIf(clicks, ${cur}) AS clk, sumIf(clicks, ${prev}) AS prev_clk, toInt64(clk) - toInt64(prev_clk) AS diff,
            ${POS(cur)} AS pos, ${POS(prev)} AS prev_pos
          FROM ${db}.keyword_site_report_by_site WHERE ${W} AND date > today() - ${n * 2}
          GROUP BY query HAVING prev_clk >= 3 AND diff < 0 ORDER BY diff ASC LIMIT 200`, P),
      wh(`SELECT query, uniqExact(page) AS npages, sum(imp) AS impr, sum(c) AS clk, groupArray(5)(tuple(page, imp, ps)) AS urls
          FROM (SELECT query, page, sum(impressions) AS imp, ${POS()} AS ps, sum(clicks) AS c
                FROM ${db}.keyword_page_report WHERE ${W} AND ${cur}
                GROUP BY query, page HAVING imp >= 20 ORDER BY imp DESC)
          GROUP BY query HAVING npages >= 2 ORDER BY impr DESC LIMIT 150`, P),
      wh(`SELECT page, sum(clicks) AS clk, sum(impressions) AS impr, ${POS()} AS pos, uniqExact(query) AS nq
          FROM ${db}.keyword_page_report WHERE ${W} AND ${cur}
          GROUP BY page ORDER BY clk DESC LIMIT 500`, P),
    ]);
    const t = Object.fromEntries(totals.map((r) => [r.period, r]));
    let ga4 = null;
    if (p.ga4_schema && p.ga4_property) {
      const g = ident(p.ga4_schema), GP = { prop: p.ga4_property, n };
      const [eng, conv, chan] = await Promise.all([
        wh(`SELECT page_path, sum(sessions) AS sessions, sum(engaged_sessions) AS engaged, round(avg(engagement_rate), 3) AS rate
            FROM ${g}.page_engagement_report WHERE property = %(prop)s AND date > today() - ${n} GROUP BY page_path`, GP).catch(() => []),
        wh(`SELECT page_path, sum(key_events) AS key_events, sum(total_revenue) AS revenue, sum(screen_page_views) AS views
            FROM ${g}.pages_path_report WHERE property = %(prop)s AND date > today() - ${n} GROUP BY page_path`, GP).catch(() => []),
        wh(`SELECT session_source_medium AS source, sum(sessions) AS sessions
            FROM ${g}.landing_page_daily_session_source_medium WHERE property = %(prop)s AND date > today() - ${n}
            GROUP BY source ORDER BY sessions DESC LIMIT 15`, GP).catch(() => []),
      ]);
      const e = new Map(eng.map((r) => [r.page_path, r])), c = new Map(conv.map((r) => [r.page_path, r]));
      for (const r of pages) {
        r.clicks = r.clk; r.impressions = r.impr; r.position = r.pos; r.queries = r.nq; delete r.clk; delete r.impr; delete r.pos; delete r.nq;
        const path = pathOf(r.page), x = e.get(path) || {}, y = c.get(path) || {};
        Object.assign(r, { sessions: Number(x.sessions || 0), engaged: Number(x.engaged || 0), rate: x.rate != null ? Number(x.rate) : null, keyEvents: Number(y.key_events || 0), revenue: Number(y.revenue || 0) });
      }
      ga4 = {
        sessions: eng.reduce((s, r) => s + Number(r.sessions || 0), 0), engaged: eng.reduce((s, r) => s + Number(r.engaged || 0), 0),
        keyEvents: conv.reduce((s, r) => s + Number(r.key_events || 0), 0), revenue: conv.reduce((s, r) => s + Number(r.revenue || 0), 0),
        sources: chan.map((r) => ({ source: r.source, sessions: Number(r.sessions) })),
        organicSessions: chan.filter((r) => /google \/ organic|organic/i.test(r.source)).reduce((s, r) => s + Number(r.sessions), 0),
      };
    }
    const num = (o) => o && { clicks: Number(o.clk || 0), impressions: Number(o.impr || 0), position: o.pos != null ? Number(o.pos) : null };
    return {
      connected: true, site: p.gsc_site, days: n, ga4Connected: !!ga4, ga4,
      totals: { cur: num(t.cur) || { clicks: 0, impressions: 0, position: null }, prev: num(t.prev) || { clicks: 0, impressions: 0, position: null } },
      daily: daily.map((r) => ({ day: r.day, clicks: Number(r.clk), impressions: Number(r.impr) })),
      almostThere: almost.map((r) => ({ query: r.query, clicks: Number(r.clk), impressions: Number(r.impr), position: Number(r.pos), page: r.top_page })),
      lost: lost.map((r) => ({ query: r.query, clicks: Number(r.clk), prevClicks: Number(r.prev_clk), change: Number(r.diff), position: r.pos != null ? Number(r.pos) : null, prevPosition: r.prev_pos != null ? Number(r.prev_pos) : null })),
      cannibal: cannibal.map((r) => ({ query: r.query, pages: Number(r.npages), impressions: Number(r.impr), clicks: Number(r.clk), urls: (r.urls || []).map((u) => (Array.isArray(u) ? { page: u[0], impressions: Number(u[1]), position: Number(u[2]) } : u)) })),
      pages: pages.map((r) => { const o = { ...r, clicks: Number(r.clk ?? r.clicks), impressions: Number(r.impr ?? r.impressions), position: Number(r.pos ?? r.position), queries: Number(r.nq ?? r.queries) }; delete o.clk; delete o.impr; delete o.pos; delete o.nq; return o; }),
    };
  });
}

// Top queries for rank-tracker import.
export async function topQueries(p, limit = 50) {
  if (!p.gsc_schema || !p.gsc_site) return [];
  const rows = await wh(`SELECT query, sum(impressions) AS impr FROM ${ident(p.gsc_schema)}.keyword_site_report_by_site
    WHERE site = %(site)s AND search_type = 'web' AND date > today() - 28 GROUP BY query ORDER BY impr DESC LIMIT ${Math.max(1, Math.min(Number(limit) || 50, 1000))}`, { site: p.gsc_site });
  return rows.map((r) => r.query);
}
