---
name: static-ads
description: Make on-brand static Meta ads for any company. Pull the brand's Ad Library ads and website style through the Graphed CLI, write a short ad style guide, come up with 5 static ad ideas aimed at gaps in their current ads, and generate them with GPT Image 2 (kie) through Graphed Tools. Use when the user pastes a brand URL or Ad Library link and asks for static ads, ad ideas, a brand or ad style guide, or to make ads with GPT Image.
argument-hint: "<brand url> [ad library url or page id]"
---

# static-ads

Brand URL → Ad Library page → style guide → 5 ideas → GPT Image 2 → crop to 1080×1350 → `~/Downloads/<slug>-ads/` and the Graphed project.

## Account and project

Use the person logged into the Graphed CLI. Do not hardcode an account id or a project slug.

- One account: use it. More than one: ask which account, then pass `--account`.
- One project on that account: use it. More than one: ask which project, then pass `--project`.
- `generate.sh` remembers the last account and project in `~/.config/graphed/static-ads.json` and uses them next time.
- To use a different one, pass `--account` and `--project`, or set `GRAPHED_ACCOUNT` and `GRAPHED_PROJECT`. Those beat the saved choice. A real run prints the account and project it is using.

## 1. Pull their current ads

You need a Facebook page id. Do not look up another way to pull the Ad Library.

If the user pasted an Ad Library URL, read `view_all_page_id=`.

If they only gave a brand URL or name, search the Ad Library for the page:

```bash
graphed tools run scrapecreators:v1/facebook/adLibrary/search/companies --wait --timeout 120 \
  --account <account> --project <project> \
  --out data/ad-library/company-search.json \
  --body '{"query":"<brand name>"}'
```

Costs 1 credit. Read the results before pulling ads. Match `page_alias` or `ig_username` to the brand domain. A name that only contains the brand is a different page. If more than one result fits, ask. Use that result's `page_id`.

Then pull that page's ads:

```bash
graphed tools run scrapecreators:v1/facebook/adLibrary/company/ads --wait --timeout 120 \
  --account <account> --project <project> \
  --out data/ad-library/<pageId>/raw-1.json \
  --body '{"pageId":"<pageId>","country":"US","status":"ALL"}'
```

- Costs 1 credit per call. If the response has a `cursor`, call again with `"cursor"` and write `raw-2.json`, then `raw-3.json`. Stop after 3 pages. Each page costs another credit. Combine the files into `ads.csv`. Reusing one output path replaces the previous page.
- Flatten the result to `ads.csv` with these columns: id, active, start, end, format, title, body, cta, link, media URL.
- Video ads (optional): run `scrapecreators:v1/facebook/adLibrary/ad/transcript` with `{"id":"<ad_archive_id>"}`. It costs 1 credit per ad.
- Note what the ads lead with: proof, pain, or offer. The new ads should target the angles they don't cover yet.

## 2. Brand style from the site

Use curl only, never the browser.

- `curl -sL <url>` to fetch the page. Then grep the HTML for:
  - Hex and rgb colors, plus Framer `--token-*` values
  - `font-family`, and the size/weight/letter-spacing combos
  - `<h1>`–`<h3>` text
  - `og:image`
- The `og:image` URL is the style reference for every render.
- Download the og image and view it to confirm the look.
- Write `clients/<slug>/ad-style-guide.md`. Keep it short: colors, fonts, layout, copy rules and imagery, about 40 lines.

## 3. Five static ideas

Use one line each: the visual, the headline (3–8 words, caps), the sub-line and the CTA. Aim each one at a pain their current ads don't cover. Show the user the list before generating unless they already said to make them.

## 4. Generate

Write one `clients/<slug>/ads/<n>-<name>.req.json` per ad:

```json
{
  "prompt": "<scene: layout, UI elements, exact headline/sub/CTA text> <style block>",
  "aspect_ratio": "3:4",
  "resolution": "2K",
  "input_urls": ["<og:image url>"]
}
```

The style block, filled from the guide:
- Brand colors with hex values
- Headline font description and case
- Small wordmark at the top "exactly like the reference"
- The CTA pill
- "No drop shadows, no robots, no glowing AI imagery"
- "Use ONLY the wordmark and look from the reference, do not copy its headline or logos"
- "Render all text exactly as written"

Then run:

```bash
<skill-dir>/generate.sh clients/<slug>/ads <slug>-ads --dry-run   # local check, no Graphed call
<skill-dir>/generate.sh clients/<slug>/ads <slug>-ads             # ~3.45+ credits/ad at 2K
```

`<skill-dir>` is the folder this SKILL.md is in.

`--dry-run` reads the request files and prints each ad's aspect ratio, resolution, prompt length, and reference count. It does not call Graphed and does not spend credits. That is the point: catch a bad request before the image run.

The real run generates every ad in parallel, polls any run that outlives `--wait`, center-crops each PNG to 1080×1350, copies those files to `~/Downloads/<slug>-ads/`, and uploads them to the project at `static-ads/<slug>-ads/<name>.png`. It skips an ad that already has a PNG. Then record each uploaded file so it can be found later. See [Find them later](#find-them-later).

## 5. Review

View every PNG at reduced size: `sips -Z 900 <png> --out <scratchpad>/prev-<png>`. On Windows, use the file viewer you have. Check for:
- Misspelled text
- Made-up handles or URLs, such as a fake `@brand` or `shop.brand.ai`. Flag those to the user.
- A wordmark that doesn't match
- Copied customer logos
- The file is 1080×1350

Read the script output for `FAILED`. A failed ad or a failed project upload can still leave the script looking finished.

The script treats any existing PNG as done and skips generation. If a PNG is not 1080×1350, replace it with a cropped file, or delete the `.png` and `.res.json` to generate that ad again.

## Find them later

Project storage does not list files. A later system on this project can open an ad only if the project's Postgres has the storage key.

After the upload:

1. `graphed databases list --account <account> --project <project>`.
2. No database: add this to that project's `graphed.yaml`, tell the user, then deploy so the database is created. If you do not have the project files, stop and give them the storage key.

```yaml
databases:
  primary:
    env: DATABASE_URL
```

3. If a database exists, find the table that already holds ad creatives. `graphed databases query` is read-only:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position
```

Use the table that has `storage_key`. That column is the file name in project storage. If more than one table has it, ask which one holds ad creatives. Insert each PNG into that table, filling the columns it already has, including `storage_key` (`static-ads/<slug>-ads/<name>.png`) and the filename. Do not create a second table.

4. If the database has no such table, create `skill_asset` and insert there. Create and insert with `graphed exec` after the project has a successful deploy (`DATABASE_URL` is set there). `graphed databases query` cannot write.

```sql
create table if not exists skill_asset (
  storage_key text primary key,
  kind text not null,
  filename text not null,
  content_type text,
  created_at timestamptz not null default now()
);
```

One row per finished PNG. `kind` is `static-ad`. `filename` is the PNG name. `content_type` is `image/png`. Skip a key that is already stored.

A later system reads the row and downloads that key. It does not scan the file store.

## Gotchas

- **Model:** use `kie:gpt-image-2-image-to-image`. The catalog has no "GPT Image 2.5", so if the user asks for 2.5, use 2 and say so.
- **Aspect ratio:** `4:5` is rejected. Generate at `3:4`. `generate.sh` center-crops the file to 1080×1350, which is the Meta 4:5 size. The crop uses `sips`, which is on Mac. On Windows, `sips` is missing and that ad prints `FAILED`. The uncropped PNG may already be on disk. Replace it with a 1080×1350 crop from ImageMagick (`magick`) or `ffmpeg`, then rerun. The script skips generation for an existing PNG and still uploads it.
- **Timeouts:** a `--wait` timeout does not kill the run. Get the result with `graphed tools get <trn_id> --account <account> --project <project> --out`. Never re-run, because that pays twice.
- **Catalog:** `graphed tools catalog` needs both `--account` and `--project` for the logged-in user.
- **Ad Library data:** the scrapecreators company endpoint returns no impressions or spend, so the sort order in the Ad Library URL is ignored.
- **Deliverables:** text-only answers when the user asks for just the text. Short md files, not HTML pages.
