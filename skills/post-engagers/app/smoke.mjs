// Read-only smoke test, run inside the deployed image:
//   graphed exec --project <slug> --account <act> -- node smoke.mjs
// Starts a second copy of the server with the worker off, calls the read endpoints, writes
// nothing, and prints SMOKE ALL PASS.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const entry = "packages/dashboard/.next/standalone/packages/dashboard/server.js";
if (!existsSync(entry)) {
  console.error(`missing ${entry}. Build the dashboard before running smoke.`);
  process.exit(1);
}

const PORT = 3990 + Math.floor(Math.random() * 9);
const base = `http://127.0.0.1:${PORT}`;
const child = spawn(process.execPath, [entry], {
  env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", NO_WORKER: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (d) => process.stderr.write(d));

let fails = 0;
const check = async (name, fn) => {
  try { const note = await fn(); console.log(`ok   ${name}${note ? `  ${note}` : ""}`); }
  catch (e) { fails++; console.log(`FAIL ${name}: ${e.message}`); }
};
const get = async (path) => {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.headers.get("content-type")?.includes("json") ? r.json() : r.text();
};

try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + "/api/health")).ok) { up = true; break; } } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) throw new Error("server did not start");
  await check("health", async () => (await get("/api/health")).ok || Promise.reject(new Error("not ok")));
  await check("ui", async () => {
    const h = await get("/");
    if (!h.includes("<title>Post Engagers</title>") || !h.includes("tracking")) throw new Error("page");
  });
  await check("stats", async () => {
    const s = await get("/api/stats");
    if (!Array.isArray(s.waterfall) || !s.rates || !String(s.agentPrompt || "").includes("cli.mjs add")) throw new Error("stats");
    return s.waterfall.join(" → ");
  });
  await check("jobs", async () => { const j = await get("/api/jobs"); if (!Array.isArray(j)) throw new Error("jobs"); return `${j.length} jobs`; });
  await check("tracked", async () => { const t = await get("/api/tracked"); if (!Array.isArray(t)) throw new Error("tracked"); return `${t.length} profiles`; });
  await check("people", async () => { const p = await get("/api/people?since=7"); if (!Array.isArray(p)) throw new Error("people"); return `${p.length} people`; });
  await check("csv", async () => { const c = await get("/api/people/export.csv?since=30"); if (!String(c).includes("Email verified")) throw new Error("csv"); });
} catch (e) {
  fails++;
  console.error("SMOKE ERROR", e);
} finally {
  child.kill();
}
console.log(fails ? `SMOKE FAILED (${fails})` : "SMOKE ALL PASS");
process.exit(fails ? 1 : 0);
