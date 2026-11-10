// Local HTTP entry for tests and `node` checks. The deployed app is the Next server,
// which calls the same handlers.
import http from "node:http";
import { mkdirSync } from "node:fs";
import { migrate } from "./db/migrate";
import { handleApi, fileResponse, mediaResponse, seed, startWorker } from "./api";
import { WORK, TX } from "./render";
import { coreEnv } from "./config";
import { isCloud } from "./storage";

const port = Number(coreEnv().PORT || 3000);

await migrate();
mkdirSync(WORK, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  try {
    if (req.method === "GET" && url.pathname.startsWith("/files/")) {
      const key = decodeURIComponent(url.pathname.slice(7));
      const out = await fileResponse(key, url.searchParams.get("dl"));
      const buf = Buffer.from(await out.arrayBuffer());
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(buf);
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      const out = await mediaResponse(url.pathname);
      if (out) {
        const buf = Buffer.from(await out.arrayBuffer());
        res.writeHead(out.status, Object.fromEntries(out.headers));
        res.end(buf);
        return;
      }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    let body: unknown = {};
    if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
      const chunks: Buffer[] = [];
      let n = 0;
      for await (const c of req) {
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
        n += buf.length;
        if (n > 40 * 1024 * 1024) {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "body too large" }));
          return;
        }
        chunks.push(buf);
      }
      const s = Buffer.concat(chunks).toString("utf8");
      if (s) {
        try { body = JSON.parse(s); } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "body must be JSON" }));
          return;
        }
      }
    }
    const out = await handleApi(req.method || "GET", url, body, headers);
    const buf = Buffer.from(await out.arrayBuffer());
    res.writeHead(out.status, { "content-type": out.headers.get("content-type") || "application/json", "cache-control": "no-store" });
    res.end(buf);
  } catch (e: any) {
    console.error(req.method, url.pathname, e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
});

server.listen(port, "0.0.0.0", () => {
  const addr = server.address();
  TX.port = typeof addr === "object" && addr ? addr.port : port;
  console.log(`ugc-studio on :${TX.port} (storage ${isCloud() ? "cloud" : "local"})`);
});
seed().catch((e: any) => console.error("seed:", e && e.message));
if (coreEnv().NO_WORKER !== "1") startWorker();
