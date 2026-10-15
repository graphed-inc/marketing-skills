# Past post videos (don't repeat a visual system)

Each row is a finished project in `videos/<slug>/` with its own `.tesseract-work/build.py` and `NOTES.md`.
Read a build.py when you need a working pattern (listed in the last column).
Pick a visual system that is NOT in this table, and add a row when you finish.

| Slug | Post | Seed reading → visual system | Look | Music (in-point) | Reusable pattern |
|---|---|---|---|---|---|
| kill-your-clay | Kill your Clay subscription | (pre-skill, ref video) → invoices → terminal waterfall → receipt | white, Outfit/Inter/JetBrains, orange | id700 @ 41.0 s | terminal typing, cost counter, receipt + PAID stamp |
| seedance-tesseract | Seedance + Mirage Tesseract ads | "M9T3KQ2V" as a render job ID → printed job ticket | label stock, barcode, timecode, scramble-decode headlines, scanner sweep | id700 @ 40.15 s | `scramble()`, 120-tile grid fill + counter, manifest checklist |
| graphed-no-looker | Never touch Looker Studio | "B6G2E9J5" as grid coordinates → graph paper | lettered/numbered grid, crosshair selects a cell per cut, snap-in motion, plot through the coordinates | minimal-techno-01 @ 42.988 s | `snap_in()`, crosshair, line chart through points, mock report builder + click counter |
| ad-spy-dossier | Competitor ad spy tool | "Z7QM2R5H" as a case number → classified dossier | manila folder, Courier Prime, redaction bars lift, pinned evidence + string, stamps | dub-techno-groove @ 29.430 s | `redact()`, stamps, evidence string, SQL typing, polaroids |
| tam-radar | Stop paying Monaco $100k (TAM) | "N7KQ4R" as a tail number → air traffic control | chart paper, one radar scope sweeping across 7 steps, reframes FULL/LEFT/BIG, pings, flight strips | minimal-emotion @ 28.222 s | rotating sweep, contacts appear as sweep passes, persistent group reframed per scene |
| seo-clone | Clone ahrefs with Claude Code | random seed (first true one): "p2"+"hde" = hide on page 2, digit sum is a substring = join, 96=8×12 | one long page scrolling inside your own app, address bar, rank ruler with a "YOU" marker climbing #14→#1 | deep-techno-ambience @ 19.444 s (steady) | section scroll (snap), fixed chrome masks, joined-row table |
| grok-loadout v1 | Grok bot + marketing engineering | "vOv" face, "DnD" multiplayer, 4 clustered X → RPG loadout | gear slots, gems, quest log, legendary drop, XP bar | id700 @ 162.080 s (2nd drop) | slot grid, quest progress bars, level script |
| grok-loadout v2 | same, redesigned on request | matched the x.ai/bot design language | #0A0A0A, Geist, chat thread, bot sidebar with blob avatars, mascot with glancing eyes | id700 @ 162.080 s | `Thread` (auto-scroll chat), `bubble()`, Computer card Working→Done, mascot/blob faces |
| gads-changelog | Coding agent runs Google Ads, CPL $1,100→$250 | "007" = v0.0.7, "R2R"/"DID" palindromes → software changelog | light Google-Ads UI, red/amber from the account, version badge climbs | minimal-emotion @ 58.288 s | real chart redrawn natively from a screenshot (pixel → value), scorecard tiles, syntax-coloured code, commit log |

| multiplayer-cloud | Multiplayer marketing engineering: shared repo, auth, secrets, small cloud | no adjacent repeats = nothing collides; "pSp"+"pwp" chain = people linked through Shared; H and p tie at 6 → live multiplayer canvas | dot grid, six named cursors, presence stack 1→6 online, branch graph with a self-resolving conflict, 403 outsider, vault + FB account, cloud hub | deep-techno-ambience @ 48.229 s (steady) | `cursor()` with path + click rings, presence stack + `stepped()` count, branch polylines with trim + cursor following the tip |
| agency-floorplan | Google Ads agency replaced labor cost with Claude cost, 23 clients | digit sum = 100 → all of it; "HhH" → headcount shrinking; "43"×2 → 7 tools → agency floor plan | light architectural blueprint, title block, 7 rooms swap person → Claude terminal, 23 client rooms, persistent LABOR→CLAUDE cost meter | machine-drum-vibes @ 34.623 s (v2: 28.4 s, vol 0.85) | `door()` swings, `person()`/`terminal()` icons, room grid from rects, stepped meter in chrome |
| ads-to-cold-list | Run paid ads to your cold email list → one-call close | "HI" hidden in HJI/OIH → HELLO name sticker; lBl/uFu mirrored → you/them call tiles; 120 = 12×10 → touchpoint grid; 5 J's → 5 steps | warm paper, name-tag red, video-call window, sticker blank → written, 12×10 squares pop on the beat, footer touchpoint meter 1→85 | machine-drum-vibes @ 22.266 s (vol 0.8), v2 cut to 33 s | `badge()` sticker with typed name, `call_window()` mirrored tiles + speech bubble, beat-batched grid fill synced to a `stepped()` meter, countdown timer script |
| fb-token-key | Never-expiring Meta system user token → Claude Code bulk-uploads FB ads | 6 doubles = 6 cuts on a key; palindromes = never wears out → EXPIRES NEVER; hidden "ad" → ad grid | warm paper, brass key blank under every step, spinning cutter wheel cuts a V-notch per step on beat 4, 60-day calendar grid + TOKEN EXPIRED stamp, terminal prompt, 50-tile ads grid flipping live | dub-techno-groove @ 60.720 s | persistent object under every step (key + cutter), rotated-square notches, segmented control w/ sliding selection, strike-through draw-on, tile toggles + stepped live count |

## Rules from earlier cuts
- Use a shell-generated random string; mine it for subpatterns; never show it on screen.
- When the user names a design reference, match that look; keep the Graphed mark, and do not put a third-party logo on screen.
- Graphed CTA only when the post mentions Graphed.
- Light theme by default; dark only when the brief asks for it.
- **Pacing**: a 48 s cut feels slow. The recut that worked was about 28 s (items every 1–2 beats, tiles 40–110 ms apart). Aim for 25–35 s.
