// Scheduled entry point (graphed.yaml jobs). Queues rank checks (daily) or audits + AI runs (weekly).
// It only queues work; the web service's worker runs it.
//
// Exit explicitly: the Graphed SDK and other imports keep handles open, so the process would otherwise stay alive
// after its work is done, and the platform marks the run "timed out" (failed).
import { migrate, pool } from "./lib/db.mjs";
import { scheduled } from "./lib/jobs.mjs";

const which = process.argv[2] || "daily";
let code = 0;
try {
  await migrate();
  const jobs = await scheduled(which);
  console.log(`${which}: queued ${jobs.length} jobs`, jobs.map((j) => `${j.id}:${j.kind}:${j.project_id}`).join(" "));
} catch (e) {
  console.error(`${which}: failed`, e);
  code = 1;
}
await pool.end().catch(() => {});
process.exit(code);
