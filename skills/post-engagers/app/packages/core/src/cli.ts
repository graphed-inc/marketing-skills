import { coreEnv, numberEnv } from "./config";
import { pool, migrate } from "./index";
import { listPeople, insertManualJob, type JobRow } from "./store";
import { parsePostUrl, toCsv } from "./parse";
import { personRow, COLUMNS } from "./rows";
import { checkProfile, checkDue, parseUsername, type TrackedProfile } from "./tracker";
import { putObject } from "./storage";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

function line(j: JobRow): string {
  return `#${j.id}  ${j.status.padEnd(7)} ${j.stage.padEnd(9)} engagements ${j.engagements}  people ${j.unique_people} (new ${j.new_people})  profiles ${j.profiles}  emails ${j.emails} (verified ${j.verified})  ≈${Number(j.credits).toFixed(0)} credits  ${j.source}  ${j.post_url}${j.error ? `\n    error: ${j.error}` : ""}`;
}
function tline(t: TrackedProfile): string {
  const checked = t.last_checked_at ? new Date(t.last_checked_at).toISOString().slice(0, 16) : "never";
  return `T${t.id}  ${t.active ? "on " : "off"}  ${t.username.padEnd(28)} ${t.name || ""}  checked ${checked}${t.last_error ? `  error: ${t.last_error}` : ""}`;
}

await migrate();
try {
  const [cmd, sub, arg] = args;
  if (cmd === "add") {
    const post = parsePostUrl(sub);
    if (!post) throw new Error(`Not a LinkedIn post URL: ${sub}`);
    const j = await insertManualJob(post.url, post.postId, Number(flag("cap", String(numberEnv(coreEnv().MAX_PROFILES_PER_JOB, 1000)))));
    console.log(line(j));
  } else if (cmd === "status") {
    const { rows } = sub
      ? await pool.query<JobRow>("SELECT * FROM jobs WHERE id = $1", [Number(sub)])
      : await pool.query<JobRow>("SELECT * FROM jobs ORDER BY id DESC LIMIT 20");
    rows.forEach((j) => console.log(line(j)));
  } else if (cmd === "track" && sub === "add") {
    const username = parseUsername(arg || "");
    if (!username) throw new Error(`Not a LinkedIn profile URL: ${arg}`);
    const { rows } = await pool.query<TrackedProfile>(
      `INSERT INTO tracked_profiles (username, backfill_days, max_profiles) VALUES ($1,$2,$3)
       ON CONFLICT (username) DO UPDATE SET active = true RETURNING *`,
      [username, Number(flag("backfill", "7")), Number(flag("cap", "1000"))]);
    const t = rows[0];
    console.log(tline(t));
    console.log(await checkProfile(t));
  } else if (cmd === "track" && sub === "list") {
    const { rows } = await pool.query<TrackedProfile>("SELECT * FROM tracked_profiles ORDER BY id");
    rows.forEach((t) => console.log(tline(t)));
  } else if (cmd === "track" && sub === "check") {
    if (arg) {
      const { rows } = await pool.query<TrackedProfile>("SELECT * FROM tracked_profiles WHERE id = $1", [Number(arg)]);
      const t = rows[0];
      if (!t) throw new Error(`No tracked profile ${arg}`);
      console.log(await checkProfile(t));
    } else console.log(await checkDue());
  } else if (cmd === "track" && (sub === "off" || sub === "on")) {
    const { rows } = await pool.query<TrackedProfile>("UPDATE tracked_profiles SET active = $2 WHERE id = $1 RETURNING *", [Number(arg), sub === "on"]);
    console.log(rows[0] ? tline(rows[0]) : `No tracked profile ${arg}`);
  } else if (cmd === "export") {
    const key = flag("key");
    if (!key) throw new Error("--key <storage key> is required, e.g. --key exports/job-1.csv");
    const rows = await listPeople(sub === "all" ? null : Number(sub), {
      sinceDays: Number(flag("since", "0")) || null, trackedId: Number(flag("tracked", "0")) || null });
    await putObject(key, toCsv(rows.map(personRow), COLUMNS), "text/csv; charset=utf-8");
    console.log(`EXPORTED ${rows.length} people → ${key}`);
  } else {
    console.log("usage: add <post-url> | status [id] | track add|list|check|on|off | export <id|all> --key <key>");
  }
} finally {
  await pool.end();
}
