// @ts-nocheck
// Positioning gaps, part 1: research the user's market and build the persona matrix.
//
//   site       read the business URL → what it sells, to whom, competitors, search queries
//   collect    voice of the customer: Reddit threads + comments, YouTube comments, LinkedIn and
//              Threads posts, Exa web pages (reviews, forums, blogs). All Graphed Tools.
//   matrix     personas (rows) × pains + desired outcomes (columns), written from the corpus
//   tag_voices every comment → the persona × theme cells it speaks to (Gemini 2.5 Flash)
//   tag_ads    every competitor ad → the cells it targets (Gemini 2.5 Flash)
//
// Each stage is resumable: the market row keeps its stage, and finished work is skipped.
import { createHash } from "node:crypto";
import { q, one, pool, withTx } from "./db/sql";
import { tool, llm, lanes, usageCredits, TOOL_RATE, writerModel, visionModel } from "./tools";
import { parseJson } from "./analyze";

const SC = "scrapecreators:v1";
const EXA_RATE = 0.805;
const md5 = (s) => createHash("md5").update(s).digest("hex");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const STAGES = ["site", "collect", "matrix", "tag_voices", "tag_ads", "done"];

const SKIP_AUTHORS = new Set(["AutoModerator", "[deleted]", "[removed]"]);
const spammy = (t) => /https?:\/\/\S+/.test(t) && t.length < 200 || /^(\[deleted\]|\[removed\])$/.test(t);

async function addCredits(id, c) { if (c) await pool.query("UPDATE markets SET credits = credits + $2 WHERE id = $1", [id, c]); }
async function setStage(id, stage, progress) {
  await pool.query("UPDATE markets SET stage = $2, progress = coalesce($3, progress), heartbeat_at = now() WHERE id = $1",
    [id, stage, progress ? JSON.stringify(progress) : null]);
}
async function progress(id, patch) {
  const m = await one("SELECT progress FROM markets WHERE id = $1", [id]);
  const p = { ...(m?.progress || {}), ...patch };
  await pool.query("UPDATE markets SET progress = $2, heartbeat_at = now() WHERE id = $1", [id, JSON.stringify(p)]);
  return p;
}

async function chat(model, prompt, { json = true, maxTokens = 8000, temperature = 0.3 } = {}) {
  const res = await llm().chat.completions.create({
    model, messages: [{ role: "user", content: prompt }], temperature, max_tokens: maxTokens,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  });
  const text = res.choices?.[0]?.message?.content || "";
  return { out: json ? parseJson(text) : text, credits: usageCredits(res.usage) };
}

// ───────────────────────── 1. site ─────────────────────────

async function readSite(url) {
  let text = "";
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
    const html = await r.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
    const desc = (html.match(/name=["']description["'][^>]*content=["']([^"']+)/i) || [])[1] || "";
    const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    text = clean(`${title}\n${desc}\n${body}`);
  } catch { /* fall back to the scraper */ }
  let credits = 0;
  if (text.length < 600) {
    try {
      const r = await tool("serper:scrape", { url });
      credits += 0.115;
      text = clean(r.text || r.markdown || JSON.stringify(r));
    } catch { /* keep what we have */ }
  }
  return { text: text.slice(0, 12000), credits };
}

async function stageSite(m) {
  const site = await readSite(m.url);
  if (site.text.length < 80) throw new Error(`could not read ${m.url}`);
  const { out, credits } = await chat(writerModel(), `You are a positioning strategist. Read this company's website text and plan
voice-of-customer research for its CATEGORY (the problem space, not the brand).

Website (${m.url}):
"""${site.text}"""

Return JSON:
{
  "name": "company name",
  "one_liner": "what it sells, in plain words (max 15 words)",
  "category": "the market category (e.g. 'meal kit delivery', 'ad creative research software')",
  "buyers": ["who buys it, by role or life situation — 3-6 items"],
  "jobs": ["jobs the product claims to do — 3-8 items"],
  "competitors": [{"name": "...", "domain": "example.com"}],   // 4-8 real direct competitors you are confident exist
  "reddit_queries": ["12 searches written the way a frustrated buyer complains or asks for help, NOT the vendor's words; no brand names except 1-2 'alternative to <competitor>'"],
  "youtube_queries": ["3 searches for videos whose COMMENTS will hold buyer opinions (reviews, how-tos, rants)"],
  "social_queries": ["4 short searches for LinkedIn / Threads posts where buyers talk about this problem"],
  "web_queries": ["4 searches for reviews, forums and comparison pages where buyers describe the problem (no reddit)"]
}`, { maxTokens: 3000 });
  await pool.query("UPDATE markets SET name = $2, profile = $3 WHERE id = $1", [m.id, out.name || null, JSON.stringify({ ...out, site_excerpt: site.text.slice(0, 1500) })]);
  await addCredits(m.id, site.credits + credits);
}

// ───────────────────────── 2. collect ─────────────────────────

async function saveVoices(marketId, rows) {
  let n = 0;
  for (const v of rows) {
    const text = clean(v.text).slice(0, 2500);
    if (text.length < 30 || spammy(text) || SKIP_AUTHORS.has(v.author)) continue;
    const r = await pool.query(
      `INSERT INTO voices (market_id, source, url, title, text, author, score, query, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (market_id, hash) DO NOTHING RETURNING id`,
      [marketId, v.source, v.url || null, v.title ? clean(v.title).slice(0, 300) : null, text, v.author || null,
        Number.isFinite(v.score) ? Math.round(v.score) : null, v.query || null, md5(`${v.source}|${v.url}|${text}`)]);
    n += r.rows.length;
  }
  return n;
}

// One collector step = one tool call, keyed so a resumed run skips finished calls.
async function step(m, key, fn) {
  const p = (await one("SELECT progress FROM markets WHERE id = $1", [m.id])).progress || {};
  if ((p.done || []).includes(key)) return;
  const credits = (await fn()) || 0;
  await addCredits(m.id, credits);
  const counts = await q("SELECT source, count(*)::int n FROM voices WHERE market_id = $1 GROUP BY 1", [m.id]);
  await progress(m.id, { done: [...(p.done || []), key], voices: Object.fromEntries(counts.map((c) => [c.source, c.n])) });
}

function flattenComments(list, out = []) {
  for (const c of list || []) {
    if (!c || typeof c !== "object") continue;
    out.push(c);
    const kids = Array.isArray(c.replies) ? c.replies : c.replies?.items || c.replies?.comments;
    if (Array.isArray(kids)) flattenComments(kids, out);
  }
  return out;
}

async function stageCollect(m) {
  const prof = m.profile || {};
  const threads = new Map();

  // Reddit: search, then comments on the threads with the most discussion.
  for (const query of (prof.reddit_queries || []).slice(0, 12)) {
    await step(m, `reddit:${query}`, async () => {
      const r = await tool(`${SC}/reddit/search`, { query, sort: "relevance", timeframe: "year", trim: true });
      const posts = r.posts || [];
      await saveVoices(m.id, posts.map((p) => ({ source: "reddit", url: p.url, title: p.title, text: `${p.title}\n${p.selftext || ""}`, author: p.author, score: p.score, query })));
      return TOOL_RATE;
    });
  }
  // Comments for the 20 threads with the highest score.
  const scored = await q(
    `SELECT url, max(title) title, max(score) s FROM voices WHERE market_id = $1 AND source = 'reddit' AND url LIKE '%/comments/%'
     GROUP BY url ORDER BY s DESC NULLS LAST LIMIT 20`, [m.id]);
  for (const t of scored) threads.set(t.url, t.title);
  for (const { url } of scored) {
    await step(m, `reddit-thread:${url}`, async () => {
      const r = await tool(`${SC}/reddit/post/comments`, { url, trim: true });
      const cs = flattenComments(r.comments).filter((c) => c.body && !SKIP_AUTHORS.has(c.author))
        .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 25);
      await saveVoices(m.id, cs.map((c) => ({ source: "reddit", url, title: threads.get(url), text: c.body, author: c.author, score: c.score })));
      return TOOL_RATE;
    });
  }

  // YouTube: comments on the top videos for each query.
  for (const query of (prof.youtube_queries || []).slice(0, 3)) {
    await step(m, `youtube:${query}`, async () => {
      const r = await tool(`${SC}/youtube/search`, { query });
      let credits = TOOL_RATE;
      for (const v of (r.videos || []).slice(0, 2)) {
        try {
          const c = await tool(`${SC}/youtube/video/comments`, { url: v.url });
          credits += TOOL_RATE;
          await saveVoices(m.id, (c.comments || []).map((x) => ({ source: "youtube", url: v.url, title: v.title, text: x.content, author: x.author?.name, score: x.engagement?.likes ?? x.likes })));
        } catch { /* comments off */ }
      }
      return credits;
    });
  }

  // LinkedIn + Threads posts.
  for (const query of (prof.social_queries || []).slice(0, 4)) {
    await step(m, `linkedin:${query}`, async () => {
      const r = await tool(`${SC}/linkedin/search/posts`, { query });
      await saveVoices(m.id, (r.posts || []).slice(0, 15).map((p) => ({ source: "linkedin", url: p.url, text: p.description || p.text, author: p.author?.name || p.authorName, query })));
      return TOOL_RATE;
    });
    await step(m, `threads:${query}`, async () => {
      const r = await tool(`${SC}/threads/search`, { query, trim: true });
      await saveVoices(m.id, (r.posts || []).slice(0, 20).map((p) => ({ source: "threads", url: p.url || (p.code ? `https://www.threads.net/post/${p.code}` : null), text: p.caption?.text || p.text, author: p.user?.username, score: p.like_count, query })));
      return TOOL_RATE;
    });
  }

  // Exa: reviews, forums, comparison pages (Exa cannot read Reddit).
  for (const query of (prof.web_queries || []).slice(0, 4)) {
    await step(m, `web:${query}`, async () => {
      const r = await tool("exa:search", { query, numResults: 6, excludeDomains: ["reddit.com"], contents: { text: { maxCharacters: 2500 } } });
      await saveVoices(m.id, (r.results || []).map((x) => ({ source: "web", url: x.url, title: x.title, text: x.text, query })));
      return EXA_RATE;
    });
  }
  const n = await one("SELECT count(*)::int n FROM voices WHERE market_id = $1", [m.id]);
  if (n.n < 15) throw new Error(`only ${n.n} customer comments found; try a different URL or re-run`);
}

// ───────────────────────── 3. matrix ─────────────────────────

async function stageMatrix(m) {
  const prof = m.profile || {};
  const sample = await q(
    `SELECT id, source, left(text, 420) t FROM voices WHERE market_id = $1 ORDER BY source = 'web', score DESC NULLS LAST, id LIMIT 320`, [m.id]);
  const corpus = sample.map((v) => `[${v.source}] ${v.t}`).join("\n");
  const { out, credits } = await chat(writerModel(), `You build persona matrices for ad positioning.

Company: ${prof.name} — ${prof.one_liner}. Category: ${prof.category}.
Buyers (from its site): ${JSON.stringify(prof.buyers || [])}

Below are real customer comments from Reddit, YouTube, LinkedIn, Threads and the web about this category.
Build the matrix FROM THESE COMMENTS (not from the company's marketing):

- personas: 4-6 distinct BUYER types — people who could pay for ${prof.name} or a competitor. Define each by situation +
  motivation (e.g. "Solo founder doing ads at night"), not demographics alone. Mutually distinct.
  Never make a persona out of non-buyers (workers worried about their jobs, vendors, students, commentators).
- pains: 6-9 problems / frustrations these buyers have with the problem or current solutions. Short labels (2-5 words).
- outcomes: 5-8 desired outcomes they want (the end state, not a feature). Short labels (2-5 words).
Prefer themes many comments share. Themes must not overlap.

Return JSON: {"personas":[{"name":"","description":"one sentence"}],"pains":[{"name":"","description":""}],"outcomes":[{"name":"","description":""}]}

Comments:
${corpus}`, { maxTokens: 4000 });
  await pool.query("DELETE FROM personas WHERE market_id = $1", [m.id]);
  await pool.query("DELETE FROM themes WHERE market_id = $1", [m.id]);
  let i = 0;
  for (const p of (out.personas || []).slice(0, 6)) await pool.query("INSERT INTO personas (market_id, name, description, position) VALUES ($1,$2,$3,$4)", [m.id, p.name, p.description, i++]);
  i = 0;
  for (const t of (out.pains || []).slice(0, 9)) await pool.query("INSERT INTO themes (market_id, kind, name, description, position) VALUES ($1,'pain',$2,$3,$4)", [m.id, t.name, t.description, i++]);
  for (const t of (out.outcomes || []).slice(0, 8)) await pool.query("INSERT INTO themes (market_id, kind, name, description, position) VALUES ($1,'outcome',$2,$3,$4)", [m.id, t.name, t.description, i++]);
  await pool.query("UPDATE voices SET tagged = false WHERE market_id = $1", [m.id]);
  await pool.query("DELETE FROM ad_mapped WHERE market_id = $1", [m.id]);
  await pool.query("DELETE FROM ad_tags WHERE market_id = $1", [m.id]);
  await addCredits(m.id, credits);
}

// ───────────────────────── 4 + 5. tagging ─────────────────────────

async function matrixOf(marketId) {
  const personas = await q("SELECT id, name, description FROM personas WHERE market_id = $1 ORDER BY position, id", [marketId]);
  const themes = await q("SELECT id, kind, name, description FROM themes WHERE market_id = $1 ORDER BY position, id", [marketId]);
  const legend = `PERSONAS:\n${personas.map((p, i) => `P${i + 1} = ${p.name}: ${p.description}`).join("\n")}
THEMES:\n${themes.map((t, i) => `T${i + 1} = [${t.kind}] ${t.name}: ${t.description}`).join("\n")}`;
  return { personas, themes, legend, pid: (k) => personas[Number(String(k).replace(/\D/g, "")) - 1]?.id, tid: (k) => themes[Number(String(k).replace(/\D/g, "")) - 1]?.id };
}

export async function tagVoices(marketId, log = () => {}) {
  const mx = await matrixOf(marketId);
  if (!mx.personas.length) return 0;
  const todo = await q("SELECT id, source, left(text, 900) t FROM voices WHERE market_id = $1 AND NOT tagged ORDER BY id", [marketId]);
  const batches = [];
  for (let i = 0; i < todo.length; i += 20) batches.push(todo.slice(i, i + 20));
  let done = 0;
  let failed = 0;
  await lanes(batches, 4, async (batch) => {
    const { out, credits } = await chat(visionModel(), `Tag customer comments into a persona matrix.
${mx.legend}

For each comment decide: does it express a pain or a desired outcome from THEMES, said by (or about) one PERSONA?
- persona: the single closest P#. Skip the comment if it is off-topic, a vendor pitch, a joke, or written by someone
  who is not a potential buyer (e.g. a worker worried about their job, a student).
- themes: 1-3 T# it clearly expresses. intensity 1 = mention, 2 = clear, 3 = strong / emotional.
- quote: the exact words (max 25 words) that show it. Verbatim only.

Return JSON {"tags":[{"c": <comment number>, "persona": "P#", "themes": [{"t": "T#", "intensity": 1-3}], "quote": "..."}]}
Comments:
${batch.map((v, i) => `#${i + 1} [${v.source}] ${v.t}`).join("\n\n")}`, { maxTokens: 6000, temperature: 0.1 }).catch((e) => { log(`tag voices: ${e.message}`); return { out: null, credits: 0 }; });
    if (!out) { failed += 1; return; }
    for (const t of out.tags || []) {
      const v = batch[Number(t.c) - 1]; const pid = mx.pid(t.persona);
      if (!v || !pid) continue;
      for (const th of t.themes || []) {
        const tid = mx.tid(th.t); if (!tid) continue;
        await pool.query(
          `INSERT INTO voice_tags (voice_id, persona_id, theme_id, intensity, quote) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (voice_id, persona_id, theme_id) DO UPDATE SET intensity = excluded.intensity, quote = excluded.quote`,
          [v.id, pid, tid, Math.min(3, Math.max(1, Number(th.intensity) || 1)), t.quote ? String(t.quote).slice(0, 300) : null]);
      }
    }
    await pool.query("UPDATE voices SET tagged = true WHERE id = ANY($1::bigint[])", [batch.map((v) => String(v.id))]);
    await addCredits(marketId, credits);
    done += batch.length;
    await progress(marketId, { voices_tagged: done, voices_total: todo.length });
  });
  if (failed) throw new Error(`voice tagging failed for ${failed} batch${failed === 1 ? "" : "es"}`);
  const left = await one("SELECT count(*)::int n FROM voices WHERE market_id = $1 AND NOT tagged", [marketId]);
  if (left.n) throw new Error(`${left.n} comments are still untagged`);
  return done;
}

// Map analyzed competitor ads into the matrix. Runs at setup and after every daily pull.
export async function tagAds(marketId, log = () => {}) {
  const mx = await matrixOf(marketId);
  if (!mx.personas.length) return 0;
  // A crashed claim must not hide the ad forever. Fifteen minutes is longer than one batch.
  await pool.query("DELETE FROM ad_mapped WHERE pending AND mapped_at < now() - interval '60 minutes'");
  const todo = await q(
    `SELECT a.id, b.name brand, a.platform, a.format, a.headline, left(a.body, 500) body, a.hook, a.angle, a.offer, a.summary,
            a.target_audience, a.pain_points, a.benefits, left(a.transcript, 600) transcript
     FROM ads a JOIN brands b ON b.id = a.brand_id
     WHERE a.analysis_status = 'done' AND NOT EXISTS (SELECT 1 FROM ad_mapped x WHERE x.market_id = $1 AND x.ad_id = a.id)
     ORDER BY a.id`, [marketId]);
  const batches = [];
  for (let i = 0; i < todo.length; i += 10) batches.push(todo.slice(i, i + 10));
  let done = 0;
  await lanes(batches, 4, async (batch) => {
    const mine = [];
    for (const ad of batch) {
      const claimed = await one(
        `INSERT INTO ad_mapped (market_id, ad_id, pending) VALUES ($1, $2, true)
         ON CONFLICT (market_id, ad_id) DO NOTHING RETURNING ad_id`,
        [marketId, ad.id]);
      if (claimed) mine.push(ad);
    }
    if (!mine.length) return;
    const release = async (ids) => {
      if (!ids.length) return;
      await pool.query("DELETE FROM ad_mapped WHERE market_id = $1 AND pending AND ad_id = ANY($2::bigint[])", [marketId, ids]);
    };
    const { out, credits } = await chat(visionModel(), `Map competitor ads into a persona matrix: which buyer does each ad speak to, and which pains / desired outcomes does its message use?
${mx.legend}

For each ad:
- cells: 1-4 {persona P#, theme T#, strength}. strength 3 = the main message, 2 = clearly used, 1 = touched on.
  Pick the persona the ad's words and visuals target. If it targets everyone, pick the 1-2 closest.
- If an ad uses no theme at all (pure brand / product shot), return cells: [].

Return JSON {"ads":[{"a": <ad number>, "cells":[{"p":"P#","t":"T#","s":1-3}], "reason":"max 15 words"}]}
Ads:
${mine.map((a, i) => `#${i + 1} ${a.brand} · ${a.platform} ${a.format}
headline: ${a.headline || ""}
copy: ${a.body || ""}
hook: ${a.hook || ""} | angle: ${a.angle || ""} | offer: ${a.offer || ""}
summary: ${a.summary || ""} | audience: ${a.target_audience || ""}
pains: ${(a.pain_points || []).join("; ")} | benefits: ${(a.benefits || []).join("; ")}
spoken: ${a.transcript || ""}`).join("\n\n")}`, { maxTokens: 5000, temperature: 0.1 }).catch((e) => { log(`tag ads: ${e.message}`); return { out: null, credits: 0 }; });
    if (!out) { await release(mine.map((ad) => ad.id)); return; }
    const seen = new Set();
    for (const r of out.ads || []) {
      const ad = mine[Number(r.a) - 1]; if (!ad) continue;
      seen.add(ad.id);
      const reason = r.reason ? String(r.reason).slice(0, 200) : null;
      const cells = [];
      for (const c of (r.cells || []).slice(0, 4)) {
        const pid = mx.pid(c.p); const tid = mx.tid(c.t);
        if (!pid || !tid) continue;
        cells.push([pid, tid, Math.min(3, Math.max(1, Number(c.s) || 1)), reason]);
      }
      await withTx(async (client) => {
        await client.query("DELETE FROM ad_tags WHERE market_id = $1 AND ad_id = $2", [marketId, ad.id]);
        for (const [pid, tid, strength, why] of cells) {
          await client.query(
            `INSERT INTO ad_tags (market_id, ad_id, persona_id, theme_id, strength, reason) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (market_id, ad_id, persona_id, theme_id)
             DO UPDATE SET strength = excluded.strength, reason = excluded.reason`,
            [marketId, ad.id, pid, tid, strength, why]);
        }
      });
    }
    await release(mine.filter((ad) => !seen.has(ad.id)).map((ad) => ad.id));
    for (const ad of mine) {
      if (!seen.has(ad.id)) continue;
      await pool.query("UPDATE ad_mapped SET pending = false, mapped_at = now() WHERE market_id = $1 AND ad_id = $2", [marketId, ad.id]);
    }
    await addCredits(marketId, credits);
    done += seen.size;
    await progress(marketId, { ads_tagged: done, ads_total: todo.length });
  });
  return done;
}

// ───────────────────────── runner ─────────────────────────

const running = new Set();
export const researching = () => running.size > 0;

// One process wins the row. A fresh heartbeat means another process is in the loop.
// An explicit rerun (from) takes the row even when that heartbeat is fresh.
export async function claimMarket(id, { force = false } = {}) {
  const row = await one(
    force
      ? `UPDATE markets SET status = 'running', error = NULL, heartbeat_at = now() WHERE id = $1 RETURNING id`
      : `UPDATE markets SET status = 'running', error = NULL, heartbeat_at = now()
         WHERE id = $1 AND (status <> 'running' OR heartbeat_at IS NULL OR heartbeat_at < now() - interval '2 minutes')
         RETURNING id`,
    [id]);
  return Boolean(row);
}

export async function runMarket(id, { log = console.log, from } = {}) {
  id = Number(id);
  if (running.has(id)) return;
  running.add(id);
  let beat;
  try {
    const claimed = await claimMarket(id, { force: Boolean(from) });
    if (!claimed) return;
    // The API and the CLI share this reset. Without it, --from collect skips finished searches
    // and --from tag_ads skips ads that are already mapped.
    if (from === "site" || from === "collect") await pool.query("UPDATE markets SET progress = '{}' WHERE id = $1", [id]);
    if (from === "tag_ads") await pool.query("DELETE FROM ad_mapped WHERE market_id = $1", [id]);
    if (from) await setStage(id, from);
    beat = setInterval(() => {
      pool.query("UPDATE markets SET heartbeat_at = now() WHERE id = $1 AND status = 'running'", [id]).catch(() => {});
    }, 30_000);
    beat.unref?.();
    for (;;) {
      const m = await one("SELECT * FROM markets WHERE id = $1", [id]);
      if (!m || m.stage === "done") break;
      log(`market ${id}: ${m.stage}`);
      if (m.stage === "site") await stageSite(m);
      else if (m.stage === "collect") await stageCollect(m);
      else if (m.stage === "matrix") await stageMatrix(m);
      else if (m.stage === "tag_voices") await tagVoices(id, log);
      else if (m.stage === "tag_ads") await tagAds(id, log);
      await setStage(id, STAGES[STAGES.indexOf(m.stage) + 1]);
    }
    await pool.query("UPDATE markets SET status = 'done', finished_at = now() WHERE id = $1", [id]);
    log(`market ${id}: done`);
  } catch (e) {
    await pool.query("UPDATE markets SET status = 'error', error = $2 WHERE id = $1", [id, String(e.message || e).slice(0, 500)]);
    log(`market ${id}: ERROR ${e.message}`);
  } finally {
    if (beat) clearInterval(beat);
    running.delete(id);
  }
}

export async function createMarket(url) {
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  new URL(u); // throws on junk
  const m = await one("INSERT INTO markets (url) VALUES ($1) RETURNING id", [u]);
  return m.id;
}

// After a restart: continue any market that was mid-run.
export async function resumeMarkets(log = console.log) {
  const rows = await q("SELECT id FROM markets WHERE status IN ('queued', 'running') AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '2 minutes')");
  for (const r of rows) runMarket(r.id, { log }).catch(() => {});
}
