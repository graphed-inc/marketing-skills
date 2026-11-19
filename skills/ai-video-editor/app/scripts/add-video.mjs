#!/usr/bin/env node
// Add a video to the review app. Runs on your Mac (needs ffmpeg + the graphed CLI, logged in).
//
//   node scripts/add-video.mjs <video.mp4> --slug my-video --title "My video"
//        [--speakers "Sam,Alex"]      names for speaker 1, 2, … in the transcript
//        [--no-transcript]            comments only, no word script
//        [--transcript words.json]    use a Graphed transcription result you already have (no new run)
//        [--version v1]               a new cut of the same project: --version v2 (replaces the review video)
//        [--token ave_...]            project agent token (Copy for agent): publish through the app's agent API
//        [--changes "..."]            what changed in this cut, shown in the version history
//        [--site https://…]           the app's URL (or AVE_SITE); needed with --token
//        [--project <slug>] [--account <act_…>]   default: graphed.yaml and .graphed.json in the app folder
//        [--work <dir>]
//
// Steps (each one is skipped when its output already exists, so a re-run resumes):
//   1. ffmpeg -> fMP4 HLS, 6 s segments (video copied when it is H.264, else x264)
//   2. upload every file to storage videos/<slug>/<version>/hls/ (graphed storage upload, 6 at a time)
//   3. mono 64k MP3 -> storage -> graphed:transcription (WhisperX, 0.144 credits per second of audio)
//   4. meta.json + transcript.json -> storage videos/<slug>/<version>/, then publish: POST /agent/publish_version
//      with --token (or AVE_TOKEN), else `graphed exec … node cli.mjs register <slug>` (new projects)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { toWords } from "../words.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
// The Graphed project and account come from the app folder this script lives in, unless flags say other.
const APP = new URL("../", import.meta.url);
const readApp = (f) => { try { return readFileSync(new URL(f, APP), "utf8"); } catch { return ""; } };
const PROJECT = flag("--project") || readApp("graphed.yaml").match(/^slug:\s*(\S+)/m)?.[1] || "ai-video-editor";
const ACCOUNT = flag("--account") || process.env.GRAPHED_ACCOUNT || (() => { try { return JSON.parse(readApp(".graphed.json")).account_id; } catch { return ""; } })();
const SITE = (flag("--site") || process.env.AVE_SITE || "").replace(/\/$/, "");
const has = (n) => args.includes(n);
const src = args[0] && !args[0].startsWith("--") ? args[0] : undefined;   // the video file comes first
const slug = flag("--slug");
if (!src || !slug || !existsSync(src)) {
  console.error('usage: node scripts/add-video.mjs <video.mp4> --slug my-video --title "My video" [--speakers "A,B"] [--no-transcript | --transcript file.json]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) { console.error("slug: lowercase letters, digits, dashes"); process.exit(1); }
const title = flag("--title") || basename(src).replace(/\.[^.]+$/, "");
const version = flag("--version") || "v1";
if (!/^[\w.-]{1,20}$/.test(version)) { console.error("version: like v1, v2"); process.exit(1); }
const work = resolve(flag("--work") || join(homedir(), ".cache", "video-review", `${slug}-${version}`));
const HLS = `videos/${slug}/${version}/hls/`;   // each version gets its own folder, so a new cut never mixes with old segments
const hlsDir = join(work, "hls");
mkdirSync(hlsDir, { recursive: true });
const G = ["--project", PROJECT, ...(ACCOUNT ? ["--account", ACCOUNT] : [])];

const run = (cmd, argv, { quiet } = {}) => new Promise((ok, bad) => {
  // graphed runs from the app folder, so it finds .graphed.json (the account) when no --account is given
  const p = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"], ...(cmd === "graphed" ? { cwd: fileURLToPath(APP) } : {}) });
  let out = "", err = "";
  p.stdout.on("data", (d) => { out += d; if (!quiet) process.stdout.write(d); });
  p.stderr.on("data", (d) => { err += d; if (!quiet) process.stderr.write(d); });
  p.on("close", (code) => code === 0 ? ok(out) : bad(new Error(`${cmd} ${argv.slice(0, 3).join(" ")} … exit ${code}\n${err.slice(-1500)}`)));
});
const step = (m) => console.log(`\n== ${m}`);

// ---------- 1. HLS ----------
const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", src], { quiet: true }));
const vs = probe.streams.find((s) => s.codec_type === "video"), as = probe.streams.find((s) => s.codec_type === "audio");
const duration = Number(probe.format.duration);
if (!existsSync(join(hlsDir, "index.m3u8"))) {
  step(`HLS: ${vs?.codec_name} ${vs?.width}x${vs?.height}, ${as?.codec_name || "no audio"}, ${duration.toFixed(1)} s`);
  const v = vs?.codec_name === "h264" ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-force_key_frames", "expr:gte(t,n_forced*6)"];
  const a = as ? (as.codec_name === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"]) : ["-an"];
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-stats", "-y", "-i", src, "-map", "0:v:0", ...(as ? ["-map", "0:a:0"] : []), ...v, ...a,
    "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4",
    "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", join(hlsDir, "seg_%04d.m4s"), join(hlsDir, "index.m3u8.tmp")]);
  // write the playlist last so a killed run re-encodes instead of uploading half a stream
  writeFileSync(join(hlsDir, "index.m3u8"), readFileSync(join(hlsDir, "index.m3u8.tmp")));
}
const files = readdirSync(hlsDir).filter((f) => f === "init.mp4" || f.endsWith(".m4s") || f === "index.m3u8").sort();
const size = files.filter((f) => f !== "index.m3u8").reduce((a, f) => a + statSync(join(hlsDir, f)).size, 0);

// ---------- 2. upload ----------
const doneLog = join(work, "uploaded.txt");
const done = new Set(existsSync(doneLog) ? readFileSync(doneLog, "utf8").split("\n").filter(Boolean) : []);
const todo = files.filter((f) => !done.has(f));
step(`upload ${todo.length} of ${files.length} files (${(size / 1e9).toFixed(2)} GB) to ${HLS}`);
let n = 0;
async function upload(f) {
  for (let a = 1; ; a++) {
    try {
      await run("graphed", ["storage", "upload", join(hlsDir, f), HLS + f, ...G,
        "--content-type", f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp4"], { quiet: true });
      appendFileSync(doneLog, f + "\n");
      if (++n % 20 === 0 || n === todo.length) console.log(`  ${n}/${todo.length}`);
      return;
    } catch (e) { if (a >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * a)); }
  }
}
const queue = [...todo];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await upload(queue.shift()); }));

// ---------- 3. transcript ----------
const outT = join(work, "transcript.json");
if (!has("--no-transcript") && !existsSync(outT)) {
  let raw;
  if (flag("--transcript")) raw = JSON.parse(readFileSync(flag("--transcript"), "utf8"));
  else {
    if (!as) throw new Error("no audio stream: use --no-transcript");
    const rawFile = join(work, "transcription.raw.json");
    if (!existsSync(rawFile)) {
      step(`transcribe ${duration.toFixed(0)} s with graphed:transcription (~${Math.ceil(duration * 0.14375)} credits)`);
      const mp3 = join(work, "audio.mp3");
      if (!existsSync(mp3)) await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", mp3]);
      await run("graphed", ["storage", "upload", mp3, `videos/${slug}/audio.mp3`, ...G, "--content-type", "audio/mpeg"], { quiet: true });
      const url = (await run("graphed", ["storage", "url", `videos/${slug}/audio.mp3`, ...G, "--expires-in", "3600"], { quiet: true })).trim().split("\n").pop();
      writeFileSync(join(work, "tx-body.json"), JSON.stringify({ url, language: flag("--language") || "en" }));
      await run("graphed", ["tools", "run", "graphed:transcription", "--body-file", join(work, "tx-body.json"), ...G, "--wait", "--timeout", "3600", "--out", rawFile], { quiet: true });
    }
    raw = JSON.parse(readFileSync(rawFile, "utf8"));
  }
  const names = (flag("--speakers") || "").split(",").map((x) => x.trim()).filter(Boolean);
  writeFileSync(outT, JSON.stringify(toWords(raw, duration, { names })));
}

// ---------- 4. register ----------
step("register");
const meta = { slug, title, version, hls_prefix: HLS, duration, size, file: basename(src).replace(/\.[^.]+$/, "") + ".mp4" };
writeFileSync(join(work, "meta.json"), JSON.stringify(meta, null, 2));
const VP = `videos/${slug}/${version}/`;
for (const [file, key] of [[join(work, "meta.json"), VP + "meta.json"], [join(work, "meta.json"), `videos/${slug}/meta.json`], ...(existsSync(outT) ? [[outT, VP + "transcript.json"]] : [])])
  await run("graphed", ["storage", "upload", file, key, ...G, "--content-type", "application/json"], { quiet: true });
const token = flag("--token") || process.env.AVE_TOKEN;
if (token) {
  if (!SITE) { console.error("pass --site <app url> (or AVE_SITE) to publish with --token"); process.exit(1); }
  const r = await fetch(`${SITE}/agent/publish_version`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version, changes: flag("--changes"), ...(flag("--title") ? { title } : {}) }) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`publish_version: ${r.status} ${out.error || ""}`);
  console.log(`published ${version}: ${out.review_url}`);
} else {
  const extra = flag("--changes") ? ["--changes", flag("--changes")] : [];
  await run("graphed", ["exec", ...G, "--timeout", "300", "--", "node", "cli.mjs", "register", slug, ...(flag("--title") ? ["--title", title] : []), ...extra]);
}
console.log(`\nDone. Open ${SITE || "<app url>"}/p/${slug}/ (private). Turn on a share link from the project list.`);
console.log(`Work files (safe to delete): ${work}`);
