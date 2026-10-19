"""Check a Seedance render against the script and fix it locally, without a re-render.

usage: fix_words.py <render.mp4> <voice.mp3> <script-spoken.txt> <out.mp4> [--check-only] [--report report.json]

1. whisper (local whisper.cpp) on the render and on our MP3, both compared with the script
2. not counted as errors: numbers written as digits ("2am" = "two a.m."), and words whisper hears the same way
   in our MP3 ("Klaviyo" -> "Clavio" in both)
3. wrong word  -> splice the same word from the MP3 into the render audio (20 ms crossfades, video untouched)
   extra words -> cut them out of video and audio as a jump cut (a stutter like "Slack, SL Slack")
4. every splice and cut is checked again with whisper and kept only if the spot reads right
5. anything still wrong goes in the report with its time, so a person can listen and decide on a re-render

Cut times always come from a short (~3.5 s) clip around the spot, in both tracks. Full-file whisper.cpp times
drift by up to ~0.5 s, and by a different amount in each track.
"""
import array, difflib, json, math, os, re, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spoken import speakable, num_words  # the same spell-out the script went through

MODEL = os.path.expanduser(os.environ.get("WHISPER_MODEL", "~/whisper-models/ggml-small.bin"))
WORD_NUM = {num_words(n): n for n in range(11, 100)}
HUNDREDS = re.compile(r"\b(" + "|".join(sorted(map(re.escape, WORD_NUM), key=len, reverse=True)) + r") hundred\b")
TMP = None  # scratch folder for one run
LOG = print


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())


def run(*cmd):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(r.stderr or r.stdout).strip()[-600:]}")
    return r.stdout


def dur(path):
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path).strip())


# ---------- whisper ----------

def words(audio, tag, start=0.0, length=None):
    """Words with times on the file's timeline. start/length transcribe a short clip (accurate times)."""
    wav = f"{TMP}/{tag}.wav"
    cut = ["-ss", f"{start:.3f}", "-t", f"{length:.3f}"] if length else []
    run("ffmpeg", "-y", *cut, "-i", audio, "-ac", "1", "-ar", "16000", wav)
    # -ml 1: one segment per word, with whisper's own timestamps
    run("whisper-cli", "-m", MODEL, "-f", wav, "-l", "en", "-ml", "1", "-dtw", "small", "-oj", "-of", f"{TMP}/{tag}", "-np")
    out = []
    for seg in json.load(open(f"{TMP}/{tag}.json"))["transcription"]:
        txt = seg["text"]
        if not txt.strip() or txt.strip().startswith("["):
            continue
        w = norm(txt)
        if not w:
            if out:
                out[-1]["raw"] += txt.strip()  # keep "/" and "%" so 24/7 and 95% read back right
            continue
        s, e = start + seg["offsets"]["from"] / 1000, start + seg["offsets"]["to"] / 1000
        if txt.startswith(" ") or not out:
            out.append({"w": w, "raw": txt.strip(), "s": s, "e": e})
        else:
            out[-1]["w"] += w; out[-1]["raw"] += txt; out[-1]["e"] = e
    return out


def plain(path, tag, start=None, end=None):
    """Plain whisper transcript (no per-word mode) as a word list. Used to judge a result."""
    wav = f"{TMP}/{tag}.wav"
    cut = ["-ss", f"{max(0, start):.3f}", "-t", f"{end - max(0, start):.3f}"] if start is not None else []
    run("ffmpeg", "-y", *cut, "-i", path, "-ac", "1", "-ar", "16000", wav)
    return subprocess.run(["whisper-cli", "-m", MODEL, "-f", wav, "-l", "en", "-nt", "-np"],
                          capture_output=True, text=True).stdout.split()


def canon(raw_words):
    """Digits and words compare equal: '2am' == 'two a.m.', '24/7' == 'twenty-four seven', '$1,200' == 'twelve hundred'."""
    t = speakable(" ".join(raw_words)).lower()
    t = HUNDREDS.sub(lambda m: num_words(WORD_NUM[m.group(1)] * 100), t)
    return re.sub(r"[^a-z]", "", t)


def align(script_words, heard):
    sm = difflib.SequenceMatcher(a=script_words, b=[h["w"] for h in heard], autojunk=False)
    match, wrong = {}, []
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op == "equal":
            for k in range(a2 - a1):
                match[a1 + k] = b1 + k
        else:
            wrong.append((op, a1, a2, b1, b2))
    return match, wrong


def score(heard, want):
    return difflib.SequenceMatcher(a=canon(want), b=canon(heard), autojunk=False).ratio()


# ---------- audio ----------

def energy(path, start, length):
    """10 ms RMS frames."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0, start):.3f}", "-t", f"{length:.3f}", "-i", str(path),
                        "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True)
    x = array.array("f"); x.frombytes(r.stdout)
    return [math.sqrt(sum(v * v for v in x[i:i + 160]) / 160) for i in range(0, len(x) - 160, 160)]


def quiet_cut(path, t, before, after, side):
    """Edge of the quiet gap between two words near t: side='start' = right after the earlier word,
    side='end' = right before the later word. The edge, not the middle, keeps a faint S or F in the swap."""
    start = max(0, t - before)
    e = energy(path, start, before + after)
    if not e:
        return t
    lo, hi = min(e), max(e)
    quiet = [v <= lo + 0.08 * (hi - lo) for v in e]
    k = min(range(len(e)), key=e.__getitem__)
    a = b = k
    while a > 0 and quiet[a - 1]:
        a -= 1
    while b < len(e) - 1 and quiet[b + 1]:
        b += 1
    return start + 0.01 * (a if side == "start" else b + 1)


def gaps(path, start, end):
    """Quiet runs (>= 20 ms) between start and end."""
    e = energy(path, start, end - start)
    if not e:
        return []
    lo, hi = min(e), max(e)
    q = [v <= lo + 0.12 * (hi - lo) for v in e]
    out, i = [], 0
    while i < len(q):
        if q[i]:
            j = i
            while j + 1 < len(q) and q[j + 1]:
                j += 1
            if j - i >= 1:
                out.append((start + 0.01 * i, start + 0.01 * (j + 1)))
            i = j + 1
        else:
            i += 1
    return out


def mean_db(path, start, length):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(path),
                        "-vn", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else -30.0


# ---------- timing from a short clip ----------

def clip_edges(path, script_words, lo, hi, approx_s, approx_e, tag):
    """End of script word `lo` and start of script word `hi`, timed on ~3.5 s clips around the spot.
    Whisper's times shift with where a clip starts, so three windows are tried; each one that lines up
    with the script gives a candidate. Returns a list of (end, start), most-agreed first."""
    mid = (approx_s + approx_e) / 2
    found = []
    for k, back in enumerate((1.0, 1.75, 2.5)):
        c0 = max(0.0, mid - back)
        C = words(path, f"{tag}w{k}", c0, 3.5)
        off = max(0, lo - 6)
        mc, _ = align(script_words[off:hi + 7], C)
        if (lo - off) in mc and (hi - off) in mc:
            found.append((C[mc[lo - off]]["e"], C[mc[hi - off]]["s"]))
    # most-agreed first: sort by distance to the median of the candidates
    if found:
        m0 = sorted(x[0] for x in found)[len(found) // 2]
        found.sort(key=lambda x: abs(x[0] - m0))
    return found


# ---------- find what is wrong ----------

def find(render, voice, script_words, R, V, unfixed):
    mr, wrong_r = align(script_words, R)
    mv, wrong_v = align(script_words, V)
    # what whisper heard in OUR MP3 for each script word, so its spellings of names are not counted as errors
    mp3_raw = {i: [V[k]["raw"]] for i, k in mv.items()}
    for op, a1, a2, b1, b2 in wrong_v:
        for i in range(a1, a2):
            mp3_raw[i] = []
        if a2 > a1:
            mp3_raw[a1] = [h["raw"] for h in V[b1:b2]]

    splices, cuts = [], []
    for op, a1, a2, b1, b2 in wrong_r:
        got = canon([h["raw"] for h in R[b1:b2]])
        if got == canon(script_words[a1:a2]):
            continue  # a number written as digits
        if a2 > a1 and got == canon(sum((mp3_raw.get(i, []) for i in range(a1, a2)), [])):
            continue  # heard the same way as our MP3: whisper's spelling, not a Seedance mistake
        at = R[b1]["s"] if b2 > b1 else (R[mr[a1 - 1]]["e"] if (a1 - 1) in mr else 0.0)

        if op == "insert":
            extra = " ".join(h["raw"] for h in R[b1:b2])
            if (a1 - 1) not in mr or a2 not in mr:
                unfixed.append({"kind": "extra words", "heard": extra, "at": round(at, 2), "why": "no matched words on both sides"})
                continue
            LOG(f"  extra words: '{extra}' between '{script_words[a1 - 1]}' and '{script_words[a2]}' (~{at:.1f}s)")
            options = search_cut(render, max(0.0, R[mr[a1 - 1]]["s"] - 0.4), R[mr[a2]]["e"] + 0.6,
                                 script_words[max(0, a1 - 10):a2 + 10], sum(h["e"] - h["s"] for h in R[b1:b2]))
            if options:
                cuts.append({"options": options, "heard": extra, "a1": a1 - 1, "a2": a2 + 1, "at": at})
            else:
                unfixed.append({"kind": "extra words", "heard": extra, "at": round(at, 2), "why": "no cut read like the script"})
            continue

        if op == "delete" and a1 > 0 and (a1 - 1) in mr and a2 in mr:
            a1, b1, a2, b2 = a1 - 1, mr[a1 - 1], a2 + 1, mr[a2] + 1  # dropped words: swap with a word each side
        heard = " ".join(h["raw"] for h in R[b1:b2]) or "(nothing)"
        meant = " ".join(script_words[a1:a2]) or "(nothing)"
        LOG(f"  wrong word: script '{meant}', render '{heard}' (~{at:.1f}s)")
        lo, hi = a1 - 1, a2
        if lo not in mv or hi not in mv or lo not in mr or hi not in mr:
            unfixed.append({"kind": "wrong word", "script": meant, "heard": heard, "at": round(at, 2),
                            "why": "no matched words on both sides to place the splice"})
            continue
        # word edges from short clips in BOTH tracks; full-file times drift a different amount in each
        ev = clip_edges(voice, script_words, lo, hi, V[mv[lo]]["s"], V[mv[hi]]["e"], f"cv{a1}") or [(V[mv[lo]]["e"], V[mv[hi]]["s"])]
        er = clip_edges(render, script_words, lo, hi, R[mr[lo]]["s"], R[mr[hi]]["e"], f"cr{a1}") or [(R[mr[lo]]["e"], R[mr[hi]]["s"])]
        cands = []
        for r in er:
            for v in ev:
                vs, ve = quiet_cut(voice, v[0], 0.10, 0.10, "start"), quiet_cut(voice, v[1], 0.10, 0.04, "end")
                rs, re_ = quiet_cut(render, r[0], 0.10, 0.10, "start"), quiet_cut(render, r[1], 0.10, 0.04, "end")
                if ve - vs >= 0.08 and re_ - rs >= 0.08 and not any(
                        abs(c["vs"] - vs) < 0.05 and abs(c["rs"] - rs) < 0.05 and abs(c["re"] - re_) < 0.05 for c in cands):
                    cands.append({"vs": vs, "ve": ve, "rs": rs, "re": re_})
        if not cands:
            unfixed.append({"kind": "wrong word", "script": meant, "heard": heard, "at": round(at, 2), "why": "span too short"})
            continue
        splices.append({"cands": cands, "script": meant, "heard": heard, "a1": a1, "a2": a2, "at": at})
    return splices, cuts, mp3_raw


def errors(path, script_words, mp3_raw, tag):
    """Script index ranges that are still wrong in `path` (whole-file plain transcript, same rules as find)."""
    W = [{"w": norm(x), "raw": x} for x in plain(path, tag) if norm(x)]
    bad = []
    for op, a1, a2, b1, b2 in align(script_words, W)[1]:
        got = canon([h["raw"] for h in W[b1:b2]])
        if got == canon(script_words[a1:a2]):
            continue
        if a2 > a1 and got == canon(sum((mp3_raw.get(i, []) for i in range(a1, a2)), [])):
            continue
        bad.append((a1, a2))
    return bad


def search_cut(render, lo_t, hi_t, want, expect):
    """Try removing [gap_i start, gap_j end] for every pair of quiet gaps near the stutter. Whisper the same
    window for each try; return the cuts that read like the script, closest to the extra words' length first."""
    G = gaps(render, lo_t, hi_t)
    w0, w1 = max(0, lo_t - 1.2), hi_t + 1.2
    target = canon(want)
    tried = []
    for i in range(len(G)):
        for j in range(i, len(G)):
            cs, ce = G[i][0], G[j][1]
            if not 0.1 <= ce - cs <= 1.6:
                continue
            wav = f"{TMP}/try.wav"
            run("ffmpeg", "-y", "-ss", f"{w0:.3f}", "-t", f"{w1 - w0:.3f}", "-i", render, "-filter_complex",
                f"[0:a]atrim=0:{cs - w0:.3f},asetpts=PTS-STARTPTS[x];[0:a]atrim={ce - w0:.3f},asetpts=PTS-STARTPTS[y];"
                "[x][y]concat=n=2:v=0:a=1,aresample=16000,pan=mono|c0=c0", wav)
            heard = subprocess.run(["whisper-cli", "-m", MODEL, "-f", wav, "-l", "en", "-nt", "-np"],
                                   capture_output=True, text=True).stdout.split()
            got = canon(heard[1:-1]) if len(heard) > 2 else canon(heard)  # clip edges cut the first/last word
            sc = difflib.SequenceMatcher(a=target, b=got, autojunk=False).find_longest_match(
                0, len(target), 0, len(got)).size / max(1, len(got))
            tried.append((sc, cs, ce))
    ok = sorted((t for t in tried if t[0] >= 0.95), key=lambda t: abs((t[2] - t[1]) - expect))
    LOG(f"    tried {len(tried)} cuts, {len(ok)} read like the script")
    return [(cs, ce) for _, cs, ce in ok]


# ---------- apply ----------

def splice(render, voice, fixes, out):
    """Render audio with holes and the MP3 words dropped in. Video is copied as it is."""
    gain = mean_db(render, 0, 600) - mean_db(voice, 0, 600)  # one level match for the whole track
    chains, labels, cursor = [], [], 0.0
    for n, f in enumerate(fixes):
        vs, ve, rs, re_ = f["vs"], f["ve"], f["rs"], f["re"]
        fade_in = ",afade=t=in:st=0:d=0.02" if cursor > 0 else ""
        chains.append(f"[a{n}]atrim={cursor:.3f}:{rs + 0.02:.3f},asetpts=PTS-STARTPTS{fade_in},"
                      f"afade=t=out:st={rs - cursor:.3f}:d=0.02,adelay={int(cursor * 1000)}|{int(cursor * 1000)}[k{n}]")
        tempo = max(0.9, min(1.1, (ve - vs) / (re_ - rs)))  # keep the voice near natural speed
        chains.append(f"[v{n}]atrim={vs:.3f}:{ve:.3f},asetpts=PTS-STARTPTS,atempo={tempo:.4f},volume={gain:.2f}dB,"
                      f"apad,atrim=0:{re_ - rs + 0.02:.3f},afade=t=in:st=0:d=0.02,afade=t=out:st={re_ - rs:.3f}:d=0.02,"
                      f"adelay={int(rs * 1000)}|{int(rs * 1000)}[w{n}]")
        labels += [f"[k{n}]", f"[w{n}]"]
        cursor = re_
    n = len(fixes)
    chains.append(f"[a{n}]atrim=start={cursor:.3f},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.02,"
                  f"adelay={int(cursor * 1000)}|{int(cursor * 1000)}[k{n}]")
    labels.append(f"[k{n}]")
    graph = ";".join([f"[0:a]aresample=32000,asplit={n + 1}" + "".join(f"[a{i}]" for i in range(n + 1)),
                      f"[1:a]aresample=32000,pan=stereo|c0=c0|c1=c0,asplit={n}" + "".join(f"[v{i}]" for i in range(n))]
                     + chains) + ";" + "".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest[out]"
    run("ffmpeg", "-y", "-i", render, "-i", voice, "-filter_complex", graph, "-map", "0:v", "-map", "[out]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{dur(render):.3f}", out)


def jump_cut(src, cuts, out):
    """Remove each [cs, ce] from video and audio and join the rest, 20 ms audio fades at every join."""
    keep, t = [], 0.0
    for c in sorted(cuts, key=lambda c: c["cs"]):
        keep.append((t, c["cs"])); t = c["ce"]
    keep.append((t, dur(src)))
    parts, labels = [], ""
    for i, (a, b) in enumerate(keep):
        parts.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}]")
        fi = ",afade=t=in:st=0:d=0.02" if i else ""
        fo = f",afade=t=out:st={b - a - 0.02:.3f}:d=0.02" if i < len(keep) - 1 else ""
        parts.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS{fi}{fo}[a{i}]")
        labels += f"[v{i}][a{i}]"
    run("ffmpeg", "-y", "-i", src, "-filter_complex", ";".join(parts) + f";{labels}concat=n={len(keep)}:v=1:a=1[v][a]",
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-c:a", "aac", "-b:a", "192k", out)


def fix(render, voice, script_path, out, check_only=False, log=print):
    """Run the whole check + fix. Returns a report dict (also what --report writes)."""
    global TMP, LOG
    TMP, LOG = tempfile.mkdtemp(), log
    script_words = [norm(w) for w in Path(script_path).read_text().split() if norm(w)]
    unfixed = []
    R, V = words(render, "render"), words(voice, "voice")
    splices, cuts, mp3_raw = find(render, voice, script_words, R, V, unfixed)
    report = {"splices": [], "cuts": [], "unfixed": unfixed, "output": str(out)}
    LOG(f"  {len(splices)} wrong word(s), {len(cuts)} stutter(s), {len(unfixed)} that can't be placed")
    if check_only:
        report["found"] = {"splices": splices, "cuts": cuts}
        return report

    # splices: for each wrong word try its candidate cuts; keep the first one after which a whole-file
    # transcript has that word right and no new errors
    spliced = f"{TMP}/spliced.mp4"
    run("ffmpeg", "-y", "-i", render, "-c", "copy", spliced)
    base = errors(spliced, script_words, mp3_raw, "base")
    kept = []
    for f in splices:
        done = False
        for k, c in enumerate(f["cands"][:6]):
            test = f"{TMP}/splicetest.mp4"
            splice(render, voice, sorted(kept + [c], key=lambda x: x["rs"]), test)
            now = errors(test, script_words, mp3_raw, f"sp{f['a1']}{k}")
            still = any(a < f["a2"] and b > f["a1"] for a, b in now)
            worse = len(now) > len(base) - 1
            LOG(f"    splice '{f['script']}' MP3 {c['vs']:.2f}-{c['ve']:.2f} -> {c['rs']:.2f}-{c['re']:.2f}: "
                f"{'fixed' if not still and not worse else ('still wrong' if still else 'new error')}")
            if not still and not worse:
                kept.append(c); base = now; done = True
                run("ffmpeg", "-y", "-i", test, "-c", "copy", spliced)
                break
        if not done:
            unfixed.append({"kind": "wrong word", "script": f["script"], "heard": f["heard"], "at": round(f["at"], 2),
                            "why": "no splice timing fixed it"})
        else:
            report["splices"].append({"script": f["script"], "heard": f["heard"], "at": round(kept[-1]["rs"], 2)})

    # stutter cuts: try candidates in order; keep the first one after which the whole file has no extra words there
    kept = []
    for c in cuts:
        for cs, ce in c["options"][:6]:
            test = f"{TMP}/cuttest.mp4"
            jump_cut(spliced, kept + [{"cs": cs, "ce": ce}], test)
            W = [{"w": norm(x), "raw": x} for x in plain(test, "cutcheck") if norm(x)]
            left = [w for w in align(script_words, W)[1] if w[0] == "insert" and c["a1"] <= w[1] <= c["a2"]]
            LOG(f"    cut '{c['heard']}' {cs:.2f}-{ce:.2f}: {'clean' if not left else 'extra words still there'}")
            if not left:
                kept.append({"cs": cs, "ce": ce, "heard": c["heard"]})
                break
        else:
            unfixed.append({"kind": "extra words", "heard": c["heard"], "at": round(c["at"], 2),
                            "why": "no cut removed them cleanly"})
    if kept:
        jump_cut(spliced, kept, out)
    else:
        run("ffmpeg", "-y", "-i", spliced, "-c", "copy", out)
    report["cuts"] = [{"heard": k["heard"], "removed": [round(k["cs"], 2), round(k["ce"], 2)]} for k in kept]
    return report


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    rep_path = sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None
    if rep_path in args:
        args.remove(rep_path)
    rep = fix(*args[:4], check_only="--check-only" in sys.argv)
    print(json.dumps({k: v for k, v in rep.items() if k != "found"}, indent=1))
    if rep_path:
        Path(rep_path).write_text(json.dumps(rep, indent=1))
