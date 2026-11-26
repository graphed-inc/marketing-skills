// Saved keyword lists.
import { pool, q, one } from "./db.mjs";
import { call, dfsResult } from "./tools.mjs";
import { kwRow, locOf, langOf } from "./seo.mjs";

const FIELDS = ["volume", "kd", "cpc", "intent", "avgRd", "aio", "trend"];
const slim = (k) => Object.fromEntries(FIELDS.filter((f) => k[f] !== undefined && k[f] !== null).map((f) => [f, k[f]]));

export const allLists = () => q(`SELECT l.*, (SELECT count(*)::int FROM list_keywords k WHERE k.list_id = l.id) AS keywords FROM lists l ORDER BY l.name`);
export async function createList(name) {
  name = String(name || "").trim().slice(0, 120);
  if (!name) throw new Error("name the list");
  return one("INSERT INTO lists (name) VALUES ($1) RETURNING *", [name]);
}
export const listRows = async (id) => (await q("SELECT keyword, metrics, added_at FROM list_keywords WHERE list_id = $1 ORDER BY keyword", [id])).map((r) => ({ keyword: r.keyword, ...r.metrics, added: r.added_at }));

// items: strings or { keyword, volume, kd, … }. Existing metrics are kept when the new item has none.
export async function addKeywords(id, items) {
  let n = 0;
  for (const it of (items || []).slice(0, 5000)) {
    const kw = String(typeof it === "string" ? it : it.keyword || it.query || "").trim().toLowerCase();
    if (!kw) continue;
    const m = typeof it === "string" ? {} : slim(it);
    await pool.query(`INSERT INTO list_keywords (list_id, keyword, metrics) VALUES ($1, $2, $3)
      ON CONFLICT (list_id, keyword) DO UPDATE SET metrics = list_keywords.metrics || EXCLUDED.metrics`, [id, kw, JSON.stringify(m)]);
    n++;
  }
  return n;
}
export const removeKeywords = (id, kws) => pool.query("DELETE FROM list_keywords WHERE list_id = $1 AND keyword = ANY($2::text[])", [id, kws]);

// Fresh volume / KD / CPC / intent for the whole list (one call per 700 keywords).
export async function refreshList(id, { loc = 2840, lang } = {}, ctx = {}) {
  const kws = (await q("SELECT keyword FROM list_keywords WHERE list_id = $1", [id])).map((r) => r.keyword);
  let n = 0;
  for (let i = 0; i < kws.length; i += 700) {
    const r = dfsResult(await call("dataforseo:labs.keyword_overview.live", { keywords: kws.slice(i, i + 700), locationCode: locOf(loc), languageCode: langOf(lang, loc) }, { ctx, ttlDays: 1 }));
    for (const it of (r && r.items) || []) { const k = kwRow(it); await pool.query("UPDATE list_keywords SET metrics = metrics || $3 WHERE list_id = $1 AND keyword = $2", [id, k.keyword, JSON.stringify(slim(k))]); n++; }
  }
  return { refreshed: n, keywords: kws.length };
}

// Which domains rank for the keywords of a list (up to 200 keywords, one call).
export async function listCompetitors(id, { loc = 2840, lang } = {}, ctx = {}) {
  const kws = (await q("SELECT keyword FROM list_keywords WHERE list_id = $1 ORDER BY (metrics->>'volume')::float DESC NULLS LAST LIMIT 200", [id])).map((r) => r.keyword);
  if (!kws.length) return { keywords: 0, domains: [] };
  const r = dfsResult(await call("dataforseo:labs.serp_competitors.live", { keywords: kws, locationCode: locOf(loc), languageCode: langOf(lang, loc), limit: 100 }, { ctx, ttlDays: 3 }));
  return { keywords: kws.length, domains: ((r && r.items) || []).map((d) => ({ domain: d.domain, keywords: d.keywords_count, avgPos: d.avg_position != null ? Math.round(d.avg_position * 10) / 10 : null, etv: Math.round(d.etv || 0), visibility: d.visibility != null ? Math.round(d.visibility * 100) / 100 : null })) };
}
