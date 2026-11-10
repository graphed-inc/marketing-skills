// @ts-nocheck
// Cloud smoke test (no spend): graphed exec --project ugc-studio -- node smoke.mjs
import { writeFileSync } from "node:fs";
import { migrate } from "./db/migrate";
import { one } from "./db/sql";
import * as store from "./storage";
import { run, spoken } from "./media";
import { z } from "zod";
import { envSlice } from "./config";

const ok = (c: boolean, m: string) => console.log(`${c ? "ok  " : "FAIL"} ${m}`);
await migrate();
ok(store.isCloud(), "cloud storage env present");
writeFileSync("/tmp/smoke.txt", "hello " + Date.now());
await store.putFile("tmp/smoke.txt", "/tmp/smoke.txt", "text/plain");
const u = await store.url("tmp/smoke.txt", 300);
const r = await fetch(u);
ok(r.ok && (await r.text()).startsWith("hello"), "storage put + presigned get");
await store.del("tmp/smoke.txt");
writeFileSync("/tmp/smoke-big.bin", Buffer.alloc(20 * 1024 * 1024, 7));
await store.putFile("tmp/smoke-big.bin", "/tmp/smoke-big.bin", "application/octet-stream");
const rb = await fetch(await store.url("tmp/smoke-big.bin", 300), { method: "HEAD" });
ok(rb.ok && Number(rb.headers.get("content-length")) === 20 * 1024 * 1024, "20 MB upload in one PutObject");
await store.del("tmp/smoke-big.bin");
ok((await run("ffmpeg", ["-version"])).includes("libx264"), "ffmpeg with libx264");
ok((await spoken("24/7 at 2am")).words > 3, "python spoken helper");
await run("python3", ["-c", "import sys; sys.path.insert(0, 'engine'); import fix_words"]);
ok(true, "python fixer imports");
const a = await one<{ n: number }>("SELECT count(*)::int n FROM avatars");
ok(!!a && a.n >= 1, `avatars: ${a && a.n}`);
const v = await one<{ voice_id: string }>("SELECT voice_id FROM voices WHERE id = 'default'");
ok(!!(v && v.voice_id), `voice ${v && v.voice_id}`);
const creds = envSlice(z.object({ GRAPHED_TOKEN: z.string().optional(), GRAPHED_TOOLS_URL: z.string().optional() }));
ok(!!(creds.GRAPHED_TOKEN && creds.GRAPHED_TOOLS_URL), "Graphed Tools credentials injected");
process.exit(0);
