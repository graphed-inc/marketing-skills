#!/usr/bin/env node
// Upload raw source files (cameras, mics, screen) into a video project from this machine, with the
// project's agent token. Each file goes straight to project storage in 16 MiB parts (4 at a time),
// then the app transcribes it (about 0.144 credits per second of audio).
//
//   node scripts/upload-sources.mjs --site <app url> --token <ave_…> "<file>=<label>" ["<file>=<label>" …]   (or AVE_SITE / AVE_TOKEN)
//   e.g. node scripts/upload-sources.mjs --site https://… --token $AVE_TOKEN "~/Desktop/sam.wav=Sam mic" "~/Desktop/wide.mp4=Wide camera"
//
// Resume an upload that stopped (parts already in storage are skipped):
//   node scripts/upload-sources.mjs --token $AVE_TOKEN "<file>=#<source id>"
//
// A part that fails is tried 8 times (a fresh signed URL each time). A file that still fails is reported
// with its resume command, and the next file goes on.
import { createReadStream, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const token = flag("--token", process.env.AVE_TOKEN);
const site = (flag("--site", process.env.AVE_SITE) || "").replace(/\/$/, "");
const conc = Number(flag("--parallel", 4));
if (!token || !site || !args.length) { console.error("usage: upload-sources.mjs --site <app url> --token <ave_…> [--parallel 4] \"<file>=<label>\" | \"<file>=#<source id>\" …"); process.exit(1); }

const call = async (tool, body) => {
  for (let i = 1; ; i++) {
    const r = await fetch(`${site}/agent/${tool}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    if (i >= 5 || (r.status && r.status < 500)) throw new Error(`${tool}: ${j.error || r.status}`);
    await new Promise((ok) => setTimeout(ok, 3000 * i));
  }
};
const TYPES = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".mkv": "video/x-matroska", ".webm": "video/webm",
  ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".aac": "audio/aac", ".flac": "audio/flac", ".aif": "audio/aiff", ".aiff": "audio/aiff" };

let failed = 0;
for (const a of args) {
  const eq = a.lastIndexOf("=");
  const path = resolve((eq > 0 ? a.slice(0, eq) : a).replace(/^~(?=\/)/, homedir()));
  const tag = eq > 0 ? a.slice(eq + 1) : undefined;
  const size = statSync(path).size, t0 = Date.now();
  let s, have = new Set();
  try {
    if (tag?.startsWith("#")) {                       // resume
      const r = await call("source_parts", { source_id: Number(tag.slice(1)), parts: [] });
      if (r.size !== size) throw new Error(`source ${tag} is ${r.size} bytes, this file is ${size}`);
      s = { source_id: Number(tag.slice(1)), label: r.label, part_size: r.part_size, parts: Math.ceil(size / r.part_size), urls: {} };
      have = new Set(r.uploaded.filter((p) => p.size === Math.min(r.part_size, size - (p.n - 1) * r.part_size)).map((p) => p.n));
      console.log(`${s.label}: resuming, ${have.size}/${s.parts} parts already uploaded`);
    } else s = await call("add_source", { file_name: basename(path), size, label: tag, content_type: TYPES[extname(path).toLowerCase()] });
    const urls = { ...s.urls };
    const todo = Array.from({ length: s.parts }, (_, i) => i + 1).filter((n) => !have.has(n));
    let sent = [...have].reduce((t, n) => t + Math.min(s.part_size, size - (n - 1) * s.part_size), 0);
    const putPart = async (n) => {
      const start = (n - 1) * s.part_size, end = Math.min(size, n * s.part_size) - 1;
      for (let attempt = 1; ; attempt++) {
        try {
          if (!urls[n]) Object.assign(urls, (await call("source_parts", { source_id: s.source_id, parts: todo.filter((k) => k >= n).slice(0, 50) })).urls);
          const r = await fetch(urls[n], { method: "PUT", body: createReadStream(path, { start, end }), duplex: "half", headers: { "Content-Length": String(end - start + 1) },
            signal: AbortSignal.timeout(300_000) });
          if (!r.ok) throw new Error(`part ${n}: HTTP ${r.status}`);
          break;
        } catch (e) {
          if (attempt >= 8) throw e;
          delete urls[n];                               // the next try gets a fresh signed URL
          process.stdout.write(`\n${s.label}: ${e.message}, retry ${attempt}/7\n`);
          await new Promise((ok) => setTimeout(ok, Math.min(60_000, 4000 * attempt)));
        }
      }
      sent += end - start + 1;
      process.stdout.write(`\r${s.label}: ${(sent / 1e6).toFixed(0)} / ${(size / 1e6).toFixed(0)} MB   `);
    };
    let next = 0;
    await Promise.all(Array.from({ length: conc }, async () => { while (next < todo.length) await putPart(todo[next++]); }));
    await call("complete_source", { source_id: s.source_id });
    console.log(`\r${s.label}: uploaded ${(size / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s (source ${s.source_id}, transcription queued)`);
  } catch (e) {
    failed++;
    console.log(`\n${s?.label || basename(path)}: FAILED ${e.message}` + (s?.source_id ? `\n  resume: node scripts/upload-sources.mjs --token … "${path}=#${s.source_id}"` : ""));
  }
}
process.exit(failed ? 1 : 0);
