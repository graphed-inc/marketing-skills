// No dependencies: used by the server (source transcripts) and scripts/add-video.mjs (edit transcripts).
//
// WhisperX {segments:[{speaker, words:[{word,start,end,speaker}]}]} -> app format
// {speakers, total_ms, fields, words:[[t0,t1,word,spk,rec0,rec1]]} in ms.
// Some words (numbers, symbols) come back without times: give them the gap between their neighbours.
// `speaker` set = one speaker for every word (a source file recorded on one person's mic).
export function toWords(raw, durSec, { names = [], speaker } = {}) {
  if (Array.isArray(raw.words) && Array.isArray(raw.words[0])) return raw;   // already in app format
  const ids = new Map(), list = [];
  for (const s of raw.segments || []) for (const w of s.words || [])
    list.push({ word: String(w.word ?? "").trim(), start: w.start, end: w.end, spk: speaker ? "one" : (w.speaker || s.speaker || "SPEAKER_00") });
  for (let i = 0; i < list.length; i++) {
    if (Number.isFinite(list[i].start) && Number.isFinite(list[i].end)) continue;
    const prev = list[i - 1]?.end ?? 0;
    let j = i + 1; while (j < list.length && !Number.isFinite(list[j].start)) j++;
    const next = list[j]?.start ?? prev + 0.3 * (j - i);
    const step = (next - prev) / (j - i);
    for (let k = i; k < j; k++) { list[k].start = prev + step * (k - i); list[k].end = prev + step * (k - i + 1); }
    i = j - 1;
  }
  const words = list.filter((w) => w.word).map((w) => {
    if (!ids.has(w.spk)) ids.set(w.spk, ids.size);
    const t0 = Math.round(w.start * 1000), t1 = Math.round(w.end * 1000);
    return [t0, t1, w.word, ids.get(w.spk), t0, t1];
  });
  const speakers = speaker ? [speaker] : [...ids.keys()].map((_, i) => names[i] || `Speaker ${i + 1}`);
  const dur = Number.isFinite(durSec) ? durSec : (raw.duration_seconds || (words.at(-1)?.[1] || 0) / 1000);
  return { speakers, total_ms: Math.round(dur * 1000), fields: ["t0", "t1", "word", "speaker", "rec0", "rec1"], words };
}

// Several one-speaker source transcripts -> one transcript in time order, speaker = source label.
export function mergeSources(list) {
  const speakers = [], words = [];
  for (const { label, transcript } of list) {
    const k = speakers.push(label) - 1;
    for (const w of transcript?.words || []) words.push([w[0], w[1], w[2], k, w[4], w[5]]);
  }
  words.sort((a, b) => a[0] - b[0] || a[3] - b[3]);
  return { speakers, total_ms: words.at(-1)?.[1] || 0, fields: ["t0", "t1", "word", "speaker", "rec0", "rec1"], words };
}
