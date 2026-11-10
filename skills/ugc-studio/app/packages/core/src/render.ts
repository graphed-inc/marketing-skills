// @ts-nocheck
// One video, script in → MP4 out. Port of ugc-video's make_ugc.py:
//   1 spoken text   2 TTS (fal MiniMax, avatar's shared voice)   3 fit ≤29 s (pause trim + atempo ≤1.10)
//   4 Seedance 2.5 480p (kie) or Kling Avatar 720p   5-6 word check + fix (engine/fix_words.py, graphed:transcription)
//   7 upscale (resize + grain, no AI)
// Every finished step stores its file key in videos.keys, so a restart resumes where it stopped, and paid
// tool calls use idempotency keys (a replay returns the finished run for free).
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { one, logVideo, setVideo } from "./db/sql";
import { tool } from "./tools";
import * as store from "./storage";
import { ENGINE, ffmpeg, run, duration, spoken, estimate, TARGET, MAX_TEMPO, WORDS_PER_SEC, CREDITS } from "./media";
import { prompt } from "./prompts";
import { STEP_OF_STAGE } from "./eta";
import { makePoster } from "./links";
import { coreEnv, txToken } from "./config";

const TTS = "fal:fal-ai/minimax/speech-02-hd";
const SEEDANCE = "kie:bytedance/seedance-2-5";
const KLING = "kie:kling/ai-avatar-standard";
const TRANSCRIBE = "graphed:transcription";
const NEG = "text overlay, subtitles, captions, logo, watermark, extra people, cartoon, distorted hands, split screen, " +
  "b-roll cutaway, halo, glow around head, bright outline, rim light, aura, lens flare, glowing edges";
// More than this share of the script wrong after the fix = a failed take (status bad_take, not done).
export const BAD_TAKE = 0.2;

export const WORK = coreEnv().WORK_DIR || "/tmp/ugc-work";
export const TX = {
  get token() { return txToken(); },
  port: Number(coreEnv().PORT || 3000),
};

function spokenText(word) {
  const text = String(word || "");
  if (!text.trim()) return "";
  return text.startsWith(" ") ? text : ` ${text}`;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// A word with no time still has to be heard. Place it in the gap between the
// timed words on either side so the alignment does not treat it as missing.
function placeMissingTimes(pieces) {
  const out = pieces.map((piece) => ({ ...piece }));
  let i = 0;
  while (i < out.length) {
    if (out[i].start != null && out[i].end != null) { i++; continue; }
    let run = i;
    while (run < out.length && (out[run].start == null || out[run].end == null)) run++;
    let prev = 0;
    for (let j = i - 1; j >= 0; j--) if (out[j].end != null) { prev = out[j].end; break; }
    let next = prev;
    for (let j = run; j < out.length; j++) if (out[j].start != null) { next = out[j].start; break; }
    const n = run - i;
    const span = Math.max(0, next - prev);
    for (let k = 0; k < n; k++) {
      const start = out[i + k].start ?? prev + (span * k) / n;
      let end = out[i + k].end ?? prev + (span * (k + 1)) / n;
      if (end < start) end = start;
      out[i + k].start = start;
      out[i + k].end = end;
    }
    i = run;
  }
  return out;
}

// graphed:transcription returns WhisperX segments. The fixer still wants the
// fal chunk shape: a leading space starts a new word. Every spoken word stays
// in the text, including one whose start or end time was null.
export function chunksFromTranscript(result) {
  const pieces = [];
  for (const segment of result?.segments || []) {
    const words = (segment.words || []).filter((word) => spokenText(word.word));
    if (words.length) {
      for (const word of words) {
        pieces.push({ text: spokenText(word.word), start: finite(word.start), end: finite(word.end) });
      }
      continue;
    }
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    if (!text) continue;
    const parts = text.split(/\s+/);
    const start = finite(segment.start);
    const end = finite(segment.end) ?? start;
    parts.forEach((part, index) => {
      let partStart = start;
      let partEnd = end;
      if (start != null && end != null && parts.length > 1) {
        const step = (end - start) / parts.length;
        partStart = start + index * step;
        partEnd = start + (index + 1) * step;
      }
      pieces.push({ text: ` ${part}`, start: partStart, end: partEnd });
    });
  }
  const placed = placeMissingTimes(pieces);
  const joined = placed.map((piece) => piece.text).join("").trim();
  const given = typeof result?.text === "string" ? result.text.trim() : "";
  return {
    text: given || joined,
    chunks: placed.map((piece) => ({ timestamp: [piece.start, piece.end], text: piece.text })),
  };
}

export async function transcribe(path) {
  const key = `tmp/tx/${randomUUID()}.wav`;
  await store.putFile(key, path, "audio/wav");
  try {
    const heard = await tool(TRANSCRIBE, { url: await store.url(key, 1800), language: "en" }, null, { timeoutSeconds: 600 });
    return chunksFromTranscript(heard);
  } finally { store.del(key); }
}

// ---------- voice clone (shared voice) ----------
export async function cloneVoice(voice) {
  const res = await tool("fal:fal-ai/minimax/voice-clone", { audio_url: await store.url(voice.ref_key, 3600) }, null, { timeoutSeconds: 600 });
  if (!res.custom_voice_id) throw new Error("no custom_voice_id in clone result");
  return res.custom_voice_id;
}

// ---------- the pipeline ----------
export async function renderVideo(v, { heavy, holder = null }) {
  const dir = join(WORK, `v${v.id}`);
  mkdirSync(dir, { recursive: true });
  // Cancel only flips the row. Stop before the next paid step, and stop if another worker took the clip.
  const alive = async () => {
    const row = await one("SELECT status, holder FROM videos WHERE id = $1", [v.id]);
    if (!row || row.status === "canceled" || (holder && row.holder !== holder)) {
      const err = new Error("canceled");
      err.canceled = true;
      throw err;
    }
  };
  const keys = { ...(v.keys || {}) };
  const save = async (k, local, fields = {}) => {
    keys[k] = `videos/${v.id}/${k}.${local.split(".").pop()}`;
    await store.putFile(keys[k], local);
    await setVideo(v.id, { keys, ...fields });
  };
  const local = async (k, name) => {
    const p = join(dir, name);
    if (!existsSync(p)) await store.getFile(keys[k], p);
    return p;
  };
  const log = (s) => logVideo(v.id, s);
  // Each stage records its step's start/end time (lib/eta.mjs learns the estimates from these).
  const steps = { ...(v.steps || {}) };
  let cur = null;
  const stage = (s) => {
    const now = Date.now(), step = STEP_OF_STAGE[s];
    if (cur && steps[cur] && !steps[cur].end) steps[cur].end = now;
    if (step) { steps[step] = { start: now }; cur = step; }
    return setVideo(v.id, { stage: s, steps });
  };
  const avatar = await one("SELECT * FROM avatars WHERE id = $1", [v.avatar_id]);
  if (!avatar) throw new Error("avatar not found");
  const voice = await one("SELECT * FROM voices WHERE id = $1", [avatar.voice]);
  if (!voice || !voice.voice_id) throw new Error(`voice '${avatar.voice}' has no voice id (clone it in Avatars → Voice)`);
  const kling = v.engine === "kling";
  const tag = (s) => `ugc-v${v.id}-a${v.attempt}-${s}`;

  // 1 spoken text
  const sp = await spoken(v.script);
  const est = estimate(sp.words, sp.spoken.length, v.engine);
  if (est.tooLong) throw new Error(`Too long: ~${est.read}s of speech. Cut about ${est.cut} words.`);
  writeFileSync(join(dir, "script-spoken.txt"), sp.spoken + "\n");

  // 2-3 voice MP3, fitted
  if (!keys.voice) {
    await alive();
    await stage("voice");
    const res = await tool(TTS, { text: sp.spoken, output_format: "url",
      voice_setting: { voice_id: voice.voice_id, speed: 1, vol: 1, pitch: 0 } }, tag("tts"), { timeoutSeconds: 300 });
    const raw = await store.download(res.audio.url, join(dir, "voice-raw.mp3"));
    await heavy(async () => {
      await ffmpeg(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.3:" +
        "stop_threshold=-45dB:stop_silence=0.25", "-ar", "44100", join(dir, "voice-trim.wav")]);
      const trim = await duration(join(dir, "voice-trim.wav"));
      const tempo = Math.max(1, trim / TARGET);
      if (tempo > MAX_TEMPO) throw new Error(`The read is ${trim.toFixed(1)}s; fitting 29 s needs ${tempo.toFixed(3)}x. Cut about ${Math.ceil((trim - TARGET * MAX_TEMPO) * WORDS_PER_SEC)} words.`);
      await ffmpeg(["-i", join(dir, "voice-trim.wav"), "-af", `atempo=${tempo.toFixed(4)}`, "-c:a", "libmp3lame", "-b:a", "192k", join(dir, "voice.mp3")]);
      await log(`voice: ${(await duration(raw)).toFixed(2)}s → trim ${trim.toFixed(2)}s → atempo ${tempo.toFixed(3)} → ${(await duration(join(dir, "voice.mp3"))).toFixed(2)}s`);
    });
    await save("voice", join(dir, "voice.mp3"));
  }
  const voiceMp3 = await local("voice", "voice.mp3");
  const vsecs = await duration(voiceMp3);
  const seconds = Math.min(30, Math.max(4, Math.ceil(vsecs)));

  // 4 the take
  if (!keys.raw) {
    await alive();
    await stage(kling ? "kling" : "seedance");
    // 1-hour links, same as `graphed storage url --expires-in 3600` in ugc-video. With 2-hour links Seedance
    // refused the audio ("Invalid value for parameter: content[2].audio_url.url", Nov 2026); the same file
    // with a 1-hour link was accepted.
    const au = await store.url(keys.voice, 3600);
    const im = await store.url(avatar.image_key, 3600);
    let res;
    if (kling) {
      await log(`Kling Avatar: ${vsecs.toFixed(1)}s at 720p, ~${Math.round(vsecs * CREDITS.kling)} credits`);
      res = await tool(KLING, { image_url: im, audio_url: au, prompt: prompt("kling-avatar.txt") }, tag("kling"), { timeoutSeconds: 1800 });
    } else {
      await log(`Seedance: ${seconds}s at 480p, ~${Math.round(seconds * CREDITS.seedance)} credits, usually 5-10 min`);
      const dialogue = v.brand ? sp.spoken.replace(new RegExp(`\\b${v.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), v.brand.toUpperCase()) : sp.spoken;
      const p = prompt("seedance.txt").replace("{dialogue}", dialogue).replace("{duration}", String(seconds));
      res = await tool(SEEDANCE, { prompt: p, negative_prompt: NEG, reference_image_urls: [im], reference_audio_urls: [au],
        resolution: "480p", aspect_ratio: "9:16", duration: seconds, generate_audio: true, output_format: "mp4" },
        tag("seedance"), { timeoutSeconds: 1800 });
    }
    const raw = await store.download(res.resultUrls[0], join(dir, "raw.mp4"));
    await save("raw", raw, { credits: (kling ? vsecs * CREDITS.kling : seconds * CREDITS.seedance) + sp.spoken.length * 0.0115 });
    await log(`take: ${(await duration(raw)).toFixed(2)}s`);
  }

  // 5-6 check + fix
  if (!keys.fixed) {
    await alive();
    const raw = await local("raw", "raw.mp4");
    const fixed = join(dir, "fixed.mp4");
    let report = { splices: [], cuts: [], unfixed: [] };
    if (kling) {
      await heavy(() => ffmpeg(["-i", raw, "-i", voiceMp3, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", fixed]));
      await log("check: skipped (Kling lip-syncs our MP3, the words are the script)");
    } else {
      await stage("checking words");
      await heavy(async () => {
        const out = await run("python3", [join(ENGINE, "fix_words.py"), raw, voiceMp3, join(dir, "script-spoken.txt"), fixed, "--report", join(dir, "report.json")], {
          // serve.cjs binds every interface. Without that, this loopback call is refused:
          // the standalone server listens only on the container hostname.
          env: { UGC_TX_URL: `http://127.0.0.1:${TX.port}/internal/transcribe`, UGC_TX_TOKEN: TX.token }, timeoutMs: 40 * 60_000 });
        report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
        delete report.found;
        await log("check:\n" + out.split("\n").filter((l) => /splice|cut|wrong|extra|stutter/.test(l)).slice(0, 30).join("\n"));
      });
    }
    // Share of the script still wrong after the fix (unfixed spans can overlap, so cap at 100%).
    const total = sp.spoken.split(/\s+/).filter(Boolean).length || 1;
    const wrong = (report.unfixed || []).reduce((s, u) => s + (u.script ? u.script.split(/\s+/).filter(Boolean).length : 0), 0);
    report.wrong_pct = Math.min(1, wrong / total);
    if (report.wrong_pct > BAD_TAKE) await log(`take failed: ${Math.round(report.wrong_pct * 100)}% of the script is wrong after the fix`);
    await save("fixed", fixed, { report });
  }

  // 7 upscale: Lanczos + light sharpen + phone grain (resize-grain.sh), 1080x1920
  if (!keys.final) {
    await alive();
    await stage("upscale");
    const fixed = await local("fixed", "fixed.mp4");
    const final = join(dir, "final.mp4");
    await heavy(() => ffmpeg(["-i", fixed, "-vf", "scale=1080:1920:flags=lanczos,unsharp=5:5:0.6:5:5:0,noise=alls=6:allf=t,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-threads", "2", "-b:v", "12M", "-maxrate", "14M", "-bufsize", "24M", "-tune", "grain",
      "-c:a", "copy", "-movflags", "+faststart", final], { timeoutMs: 30 * 60_000 }));
    await save("final", final, { secs: await duration(final) });
  }
  // Poster frame for the grids (a small JPEG, so the page never loads 65 videos to show 65 tiles). Never fatal.
  if (!keys.poster) {
    const f = join(dir, "final.mp4");
    const k = await makePoster(v.id, keys.final, heavy, existsSync(f) ? f : null).catch((e) => { log("poster: " + e.message); return null; });
    if (k) keys.poster = k;
  }

  if (cur && steps[cur] && !steps[cur].end) { steps[cur].end = Date.now(); await setVideo(v.id, { steps }); }
  rmSync(dir, { recursive: true, force: true });
}
