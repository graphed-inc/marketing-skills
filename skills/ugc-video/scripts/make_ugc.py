#!/usr/bin/env python3
"""Script in, finished UGC talking-head ad out (1080x1920 MP4).

  0 preflight      Graphed CLI logged in, ffmpeg, whisper-cli + model
  1 script         quotes removed, numbers spelled out, word count
  2 MP3            fal MiniMax TTS with the avatar's cloned voice (Graphed Tools)
  3 fit            pause trim + atempo to <= 29.0 s (cap 1.10x), local ffmpeg
  4 Seedance 2.5   kie, 480p, [Image1] avatar + [Audio1] MP3, bundled prompt, no pronunciation hints (Graphed Tools)
  5 check          local whisper on the render and the MP3, compared with the script
  6 fix            wrong words spliced from the MP3, stutters cut as jump cuts, each one re-checked
  7 upscale        resize-grain.sh to 1080x1920

Never re-renders on its own. Words it can't fix are listed with their time; --rerender runs Seedance again
with the same MP3, and only after the person says yes.

Usage:
  make_ugc.py --script script.txt --dry-run          # length, cost, prompt; no spend
  make_ugc.py --script script.txt                    # full run
  make_ugc.py --script script.txt --slug my-ad --rerender   # new Seedance take, same MP3 (ask first)
  make_ugc.py --clone-voice                          # new voice id from the avatar's voice-ref.mp3
  make_ugc.py --engine avatar ...                    # old graphed:ugc.avatar path (legacy_avatar.py)

Output: ./ugc-videos/<slug>/<slug>.mp4 + raw-480p.mp4, fixed-480p.mp4, voice.mp3, script*.txt, check.json,
seedance.body.json
"""
import argparse, json, math, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(HERE))
from spoken import speakable

AVATARS = SKILL / "avatars"
PROMPT = SKILL / "prompts" / "seedance.txt"
RESIZE = HERE / "resize-grain.sh"
DEFAULT_AVATAR = "latina-kitchen"
SAVED = Path.home() / ".config" / "graphed" / "ugc-video.json"
MODEL = os.path.expanduser(os.environ.get("WHISPER_MODEL", "~/whisper-models/ggml-small.bin"))

TTS = "fal:fal-ai/minimax/speech-02-hd"
SEEDANCE = "kie:bytedance/seedance-2-5"
TARGET, MAX_TEMPO = 29.0, 1.10
WORDS_PER_SEC = 3.6           # the clone at speed 1.0, measured on 6 scripts
SEEDANCE_CREDITS_PER_SEC = 16.1  # 480p estimate: Graphed 720p rate x kie 480p/720p ratio; 1 credit = 1 cent
NEG = ("text overlay, subtitles, captions, logo, watermark, extra people, cartoon, distorted hands, split screen, "
       "b-roll cutaway, halo, glow around head, bright outline, rim light, aura, lens flare, glowing edges")
CTX = {}


def log(msg):
    print(msg, flush=True)


def sh(cmd, check=True):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(map(str, cmd[:4]))} failed:\n{(r.stderr or r.stdout).strip()[-800:]}")
    return r


def graphed(*args, scoped=True):
    cmd = ["graphed", *args] + (["--account", CTX["account"], "--project", CTX["project"]] if scoped else [])
    return sh(cmd).stdout.strip()


def dur(p):
    return float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).stdout)


# ---------- 0 preflight ----------

def missing_tools(need_whisper):
    missing = []
    for tool, fix in (("graphed", "install the Graphed CLI: npm install -g @graphed-inc/cli, then graphed login"),
                      ("ffmpeg", "brew install ffmpeg"), ("ffprobe", "brew install ffmpeg")):
        if not shutil.which(tool):
            missing.append(f"  {tool}: {fix}")
    if need_whisper:
        if not shutil.which("whisper-cli"):
            missing.append("  whisper-cli: brew install whisper-cpp")
        if not Path(MODEL).is_file():
            missing.append(f"  whisper model {MODEL}: mkdir -p ~/whisper-models && curl -L -o ~/whisper-models/ggml-small.bin "
                           "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin")
    return missing


def preflight(need_whisper):
    missing = missing_tools(need_whisper)
    if missing:
        sys.exit("Missing tools. Install these, then run again:\n" + "\n".join(missing))
    if sh(["graphed", "accounts", "list"], check=False).returncode != 0:
        sys.exit("Graphed CLI is not logged in. Run: graphed login")


def find_up(name):
    for d in [Path.cwd(), *Path.cwd().parents]:
        if (d / name).is_file():
            return d / name
    return None


def resolve_context(a):
    saved = json.loads(SAVED.read_text()) if SAVED.is_file() else {}
    account = a.account or os.environ.get("GRAPHED_ACCOUNT")
    if not account and (f := find_up(".graphed.json")):
        account = json.loads(f.read_text()).get("account_id")
    account = account or saved.get("account")
    if not account:
        accts = json.loads(graphed("--format", "json", "accounts", "list", scoped=False))["accounts"]
        if len(accts) != 1:
            rows = "\n".join(f"  {x['id']}  {x['name']}" for x in accts)
            sys.exit(f"You have {len(accts)} Graphed accounts. Pick one with --account:\n{rows}")
        account = accts[0]["id"]
    project = a.project or os.environ.get("GRAPHED_PROJECT")
    if not project and (f := find_up("graphed.yaml")):
        m = re.search(r"^slug:\s*([\w-]+)", f.read_text(), re.M)
        project = m and m.group(1)
    if not project and saved.get("account") == account:
        project = saved.get("project")
    if not project:
        projs = json.loads(graphed("--format", "json", "projects", "list", "--account", account, scoped=False))["projects"]
        if len(projs) != 1:
            rows = "\n".join(f"  {x['slug']}" for x in projs[:25])
            sys.exit(f"Pick a Graphed project for storage + tool runs with --project:\n{rows}")
        project = projs[0]["slug"]
    CTX.update(account=account, project=project)
    SAVED.parent.mkdir(parents=True, exist_ok=True)
    SAVED.write_text(json.dumps({"account": account, "project": project}))


def tool(name, body, out_dir, tag, timeout):
    """graphed tools run --wait, with retries on the Graphed API's occasional 502/504 (a failed submit costs nothing)."""
    (out_dir / f"{tag}.body.json").write_text(json.dumps(body, indent=1))
    for attempt in range(3):
        try:
            graphed("tools", "run", name, "--body-file", out_dir / f"{tag}.body.json", "--wait",
                    "--timeout", str(timeout), "--out", out_dir / f"{tag}.result.json")
            return json.loads((out_dir / f"{tag}.result.json").read_text())
        except RuntimeError as e:
            if not re.search(r"\b50[24]\b", str(e)) or attempt == 2:
                raise
            log(f"  Graphed API {re.search(r'50[24]', str(e)).group(0)}, retrying")
            time.sleep(10)


def fetch(url, path):
    with urllib.request.urlopen(url) as r, open(path, "wb") as f:
        shutil.copyfileobj(r, f)


def upload(path, key, ctype):
    graphed("storage", "upload", path, key, "--content-type", ctype)
    return graphed("storage", "url", key, "--expires-in", "3600")


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def load_avatar(name):
    d = AVATARS / name
    if not d.is_dir():
        have = ", ".join(sorted(p.name for p in AVATARS.iterdir() if p.is_dir()))
        sys.exit(f"No avatar '{name}'. Bundled: {have}")
    meta = json.loads((d / "avatar.json").read_text())
    image = next((p for p in sorted(d.glob("avatar.*")) if p.suffix.lower() in (".jpg", ".jpeg", ".png")), None)
    if not image:
        sys.exit(f"{d} has no avatar.jpg/png")
    return d, meta, image


def clone_voice(a):
    d, meta, _ = load_avatar(a.avatar)
    ref = d / "voice-ref.mp3"
    if not ref.is_file():
        sys.exit(f"No {ref} to clone from")
    preflight(False)
    resolve_context(a)
    url = upload(ref, f"ugc-video/voices/{a.avatar}/voice-ref.mp3", "audio/mpeg")
    tmp = d / ".clone"
    tmp.mkdir(exist_ok=True)
    res = tool("fal:fal-ai/minimax/voice-clone", {"audio_url": url}, tmp, "clone", 300)
    vid = res.get("custom_voice_id")
    if not vid:
        sys.exit(f"No voice id in {res}")
    meta["voice_id"] = vid
    (d / "avatar.json").write_text(json.dumps(meta, indent=2) + "\n")
    shutil.rmtree(tmp, ignore_errors=True)
    log(f"new voice id {vid} saved to {d / 'avatar.json'} (about 172 credits)")


# ---------- the run ----------

def main():
    ap = argparse.ArgumentParser(description="Script in, UGC talking-head video out (Graphed + local ffmpeg/whisper).")
    ap.add_argument("--script", help="path to a .txt file, or the script text itself")
    ap.add_argument("--avatar", default=DEFAULT_AVATAR, help=f"folder in avatars/ (default {DEFAULT_AVATAR})")
    ap.add_argument("--caps", default="", help="comma list of brand names to write in caps in the Seedance dialogue")
    ap.add_argument("--slug", help="output folder name")
    ap.add_argument("--out-dir", default="ugc-videos", help="parent folder for output (default ./ugc-videos)")
    ap.add_argument("--account", help="Graphed account id")
    ap.add_argument("--project", help="Graphed project slug")
    ap.add_argument("--dry-run", action="store_true", help="length, cost and prompt only; no upload, no spend")
    ap.add_argument("--rerender", action="store_true", help="new Seedance take with the same MP3 (only after the person says yes)")
    ap.add_argument("--no-fix", action="store_true", help="skip the whisper check and fixes; keep the raw take")
    ap.add_argument("--no-upscale", action="store_true", help="stop at 480p")
    ap.add_argument("--clone-voice", action="store_true", help="make a new voice id from avatars/<name>/voice-ref.mp3")
    ap.add_argument("--engine", choices=["seedance", "avatar"], default="seedance", help="avatar = old graphed:ugc.avatar path")
    a, rest = ap.parse_known_args()

    if a.engine == "avatar":
        argv = [x for x in sys.argv[1:] if x not in ("--engine", "avatar")]
        os.execvp(sys.executable, [sys.executable, str(HERE / "legacy_avatar.py"), *argv])
    if a.clone_voice:
        return clone_voice(a)
    if not a.script:
        ap.error("--script is required")

    # 1 script
    original = Path(a.script).read_text().strip() if Path(a.script).is_file() else a.script.strip()
    no_quotes = re.sub(r'["“”]', "", original)  # quotes confuse the Seedance Dialogue line
    if no_quotes != original:
        log("removed quotation marks from the script")
    spoken = " ".join(speakable(no_quotes).split())
    words = len(spoken.split())
    est_read = words / WORDS_PER_SEC
    est_secs = min(30, max(4, math.ceil(min(est_read, TARGET))))
    est_credits = est_secs * SEEDANCE_CREDITS_PER_SEC + len(spoken) * 11.5 / 1000
    log(f"1 script: {words} words spoken, read ~{est_read:.1f}s -> ~{est_secs}s video, est {est_credits:.0f} credits "
        f"(~${est_credits / 100:.2f})")
    if est_read > TARGET * MAX_TEMPO:
        sys.exit(f"Too long: ~{est_read:.0f}s of speech fits 29 s only above {MAX_TEMPO}x. "
                 f"Cut about {math.ceil(words - TARGET * MAX_TEMPO * WORDS_PER_SEC)} words.")
    if words > 110:
        log("  note: over 110 words; the read may need a speed-up close to the 1.10x limit")

    d_av, meta, image = load_avatar(a.avatar)
    dialogue = spoken
    for w in [x.strip() for x in a.caps.split(",") if x.strip()]:
        dialogue = re.sub(rf"\b{re.escape(w)}\b", w.upper(), dialogue)
    slug = a.slug or slugify(" ".join(spoken.split()[:6]))
    out = Path(a.out_dir).expanduser().resolve() / slug
    template = PROMPT.read_text()

    if a.dry_run:
        log(f"avatar {a.avatar} · voice {meta['voice_id']} · output {out}/{slug}.mp4")
        missing = missing_tools(True)
        if missing:
            log("Install these before a real run:\n" + "\n".join(missing))
            log("Show these install commands to the user and wait. Do not add --no-fix to skip them.")
        log("prompt:\n" + template.format(dialogue=dialogue, duration=est_secs, speaker=meta["speaker"]))
        return

    # ffmpeg is required even with --no-fix. Whisper is required unless the user asked to skip the check.
    required = missing_tools(not a.no_fix)
    if required:
        sys.exit("Install these before a real run:\n" + "\n".join(required) +
                 "\nShow these install commands to the user and wait. Do not add --no-fix to skip them.")
    if a.no_fix:
        skipped = [line for line in missing_tools(True) if line not in required]
        if skipped:
            log("Whisper is not installed, so --no-fix skips the word check:\n" + "\n".join(skipped))
    preflight(False)
    resolve_context(a)
    log(f"graphed: account {CTX['account']} · project {CTX['project']}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "script.txt").write_text(original + "\n")
    (out / "script-spoken.txt").write_text(spoken + "\n")

    # 2 MP3 (kept between runs, so a re-render reuses it)
    voice = out / "voice.mp3"
    if not voice.exists():
        res = tool(TTS, {"text": spoken, "output_format": "url",
                         "voice_setting": {"voice_id": meta["voice_id"], "speed": 1, "vol": 1, "pitch": 0}}, out, "tts", 300)
        fetch(res["audio"]["url"], out / "voice-raw.mp3")
        raw = dur(out / "voice-raw.mp3")
        # 3 fit
        sh(["ffmpeg", "-y", "-i", out / "voice-raw.mp3", "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.3:"
            "stop_threshold=-45dB:stop_silence=0.25", "-ar", "44100", out / "voice-trim.wav"])
        trim = dur(out / "voice-trim.wav")
        tempo = max(1.0, trim / TARGET)
        if tempo > MAX_TEMPO:
            sys.exit(f"The read is {trim:.1f}s; fitting 29 s needs {tempo:.3f}x, over the {MAX_TEMPO}x limit. "
                     f"Cut about {math.ceil((trim - TARGET * MAX_TEMPO) * WORDS_PER_SEC)} words and run again.")
        sh(["ffmpeg", "-y", "-i", out / "voice-trim.wav", "-af", f"atempo={tempo:.4f}", "-c:a", "libmp3lame",
            "-b:a", "192k", voice])
        log(f"2 MP3: {raw:.2f}s -> pause trim {trim:.2f}s -> atempo {tempo:.3f} -> {dur(voice):.2f}s")
    else:
        log(f"2 MP3: reusing {voice.name} ({dur(voice):.2f}s)")
    seconds = min(30, max(4, math.ceil(dur(voice))))

    # 4 Seedance
    raw_v = out / "raw-480p.mp4"
    if raw_v.exists() and a.rerender:
        n = 1
        while (out / f"raw-480p-take{n}.mp4").exists():
            n += 1
        raw_v.rename(out / f"raw-480p-take{n}.mp4")
        log(f"  kept the old take as raw-480p-take{n}.mp4")
    if not raw_v.exists():
        key = f"ugc-video/{slug}"
        au = upload(voice, f"{key}/voice.mp3", "audio/mpeg")
        im = upload(image, f"{key}/avatar{image.suffix.lower()}", "image/png" if image.suffix.lower() == ".png" else "image/jpeg")
        prompt = template.format(dialogue=dialogue, duration=seconds, speaker=meta["speaker"])
        log(f"4 Seedance: {seconds}s at 480p, ~{seconds * SEEDANCE_CREDITS_PER_SEC:.0f} credits, usually 5-10 min")
        res = tool(SEEDANCE, {"prompt": prompt, "negative_prompt": NEG, "reference_image_urls": [im],
                              "reference_audio_urls": [au], "resolution": "480p", "aspect_ratio": "9:16",
                              "duration": seconds, "generate_audio": True, "output_format": "mp4"},
                   out, "seedance", 1800)
        fetch(res["resultUrls"][0], raw_v)
        log(f"4 Seedance: done, {dur(raw_v):.2f}s")
    else:
        log("4 Seedance: reusing raw-480p.mp4 (use --rerender for a new take, only after the person says yes)")

    # 5 + 6 check and fix
    fixed = out / "fixed-480p.mp4"
    report = {"splices": [], "cuts": [], "unfixed": []}
    if a.no_fix:
        shutil.copy(raw_v, fixed)
        log("5-6 check/fix: skipped (--no-fix)")
    else:
        import fix_words
        log("5-6 check/fix:")
        report = fix_words.fix(raw_v, voice, out / "script-spoken.txt", fixed, log=lambda m: log("  " + m))
        (out / "check.json").write_text(json.dumps(report, indent=1))

    # 7 upscale
    final = fixed
    if not a.no_upscale:
        final = out / f"{slug}.mp4"
        sh([RESIZE, fixed, final])
    log(f"\ndone -> {final} ({dur(final):.1f}s)")
    for s in report["splices"]:
        log(f"  fixed: '{s['heard']}' -> '{s['script']}' at {s['at']:.1f}s (spliced from the MP3)")
    for c in report["cuts"]:
        log(f"  cut: stutter '{c['heard']}' {c['removed'][0]:.2f}-{c['removed'][1]:.2f}s (jump cut)")
    if report["unfixed"]:
        log("NOT FIXED (listen to these spots):")
        for u in report["unfixed"]:
            log(f"  {u['at']:.1f}s  {u['kind']}: heard '{u['heard']}'" + (f", script '{u['script']}'" if u.get("script") else "")
                + f" — {u['why']}")
        log(f"A new Seedance take costs ~{seconds * SEEDANCE_CREDITS_PER_SEC:.0f} credits. Ask the person first; "
            f"if they say yes: make_ugc.py --script ... --slug {slug} --rerender")


if __name__ == "__main__":
    main()
