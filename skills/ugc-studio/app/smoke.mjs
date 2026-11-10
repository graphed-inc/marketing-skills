// Cloud smoke test (no spend): graphed exec --project ugc-studio -- node smoke.mjs
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--import", "tsx", "packages/core/src/smoke.ts"], { stdio: "inherit" });
process.exit(result.status ?? 1);
