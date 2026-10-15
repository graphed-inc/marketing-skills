"""Find a track's beat grid and its drops, and suggest in-points.

Usage:  $PY beats.py <track.mp3> [--need 50] [--drop-beat 4] [--zoom 31.2]
  --need       seconds of music the video needs (default 50)
  --drop-beat  which beat of the video the drop should land on (default 4, ~1.9 s)

Prints the beat period + phase, a 2 s energy map, every "lift" (quiet -> loud), and for each
lift the in-point (source ms) that puts it on --drop-beat. Lift times are candidates (+-0.5 s):
confirm each with --zoom <sec>, which prints energy per quarter beat with the beat grid marked,
and take the beat where energy jumps and stays up. The estimates come from onset
autocorrelation (harmonic sum) + a fine grid search; checked against 5 tracks to +-1.5 ms. They are NOT confirmed by listening; say so in NOTES.md.
"""
import argparse, json, os, subprocess, tempfile
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("track")
ap.add_argument("--need", type=float, default=50)
ap.add_argument("--drop-beat", type=int, default=4)
ap.add_argument("--zoom", type=float, default=None, help="print quarter-beat energy +-3 s around this source second")
a = ap.parse_args()

SR = 11025
with tempfile.TemporaryDirectory() as td:
    raw = os.path.join(td, "m.raw")
    # -y and -nostdin: without them ffmpeg can block on an "overwrite?" prompt
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", a.track, "-ac", "1", "-ar", str(SR),
                    "-f", "s16le", raw], check=True)
    x = np.fromfile(raw, dtype=np.int16).astype(float) / 32768
dur = len(x) / SR
hop = SR // 1000                                    # ~1 ms bins
n = len(x) // hop
e = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1))
on = np.maximum(0, np.diff(np.log(e + 1e-4)))
on = np.convolve(on, np.ones(5) / 5, "same")

# tempo, coarse: autocorrelation of a 10 ms onset envelope with a harmonic sum
# (ac(L) + ac(2L)/2 + ac(3L)/3 + ac(4L)/4) so the fundamental wins over 2x / 1.5x periods.
h10 = SR // 100
n10 = len(x) // h10
e10 = np.sqrt((x[:n10 * h10].reshape(n10, h10) ** 2).mean(1))   # true 10 ms RMS
o10 = np.maximum(0, np.diff(np.log(e10 + 1e-4)))
mid = o10[len(o10) // 6: len(o10) * 5 // 6]
mid = mid - mid.mean()
ac = np.correlate(mid, mid, "full")[len(mid) - 1:]
ac = ac / ac[0]
grid = np.arange(len(ac))
Ls = np.arange(33, 80.01, 0.05)                     # 330-800 ms
hs = np.array([sum(np.interp(k * L, grid, ac) / k for k in (1, 2, 3, 4)) for L in Ls])
L0 = float(Ls[int(np.argmax(hs))]) * 10
# tempo, fine: +-3 ms grid search for period + phase on the 1 ms onset envelope
seg = on[len(on) // 5: len(on) * 4 // 5]
off0 = len(on) // 5
def score(P, phase_step=1):
    idx0 = np.arange(0, len(seg) - P - 2, P)
    phs = np.arange(0, int(P), phase_step)
    m = seg[(phs[:, None] + idx0[None, :]).astype(int)].mean(1)
    i = int(np.argmax(m))
    return float(m[i]), float(phs[i])
best = max(((score(P)[0], P) for P in np.arange(L0 - 3, L0 + 3, 0.1)))
P = float(best[1])
sc, ph = score(P)
phase = (ph + off0) % P
strength = sc / seg.mean()
print(f"track {os.path.basename(a.track)}  duration {dur:.1f} s")
print(f"beat period {P:.1f} ms ({60000 / P:.1f} bpm), phase {phase:.0f} ms, grid strength {strength:.2f}"
      + ("  <- WEAK grid, pick another track" if strength < 1.25 else ""))

w = 2000
blocks = [float(e[i:i + w].mean()) for i in range(0, n - w, w)]
print("energy per 2 s:", " ".join(f"{i * 2}:{b:.2f}" for i, b in enumerate(blocks)))
med = float(np.median(blocks))
lifts = []
for t in range(3000, n - 3000, 50):
    before = e[t - 2500:t - 300].mean()
    after = e[t + 100:t + 2000].mean()
    if after > 1.6 * before and after > 0.6 * med:
        if not lifts or t - lifts[-1][0] > 4000:
            # the hit = first moment the 20 ms energy crosses halfway from the quiet level to the loud level
            sm = np.convolve(e[t - 500:t + 2000], np.ones(20) / 20, "same")
            above = np.nonzero(sm > (before + after) / 2)[0]
            j = t - 500 + int(above[0]) if len(above) else t
            lifts.append((j, before, after))
print("\nlifts (quiet -> loud), snapped to the nearest beat:")
out = []
for t, b0, b1 in lifts:
    k = round((t - phase) / P)
    tb = phase + k * P
    src0 = tb - a.drop_beat * P
    room = dur * 1000 - 3000 - src0
    ok = src0 >= 0 and room >= a.need * 1000
    print(f"  lift ~{t / 1000:.2f} s (beat {k} at {tb / 1000:.3f} s, energy {b0:.2f} -> {b1:.2f})  "
          f"in-point {src0 / 1000:.3f} s puts it on beat {a.drop_beat}  "
          + ("ok" if ok else f"NOT ENOUGH ROOM ({room / 1000:.0f} s left)"))
    out.append({"lift_ms": t, "beat": k, "beat_ms": round(tb, 1), "in_point_ms": round(src0),
                "room_s": round(room / 1000, 1), "ok": bool(ok)})
if not out:
    print("  none found: steady track. Start on any beat (phase + k*period) and time scenes to beats.")
print("\njson:", json.dumps({"period_ms": round(float(P), 1), "phase_ms": round(float(phase)),
                            "strength": round(float(strength), 2), "lifts": out}))

if a.zoom is not None:
    print(f"\nzoom {a.zoom:.2f} s (energy per quarter beat, '|' = on the beat grid):")
    q = P / 4
    k0 = int((a.zoom * 1000 - 3000 - phase) // q)
    for k in range(k0, k0 + int(6000 // q)):
        t0 = phase + k * q
        if t0 < 0 or t0 + q >= n: continue
        v = float(e[int(t0):int(t0 + q)].mean())
        mark = "|" if k % 4 == 0 else " "
        print(f"  {t0 / 1000:8.3f} {mark} {v:.3f} " + "#" * int(v * 120))
