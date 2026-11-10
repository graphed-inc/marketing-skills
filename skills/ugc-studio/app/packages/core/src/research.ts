// @ts-nocheck
// Website → product brief → Reddit (ScrapeCreators via Graphed Tools) → pains, desired outcomes, angles.
// Port of reddit-pain-research/research.py + the studio's insight step.
import { tool, llmJson, lanes } from "./tools";
import { prompt } from "./prompts";

const SEARCH = "scrapecreators:v1/reddit/search";
const THREAD = "scrapecreators:v1/reddit/post/comments";
const SKIP_AUTHORS = new Set(["AutoModerator", "[deleted]", null, undefined, "None"]);
const SKIP_BODIES = new Set(["[deleted]", "[removed]", ""]);
const STOP = new Set("with your from that this what when have best help does guys into about they them just like brand brands people".split(" "));

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

export async function fetchSite(url) {
  const u = /^https?:\/\//.test(url) ? url : "https://" + url;
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`could not load ${u}: ${r.status}`);
  const s = await r.text();
  const out = [];
  const title = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) out.push("TITLE: " + decode(title[1]).trim());
  const meta = s.match(/name="description"\s+content="([^"]+)/i);
  if (meta) out.push("META: " + decode(meta[1]));
  const body = s.replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  for (const m of body.matchAll(/<(h[1-3]|p|li|button|a)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (t.length >= 3 && t.length <= 400) out.push(`${m[1].toUpperCase()}: ${t}`);
  }
  return [...new Set(out)].join("\n").slice(0, 12000);
}

function flatten(comments, depth = 0, acc = []) {
  for (const c of comments || []) {
    acc.push([c, depth]);
    const rep = c.replies;
    const items = rep && !Array.isArray(rep) ? rep.items : rep;
    if (Array.isArray(items)) flatten(items, depth + 1, acc);
  }
  return acc;
}

export async function reddit(queries, { top = 25, minComments = 3, timeframe = "year", key = "r" } = {}) {
  const results = await lanes(queries, 4, async (q, i) => {
    try {
      const d = await tool(SEARCH, { query: q, sort: "relevance", timeframe, trim: true }, `${key}-s${i}`, { timeoutSeconds: 180 });
      return [q, (d && d.posts) || []];
    } catch { return [q, []]; }
  });
  const posts = new Map();
  for (const [q, ps] of results) for (const p of ps) {
    const id = p.id || p.post_id;
    if (!id) continue;
    if (!posts.has(id)) posts.set(id, { id, subreddit: p.subreddit, title: p.title || "", selftext: (p.selftext || "").trim(), url: p.url,
      num_comments: +(p.num_comments || 0), score: +(p.score || 0), created_utc: p.created_utc, queries: [] });
    posts.get(id).queries.push(q);
  }
  // round-robin in Reddit's relevance order per query; drop posts sharing no keyword with the query
  const onTopic = (p, q) => {
    const text = (p.title + " " + p.selftext).toLowerCase();
    const terms = (q.toLowerCase().match(/[a-z]{4,}/g) || []).filter((t) => !STOP.has(t));
    return terms.filter((t) => text.includes(t) || text.includes(t.replace(/s$/, ""))).length >= Math.min(2, terms.length);
  };
  const lanesIds = results.map(([, ps]) => ps.map((p) => p.id || p.post_id));
  const picked = [], seen = new Set();
  for (let i = 0; picked.length < top && lanesIds.some((l) => i < l.length); i++) {
    results.forEach(([q], k) => {
      const id = lanesIds[k][i];
      if (picked.length >= top || !id || !posts.has(id) || seen.has(id)) return;
      seen.add(id);
      const p = posts.get(id);
      if (p.num_comments >= minComments && onTopic(p, q)) picked.push(p);
    });
  }
  await lanes(picked, 4, async (p, i) => {
    try {
      const d = await tool(THREAD, { url: p.url, trim: true }, `${key}-t${p.id}`, { timeoutSeconds: 180 });
      p.comments = flatten(d && d.comments)
        .filter(([c]) => !SKIP_AUTHORS.has(c.author) && !SKIP_BODIES.has((c.body || "").trim()))
        .map(([c, depth]) => ({ score: +(c.score || 0), depth, body: (c.body || "").trim() }))
        .sort((a, b) => b.score - a.score);
    } catch { p.comments = []; }
  });
  const lines = [`# Reddit corpus — ${picked.length} threads\n`];
  for (const p of picked) {
    const date = /^\d+$/.test(String(p.created_utc || "")) ? new Date(+p.created_utc * 1000).toISOString().slice(0, 10) : "?";
    lines.push(`\n## ${p.title}\nr/${p.subreddit} · ${date} · ${p.num_comments} comments · score ${p.score}\n${p.url}\n`);
    if (p.selftext) lines.push("\n" + p.selftext.slice(0, 1500) + "\n");
    for (const c of p.comments.slice(0, 15)) lines.push(`- (${c.score}) ${c.body.replace(/\s+/g, " ").slice(0, 600)}\n`);
  }
  return { corpus: lines.join(""), threads: picked.length, calls: queries.length + picked.length };
}

export async function product(url, site) {
  return llmJson([{ role: "user", content: prompt("product.md", { url, site }) }], { temperature: 0.3 });
}

export async function insights(url, prod, corpus) {
  const r = await llmJson([{ role: "user", content: prompt("insights.md", {
    brand: prod.brand, url, what: prod.what, buyers: prod.buyers, jobs: (prod.jobs || []).join("; "), corpus: corpus.slice(0, 150000) }) }],
  { temperature: 0.3 });
  const flat = corpus.toLowerCase().replace(/\W+/g, " ");
  for (const k of ["pains", "outcomes"]) for (const x of r.data[k] || []) {
    if (x.url && !corpus.includes(x.url)) x.url = "";  // never keep a link that is not in the corpus
    if (k === "pains" && x.quote) {
      const probe = x.quote.split("...")[0].toLowerCase().replace(/\W+/g, " ").trim().slice(0, 40);
      if (probe && !flat.includes(probe)) x.quote = "";
    }
  }
  return r;
}
