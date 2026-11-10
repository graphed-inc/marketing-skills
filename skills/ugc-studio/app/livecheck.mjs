// Live check (well under 1 credit): graphed exec --project ugc-studio -- node livecheck.mjs
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--import", "tsx", "packages/core/src/livecheck.ts"], { stdio: "inherit" });
process.exit(result.status ?? 1);
