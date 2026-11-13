// @ts-nocheck
// Terminal access (`graphed exec --project <slug> -- node cli.mjs …`) and the daily job.
//   node cli.mjs daily                 pull every active brand, then analyze every new ad (cron job)
//   node cli.mjs pull <brand id|name>  pull one brand, then analyze
//   node cli.mjs analyze               drain the analysis queue
//   node cli.mjs status                brands, ad counts, queue, credits
//   node cli.mjs find <name|domain>    look a brand up in all three ad libraries
//   node cli.mjs research <url>        research the user's market + build the persona matrix (--from <stage> to redo)
//   node cli.mjs gaps                  top positioning gaps
//   node cli.mjs sql "<select …>" [--key out/x.json]   read-only SQL (for coding agents)
//   node cli.mjs export-market <file>  write the current market (research + matrix + tags) to a JSON file
//   node cli.mjs import-market <key>   load that JSON from project storage, then map this instance's ads into it
//   node cli.mjs add <name> [--fb <pageId>] [--google <domain>] [--google-id <AR…>] [--linkedin <companyId>] [--max 150]
import { q, one, pool } from "./db/sql";
import { migrate } from "./db/migrate";
import { pullAll, pullBrand } from "./pull";
import { drain } from "./analyze";
import { findBrand } from "./sources";
import { createMarket, runMarket, tagAds } from "./research";
import { currentMarket, matrix } from "./gaps";
import { get, put } from "./storage";
import { withTx } from "./db/sql";
import { writeFileSync } from "node:fs";

const [cmd, ...args] = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

await migrate();

async function brandOf(ref) {
  const b = /^\d+$/.test(ref || "") ? await one("SELECT * FROM brands WHERE id = $1", [Number(ref)])
    : await one("SELECT * FROM brands WHERE lower(name) = lower($1)", [ref]);
  if (!b) throw new Error(`no brand ${ref}`);
  return b;
}

async function status() {
  const rows = await q(`SELECT b.id, b.name, b.last_pulled_at,
      count(a.id)::int ads, count(a.id) FILTER (WHERE a.is_active)::int active,
      count(a.id) FILTER (WHERE a.analysis_status = 'done')::int analyzed,
      count(a.id) FILTER (WHERE a.analysis_status IN ('queued','running'))::int queued,
      count(a.id) FILTER (WHERE a.analysis_status = 'error')::int errors,
      round(coalesce(sum(a.credits),0)::numeric, 2)::float ai_credits
    FROM brands b LEFT JOIN ads a ON a.brand_id = b.id GROUP BY b.id ORDER BY b.id`);
  console.table(rows);
  console.table(await q("SELECT brand_id, platform, status, seen, new_ads, round(credits::numeric,2)::float credits, error, started_at FROM pulls ORDER BY id DESC LIMIT 10"));
}

try {
  if (cmd === "daily") {
    log("daily pull start");
    log(JSON.stringify(await pullAll({ log })));
    log(`analyzed ${await drain({ log })} ads`);
    const m = await currentMarket();
    if (m && m.status === "done") log(`mapped ${await tagAds(m.id, log)} ads into the persona matrix`);
  } else if (cmd === "research") {
    // node cli.mjs research <business url>   |   node cli.mjs research --from matrix
    const id = flag("from") ? (await currentMarket()).id : await createMarket(args[0]);
    await runMarket(id, { log, from: flag("from") });
  } else if (cmd === "gaps") {
    const m = await currentMarket();
    const r = await matrix(m.id);
    console.log(`${m.name} · ${m.status}/${m.stage} · ${r.voicesTagged} voices tagged · ${r.adsMapped} ads mapped`);
    for (const g of r.gaps) console.log(`GAP ${g.gap.toFixed(2)}  ${g.persona} × ${g.theme}  (${g.voices} voices, ${g.ads} ads)  "${g.quote?.quote || ""}"`);
  } else if (cmd === "sql") {
    // Read-only SQL for coding agents: node cli.mjs sql "<select …>" [--key out/result.json]
    const text = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--key").join(" ");
    if (!/^\s*(select|with)\b/i.test(text)) throw new Error("only SELECT / WITH queries");
    const rows = await withTx(async (c) => {
      await c.query("SET TRANSACTION READ ONLY");
      return (await c.query(text)).rows;
    });
    const out = JSON.stringify(rows, null, 1);
    if (flag("key")) { await put(flag("key"), Buffer.from(out), "application/json"); log(`${rows.length} rows → ${flag("key")}`); }
    else console.log(out);
  } else if (cmd === "export-market") {
    const m = await currentMarket();
    const dump = {
      market: m,
      personas: await q("SELECT * FROM personas WHERE market_id = $1", [m.id]),
      themes: await q("SELECT * FROM themes WHERE market_id = $1", [m.id]),
      voices: await q("SELECT * FROM voices WHERE market_id = $1", [m.id]),
      voice_tags: await q("SELECT vt.* FROM voice_tags vt JOIN voices v ON v.id = vt.voice_id WHERE v.market_id = $1", [m.id]),
    };
    writeFileSync(args[0], JSON.stringify(dump));
    log(`exported market ${m.id}: ${dump.voices.length} voices, ${dump.voice_tags.length} tags`);
  } else if (cmd === "import-market") {
    // Ads are not copied: their ids differ per instance, so this instance's ads are re-mapped.
    const d = JSON.parse((await get(args[0])).toString("utf8"));
    const mk = d.market;
    const m = await one(
      `INSERT INTO markets (url, name, profile, status, stage, progress, credits, finished_at)
       VALUES ($1,$2,$3,'done','done',$4,$5,now()) RETURNING id`,
      [mk.url, mk.name, JSON.stringify(mk.profile), JSON.stringify(mk.progress || {}), mk.credits || 0]);
    const pm = new Map(); const tm = new Map(); const vm = new Map();
    for (const p of d.personas) pm.set(p.id, (await one("INSERT INTO personas (market_id, name, description, position) VALUES ($1,$2,$3,$4) RETURNING id", [m.id, p.name, p.description, p.position])).id);
    for (const t of d.themes) tm.set(t.id, (await one("INSERT INTO themes (market_id, kind, name, description, position) VALUES ($1,$2,$3,$4,$5) RETURNING id", [m.id, t.kind, t.name, t.description, t.position])).id);
    for (const v of d.voices) {
      vm.set(String(v.id), (await one(
        `INSERT INTO voices (market_id, source, url, title, text, author, score, query, tagged, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [m.id, v.source, v.url, v.title, v.text, v.author, v.score, v.query, v.tagged, v.hash])).id);
    }
    for (const t of d.voice_tags) {
      if (!vm.has(String(t.voice_id)) || !pm.has(t.persona_id) || !tm.has(t.theme_id)) continue;
      await pool.query("INSERT INTO voice_tags (voice_id, persona_id, theme_id, intensity, quote) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [vm.get(String(t.voice_id)), pm.get(t.persona_id), tm.get(t.theme_id), t.intensity, t.quote]);
    }
    log(`imported market ${m.id} (${mk.name}): ${d.voices.length} voices, ${d.voice_tags.length} tags`);
    log(`mapped ${await tagAds(m.id, log)} ads into the persona matrix`);
  } else if (cmd === "pull") {
    const b = await brandOf(args[0]);
    log(JSON.stringify(await pullBrand(b.id, { log })));
    log(`analyzed ${await drain({ log })} ads`);
  } else if (cmd === "analyze") {
    log(`analyzed ${await drain({ log, limit: Number(flag("limit")) || Infinity })} ads`);
  } else if (cmd === "status") {
    await status();
  } else if (cmd === "find") {
    console.log(JSON.stringify(await findBrand(args.join(" ")), null, 2));
  } else if (cmd === "add") {
    const name = args[0];
    const r = await one(
      `INSERT INTO brands (name, fb_page_id, google_domain, google_advertiser_id, linkedin_company_id, max_ads)
       VALUES ($1, $2, $3, $4, $5, coalesce($6, 150)) RETURNING id`,
      [name, flag("fb") || null, flag("google") || null, flag("google-id") || null, flag("linkedin") || null, flag("max") ? Number(flag("max")) : null]);
    log(`brand ${r.id} added; run: node cli.mjs pull ${r.id}`);
  } else {
    console.log("commands: daily | pull <brand> | analyze | status | find <name> | add <name> --fb … --google … --linkedin …");
  }
} finally {
  await new Promise((r) => setTimeout(r, 2500)); // let `graphed exec` stream the last log lines
  await pool.end?.();
}
