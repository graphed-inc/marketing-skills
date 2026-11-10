---
name: ugc-studio
description: "Deploy UGC Studio, a hosted HeyGen-style app on Graphed, for making talking-head UGC video ads at scale. Campaigns are grids: rows are scripts, columns are avatars, and each cell is one vertical 1080x1920 clip. Pick cells and render them all in parallel. 65 built-in avatars share one cloned voice, and users can upload their own. \"Write from website\" reads the user's site, pulls their buyers' pain points and desired outcomes from Reddit, and writes 10 scripts. Every clip is checked word by word against the script and fixed without a re-render. Every vendor call goes through Graphed Tools (fal MiniMax TTS, kie Seedance 2.5, graphed:transcription, ScrapeCreators Reddit) and the Graphed LLM proxy, billed in Graphed credits, about $4.80 per 30 seconds of video. By default ask for the user's website, deploy, and write the first scripts from the terminal. Never render before the user approves the cost. Use when the user wants UGC video ads, avatar or talking-head videos, a HeyGen alternative, many ad variations across scripts and avatars, or invokes /graphed:ugc-studio."
argument-hint: "[website, e.g. \"https://acme.com\" | a script to render]"
---

# UGC Studio

A HeyGen-style app the agent deploys into the user's own Graphed project. A Next.js app serves the page and the
JSON API, and the render worker starts in that same server. Postgres holds avatars, scripts, campaigns and videos;
project object storage holds every file. The page is private behind the Graphed gateway (graphed.com login).

```bash
bash <skill-dir>/scripts/deploy.sh --account <act_…>            # deploy or update (apps/ugc-studio in the cwd)
graphed exec --project ugc-studio --account <act_…> -- node cli.mjs status
graphed exec --project ugc-studio --account <act_…> -- node smoke.mjs   # cloud check, no spend
```

Find the account id with `graphed --format json accounts list`. Installing the skill copies files without the
executable bit, so run `bash <skill-dir>/scripts/deploy.sh` (a bare `./deploy.sh` is Permission denied). It copies
`<skill-dir>/app/` to `apps/<slug>/`, runs the offline tests, and deploys. Re-running it updates the same project; the data stays.
Flags: `--slug`, `--name`, `--dir`, `--dry-run`.

## Default run

1. Ask for the user's website (and, if they have one, a script they already want to render).
2. Deploy. Give the user the URL.
3. Write the first scripts from the terminal, not the page:
   `node cli.mjs research <url> --n 10` (about 25-40 credits, 3-6 minutes). Watch it with `node cli.mjs project <id>`.
   Show the user the pains it found and the 10 scripts.
4. Estimate before any render: `node cli.mjs estimate --scripts <ids> --avatars <ids> --pair all`. Tell the user the
   clip count, the credits (1 credit = 1¢) and the time. **Render only after they say yes**:
   `node cli.mjs render … --yes`. A first test of 1-3 short clips is a good start.
5. When the clips finish, send the links (`node cli.mjs videos <batch>`), and say which clips have a word to listen to.

The user can do all of this on the page too: open a campaign, "+ Scripts" or "Write from website", "+ Avatars",
pick cells, press Generate (it shows the dollar cost and asks to confirm).

## The page

shadcn/ui tokens, orange skin, light only. A sidebar (Outputs, Avatars, Scripts, then the Campaigns list and
New campaign), a topbar, a toolbar, one scroll area and a footer. Hash routes: `#/campaign/<id>`, `#/outputs`,
`#/avatars`, `#/scripts`.

1. **Campaign**. Rows = scripts, columns = avatars, cell = the latest clip for that (script, avatar)
   pair from any campaign.
   - Rows: "+ Scripts" (paste, `---` between scripts, or pick saved ones) or "Write from website" (the 10 new scripts
     land as rows). Columns: "+ Avatars" (a sheet with the avatar grid, person filter, "Pick all shown", "Upload new").
   - Select: an empty cell, a script's checkbox (the row), an avatar header (the column), or "Select all empty".
     Too-long scripts and cells that already have a clip cannot be selected.
   - "Generate N · $X" estimates the pairs (`POST /api/estimate {pairs}`), asks to confirm, and queues them
     (`POST /api/videos {pairs, board_id, confirm: true}`). 100 clips per batch at most.
   - Cells show progress and time left, the poster, "Listen" (a word the fixer could not repair), "Take failed",
     "Failed". Click a clip to play, download, take again, retry or delete.
2. **Outputs:** every clip as 9:16 poster cards, filters Done / Rendering / Failed, avatar, campaign, search.
3. **Avatars:** the library, person filter, Add avatar (a 9:16 selfie photo plus a "who they are" line the script
   writer uses), click to edit or remove.
4. **Scripts:** every saved script, search, New script, Write from website, "+ Campaign".

Every grid is virtualized: only the cards and cells on screen exist in the DOM. Images and videos load straight
from api.graphed.com with presigned links; the app never streams media bytes. Grids show small poster and thumb
JPEGs, made at render, upload and seed time (and backfilled on boot).

## Terminal (`graphed exec --project <slug> -- node cli.mjs …`)

| Command | What it does |
|---|---|
| `status` | Queue counts, research in progress |
| `avatars` | Avatar ids + the voice |
| `research <url> [--n 10] [--styles story,hook] [--avatar <id>]` | Queue website research + scripts |
| `projects` / `project <id>` | Research results, pains, scripts with their ids |
| `scripts <projectId> --more 10` | Write more scripts |
| `estimate --scripts 1,2 --avatars 1,2 [--engine kling] [--pair all]` | Length + credits, no spend |
| `render … --yes` | Queue the videos. **Only after the user approves the estimate** |
| `videos [batch]` / `video <id>` | Progress, playable links, words that are NOT FIXED, the log |
| `retry <id>` / `cancel <id>` | Resume a failed video / stop one |

`graphed exec` can drop the output of a process that exits at once; `cli.mjs` waits 2 s before it exits. In your own
`node -e` checks, end with `setTimeout(() => process.exit(0), 3000)`.

## How a clip is made

1. Spoken text: quotes removed, numbers spelled out (`engine/spoken.py`). About 105 words fit 30 s.
2. Voice: `fal:fal-ai/minimax/speech-02-hd` with the shared cloned voice (`voices.default`).
3. Fit: pauses over 0.3 s trimmed, `atempo` up to 1.10× to fit ≤29 s.
4. Take: `kie:bytedance/seedance-2-5` at 480p, the avatar photo + the voice MP3 as references (`prompts/seedance.txt`).
   `--engine kling` uses `kie:kling/ai-avatar-standard` at 720p (lip-syncs the MP3, no word check needed).
5. Word check + fix: `engine/fix_words.py` transcribes the take with `graphed:transcription` word timestamps, splices
   wrong words in from the MP3 and cuts stutters as jump cuts. A take where
   more than 20% of the script is still wrong is marked "Take failed" instead of done; a new take usually reads right.
6. Finish: Lanczos resize + light sharpen + phone grain to 1080x1920 (no AI, the face is not retouched).

Each step saves its file in project storage (`videos/<id>/…`), so a restart resumes, and paid calls use idempotency
keys, so a replay is free. "Try again" resumes; "New take" costs a full render.

## Costs

| Step | Credits |
|---|---|
| Seedance 2.5, 480p | ~16 per second of video (30 s ≈ 483, $4.83) |
| Voice | ~0.01 per character |
| Word check | `graphed:transcription`, about 0.14 credits per second of audio. A clean clip transcribes the take and the voice; each fix transcribes a short window |
| Write from website | ~25-40 per website (about 8 Reddit calls + the LLM) |
| Clone the voice again | ~172 (ask first) |

## Limits and gotchas

- **The container has 0.5 CPU and 512 MB.** Paid renders run 10 at a time (`VIDEO_LANES`); ffmpeg and the fixer run
  one job at a time (`HEAVY_LANES`). 10 clips take about 30-50 minutes; 65 ten-second clips took about 3.5 hours.
- **Presigned links can live 1 hour at most.** The storage gateway answers 403 "Invalid presigned URL expiration" for
  longer ones, and kie rejects the audio with `Invalid value for parameter: content[2].audio_url.url`. Pages reload
  their lists every 10 minutes. The gateway ignores `response-content-disposition`, so Download fetches the link
  (CORS `*`) and saves the file under the avatar's name.
- **Uploads use one PutObject up to 64 MiB.** The gateway's UploadPart response has no ETag, so multipart fails.
- **Do not use `bytedance:seedance-2-5`** (the direct ModelArk tool) for avatars: it refuses reference images that show
  a real-looking face ("the input image 'content[1]' may contain real person"). Its fields are `image_urls`,
  `audio_urls` and `ratio`. Sent with kie's field names it does not fail: it ignores the photo and the voice and
  renders a paid text-to-video of a stranger.
- MiniMax deletes a cloned voice that is not used for about 7 days. If renders fail on the voice, ask the user, then
  `POST /api/voices/default/clone {confirm: true}` (the sample is `app/seed/voice-ref.mp3`).
- fal does not accept `data:` URLs (audio goes to storage first). The LLM proxy rejects some default User-Agents;
  the tool client sends its own. Scripts are written 5 per LLM call so the JSON is never cut.
- Built-in avatars come from `app/seed/avatars/<slug>/` (`avatar.jpg` + `avatar.json` with name, persona, tags,
  version). Each is added once on boot. A higher `version` swaps the photo on the same avatar row.

## Files

```
app/packages/dashboard/   Next.js page (React)
app/packages/core/src/    database (Kysely), worker, clip pipeline, JSON API
app/cli.mjs               terminal access
app/engine/               fix_words.py (word fixer), spoken.py
app/prompts/              script and shot prompts
app/seed/avatars/         built-in avatars
app/packages/core/src/ugc.test.ts   offline test with fake vendors (npm test)
app/uitest.mjs            the page in real Chrome (puppeteer-core)
app/smoke.mjs             cloud check, no spend
```

## Done

Reply with the app URL, the website you researched, the pains it found, and the script ids. If you rendered, give
each clip's link, status and any "Listen at" times, plus the credits spent.

## About Graphed

Graphed is a marketing cloud. It includes the infrastructure for an agent to do marketing: a data warehouse, data pipelines, a Postgres database, cron jobs, runtime servers, a tool catalog, custom domains, and internal app tooling.
