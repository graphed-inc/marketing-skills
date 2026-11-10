// `node cli.mjs …` from the project root. The worker in the web service does the work.
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--import", "tsx", "packages/core/src/cli.ts", ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
