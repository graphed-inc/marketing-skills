# Music library (`assets/music/`)

These are original instrumental tracks generated for this skill (Suno, via Graphed
Tools / Kie). They replace an earlier set that was not cleared to ship. Grids
below are from `scripts/beats.py`. They are not confirmed by listening: say so
in NOTES.md and ask the user to check sync with sound.

In-points in this table are for these files. Timestamps in `catalog.md` belong
to the previous library. Do not copy those onto a new video.

| Track | Beat | Phase | Character | Good in-points (drop lands on beat 4) | Used by |
|---|---|---|---|---|---|
| `id700.mp3` | 695.7 ms (86.2 bpm) | 97 ms (strength 1.28) | playful hip-hop drums and bass | lift 56.448 s → start 53.665 s; lift 11.923 s → start 9.141 s | kill-your-clay, seedance-tesseract, grok-loadout |
| `minimal-techno-01.mp3` | 462.6 ms (129.7 bpm) | 333 ms (strength 1.25) | steady techno, kick returns after a dip | kick returns 14.673 s → start 12.823 s; lift 29.939 s → start 28.089 s | graphed-no-looker |
| `dub-techno-groove.mp3` | 491.0 ms (122.2 bpm) | 195 ms (strength 1.40) | dubby, kick lifts out of a quieter bar | lift 31.128 s → start 29.164 s; lift 14.925 s → start 12.961 s | ad-spy-dossier, fb-token-key |
| `minimal-emotion.mp3` | 462.4 ms (129.8 bpm) | 121 ms (strength 1.33) | warm minimal, kick returns after a breakdown | lift 31.564 s → start 29.715 s; lift 16.305 s → start 14.456 s | tam-radar, gads-changelog |
| `deep-techno-ambience.mp3` | 481.1 ms (124.7 bpm) | 202 ms (strength 1.45) | steady, a quiet open then the kick stays | lift 13.673 s → start 11.748 s; lift 60.339 s → start 58.415 s | seo-clone, multiplayer-cloud |
| `machine-drum-vibes.mp3` | 409.4 ms (146.6 bpm) | 406 ms (strength 1.29) | syncopated drums, quiet then a ramp | lift 38.889 s → start 37.252 s; lift 11.869 s → start 10.231 s | agency-floorplan, ads-to-cold-list |

## Rules
- Every scene starts on a beat. Hit the hook's key line on the drop (beat 3 or 4, ≈ 1.9–2.1 s).
- Prefer an unused track or an unused section; check the "Used by" column.
- Weak-grid tracks (strength < 1.25) are out. These six clear that bar.
- Music volume ~0.36–0.5 linear; SFX vol 0.22–0.7 (sfx() multiplies by 1.5). Target ≈ −14 to −16 LUFS integrated, peak < −1 dBFS (export.sh prints both).
- Fade out the last 1.8 s (music() does). The track must be long enough: music() asserts it.
- New tracks: drop an mp3 into `assets/music/`, run beats.py, confirm drops with `--zoom`, add a row here.
