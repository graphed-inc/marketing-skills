// Cloud render (phase 1): an edit document (edit.json) -> 30 s chunks rendered by ffmpeg in parallel Modal
// sandboxes (Graphed Tools modal:sandbox) -> one HLS playlist -> a new review version.
//
//   edit.json (master timeline = the reference source's clock; source_time = master_time + offset_ms)
//   {
//     format:  { width: 1920, height: 1080, fps: 30 },
//     sources: { "<id>": { offset_ms: 0, gain_db: 0 } },     // offsets default to the audio sync result
//     audio:   [<id>, ...],          // sources mixed into the sound (default: audio-only sources = mics)
//     transcript_sources: [<id>],    // whose transcripts make the edit's script (default: audio)
//     clips:   [ { in_ms, out_ms, video: <id>, crop: { x: 0.5, y: 0.5, zoom: 1 },   // played in order
//                  fit: "contain" (whole picture, black bars), audio: "own" (this source's sound, not the mix) } ]
//   }
//
// A chunk is keyed by a hash of exactly what it draws and plays, so a new version only renders the
// chunks that changed; the rest come from chunk_cache. Each chunk is one short, synchronous sandbox call
// (the Graphed gateway cuts a call at 60 s), and the sandbox uploads its HLS files with presigned PUTs.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { Graphed } from "@graphed-inc/sdk";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db, s3, Bucket, signGet, signPut, delObject, SITE, RUNNER, IS_LEAD, retireCuts, withVerified } from "./lib.mjs";
import { mergeSources } from "./words.mjs";

// Must match the image that is already built and cached on Modal byte for byte, or the first call builds again
// (and a build takes longer than the gateway's 60 s).
const TS_V = "0.3.1", TS_ZIP = `tesseract-${TS_V}-linux-x86_64.zip`, TS_URL = `https://github.com/mirage-hq/tesseract/releases/download/v${TS_V}/`;
export const SANDBOX_IMAGE = {
  image: "debian:bookworm-slim",
  apt: ["ffmpeg", "ca-certificates", "curl", "unzip", "python3", "bc", "libasound2", "libvulkan1", "mesa-vulkan-drivers", "zlib1g", "libstdc++6"],
  run: [`cd /tmp && curl -fsSLO ${TS_URL}${TS_ZIP} && curl -fsSLO ${TS_URL}${TS_ZIP}.sha256 && sha256sum -c ${TS_ZIP}.sha256 && unzip -q ${TS_ZIP} -d tsrct && bash $(dirname $(find /tmp/tsrct -name install.sh | head -1))/install.sh && /root/.local/share/Tesseract/bin/tsrct --version`],
};
export const CHUNK_S = 30, SEG_S = 6, RENDER_REV = 3;          // bump RENDER_REV to throw away every cached chunk
const FPS_OK = [24, 25, 30, 60];

let G; const graphed = () => (G ||= new Graphed());
export async function sandboxRun(body) {
  // tools.run = start (blocks while the command runs) + wait + download the stored result
  return graphed().tools.run("modal:sandbox", { ...SANDBOX_IMAGE, ...body }, { timeoutMs: 75_000, timeoutSeconds: 180 });
}

// ---------- sources ----------
const sh = (cmd, args, { input } = {}) => new Promise((ok, bad) => {
  const p = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] }); const out = []; let err = "";
  p.stdout.on("data", (d) => out.push(d)); p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
  p.on("error", bad); p.on("close", (c) => c === 0 ? ok(Buffer.concat(out)) : bad(new Error(err.trim().split("\n").slice(-2).join(" ") || `${cmd} exit ${c}`)));
});

export async function probeSource(s) {
  const raw = JSON.parse(String(await withVerified(s.key, { size: s.size }, (url) => sh("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate:stream_side_data=rotation", "-of", "json", url]))));
  const v = raw.streams?.find((x) => x.codec_type === "video" && x.width), a = raw.streams?.some((x) => x.codec_type === "audio");
  const rate = (r) => { const [n, d] = String(r || "0/1").split("/").map(Number); return d ? n / d : 0; };
  const rot = Math.abs(Number(v?.side_data_list?.find((d) => d.rotation != null)?.rotation || 0)) % 180 === 90;
  const meta = { duration_ms: Math.round(Number(raw.format?.duration || 0) * 1000), has_audio: !!a,
    video: v ? { width: rot ? v.height : v.width, height: rot ? v.width : v.height, fps: Math.round((rate(v.avg_frame_rate) || rate(v.r_frame_rate)) * 100) / 100 } : null };
  await db.query(`update sources set meta = $2 where id = $1`, [s.id, JSON.stringify(meta)]);
  return meta;
}
export async function projectSources(slug, { probe = true } = {}) {
  const rows = (await db.query(`select id, label, file_name, key, size, status, tx_status, meta, sync_offset_ms, sync_score, sync_ref
    from sources where project = $1 and status = 'ready' order by id`, [slug])).rows;
  if (probe) for (const s of rows) if (!s.meta) { try { s.meta = await probeSource(s); } catch (e) { s.meta = { error: e.message }; } }
  return rows;
}

// ---------- the edit document ----------
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
export function normalizeEdit(input, sources) {
  const e = typeof input === "string" ? JSON.parse(input) : structuredClone(input || {});
  const byId = new Map(sources.map((s) => [String(s.id), s]));
  const isVideo = (id) => !!byId.get(String(id))?.meta?.video, hasAudio = (id) => !!byId.get(String(id))?.meta?.has_audio;
  if (!Array.isArray(e.clips) || !e.clips.length) throw new Error("clips: at least one {in_ms, out_ms, video} is required");
  const clips = e.clips.map((c, i) => {
    const vid = String(c.video ?? c.source ?? "");
    if (!byId.has(vid)) throw new Error(`clips[${i}].video: no ready source ${vid}`);
    if (!isVideo(vid)) throw new Error(`clips[${i}].video: source ${vid} (${byId.get(vid).label}) has no video`);
    const in_ms = Math.round(num(c.in_ms, NaN)), out_ms = Math.round(num(c.out_ms, NaN));
    if (!(out_ms > in_ms)) throw new Error(`clips[${i}]: out_ms must be greater than in_ms`);
    const crop = c.crop ? { x: Math.min(1, Math.max(0, num(c.crop.x, 0.5))), y: Math.min(1, Math.max(0, num(c.crop.y, 0.5))),
      zoom: Math.min(4, Math.max(1, num(c.crop.zoom, 1))) } : null;
    if (c.audio === "own" && !hasAudio(vid)) throw new Error(`clips[${i}].audio: source ${vid} has no sound of its own`);
    const sv = byId.get(vid), off = Math.round(num(e.sources?.[vid]?.offset_ms, sv.sync_offset_ms ?? 0)), len = sv.meta?.duration_ms || 0;
    if (len && in_ms + off >= len) throw new Error(`clips[${i}]: starts at ${in_ms + off} ms of source ${vid} (${sv.label}), which is only ${len} ms long`);
    if (len && out_ms + off > len + 1500) throw new Error(`clips[${i}]: ends at ${out_ms + off} ms of source ${vid} (${sv.label}), which is only ${len} ms long`);
    if (out_ms + off <= 0) throw new Error(`clips[${i}]: is before source ${vid} (${sv.label}) starts (offset ${off} ms)`);
    return { in_ms, out_ms, video: vid, ...(crop ? { crop } : {}), ...(c.fit === "contain" ? { fit: "contain" } : {}),
      ...(c.audio === "own" ? { audio: "own" } : {}), ...(c.note ? { note: String(c.note).slice(0, 300) } : {}) };
  });
  const first = byId.get(clips[0].video).meta.video;
  const fps = FPS_OK.includes(num(e.format?.fps, 0)) ? num(e.format.fps) : 30;
  const even = (n) => Math.min(4096, Math.max(2, Math.round(n / 2) * 2));   // 4096 is the largest side
  const format = { width: even(num(e.format?.width, first.width >= first.height ? 1920 : 1080)),
                   height: even(num(e.format?.height, first.width >= first.height ? 1080 : 1920)), fps };
  const src = {};
  for (const s of sources) {
    const given = e.sources?.[s.id] || {};
    src[s.id] = { offset_ms: Math.round(num(given.offset_ms, s.sync_offset_ms ?? 0)), gain_db: num(given.gain_db, 0) };
  }
  let audio = Array.isArray(e.audio) ? e.audio.map(String) : sources.filter((s) => s.meta?.has_audio && !s.meta?.video).map((s) => String(s.id));
  for (const id of audio) if (!byId.has(id) || !hasAudio(id)) throw new Error(`audio: source ${id} is missing or has no audio`);
  const transcript_sources = Array.isArray(e.transcript_sources) ? e.transcript_sources.map(String) : audio.length ? audio : [...new Set(clips.map((c) => c.video))];
  const frames = clips.reduce((n, c) => n + Math.max(1, Math.round((c.out_ms - c.in_ms) * fps / 1000)), 0);
  return { format, sources: src, audio, transcript_sources, clips, duration_ms: Math.round(frames * 1000 / fps) };
}

// ---------- plan: clips -> pieces -> chunks ----------
export function planChunks(edit, sources) {
  const { fps } = edit.format, per = CHUNK_S * fps, byId = new Map(sources.map((s) => [String(s.id), s]));
  const chunks = []; let cur = null;
  const push = () => { if (cur?.pieces.length) chunks.push(cur); cur = { frames: 0, pieces: [] }; };
  push();
  for (const c of edit.clips) {
    let left = Math.max(1, Math.round((c.out_ms - c.in_ms) * fps / 1000)), done = 0;
    while (left > 0) {
      const take = Math.min(left, per - cur.frames);
      cur.pieces.push({ video: c.video, master_ms: c.in_ms + Math.round(done * 1000 / fps), frames: take, crop: c.crop || null,
        fit: c.fit || "cover", own: c.audio === "own" });
      cur.frames += take; left -= take; done += take;
      if (cur.frames >= per) push();
    }
  }
  push();
  const audioCfg = edit.audio.map((id) => ({ id, key: byId.get(id).key, offset_ms: edit.sources[id]?.offset_ms || 0, gain_db: edit.sources[id]?.gain_db || 0 }));
  return chunks.map((ch, i) => {
    const pieces = ch.pieces.map((p) => {
      // the clip's own camera sound when no audio sources are chosen; it plays at that source's gain_db
      const own_audio = p.own || (!audioCfg.length && !!byId.get(p.video).meta?.has_audio);
      return { ...p, video_key: byId.get(p.video).key, video_ms: p.master_ms + (edit.sources[p.video]?.offset_ms || 0),
        own_audio, own_gain_db: own_audio ? (edit.sources[p.video]?.gain_db || 0) : 0 };
    });
    const spec = { rev: RENDER_REV, format: edit.format, audio: audioCfg.map(({ key, offset_ms, gain_db }) => ({ key, offset_ms, gain_db })),
      // g only when it is not 0, so chunks rendered before the gain was read keep their keys
      pieces: pieces.map((p) => ({ k: p.video_key, ms: p.video_ms, m: p.master_ms, f: p.frames, c: p.crop, a: p.own_audio, fit: p.fit, ...(p.own_gain_db ? { g: p.own_gain_db } : {}) })) };
    return { idx: i, frames: ch.frames, pieces, audio: audioCfg, key: createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 32) };
  });
}

// ---------- one chunk = one bash job for the sandbox ----------
// Each piece (a stretch of one camera) renders in its own ffmpeg process, 4 at a time, to a near-lossless
// MKV with PCM sound and an exact frame / sample count. One final encode joins them, so there is no audio
// gap at a cut, and writes the chunk's HLS files, which the sandbox uploads with presigned PUTs.
// The job runs in the background inside the sandbox: a call to the sandbox tool is cut at about 58 s.
const q = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
const sec = (ms) => (ms / 1000).toFixed(3);
export async function chunkScript(chunk, edit, slug) {
  const { width: W, height: H, fps } = edit.format, g = fps * 2;
  const pieceCmds = [];
  for (const p of chunk.pieces) {
    const durMs = p.frames * 1000 / fps, samples = p.frames * 48000 / fps, inputs = [], f = [];
    const opened = new Map();
    const input = async (key, startMs) => {         // [input index, delay ms when the source starts after this moment]
      const ss = Math.max(0, startMs), delay = Math.max(0, -startMs), k = `${key}@${ss}`;
      // sources are whole local files in the sandbox (prepScript): a streamed read from storage can end early
      // without an error and give a short piece. A camera file that is also a mic is opened once.
      if (!opened.has(k)) { inputs.push(`-ss ${sec(ss)} -t ${sec(durMs - delay + 600)} -i ${localPath(key)}`); opened.set(k, inputs.length - 1); }
      return [opened.get(k), delay];
    };
    const [vi, vd] = await input(p.video_key, p.video_ms);
    const z = p.crop?.zoom || 1, cx = p.crop?.x ?? 0.5, cy = p.crop?.y ?? 0.5;
    const frame = p.fit === "contain"      // whole picture inside the frame, black bars (a 9:16 ad in a 16:9 show)
      ? `scale=w=${W}:h=${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`
      : `scale=w='ceil(iw*max(${W}/iw,${H}/ih)*${z}/2)*2':h='ceil(ih*max(${W}/iw,${H}/ih)*${z}/2)*2',crop=${W}:${H}:'(iw-${W})*${cx}':'(ih-${H})*${cy}'`;
    f.push(`[${vi}:v]${frame},fps=${fps},setsar=1,format=yuv420p,` +
      (vd ? `tpad=start_duration=${sec(vd)}:start_mode=clone,` : "") +
      `tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${p.frames},setpts=PTS-STARTPTS[v]`);
    const chain = (src, gain, delay) => `${src}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${gain}dB,` +
      (delay ? `adelay=${Math.round(delay)}:all=1,` : "") + `apad,atrim=end_sample=${samples},asetpts=PTS-STARTPTS`;
    if (p.own_audio) f.push(`${chain(`[${vi}:a]`, p.own_gain_db || 0, vd)}[a]`);
    else if (chunk.audio.length) {
      const parts = [];
      for (const [ai, a] of chunk.audio.entries()) {
        const start = p.master_ms + a.offset_ms;
        // this source has not started yet for the whole piece (someone who joined late): silence, no read
        if (-start >= durMs) f.push(`aevalsrc=0|0:s=48000:d=${sec(durMs)},aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=end_sample=${samples}[a${ai}]`);
        else { const [ii, d] = await input(a.key, start); f.push(`${chain(`[${ii}:a]`, a.gain_db, d)}[a${ai}]`); }
        parts.push(`[a${ai}]`);
      }
      f.push(parts.length > 1 ? `${parts.join("")}amix=inputs=${parts.length}:normalize=0:duration=first[a]` : `${parts[0]}anull[a]`);
    } else f.push(`aevalsrc=0|0:s=48000:d=${sec(durMs)},aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=end_sample=${samples}[a]`);
    pieceCmds.push({ frames: p.frames, cmd: `ffmpeg -hide_banner -loglevel error -nostdin -y ${inputs.join(" ")} -filter_complex ${q(f.join(";"))} -map '[v]' -map '[a]' ` +
      `-c:v libx264 -preset ultrafast -crf 10 -pix_fmt yuv420p -c:a pcm_s16le -ar 48000 -f matroska` });
  }
  const nSeg = Math.ceil(chunk.frames / fps / SEG_S) + 2, prefix = `videos/${slug}/renders/chunks/${chunk.key}/`;
  const puts = [["init.mp4", await signPut(prefix + "init.mp4")], ["index.m3u8", await signPut(prefix + "index.m3u8")]];
  for (let i = 0; i < nSeg; i++) puts.push([`seg_${String(i).padStart(3, "0")}.m4s`, await signPut(prefix + `seg_${String(i).padStart(3, "0")}.m4s`)]);
  const n3 = (i) => String(i).padStart(3, "0");
  // every piece must have its exact frame count, or the chunk fails (and is tried again)
  const piece = (c, i) => `cat > piece${n3(i)}.sh <<'PEOF'
${c.cmd} p${n3(i)}.mkv 2> piece${n3(i)}.err || { echo fail >> failed.txt; exit 0; }
n=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 p${n3(i)}.mkv)
[ "$n" = "${c.frames}" ] || { echo "piece ${i}: $n of ${c.frames} frames" >> piece${n3(i)}.err; echo fail >> failed.txt; }
PEOF`;
  return `set -e
cd "$(mktemp -d)" && T0=$(date +%s%N)
${pieceCmds.map(piece).join("\n")}
ls piece*.sh | xargs -P 4 -n 1 bash
if [ -f failed.txt ]; then cat piece*.err | tail -c 1500; exit 3; fi
T1=$(date +%s%N)
for m in p*.mkv; do echo "file '$PWD/$m'"; done > list.txt
ffmpeg -hide_banner -loglevel error -nostdin -y -f concat -safe 0 -i list.txt -af alimiter=limit=0.95:level=0 \\
  -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -g ${g} -keyint_min ${g} -sc_threshold 0 -force_key_frames 'expr:gte(t,n_forced*${SEG_S})' \\
  -c:a aac -b:a 160k -ar 48000 -f hls -hls_time ${SEG_S} -hls_playlist_type vod -hls_segment_type fmp4 \\
  -hls_fmp4_init_filename init.mp4 -hls_segment_filename 'seg_%03d.m4s' index.m3u8 2> enc.log || { tail -c 1500 enc.log; exit 4; }
find . -name 'p*.mkv' -delete
T2=$(date +%s%N)
${puts.map(([f, u]) => `if [ -f ${f} ]; then (curl -sf --retry 4 --retry-all-errors --retry-delay 2 -X PUT -T ${f} ${q(u)} || echo ${f} >> putfail.txt) & fi`).join("\n")}
wait
if [ -f putfail.txt ]; then echo "upload failed: $(cat putfail.txt | tr '\\n' ' ')"; exit 5; fi
T3=$(date +%s%N)
printf '{"ok":true,"pieces_ms":%d,"encode_ms":%d,"upload_ms":%d,"bytes":%d,"segs":%d}\\n' $(( (T1-T0)/1000000 )) $(( (T2-T1)/1000000 )) $(( (T3-T2)/1000000 )) $(cat init.mp4 seg_*.m4s | wc -c) $(ls seg_*.m4s | wc -l)
echo '---PLAYLIST---'; cat index.m3u8
`;
}

// Where a source file lives inside a sandbox.
const localPath = (key) => `/tmp/src/${createHash("sha1").update(key).digest("hex").slice(0, 16)}${(key.match(/\.\w{2,5}$/) || [""])[0]}`;
// Download whole source files into the sandbox: 8 MiB ranges, 48 connections at a time (storage gives about
// 0.8 MB/s per connection, so this is about 25-35 MB/s), every range retried, the final size checked.
export async function prepScript(files) {       // files: [{ key, size }]
  const lines = [];
  for (const f of files) lines.push(`fetch ${q(await signGet(f.key))} ${Number(f.size)} ${localPath(f.key)}`);
  return `set -e
mkdir -p /tmp/src && cd /tmp/src && T0=$(date +%s%N)
cat > getpart.sh <<'GP'
a=$(( $4 * $2 )); b=$(( a + $2 - 1 ))
curl -sf --retry 6 --retry-all-errors --retry-delay 1 -r $a-$b -o "$3/$(printf %05d $4)" "$1"
GP
fetch() {
  local U="$1" SIZE="$2" OUT="$3" PART=$(( 8 * 1024 * 1024 ))
  if [ -f "$OUT" ] && [ "$(stat -c %s "$OUT")" = "$SIZE" ]; then return 0; fi
  local N=$(( (SIZE + PART - 1) / PART )) D="$OUT.parts"
  mkdir -p "$D"
  seq 0 $(( N - 1 )) | xargs -P 48 -n 1 bash getpart.sh "$U" "$PART" "$D"
  cat "$D"/* > "$OUT"
  find "$D" -type f -delete && rmdir "$D"
  [ "$(stat -c %s "$OUT")" = "$SIZE" ] || { echo "size mismatch: $OUT is $(stat -c %s "$OUT"), want $SIZE"; exit 7; }
}
${lines.join("\n")}
T1=$(date +%s%N)
printf '{"ok":true,"ms":%d,"bytes":%d}\\n' $(( (T1-T0)/1000000 )) $(cat /tmp/src/* 2>/dev/null | wc -c)
`;
}

// Raw sandbox call: create (image + resources) or act on sandboxId. Retries the gateway's 5xx.
async function sandboxCall(body, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await graphed().tools.run("modal:sandbox", body, { timeoutMs: 75_000, timeoutSeconds: 180 }); }
    catch (e) { last = e; if (!/50[234]|ECONNRESET|fetch failed|timed? ?out/i.test(String(e.message))) throw e; await new Promise((r) => setTimeout(r, 1500 * i)); }
  }
  throw last;
}
// ---------- the sandbox pool ----------
// Graphed allows 5 sandboxes per account that are not stopped, and one call to the sandbox tool takes
// 15-50 s (Nov 2026). So a render makes few calls: it opens at most RENDER_SANDBOXES big sandboxes (default 4,
// one left for other work), and each gets ONE job bundle (a bash file the app puts in storage): download the
// sources to local disk, then run that sandbox's chunks, RENDER_SLOTS at a time (default 8), each tried up to
// 3 times. The app then only polls. Chunks still missing after a round go into a second, smaller round.
const POOL_SANDBOXES = Number(process.env.RENDER_SANDBOXES || 4), SLOTS = Number(process.env.RENDER_SLOTS || 8), ROUNDS = 3;
const POOL_RES = { cpu: 64, memoryGb: 64 }, ROUND_MAX_MS = 1_200_000;
const LIMIT_RE = /already has \d+ sandboxes/i;
let stopping = false;                                   // SIGTERM: stop sandboxes and leave the render to the next process
export const stopRenders = () => { stopping = true; };
export const playlistSeconds = (pl) => [...String(pl).matchAll(/#EXTINF:([\d.]+)/g)].reduce((t, m) => t + Number(m[1]), 0);

async function stopSandbox(id) {
  try { await sandboxCall({ sandboxId: id, stop: true }, 2); }
  catch (e) { if (!/not found|stopped|expired|unknown/i.test(e.message)) { console.warn(`sandbox ${id} stop: ${e.message}`); return; } }
  await db.query(`update sandboxes set stopped_at = now() where id = $1`, [id]).catch(() => {});
}
// on boot: stop pool sandboxes a killed process left running
export async function stopLeftoverSandboxes() {
  const { rows } = await db.query(`select id from sandboxes where stopped_at is null`);
  await Promise.all(rows.map(({ id }) => stopSandbox(id)));
  if (rows.length) console.log(`stopped ${rows.length} leftover sandbox(es)`);
}

// One bash file for one sandbox and one round. Results land in /tmp/jobs/<name>/{job.log, exit.code}.
async function bundleScript(round, chunks, need, edit, slug) {
  const parts = [`mkdir -p /tmp/jobs/prep_r${round} /tmp/bundle_r${round} && cd /tmp/bundle_r${round}`,
    `cat > prep.sh <<'PREP_EOF'\n${await prepScript(need)}\nPREP_EOF`,
    `bash prep.sh > /tmp/jobs/prep_r${round}/job.log 2>&1; code=$?; echo $code > /tmp/jobs/prep_r${round}/exit.code`,
    `[ "$code" = 0 ] || exit 0`,
    `cat > run1.sh <<'RUN_EOF'
n=$(basename "$1" .sh); d=/tmp/jobs/$n; mkdir -p "$d"
for t in 1 2 3; do timeout 420 bash "$1" > "$d/job.log" 2>&1; c=$?; [ $c = 0 ] && break; sleep 2; done
echo $c > "$d/exit.code"
RUN_EOF`];
  for (const c of chunks) parts.push(`cat > c${String(c.idx).padStart(4, "0")}_r${round}.sh <<'CHUNK_EOF_${c.idx}'\n${await chunkScript(c, edit, slug)}\nCHUNK_EOF_${c.idx}`);
  parts.push(`ls c*_r${round}.sh | xargs -P ${SLOTS} -n 1 bash run1.sh`);
  return parts.join("\n") + "\n";
}
// Finished jobs the app has not acknowledged yet; `acked` = names it already has.
const pollCommand = (acked) => `cd /tmp/jobs 2>/dev/null || exit 0
${acked.length ? `for n in ${acked.join(" ")}; do touch "$n/acked" 2>/dev/null; done` : ":"}
for i in $(seq 30); do for f in */exit.code; do [ -f "$f" ] && [ ! -f "\${f%/exit.code}/acked" ] && break 2; done; sleep 0.5; done
for f in */exit.code; do [ -f "$f" ] || continue; d=\${f%/exit.code}; [ -f "$d/acked" ] && continue; echo "@@JOB $d $(cat $f)"; tail -c 6000 "$d/job.log"; echo "@@END"; done`;

// Render every chunk; onDone(chunk, {playlist, stats}) as each one lands. Throws if chunks are still missing after ROUNDS.
async function renderAll(chunks, edit, slug, files, onDone) {
  const tag = `${RUNNER}-${Date.now()}`, boxes = [], usd = new Map(), done = new Set(), why = new Map(), prepMs = [], bundles = [];
  let todo = [...chunks];
  const used = new Set(chunks.flatMap((c) => [...c.pieces.map((p) => p.video_key), ...c.audio.map((a) => a.key)]));
  const need = files.filter((f) => used.has(f.key));
  // put a bundle in storage and start it: the first round's call also creates the sandbox
  const launch = async (box, round, mine) => {
    const key = `videos/${slug}/renders/bundles/${tag}-b${box.n}-r${round}.sh`;
    await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: await bundleScript(round, mine, need, edit, slug), ContentType: "text/x-shellscript" }));
    bundles.push(key);
    const command = `mkdir -p /tmp/jobs && cd /tmp && curl -sf --retry 6 --retry-all-errors -o bundle_r${round}.sh ${q(await signGet(key))} && ` +
      `(setsid bash bundle_r${round}.sh > bundle_r${round}.log 2>&1 < /dev/null &) ; echo started`;
    for (let i = 1; ; i++) {
      try {
        const r = await sandboxCall(box.id ? { sandboxId: box.id, timeoutSeconds: 40, command }
          : { ...SANDBOX_IMAGE, resources: POOL_RES, ttlSeconds: 2700, timeoutSeconds: 40, stop: false, command });
        if (!r.sandboxId && !box.id) throw new Error(`no sandboxId: ${JSON.stringify(r).slice(0, 300)}`);
        if (!box.id) { box.id = r.sandboxId; await db.query(`insert into sandboxes (id) values ($1) on conflict do nothing`, [box.id]).catch(() => {}); }
        if (!/started/.test(r.command?.stdout || "")) throw new Error(`bundle did not start: ${(r.command?.stderr || "").slice(-300)}`);
        return;
      } catch (e) { if (!LIMIT_RE.test(e.message) || i >= 8) throw e; await new Promise((ok) => setTimeout(ok, 15_000)); }   // earlier sandboxes are still stopping
    }
  };
  // poll one sandbox until every job of this round has reported
  const watch = async (box, round, mine) => {
    const t0 = Date.now(), names = new Map(mine.map((c) => [`c${String(c.idx).padStart(4, "0")}_r${round}`, c])), acked = [];
    let errors = 0, prepOk = false;
    while (names.size) {
      if (stopping) throw new Error("stopping");
      if (Date.now() - t0 > ROUND_MAX_MS) { for (const c of names.values()) why.set(c.key, "sandbox ran out of time"); return; }
      let r;
      try { r = await sandboxCall({ sandboxId: box.id, timeoutSeconds: 40, command: pollCommand(acked.splice(0)) }); errors = 0; }
      catch (e) { if (++errors < 4) continue; box.dead = true; for (const c of names.values()) why.set(c.key, `sandbox lost: ${e.message.slice(0, 200)}`); return; }
      usd.set(box.id, Math.max(usd.get(box.id) || 0, r.usageUsd || 0));    // each call reports the sandbox's running total
      for (const m of (r.command?.stdout || "").matchAll(/@@JOB (\S+) (\d+)\n([\s\S]*?)@@END/g)) {
        const [, name, code, out] = m;
        acked.push(name);
        if (name === `prep_r${round}`) {
          if (code !== "0") { box.dead = true; for (const c of names.values()) why.set(c.key, `source download failed: ${out.slice(-300)}`); return; }
          if (!prepOk) { prepOk = true; try { prepMs.push(JSON.parse(out.trim().split("\n").pop()).ms); } catch { /* no timing */ } }
          continue;
        }
        const c = names.get(name);
        if (!c) continue;
        names.delete(name);
        if (code !== "0") { why.set(c.key, `exit ${code}: ${out.slice(-600)}`); continue; }
        try {
          const [head, playlist] = out.split("---PLAYLIST---");
          const stats = JSON.parse(head.trim().split("\n").pop());
          const got = playlistSeconds(playlist), want = c.frames / edit.format.fps;        // the stream must be exactly as long as its frames
          if (Math.abs(got - want) > 0.05) throw new Error(`stream is ${got.toFixed(2)} s, want ${want.toFixed(2)} s`);
          await onDone(c, { playlist: playlist.trim(), stats });
          done.add(c.key);
        } catch (e) { why.set(c.key, `bad output: ${e.message}`); }
      }
    }
  };
  try {
    for (let round = 1; round <= ROUNDS && todo.length; round++) {
      if (round === 1) for (let n = 0; n < Math.min(POOL_SANDBOXES, Math.ceil(todo.length / SLOTS)); n++) boxes.push({ n, id: null });
      const alive = boxes.filter((b) => !b.dead && (round === 1 || b.id));
      if (!alive.length) break;
      const share = alive.map(() => []);
      todo.forEach((c, i) => share[i % alive.length].push(c));
      await Promise.all(alive.map(async (box, i) => {
        if (!share[i].length) return;
        try { await launch(box, round, share[i]); await watch(box, round, share[i]); }
        catch (e) {
          if (e.message === "stopping") throw e;
          box.dead = true; console.warn(`sandbox ${box.id || `#${box.n}`} round ${round}: ${e.message.slice(0, 300)}`);
          for (const c of share[i]) if (!done.has(c.key)) why.set(c.key, e.message.slice(0, 300));
        }
      }));
      todo = todo.filter((c) => !done.has(c.key));
      if (todo.length) console.warn(`render round ${round}: ${todo.length} chunk(s) to try again, e.g. chunk ${todo[0].idx}: ${String(why.get(todo[0].key)).slice(0, 300)}`);
    }
  } finally {
    // stop in the background: a stop call takes up to a minute, and the next render waits for the limit if it must
    for (const b of boxes) if (b.id) stopSandbox(b.id);
    for (const k of bundles) delObject(k).catch(() => {});
  }
  if (todo.length) throw new Error(`${todo.length} chunk(s) did not render. chunk ${todo[0].idx}: ${why.get(todo[0].key) || "no report"}`);
  return { sandboxes: boxes.filter((b) => b.id).length, usd: [...usd.values()].reduce((a, b) => a + b, 0), prep_ms: Math.max(0, ...prepMs) };
}

// ---------- the edit's script, from the source transcripts ----------
export async function editTranscript(edit, slug) {
  const ids = edit.transcript_sources.map(Number);
  const rows = (await db.query(`select id, label, transcript from sources where project = $1 and id = any($2) and tx_status = 'done'`, [slug, ids])).rows;
  const merged = mergeSources(rows.map((r) => ({ label: r.label, transcript: r.transcript && {
    words: r.transcript.words.map((w) => { const o = edit.sources[r.id]?.offset_ms || 0; return [w[0] - o, w[1] - o, w[2], 0, w[0] - o, w[1] - o]; }) } })));
  const words = []; let t = 0;
  for (const c of edit.clips) {
    const frames = Math.max(1, Math.round((c.out_ms - c.in_ms) * edit.format.fps / 1000)), len = frames * 1000 / edit.format.fps;
    // a clip that plays its own sound (an inserted ad) shows none of the mix's words
    if (c.audio !== "own") for (const w of merged.words) if (w[0] >= c.in_ms && w[0] < c.in_ms + len)
      words.push([Math.round(t + w[0] - c.in_ms), Math.round(t + Math.min(w[1], c.in_ms + len) - c.in_ms), w[2], w[3], w[0], w[1]]);
    t += len;
  }
  return { speakers: merged.speakers, total_ms: Math.round(t), fields: ["t0", "t1", "word", "speaker", "rec0", "rec1"], words };
}

// ---------- a render: plan -> cached + new chunks -> playlist -> publish ----------

export async function nextVersion(slug) {
  const { rows } = await db.query(`select version from versions where project = $1 union select version from projects where slug = $1 and playlist is not null
    union select version from renders where project = $1 and status <> 'failed'`, [slug]);
  return "v" + (Math.max(0, ...rows.map((r) => Number(String(r.version).replace(/\D/g, "")) || 0)) + 1);
}

export async function queueRender(slug, { edit, version, changes, by }) {
  const sources = await projectSources(slug);
  const e = normalizeEdit(edit, sources);
  const v = version || await nextVersion(slug);
  if (!/^[\w.-]{1,20}$/.test(v)) throw new Error("version like v2");
  const chunks = planChunks(e, sources);
  const { rows: [r] } = await db.query(`insert into renders (project, version, changes, by, edit, chunks_total) values ($1,$2,$3,$4,$5,$6) returning id, version`,
    [slug, v, changes || null, by || null, JSON.stringify(e), chunks.length]);
  return { render_id: r.id, version: r.version, chunks: chunks.length, duration_ms: e.duration_ms };
}

export async function runRender(id) {
  const { rows: [r] } = await db.query(`select * from renders where id = $1`, [id]);
  const t0 = Date.now(), slug = r.project, edit = r.edit;
  const sources = await projectSources(slug);
  const chunks = planChunks(edit, sources);
  const want = new Map(chunks.map((c) => [c.key, c.frames / edit.format.fps]));
  // a cached chunk is used only when its stream has the exact length
  const cache = new Map((await db.query(`select key, playlist from chunk_cache where key = any($1)`, [chunks.map((c) => c.key)])).rows
    .filter((x) => Math.abs(playlistSeconds(x.playlist) - want.get(x.key)) <= 0.05).map((x) => [x.key, x.playlist]));
  const mine = async () => (await db.query(`select runner from renders where id = $1`, [id])).rows[0]?.runner === RUNNER;
  const todo = chunks.filter((c) => !cache.has(c.key));
  await db.query(`update renders set status = 'rendering', started_at = now(), chunks_total = $2, chunks_cached = $3, chunks_done = 0, error = null where id = $1`,
    [id, chunks.length, chunks.length - todo.length]);
  const times = [];
  const files = sources.map((s) => ({ key: s.key, size: Number(s.size) }));
  const pool = todo.length ? await renderAll(todo, edit, slug, files, async (c, out) => {
    await db.query(`insert into chunk_cache (key, project, playlist, duration_ms, bytes) values ($1,$2,$3,$4,$5) on conflict (key) do update set playlist = excluded.playlist`,
      [c.key, slug, out.playlist, Math.round(c.frames * 1000 / edit.format.fps), out.stats.bytes || 0]);
    cache.set(c.key, out.playlist); times.push(out.stats);
    await db.query(`update renders set chunks_done = chunks_done + 1 where id = $1`, [id]);
  }) : { sandboxes: 0, usd: 0, prep_ms: 0 };
  if (!(await mine())) throw new Error("another process took this render over");
  const usd = pool.usd;
  // one playlist: every chunk keeps its own init segment, so a discontinuity goes between chunks
  const lines = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-TARGETDURATION:" + (SEG_S + 1), "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-INDEPENDENT-SEGMENTS"];
  for (const [i, c] of chunks.entries()) {
    if (i) lines.push("#EXT-X-DISCONTINUITY");
    lines.push(`#EXT-X-MAP:URI="chunks/${c.key}/init.mp4"`);
    for (const l of cache.get(c.key).split("\n")) {
      if (l.startsWith("#EXTINF")) lines.push(l.trim());
      else if (l.trim() && !l.startsWith("#")) lines.push(`chunks/${c.key}/${l.trim()}`);
    }
  }
  lines.push("#EXT-X-ENDLIST");
  const transcript = await editTranscript(edit, slug);
  const bytes = (await db.query(`select coalesce(sum(bytes),0)::bigint as b from chunk_cache where key = any($1)`, [chunks.map((c) => c.key)])).rows[0].b;
  const stats = { wall_ms: Date.now() - t0, sandboxes: pool.sandboxes, source_download_ms: pool.prep_ms, new_chunks: todo.length, cached_chunks: chunks.length - todo.length, usd: Math.round(usd * 1e5) / 1e5,
    max_chunk_ms: Math.max(0, ...times.map((s) => (s.pieces_ms || 0) + (s.encode_ms || 0) + (s.upload_ms || 0))),
    avg_upload_ms: times.length ? Math.round(times.reduce((a, s) => a + (s.upload_ms || 0), 0) / times.length) : 0, avg_pieces_ms: times.length ? Math.round(times.reduce((a, s) => a + s.pieces_ms, 0) / times.length) : 0, avg_encode_ms: times.length ? Math.round(times.reduce((a, s) => a + s.encode_ms, 0) / times.length) : 0 };
  await retireCuts(slug, r.version);   // the same version name again: its cuts point into the old transcript
  await db.query(`update projects set version = $2, hls_prefix = $3, playlist = $4, transcript = $5, duration = $6, size = $7, file = $8, updated_at = now() where slug = $1`,
    [slug, r.version, `videos/${slug}/renders/`, lines.join("\n") + "\n", JSON.stringify(transcript), edit.duration_ms / 1000, Number(bytes), `${slug}-${r.version}.mp4`]);
  await db.query(`insert into versions (project, version, changes, by, edit, render_id) values ($1,$2,$3,$4,$5,$6)`, [slug, r.version, r.changes, r.by, JSON.stringify(edit), id]);
  await db.query(`update renders set status = 'done', finished_at = now(), stats = $2, error = null where id = $1`, [id, JSON.stringify(stats)]);
  return { version: r.version, review_url: `${SITE}/p/${slug}/`, ...stats };
}

export function startRenderWorker() {
  // renders a process that is gone (or going) was working on: back to the queue for this one
  db.query(`update renders set status = 'queued', runner = null where status = 'rendering'`).catch(() => {});
  process.once("SIGTERM", () => { stopRenders(); setTimeout(() => process.exit(0), 8000).unref(); });
  stopLeftoverSandboxes().catch((e) => console.warn(`leftover sandboxes: ${e.message}`));
  let busy = false;
  setInterval(async () => {
    if (busy || stopping) return; busy = true;
    let r;
    try {
      ({ rows: [r] } = await db.query(`update renders set status = 'rendering', runner = $1 where id = (select id from renders where status = 'queued' order by id
        for update skip locked limit 1) and ${IS_LEAD} returning id`, [RUNNER]));
      if (r) await runRender(r.id);
    } catch (e) {
      console.error(`render ${r?.id}:`, e.message);
      // only the process that owns the render may fail it (a new process may have taken it over)
      if (r) await db.query(`update renders set status = 'failed', error = $2, finished_at = now() where id = $1 and runner = $3 and status = 'rendering'`,
        [r.id, e.message.slice(0, 2000), RUNNER]).catch(() => {});
    } finally { busy = false; }
  }, 2000).unref();
}

// ---------- audio sync: where each source sits on the reference source's clock ----------
// Uses the mono 16 kHz MP3 the transcription step made (videos/<slug>/sources/<id>-audio.mp3), or the source file
// itself while its transcript is not done.
// Loudness envelopes (5 ms steps) are cross-correlated with an FFT over the first 10 minutes,
// then refined to 1 ms. offset_ms > 0: the same moment comes later in this source than in the reference.
const SR = 4000, HOP = 20, SPAN_S = 600, MAX_LAG_S = 120;
const pcmCache = new Map();
async function envelope(slug, src, hop) {
  const k = `${slug}/${src.id}/${src.tx_status}`;
  // through a size-checked local link: a read that stops early would give a short envelope and a wrong offset
  if (!pcmCache.has(k)) pcmCache.set(k, withVerified(src.tx_status === "done" ? `videos/${slug}/sources/${src.id}-audio.mp3` : src.key, {},
    (url) => sh("ffmpeg", ["-v", "error", "-t", String(SPAN_S), "-i", url, "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"])));
  let pcm;
  try { pcm = await pcmCache.get(k); } catch (e) { pcmCache.delete(k); throw e; }
  if (pcmCache.size > 8) pcmCache.delete(pcmCache.keys().next().value);
  const s = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const n = Math.floor(s.length / hop), env = new Float64Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let j = 0; j < hop; j++) a += Math.abs(s[i * hop + j]); env[i] = Math.log1p(a / hop); }
  let m = 0; for (const x of env) m += x; m /= n || 1; let v = 0; for (let i = 0; i < n; i++) { env[i] -= m; v += env[i] * env[i]; }
  v = Math.sqrt(v / (n || 1)) || 1; for (let i = 0; i < n; i++) env[i] /= v;
  return env;
}
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
export function xcorrLag(ref, oth, maxLag) {   // lag L maximizing sum ref[t] * oth[t + L]
  let n = 1; while (n < ref.length + oth.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(ref); br.set(oth); fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] + ai[i] * bi[i], im = ar[i] * bi[i] - ai[i] * br[i]; ar[i] = r; ai[i] = im; }
  fft(ar, ai, true);
  let best = -Infinity, lag = 0, sum = 0, sq = 0, cnt = 0;
  for (let L = -maxLag; L <= maxLag; L++) { const v = ar[(L + n) % n]; sum += v; sq += v * v; cnt++; if (v > best) { best = v; lag = L; } }
  const mean = sum / cnt, sd = Math.sqrt(Math.max(1e-9, sq / cnt - mean * mean));
  return { lag, score: Math.round((best - mean) / sd * 10) / 10 };
}
export async function syncSources(slug) {
  const rows = (await projectSources(slug)).filter((s) => s.meta?.has_audio);
  if (rows.length < 2) throw new Error("need at least 2 sources with audio to sync");
  // reference = the longest camera with sound (the main recording), else the longest source
  const longest = (list) => [...list].sort((x, y) => (y.meta?.duration_ms || 0) - (x.meta?.duration_ms || 0))[0];
  const ref = longest(rows.filter((s) => s.meta?.video)) || longest(rows);
  const refEnv = await envelope(slug, ref, HOP), refFine = await envelope(slug, ref, SR / 1000);
  const out = [];
  for (const s of rows) {
    if (s.id === ref.id) { await db.query(`update sources set sync_offset_ms = 0, sync_score = null, sync_ref = $2 where id = $1`, [s.id, ref.id]); continue; }
    const env = await envelope(slug, s, HOP);
    const { lag, score } = xcorrLag(refEnv, env, Math.round(MAX_LAG_S * SR / HOP));
    // refine at 1 ms steps within +-10 ms of the coarse lag
    const fine = await envelope(slug, s, SR / 1000), c0 = lag * HOP / (SR / 1000);
    let best = -Infinity, fl = c0;
    for (let L = c0 - 10; L <= c0 + 10; L++) {
      let acc = 0; for (let t = Math.max(0, -L); t < refFine.length && t + L < fine.length; t++) acc += refFine[t] * fine[t + L];
      if (acc > best) { best = acc; fl = L; }
    }
    pcmCache.clear();
    await db.query(`update sources set sync_offset_ms = $2, sync_score = $3, sync_ref = $4 where id = $1`, [s.id, fl, score, ref.id]);
    out.push({ id: s.id, label: s.label, offset_ms: fl, score });
  }
  return { ref: { id: ref.id, label: ref.label }, sources: out };
}
