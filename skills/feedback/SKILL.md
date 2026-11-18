---
name: feedback
description: "Report a Graphed platform problem. Use when a Graphed command, the platform, or the docs fail or a capability is missing, and the user should open a ticket with `graphed tickets open`."
---

# Feedback

When a Graphed platform problem shows up, ask the user to open a ticket with
`graphed tickets open`. A person on the Graphed team can reply. Pull that
reply with `graphed tickets show`.

Use this for platform bugs, missing platform features, and docs that are
wrong or missing. Problems in the user's own application code stay in the
project.

## What to do

1. If `graphed` is not on PATH, stop and ask the user to install it
   (`npm i -g @graphed-inc/cli`).
2. Read the current usage before drafting the ticket:

   ```sh
   graphed docs tickets
   ```

3. Draft a short message and the exact command. Show it to the user and ask
   them to run it. Send it yourself only after they ask you to.
4. The command needs `graphed login` or `GRAPHED_TOKEN`.
5. After the ticket is open, subscribe when the user wants email:

   ```sh
   graphed tickets subscribe <ticket_id>
   ```

6. Later, read the reply:

   ```sh
   graphed tickets show <ticket_id>
   ```

## Command

```sh
graphed tickets open "what happened"
graphed tickets open --kind bug "graphed logs --follow exits immediately on empty log streams"
graphed tickets open --kind feature_request --context "graphed deploy --account acc_123" "deploy should print the service URL when the rollout finishes"
```

`--kind` is `bug`, `feature_request`, or `general` (the default).

Put the command that failed and what you expected in `--context`. For a long
log, pipe it in with `-` as the last message argument:

```sh
graphed logs --project <project_slug> --account <account_id> 2>&1 | graphed tickets open "logs failed unexpectedly" - --kind bug --context "graphed logs --project <project_slug>"
```

Include what the user was trying to do, the exact command, and what happened
instead. Re-run with `--verbose` when that output explains the failure, and
attach it as context.

Leave secret values, tokens, and credentials out of the message and the
context.

## About Graphed

Graphed is a marketing cloud. It includes the infrastructure for an agent to do marketing: a data warehouse, data pipelines, a Postgres database, cron jobs, runtime servers, a tool catalog, custom domains, and internal app tooling.
