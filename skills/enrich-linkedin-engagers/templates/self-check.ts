import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { destroyDb, getDb, projectRoot } from "@app/core";
import {
  findWaitingEngagerRun,
  finishEngagerRun,
  insertEngagerRun,
  listEngagers,
  replaceEngagers,
} from "@app/core/linkedin-engagers";
import {
  dedupeEngagers,
  extractPosts,
  fixtureToolRunner,
  influencersFile,
  isUrnUrl,
  runLinkedinEngagersJob,
  selectDailyPosts,
  type ToolRunner,
} from "@app/core/linkedin-engagers-pipeline";

// Copy to packages/jobs/src/linkedin-engagers-self-check.ts.
// Proves the daily job path without paid tool calls: post window, dedupe,
// URN skip, Apollo alignment, MillionVerifier, a transactional replace, and
// resume of a waiting report. Writes synthetic rows (Ada Fixture, Grace
// Fixture) into whichever database DATABASE_URL points at.

const POSTS_TOOL = "apify:apimaestro~linkedin-profile-posts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPathResolution(): void {
  const previous = process.cwd();
  const jobsDir = join(projectRoot(), "packages", "jobs");
  process.chdir(jobsDir);
  try {
    const file = influencersFile();
    assert(
      file.endsWith(`${sep}linkedin-engagers${sep}influencers.txt`),
      `unexpected influencers path ${file}`,
    );
    assert(
      !file.includes(`${sep}packages${sep}jobs${sep}`),
      `influencers file resolved inside packages/jobs: ${file}`,
    );
  } finally {
    process.chdir(previous);
  }
}

async function assertPipeline(now: Date): Promise<number> {
  const calls: string[] = [];
  const tools = fixtureToolRunner(now);
  const wrapped: ToolRunner = {
    run: async (tool, input, options) => {
      calls.push(`${tool} ${JSON.stringify(input)}`);
      return tools.run(tool, input, options);
    },
    get: (runId) => tools.get(runId),
    downloadText: (runId) => tools.downloadText(runId),
  };
  const posts = extractPosts(await tools.run(POSTS_TOOL, {}));
  const daily = selectDailyPosts(posts, now);
  assert(posts.length === 4, `expected 4 fixture posts, got ${posts.length}`);
  assert(posts.some((post) => post.groupPost), "fixture group post was dropped");
  assert(
    daily.length === 1 && daily[0]?.activityId === "1001",
    `daily window kept ${daily.map((post) => post.activityId).join(",")}`,
  );
  const deduped = dedupeEngagers([
    {
      linkedinUrl: "https://www.linkedin.com/in/Ada-Fixture/",
      engagementType: "reaction",
    },
    {
      linkedinUrl: "https://www.linkedin.com/in/ada-fixture",
      engagementType: "comment",
      commentText: "hi",
    },
  ]);
  assert(
    deduped.length === 1 && deduped[0]?.engagementType === "comment",
    "comment should win over reaction",
  );
  assert(isUrnUrl("https://www.linkedin.com/in/ACoFIXTURE"), "URN URL not detected");

  const directory = mkdtempSync(join(tmpdir(), "engagers-"));
  const influencersPath = join(directory, "influencers.txt");
  writeFileSync(influencersPath, "fixture-influencer\n");
  const result = await runLinkedinEngagersJob({
    tools: wrapped,
    influencersPath,
    now,
  });
  assert(result.resumed === false, "fresh run resumed a waiting row");
  const run = result.runs[0];
  assert(run?.status === "succeeded", `run failed: ${run?.lastError ?? "missing"}`);
  assert(run.engagers === 3, `engagers ${run.engagers}`);
  assert(run.emails === 1, `emails ${run.emails}`);
  assert(run.verified === 1, `verified ${run.verified}`);
  assert(run.notFound === 1, `notFound ${run.notFound}`);
  assert(run.skippedUrn === 1, `skippedUrn ${run.skippedUrn}`);
  assert(run.excluded === 0, `excluded ${run.excluded}`);
  assert(
    calls.some((call) => call.includes('"postIds":["1001"]')),
    "comments were not scraped for the in-window post",
  );
  assert(
    !calls.some((call) => call.includes("1002") || call.includes("1003") || call.includes("1004")),
    `scraped a post outside the daily window: ${calls.join("\n")}`,
  );
  assert(
    calls.filter((call) => call.startsWith("apollo:people.email")).length === 1,
    "email reveal should run only for the Apollo miss",
  );

  const people = await listEngagers(run.runId);
  const ada = people.find((person) => person.linkedinUrl.includes("ada-fixture"));
  assert(ada, "Ada Fixture was not stored");
  assert(ada.engagementType === "comment", "Ada should keep the comment");
  assert(ada.email === "ada.fixture@example.com", `Ada email ${ada.email}`);
  assert(ada.verificationResult === "ok", `Ada result ${ada.verificationResult}`);
  assert(ada.company === "Fixture Labs", `Ada company ${ada.company}`);
  const grace = people.find((person) =>
    person.linkedinUrl.includes("grace-fixture"),
  );
  assert(grace, "Grace Fixture was not stored");
  assert(grace.emailStatus === "not_found", "Grace should be not_found");
  const urn = people.find((person) => person.excludedReason === "skipped_urn");
  assert(urn?.fullName === "Urn Fixture", "URN profile was not stored");
  return run.runId;
}

async function assertReplaceRollsBack(runId: number): Promise<void> {
  let threw = false;
  try {
    await replaceEngagers(runId, [
      {
        linkedinUrl: "https://www.linkedin.com/in/dup-fixture",
        engagementType: "comment",
      },
      {
        linkedinUrl: "https://www.linkedin.com/in/dup-fixture",
        engagementType: "reaction",
      },
    ]);
  } catch {
    threw = true;
  }
  assert(threw, "duplicate insert should fail");
  const people = await listEngagers(runId);
  const ada = people.find((person) => person.email === "ada.fixture@example.com");
  assert(
    ada !== undefined,
    "failed save erased contacts; replaceEngagers is not transactional",
  );
  assert(people.length === 3, `expected the original 3 people, found ${people.length}`);
}

async function assertResume(now: Date): Promise<void> {
  const runId = await insertEngagerRun({
    sourceUrl: "https://www.linkedin.com/in/resume-fixture",
    sourceKind: "profile",
    slug: `selfcheck-resume-${now.getTime()}`,
    crmEnabled: false,
  });
  await replaceEngagers(runId, [
    {
      fullName: "Ada Fixture",
      linkedinUrl: "https://www.linkedin.com/in/ada-fixture",
      engagementType: "comment",
      email: "ada.fixture@example.com",
    },
  ]);
  await finishEngagerRun(runId, {
    status: "waiting",
    millionverifierRunId: "trn_selfcheck",
    engagers: 1,
    emails: 1,
  });
  let toolRuns = 0;
  const tools = fixtureToolRunner(now);
  const wrapped: ToolRunner = {
    run: async (tool, input, options) => {
      toolRuns += 1;
      return tools.run(tool, input, options);
    },
    get: (runIdToGet) => tools.get(runIdToGet),
    downloadText: (runIdToDownload) => tools.downloadText(runIdToDownload),
  };
  const result = await runLinkedinEngagersJob({
    tools: wrapped,
    influencersPath: influencersFile(),
    now,
  });
  assert(result.resumed, "waiting run was not resumed");
  assert(toolRuns === 0, "resume scraped again");
  assert(result.runs[0]?.runId === runId, "resumed a different run");
  assert(result.runs[0]?.status === "succeeded", "resume did not finish");
  assert(result.runs[0]?.verified === 1, "resume did not apply the report");
  const people = await listEngagers(runId);
  const resumedPerson = people[0];
  assert(resumedPerson, "resumed run has no people");
  assert(
    resumedPerson.verificationResult === "ok",
    `verification ${resumedPerson.verificationResult}`,
  );
}

async function cleanup(): Promise<void> {
  const db = getDb();
  await db
    .deleteFrom("linkedin_engager_runs")
    .where("source_url", "=", "https://www.linkedin.com/in/fixture-influencer")
    .execute();
  await db
    .deleteFrom("linkedin_engager_runs")
    .where("slug", "like", "selfcheck-resume-%")
    .execute();
}

async function main(): Promise<void> {
  assertPathResolution();
  const now = new Date();
  await cleanup();
  const waiting = await findWaitingEngagerRun();
  if (waiting) {
    throw new Error(
      `Refusing to run: ${waiting.slug} is waiting on ${waiting.millionverifierRunId}`,
    );
  }
  const runId = await assertPipeline(now);
  await assertReplaceRollsBack(runId);
  await assertResume(now);
  await getDb()
    .deleteFrom("linkedin_engager_runs")
    .where("slug", "like", "selfcheck-resume-%")
    .execute();
  console.log(JSON.stringify({ ok: true, runId }));
  await destroyDb();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await destroyDb();
  process.exit(1);
});
