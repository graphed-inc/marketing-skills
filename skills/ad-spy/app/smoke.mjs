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
const get = async (path, opts) => {
  const r = await fetch(base + path, opts);
  if (!r.ok && r.status !== 302) throw new Error(`${path} → ${r.status}`);
  return r.headers.get("content-type")?.includes("json") ? r.json() : r;
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
    const h = await (await get("/")).text();
    if (!h.includes("<title>Ad Spy</title>")) throw new Error("page");
  });
  let first = null;
  await check("state", async () => {
    const s = await get("/api/state");
    if (!Array.isArray(s.brands) || !s.totals) throw new Error("state");
    return `${s.brands.length} brands, ${s.totals.ads} ads, storage ${s.storage}, market ${s.market ? s.market.name : "none"}`;
  });
  await check("ads", async () => {
    const a = await get("/api/ads?limit=5&sort=longest");
    if (typeof a.total !== "number") throw new Error("ads");
    first = a.ads.find((x) => x.thumb);
    return `${a.total} ads`;
  });
  await check("media", async () => {
    if (!first) return "no stored media yet";
    const r = await fetch(base + first.thumb.url, { redirect: "manual" });
    if (r.status === 302) {
      const m = await fetch(r.headers.get("location"));
      if (!m.ok) throw new Error(`presigned → ${m.status}`);
      return `302 → ${m.headers.get("content-type")}`;
    }
    if (!r.ok) throw new Error(`${r.status}`);
    return r.headers.get("content-type");
  });
  await check("gaps", async () => {
    const r = await fetch(base + "/api/gaps");
    if (r.status === 404) return "no market yet (onboarding)";
    const g = await r.json();
    if (!Array.isArray(g.cells)) throw new Error("gaps");
    return `${g.personas.length} personas × ${g.themes.length} themes, ${g.adsMapped} ads mapped, top gap ${g.gaps[0] ? `${g.gaps[0].persona} × ${g.gaps[0].theme}` : "none"}`;
  });
  await check("agent prompt", async () => {
    const p = await get("/api/agent-prompt");
    if (!String(p.prompt).includes("cli.mjs sql")) throw new Error("prompt");
  });
} catch (e) {
  fails++;
  console.error("SMOKE ERROR", e);
} finally {
  child.kill();
}
console.log(fails ? `SMOKE FAILED (${fails})` : "SMOKE ALL PASS");
process.exit(fails ? 1 : 0);
