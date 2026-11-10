// UI test: Next dev server seeded by packages/core/src/uitest-setup.ts, real Chrome via puppeteer-core. No worker, nothing spent.
// Run from app/:  npm i --no-save puppeteer-core@23 && node uitest.mjs   (needs Google Chrome installed)
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs"; import { dirname, join } from "node:path"; import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";
const APP = process.cwd(), SHOT = process.argv[2] || join(tmpdir(), "ugc-ui-shots");
(await import("node:fs")).mkdirSync(SHOT, { recursive: true });
const T = mkdtempSync(join(tmpdir(), "ugc-ui-")), port = 39970;
const env = { ...process.env, APP, PORT: String(port), NO_WORKER: "1", PGLITE_DIR: join(T, "pg"), LOCAL_STORAGE_DIR: join(T, "st"), WORK_DIR: join(T, "w") };
for (const k of ["DATABASE_URL", "GRAPHED_STORAGE_ENDPOINT", "GRAPHED_STORAGE_ACCESS_KEY_ID"]) delete env[k];
execFileSync(process.execPath, ["--import", "tsx", "packages/core/src/uitest-setup.ts"], { cwd: APP, env, stdio: "ignore" });
const nextBin = join(dirname(createRequire(join(APP, "packages/dashboard/package.json")).resolve("next/package.json")), "dist/bin/next");
const srv = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "-H", "127.0.0.1"], { cwd: join(APP, "packages/dashboard"), env, stdio: ["ignore", "pipe", "inherit"] });
const u = (p) => `http://127.0.0.1:${port}${p}`;
for (let i = 0; i < 180; i++) { try { if ((await fetch(u("/health"))).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
let fails = 0; const ok = (c, m) => { console.log(`${c ? "ok  " : "FAIL"} ${m}`); if (!c) fails++; };
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: [`--user-data-dir=${join(T, "c")}`] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (sel) => p.$$eval(sel, (x) => x.length);
await p.goto(u("/"), { waitUntil: "networkidle0" }); await sleep(500);
ok(p.url().endsWith("#/campaign/1"), "opens the first campaign");
ok(await count("#bdh .hc") < 12, `header virtualized (${await count("#bdh .hc")} of 12 columns in DOM)`);
// select one empty cell
await p.click(".clip.blank"); await sleep(800);
ok(await count(".clip.sel") === 1, "click empty cell selects it");
let gen = await p.$eval("#gen", (e) => [e.textContent, e.disabled]);
ok(/Generate 1 · \$\d+\.\d\d$/.test(gen[0]) && !gen[1], `generate button shows cost (${gen[0]})`);
// select row 4 (no clips): all 12 selectable
await p.evaluate(() => { wrap.scrollTop = 3 * 236; }); await sleep(300);
await p.click('[data-act="row"][data-sid="4"]'); await sleep(800);
gen = await p.$eval("#gen", (e) => e.textContent);
ok(/Generate 13 /.test(gen), `row select adds 12 (${gen})`);
// too-long row 6 has no selectable cells
await p.evaluate(() => { wrap.scrollTop = 5 * 236; }); await sleep(300);
ok(await count(".clip.off") > 0, "too-long script cells are disabled");
await p.click('[data-act="row"][data-sid="6"]'); await sleep(500);
ok(/Generate 13 /.test(await p.$eval("#gen", (e) => e.textContent)), "too-long row adds nothing");
// select all empty, then clear
await p.evaluate(() => selectEmpty()); await sleep(900);
const all = await p.$eval("#gen", (e) => e.textContent);
ok(/Generate \d+ /.test(all), `select all empty (${all})`);
await p.evaluate(() => clearSel()); await sleep(200);
ok((await p.$eval("#gen", (e) => e.textContent)) === "Generate", "clear selection");
// horizontal scroll: virtual columns change, sticky script column stays
await p.evaluate(() => { wrap.scrollTop = 0; wrap.scrollLeft = 900; }); await sleep(400);
const left = await p.$eval(".bd-left", (e) => Math.round(e.getBoundingClientRect().left));
const hc = await p.$$eval("#bdh .hc span", (x) => x.map((e) => e.textContent));
ok(left === 248, `script column sticks while scrolling right (left=${left})`);
ok(hc.includes(await p.evaluate(() => S.b.avatars[11].name)), `last column rendered after scroll (${hc.slice(-2).join(", ")})`);
await p.screenshot({ path: join(SHOT, "ui-scrolled.png") });
await p.evaluate(() => { wrap.scrollLeft = 0; }); await sleep(300);
// generate 2 cells: confirm dialog, then cells turn into queued clips
await p.click('[data-act="row"][data-sid="5"]'); await sleep(900);
await p.click("#gen"); await sleep(400);
ok(/Generate 12 clips\?/.test(await p.$eval("#dialog h3", (e) => e.textContent)), "confirm dialog");
await p.click("#yes"); await sleep(1500);
ok(await p.evaluate(() => S.b.cells.filter((v) => v.status === "queued").length) === 12, "12 clips queued on the grid");
await p.evaluate(() => { wrap.scrollTop = 4 * 236; }); await sleep(400);
await p.screenshot({ path: join(SHOT, "ui-queued.png") });
// add scripts sheet: paste 2
await p.evaluate(() => openAddScripts()); await sleep(600);
await p.type("#paste", "New one. Click the link.\n---\nAnother one here. Click the link.");
await p.click("#addGo"); await sleep(1200);
ok(await p.evaluate(() => S.b.scripts.length) === 8, "paste 2 scripts -> 8 rows");
// add avatars sheet: pick Jasmine, all shown
await p.evaluate(() => openAddAvatars()); await sleep(800);
await p.screenshot({ path: join(SHOT, "ui-avsheet.png") });
await p.click('#ppl [data-p="Jasmine"]'); await sleep(200); await p.click("#agAll"); await sleep(200); await p.click("#agGo"); await sleep(1500);
ok(await p.evaluate(() => S.b.avatars.length) === 25, `added 13 Jasmine columns (${await p.evaluate(() => S.b.avatars.length)})`);
// play a done clip
await p.evaluate(() => { wrap.scrollTop = 0; wrap.scrollLeft = 0; }); await sleep(400);
const doneId = await p.evaluate(() => S.b.cells.find((v) => v.status === "done").id);
await p.click(`.clip.vid[data-id="${doneId}"]`); await sleep(800);
ok(await count("#dialog.on video") === 1, "click done clip opens player");
const dl = await p.$$eval("#dialog button", (x) => x.map((e) => e.textContent.trim()));
ok(dl.some((t) => t.includes("Download")) && dl.includes("New take"), `player buttons (${dl.join(", ")})`);
await p.keyboard.press("Escape"); await sleep(300);
// outputs: filters + virtualization
await p.goto(u("/#/outputs"), { waitUntil: "networkidle0" }); await sleep(600);
const vn = await count("#vg .vi");
ok(vn > 0 && vn <= 36, `outputs virtualized (${vn} cards in DOM of ${await p.evaluate(() => S.vids.length)})`);
await p.click('[data-st="failed"]'); await sleep(300);
ok(await p.$eval("#vcount", (e) => e.textContent) === "2", "failed filter = 2");
await p.click('[data-st=""]'); await sleep(200);
await p.select("#vfb", "1"); await sleep(200);
// avatars page + scripts
await p.goto(u("/#/avatars"), { waitUntil: "networkidle0" }); await sleep(600);
const an = await count("#ag2 .vi");
ok(an < 66, `avatars virtualized (${an} of 66 in DOM)`);
await p.evaluate(() => { wrap.scrollTop = 99999; }); await sleep(400);
ok(await count('[data-act="addavatar"]') === 1, "add tile at the end after scrolling");
await p.goto(u("/#/scripts"), { waitUntil: "networkidle0" }); await sleep(600);
ok(await count("#sl .srow") === 8, "scripts page lists 8");
// new campaign
await p.evaluate(() => newBoard()); await sleep(1200);
ok(/#\/campaign\/2$/.test(p.url()) && (await p.$eval(".empty h3", (e) => e.textContent)) === "Set up this campaign", "new campaign empty state");
const real = errs.filter((e) => !e.startsWith("Failed to load resource"));  // test clips point at a fake final.mp4
ok(!real.length, `no page errors ${real.slice(0, 3).join(" | ")}`);
await b.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "ui: all passed"); process.exit(fails ? 1 : 0);
