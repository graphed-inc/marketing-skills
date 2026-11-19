#!/usr/bin/env python3
"""Make a small synthetic two-person podcast to test the cloud render (macOS: needs `say` and ffmpeg).

Out dir gets: cam-wide.mp4, cam-close.mp4, mic-a.m4a, mic-b.m4a and truth.json.
Every source starts recording at a different moment, so the audio sync has real work to do:
  cam-wide is the reference (offset 0); mic-a started 2.5 s earlier (+2500), mic-b 0.8 s later (-800),
  cam-close 0.4 s earlier (+400). offset = how much later the same moment comes in that file.
Markers for checking A/V sync in a render: a white flash on both cameras and a 1 kHz beep on every
audio track at master 5.0 s and 40.0 s.

  python3 scripts/make-test-podcast.py <out dir>
"""
import json, os, subprocess, sys

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "test-podcast")
os.makedirs(OUT, exist_ok=True)
LINES = [
    ("A", "Welcome back to the show. Today we are talking about agents that edit video."),
    ("B", "Thanks for having me. I think most teams still edit every podcast by hand."),
    ("A", "Right, and that takes hours for every single episode."),
    ("B", "So the agent reads the transcript first, then it picks the best takes."),
    ("A", "What happens when somebody says the same line twice?"),
    ("B", "It keeps the last clean take and drops the stumble."),
    ("A", "And the cameras? We have a wide shot and a close shot here."),
    ("B", "It cuts to whoever is talking, and it holds the wide shot for the jokes."),
    ("A", "How fast is the render for a full hour?"),
    ("B", "In the cloud, about twenty seconds, because every chunk renders at the same time."),
    ("A", "That is wild. Thanks for coming on."),
    ("B", "Anytime. This was fun."),
]
VOICE = {"A": "Daniel", "B": "Samantha"}
OFFSET = {"cam-wide": 0, "cam-close": 400, "mic-a": 2500, "mic-b": -800}
BEEPS = [5.0, 40.0]


def run(*a):
    subprocess.run(a, check=True)


def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())


# 1. lines on the master clock
t, place = 2.0, []
for i, (spk, text) in enumerate(LINES):
    f = f"{OUT}/line{i}.aiff"
    run("say", "-v", VOICE[spk], "-o", f, text)
    d = dur(f)
    place.append({"i": i, "spk": spk, "text": text, "start": round(t, 3), "dur": round(d, 3), "file": f})
    t += d + 0.5
TOTAL = round(t + 2.0, 3)


def master_mix(path, gains):
    """gains: speaker -> dB. Beeps on every track."""
    ins, fl = [], []
    for k, p in enumerate(place):
        ins += ["-i", p["file"]]
        fl.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=mono,volume={gains[p['spk']]}dB,adelay={int(p['start'] * 1000)}[l{k}]")
    beeps = "+".join(f"between(t,{b},{b + 0.1})" for b in BEEPS)
    fl.append(f"aevalsrc='0.5*sin(2*PI*1000*t)*({beeps})':s=48000:d={TOTAL}[bp]")
    mix = "".join(f"[l{k}]" for k in range(len(place))) + "[bp]"
    fl.append(f"{mix}amix=inputs={len(place) + 1}:normalize=0:duration=longest,atrim=0:{TOTAL}[out]")
    run("ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(fl), "-map", "[out]", "-ac", "1", "-ar", "48000", path)


master_mix(f"{OUT}/master-a.wav", {"A": 0, "B": -18})
master_mix(f"{OUT}/master-b.wav", {"A": -18, "B": 0})
master_mix(f"{OUT}/master-room.wav", {"A": -6, "B": -6})


def shift(offset_ms):
    """ffmpeg audio filter that turns master time into this source's clock."""
    return f"adelay={offset_ms}:all=1" if offset_ms > 0 else (f"atrim=start={-offset_ms / 1000},asetpts=PTS-STARTPTS" if offset_ms < 0 else "anull")


for name, src in (("mic-a", "master-a"), ("mic-b", "master-b")):
    run("ffmpeg", "-v", "error", "-y", "-i", f"{OUT}/{src}.wav", "-af", shift(OFFSET[name]), "-c:a", "aac", "-b:a", "128k", f"{OUT}/{name}.m4a")

flash = "+".join(f"between(t,{b},{b + 0.1})" for b in BEEPS)
for name, pattern in (("cam-wide", "testsrc"), ("cam-close", "testsrc2")):
    off = OFFSET[name] / 1000
    vf = f"drawbox=c=white:t=fill:enable='{flash}'" + (f",tpad=start_duration={off}:start_mode=clone" if off > 0 else "")
    run("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"{pattern}=size=1920x1080:rate=30:duration={TOTAL}",
        "-i", f"{OUT}/master-room.wav", "-vf", vf, "-af", shift(OFFSET[name]),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", f"{OUT}/{name}.mp4")

json.dump({"offsets_ms": OFFSET, "beeps_master_s": BEEPS, "total_s": TOTAL,
           "lines": [{k: v for k, v in p.items() if k != "file"} for p in place]}, open(f"{OUT}/truth.json", "w"), indent=1)
for p in place:
    os.remove(p["file"])
print(json.dumps({"out": OUT, "total_s": TOTAL, "files": sorted(f for f in os.listdir(OUT) if not f.endswith(".wav"))}))
