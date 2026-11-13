// @ts-nocheck
// Positioning gaps, part 2: score the persona × theme matrix and write creative for open cells.
//
// demand   = how strongly customers raise this (sum of voice_tags intensity; distinct voices shown)
// coverage = how hard competitor ads already push it (sum of ad_tags strength; distinct ads shown)
// gap      = demand_norm × (1 − coverage_norm): loud with customers, quiet in the ads.
import { q, one, pool } from "./db/sql";
import { llm, usageCredits, writerModel } from "./tools";
import { parseJson } from "./analyze";

export const currentMarket = () => one("SELECT * FROM markets ORDER BY id DESC LIMIT 1");

// Ad filter shared by the matrix and the cell drawer.
function adFilter(f, params) {
  const w = [];
  if (f.brand) { params.push(Number(f.brand)); w.push(`a.brand_id = $${params.length}`); }
  if (f.platform) { params.push(f.platform); w.push(`a.platform = $${params.length}`); }
  if (f.active) w.push("a.is_active");
  return w.length ? ` AND ${w.join(" AND ")}` : "";
}

export function score(cells) {
  const maxD = Math.max(0, ...cells.map((c) => c.weight));
  const maxC = Math.max(0, ...cells.map((c) => c.strength));
  for (const c of cells) {
    c.d = maxD ? c.weight / maxD : 0;
    c.c = maxC ? c.strength / maxC : 0;
    c.gap = +(c.d * (1 - c.c)).toFixed(3);
    c.crowded = c.c >= 0.5 && c.d < 0.25;
  }
  return cells;
}

export async function matrix(marketId, f = {}) {
  const personas = await q("SELECT id, name, description FROM personas WHERE market_id = $1 ORDER BY position, id", [marketId]);
  const themes = await q("SELECT id, kind, name, description FROM themes WHERE market_id = $1 ORDER BY position, id", [marketId]);
  const demand = await q(
    `SELECT vt.persona_id p, vt.theme_id t, count(DISTINCT vt.voice_id)::int voices, sum(vt.intensity)::int weight
     FROM voice_tags vt JOIN voices v ON v.id = vt.voice_id WHERE v.market_id = $1 GROUP BY 1, 2`, [marketId]);
  const params = [marketId];
  const af = adFilter(f, params);
  const cover = await q(
    `SELECT t.persona_id p, t.theme_id t, count(DISTINCT t.ad_id)::int ads, sum(t.strength)::int strength
     FROM ad_tags t JOIN ads a ON a.id = t.ad_id WHERE t.market_id = $1 ${af} GROUP BY 1, 2`, params);
  const key = (p, t) => `${p}:${t}`;
  const dm = new Map(demand.map((r) => [key(r.p, r.t), r]));
  const cm = new Map(cover.map((r) => [key(r.p, r.t), r]));
  const cells = [];
  for (const p of personas) for (const t of themes) {
    const d = dm.get(key(p.id, t.id)); const c = cm.get(key(p.id, t.id));
    cells.push({ p: p.id, t: t.id, voices: d?.voices || 0, weight: d?.weight || 0, ads: c?.ads || 0, strength: c?.strength || 0 });
  }
  score(cells);
  const name = (id, list) => list.find((x) => x.id === id)?.name;
  const gaps = cells.filter((c) => c.voices >= 2).sort((a, b) => b.gap - a.gap).slice(0, 6)
    .map((c) => ({ ...c, persona: name(c.p, personas), theme: name(c.t, themes), kind: themes.find((t) => t.id === c.t)?.kind }));
  for (const g of gaps) {
    g.quote = (await one(
      `SELECT vt.quote, v.source, v.url FROM voice_tags vt JOIN voices v ON v.id = vt.voice_id
       WHERE vt.persona_id = $1 AND vt.theme_id = $2 AND vt.quote IS NOT NULL ORDER BY vt.intensity DESC, v.score DESC NULLS LAST LIMIT 1`, [g.p, g.t])) || null;
  }
  const mapped = await one(
    `SELECT count(*)::int n FROM ad_mapped m JOIN ads a ON a.id = m.ad_id WHERE m.market_id = $1 ${af}`, params);
  const sources = await q("SELECT source, count(*)::int n FROM voices WHERE market_id = $1 GROUP BY 1 ORDER BY 2 DESC", [marketId]);
  const tagged = await one("SELECT count(DISTINCT vt.voice_id)::int n FROM voice_tags vt JOIN voices v ON v.id = vt.voice_id WHERE v.market_id = $1", [marketId]);
  return { personas, themes, cells, gaps, adsMapped: mapped.n, sources, voicesTagged: tagged.n };
}

export async function cell(marketId, p, t, f = {}) {
  const persona = await one("SELECT * FROM personas WHERE id = $1 AND market_id = $2", [p, marketId]);
  const theme = await one("SELECT * FROM themes WHERE id = $1 AND market_id = $2", [t, marketId]);
  if (!persona || !theme) return null;
  const quotes = await q(
    `SELECT vt.quote, vt.intensity, v.source, v.url, v.title, left(v.text, 600) text, v.score
     FROM voice_tags vt JOIN voices v ON v.id = vt.voice_id
     WHERE vt.persona_id = $1 AND vt.theme_id = $2 ORDER BY vt.intensity DESC, v.score DESC NULLS LAST LIMIT 40`, [p, t]);
  const params = [marketId, p, t];
  const af = adFilter(f, params);
  const ads = await q(
    `SELECT a.id, t.strength, t.reason FROM ad_tags t JOIN ads a ON a.id = t.ad_id
     WHERE t.market_id = $1 AND t.persona_id = $2 AND t.theme_id = $3 ${af} ORDER BY t.strength DESC, a.days_running DESC NULLS LAST LIMIT 30`, params);
  const briefs = await q("SELECT id, status, content, error, created_at FROM briefs WHERE market_id = $1 AND persona_id = $2 AND theme_id = $3 ORDER BY id DESC", [marketId, p, t]);
  return { persona, theme, quotes, ads, briefs };
}

// Write ad concepts for one cell (background; the UI polls the brief row).
export async function startBrief(marketId, p, t) {
  const b = await one("INSERT INTO briefs (market_id, persona_id, theme_id) VALUES ($1,$2,$3) RETURNING id", [marketId, p, t]);
  writeBrief(b.id, marketId, p, t).catch(async (e) => {
    await pool.query("UPDATE briefs SET status = 'error', error = $2 WHERE id = $1", [b.id, String(e.message || e).slice(0, 400)]);
  });
  return b.id;
}

async function writeBrief(id, marketId, p, t) {
  const m = await one("SELECT * FROM markets WHERE id = $1", [marketId]);
  const c = await cell(marketId, p, t);
  const prof = m.profile || {};
  // What competitors already say to this persona, and about this theme (to stay clear of it).
  const near = await q(
    `SELECT DISTINCT ON (a.id) b.name brand, a.hook, a.angle, a.creative_style FROM ad_tags t JOIN ads a ON a.id = t.ad_id JOIN brands b ON b.id = a.brand_id
     WHERE t.market_id = $1 AND (t.persona_id = $2 OR t.theme_id = $3) AND a.hook IS NOT NULL ORDER BY a.id, t.strength DESC LIMIT 25`, [marketId, p, t]);
  const styles = await q("SELECT creative_style k, count(*)::int n FROM ads WHERE creative_style IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6");
  const res = await llm().chat.completions.create({
    model: writerModel(), temperature: 0.7, max_tokens: 5000, response_format: { type: "json_object" },
    messages: [{ role: "user", content: `You are a direct-response creative strategist. Write ad concepts for an OPEN position in the market.

Our company: ${prof.name} — ${prof.one_liner} (${m.url})
What it does: ${(prof.jobs || []).join("; ")}

The gap: persona "${c.persona.name}" (${c.persona.description}) × ${c.theme.kind} "${c.theme.name}" (${c.theme.description}).
Customers raise this a lot; competitor ads barely say it (${c.ads.length} competitor ads touch it).

What customers say, verbatim:
${c.quotes.slice(0, 18).map((x) => `- "${x.quote || x.text.slice(0, 200)}" (${x.source})`).join("\n")}

What competitors' ads already say to this persona or theme (do NOT copy these angles; be different):
${near.map((x) => `- ${x.brand}: hook "${x.hook}" · angle: ${x.angle} · ${x.creative_style}`).join("\n") || "- (nothing)"}
Most common competitor formats: ${styles.map((s) => `${s.k} (${s.n})`).join(", ")}

Write 3 distinct concepts. Use the customers' own words in hooks. Each must be something no competitor ad above says.
Prefer at least one format competitors rarely use.
Return JSON {"positioning":"one sentence: the open position to own","concepts":[{"title":"","format":"e.g. UGC talking head / static / carousel / founder video","hook":"first line or first 3 seconds, verbatim","angle":"","script":["4-7 short lines: VO / on-screen beats"],"visual":"what we see","cta":"","why_open":"why competitors leave this open, in one line","customer_words":["2-3 exact phrases from the quotes it uses"]}]}` }],
  });
  const content = parseJson(res.choices?.[0]?.message?.content);
  const credits = usageCredits(res.usage);
  await pool.query("UPDATE briefs SET status = 'done', content = $2, credits = $3 WHERE id = $1", [id, JSON.stringify(content), credits]);
  await pool.query("UPDATE markets SET credits = credits + $2 WHERE id = $1", [marketId, credits]);
}

export const brief = (id) => one("SELECT id, status, content, error FROM briefs WHERE id = $1", [id]);
