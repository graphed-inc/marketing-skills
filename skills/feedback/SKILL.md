---
name: feedback
description: "Report a Graphed platform problem. Use when a Graphed command, the platform, or the docs fail or a capability is missing, and the user should send that report with `graphed feedback`."
---

# Feedback

When a Graphed platform problem shows up, ask the user to send it with
`graphed feedback`. The report goes to the Graphed team.

Use this for platform bugs, missing platform features, and docs that are
wrong or missing. Problems in the user's own application code stay in the
project.

## What to do

1. If `graphed` is not on PATH, stop and ask the user to install it
   (`npm i -g @graphed-inc/cli`).
2. Read the current usage before drafting the report:

   ```sh
   graphed docs feedback
   ```

3. Draft a short message and the exact command. Show it to the user and ask
   them to run it. Send it yourself only after they ask you to.
4. The command needs `graphed login` or `GRAPHED_TOKEN`.

## Command

```sh
graphed feedback "what happened"
graphed feedback --kind bug "graphed logs --follow exits immediately on empty log streams"
graphed feedback --kind feature_request --context "graphed deploy --account acc_123" "deploy should support monorepo subdirectories"
```

`--kind` is `bug`, `feature_request`, or `general` (the default).

Put the command that failed and what you expected in `--context`. For a long
log, pipe it in with `-` as the last message argument:

```sh
graphed logs --project <project_slug> --account <account_id> 2>&1 | graphed feedback "logs failed unexpectedly" - --kind bug --context "graphed logs --project <project_slug>"
```

Include what the user was trying to do, the exact command, and what happened
instead. Re-run with `--verbose` when that output explains the failure, and
attach it as context.

Leave secret values, tokens, and credentials out of the message and the
context.
