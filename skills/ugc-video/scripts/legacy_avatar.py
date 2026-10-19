#!/usr/bin/env python3
"""LEGACY (make_ugc.py --engine avatar): the old graphed:ugc.avatar path, kept as a fallback.
Script in, finished UGC talking-head video out. Needs only the Graphed CLI (logged in) and ffmpeg.

  bundled avatar (photo + voice ref + setting) + spoken script
    -> Graphed Tools graphed:ugc.avatar (Seedance 2.5 on Higgsfield, 480p)
    -> clean render.rawUrl (no captions, no hook pill)
    -> resize-grain.sh: Lanczos resize + light sharpen + phone grain (1080x1920, face unchanged)

Usage:
  make_ugc.py --script script.txt --brand Acme --dry-run     # check length + cost, no spend
  make_ugc.py --script script.txt --brand Acme               # render
  make_ugc.py --script "text..." --brand Acme --avatar <name>
  make_ugc.py --script script.txt --brand Acme --image me.jpg [--voice me.mp3]

Account/project: --account/--project > GRAPHED_ACCOUNT/GRAPHED_PROJECT > .graphed.json / graphed.yaml
in this folder or a parent > last used (~/.config/graphed/ugc-video.json) > the only one you have.

Numbers and symbols are spelled out before rendering (24/7 -> twenty-four seven, 2am -> two a.m.) and the
voice is told to read the dialogue word for word. --keep-digits turns the spell-out off.

Output: ./ugc-videos/<slug>/<slug>.mp4 (final) + raw-480p.mp4, result.json, body.json, script.txt,
script-spoken.txt, run-id.txt
"""
import argparse, json, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESIZE = HERE / "resize-grain.sh"
AVATARS = HERE.parent / "avatars"
DEFAULT_AVATAR = "latina-kitchen"
SAVED = Path.home() / ".config" / "graphed" / "ugc-video.json"
# catalog lists 10.0625 credits/sec at 480p, but a 30s take billed 363 credits (Oct 2026) — budget the observed rate
CREDITS_PER_SEC = 12.1  # 1 credit = 1 cent
MAX_SEC = 30
CTX = {}  # resolved account + project

# Seedance gets the script as dialogue with no "say it verbatim" instruction; it paraphrases and misreads
# digits ("24/7" came out "24/4"). This rides along as brand.voiceHint.
VERBATIM = ("Says the dialogue word for word, exactly as written: no added, dropped, reordered or swapped words, "
            "and every number said exactly as spelled out.")

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def num_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return ONES[n // 100] + " hundred" + (" " + num_words(n % 100) if n % 100 else "")
    if n < 1_000_000:
        return num_words(n // 1000) + " thousand" + (" " + num_words(n % 1000) if n % 1000 else "")
    return str(n)


def speakable(text: str) -> str:
    """Spell out digits and symbols so the model has nothing to misread: 24/7, 2am, 95%, $500, 10."""
    t = re.sub(r"\b24\s*/\s*7\b", "twenty-four seven", text)
    t = re.sub(r"\b365\s*/\s*24\s*/\s*7\b", "three sixty-five, twenty-four seven", t)

    def clock(m):
        h, mins, ap = int(m.group(1)), m.group(2), m.group(3).lower().replace(".", "")
        out = num_words(h) if not mins else f"{num_words(h)} {'oh ' + num_words(int(mins)) if mins.startswith('0') else num_words(int(mins))}"
        return f"{out} {ap[0]}.m."
    t = re.sub(r"\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)(?![a-z])", clock, t, flags=re.I)
    t = re.sub(r"/\s*(month|mo|year|yr|week|wk|day|hour|hr)\b",
               lambda m: " a " + {"mo": "month", "yr": "year", "wk": "week", "hr": "hour"}.get(m.group(1).lower(), m.group(1).lower()), t, flags=re.I)
    def year(m):
        c, y = m.group(1), int(m.group(2))
        if c == "20" and y < 10:
            return "two thousand" + (" " + ONES[y] if y else "")
        return f"{num_words(int(c))} {'hundred' if y == 0 else ('oh ' + ONES[y] if y < 10 else num_words(y))}"
    t = re.sub(r"\b(19|20)(\d{2})\b", year, t)
    t = re.sub(r"\$(\d[\d,]*)(k\b)?", lambda m: num_words(int(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)) + " dollars", t, flags=re.I)
    t = re.sub(r"\b(\d[\d,]*)\s*%", lambda m: num_words(int(m.group(1).replace(",", ""))) + " percent", t)
    t = re.sub(r"\b(\d{1,3}(?:,\d{3})+|\d{1,6})\b(?!\.\d)", lambda m: num_words(int(m.group(1).replace(",", ""))), t)
    return t


def sh(cmd, check=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"{' '.join(cmd[:4])} failed:\n{(r.stderr or r.stdout).strip()}")
    return r


def graphed(*args, scoped=True):
    cmd = ["graphed", *args]
    if scoped:
        cmd += ["--account", CTX["account"], "--project", CTX["project"]]
    return sh(cmd).stdout.strip()


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
        if len(accts) == 1:
            account = accts[0]["id"]
        else:
            rows = "\n".join(f"  {x['id']}  {x['name']}" for x in accts)
            sys.exit(f"You have {len(accts)} Graphed accounts — pick one with --account:\n{rows}")

    project = a.project or os.environ.get("GRAPHED_PROJECT")
    if not project and (f := find_up("graphed.yaml")):
        m = re.search(r"^slug:\s*([\w-]+)", f.read_text(), re.M)
        project = m and m.group(1)
    if not project and saved.get("account") == account:
        project = saved.get("project")
    if not project:
        projs = json.loads(graphed("--format", "json", "projects", "list", "--account", account, scoped=False))["projects"]
        if len(projs) == 1:
            project = projs[0]["slug"]
        elif not projs:
            sys.exit("No Graphed project on this account. Create one (`graphed projects create`) or run `graphed init`, then retry.")
        else:
            rows = "\n".join(f"  {x['slug']}" for x in projs[:25])
            sys.exit(f"Pick a Graphed project for storage + tool runs with --project:\n{rows}")
    CTX.update(account=account, project=project)


def preflight():
    missing = [t for t in ("graphed", "ffmpeg", "ffprobe") if not shutil.which(t)]
    if missing:
        hint = {"graphed": "install the Graphed CLI", "ffmpeg": "brew install ffmpeg", "ffprobe": "brew install ffmpeg"}
        sys.exit("Missing: " + ", ".join(f"{m} ({hint[m]})" for m in missing))
    if sh(["graphed", "accounts", "list"], check=False).returncode != 0:
        sys.exit("Graphed CLI is not logged in — run `graphed login`.")


def upload(path: Path, key: str, content_type: str) -> str:
    graphed("storage", "upload", str(path), key, "--content-type", content_type)
    return graphed("storage", "url", key, "--expires-in", "3600")


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def main():
    ap = argparse.ArgumentParser(description="Script in, UGC talking-head video out (Graphed).")
    ap.add_argument("--script", required=True, help="path to a .txt file, or the script text itself")
    ap.add_argument("--brand", required=True, help="brand name (used in prompts, never on screen)")
    ap.add_argument("--about", help="one line on what the brand does")
    ap.add_argument("--avatar", help=f"bundled avatar folder in avatars/ (default {DEFAULT_AVATAR})")
    ap.add_argument("--image", help="one-off still of the speaker (jpg/png/webp); overrides --avatar")
    ap.add_argument("--voice", help="wav/mp3 pronunciation guide (not a clone); overrides the bundled one")
    ap.add_argument("--no-voice", action="store_true", help="skip the bundled voice ref")
    ap.add_argument("--setting", help="where the speaker is; overrides avatar.json")
    ap.add_argument("--persona", help="who is on camera; overrides avatar.json")
    ap.add_argument("--energy", choices=["natural", "warm", "high"])
    ap.add_argument("--resolution", default="480p", choices=["480p", "720p", "1080p"])
    ap.add_argument("--no-upscale", action="store_true", help="stop at the clean 480p take")
    ap.add_argument("--slug", help="output folder name")
    ap.add_argument("--out-dir", default="ugc-videos", help="parent folder for output (default ./ugc-videos)")
    ap.add_argument("--account", help="Graphed account id")
    ap.add_argument("--project", help="Graphed project slug")
    ap.add_argument("--keep-digits", action="store_true", help="don't spell out numbers (24/7, 2am, 95%%) before rendering")
    ap.add_argument("--dry-run", action="store_true", help="validate + print the request; no upload, no spend")
    a = ap.parse_args()

    original = Path(a.script).read_text().strip() if Path(a.script).is_file() else a.script.strip()
    script = original if a.keep_digits else speakable(original)
    if script != original:
        found = re.findall(r"[$]?\d[\d,:/]*\s*(?:[ap]\.?m\.?(?![a-z])|%|k\b|/\s*[a-z]+)?", original, re.I)
        pairs = dict.fromkeys(f"{f.strip().rstrip('.,')} → {speakable(f.strip().rstrip('.,'))}" for f in found)
        print("spelled out for speech: " + " · ".join(pairs))

    # avatar bundle: avatars/<name>/avatar.jpg + voice.mp3 + avatar.json (setting/persona/energy)
    meta, bundled_voice = {}, None
    if a.image:
        image = Path(a.image).expanduser()
    else:
        name = a.avatar or DEFAULT_AVATAR
        d = AVATARS / name
        if not d.is_dir():
            have = ", ".join(sorted(p.name for p in AVATARS.iterdir() if p.is_dir()))
            sys.exit(f"No avatar '{name}'. Bundled: {have}")
        image = next((p for p in sorted(d.glob("avatar.*")) if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")), None)
        meta = json.loads((d / "avatar.json").read_text()) if (d / "avatar.json").is_file() else {}
        bundled_voice = next(iter(sorted(d.glob("legacy-voice.*"))), None)
        print(f"avatar: {name}")
    if not image or not image.is_file():
        sys.exit(f"Image not found: {image}")
    voice = Path(a.voice).expanduser() if a.voice else (None if a.no_voice else bundled_voice)
    if voice and not voice.is_file():
        sys.exit(f"Voice ref not found: {voice}")

    # Graphed budgets 2.6 words/sec, or 3.5 with fastRead, clamped 5–30s
    words = len(script.split())
    max_words = int(3.5 * MAX_SEC)
    if words > max_words:
        sys.exit(f"Script is {words} words — max is {max_words} (30s). Cut {words - max_words} words.")
    fast = words / 2.6 > MAX_SEC
    secs = min(MAX_SEC, max(5, words / (3.5 if fast else 2.6)))
    est = secs * CREDITS_PER_SEC * {"480p": 1, "720p": 2.2, "1080p": 3}[a.resolution] / 100
    print(f"{words} words → ~{secs:.1f}s{' (fast read)' if fast else ''} · est ${est:.2f} at {a.resolution}")

    slug = a.slug or slugify(f"{a.brand}-{' '.join(script.split()[:4])}")
    out = Path(a.out_dir).expanduser().resolve() / slug

    brand = {"brand": a.brand, "voiceHint": VERBATIM}
    for k, v in (("audience", a.about), ("settingHint", a.setting or meta.get("setting")),
                 ("personaHint", a.persona or meta.get("persona"))):
        if v:
            brand[k] = v
    body = {"script": script, "brand": brand, "mode": "onbrand", "framing": "selfie",
            "energy": a.energy or meta.get("energy") or "natural", "resolution": a.resolution, "fastRead": fast}

    if a.dry_run:
        body["characterImage"] = f"<signed url: {image.name}>"
        body["brand"]["referenceImageUrls"] = [body["characterImage"]]
        if voice:
            body["voiceRef"] = f"<signed url: {voice.name}>"
        print(f"output → {out}/{slug}.mp4\n{json.dumps(body, indent=2, ensure_ascii=False)}")
        return

    preflight()
    resolve_context(a)
    print(f"graphed: account {CTX['account']} · project {CTX['project']}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "script.txt").write_text(original + "\n")
    (out / "script-spoken.txt").write_text(script + "\n")
    key = f"ugc-video/{slug}"

    img = image
    if image.suffix.lower() not in (".jpg", ".jpeg", ".png"):
        img = out / "avatar.jpg"
        sh(["ffmpeg", "-y", "-loglevel", "error", "-i", str(image), "-q:v", "2", str(img)])
    body["characterImage"] = upload(img, f"{key}/avatar{img.suffix.lower()}",
                                    "image/png" if img.suffix.lower() == ".png" else "image/jpeg")
    body["brand"]["referenceImageUrls"] = [body["characterImage"]]
    if voice:
        body["voiceRef"] = upload(voice, f"{key}/voice{voice.suffix.lower()}",
                                  "audio/wav" if voice.suffix.lower() == ".wav" else "audio/mpeg")
    (out / "body.json").write_text(json.dumps(body, indent=2, ensure_ascii=False))

    started = graphed("--format", "json", "tools", "run", "graphed:ugc.avatar", "--body-file", str(out / "body.json"))
    m = re.search(r"trn_[A-Za-z0-9]+", started)
    if not m:
        sys.exit(f"No run id in: {started}")
    run_id = m.group(0)
    (out / "run-id.txt").write_text(run_id + "\n")
    SAVED.parent.mkdir(parents=True, exist_ok=True)
    SAVED.write_text(json.dumps({"account": CTX["account"], "project": CTX["project"]}))
    print(f"run {run_id} started — rendering, usually 5–10 min")

    while True:
        st = json.loads(graphed("--format", "json", "tools", "get", run_id))
        if st["status"] == "ready":
            break
        if st["status"] in ("failed", "aborted", "cancelled"):
            sys.exit(f"Run {run_id} {st['status']}: {st.get('statusMessage')}")
        time.sleep(15)
    graphed("tools", "get", run_id, "--out", str(out / "result.json"))
    res = json.loads((out / "result.json").read_text())

    raw_url = (res.get("render") or {}).get("rawUrl")
    if not raw_url:
        sys.exit(f"No render — {res.get('reason')} {res.get('qa')}")
    raw = out / "raw-480p.mp4"
    with urllib.request.urlopen(raw_url) as r, open(raw, "wb") as f:  # signed URL, expires in 1 hour
        shutil.copyfileobj(r, f)

    # the speech gate false-flags things like "24/7"; the take is usually fine, so warn only
    if (res.get("qa") or {}).get("speechGate") == "fail":
        print(f"warning: speech check flagged — {res['qa'].get('reason')} (listen before using)")

    final = raw
    if not a.no_upscale:
        final = out / f"{slug}.mp4"
        sh([str(RESIZE), str(raw), str(final)])

    billed = json.loads(graphed("--format", "json", "tools", "get", run_id)).get("billedCredits")
    cost = f"${billed / 100:.2f}" if isinstance(billed, (int, float)) else f"~${est:.2f} (billing not settled yet)"
    print(f"done → {final}\ncost {cost} · run {run_id}")


if __name__ == "__main__":
    main()
