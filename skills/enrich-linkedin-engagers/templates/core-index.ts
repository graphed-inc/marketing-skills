// Fresh scaffold: replace packages/core/src/index.ts with this file.
// Existing project: keep its exports and add the linkedin-engagers lines.

export { coreEnv, envSlice, loadLocalEnv, projectRoot } from "./config";
export { destroyDb, getDb } from "./db/index";
export type {
  Database,
  ExampleHeartbeatsTable,
  LinkedinEngagerRunStatus,
  LinkedinEngagerRunsTable,
  LinkedinEngagersTable,
} from "./db/types";
export type {
  EngagerPersonInput,
  EngagerRunInput,
  EngagerRunPatch,
} from "./linkedin-engagers";
export {
  applyVerificationResults,
  findWaitingEngagerRun,
  finishEngagerRun,
  insertEngagerRun,
  listEngagers,
  replaceEngagers,
} from "./linkedin-engagers";
export {
  countEngagers,
  influencersFile,
  isDeliverable,
  isUrnUrl,
  runLinkedinEngagersJob,
} from "./linkedin-engagers-pipeline";
export type {
  EngagerJobResult,
  ToolRunner,
} from "./linkedin-engagers-pipeline";
