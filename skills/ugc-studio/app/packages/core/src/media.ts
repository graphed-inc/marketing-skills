// @ts-nocheck
// Local media helpers: ffmpeg / ffprobe / python, all run as child processes.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { projectRoot } from "./config";

// engine/, prompts/ and seed/ live at the app root (the directory with graphed.yaml).
export const APP = projectRoot();
export const ENGINE = join(APP, "engine");

export function run(cmd, args, { input, env, timeoutMs = 30 * 60_000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...(env || {}) }, cwd });
    let out = "", err = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code, sig) => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (${sig || code}): ${(err || out).trim().slice(-700)}`));
    });
    if (input !== undefined) p.stdin.end(input);
  });
}

export const ffmpeg = (args, o) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], o);

export async function duration(path) {
  return Number(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]));
}

// Same quote removal + spell-out as ugc-video (engine/spoken.py).
export async function spoken(text) {
  return JSON.parse(await run("python3", [join(ENGINE, "spoken_cli.py")], { input: text }));
}

// ---- numbers from ugc-video's make_ugc.py ----
export const TARGET = 29.0, MAX_TEMPO = 1.10, WORDS_PER_SEC = 3.6;
export const CREDITS = { seedance: 16.1, kling: 4.0 }; // per second; 1 credit = 1 cent
export const TTS_PER_1K_CHARS = 11.5;

export function estimate(words, chars, engine) {
  const read = words / WORDS_PER_SEC;
  const secs = Math.min(30, Math.max(4, Math.ceil(Math.min(read, TARGET))));
  const credits = (engine === "kling" ? read : secs) * CREDITS[engine] + chars * TTS_PER_1K_CHARS / 1000;
  const tooLong = read > TARGET * MAX_TEMPO;
  return { words, read: +read.toFixed(1), secs, credits: Math.round(credits), tooLong,
    cut: tooLong ? Math.ceil(words - TARGET * MAX_TEMPO * WORDS_PER_SEC) : 0 };
}
