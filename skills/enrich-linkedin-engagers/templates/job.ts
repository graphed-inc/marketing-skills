import { existsSync } from "node:fs";
import { destroyDb } from "@app/core";
import {
  excludeEmailsFile,
  influencersFile,
  runLinkedinEngagersJob,
  type ToolRunner,
} from "@app/core/linkedin-engagers-pipeline";

// Copy to packages/jobs/src/linkedin-engagers.ts.
// Add `@graphed-inc/sdk` to packages/jobs dependencies (see templates/jobs-package.json).
// Wire `npm run job:linkedin-engagers` the same way as job:example-daily:
// a script in packages/jobs/package.json and a root proxy of
// `npm run -w @app/jobs job:linkedin-engagers`.
//
// The job reads linkedin-engagers/influencers.txt from the repo root.
// npm runs this file with cwd = packages/jobs, so the path goes through
// projectRoot() inside influencersFile().

async function liveTools(): Promise<ToolRunner> {
  const { Graphed } = await import("@graphed-inc/sdk");
  const graphed = new Graphed();
  return {
    async run(tool, input, options) {
      return graphed.tools.run(tool, input, options);
    },
    async get(runId) {
      const status = await graphed.tools.get(runId);
      return {
        id: status.id,
        status: status.status,
        statusMessage: status.statusMessage ?? null,
        resultUrl: status.result?.url ?? null,
      };
    },
    async downloadText(runId) {
      const status = await graphed.tools.get(runId);
      const url = status.result?.url;
      if (!url) {
        throw new Error(
          `Run ${runId} has no result url (status ${status.status})`,
        );
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download ${runId} (${response.status})`);
      }
      return response.text();
    },
  };
}

async function main(): Promise<void> {
  const influencersPath = influencersFile();
  const excludePath = excludeEmailsFile();
  const summary = await runLinkedinEngagersJob({
    tools: await liveTools(),
    influencersPath,
    excludeEmailsPath: existsSync(excludePath) ? excludePath : undefined,
  });
  console.log(JSON.stringify(summary));
  await destroyDb();
  if (summary.runs.some((run) => run.status === "failed")) {
    process.exitCode = 1;
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  await destroyDb();
  process.exit(1);
});
