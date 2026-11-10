// @ts-nocheck
// Research → N UGC scripts (prompts/scripts.md). Styles: story (85-105 words) and hook (35-60 words).
import { llm, parseJson } from "./tools";
import { prompt } from "./prompts";
import { spoken } from "./media";

export const LIMITS = { story: [70, 105], hook: [25, 60] };

// Only periods, commas, question marks, apostrophes (TTS + Seedance read these cleanly). Keeps 24/7 and 9:45.
export function clean(s) {
  s = String(s).replace(/[’‘]/g, "'").replace(/[—–]/g, ", ").replace(/%/g, " percent").replace(/["“”]/g, "");
  s = s.replace(/[^A-Za-z0-9 .,?'\n$/:]/g, " ").replace(/(?<!\d)[/:]|[/:](?!\d)/g, " ");
  s = s.replace(/[ \t]+/g, " ").replace(/ +([.,?])/g, "$1");
  return s.split(/\n\s*\n/).map((p) => p.split(/\s+/).join(" ").trim()).filter(Boolean).join("\n\n");
}

export async function writeScripts({ url, product, insights, n = 10, styles = "story,hook", speaker = "", extra = "", avoid = [] }) {
  const list = styles.split(",").map((s) => s.trim()).filter((s) => LIMITS[s]);
  const out = [];
  let credits = 0;
  while (out.length < n) {
    const k = Math.min(5, n - out.length);  // 5 per call: 10 at once ran past the reply limit (Nov 2026)
    const seen = [...avoid, ...out.map((s) => s.text.split(".")[0])].slice(-30);
    const msg = prompt("scripts.md", {
      brand: product.brand, url, what: product.what, buyers: product.buyers || "", jobs: (product.jobs || []).join("; "),
      proof: (product.proof || []).join("; ") || "none", cta: product.cta || "click the link",
      research: insights ? JSON.stringify({ pains: insights.pains, outcomes: insights.outcomes, angles: insights.angles, language: insights.language }, null, 1)
        : "(no research: write from the product brief)",
      speaker: speaker || "any adult, filming a casual selfie", n: k,
      styles: list.join(", ") + (list.length > 1 ? " (about half each)" : ""),
      extra: (extra || "") + (seen.length ? " Do not reuse these opening lines: " + seen.join(" | ") : ""),
    });
    let got = [];
    for (let attempt = 0; attempt < 3 && !got.length; attempt++) {
      const r = await llm([{ role: "user", content: msg }], { maxTokens: 12000 });
      credits += r.credits;
      got = scriptsFrom(r.text).slice(0, k);
    }
    if (!got.length) throw new Error("the script writer returned no usable scripts after 3 tries");
    for (const s of got) {
      const style = LIMITS[s.style] ? s.style : "story";
      let text = clean(s.script || "");
      let words = (await spoken(text)).words;
      if (words > LIMITS[style][1]) {  // one shorten pass
        const short = await llm([{ role: "user", content: `Shorten this UGC ad script to at most ${LIMITS[style][1] - 5} words. Keep the hook, ` +
          `the brand name and the CTA. Periods, commas, question marks and apostrophes only. Reply with the script only.\n\n${text}` }], { temperature: 0.3 });
        credits += short.credits;
        if (clean(short.text)) text = clean(short.text);
        words = (await spoken(text)).words;
      }
      out.push({ style, angle: s.angle || "", pain: s.pain || "", persona: s.persona || "", text, words,
        fits: words <= LIMITS[style][1], claims: Array.isArray(s.claims) ? s.claims : [] });
    }
  }
  return { scripts: out, credits };
}

// Scripts from an LLM reply. Takes the whole JSON when it parses; when the reply was cut off, keeps every
// complete {...} object that has a "script" field.
export function scriptsFrom(text) {
  const whole = parseJson(text);
  if (whole && Array.isArray(whole.scripts)) return whole.scripts.filter((s) => s && s.script);
  if (Array.isArray(whole)) return whole.filter((s) => s && s.script);
  const out = [], s = String(text || "");
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") { depth++; if (depth === 2) start = i; }
    else if (c === "}") {
      if (depth === 2 && start >= 0) { try { const o = JSON.parse(s.slice(start, i + 1)); if (o.script) out.push(o); } catch {} start = -1; }
      depth--;
    }
  }
  return out;
}
