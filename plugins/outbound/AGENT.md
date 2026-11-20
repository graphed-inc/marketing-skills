# Integrate: outbound

You are integrating the outbound reply agent into this Graphed project.
Work the steps in order. The `files/` directory beside this runbook is
tested reference source — adapt it into the project, don't rewrite it.

What gets built: Instantly campaigns synced into Postgres, one markdown
playbook per campaign, a reply mode of off / draft / auto-send, a
dashboard at `/outbound` (campaign stats, then Unibox, Playbook testing,
and Leads), and a cron job that drafts or sends replies. The model is the
Graphed Tools OpenRouter proxy. The only credential is `INSTANTLY_API_KEY`,
and the project runs without it until the operator has a key.

## Decide with the user first

Ask for the Instantly API v2 key when they want live sync and replies.
If they do not have one yet, leave the key off and finish the rest —
the `/outbound` tester works with no Instantly credential. Do not ask
for an OpenRouter, Anthropic, or OpenAI key.

## Scaffold 0.1.0

This kit needs scaffold `>=0.2.0`. `graphed plugins add` stops on a `0.1.0`
stamp. `--force` only stages this kit. Upgrade the project first, then set
`scaffold.version` in `graphed.yaml` to `0.2.0`.

- `packages/core`: `kysely` `^0.29.9`, `zod` `^4.6.7`.
- `packages/dashboard`: `next` `^16.4.6`. If `postcss` is a direct
  dependency, `^8.5.23`.
- In `packages/core/src/config.ts`, import `ZodType` instead of
  `ZodTypeAny`. Add this and use it anywhere a schema used `required_error`:

  ```ts
  export function requiredString(message: string) {
    return z.string({
      error: (issue) => (issue.input === undefined ? message : undefined),
    });
  }
  ```

- Import `Migrator` and `FileMigrationProvider` from `kysely/migration`.
- Next 16: `await cookies()`, and await `params` and `searchParams`. In
  `next.config.mjs`, move `outputFileTracingRoot` to the top level, rename
  `experimental.serverComponentsExternalPackages` to `serverExternalPackages`,
  and drop `experimental.instrumentationHook`.
- `npm install`, then `npm audit` should be clean.

## Steps

1. **Copy the agent source.**
   - `files/packages/core/src/outbound/` → `packages/core/src/outbound/`
   - `files/packages/jobs/src/outbound-replies.ts` → `packages/jobs/src/outbound-replies.ts`

2. **Add the migration.** Copy
   `files/packages/core/src/migrations/0000_outbound.ts` into
   `packages/core/src/migrations/`. Rename `0000` to the project's next
   free migration number (a fresh scaffold uses `0002_outbound.ts`).

3. **Register table types — one place only.** In
   `packages/core/src/db/types.ts`:

   ```ts
   import type {
     OutboundActivityTable,
     OutboundCampaignsTable,
     OutboundThreadsTable,
   } from "../outbound/tables";

   export interface Database {
     // ... existing tables ...
     outbound_campaigns: OutboundCampaignsTable;
     outbound_threads: OutboundThreadsTable;
     outbound_activity: OutboundActivityTable;
   }
   ```

4. **Add the npm script.** In `packages/jobs/package.json`:

   ```json
   "job:outbound-replies": "tsx src/outbound-replies.ts"
   ```

   and a root `package.json` proxy:

   ```json
   "job:outbound-replies": "npm run -w @app/jobs job:outbound-replies"
   ```

5. **Add the dashboard page.** Copy
   `files/packages/dashboard/app/outbound/` → `packages/dashboard/app/outbound/`.
   Copy `textarea.tsx` and `label.tsx` from
   `files/packages/dashboard/components/ui/` into
   `packages/dashboard/components/ui/` when those files are not already
   there. Append to `pluginNavEntries` in `packages/dashboard/lib/plugins.ts`:

   ```ts
   {
     key: "outbound",
     label: "Outbound",
     href: "/outbound",
     group: "Channels",
     enabled: true,
   },
   ```

6. **Wire the manifest.** If `graphed plugins add outbound --apply-manifest`
   was used, confirm `outbound-replies` is in `graphed.yaml`. Otherwise
   merge the kit's `manifest.yaml`. Leave `INSTANTLY_API_KEY` off every
   `env` list until the operator has a key — listing it blocks deploy
   with `waiting_for_secrets`.

   Leave `OPENROUTER_MODEL`, `GRAPHED_TOKEN`, and `GRAPHED_TOOLS_URL` off
   the manifest. The runtime injects the tools proxy. The model default
   is `anthropic/claude-sonnet-4.5`.

   Keep `retries: 0`. Sending a reply is not idempotent.

7. **When the operator has an Instantly key**, add the name to both
   processes that call Instantly, set it, and redeploy:

   ```yaml
   services:
     dashboard:
       env:
         - INSTANTLY_API_KEY
   jobs:
     outbound-replies:
       env:
         - INSTANTLY_API_KEY
   ```

   ```bash
   graphed secrets set INSTANTLY_API_KEY
   graphed deploy
   ```

   `secrets set` takes one name per invocation. Setting the secret
   without adding the name to those `env` lists has no effect.

## Verify (do all of this, locally, before deploying)

```bash
docker compose up -d
npm run db:migrate
npm run typecheck
npx tsx --test packages/core/src/outbound/agent.test.ts
```

1. `graphed dev run -- npm run dev` and open `/outbound`.
2. The page is a campaign table (empty until sync) with a **Sync from
   Instantly** button.
3. With no `INSTANTLY_API_KEY`, **Sync from Instantly** shows an error
   that names that one secret.
4. After the key is set on the dashboard: **Sync from Instantly** fills
   the table with stats. Each campaign starts **Off** with the starter
   playbook. Open one. The tabs are **Unibox**, **Playbook testing**,
   and **Leads**.
5. On **Playbook testing**, edit the playbook — do not save — type a
   fake inbound message and click **Test this draft**. The reply follows
   the text in the editor. The page still says Unsaved. Instantly is
   not called. A second fake message in the same conversation sees the
   first exchange. **New conversation** clears it.
6. On **Unibox**, **Configure auto-response** shows the current mode and
   opens a modal to pick Off, Draft replies, or Auto-send. The reply box
   can **Save draft** (stored on the thread, nothing sent) or **Send**
   (confirms, then posts through Instantly).
7. **Leads** lists that campaign’s Instantly leads.
8. Delete the `FILL IN BEFORE GOING LIVE` line, set the mode to
   **Draft replies**, save the playbook, then
   `graphed dev run -- npm run job:outbound-replies`. Agent drafts land
   in `outbound_activity` with `outcome = 'draft'`. No Instantly reply
   call is made.
9. Switch a campaign to **Auto-send** only when the operator wants live
   mail. Until then leave every campaign Off or on Draft.
10. `npm run build` succeeds (the Dockerfile runs the same Next build).
11. `graphed deploy`. A first deploy with the key omitted from `env`
    should reach ready without `waiting_for_secrets`.

## Notes

- New campaigns from sync always arrive with `reply_mode = off`. A sync
  never overwrites a saved playbook or reply mode.
- The inbox job skips campaigns that are Off, and skips Draft/Auto-send
  campaigns whose playbook still contains `FILL IN BEFORE GOING LIVE`.
- The test console posts the editor contents. It does not read
  `outbound_campaigns` and it does not write a row.
- Draft mode stores the agent reply on the unibox. Auto-send posts to
  Instantly `POST /api/v2/emails/reply` from the receiving inbox.
- A person can also write in the unibox reply box. **Save draft** does
  not call Instantly. **Send** does, after a confirm, and does not
  depend on the campaign reply mode. The reply mode only gates the job.
