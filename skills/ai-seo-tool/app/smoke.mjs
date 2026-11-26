// Read-only smoke test, run inside the deployed image:
//   graphed exec --project <slug> --account <act> -- node smoke.mjs
// Starts a second copy of the server with the worker off, calls the read endpoints, writes nothing.
import { spawn } from "node:child_process";

const PORT = 3990 + Math.floor(Math.random() * 9);
const base = `http://127.0.0.1:${PORT}`;
const child = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), NO_WORKER: "1" }, stdio: ["ignore", "pipe", "pipe"] });
child.stderr.on("data", (d) => process.stderr.write(d));
let fails = 0;
const check = async (name, fn) => { try { const note = await fn(); console.log(`ok   ${name}${note ? `  ${note}` : ""}`); } catch (e) { fails++; console.log(`FAIL ${name}: ${e.message}`); } };
const get = async (path) => { const r = await fetch(base + path); if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`); return r.headers.get("content-type")?.includes("json") ? r.json() : r.text(); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  await check("health", async () => (await get("/health")).ok || Promise.reject(new Error("not ok")));
  await check("ui", async () => { const h = await get("/"); if (!h.includes("<title>AI SEO Tool</title>")) throw new Error("page"); });
  await check("meta", async () => { const m = await get("/api/meta"); return `${m.locations.length} locations, ${m.engines.length} engines, ${Object.keys(m.rules).length} audit rules`; });
  const projects = await get("/api/projects");
  await check("projects", async () => `${projects.length} projects`);
  await check("jobs", async () => `${(await get("/api/jobs")).length} recent jobs`);
  await check("credits", async () => { const c = await get("/api/credits"); return `${c.d30.toFixed(2)} credits in 30 days`; });
  await check("warehouse sources", async () => { const s = await get("/api/warehouse/sources"); return `${s.gsc.length} Search Console sites, ${s.ga4.length} GA4 properties`; });
  await check("keyword lists", async () => `${(await get("/api/lists")).length} lists`);
  await check("agent tokens + tools", async () => { const t = await get("/api/tokens"); if (t.tools.length < 15) throw new Error("tools"); return `${t.tokens.length} tokens, ${t.tools.length} MCP tools`; });
  await check("mcp refuses without a token", async () => { const r = await fetch(base + "/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }); if (r.status !== 401) throw new Error(`/mcp → ${r.status}`); return "401"; });
  for (const p of projects.slice(0, 2)) {
    await check(`report ${p.domain}`, async () => { const r = await get(`/api/projects/${p.id}/report`); return `gsc ${r.gsc.connected === false ? "off" : "on"}, ${r.ranks.tracked} tracked`; });
    await check(`gsc ${p.domain}`, async () => { const r = await get(`/api/projects/${p.id}/gsc`); return r.connected ? `${r.totals.cur.clicks} clicks, ${r.almostThere.length} almost-there` : "not connected"; });
  }
} finally { child.kill(); }
console.log(fails ? `SMOKE ${fails} FAILED` : "SMOKE ALL PASS");
process.exit(fails ? 1 : 0);
