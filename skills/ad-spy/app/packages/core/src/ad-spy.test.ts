// @ts-nocheck
// Offline tests: fake Graphed Tools + fake LLM, in-memory PGlite (PGLITE_DIR=memory), local media
// folder (MEDIA_DIR). Run with `npm test`, which sets that env.
import assert from "node:assert/strict";
import http from "node:http";

// A tiny local file server stands in for the ad CDNs.
const down = new Set();
const cdn = http.createServer((req, res) => {
  if (down.has(req.url)) { res.writeHead(500); return res.end("down"); }
  if (req.url.endsWith(".mp4")) { res.writeHead(200, { "content-type": "video/mp4" }); return res.end(Buffer.alloc(2048, 1)); }
  res.writeHead(200, { "content-type": "image/jpeg" }); res.end(Buffer.alloc(512, 2));
}).listen(0);
await new Promise((r) => cdn.once("listening", r));
const C = `http://localhost:${cdn.address().port}`;

const { setFakes } = await import("./tools");
const { q, one, pool } = await import("./db/sql");
const { migrate } = await import("./db/migrate");
const { normalizeFacebook, normalizeGoogle, normalizeLinkedin } = await import("./sources");
const { pullBrand } = await import("./pull");
const { drain, parseJson } = await import("./analyze");

const fbAd = (id, fmt = "VIDEO") => ({
  ad_archive_id: id, is_active: true, start_date_string: "2026-10-01T07:00:00.000Z", end_date_string: "2026-11-08T08:00:00.000Z",
  publisher_platform: ["FACEBOOK", "INSTAGRAM"], collation_count: 3, page_name: "Acme",
  snapshot: { title: "Big headline", body: { text: "Body copy" }, cta_text: "Shop now", link_url: "https://acme.com/x", display_format: fmt,
    page_profile_picture_url: `${C}/logo.jpg`, cards: [],
    videos: fmt === "VIDEO" ? [{ video_hd_url: `${C}/${id}.mp4`, video_sd_url: `${C}/${id}-sd.mp4`, video_preview_image_url: `${C}/${id}.jpg` }] : [],
    images: fmt === "IMAGE" ? [{ original_image_url: `${C}/${id}.jpg` }] : [] },
});

let fbPages = [[fbAd("1"), fbAd("2", "IMAGE")]];
let googleCursor = null;
let toolCalls = [];
setFakes({
  tool: async (id, input) => {
    toolCalls.push(id);
    if (id.endsWith("facebook/adLibrary/company/ads")) { const i = input.cursor ? Number(input.cursor) : 0; return { results: fbPages[i] || [], cursor: fbPages[i + 1] ? String(i + 1) : null }; }
    if (id.endsWith("google/company/ads")) return { ads: [{ creativeId: "CR1", format: "video", adUrl: "https://adstransparency.google.com/x", advertiserName: "Acme", firstShown: "2026-01-01T00:00:00Z", lastShown: new Date().toISOString() }], cursor: googleCursor };
    if (id.endsWith("google/ad")) return { variations: [{ headline: "G headline", description: "G desc", youtubeUrl: "https://www.youtube.com/watch?v=abc123XYZ", destinationUrl: "https://acme.com" }], overallImpressions: { min: "1000", max: "2000" } };
    if (id.endsWith("linkedin/ads/search")) return { ads: [{ id: "L1", adType: "Single Image Ad", description: "LI body", imageSources: [`${C}/li.jpg`], url: "https://linkedin.com/ad-library/detail/L1", startDate: "2026-02-01T00:00:00Z", endDate: null }], isLastPage: true };
    throw new Error(`unexpected tool ${id}`);
  },
  llm: { chat: { completions: { create: async ({ messages }) => {
    const parts = messages[0].content;
    assert.ok(parts.some((p) => p.type === "text"));
    return { usage: { cost: 0.004 }, choices: [{ message: { content: JSON.stringify({
      transcript: "hello world", on_screen_text: "SALE", visual_description: "a person talks", summary: "s", hook: "hello",
      hook_type: "Question", angle: "a", offer: "none", cta: "Shop", creative_style: "UGC talking head", target_audience: "moms",
      emotions: ["joy"], pain_points: ["slow"], benefits: ["fast"], tags: ["Acme", "sale"], duration_seconds: 21, language: "English" }) } }] };
  } } } },
});

await migrate();
const b = await one("INSERT INTO brands (name, fb_page_id, google_domain, linkedin_company_id, max_ads) VALUES ('Acme', '123', 'acme.com', '999', 50) RETURNING id");

// Normalizers
const n = normalizeFacebook(fbAd("9"));
assert.equal(n.format, "video"); assert.equal(n.media[0].kind, "video"); assert.deepEqual(n.placements, ["facebook", "instagram"]);
const g = normalizeGoogle({ creativeId: "C", format: "video", lastShown: new Date().toISOString() }, { variations: [{}, { youtubeUrl: "https://www.youtube.com/watch?v=k40dfSJUfhE", headline: "H" }] });
assert.equal(g.youtube_url, "https://www.youtube.com/watch?v=k40dfSJUfhE"); assert.equal(g.headline, "H"); assert.ok(g.is_active);
assert.equal(normalizeLinkedin({ id: "x", adType: "Video Ad", videoSources: [{ src: "https://v/1.mp4", bitrate: 1 }, { src: "https://v/2.mp4", bitrate: 9 }] }).media[0].src, "https://v/2.mp4");
assert.deepEqual(parseJson("```json\n{\"a\":1}\n```"), { a: 1 });

// First pull: 2 FB + 1 Google + 1 LinkedIn, media stored, all queued.
let r = await pullBrand(b.id);
assert.equal(r.facebook.new, 2); assert.equal(r.google.new, 1); assert.equal(r.linkedin.new, 1);
const ads = await q("SELECT * FROM ads ORDER BY id");
assert.equal(ads.length, 4);
assert.ok(ads.every((a) => a.analysis_status === "queued"));
const v = ads.find((a) => a.external_id === "1");
assert.equal(v.media[0].kind, "video"); assert.ok(v.media[0].key.endsWith(".mp4")); assert.ok(v.media[0].poster);
assert.ok((await one("SELECT logo_key FROM brands WHERE id = $1", [b.id])).logo_key);

// Analysis fills typed columns; enums normalized; "none" offer dropped.
assert.equal(await drain({ lanes: 2 }), 4);
const a1 = await one("SELECT * FROM ads WHERE external_id = '1'");
assert.equal(a1.analysis_status, "done"); assert.equal(a1.hook_type, "question"); assert.equal(a1.creative_style, "ugc talking head");
assert.equal(a1.offer, null); assert.deepEqual(a1.tags, ["acme", "sale"]); assert.ok(a1.credits > 0.39 && a1.credits < 0.41);

// Second pull: ad 2 stopped, ad 3 is new → ad 2 inactive, only ad 3 fetched as new.
fbPages = [[fbAd("1"), fbAd("3", "IMAGE")]];
toolCalls = [];
r = await pullBrand(b.id);
assert.equal(r.facebook.new, 1);
assert.equal((await one("SELECT is_active FROM ads WHERE external_id = '2'")).is_active, false);
assert.equal(toolCalls.filter((t) => t.endsWith("google/ad")).length, 0, "known Google ads are not re-fetched");

// Read-only transactions (the `sql` CLI command uses one) reject writes.
const { withTx } = await import("./db/sql");
await assert.rejects(withTx(async (c) => { await c.query("SET TRANSACTION READ ONLY"); await c.query("DELETE FROM ads"); }));
assert.equal((await q("SELECT count(*)::int n FROM ads"))[0].n, 5);

// Agent prompt points at the sql command and names the gap tables.
const { agentPrompt } = await import("./prompt");
assert.ok(agentPrompt("x").includes("cli.mjs sql") && agentPrompt("x").includes("voice_tags"));

// API: state, ads and gaps answer as JSON.
const { handleApi } = await import("./api");
const st = await (await handleApi("GET", new URL("http://x/api/state"), {})).json();
assert.equal(st.brands.length, 1); assert.equal(st.totals.ads, 5);
const apiAds = await (await handleApi("GET", new URL("http://x/api/ads?platform=facebook"), {})).json();
assert.equal(apiAds.total, 3); assert.ok(apiAds.ads[0].thumb.url.startsWith("/m/ads/facebook/"));
const media = await handleApi("GET", new URL(`http://x${apiAds.ads.find((a) => a.thumb.kind === "image").thumb.url}`), {});
assert.equal(media.status, 200);

// Gap scoring: loud + uncovered beats loud + covered; quiet + covered is "crowded".
const { score, matrix } = await import("./gaps");
const sc = score([{ weight: 10, strength: 0 }, { weight: 10, strength: 10 }, { weight: 1, strength: 8 }]);
assert.equal(sc[0].gap, 1); assert.equal(sc[1].gap, 0); assert.ok(sc[2].crowded);

// Matrix query over a tiny market: 2 personas × 2 themes, voices in cell A, an ad in cell B.
const mk = await one("INSERT INTO markets (url, status, stage) VALUES ('https://acme.com', 'done', 'done') RETURNING id");
const p1 = await one("INSERT INTO personas (market_id, name, position) VALUES ($1, 'Busy mom', 0) RETURNING id", [mk.id]);
const p2 = await one("INSERT INTO personas (market_id, name, position) VALUES ($1, 'Gym bro', 1) RETURNING id", [mk.id]);
const t1 = await one("INSERT INTO themes (market_id, kind, name, position) VALUES ($1, 'pain', 'No time', 0) RETURNING id", [mk.id]);
const t2 = await one("INSERT INTO themes (market_id, kind, name, position) VALUES ($1, 'outcome', 'Look good', 1) RETURNING id", [mk.id]);
for (let i = 0; i < 3; i++) {
  const v = await one("INSERT INTO voices (market_id, source, text, hash) VALUES ($1, 'reddit', $2, $3) RETURNING id", [mk.id, `I never have time ${i}`, `h${i}`]);
  await pool.query("INSERT INTO voice_tags (voice_id, persona_id, theme_id, intensity, quote) VALUES ($1,$2,$3,2,'never have time')", [v.id, p1.id, t1.id]);
}
const anyAd = await one("SELECT id FROM ads LIMIT 1");
await pool.query("INSERT INTO ad_tags (market_id, ad_id, persona_id, theme_id, strength) VALUES ($1,$2,$3,$4,3)", [mk.id, anyAd.id, p2.id, t2.id]);
const mx = await matrix(mk.id);
assert.equal(mx.cells.length, 4);
assert.equal(mx.gaps[0].p, p1.id); assert.equal(mx.gaps[0].t, t1.id); assert.equal(mx.gaps[0].voices, 3); assert.equal(mx.gaps[0].ads, 0);
assert.equal(mx.gaps[0].quote.quote, "never have time");
assert.equal(mx.cells.find((c) => c.p === p2.id && c.t === t2.id).ads, 1);

// The active-ad count must not overwrite the brand's pause flag.
await pool.query("UPDATE brands SET active = false WHERE id = $1", [b.id]);
const paused = await (await handleApi("GET", new URL("http://x/api/state"), {})).json();
assert.equal(paused.brands[0].active, false);
assert.ok(paused.brands[0].activeAds > 0);
await pool.query("UPDATE brands SET active = true WHERE id = $1", [b.id]);

// An incomplete Google list must not expire ads on a later page.
await pool.query("INSERT INTO ads (brand_id, platform, external_id, is_active, ended_at, media, analysis_status) VALUES ($1, 'google', 'LATER', true, now() - interval '10 days', '[]', 'done')", [b.id]);
googleCursor = "next";
await pullBrand(b.id);
assert.equal((await one("SELECT is_active FROM ads WHERE external_id = 'LATER'")).is_active, true);
googleCursor = null;

// A complete Meta pull that lists nothing marks every stored Meta ad inactive.
fbPages = [[]];
await pullBrand(b.id);
for (const id of ["1", "2", "3"]) assert.equal((await one("SELECT is_active FROM ads WHERE external_id = $1", [id])).is_active, false);

// A creative whose files fail to download is saved, then the next pull stores the files.
down.add("/miss.mp4");
down.add("/miss-sd.mp4");
fbPages = [[fbAd("miss")]];
await pullBrand(b.id);
assert.deepEqual((await one("SELECT media FROM ads WHERE external_id = 'miss'")).media, []);
down.clear();
await pullBrand(b.id);
assert.ok((await one("SELECT media FROM ads WHERE external_id = 'miss'")).media.length > 0);
assert.equal((await one("SELECT raw->>'_media_incomplete' incomplete FROM ads WHERE external_id = 'miss'")).incomplete, null);

// A fresh heartbeat cannot be claimed twice. An explicit rerun can take it.
const { claimMarket } = await import("./research");
const market = await one("INSERT INTO markets (url) VALUES ('https://acme.com') RETURNING id");
assert.equal(await claimMarket(market.id), true);
assert.equal(await claimMarket(market.id), false);
assert.equal(await claimMarket(market.id, { force: true }), true);

// Two mappers cannot both claim the same ad.
const ad = await one("SELECT id FROM ads LIMIT 1");
const first = await one(
  "INSERT INTO ad_mapped (market_id, ad_id, pending) VALUES ($1, $2, true) ON CONFLICT (market_id, ad_id) DO NOTHING RETURNING ad_id",
  [market.id, ad.id]);
const second = await one(
  "INSERT INTO ad_mapped (market_id, ad_id, pending) VALUES ($1, $2, true) ON CONFLICT (market_id, ad_id) DO NOTHING RETURNING ad_id",
  [market.id, ad.id]);
assert.equal(Number(first.ad_id), Number(ad.id));
assert.equal(second, null);

// An older Google row with empty media and no incomplete flag is still retried from the saved detail.
await pool.query(
  `INSERT INTO ads (brand_id, platform, external_id, is_active, media, raw, analysis_status)
   VALUES ($1, 'google', 'HIDDEN', true, '[]', $2, 'done')`,
  [b.id, JSON.stringify({ item: { creativeId: "HIDDEN", adUrl: "https://adstransparency.google.com/hidden" }, detail: { variations: [{ imageUrl: `${C}/hidden.jpg` }] } })]);
toolCalls = [];
await pullBrand(b.id);
const hidden = await one("SELECT media, raw->>'_media_incomplete' incomplete FROM ads WHERE external_id = 'HIDDEN'");
assert.ok(hidden.media.length > 0, "unseen google creative is retried from saved detail");
assert.equal(hidden.incomplete, null);
assert.equal(toolCalls.filter((t) => t.endsWith("google/ad")).length, 0);

// An unseen row that already has one of two files, and no incomplete flag, still gets the rest.
await pool.query(
  `INSERT INTO ads (brand_id, platform, external_id, is_active, media, raw, analysis_status)
   VALUES ($1, 'facebook', 'PARTIAL', true, $2, $3, 'done')`,
  [b.id,
    JSON.stringify([{ kind: "image", key: "ads/facebook/PARTIAL/0.jpg", type: "image/jpeg", bytes: 10 }]),
    JSON.stringify({ ad_archive_id: "PARTIAL", snapshot: { images: [{ original_image_url: `${C}/partial-a.jpg` }, { original_image_url: `${C}/partial-b.jpg` }] } })]);
await pullBrand(b.id);
const partial = await one("SELECT media FROM ads WHERE external_id = 'PARTIAL'");
assert.equal(partial.media.length, 2, "unseen partial creative is filled from saved snapshot");

// A legacy LinkedIn row stores the file on video/image, not videoSources/imageSources.
await pool.query(
  `INSERT INTO ads (brand_id, platform, external_id, is_active, media, raw, analysis_status)
   VALUES ($1, 'linkedin', 'LI-PARTIAL', true, $2, $3, 'done')`,
  [b.id,
    JSON.stringify([{ kind: "video", key: "ads/linkedin/LI-PARTIAL/0.mp4", type: "video/mp4", bytes: 10 }]),
    JSON.stringify({ id: "LI-PARTIAL", video: `${C}/li-partial.mp4`, image: `${C}/li-partial.jpg` })]);
await pullBrand(b.id);
const liPartial = await one("SELECT media FROM ads WHERE external_id = 'LI-PARTIAL'");
assert.equal(liPartial.media.length, 2, "unseen partial linkedin creative is filled from video and image");

// New ads are saved even when many old downloads are waiting, and only four of those are retried.
fbPages = [[fbAd("NEW1")]];
for (let i = 0; i < 6; i++) {
  down.add(`/dead-${i}.jpg`);
  await pool.query(
    `INSERT INTO ads (brand_id, platform, external_id, is_active, media, raw, analysis_status)
     VALUES ($1, 'facebook', $2, true, '[]', $3, 'done')`,
    [b.id, `DEAD-${i}`, JSON.stringify({ ad_archive_id: `DEAD-${i}`, snapshot: { images: [{ original_image_url: `${C}/dead-${i}.jpg` }] } })]);
}
await pullBrand(b.id);
assert.ok(await one("SELECT id FROM ads WHERE external_id = 'NEW1'"), "a new ad is saved before old retries finish");
const retried = await q("SELECT external_id FROM ads WHERE external_id LIKE 'DEAD-%' AND raw->>'_media_retry_at' IS NOT NULL ORDER BY external_id");
assert.deepEqual(retried.map((r) => r.external_id), ["DEAD-0", "DEAD-1", "DEAD-2", "DEAD-3"]);

cdn.close();
console.log("ALL TESTS PASS");
process.exit(0);
