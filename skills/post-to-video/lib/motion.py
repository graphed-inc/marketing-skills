"""post-to-video shared library: build editable Tesseract (.tsrct) documents from Python.

Every post video is one `build.py` that imports this module, adds layers + keyframes,
and calls `write_doc(...)`. The `rebuild.sh` next to it packages fonts/SFX/music/logo
and commits the JSON with `tsrct project commit`.

    import sys, os
    sys.path.insert(0, os.path.expanduser("<repo>/.claude/skills/post-to-video/lib"))
    from motion import *
    setup(ROOT)                       # ROOT = project folder (has assets/fonts/...)

Conventions (learned the hard way, see references/quirks.md):
  - layers[0] is TOPMOST. Build lists top-first, or reverse with [::-1].
  - Layer times are milliseconds on the parent's clock. Groups re-zero the clock.
  - Opacity keys on Shape layers do NOT render. Wrap shapes in a group, or use Rect.
  - Text wider than ~930 px auto-wraps. Keep single lines <= 900 px (text() warns).
  - Rect fill alpha works; Shape paint alpha is ignored (renders opaque).
"""
import json, math, os, sys

try:
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover
    sys.exit("fontTools missing. Run: source <skill>/scripts/env.sh  (sets $PY with fonttools + numpy)")

W, H = 1080, 1350
ROOT = "."
C = 30                       # cell size for snap_in

# ---------- fonts ----------
# key -> (family, style, file). Family/style are what `tsrct project import-font` reports.
FONT_FILES = {
    "head":    ("Geist Medium", "Regular", "Geist-Medium.ttf"),
    "body":    ("Geist", "Regular", "Geist-Regular.ttf"),
    "bodym":   ("Geist Medium", "Regular", "Geist-Medium.ttf"),
    "mono":    ("Geist Mono", "Regular", "GeistMono-Regular.ttf"),
    "monom":   ("Geist Mono Medium", "Regular", "GeistMono-Medium.ttf"),
    "outfit":  ("Outfit SemiBold", "Regular", "Outfit-600.ttf"),
    "outfitm": ("Outfit Medium", "Regular", "Outfit-500.ttf"),
    "jbmono":  ("JetBrains Mono Medium", "Regular", "JetBrainsMono-500.ttf"),
    "type":    ("Courier Prime", "Regular", "CourierPrime-Regular.ttf"),
    "typeb":   ("Courier Prime", "Bold", "CourierPrime-Bold.ttf"),
}
FONTS = {}
_metrics = {}
WRAP_LIMIT = 900

# ---------- palette defaults (override per video) ----------
INK = [0.07, 0.07, 0.08, 1]
WHITE = [1, 1, 1, 1]
CLEAR = [0, 0, 0, 0]
OR = [1.0, 0.467, 0.0, 1]     # Graphed orange #FF7700


def setup(root, width=1080, height=1350, fonts=None, ink=None):
    """Point the library at a project folder. `fonts` can remap keys, e.g. {"head": FONT_FILES["outfit"]}."""
    global ROOT, W, H, INK
    ROOT, W, H = root, width, height
    if ink: INK = ink
    FONTS.clear()
    for k, (fam, sty, fn) in {**FONT_FILES, **(fonts or {})}.items():
        FONTS[k] = (fam, sty, os.path.join(root, "assets/fonts", fn))


def measure(s, font, size, tracking=0):
    if font not in _metrics:
        f = TTFont(FONTS[font][2])
        _metrics[font] = (f.getBestCmap(), f["hmtx"], f["head"].unitsPerEm)
    cmap, hmtx, upm = _metrics[font]
    w = sum(hmtx[cmap.get(ord(c), cmap[ord("?")])][0] for c in s) * size / upm
    return w + tracking / 1000 * size * max(0, len(s) - 1)


def has_glyphs(font, chars):
    """True if every char is in the font. Geist has →…·; no font here has ✓ (use check())."""
    measure("a", font, 10)
    return all(ord(c) in _metrics[font][0] for c in chars)


def fit(s, font, size, maxw=WRAP_LIMIT, tracking=0):
    w = measure(s, font, size, tracking)
    return size if w <= maxw else round(size * maxw / w, 1)


def wrap(s, font, size, maxw=WRAP_LIMIT):
    lines, cur = [], ""
    for w_ in s.split(" "):
        t = (cur + " " + w_).strip()
        if measure(t, font, size) <= maxw: cur = t
        else: lines.append(cur); cur = w_
    return lines + [cur]


# ---------- layer builders ----------
_next_id = [100]
def nid():
    _next_id[0] += 1
    return _next_id[0]


def tf(x, y, ax=0, ay=0, op=100, sx=100, sy=100, rot=0):
    return {"anchorPoint": [ax, ay], "position": [x, y], "scale": [sx, sy], "rotation": rot, "opacity": op}


def text(name, s, x, y, font, size, color, tracking=0, just="left", start=0, dur=None, op=100):
    """Point text. y is the BASELINE. Warns when a line would hit the ~930 px auto-wrap."""
    if s and measure(s, font, size, tracking) > WRAP_LIMIT + 20:
        print(f"WARN text too wide ({measure(s, font, size, tracking):.0f}px, may auto-wrap): {name!r}: {s[:50]!r}")
    return {"type": "Text", "id": nid(), "name": name, "blendMode": "normal",
            "activeRange": {"start": start, "duration": dur}, "transform": tf(x, y, op=op),
            "sourceText": {"text": s, "fontFamily": FONTS[font][0], "fontStyle": FONTS[font][1], "fontSize": size,
                           "fillColor": color, "justification": just, "tracking": tracking}}


def rect(name, x, y, w, h, fill, r=0, stroke=None, sw=0, start=0, dur=None, ax=0, ay=0, op=100, rot=0):
    """(x, y) is the top-left. ax/ay set the anchor (scale/rotate pivot) relative to the rect."""
    lay = {"type": "Rect", "id": nid(), "name": name, "blendMode": "normal",
           "activeRange": {"start": start, "duration": dur}, "transform": tf(x + ax, y + ay, ax, ay, op=op, rot=rot),
           "rect": {"size": [w, h], "fillColor": fill, "fillEnabled": fill[3] > 0, "roundness": r}}
    if stroke:
        lay["rect"].update({"strokeEnabled": True, "strokeColor": stroke, "strokeWidth": sw})
    return lay


def circle(name, cx, cy, d, fill=CLEAR, stroke=None, sw=0, op=100):
    """A Rect circle anchored at its centre. Fades and scales work (unlike Shape)."""
    return rect(name, cx - d / 2, cy - d / 2, d, d, fill, r=d / 2, stroke=stroke, sw=sw, ax=d / 2, ay=d / 2, op=op)


def shadow(lay, a=0.16, blur=26, dy=10, color=(0.05, 0.05, 0.1)):
    lay["dropShadow"] = {"color": [*color, a], "blurRadius": blur, "spreadRadius": 0,
                         "offset": [0, dy], "blendMode": "normal"}
    return lay


def path_shape(name, cmds, fill=None, stroke=None, sw=0, trim=None, start=0, dur=None, cap="round"):
    """cmds: [{"type": "moveTo"|"lineTo", "x", "y"}, {"type": "cubicTo", c1x, c1y, c2x, c2y, x, y}, {"type": "close"}].
    trim=0 + key(lay, "trimEnd", t, 0..100) draws the stroke on."""
    shape = {"path": {"commands": cmds}, "fills": [], "strokes": []}
    if fill:
        shape["fills"].append({"paint": {"type": "solid", "color": fill}, "fillRule": "nonZeroWinding",
                               "blendMode": "normal", "opacity": 100})
    if stroke:
        shape["strokes"].append({"paint": {"type": "solid", "color": stroke}, "width": sw, "cap": cap,
                                 "join": "round", "miterLimit": 4, "blendMode": "normal", "opacity": 100})
    if trim is not None:
        shape["trim"] = {"start": 0, "end": trim, "mode": "simultaneously"}
    return {"type": "Shape", "id": nid(), "name": name, "blendMode": "normal",
            "activeRange": {"start": start, "duration": dur}, "transform": tf(0, 0), "shape": shape}


def line(name, x0, y0, x1, y1, color, sw, trim=None):
    return path_shape(name, [{"type": "moveTo", "x": x0, "y": y0}, {"type": "lineTo", "x": x1, "y": y1}],
                      stroke=color, sw=sw, trim=trim, cap="butt")


def polyline(name, pts, color, sw, trim=None):
    return path_shape(name, [{"type": "moveTo" if i == 0 else "lineTo", "x": x, "y": y} for i, (x, y) in enumerate(pts)],
                      stroke=color, sw=sw, trim=trim)


def check(name, x, y, s=26, c=INK, sw=3.5):
    """Check mark as a path (no font here has ✓)."""
    return path_shape(name, [{"type": "moveTo", "x": x, "y": y + s * 0.52}, {"type": "lineTo", "x": x + s * 0.36, "y": y + s * 0.86},
                             {"type": "lineTo", "x": x + s, "y": y + s * 0.12}], stroke=c, sw=sw)


def image(name, asset, cx, cy, src_px, scale_pct, start=0, dur=None):
    """Imported image (`import-asset --kind image --asset-id <asset>`), centred at (cx, cy)."""
    return {"type": "Image", "id": nid(), "name": name, "blendMode": "normal",
            "activeRange": {"start": start, "duration": dur},
            "transform": tf(cx, cy, src_px / 2, src_px / 2, sx=scale_pct, sy=scale_pct),
            "source": {"assetId": asset, "fit": "contain"}}


def group(name, start, dur, layers, x=0, y=0):
    """A windowed group: children see time from 0 at `start`. dur=None inherits the parent window."""
    return {"type": "Group", "id": nid(), "name": name, "blendMode": "normal",
            "playback": {"type": "windowed", "inputRange": {"start": start, "duration": dur},
                         "mapping": {"type": "linear", "input": {"start": start, "duration": dur},
                                     "output": {"start": 0, "duration": dur}}, "inputOffsetMs": 0},
            "transform": tf(x, y), "layers": layers}


def pivot(g, cx, cy):
    """Make a group scale/rotate around (cx, cy) without moving its children."""
    g["transform"]["anchorPoint"] = [cx, cy]; g["transform"]["position"] = [cx, cy]
    return g


def audio(name, asset, at, dur_ms, vol):
    return {"type": "Audio", "id": nid(), "name": name, "source": {"assetId": asset},
            "sourceRange": {"start": 0, "duration": dur_ms}, "sourceIntrinsicDuration": dur_ms,
            "playback": {"type": "windowed", "inputRange": {"start": at, "duration": dur_ms},
                         "mapping": {"type": "linear", "input": {"start": at, "duration": dur_ms},
                                     "output": {"start": 0, "duration": dur_ms}}, "inputOffsetMs": 0},
            "volume": vol, "captionsEnabled": False}


def fill_durations(layers, dur):
    for lay in layers:
        if "activeRange" in lay and lay["activeRange"]["duration"] is None:
            lay["activeRange"]["duration"] = dur - lay["activeRange"]["start"]
        if lay["type"] == "Group" and lay["playback"]["inputRange"]["duration"] is None:
            pb = lay["playback"]
            for r_ in (pb["inputRange"], pb["mapping"]["input"], pb["mapping"]["output"]):
                r_["duration"] = dur
        if lay["type"] == "Group":
            fill_durations(lay["layers"], lay["playback"]["inputRange"]["duration"])


# ---------- animation graph ----------
KEYS = {}
SCRIPTS = []
EO   = {"type": "cubicBezier", "x1": 0.16, "y1": 1, "x2": 0.3, "y2": 1}     # expo-ish out
EIO  = {"type": "cubicBezier", "x1": 0.65, "y1": 0, "x2": 0.35, "y2": 1}
POP  = {"type": "cubicBezier", "x1": 0.34, "y1": 1.45, "x2": 0.64, "y2": 1} # small overshoot
LIN  = {"type": "linear"}
HOLD = {"type": "hold"}
_warned = set()


def key(lay, prop, t, v, ease=LIN):
    """Keyframe on the layer's own clock. Props: opacity, positionX/Y, scaleX/Y, rotation, trimEnd, volume, ..."""
    if prop == "opacity" and lay["type"] == "Shape" and lay["id"] not in _warned:
        _warned.add(lay["id"])
        print(f"WARN opacity on Shape {lay['name']!r} will not render; wrap it in group(...) and fade the group")
    KEYS.setdefault((lay["id"], prop), []).append((int(t), v, ease))


def script(lay, prop, code):
    """JS expression on the layer clock (input.time.milliseconds / .seconds). Must `return` a value.
    Prefer plain ES5; avoid toLocaleString and other Intl APIs."""
    SCRIPTS.append({"target": {"kind": "layer", "layerId": lay["id"], "propertyType": prop},
                    "animator": {"type": "jsScript", "layerTimeJsCode": code}})


def fade(lay, t, dur=300, a=0, b=100, ease=EO):
    key(lay, "opacity", t, a); key(lay, "opacity", t + dur, b, ease)


def rise(lay, t, dy=30, dur=480, prop="positionY"):
    """Fade + slide into the authored position."""
    v = lay["transform"]["position"][1 if prop == "positionY" else 0]
    key(lay, prop, t, v + dy); key(lay, prop, t + dur, v, EO)
    fade(lay, t, int(dur * 0.5))


def pop(lay, t, a=40, b=100, dur=240, ease=POP):
    key(lay, "scaleX", t, a); key(lay, "scaleX", t + dur, b, ease)
    key(lay, "scaleY", t, a); key(lay, "scaleY", t + dur, b, ease)


def show(lay, t):
    """Hidden until t, then on (hard cut)."""
    key(lay, "opacity", 0, 0, HOLD); key(lay, "opacity", t, 100, HOLD)


def hide(lay, t):
    key(lay, "opacity", t - 1, 100, HOLD); key(lay, "opacity", t, 0, HOLD)


def enter_scene(g, dur=220):
    key(g, "opacity", 0, 0); key(g, "opacity", dur, 100)


def exit_scene(g, dur):
    key(g, "opacity", dur - 200, 100); key(g, "opacity", dur - 10, 0, EIO)


def snap_in(lay, t, cells=3, step=55, axis="positionX", sign=-1, cell=None):
    """Arrive in whole-cell jumps (hold keys)."""
    cell = cell or C
    i = 0 if axis == "positionX" else 1
    v = lay["transform"]["position"][i]
    for k in range(cells + 1):
        key(lay, axis, t + k * step, v + sign * (cells - k) * cell, HOLD)
    key(lay, "opacity", t, 0, HOLD); key(lay, "opacity", t + 1, 100, HOLD)


def typing(lay, full, t0, cps=40):
    script(lay, "textContent",
           f"var s={json.dumps(full)};var t=input.time.milliseconds-{t0};"
           f"if(t<0)return '';var n=Math.min(s.length,Math.floor(t*{cps}/1000)+1);return s.slice(0,n);")


def counter(lay, t0, t1, v1, fmt="{n}", v0=0, ease_out=True):
    """Count v0 -> v1 between t0..t1 (layer clock), with thousands commas. fmt e.g. '${n}/yr'."""
    pre, post = fmt.split("{n}")
    e = "p=1-Math.pow(1-p,3);" if ease_out else ""
    script(lay, "textContent",
           f"var p=Math.max(0,Math.min(1,(input.time.milliseconds-{t0})/{max(1, t1 - t0)}));{e}"
           f"var v=Math.round({v0}+({v1}-{v0})*p);var z=String(v);if(v>=1000)z=z.slice(0,z.length-3)+','+z.slice(z.length-3);"
           f"if(v>=1000000)z=z.slice(0,z.length-7)+','+z.slice(z.length-7);"
           f"return {json.dumps(pre)}+z+{json.dumps(post)};")


def stepped(lay, prop_text_pairs):
    """textContent switches at times: [(t, 'text'), ...]."""
    script(lay, "textContent", "var t=input.time.milliseconds;var s=" + json.dumps(prop_text_pairs) + ";var v=s[0][1];"
           "for(var i=0;i<s.length;i++){if(t>=s[i][0])v=s[i][1];}return v;")


def scramble(lay, full, t0, per=26, settle=280, step=50):
    """Characters appear left to right as random glyphs of the same class, then lock to `full`."""
    script(lay, "textContent",
           f"var s={json.dumps(full)};var t=input.time.milliseconds-{t0};if(t<0)return '';"
           "var U='ABCDEFGHJKLMNPQRSTUVWXYZ0123456789',Lw='abcdefghjkmnpqrstuvwxyz',D='0123456789';"
           f"var f=Math.floor(t/{step});var o='';"
           "for(var i=0;i<s.length;i++){"
           f"var a=i*{per};if(t<a)break;var c=s.charAt(i);"
           f"if(t>=a+{settle}||' .,?!+-/:$&'.indexOf(c)>=0){{o+=c;continue;}}"
           "var h=(i*131+f*977+(i+3)*(f+5)*37)%9973;"
           "var set=(c>='0'&&c<='9')?D:(c>='a'&&c<='z')?Lw:U;o+=set.charAt(h%set.length);}"
           "return o;")


def decode_text(name, s, x, y, font, size, color, t0, tracking=0, just="left", **kw):
    """text() + scramble() in one call."""
    lay = text(name, s, x, y, font, size, color, tracking, just)
    scramble(lay, s, t0, **kw)
    return lay


def redact(lay, t_cover, t_lift, bar=None, pad=8):
    """A bar sweeps over a text line, then lifts left-to-right to reveal it. Returns [bar, text]."""
    s = lay["sourceText"]; size = s["fontSize"]
    fk = next(k for k, v in FONTS.items() if v[0] == s["fontFamily"] and v[1] == s["fontStyle"])
    w = measure(s["text"], fk, size, s["tracking"])
    x, y = lay["transform"]["position"]
    if s["justification"] == "right": x -= w
    elif s["justification"] == "center": x -= w / 2
    bw = w + pad * 2
    b = rect(f"{lay['name']} redaction", x - pad, y - size * 0.80, bw, size * 1.04, bar or INK, r=2)
    key(b, "scaleX", t_cover, 0); key(b, "scaleX", t_cover + 160, 100, EO)
    key(b, "positionX", t_lift, x - pad); key(b, "positionX", t_lift + 320, x - pad + bw, EIO)
    key(b, "scaleX", t_lift, 100); key(b, "scaleX", t_lift + 320, 0, EIO)
    key(lay, "opacity", 0, 0, HOLD); key(lay, "opacity", t_cover + 150, 100, HOLD)
    return [b, lay]


# ---------- composite helpers ----------
def pill(name, s, x, y, h, fill, color, font="bodym", size=24, pad=26, icon=None, stroke=None):
    """Rounded pill with text (+ optional icon(cx, cy) -> layers). Returns (layers, width)."""
    iw = h * 0.75 if icon else 0
    w = measure(s, font, size) + pad * 2 + iw
    bg = rect(f"{name} bg", x, y, w, h, fill, r=h / 2, stroke=stroke, sw=1.5 if stroke else 0)
    parts = [text(name, s, x + pad + iw, y + h / 2 + size * 0.36, font, size, color), bg]
    if icon: parts = icon(x + pad + h * 0.25, y + h / 2) + parts
    return parts, w


def offset(layers, dx=0, dy=0):
    for p in layers:
        p["transform"]["position"][0] += dx; p["transform"]["position"][1] += dy
    return layers


def tokens_line(name, toks, x, y, size=24, font="mono"):
    """Syntax-coloured code line: toks = [(text, color), ...]."""
    out, cx = [], x
    for i, (s_, c_) in enumerate(toks):
        out.append(text(f"{name} {i}", s_, cx, y, font, size, c_)); cx += measure(s_, font, size)
    return out


def logo_lockup(x, y, tile=64, tile_color=None, word_color=None, font="head"):
    """Graphed tile + mark + wordmark. Needs asset id 'graphed-logo' (rebuild.sh imports it)."""
    tile_r = rect("Logo tile", x, y, tile, tile, tile_color or INK, r=tile * 0.24)
    mark = image("Graphed mark", "graphed-logo", x + tile / 2, y + tile / 2, 160, tile * 0.78 / 160 * 100)
    word = text("Graphed wordmark", "Graphed", x + tile + 18, y + tile * 0.70, font, tile * 0.62, word_color or INK, -10)
    return [word, mark, tile_r]


class Thread:
    """Chat thread that auto-scrolls: messages stack top-down; the column shifts up when
    content passes `bottom`. Put an opaque mask rect above `top` (and an input bar below
    `bottom`) higher in the layer list so scrolled content hides under them."""
    def __init__(self, name, top, bottom, gap=18):
        self.name, self.top, self.bottom, self.gap = name, top, bottom, gap
        self.y, self.msgs, self.shifts = 0, [], []

    def add(self, name, parts, h, t):
        g = group(f"{self.name} · {name}", 0, None, parts)
        y = self.y
        g["transform"]["position"] = [0, y]
        key(g, "opacity", t, 0); key(g, "opacity", t + 200, 100, EO)
        key(g, "positionY", t, y + 22); key(g, "positionY", t + 380, y, EO)
        self.msgs.append(g)
        self.y += h + self.gap
        self.shifts.append((t, max(0, self.y - self.gap - (self.bottom - self.top))))
        return g

    def build(self, dur):
        col = group(f"{self.name} column", 0, dur, self.msgs[::-1])
        prev = 0
        key(col, "positionY", 0, self.top)
        for t, over in self.shifts:
            if over != prev:
                key(col, "positionY", t - 1, self.top - prev); key(col, "positionY", t + 380, self.top - over, EIO)
                prev = over
        return col


def bubble(s, side, x0, x1, fill, color, font="body", size=30, maxw=700, r=22):
    """Chat bubble for Thread.add. side='left' starts at x0, 'right' ends at x1. Returns (layers, height)."""
    lines = wrap(s, font, size, maxw - 48)
    w = max(measure(l_, font, size) for l_ in lines) + 48
    h = size + 42 * len(lines) + 4
    bx = x0 if side == "left" else x1 - w
    parts = [text(f"Bubble line {i}", l_, bx + 24, size + 20 + i * 42, font, size, color) for i, l_ in enumerate(lines)]
    return parts + [rect("Bubble", bx, 0, w, h, fill, r=r)], h


# ---------- time ----------
class Beats:
    """Beat grid + scene windows. Scenes start on beats: Beats(469.8, [0, 10, 28, ...])."""
    def __init__(self, period_ms, scene_beats):
        self.P, self.SB = period_ms, scene_beats
        self.S = [self.bt(k) for k in scene_beats[:-1]]
        self.D = [self.bt(scene_beats[i + 1]) - self.bt(scene_beats[i]) for i in range(len(scene_beats) - 1)]
        self.TOTAL = self.bt(scene_beats[-1])

    def bt(self, k): return int(round(k * self.P))
    def lb(self, sc, k, ms=0): return self.bt(self.SB[sc] + k) - self.S[sc] + ms   # scene-local time of beat k
    def pt(self, sc, k, ms=0): return self.bt(self.SB[sc] + k) + ms                 # project time of beat k


# ---------- audio ----------
AUDIO = []
SFXDUR = {"air-whoosh": 500, "soft-tap": 100, "dry-click": 65, "clear-ping": 480, "soft-impact": 400, "soft-pop": 180}


def sfx(name, at, vol):
    """Project-time SFX (asset ids sfx-<name>, imported by rebuild.sh). vol ~0.25-0.7."""
    AUDIO.append(audio(f"SFX {name} @{int(at)}", f"sfx-{name}", int(at), SFXDUR[name], round(vol * 1.5, 3)))


def media_ms(path):
    """Duration of a media file in ms (ffprobe)."""
    import subprocess
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return int(float(out.strip()) * 1000)


def music(src0_ms, total_ms, vol=0.42, intrinsic_ms=None, fade_out=1800, fade_in=0, asset="music", path=None):
    """Music bed starting at source time src0_ms (assets/music.mp3). Mapping output is on the SOURCE clock."""
    intrinsic_ms = intrinsic_ms or media_ms(path or os.path.join(ROOT, "assets/music.mp3"))
    assert src0_ms + total_ms <= intrinsic_ms, f"music too short: needs {src0_ms + total_ms} ms, track is {intrinsic_ms} ms"
    m = audio("Music", asset, 0, total_ms, vol)
    m["sourceRange"] = {"start": src0_ms, "duration": total_ms}
    m["playback"]["mapping"]["output"]["start"] = src0_ms
    m["sourceIntrinsicDuration"] = intrinsic_ms
    fi = f"if(t<{fade_in})return g*t/{fade_in};" if fade_in else ""
    script(m, "volume", f"var t=input.time.milliseconds;var g={vol};{fi}"
                        f"if(t>{total_ms - fade_out})return g*Math.max(0,({total_ms}-t)/{fade_out});return g;")
    return m


# ---------- output ----------
def dynamics():
    entries = []
    for (lid, prop), ks in KEYS.items():
        ks = sorted(ks, key=lambda k: k[0])
        seen = set(); kf = []
        for i, (t, v, e) in enumerate(ks):
            assert t not in seen, f"duplicate keyframe time {t} on layer {lid} {prop}"
            seen.add(t)
            kf.append({"id": f"k{lid}-{prop}-{i}", "layerTime": t,
                       "value": {"type": "float", "value": float(v)}, "easing": e})
        entries.append({"target": {"kind": "layer", "layerId": lid, "propertyType": prop},
                        "animator": {"type": "keyframes", "enabled": True, "keyframes": kf}})
    return entries + SCRIPTS


def write_doc(name, layers, total_ms, background, music_layer=None):
    """Fill open durations, append music + SFX, and write .tesseract-work/editable.json."""
    for g in layers:
        if g["type"] == "Group":
            fill_durations(g["layers"], g["playback"]["inputRange"]["duration"])
    layers = layers + ([music_layer] if music_layer else []) + AUDIO
    doc = {"$schema": "https://jerboa.dev/schemas/fx-composition/editable/v1/document.schema.json",
           "formatVersion": 1, "dimensions": {"width": W, "height": H}, "duration": total_ms / 1000,
           "backgroundColor": background,
           "composition": {"id": "main", "name": name, "layers": layers, "dynamics": {"entries": dynamics()}}}
    out = os.path.join(ROOT, ".tesseract-work/editable.json")
    json.dump(doc, open(out, "w"), indent=1, ensure_ascii=False)
    print("wrote", out, "duration", total_ms / 1000, "s;", len(KEYS) + len(SCRIPTS), "animated properties")
    return out
