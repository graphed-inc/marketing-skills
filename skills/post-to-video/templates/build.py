"""__NAME__: generates .tesseract-work/editable.json for this post video.

Concept: <one line: what the seed patterns became, and the visual system>
Run: $PY .tesseract-work/build.py   (rebuild.sh does this, then commits)
"""
import os, sys
sys.path.insert(0, "__SKILL_LIB__")
from motion import *

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
setup(ROOT)                                     # 1080x1350, Geist fonts; pass fonts={...} to remap keys
L, R = 80, 1000                                 # content margins (keep single text lines <= 900 px)

# ---------- palette (light by default; dark only when the brief asks for it) ----------
BG    = [0.968, 0.966, 0.958, 1]
TEXT  = [0.070, 0.072, 0.085, 1]
MUTED = [0.430, 0.435, 0.460, 1]
LINE  = [0.860, 0.858, 0.850, 1]
CARD  = [1, 1, 1, 1]
ACC   = OR                                      # Graphed orange; one accent

# ---------- timing: beat grid from scripts/beats.py ----------
MUSIC_SRC0 = 28131                              # source ms of the in-point (lift lands on beat 4)
B = Beats(469.8, [0, 10, 24, 36, 48])           # scene boundaries in beats; last = end
S, D = B.S, B.D
scenes = []

def head(lab, l1, l2=None, y0=250):
    """Section label + one or two headline lines (each <= 900 px)."""
    out = []
    lab_ = text("Label", "", L, y0 - 70, "monom", 21, ACC, 100); typing(lab_, lab, 60, cps=70); out.append(lab_)
    a = text("Headline 1", l1, L, y0, "head", fit(l1, "head", 72, 900, -16), TEXT, -16); rise(a, 120, dy=22); out.append(a)
    if l2:
        b = text("Headline 2", l2, L, y0 + 84, "head", fit(l2, "head", 72, 900, -16), ACC, -16); rise(b, 260, dy=22); out.append(b)
    return out

# ---------- scene 0: hook (the drop lands on beat 4) ----------
s = []
h1 = text("Hook 1", "first line of the hook", L, 520, "head", 84, TEXT, -16)
h2 = text("Hook 2", "the line that lands on the drop.", L, 616, "head", fit("the line that lands on the drop.", "head", 84, 900, -16), ACC, -16)
rise(h1, B.lb(0, 1)); rise(h2, B.lb(0, 4) - 60)
sfx("soft-impact", B.pt(0, 4), 0.6)
s += [h1, h2]
g = group("0 · Hook", S[0], D[0], s); exit_scene(g, D[0]); scenes.append(g)

# ---------- scene 1: example list that builds on the beats ----------
s = head("STEP 01 · EXAMPLE", "a list that builds", "on the beat.")
for i, item in enumerate(["first item", "second item", "third item"]):
    y = 470 + i * 110
    t = B.lb(1, 2 + i)
    bg = rect(f"Row {i} card", L, y, R - L, 90, CARD, r=14, stroke=LINE, sw=1.5)
    ck = check(f"Row {i} check", L + 28, y + 30, 28, ACC)
    tx = text(f"Row {i}", item, L + 76, y + 57, "bodym", 32, TEXT)
    rg = group(f"Row {i}", 0, None, [ck, tx, bg])
    key(rg, "opacity", t, 0); key(rg, "opacity", t + 180, 100, EO)
    key(rg, "positionX", t, 30); key(rg, "positionX", t + 380, 0, EO)
    sfx("soft-tap", S[1] + t, 0.4)
    s.append(rg)
g = group("1 · Example", S[1], D[1], s); enter_scene(g); exit_scene(g, D[1]); scenes.append(g)

# ---------- scene 2: proof / payoff ----------
s = head("RESULT", "a number that counts up.")
n = text("Counter", "0", L, 640, "head", 200, TEXT, -40)
counter(n, B.lb(2, 2), B.lb(2, 6), 1000, fmt="${n}")
fade(n, B.lb(2, 2), 200)
s.append(n)
g = group("2 · Proof", S[2], D[2], s); enter_scene(g); exit_scene(g, D[2]); scenes.append(g)

# ---------- scene 3: CTA (only when the post mentions Graphed) ----------
s = head("GET STARTED", "get started for free.")
cta, cw = pill("CTA", "get started free → graphed.com/platform", L, 400, 86, ACC, WHITE, font="monom", size=30, pad=34)
cg = group("CTA", 0, None, cta); fade(cg, B.lb(3, 2), 300)
logo = group("Logo", 0, None, logo_lockup(L, 1060, 72, tile_color=TEXT, word_color=TEXT)); fade(logo, B.lb(3, 4), 400)
sfx("soft-pop", B.pt(3, 2), 0.5)
s += [cg, logo]
g = group("3 · CTA", S[3], D[3], s); enter_scene(g); scenes.append(g)

# ---------- chrome (persistent, sits on top of scenes) ----------
ch = [line("Footer rule", L, 1240, R, 1240, LINE, 1.5),
      text("Footer right", "graphed.com", R, 1284, "mono", 18, MUTED, just="right")]
chrome = group("Chrome", 0, B.TOTAL, ch)
for b in S[1:]:
    sfx("air-whoosh", b - 220, 0.22)

write_doc("__NAME__", [chrome] + scenes[::-1], B.TOTAL, BG,
          music_layer=music(MUSIC_SRC0, B.TOTAL, vol=0.45))
