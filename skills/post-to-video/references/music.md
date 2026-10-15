# Music library (`assets/music/`)

Grids measured with `scripts/beats.py` and checked by hand on earlier videos. Not confirmed by
listening: always say so in NOTES.md and ask the user to check sync with sound.

| Track | Beat | Phase | Character | Good in-points (drop lands on beat 4) | Used by |
|---|---|---|---|---|---|
| `id700.mp3` (user-supplied) | 700 ms (85.7 bpm) | beats at 0.38 + k·0.7 s | hip-hop groove, playful; two big drops after breaks | drop 40.18 s → start 38.08 s (or 40.15 to hit frame 1); drop 164.18 s → start 162.08 s (beat 3) | kill-your-clay, seedance-tesseract, grok-loadout |
| `minimal-techno-01.mp3` | 469.8 ms (127.7 bpm) | 236 ms | steady techno, one breakdown 41–45 s | kick returns 44.87 s → start 42.988 s | graphed-no-looker |
| `dub-techno-groove.mp3` | 488.9 ms (122.7 bpm) | 96 ms | dubby, hats-only build 27–31 s | drop 31.386 s → start 29.430 s | ad-spy-dossier, fb-token-key (@ 60.720 s, kick returns 62.675 s) |
| `minimal-emotion.mp3` | 469.8 ms (127.7 bpm) | ~32 ms | warm minimal; soft sections at 28–30 s and 55–60 s | lift 30.10 s → start 28.222 s; lift 60.17 s → start 58.288 s | tam-radar, gads-changelog |
| `deep-techno-ambience.mp3` | 481.1 ms (124.7 bpm) | kicks at 119 ms (zoom-confirmed; beats.py says 239 = a quarter-beat late) | steady, no drop; good for a calm explainer | any kick, e.g. 48.229 s (kick 100); 19.444 s | seo-clone, multiplayer-cloud |
| `machine-drum-vibes.mp3` | 411.9 ms (145.7 bpm) | 23 ms (strength 1.71) | quiet syncopated drums (RMS ~0.12; vol 0.85 gives -15.7 LUFS, peak -1.2 dBFS, vol 1.0 clipped at +0.5 dBFS); ramps up from silence | hit 36.271 s → start 34.623 s; lift ~24.0 s → start 22.266 s | agency-floorplan, ads-to-cold-list (@ 22.266 s, vol 0.8) |

## Rules
- Every scene starts on a beat. Hit the hook's key line on the drop (beat 3 or 4, ≈ 1.9–2.1 s).
- Prefer an unused track or an unused section; check the "Used by" column.
- Music volume ~0.36–0.5 linear; SFX vol 0.22–0.7 (sfx() multiplies by 1.5). Target ≈ −14 to −16 LUFS integrated, peak < −1 dBFS (export.sh prints both).
- Fade out the last 1.8 s (music() does). The track must be long enough: music() asserts it.
- New tracks: drop an mp3 into `assets/music/`, run beats.py, confirm drops with `--zoom`, add a row here.
