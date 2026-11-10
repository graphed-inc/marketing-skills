// Offline tests: template engine + full worker flow on an in-memory PGlite database with fake
// Graphed Tools. No network, no credits.  Run: npm test
import assert from "node:assert/strict";

process.env.PGLITE_DIR = "memory";
delete process.env.DATABASE_URL;

const T = await import("./template");
const names = ["Company", "Enrich Company", "Enrich Company 2", "First name"];

// ---- template ----
assert.deepEqual(T.resolveToken("Enrich Company.organization.name", names), { name: "Enrich Company", path: "organization.name" });
assert.deepEqual(T.resolveToken("Enrich Company 2", names), { name: "Enrich Company 2", path: "" });
assert.equal(T.resolveToken("Nope", names), null);
assert.deepEqual(T.deps({ a: "{{Company}} and {{Enrich Company.x}}", b: ["{{First name}}"] }, names).sort(), ["Company", "Enrich Company", "First name"]);
assert.equal(T.getPath({ a: { b: [{ c: 1 }] } }, "a.b.0.c"), 1);
assert.equal(T.getPath({ a: { b: [{ c: 1 }] } }, "a.b[0].c"), 1);
const ctx = new Map([["Company", { display: "Acme", value: null }], ["Enrich Company", { display: "x", value: { organization: { name: "Acme Inc", tags: ["a", "b"] } } }]]);
assert.equal(T.render("Hi {{Company}} / {{Enrich Company.organization.name}}", ctx), "Hi Acme / Acme Inc");
const miss: string[] = []; T.render("{{First name}}", new Map([["First name", { display: "" }]]), miss); assert.deepEqual(miss, ["First name"]);
assert.deepEqual(T.renderDeep({ q: "{{Company}} ceo", tags: "{{Enrich Company.organization.tags}}", empty: "{{Nope}}" }, ctx), { q: "Acme ceo", tags: ["a", "b"] });
assert.equal(T.display({ a: 1, b: "x" }), "a: 1 · b: x");
assert.equal(T.display(["a", "b"]), "a, b");
assert.deepEqual(T.renameTokens({ e: "{{Enrich Company.organization.name}} {{Enrich Company 2}}" }, "Enrich Company", "Org", names), { e: "{{Org.organization.name}} {{Enrich Company 2}}" });
assert.deepEqual(T.parseCsv('a,b\n1,"x, ""y"""\n\n2,\r\n'), [["a", "b"], ["1", 'x, "y"'], ["2", ""]]);
assert.equal(T.toCsv([["a", "b,c"]]), 'a,"b,c"\n');

// ---- formula ----
const R = await import("./runner");
assert.equal(R.runFormula("domainOf({{Company}} + '.com/x')", ctx), "acme.com");
assert.equal(R.runFormula("{{Enrich Company.organization.name}}.toUpperCase()", ctx), "ACME INC");
assert.equal(R.runFormula('{{Company}} === "Acme" ? upper({{Company}}) : ""', ctx), "ACME");
assert.equal(R.runFormula("num('10') * .5", ctx), 5);
assert.equal(R.runFormula(".25 + .25", ctx), 0.5);
assert.equal(R.runFormula('empty({{Nope}}) ? "yes" : "no"', ctx), "yes");
assert.throws(() => R.runFormula("while(true){}", ctx));
process.env.DATABASE_URL = "super-secret-db";
for (const attack of [
  '$.constructor.constructor("return process")().env.DATABASE_URL',
  "process.env.DATABASE_URL",
  "{{Company}}.constructor",
  'constructor.constructor("return process")()',
]) {
  assert.throws(() => R.runFormula(attack, ctx), attack);
  try { R.runFormula(attack, ctx); } catch (e) { assert.equal(String((e as Error).message).includes("super-secret-db"), false); }
}
delete process.env.DATABASE_URL;
assert.equal(R.stableKey("ct-a", "search", "acme"), R.stableKey("ct-a", "search", "acme"));
assert.notEqual(R.stableKey("ct-a", "search", "acme"), R.stableKey("ct-a", "search", "other"));
assert.notEqual(R.stableKey("ct-a", "search", "acme"), R.stableKey("ct-a", "page", "acme"));

// ---- full flow on PGlite with fake tools ----
const tools = await import("./tools");
const calls: { id: string; key?: string }[] = [];
const field = (input: object, key: string): string => {
  const value = Reflect.get(input, key);
  if (typeof value !== "string") throw new Error(`expected ${key}`);
  return value;
};
tools.setFake(async (id, input, key) => {
  if (!input || typeof input !== "object") throw new Error("expected object input");
  calls.push({ id, key });
  if (id === "apollo:organizations.enrich") return { organization: { name: field(input, "domain").split(".")[0].toUpperCase(), industry: "software", estimated_num_employees: 42 } };
  if (id === "getleads:enrich.from-person") return { results: [{ email: field(input, "firstName") === "Ann" ? "" : `${field(input, "firstName").toLowerCase()}@${field(input, "emailDomain")}` }] };
  if (id === "leadmagic:people.email-finder") return { email: `${field(input, "firstName").toLowerCase()}.${field(input, "lastName").toLowerCase()}@${field(input, "domain")}` };
  if (id === "million-verifier:validate") return { result: field(input, "email").startsWith("bob@") ? "catch_all" : "ok" };
  if (id === "apollo:people.match") throw new Error("API error (404): not found");
  throw new Error(`unexpected tool ${id}`);
});
const db = await import("./tables");
await db.migrate();
const W = await import("./worker");

const t = await db.one("INSERT INTO tables (name) VALUES ('t') RETURNING *");
const ids = await db.insertRows(t.id, [
  { "First name": "Bob", "Last name": "Stone", Website: "https://www.acme.com/about" },
  { "First name": "Ann", "Last name": "Lee", Website: "beta.io" },
  { "First name": "Cy", "Last name": "", Website: "" },
]);
assert.equal(ids.length, 3);
const add = async (name: string, type: string, config: unknown, auto = false) =>
  db.one("INSERT INTO columns (table_id, name, type, config, position, auto_run) VALUES ($1,$2,$3,$4,(SELECT coalesce(max(position),0)+1 FROM columns WHERE table_id=$1),$5) RETURNING *", [t.id, name, type, JSON.stringify(config), auto]);

const dom = await add("Domain", "formula", { expr: "domainOf({{Website}})" }, true);
const org = await add("Company", "enrich", { preset: "apollo_company", inputs: { domain: "{{Domain}}" } }, true);
const ind = await add("Industry", "formula", { expr: "{{Company.organization.industry}}" }, true);
const em = await add("Email", "waterfall", { kind: "email", verify: true, steps: [
  { preset: "getleads_email", inputs: { firstName: "{{First name}}", lastName: "{{Last name}}", emailDomain: "{{Domain}}" } },
  { preset: "leadmagic_email", inputs: { firstName: "{{First name}}", lastName: "{{Last name}}", domain: "{{Domain}}" } },
  { preset: "apollo_email", inputs: { firstName: "{{First name}}", domain: "{{Domain}}" } },
] }, false);

// Only Domain is queued directly; Company + Industry follow by cascade (auto-run).
await db.queueCells(dom.id);
await W.drain(20000);
const cell = async (r: string | number, c: number) => db.one("SELECT * FROM cells WHERE row_id = $1 AND column_id = $2", [String(r), c]);
assert.equal((await cell(ids[0], dom.id)).display, "acme.com");
assert.equal((await cell(ids[0], org.id)).display, "ACME");
assert.equal((await cell(ids[0], ind.id)).display, "software");
assert.equal((await cell(ids[2], org.id)).status, "skipped");                 // empty domain → no call, no credits
assert.equal(calls.filter((c) => c.id === "apollo:organizations.enrich").length, 2);
assert.equal(await cell(ids[0], em.id), null);                                 // not auto-run → untouched

// Waterfall: Bob → getleads finds catch_all → keeps going → leadmagic ok. Ann → getleads empty → leadmagic ok.
await db.queueCells(em.id);
await W.drain(20000);
const bob = await cell(ids[0], em.id);
assert.equal(bob.display, "bob.stone@acme.com");
assert.equal(bob.value.verify, "ok");
assert.equal(bob.value.source, "leadmagic_email");
assert.equal((await cell(ids[1], em.id)).display, "ann.lee@beta.io");
assert.equal((await cell(ids[2], em.id)).display, "");                        // no name → GetLeads + LeadMagic skipped, Apollo no match
assert.ok(bob.credits > 3);

// Idempotency keys carry instance, row, column and attempt.
assert.ok(calls.every((c) => /^ct-[0-9a-f]{8}-\d+-\d+-a\d+/.test(c.key || "")), "keys");

// Edit a text cell → cascade re-runs Domain → Company → Industry for that row only.
const before = calls.length;
const web = await db.one("SELECT id FROM columns WHERE table_id = $1 AND name = 'Website'", [t.id]);
await db.setText(ids[1], web.id, "gamma.dev");
await W.cascade(t.id, ["Website"], [ids[1]]);
await W.drain(20000);
assert.equal((await cell(ids[1], org.id)).display, "GAMMA");
assert.equal(calls.length - before, 1);

// Run "empty" only re-queues blank / skipped / error cells.
assert.equal(await db.queueCells(org.id, null, "empty"), 1);
await W.drain(20000);

// A second run adds to credits already spent.
const spent1 = Number((await cell(ids[0], org.id)).credits);
await db.queueCells(org.id, [ids[0]]);
await W.drain(20000);
const spent2 = Number((await cell(ids[0], org.id)).credits);
assert.ok(spent2 > spent1, `credits ${spent1} -> ${spent2}`);

// Editing an input while the cell is running keeps the old attempt, then drops its result.
await db.pool.query("UPDATE cells SET status = 'running', rerun = false, attempt = billed_attempt + 1 WHERE row_id = $1 AND column_id = $2", [String(ids[0]), org.id]);
assert.equal(await db.queueCells(org.id, [ids[0]]), 1);
let running = await cell(ids[0], org.id);
assert.equal(running.status, "running");
assert.equal(running.rerun, true);
assert.equal(await db.settleCell(ids[0], org.id, running.attempt, { status: "done", display: "STALE", value: null, credits: 0.5, error: null }), "requeued");
running = await cell(ids[0], org.id);
assert.equal(running.status, "queued");
assert.notEqual(running.display, "STALE");
assert.ok(Number(running.credits) >= spent2 + 0.5 - 1e-9);
await W.drain(20000);
assert.equal((await cell(ids[0], org.id)).display, "ACME");

// The same lead search does not insert the rows again, and a second pass does not requeue them.
const once = await db.insertRows(t.id, [{ "First name": "Dee" }, { "First name": "Eve" }], 7);
const twice = await db.insertRows(t.id, [{ "First name": "Dee" }, { "First name": "Eve" }], 7);
assert.deepEqual(once.map(String), twice.map(String));
assert.equal((await db.one("SELECT count(*)::int n FROM rows WHERE table_id = $1 AND source_key LIKE '7:%'", [t.id])).n, 2);
await W.queueNewRows(t.id, once);
const queued = await db.one("SELECT count(*)::int n FROM cells WHERE row_id = ANY($1::bigint[]) AND status = 'queued'", [once.map(String)]);
assert.ok(queued.n > 0);
await W.queueNewRows(t.id, twice);
assert.equal((await db.one("SELECT count(*)::int n FROM cells WHERE row_id = ANY($1::bigint[]) AND status = 'queued'", [once.map(String)])).n, queued.n);

// Change pages stay on the last row instead of jumping to now.
await db.pool.query("UPDATE cells SET updated_at = '2020-01-01T00:00:00Z'");
const stamp = (row: string | number, col: number, ts: string) => db.pool.query("UPDATE cells SET updated_at = $3 WHERE row_id = $1 AND column_id = $2", [String(row), col, ts]);
await stamp(ids[0], dom.id, "2024-01-01T00:00:01Z");
await stamp(ids[1], dom.id, "2024-01-01T00:00:02Z");
await stamp(ids[2], dom.id, "2024-01-01T00:00:03Z");
let page = await db.changedCells(t.id, "2023-01-01T00:00:00Z", 2);
assert.equal(page.cells.length, 2);
assert.equal(page.more, true);
page = await db.changedCells(t.id, page.now, 2);
assert.equal(page.more, false);
assert.equal(page.cells.length, 1);
assert.equal(String(page.cells[0].row_id), String(ids[2]));

// A tool error marks the cell error, does not throw, and does not wipe credits already spent.
const spent3 = Number((await cell(ids[0], org.id)).credits);
tools.setFake(async () => { throw new Error("API error (500): boom"); });
await db.queueCells(org.id, [ids[0]]);
await W.drain(20000);
const errCell = await cell(ids[0], org.id);
assert.equal(errCell.status, "error");
assert.match(errCell.error, /boom/);
assert.equal(Number(errCell.credits), spent3);

// An older database has rows without source_key. The index must be created after that column.
await db.pool.query("DROP INDEX IF EXISTS rows_source_key");
await db.pool.query("ALTER TABLE rows DROP COLUMN source_key");
await db.migrate();
assert.equal((await db.one("SELECT column_name FROM information_schema.columns WHERE table_name = 'rows' AND column_name = 'source_key'")).column_name, "source_key");
assert.equal((await db.one("SELECT indexname FROM pg_indexes WHERE indexname = 'rows_source_key'")).indexname, "rows_source_key");

const demoSource = await db.queueSource(t.id, "getleads_people", { jobTitles: "head of growth", limit: "10" });
const demoRow = await db.one("SELECT source, status, input FROM sources WHERE id = $1", [demoSource]);
assert.equal(demoRow.source, "getleads_people");
assert.equal(demoRow.status, "queued");
const demoInput = typeof demoRow.input === "string" ? JSON.parse(demoRow.input) : demoRow.input;
assert.equal(demoInput.jobTitles, "head of growth");
assert.equal(demoInput.limit, "10");
const demoCol = await db.addColumn(t.id, "HQ", "enrich", { preset: "apollo_company", inputs: { domain: "{{Domain}}" } }, false);
assert.equal(demoCol.name, "HQ");
const again = await db.addColumn(t.id, "HQ", "enrich", { preset: "apollo_company", inputs: { domain: "{{Domain}}" } }, false);
assert.equal(again.name, "HQ 2");
assert.equal(again.queued, 0);
const upper = await db.addColumn(t.id, "Upper", "formula", { expr: "upper({{First name}})" }, true);
assert.equal(upper.queued, ids.length + once.length);
const { handleApi } = await import("./api");
const changes = await (await handleApi("GET", new URL(`http://local/api/tables/${t.id}/changes`), null)).json() as { columns: [number, string, number][] };
assert.ok(changes.columns.some((c) => c[1] === "Upper"));
const { agentPrompt } = await import("./prompt");
const { projectSlug } = await import("./config");
assert.equal(projectSlug(), "enrichment-tables");
assert.match(agentPrompt("enrichment-tables"), /node cli\.mjs find 'new:Demo'/);
assert.match(agentPrompt("enrichment-tables"), /website or who I sell to/);
assert.match(agentPrompt("enrichment-tables"), /waterfall/);

console.log("all tests passed");
await db.pool.end();
process.exit(0);
