// @ts-nocheck
// Time estimates for a render, from the video length (words / 3.6, fit to <= 29 s).
// Start values come from real runs (Nov 2026: Seedance took 202-241 s for 13 s videos, 4-6 min for 26-29 s ones
// locally). Once 5+ videos have finished, the median of their recorded step times replaces the start values.
import { q } from "./db/sql";
import { estimate } from "./media";

export const STEPS = ["voice", "film", "check", "finish"];
export const STEP_OF_STAGE = { voice: "voice", seedance: "film", kling: "film", "checking words": "check", upscale: "finish" };
export const LABEL = { voice: "Recording the voice", film: "Filming", check: "Checking every word", finish: "Finishing" };
const START = { voice: 30, filmBase: 90, filmPerSec: 9, check: 90, finish: 90, kling: 0.6 };

let cache = { at: 0, cal: START };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// Medians from finished videos' recorded steps (refreshed every 5 minutes).
export async function calibration() {
  if (Date.now() - cache.at < 5 * 60_000) return cache.cal;
  const rows = await q("SELECT steps, secs, engine FROM videos WHERE status IN ('done', 'bad_take') AND steps <> '{}'::jsonb ORDER BY id DESC LIMIT 50");
  const len = (s) => (s && s.start && s.end ? (s.end - s.start) / 1000 : null);
  const pick = (k, filter = () => true) => rows.filter(filter).map((r) => len(r.steps[k])).filter((x) => x != null && x > 0);
  const cal = { ...START };
  if (rows.length >= 5) {
    for (const k of ["voice", "check", "finish"]) { const m = median(pick(k)); if (m) cal[k] = m; }
    const per = rows.filter((r) => r.engine !== "kling" && r.secs && len(r.steps.film)).map((r) => (len(r.steps.film) - START.filmBase) / r.secs);
    const m = median(per); if (m && m > 0) cal.filmPerSec = m;
  }
  cache = { at: Date.now(), cal };
  return cal;
}

// Expected seconds per step for one video.
export function stepTimes(videoSecs, engine, cal = START) {
  const film = (cal.filmBase + cal.filmPerSec * videoSecs) * (engine === "kling" ? cal.kling : 1);
  return { voice: cal.voice, film, check: engine === "kling" ? 15 : cal.check, finish: cal.finish };
}

export const total = (t) => STEPS.reduce((s, k) => s + t[k], 0);

// A batch: voice + filming run in parallel; checking + finishing run one video at a time in the container.
export function batchSeconds(list, cal = START) {
  if (!list.length) return 0;
  const ts = list.map((x) => stepTimes(x.secs, x.engine, cal));
  return Math.max(...ts.map((t) => t.voice + t.film)) + ts.reduce((s, t) => s + t.check + t.finish, 0);
}

// Progress (0..1) and seconds left for a video row.
export function progress(v, cal = START) {
  const secs = v.secs || estimate(v.words || 0, 0, v.engine || "seedance").secs;
  const t = stepTimes(secs, v.engine, cal);
  const all = total(t);
  if (v.status === "done" || v.status === "bad_take") return { pct: 1, left: 0, step: null, label: v.status === "done" ? "Done" : "Take failed" };
  if (v.status !== "running") return { pct: 0, left: Math.round(all), step: null, label: v.status === "queued" ? "Waiting to start" : null };
  const step = STEP_OF_STAGE[v.stage] || "voice";
  const i = STEPS.indexOf(step);
  const doneBefore = STEPS.slice(0, i).reduce((s, k) => s + t[k], 0);
  const started = v.steps && v.steps[step] && v.steps[step].start;
  const inStep = started ? Math.min((Date.now() - started) / 1000, t[step] * 0.95) : 0;
  const after = STEPS.slice(i + 1).reduce((s, k) => s + t[k], 0);
  return {
    pct: Math.min(0.95, (doneBefore + inStep) / all),
    left: Math.max(15, Math.round(t[step] - inStep + after)),
    step, label: LABEL[step],
  };
}
