// Rank tracker on Serper (real result URLs, 0.115 credits per 10 results). DataForSEO SERP links
// come back as google.com/goto redirects, so positions come from Serper.
import { q, pool } from "./db.mjs";
import { call, lanes } from "./tools.mjs";
import { glOf, langOf, cleanDomain } from "./seo.mjs";

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const isSite = (host, d) => host === d || host.endsWith("." + d);

export async function checkKeyword(p, keyword, ctx) {
  const depth = [10, 20, 30, 50, 100].includes(Number(p.rank_depth)) ? Number(p.rank_depth) : 20;
  const domain = cleanDomain(p.domain), comps = (p.competitors || []).map(cleanDomain);
  const top = [];
  for (let page = 1; page <= depth / 10; page++) {
    const r = await call("serper:search", { q: keyword, gl: glOf(p.location), hl: langOf(p.language, p.location), page }, { ctx, ttlDays: 0.5 });
    const org = (r && r.organic) || [];
    for (const o of org) top.push({ pos: (page - 1) * 10 + (o.position || 0), domain: hostOf(o.link), url: o.link, title: o.title });
    if (org.length < 5) break; // ran out of results
  }
  const mine = top.find((t) => isSite(t.domain, domain));
  const competitors = {};
  for (const c of comps) { const hit = top.find((t) => isSite(t.domain, c)); competitors[c] = hit ? hit.pos : null; }
  return { position: mine ? mine.pos : null, url: mine ? mine.url : null, depth, competitors, top: top.slice(0, 20) };
}

export async function checkRanks(p, ctx, progress = () => {}, ids = null) {
  const tracked = await q(`SELECT * FROM tracked WHERE project_id = $1 ${ids ? "AND id = ANY($2::int[])" : ""} ORDER BY id`, ids ? [p.id, ids] : [p.id]);
  let done = 0;
  await lanes(tracked, 4, async (t) => {
    const r = await checkKeyword(p, t.keyword, ctx).catch((e) => ({ error: e.message }));
    progress(`checked ${++done} of ${tracked.length}`);
    if (r.error) return;
    await pool.query(
      `INSERT INTO ranks (tracked_id, day, position, url, depth, competitors, top) VALUES ($1, current_date, $2, $3, $4, $5, $6)
       ON CONFLICT (tracked_id, day) DO UPDATE SET position = $2, url = $3, depth = $4, competitors = $5, top = $6`,
      [t.id, r.position, r.url, r.depth, JSON.stringify(r.competitors), JSON.stringify(r.top)]);
  });
  return { checked: tracked.length };
}

export async function rankTable(projectId) {
  const rows = await q(`
    SELECT t.id, t.keyword, t.created_at,
      (SELECT row_to_json(r) FROM (SELECT day, position, url, competitors FROM ranks WHERE tracked_id = t.id ORDER BY day DESC LIMIT 1) r) AS last,
      (SELECT position FROM ranks WHERE tracked_id = t.id AND day <= current_date - 1 ORDER BY day DESC LIMIT 1) AS d1,
      (SELECT position FROM ranks WHERE tracked_id = t.id AND day <= current_date - 7 ORDER BY day DESC LIMIT 1) AS d7,
      (SELECT position FROM ranks WHERE tracked_id = t.id AND day <= current_date - 30 ORDER BY day DESC LIMIT 1) AS d30,
      (SELECT min(position) FROM ranks WHERE tracked_id = t.id) AS best,
      (SELECT coalesce(json_agg(json_build_array(day, position) ORDER BY day), '[]') FROM ranks WHERE tracked_id = t.id AND day > current_date - 60) AS history
    FROM tracked t WHERE t.project_id = $1 ORDER BY t.keyword`, [projectId]);
  return rows.map((r) => {
    const pos = r.last ? r.last.position : null;
    const ch = (old) => (pos != null && old != null ? old - pos : null);
    return { id: r.id, keyword: r.keyword, position: pos, url: r.last ? r.last.url : null, checked: r.last ? r.last.day : null,
      competitors: r.last ? r.last.competitors : {}, change1: ch(r.d1), change7: ch(r.d7), change30: ch(r.d30), best: r.best, history: r.history };
  });
}
