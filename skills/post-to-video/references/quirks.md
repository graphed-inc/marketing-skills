# Renderer quirks and gotchas (tsrct 0.3.1)

Found while making the first 8 post videos. The library guards some of them; the rest are on you.

## Rendering

| Quirk | What happens | Do this |
|---|---|---|
| Opacity on a **Shape** layer | Keyframed/scripted `opacity` on `type: Shape` does not render. The shape stays fully visible. | Wrap the shape in `group(...)` and fade the group, or draw it as a `rect`/`circle` (Rect fades fine). `key()` prints a WARN. |
| Paint alpha on a **Shape** fill | `fill=[r,g,b,0.14]` renders opaque. | For a tint: Rect fill alpha works, or put the shape in a group with `transform.opacity` 14. |
| Long text lines **auto-wrap** | A point-text line wider than ~930 px wraps onto a second line (overlaps the next line). 902 px was fine, 947 px wrapped. | Keep every line ≤ 900 px: `fit(s, font, size, 900)`, `wrap(s, font, size, 880)`. `text()` prints a WARN. |
| Missing glyphs | Bundled Inter subset has no ✓ or →. Courier Prime has no →. No font here has ✓. | Use `check()` (a path) for ✓. Geist / Geist Mono have → … ·. Check with `has_glyphs(font, "→")`. |
| Text `y` | Text position is the **baseline**, not the top. | A 72 px headline at y=300 occupies ≈ y 245–315. |
| Layer order | `layers[0]` is the topmost layer. | Build lists top-first, or append and reverse `[::-1]`. Masks/headers must come BEFORE scrolling content. |
| Group clocks | Children of a group see time from 0 at the group's `start`. | Use `Beats.lb(scene, beat)` for scene-local times and `Beats.pt(...)` for project times (SFX). |
| Groups with `dur=None` | Fine. `fill_durations` sets them to the parent window. | Use `group(name, 0, None, layers)` for sub-groups. |
| Scale/rotate pivot | Groups scale around their anchor (default 0,0 = canvas corner). | `pivot(g, cx, cy)` or `rect(..., ax=w/2, ay=h/2)`. |
| JS in scripts | Plain ES5 works. `toLocaleString` is a risk. | Use `counter()` (manual comma formatting). Return a value on every path. |
| Duplicate keyframe time | `dynamics()` asserts. | Offset by 1 ms (`t + 1`), common with HOLD switches. |
| Clipping | No clip masks are used. | Hide scrolling content under opaque rects (header mask / input-bar mask), as in `Thread`. |

## Tooling

- **beats.py phase can sit on an off-beat** (deep-techno-ambience: a quarter beat late). Always run `--zoom` around the in-point and start on the bin where the kick energy jumps.
- **Keyframes at the same ms** (two path corners close together) trip the duplicate-key assert. Force increasing times (`max(t, prev + 1)`) when generating keys from geometry.
- **Shell**: the Bash tool runs zsh. `env.sh` handles both; `set -o pipefail` + `tr | head` exits 141 (SIGPIPE), so seed.sh ends that pipe with `|| true`.

- **ffmpeg overwrite prompt**: `ffmpeg -i in -f s16le out.raw` hangs forever if `out.raw` exists. Always pass `-y -nostdin` (beats.py does).
- **Export is slow**: ~60–80 s for 50 s of 1080x1350. Run it in the background and check it, or the 2-min Bash timeout kills it.
- **Font family names** come from `tsrct project import-font` output, not the filename. Geist Medium imports as family `Geist Medium`, style `Regular`. Courier Prime Bold imports as `Courier Prime` / `Bold`. `motion.FONT_FILES` already has the right pairs.
- **Cloudflare sites** (e.g. x.ai) block curl and WebFetch. Ask before opening a browser.
- **fontTools / numpy** live in the venv `scripts/setup.sh` creates. `source scripts/env.sh` sets `$PY`.
- The tesseract waveform helper needs ffmpeg `drawtext`, which this machine's ffmpeg lacks. Use `scripts/beats.py` instead.
