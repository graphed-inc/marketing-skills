// @ts-nocheck
// Gemini 2.5 Flash (multimodal, via the Graphed OpenRouter proxy) watches each video, looks at
// each image, reads the copy, and returns one JSON catalog entry. Results land in typed columns
// so they can be queried with plain SQL (Claude Code via `graphed exec`).
import { q, one, pool } from "./db/sql";
import { get } from "./storage";
import { llm, visionModel, usageCredits, lanes } from "./tools";

export const HOOK_TYPES = ["question", "bold claim", "problem callout", "statistic", "testimonial", "demo", "curiosity", "offer", "pattern interrupt", "social proof", "other"];
export const STYLES = ["ugc talking head", "founder to camera", "testimonial", "product demo", "screen recording", "motion graphics", "animation", "static product", "lifestyle photo", "meme", "text graphic", "comparison", "before after", "podcast clip", "carousel", "other"];

const PROMPT = `You are cataloging a competitor's ad for a marketing team's ad library.
Watch the video (with sound) and/or look at every image, and read the ad copy below.
Return ONE JSON object, no prose, with exactly these keys:
{
  "transcript": "every spoken word, verbatim. Empty string if no speech",
  "on_screen_text": "text that appears on screen or in the image, in order",
  "visual_description": "what is shown, scene by scene for video (short lines with rough timestamps), or a description of the image(s)",
  "summary": "one sentence: what this ad says and to whom",
  "hook": "the exact first line spoken or shown, or what grabs attention in the first 3 seconds",
  "hook_type": one of ${JSON.stringify(HOOK_TYPES)},
  "angle": "the core marketing angle in a few words (e.g. 'save time vs hiring an agency')",
  "offer": "the concrete offer (free trial, % off, free shipping, demo, lead magnet) or null",
  "cta": "the call to action",
  "creative_style": one of ${JSON.stringify(STYLES)},
  "target_audience": "who the ad is for",
  "emotions": ["2-4 emotions it plays on"],
  "pain_points": ["problems it names or implies"],
  "benefits": ["benefits it promises"],
  "people_on_screen": number,
  "speaker": "who talks or appears (e.g. 'woman, 30s, kitchen, selfie camera') or null",
  "product_shown": true | false,
  "duration_seconds": number or null,
  "language": "ISO language name, e.g. English",
  "tags": ["6-12 short lowercase tags for search: themes, product, format, tone"]
}`;

const toText = (a) => [
  `Platform: ${a.platform}  Format: ${a.format}`,
  a.headline && `Headline: ${a.headline}`,
  a.body && `Body copy: ${a.body}`,
  a.cta && `Button: ${a.cta}`,
  a.link_url && `Link: ${a.link_url}`,
].filter(Boolean).join("\n");

async function mediaParts(ad, { noYoutube = false } = {}) {
  const parts = [];
  let videos = 0; let images = 0;
  if (ad.youtube_url && !noYoutube) { parts.push({ type: "video_url", video_url: { url: ad.youtube_url } }); videos++; }
  for (const m of ad.media || []) {
    if (m.kind === "video" && videos < 1) {
      const key = m.sd || m.key;
      const buf = await get(key).catch(() => null);
      if (buf && buf.length <= 14 * 1024 * 1024) {
        parts.push({ type: "video_url", video_url: { url: `data:${m.type || "video/mp4"};base64,${buf.toString("base64")}` } });
        videos++;
        continue;
      }
      if (m.poster) { const p = await get(m.poster).catch(() => null); if (p) { parts.push(img(p, "image/jpeg")); images++; } }
    } else if (m.kind === "image" && images < 6 && !(m.youtube && videos)) { // YouTube thumbnail only when the video was not sent
      const buf = await get(m.key).catch(() => null);
      if (buf) { parts.push(img(buf, m.type)); images++; }
    }
  }
  return parts;
}
const img = (buf, type) => ({ type: "image_url", image_url: { url: `data:${type || "image/jpeg"};base64,${buf.toString("base64")}` } });

const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 20) : v ? [String(v)] : []);
const str = (v) => (v == null || v === "" ? null : typeof v === "string" ? v : JSON.stringify(v));
const pick = (v, list) => { const s = String(v || "").toLowerCase().trim(); return list.includes(s) ? s : s ? "other" : null; };

export function parseJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("model did not return JSON");
}

export async function analyzeAd(ad, opts = {}) {
  const parts = await mediaParts(ad, opts);
  const res = await llm().chat.completions.create({
    model: visionModel(),
    messages: [{ role: "user", content: [...parts, { type: "text", text: `${PROMPT}\n\nAd copy:\n${toText(ad)}${parts.length ? "" : "\n(No media could be loaded; use the copy only.)"}` }] }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const j = parseJson(res.choices?.[0]?.message?.content);
  return { j, credits: usageCredits(res.usage) };
}

export async function saveAnalysis(id, j, credits) {
  await pool.query(
    `UPDATE ads SET analysis_status = 'done', analysis_error = NULL, analysis = $2, transcript = $3, on_screen_text = $4,
       visual_description = $5, summary = $6, hook = $7, hook_type = $8, angle = $9, offer = $10, creative_style = $11,
       target_audience = $12, emotions = $13, pain_points = $14, benefits = $15, tags = $16, language = $17,
       duration_seconds = $18, cta = coalesce(cta, $19), analyzed_at = now(), credits = credits + $20
     WHERE id = $1`,
    [id, JSON.stringify(j), str(j.transcript), str(j.on_screen_text), str(j.visual_description), str(j.summary), str(j.hook),
      pick(j.hook_type, HOOK_TYPES), str(j.angle), j.offer && !/^(none|null|n\/a)$/i.test(j.offer) ? str(j.offer) : null,
      pick(j.creative_style, STYLES), str(j.target_audience), arr(j.emotions), arr(j.pain_points), arr(j.benefits),
      arr(j.tags).map((t) => t.toLowerCase()), str(j.language), Number(j.duration_seconds) || null, str(j.cta), credits]);
}

// Claim queued ads one at a time (safe with several workers) and analyze them.
async function claim() {
  return one(
    `UPDATE ads SET analysis_status = 'running', heartbeat_at = now()
     WHERE id = (SELECT id FROM ads WHERE analysis_status = 'queued'
                 OR (analysis_status = 'running' AND heartbeat_at < now() - interval '10 minutes')
                 ORDER BY first_seen_at DESC, id DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`);
}

const transient = (e) => /\b(429|50[0-4])\b|ECONNRESET|ETIMEDOUT|fetch failed|timed out/i.test(String((e && e.message) || e));

async function runOne(ad, log) {
  try {
    let out;
    for (let i = 0; ; i++) {
      try { out = await analyzeAd(ad); break; } catch (e) {
        if (transient(e) && i < 2) { await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
        // Long or private YouTube videos fail upstream: fall back to the thumbnail + copy.
        if (ad.youtube_url) { out = await analyzeAd(ad, { noYoutube: true }); out.j.analysis_note = `video not watched: ${String(e.message).slice(0, 120)}`; break; }
        throw e;
      }
    }
    const { j, credits } = out;
    await saveAnalysis(ad.id, j, credits);
    log(`analyzed ad ${ad.id} (${ad.platform} ${ad.format}) ${credits.toFixed(2)} credits`);
  } catch (e) {
    await pool.query("UPDATE ads SET analysis_status = 'error', analysis_error = $2 WHERE id = $1", [ad.id, String(e.message || e).slice(0, 500)]);
    log(`ad ${ad.id} analysis error: ${e.message}`);
  }
}

// Drain the queue with n lanes. Returns how many ads were processed.
export async function drain({ lanes: n = 4, log = () => {}, limit = Infinity } = {}) {
  let done = 0;
  await lanes(Array.from({ length: n }), n, async () => {
    while (done < limit) {
      const ad = await claim();
      if (!ad) return;
      done++;
      await runOne(ad, log);
    }
  });
  return done;
}

// Background loop in the web service.
export function startAnalysis({ log = console.log, every = 5000 } = {}) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await drain({ log }); } catch (e) { log(`worker: ${e.message}`); } finally { busy = false; }
  };
  setInterval(tick, every).unref?.();
  tick();
}

export const requeue = (where = "analysis_status = 'error'", params = []) =>
  q(`UPDATE ads SET analysis_status = 'queued', analysis_error = NULL WHERE ${where} RETURNING id`, params);
