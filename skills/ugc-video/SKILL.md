---
name: ugc-video
description: Turn a script into a finished UGC talking-head video ad (vertical 1080x1920 MP4, no captions). The bundled avatar's cloned voice reads the script (fal MiniMax TTS via the Graphed CLI), Seedance 2.5 renders her talking to that MP3 (kie via the Graphed CLI, 480p), then local whisper checks every word against the script and local ffmpeg fixes mistakes without a re-render — wrong words are spliced in from the MP3, stutters are cut out as jump cuts — and upscales with a no-AI resize + grain. About $4.80 of Graphed credits per 30 seconds. Use when the user gives a script and asks for a UGC video, a talking-head ad, an avatar video, or a testimonial-style clip, or runs /ugc-video.
argument-hint: "<script text or .txt> [--avatar <name>] [--caps Brand1,Brand2]"
---

# ugc-video

Script in, finished vertical UGC ad out. Paid steps run through the Graphed CLI; everything else runs on the
user's machine (ffmpeg, whisper.cpp).

```bash
python3 <skill-dir>/scripts/make_ugc.py --script script.txt --dry-run     # length, cost, prompt — no spend
python3 <skill-dir>/scripts/make_ugc.py --script script.txt               # full run, 5–10 min
```

`<skill-dir>` is the folder this SKILL.md is in. Output: `./ugc-videos/<slug>/<slug>.mp4`.

## Workflow

1. **Write the script clean.** Periods, commas, question marks and apostrophes only — **no quotation marks**
   (the script removes any it finds). Numbers can be digits; they are spelled out for speech
   (`24/7` → twenty-four seven, `2am` → two a.m., `9:45 p.m.` → nine forty-five p.m.). Write `twelve hundred
   dollars` if that is how it should be said; `$1,200` is read "one thousand two hundred dollars".
2. **Dry run first, always.** Tell the user the word count, the expected length and the cost. Over ~110 words
   is tight; over ~115 does not fit 30 s — show them what to cut. If `python3` is missing, show `brew install python`
   and wait — the dry run cannot start without it. If ffmpeg or whisper is missing, the dry run lists those
   install commands first. Show those to the user and wait. Do not add `--no-fix` yourself. That flag
   is only after the user says to skip the word check.
3. **Run for real in the background** (5–10 min).
4. **Read the end of the output.** It lists every fix (`fixed:` / `cut:`) and anything **NOT FIXED** with its
   time in the video. Tell the user exactly where to listen.
5. **Never re-render on your own.** If something is not fixed, tell the user the spot, the reason, and the
   cost of a new take (~470 credits / 30 s). Run `--rerender` **only if they say yes**. It keeps the old take
   and reuses the same MP3.
6. Hand over `ugc-videos/<slug>/<slug>.mp4`. Upload that file to the project and record the key. See [Find them later](#find-them-later).

If the user has more than one Graphed account or project, the script stops and lists them; ask, then pass
`--account` / `--project`. The choice is remembered in `~/.config/graphed/ugc-video.json`.

## What the script does

| # | Step | Where | Cost |
|---|---|---|---|
| 0 | Preflight: Graphed CLI logged in, `ffmpeg`, `whisper-cli`, whisper model. Prints install commands for anything missing | local | free |
| 1 | Quotes removed, numbers spelled out, word count + length + cost estimate | local | free |
| 2 | MP3: `fal:fal-ai/minimax/speech-02-hd` with the avatar's cloned voice, speed 1.0 | Graphed | ~7 credits |
| 3 | Fit: pauses over 0.3 s trimmed to 0.25 s, then `atempo` to ≤ 29.0 s (limit 1.10×). Over the limit it stops and says how many words to cut | local ffmpeg | free |
| 4 | Seedance: `kie:bytedance/seedance-2-5`, 480p, 9:16, `[Image1]` = avatar still, `[Audio1]` = the MP3, `generate_audio: true`, duration = MP3 length rounded up. Prompt: `prompts/seedance.txt` | Graphed | ~16 credits/s |
| 5 | Check: local whisper on the render and on our MP3, compared with the script | local whisper | free |
| 6 | Fix: wrong word → same word spliced from the MP3 (video untouched). Stutter / extra words → cut from video + audio as a jump cut. Each fix is tried at several timings and kept only if a whole-file transcript then reads right | local | free |
| 7 | Upscale: `resize-grain.sh` (Lanczos + light sharpen + phone grain) to 1080x1920 | local ffmpeg | free |

Steps are resumable: an existing `voice.mp3` or `raw-480p.mp4` in the output folder is reused.

## Rules (learned from test runs, Oct 2026)

- **Seedance never plays back the MP3.** It makes its own read, guided by the MP3's voice and timing, and her
  lips match its own read. That is why the final audio is Seedance's, patched, and not the MP3 laid on top.
- **No pronunciation hints in the prompt.** A spelled hint ("S-L-ack") was read aloud as a stutter, "SL Slack".
  Hints did not reduce mistakes either. The prompt only says to say every word as written.
- **No quotation marks in the script.** The dialogue is already inside quotes in the prompt.
- `--caps Brand1,Brand2` writes those names in caps in the Seedance dialogue only (the MP3 text stays normal).
  Optional; it was used in the clean test runs.
- **Whisper spellings are not errors.** Whisper writes "Klaviyo" as "Clavio" and "focaccia" as "facaccia" in our
  own MP3 too; the check only flags a word when the render is heard differently from the MP3.
- **Cut times come from short clips, never the full file.** whisper.cpp word times drift up to ~0.5 s over a
  long file, by a different amount in each track. The fixer times every cut on ~3.5 s clips and tries several.
- **Run locally.** ffmpeg and whisper run on the user's machine. If either is missing, the dry run and a real
  run print the install command. Show that to the user and let them install it. `--no-fix` skips the word
  check only after they ask, or when Whisper is installed and too slow. A slow machine can instead transcribe
  with `graphed tools run fal:fal-ai/whisper` (`chunk_level: "word"`, under 1 credit per clip).

## Avatars

Each folder in `avatars/` is one speaker:

| File | Purpose |
|---|---|
| `avatar.jpg` | The still — Seedance `[Image1]` |
| `avatar.json` | `voice_id` (fal MiniMax clone), `speaker` (prompt line), persona notes |
| `voice-ref.mp3` | The sample the voice was cloned from |
| `legacy-voice.mp3` | Pronunciation guide for the old `--engine avatar` path only |

| Avatar | Who |
|---|---|
| `latina-kitchen` (default) | Woman in her 30s, long wavy dark hair, black polo, restaurant back kitchen, selfie angle |

**Voice clone expiry:** MiniMax deletes a cloned voice that is not used for about 7 days. If the TTS step fails
on the voice id, run `make_ugc.py --clone-voice` (about 172 credits). It clones `voice-ref.mp3` again and
saves the new id in `avatar.json`.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--script` | required | A .txt path or the text itself |
| `--dry-run` | off | Length, cost and the full prompt; no upload, no spend |
| `--avatar` | latina-kitchen | Folder in `avatars/` |
| `--caps` | none | Brand names to write in caps in the Seedance dialogue |
| `--slug` / `--out-dir` | first words / `./ugc-videos` | |
| `--rerender` | off | New Seedance take with the same MP3. **Only after the user says yes** |
| `--no-fix` | off | Skip the whisper check. Only if the user asks, or Whisper is installed and too slow |
| `--no-upscale` | off | Stop at 480p |
| `--clone-voice` | — | New voice id from `voice-ref.mp3` |
| `--engine avatar` | seedance | The old `graphed:ugc.avatar` path (`scripts/legacy_avatar.py`, takes `--brand`) |
| `--account` / `--project` | auto | See above |

## Output (`ugc-videos/<slug>/`)

`<slug>.mp4` (final, 1080x1920) · `raw-480p.mp4` (Seedance take) · `fixed-480p.mp4` · `voice.mp3` (the fitted
MP3) · `script.txt` · `script-spoken.txt` · `check.json` (splices, cuts, and anything not fixed) ·
`seedance.body.json` · `tts.body.json`. A re-render keeps the old take as `raw-480p-take<n>.mp4`.

## Find them later

The script uploads the voice and the still so Seedance can fetch them. It does not upload the finished MP4, and project storage does not list files. A later system on this project can open the video only if the finished file is uploaded and the project's Postgres has the storage key.

After the MP4 is written:

1. `graphed storage upload ugc-videos/<slug>/<slug>.mp4 ugc-video/<slug>/<slug>.mp4 --account <account> --project <project> --content-type video/mp4`
2. `graphed databases list --account <account> --project <project>`.
3. No database: add this to that project's `graphed.yaml`, tell the user, then deploy so the database is created. If you do not have the project files, stop and give them the storage key.

```yaml
databases:
  primary:
    env: DATABASE_URL
```

4. If a database exists, find the table that already holds ad creatives. `graphed databases query` is read-only:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position
```

Use the table that has `storage_key`. That column is the file name in project storage. If more than one table has it, ask which one holds ad creatives. Insert the finished MP4 into that table, filling the columns it already has, including `storage_key` (`ugc-video/<slug>/<slug>.mp4`). Do not create a second table. Do not record the voice or the still.

5. If the database has no such table, create `skill_asset` and insert there. Create and insert with `graphed exec` after the project has a successful deploy (`DATABASE_URL` is set there). `graphed databases query` cannot write.

```sql
create table if not exists skill_asset (
  storage_key text primary key,
  kind text not null,
  filename text not null,
  content_type text,
  created_at timestamptz not null default now()
);
```

One row for the finished MP4. `kind` is `ugc-video`. `filename` is `<slug>.mp4`. `content_type` is `video/mp4`. Skip a key that is already stored.

A later system reads the row and downloads that key. It does not scan the file store.

## Requirements

| Need | Install |
|---|---|
| Graphed CLI, logged in, with credits | `npm install -g @graphed-inc/cli` · `graphed login` |
| Python 3 | `brew install python` if `python3` is missing. No extra packages |
| ffmpeg + ffprobe | `brew install ffmpeg` |
| whisper.cpp | `brew install whisper-cpp` |
| whisper small model | `mkdir -p ~/whisper-models && curl -L -o ~/whisper-models/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin` (466 MB; another path via `WHISPER_MODEL`) |

## Known limits

- Rare brand names are the weak spot (Seedance said "Calendly" wrong 3 times out of 3 in tests). The fixer
  usually splices them; check `check.json` and listen.
- About 1 take in 4 needs a fix. A fix that does not read right is not used; that spot is reported instead.
- A jump cut removes up to ~1 s of video; listen to the join.
- Cost estimate: Seedance ~16 credits per second at 480p (1 credit = 1 cent) — about $4.80 for 30 s.
  Not yet checked against billed runs.
- Planned: WhisperX (forced alignment) for exact word times.
