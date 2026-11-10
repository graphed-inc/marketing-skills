// @ts-nocheck
// Batch planning shared by the server and the CLI: scripts x avatars -> rows with length + cost.
import { q, one } from "./db/sql";
import { spoken, estimate } from "./media";
import { clean } from "./writer";
import { calibration, stepTimes, total, batchSeconds } from "./eta";

const fail = (msg) => { const e = new Error(msg); e.code = 400; throw e; };

// items: [{script_id} | {text, brand}], avatar_ids: [..], pair: cycle | all
export const MAX = 100;
export async function plan(b) {
  if (Array.isArray(b.pairs)) return planPairs(b);
  const engine = b.engine === "kling" ? "kling" : "seedance";
  const avatars = (b.avatar_ids || []).map(Number).filter(Boolean);
  if (!avatars.length) fail("pick at least one avatar");
  const items = [];
  for (const it of b.items || []) {
    if (it.script_id) {
      const s = await one("SELECT s.*, p.brand AS pbrand FROM scripts s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = $1", [it.script_id]);
      if (s) items.push({ script_id: s.id, text: s.text, brand: s.brand || s.pbrand || b.brand || "", title: s.angle || "" });
    } else if (String(it.text || "").trim()) items.push({ script_id: null, text: clean(it.text), brand: it.brand || b.brand || "", title: it.title || "" });
  }
  if (!items.length) fail("pick at least one script");
  const pairs = b.pair === "all" ? items.flatMap((it) => avatars.map((a) => [it, a])) : items.map((it, i) => [it, avatars[i % avatars.length]]);
  if (pairs.length > MAX) fail(`${MAX} videos per batch at most`);
  return finish(pairs, engine);
}

// Board cells: pairs [{script_id, avatar_id}] (saved scripts only). Each script is measured once.
async function planPairs(b) {
  const engine = b.engine === "kling" ? "kling" : "seedance";
  const want = b.pairs.map((p) => [Number(p.script_id), Number(p.avatar_id)]).filter(([s, a]) => s && a);
  if (!want.length) fail("pick at least one cell");
  if (want.length > MAX) fail(`${MAX} videos per batch at most`);
  const sids = [...new Set(want.map(([s]) => s))];
  const rows = new Map((await q(`SELECT s.id, s.text, coalesce(s.brand, p.brand) AS brand, s.angle FROM scripts s
    LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ANY($1)`, [sids])).map((s) => [s.id, s]));
  const pairs = want.filter(([s]) => rows.has(s)).map(([s, a]) => {
    const r = rows.get(s);
    return [{ script_id: s, text: r.text, brand: r.brand || "", title: r.angle || "" }, a];
  });
  if (!pairs.length) fail("those scripts were deleted");
  return finish(pairs, engine);
}

async function finish(pairs, engine) {
  const names = new Map((await q("SELECT id, name FROM avatars")).map((a) => [a.id, a.name]));
  const out = [], memo = new Map();
  for (const [it, a] of pairs) {
    if (!memo.has(it.text)) { const sp = await spoken(it.text); memo.set(it.text, estimate(sp.words, sp.spoken.length, engine)); }
    out.push({ ...it, avatar_id: a, avatar: names.get(a) || "?", engine, ...memo.get(it.text) });
  }
  const cal = await calibration();
  for (const r of out) r.seconds = Math.round(total(stepTimes(r.secs, engine, cal)));   // time for this video alone
  const ok = out.filter((r) => !r.tooLong);
  return { engine, rows: out, total: ok.reduce((s, r) => s + r.credits, 0),
    seconds: Math.round(batchSeconds(ok.map((r) => ({ secs: r.secs, engine })), cal)) };  // whole batch, one container
}


export async function createVideos(b) {
  const p = await plan(b);
  const batch = `b${Date.now().toString(36)}`;
  const ids = [];
  const saved = new Map();
  for (const r of p.rows.filter((r) => !r.tooLong)) {
    if (!r.script_id) {  // a pasted script: keep it in the Scripts list (one row per distinct text)
      if (!saved.has(r.text)) {
        const ex = await one("SELECT id FROM scripts WHERE text = $1 ORDER BY id DESC LIMIT 1", [r.text]);
        saved.set(r.text, ex ? ex.id : (await one(`INSERT INTO scripts (style, text, words, fits, brand) VALUES ('pasted',$1,$2,$3,$4) RETURNING id`,
          [r.text, r.words, !r.tooLong, r.brand || null])).id);
      }
      r.script_id = saved.get(r.text);
    }
    const v = await one(`INSERT INTO videos (batch, title, script_id, script, brand, avatar_id, engine, words, est_credits, board_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [batch, r.title, r.script_id, r.text, r.brand, r.avatar_id, r.engine, r.words, r.credits, Number(b.board_id) || null]);
    ids.push(v.id);
  }
  return { batch, ids, total: p.total, skipped: p.rows.filter((r) => r.tooLong).length };
}
