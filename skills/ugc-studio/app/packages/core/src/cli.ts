// @ts-nocheck
// Terminal access (run with `graphed exec --project ugc-studio -- node cli.mjs …`). This only reads and writes
// Postgres; the web service's worker does the work.
//
//   node cli.mjs status                                   queue + counts
//   node cli.mjs avatars                                  avatar library
//   node cli.mjs research <url> [--n 10] [--styles story,hook] [--avatar <id>]
//   node cli.mjs projects | project <id>                  research + scripts
//   node cli.mjs scripts <projectId> [--more 10]          list (or write more) scripts
//   node cli.mjs estimate --scripts 1,2,3 --avatars 1,2 [--engine kling] [--pair all]
//   node cli.mjs render   --scripts 1,2,3 --avatars 1,2 [...] --yes     (spends credits: approve the estimate first)
//   node cli.mjs videos [batch] | video <id>              progress, links, NOT FIXED words, log
//   node cli.mjs retry <videoId> | cancel <videoId>
import { pool, q, one, retryVideo } from "./db/sql";
import { videoLinks } from "./links";
import { plan, createVideos } from "./plan";
import { addScripts } from "./worker";

const argv = process.argv.slice(2);
const cmd = argv[0], arg = argv[1] && !argv[1].startsWith("--") ? argv[1] : null;
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const out = (s = "") => process.stdout.write(String(s) + "\n");
const ids = (s) => String(s || "").split(",").map((x) => Number(x.trim())).filter(Boolean);
const short = (t, n = 90) => String(t || "").replace(/\s+/g, " ").slice(0, n);

function batchBody() {
  return { items: ids(flag("scripts")).map((id) => ({ script_id: id })), avatar_ids: ids(flag("avatars")),
    engine: flag("engine", "seedance"), pair: flag("pair", "cycle") };
}

try {
  if (cmd === "status") {
    const s = await one(`SELECT count(*) FILTER (WHERE status='queued')::int q, count(*) FILTER (WHERE status='running')::int r,
      count(*) FILTER (WHERE status='done')::int d, count(*) FILTER (WHERE status='error')::int e, coalesce(sum(credits),0)::float c FROM videos`);
    out(`videos: ${s.q} queued, ${s.r} running, ${s.d} done, ${s.e} error · ~${Math.round(s.c)} credits spent`);
    for (const p of await q("SELECT id, brand, url, status, stage FROM projects WHERE status IN ('queued','running') ORDER BY id"))
      out(`research #${p.id} ${p.brand || p.url}: ${p.status} ${p.stage || ""}`);
  } else if (cmd === "avatars") {
    for (const a of await q("SELECT * FROM avatars WHERE NOT archived ORDER BY id")) out(`${a.id}\t${a.name}\tvoice=${a.voice}\t${short(a.persona, 70)}`);
    for (const v of await q("SELECT * FROM voices")) out(`voice ${v.id}: ${v.voice_id || "(none)"} ${v.status}`);
  } else if (cmd === "research") {
    if (!arg) throw new Error("usage: research <url>");
    const url = /^https?:\/\//.test(arg) ? arg : "https://" + arg;
    const p = await one("INSERT INTO projects (url, n, styles, avatar_id) VALUES ($1,$2,$3,$4) RETURNING id",
      [url, Number(flag("n", 10)), flag("styles", "story,hook"), Number(flag("avatar", 0)) || null]);
    out(`project ${p.id} queued: ${url}. Watch: node cli.mjs project ${p.id}`);
  } else if (cmd === "projects") {
    for (const p of await q(`SELECT p.*, (SELECT count(*)::int FROM scripts s WHERE s.project_id = p.id) n_scripts FROM projects p ORDER BY id DESC`))
      out(`${p.id}\t${p.status}\t${p.brand || "?"}\t${p.n_scripts} scripts\t${p.url}${p.stage ? "\t" + p.stage : ""}${p.error ? "\t! " + short(p.error) : ""}`);
  } else if (cmd === "project" || cmd === "scripts") {
    const p = await one("SELECT * FROM projects WHERE id = $1", [arg]);
    if (!p) throw new Error("no project " + arg);
    if (flag("more")) {
      if (!p.product) throw new Error("research is not finished yet");
      out(`writing ${Number(flag("more"))} more scripts…`);
      await addScripts(p.id, Number(flag("more")), p.styles);
    }
    out(`${p.brand || p.url} · ${p.status}${p.stage ? " · " + p.stage : ""} · ${p.threads ?? "?"} threads · ~${Math.round(p.credits)} credits`);
    if (cmd === "project" && p.insights) for (const x of p.insights.pains || []) out(`  pain: ${x.pain} — ${short(x.summary, 100)}`);
    for (const s of await q("SELECT * FROM scripts WHERE project_id = $1 ORDER BY id", [p.id]))
      out(`\n[${s.id}] ${s.style} ${s.words}w ${s.angle || ""}${s.fits === false ? "  ! too long" : ""}\n${s.text}${s.claims.length ? "\n  check: " + s.claims.join(" | ") : ""}`);
  } else if (cmd === "estimate" || cmd === "render") {
    const p = await plan(batchBody());
    for (const r of p.rows) out(`${r.tooLong ? "TOO LONG" : "ok      "} script ${r.script_id} × ${r.avatar}: ${r.words}w ~${r.secs}s ~${r.credits} cr  ${short(r.text, 60)}`);
    out(`total ~${p.total} credits (~$${(p.total / 100).toFixed(2)}), ${p.engine}`);
    if (cmd === "render") {
      if (!flag("yes")) throw new Error("not started: add --yes after the person approves this cost");
      const r = await createVideos(batchBody());
      out(`batch ${r.batch}: ${r.ids.length} videos queued (ids ${r.ids.join(",")}). Watch: node cli.mjs videos ${r.batch}`);
    }
  } else if (cmd === "videos") {
    const rows = await q(`SELECT v.*, a.name avatar, a.image_key AS avatar_image_key, a.thumb_key AS avatar_thumb_key
      FROM videos v LEFT JOIN avatars a ON a.id = v.avatar_id ${arg ? "WHERE v.batch = $1" : ""} ORDER BY v.id DESC LIMIT 50`, arg ? [arg] : []);
    for (const v of rows) {
      const links = await videoLinks(v);
      out(`${v.id}\t${v.batch}\t${v.status}${v.stage ? ` (${v.stage})` : ""}\t${v.avatar}\t${v.engine}\t${short(v.script, 50)}${v.error ? "\t! " + short(v.error, 120) : ""}`);
      if (links.url) out(`\t  ${links.url}`);
      for (const u of (v.report && v.report.unfixed) || []) out(`\t  NOT FIXED ${u.at}s ${u.kind}: heard '${u.heard}'${u.script ? `, script '${u.script}'` : ""}`);
    }
  } else if (cmd === "video") {
    const v = await one(`SELECT v.*, a.name avatar, a.image_key AS avatar_image_key, a.thumb_key AS avatar_thumb_key
      FROM videos v LEFT JOIN avatars a ON a.id = v.avatar_id WHERE v.id = $1`, [arg]);
    if (!v) throw new Error("no video " + arg);
    const links = await videoLinks(v);
    const { keys, log, avatar_image_key, avatar_thumb_key, ...rest } = v;
    out(JSON.stringify({ ...rest, url: links.url, file: links.file, poster: links.poster }, null, 1));
    out(log);
  } else if (cmd === "retry") {
    const r = await retryVideo(arg);
    if (r.held) throw new Error("this clip is still stopping; try again in a moment");
    out("queued");
  } else if (cmd === "cancel") {
    await pool.query("UPDATE videos SET status='canceled' WHERE id=$1 AND status IN ('queued','running')", [arg]); out("canceled");
  } else {
    out("commands: status avatars research projects project scripts estimate render videos video retry cancel");
  }
} catch (e) {
  out("error: " + (e.message || e));
  process.exitCode = 1;
} finally {
  await pool.end?.();
  await new Promise((r) => setTimeout(r, 2000));  // graphed exec drops output of a process that exits at once
}
