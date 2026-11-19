// Runs inside the project image:  graphed exec --project <slug> --account <act_…> -- node cli.mjs <cmd>
//   new "<title>"                          make an empty project; prints its slug, review URL and agent token
//   token <slug> [--rotate]                the project's agent token (ave_…)
//   list                                   projects with counts and share state
//   register <slug> [--title "..."]        add / refresh a video that add-video.mjs uploaded to videos/<slug>/
//   share <slug> on|off|rotate             turn the public link on or off, or replace it
//   sources <slug>                         uploaded source files with their storage keys
//   notes <slug>                           edit notes: comments + script cuts by timecode (markdown)
//   prompt <slug>                          the coding-agent prompt the Share > Copy for agent button gives
import { db, migrate, newToken, exportList, projectPrompt, SITE, SLUG, getText } from "./lib.mjs";
import { publishVersion, agentToken } from "./agent.mjs";

const [cmd, slug, ...rest] = process.argv.slice(2);
const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };

await migrate();
try {
  if (cmd === "new" && slug) {
    const title = [slug, ...rest.filter((x) => !x.startsWith("--"))].join(" ").trim().slice(0, 200);
    const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "video";
    let made;
    for (let i = 1; i < 100 && !made; i++) {
      const s = i === 1 ? base : `${base}-${i}`;
      if (!SLUG.test(s)) throw new Error(`bad slug from title: ${s}`);
      if ((await db.query(`insert into projects (slug, title, hls_prefix, playlist) values ($1, $2, null, null) on conflict (slug) do nothing returning slug`, [s, title])).rowCount) made = s;
    }
    console.log(`project: ${made}\nreview:  ${SITE}/p/${made}/\ntoken:   ${await agentToken(made)}\nupload:  AVE_TOKEN=<token> node scripts/upload-sources.mjs --site ${SITE || "<app url>"} "<file>=<label>"`);
  } else if (cmd === "token" && slug) {
    console.log(await agentToken(slug, { rotate: rest.includes("--rotate") }));
  } else if (cmd === "list") {
    const { rows } = await db.query(`select slug, title, duration, share_on, share_token,
      (select count(*) from comments c where c.asset = p.slug) as comments, (select count(*) from cuts k where k.asset = p.slug) as cuts
      from projects p order by created_at`);
    for (const r of rows)
      console.log(`${r.slug}\t${r.title}\t${Math.round(r.duration || 0)}s\t${r.comments} comments\t${r.cuts} cuts\t${r.share_on ? `${SITE}/public/${r.share_token}` : "private"}`);
  } else if (cmd === "register" && slug) {
    // videos/<slug>/meta.json (from add-video.mjs) names the version it just uploaded
    const meta = JSON.parse(await getText(`videos/${slug}/meta.json`));
    await publishVersion(slug, { version: meta.version, title: flag("--title"), changes: flag("--changes"), by: "add-video" });
    console.log(`registered ${slug}: ${SITE}/p/${slug}/`);
  } else if (cmd === "share" && slug && ["on", "off", "rotate"].includes(rest[0])) {
    const { rows } = await db.query(`select share_token from projects where slug = $1`, [slug]);
    if (!rows[0]) throw new Error(`no project ${slug}`);
    const token = rest[0] === "rotate" || !rows[0].share_token ? newToken() : rows[0].share_token;
    await db.query(`update projects set share_on = $2, share_token = $3 where slug = $1`, [slug, rest[0] !== "off", token]);
    console.log(rest[0] === "off" ? `${slug}: private` : `${slug}: ${SITE}/public/${token}`);
  } else if (cmd === "sources" && slug) {
    const { rows } = await db.query(`select id, label, file_name, size, status, key from sources where project = $1 order by id`, [slug]);
    if (!rows.length) console.log(`${slug}: no source files`);
    for (const r of rows) console.log(`${r.id}\t${r.status}\t${(Number(r.size) / 1e9).toFixed(2)} GB\t${r.label}\t${r.key}`);
  } else if (cmd === "notes" && slug) {
    const { rows: [p] } = await db.query(`select slug, title, version, transcript from projects where slug = $1`, [slug]);
    if (!p) throw new Error(`no project ${slug}`);
    console.log(await exportList({ ...p, W: p.transcript?.words || [] }, "md"));
  } else if (cmd === "prompt" && slug) {
    console.log(await projectPrompt(slug));
  } else {
    console.log('usage: node cli.mjs new "<title>" | token <slug> [--rotate] | list | register <slug> [--title t] | share <slug> on|off|rotate | sources|notes|prompt <slug>');
    process.exitCode = 1;
  }
} finally {
  await db.end();
  await new Promise((r) => setTimeout(r, 2000));   // graphed exec can drop the output of a process that exits at once
}
