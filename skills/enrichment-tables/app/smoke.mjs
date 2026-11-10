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
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + "/api/health")).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  await check("health", async () => (await get("/api/health")).ok || Promise.reject(new Error("not ok")));
  await check("ui", async () => { const h = await get("/"); if (!h.includes("<title>Tables</title>")) throw new Error("page"); });
  await check("meta", async () => { const m = await get("/api/meta"); if (m.presets.length < 15 || !m.sources.length || !m.models.length) throw new Error("presets"); return `${m.presets.length} enrichments, ${m.sources.length} lead sources`; });
  await check("tables", async () => { const t = await get("/api/tables"); return `${t.length} tables`; });
  const tables = await get("/api/tables").catch(() => []);
  if (tables[0]) {
    await check("table detail", async () => { const t = await get(`/api/tables/${tables[0].id}`); return `${t.columns.length} columns`; });
    await check("rows", async () => { const r = await get(`/api/tables/${tables[0].id}/rows?limit=5`); return `${r.total} rows`; });
  }
} finally {
  child.kill();
}
console.log(fails ? `SMOKE FAILED (${fails})` : "SMOKE ALL PASS");
process.exit(fails ? 1 : 0);
