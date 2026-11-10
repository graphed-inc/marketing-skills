// HTTP API for the spreadsheet. Next.js route handlers call handleApi.
import { pool, q, one, columnsOf, queueCells, setText, insertRows, nextPositionAfter, changedCells } from "./tables";
import { cascade, queueNewRows } from "./worker";
import { publicPresets, publicSources, byId, sourceById, guessInputs } from "./presets";
import { parseCsv, toCsv, leafPaths, renameTokens, deps } from "./template";
import { estimate, compileFormula } from "./runner";
import { llm, MODELS, DEFAULT_MODEL, usageCredits } from "./tools";
import { projectSlug } from "./config";
import { agentPrompt } from "./prompt";

const TYPES = ["text", "formula", "enrich", "waterfall", "ai", "http"];

export type ColumnConfig = {
  expr?: string;
  preset?: string;
  tool?: string;
  body?: string;
  steps?: { preset?: string }[];
  prompt?: string;
  url?: string;
  runIf?: string;
  inputs?: Record<string, string>;
  source?: number;
};

type OutputField = { path?: string; name?: string };

type RequestBody = {
  name?: string;
  columns?: string[];
  auto_run?: boolean | null;
  rows?: Record<string, string>[];
  count?: number;
  ids?: Array<string | number>;
  csv?: string;
  type?: string;
  config?: ColumnConfig;
  after?: number;
  outputs?: OutputField[];
  run?: string;
  width?: number;
  position?: number | null;
  rowIds?: Array<string | number>;
  mode?: string;
  text?: string;
  source?: string;
  input?: Record<string, string>;
  tableId?: number;
  description?: string;
};

// ---------- tiny router ----------
type Handler = (params: Record<string, string>, body: RequestBody, url: URL) => Promise<unknown>;
const routes: { method: string; re: RegExp; keys: string[]; fn: Handler }[] = [];
const route = (method: string, pattern: string, fn: Handler) => {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, fn });
};
class HttpError extends Error { code: number; constructor(code: number, msg: string) { super(msg); this.code = code; } }
const bad = (msg: string): never => { throw new HttpError(400, msg); };

function present(body: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && Reflect.get(body, key) !== undefined;
}

function expectString(body: object, key: string): void {
  if (present(body, key) && typeof Reflect.get(body, key) !== "string") bad(`${key} must be a string`);
}

function expectNumber(body: object, key: string): void {
  if (present(body, key) && typeof Reflect.get(body, key) !== "number") bad(`${key} must be a number`);
}

function expectFlag(body: object, key: string): void {
  if (!present(body, key)) return;
  const value = Reflect.get(body, key);
  if (value !== null && typeof value !== "boolean") bad(`${key} must be a boolean`);
}

function expectStringList(body: object, key: string): void {
  if (!present(body, key)) return;
  const value = Reflect.get(body, key);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) bad(`${key} must be a list of strings`);
}

function expectIdList(body: object, key: string): void {
  if (!present(body, key)) return;
  const value = Reflect.get(body, key);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" && typeof item !== "number")) bad(`${key} must be a list of ids`);
}

function expectRecord(body: object, key: string): void {
  if (!present(body, key)) return;
  const value = Reflect.get(body, key);
  if (!value || typeof value !== "object" || Array.isArray(value)) bad(`${key} must be an object`);
}

// Checks the fields each route reads, and returns the same object so nested
// column settings (model, web, inputs, headers) are stored unchanged.
function requestBody(body: object): RequestBody {
  for (const key of ["name", "csv", "type", "run", "mode", "text", "source", "description"]) expectString(body, key);
  expectStringList(body, "columns");
  expectFlag(body, "auto_run");
  if (present(body, "rows")) {
    const rows = Reflect.get(body, "rows");
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) bad("rows must be a list of objects");
  }
  for (const key of ["count", "after", "width", "tableId"]) expectNumber(body, key);
  expectIdList(body, "ids");
  expectIdList(body, "rowIds");
  expectRecord(body, "config");
  if (present(body, "outputs")) {
    const outputs = Reflect.get(body, "outputs");
    if (!Array.isArray(outputs) || outputs.some((item) => !item || typeof item !== "object" || Array.isArray(item))) bad("outputs must be a list of objects");
    for (const item of outputs) {
      if (present(item, "path") && typeof Reflect.get(item, "path") !== "string") bad("output path must be a string");
      if (present(item, "name") && typeof Reflect.get(item, "name") !== "string") bad("output name must be a string");
    }
  }
  if (present(body, "position")) {
    const position = Reflect.get(body, "position");
    if (position !== null && typeof position !== "number") bad("position must be a number");
  }
  expectRecord(body, "input");
  if (present(body, "input")) {
    const input = Reflect.get(body, "input");
    for (const key of Object.keys(input)) {
      if (typeof Reflect.get(input, key) !== "string") bad("source input values must be strings");
    }
  }
  return body as RequestBody;
}
const need = <T>(v: T, msg?: string): NonNullable<T> => { if (!v) throw new HttpError(404, msg || "not found"); return v as NonNullable<T>; };

// ---------- helpers ----------
async function columnStats(tableId: number) {
  return q(
    `SELECT c.column_id,
       count(*) FILTER (WHERE c.status = 'queued')::int  AS queued,
       count(*) FILTER (WHERE c.status = 'running')::int AS running,
       count(*) FILTER (WHERE c.status = 'error')::int   AS errors,
       count(*) FILTER (WHERE c.status = 'done' AND coalesce(c.display, '') <> '')::int AS filled,
       coalesce(sum(c.credits), 0)::float AS credits
     FROM cells c JOIN columns col ON col.id = c.column_id
     WHERE col.table_id = $1 GROUP BY c.column_id`, [tableId]);
}

async function tableInfo(id: number) {
  const t = need(await one("SELECT * FROM tables WHERE id = $1", [id]), "table not found");
  const cols = await columnsOf(id);
  const stats = new Map((await columnStats(id)).map((s) => [s.column_id, s]));
  const { n } = await one("SELECT count(*)::int n FROM rows WHERE table_id = $1", [id]);
  const names = cols.map((c) => c.name);
  return {
    ...t, rowCount: n,
    columns: cols.map((c) => ({
      ...c, deps: deps(c.config, names).filter((d) => d !== c.name), perRow: estimate(c),
      stats: stats.get(c.id) || { queued: 0, running: 0, errors: 0, filled: 0, credits: 0 },
    })),
  };
}

export function validateColumn(type: string, config: ColumnConfig | undefined) {
  if (!TYPES.includes(type)) bad(`type must be one of ${TYPES.join(", ")}`);
  config = config || {};
  if (type === "formula") { try { compileFormula(config.expr); } catch (e) { bad(`formula: ${(e as Error).message}`); } }
  if (type === "enrich") {
    if (!byId[config.preset || ""]) bad("pick an enrichment");
    if (config.preset === "custom") {
      if (!config.tool) bad("custom tool: enter a tool id");
      try { JSON.parse(config.body || "{}"); } catch (e) { bad(`custom tool body is not JSON: ${(e as Error).message}`); }
    }
  }
  if (type === "waterfall") {
    const steps = Array.isArray(config.steps) ? config.steps : [];
    if (!steps.length) bad("waterfall needs at least one step");
    for (const s of steps) if (!byId[s.preset || ""]) bad(`unknown step ${s.preset}`);
  }
  if (type === "ai" && !String(config.prompt || "").trim()) bad("AI column needs a prompt");
  if (type === "http" && !String(config.url || "").trim()) bad("HTTP column needs a URL");
  if (config.runIf) { try { compileFormula(config.runIf); } catch (e) { bad(`run condition: ${(e as Error).message}`); } }
  return config;
}

async function uniqueName(tableId: number, name: string) {
  name = String(name || "").trim() || "Column";
  const have = new Set((await columnsOf(tableId)).map((c) => c.name));
  if (!have.has(name)) return name;
  for (let i = 2; ; i++) if (!have.has(`${name} ${i}`)) return `${name} ${i}`;
}

async function runMode(colId: number, run: string) {
  if (run === "all") return queueCells(colId, null, "all");
  if (run === "first10") return queueCells(colId, null, "all", 10);
  if (run === "empty") return queueCells(colId, null, "empty");
  return 0;
}

// ---------- routes ----------
route("GET", "/health", async () => ({ ok: true }));

route("GET", "/api/meta", async () => {
  const slug = projectSlug();
  return {
    presets: publicPresets(), sources: publicSources(), models: MODELS, defaultModel: DEFAULT_MODEL,
    slug, agentPrompt: agentPrompt(slug),
  };
});

route("GET", "/api/tables", async () => q(
  `SELECT t.*, (SELECT count(*)::int FROM rows r WHERE r.table_id = t.id) AS "rowCount"
   FROM tables t ORDER BY t.updated_at DESC`));

route("POST", "/api/tables", async (_, b) => {
  const t = await one("INSERT INTO tables (name) VALUES ($1) RETURNING *", [String(b.name || "Untitled table").slice(0, 200)]);
  for (const [i, name] of (b.columns || []).entries()) {
    await pool.query("INSERT INTO columns (table_id, name, type, position) VALUES ($1, $2, 'text', $3)", [t.id, String(name), i + 1]);
  }
  return tableInfo(t.id);
});

route("GET", "/api/tables/:id", async ({ id }) => tableInfo(Number(id)));
route("PATCH", "/api/tables/:id", async ({ id }, b) => {
  if (b.name) await pool.query("UPDATE tables SET name = $2, updated_at = now() WHERE id = $1", [id, String(b.name).slice(0, 200)]);
  // Table-wide auto-update: every paid column (formulas always stay on).
  if (b.auto_run != null) await pool.query("UPDATE columns SET auto_run = $2 WHERE table_id = $1 AND type NOT IN ('text', 'formula')", [id, !!b.auto_run]);
  return tableInfo(Number(id));
});
route("DELETE", "/api/tables/:id", async ({ id }) => { await pool.query("DELETE FROM tables WHERE id = $1", [id]); return { ok: true }; });

route("POST", "/api/tables/:id/duplicate", async ({ id }) => {
  const t = need(await one("SELECT * FROM tables WHERE id = $1", [id]));
  const n = await one("INSERT INTO tables (name) VALUES ($1) RETURNING *", [`${t.name} (copy)`]);
  for (const c of await columnsOf(t.id)) {
    await pool.query("INSERT INTO columns (table_id, name, type, config, position, auto_run, width) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [n.id, c.name, c.type, JSON.stringify(c.config), c.position, false, c.width]);
  }
  return tableInfo(n.id);
});

// Rows with cells: { total, rows: [{ id, c: { colId: [display, status, note] } }] }
route("GET", "/api/tables/:id/rows", async ({ id }, _, url) => {
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Math.min(Number(url.searchParams.get("limit") || 1000), 5000);
  const { now } = await one("SELECT now() AS now");
  const rows = await q("SELECT id FROM rows WHERE table_id = $1 ORDER BY id OFFSET $2 LIMIT $3", [id, offset, limit]);
  const ids = rows.map((r) => String(r.id));
  const cells = ids.length ? await q(
    "SELECT row_id, column_id, left(display, 300) AS d, status, left(error, 200) AS e FROM cells WHERE row_id = ANY($1::bigint[])", [ids]) : [];
  const byRow = new Map<string, Record<string, [string, string, string]>>(ids.map((i) => [i, {}]));
  for (const c of cells) {
    const row = byRow.get(String(c.row_id));
    if (row) row[c.column_id] = [c.d ?? "", c.status, c.e || ""];
  }
  const { n } = await one("SELECT count(*)::int n FROM rows WHERE table_id = $1", [id]);
  return { total: n, now, rows: ids.map((i) => ({ id: i, c: byRow.get(i) })) };
});

// Cells changed since a cursor. A full page's cursor is the last cell, not the clock.
route("GET", "/api/tables/:id/changes", async ({ id }, _, url) => {
  const page = await changedCells(Number(id), url.searchParams.get("since"), 20000);
  const stats = await columnStats(Number(id));
  const { n } = await one("SELECT count(*)::int n FROM rows WHERE table_id = $1", [id]);
  const sources = await q("SELECT id, source, status, error, added, credits, created_at FROM sources WHERE table_id = $1 ORDER BY id DESC LIMIT 10", [id]);
  const columns = (await columnsOf(Number(id))).map((c) => [c.id, c.name, c.position]);
  return {
    now: page.now, more: page.more, rowCount: n, stats, sources, columns,
    cells: page.cells.map((c) => [String(c.row_id), c.column_id, c.d ?? "", c.status, c.e || ""]),
  };
});

route("POST", "/api/tables/:id/rows", async ({ id }, b) => {
  const objs = Array.isArray(b.rows) ? b.rows : Array.from({ length: Math.min(Number(b.count) || 1, 1000) }, () => ({}));
  const ids = await insertRows(Number(id), objs);
  await queueNewRows(Number(id), ids);
  return { ids };
});

route("POST", "/api/tables/:id/rows/delete", async ({ id }, b) => {
  const ids = (b.ids || []).map(String);
  if (!ids.length) return { deleted: 0 };
  const r = await pool.query("DELETE FROM rows WHERE table_id = $1 AND id = ANY($2::bigint[])", [id, ids]);
  return { deleted: r.rowCount };
});

route("POST", "/api/tables/:id/import", async ({ id }, b) => {
  const rows = parseCsv(b.csv || "");
  if (rows.length < 2) bad("CSV needs a header row and at least one data row");
  const header = rows[0].map((h, i) => String(h || "").trim() || `Column ${i + 1}`);
  const objs = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  const ids = await insertRows(Number(id), objs);
  await queueNewRows(Number(id), ids);
  return { added: ids.length, columns: header };
});

route("GET", "/api/tables/:id/export.csv", async ({ id }) => {
  const cols = await columnsOf(Number(id));
  const rows = await q("SELECT id FROM rows WHERE table_id = $1 ORDER BY id", [id]);
  const out = [cols.map((c) => c.name)];
  for (let i = 0; i < rows.length; i += 2000) {
    const ids = rows.slice(i, i + 2000).map((r) => String(r.id));
    const cells = await q("SELECT row_id, column_id, display FROM cells WHERE row_id = ANY($1::bigint[])", [ids]);
    const m = new Map();
    for (const c of cells) m.set(`${c.row_id}:${c.column_id}`, c.display ?? "");
    for (const rid of ids) out.push(cols.map((c) => m.get(`${rid}:${c.id}`) ?? ""));
  }
  const t = await one("SELECT name FROM tables WHERE id = $1", [id]);
  return { __raw: toCsv(out), type: "text/csv; charset=utf-8", filename: `${(t?.name || "table").replace(/[^\w.-]+/g, "-")}.csv` };
});

route("POST", "/api/tables/:id/columns", async ({ id }, b) => {
  const tableId = Number(id);
  const type = b.type || "text";
  const config = validateColumn(type, b.config);
  const name = await uniqueName(tableId, b.name || byId[config.preset || ""]?.name || type);
  const cols = await columnsOf(tableId);
  let pos = cols.length ? Math.max(...cols.map((c) => c.position)) + 1 : 1;
  if (b.after) { const a = cols.find((c) => c.id === Number(b.after)); if (a) pos = await nextPositionAfter(tableId, a.position); }
  const autoRun = b.auto_run ?? (type === "formula");
  const col = await one(
    "INSERT INTO columns (table_id, name, type, config, position, auto_run) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [tableId, name, type, JSON.stringify(config), pos, !!autoRun]);
  // "Add as columns": one formula column per picked output field, right after the new column.
  let at = col.position;
  for (const o of b.outputs || []) {
    if (!o || !o.path) continue;
    at = await nextPositionAfter(tableId, at);
    const oname = await uniqueName(tableId, o.name || o.path);
    await pool.query(
      "INSERT INTO columns (table_id, name, type, config, position, auto_run) VALUES ($1,$2,'formula',$3,$4,true)",
      [tableId, oname, JSON.stringify({ expr: `{{${name}.${o.path}}}`, source: col.id }), at]);
  }
  const queued = type === "text" ? 0 : await runMode(col.id, b.run || (type === "formula" ? "all" : "none"));
  await pool.query("UPDATE tables SET updated_at = now() WHERE id = $1", [tableId]);
  return { column: col, queued, table: await tableInfo(tableId) };
});

route("PATCH", "/api/columns/:id", async ({ id }, b) => {
  const col = need(await one("SELECT * FROM columns WHERE id = $1", [id]), "column not found");
  if (b.name && b.name !== col.name) {
    const name = await uniqueName(col.table_id, b.name);
    const cols = await columnsOf(col.table_id);
    const names = cols.map((c) => c.name);
    for (const c of cols) {
      if (c.id === col.id) continue;
      const cfg = renameTokens(c.config, col.name, name, names);
      if (JSON.stringify(cfg) !== JSON.stringify(c.config)) await pool.query("UPDATE columns SET config = $2 WHERE id = $1", [c.id, JSON.stringify(cfg)]);
    }
    await pool.query("UPDATE columns SET name = $2 WHERE id = $1", [id, name]);
  }
  if (b.type && b.type !== col.type) {
    if (col.type === "text" || b.type === "text") bad("text columns cannot change type");
    validateColumn(b.type, b.config || col.config);
    await pool.query("UPDATE columns SET type = $2 WHERE id = $1", [id, b.type]);
  }
  if (b.config) await pool.query("UPDATE columns SET config = $2 WHERE id = $1", [id, JSON.stringify(validateColumn(b.type || col.type, b.config))]);
  if (b.auto_run != null) await pool.query("UPDATE columns SET auto_run = $2 WHERE id = $1", [id, !!b.auto_run]);
  if (b.width) await pool.query("UPDATE columns SET width = $2 WHERE id = $1", [id, Math.max(60, Math.min(900, Number(b.width)))]);
  if (b.position != null) await pool.query("UPDATE columns SET position = $2 WHERE id = $1", [id, Number(b.position)]);
  const queued = b.run ? await runMode(Number(id), b.run) : 0;
  return { queued, table: await tableInfo(col.table_id) };
});

route("DELETE", "/api/columns/:id", async ({ id }) => {
  const col = need(await one("SELECT * FROM columns WHERE id = $1", [id]));
  await pool.query("DELETE FROM columns WHERE id = $1", [id]);
  return tableInfo(col.table_id);
});

route("GET", "/api/columns/:id/estimate", async ({ id }, _, url) => {
  const col = need(await one("SELECT * FROM columns WHERE id = $1", [id]));
  const mode = url.searchParams.get("mode") || "all";
  let { n } = await one(
    `SELECT count(*)::int n FROM rows r LEFT JOIN cells c ON c.row_id = r.id AND c.column_id = $2
     WHERE r.table_id = $1 ${mode === "empty" ? "AND (c.row_id IS NULL OR c.status IN ('error','skipped') OR coalesce(c.display,'') = '')" : ""}`,
    [col.table_id, col.id]);
  if (mode === "first10") n = Math.min(10, n);
  const per = estimate(col);
  return { rows: n, perRow: per, total: Math.round(per * n * 100) / 100 };
});

route("POST", "/api/columns/:id/run", async ({ id }, b) => {
  const n = b.rowIds?.length ? await queueCells(Number(id), b.rowIds, b.mode || "all") : await runMode(Number(id), b.mode || "all");
  return { queued: n };
});

route("POST", "/api/columns/:id/stop", async ({ id }) => {
  const r = await pool.query("UPDATE cells SET status = 'skipped', error = 'stopped', updated_at = now() WHERE column_id = $1 AND status = 'queued'", [id]);
  return { stopped: r.rowCount };
});

route("GET", "/api/cells/:row/:col", async ({ row, col }) => {
  const c = await one("SELECT * FROM cells WHERE row_id = $1 AND column_id = $2", [row, col]);
  if (!c) return { row_id: row, column_id: Number(col), display: "", value: null, status: "", paths: [] };
  return { ...c, paths: c.value ? leafPaths(c.value).slice(0, 300) : [] };
});

route("PUT", "/api/cells/:row/:col", async ({ row, col }, b) => {
  const c = need(await one("SELECT * FROM columns WHERE id = $1", [col]));
  if (c.type !== "text") bad("only text cells can be edited");
  await setText(row, c.id, b.text);
  await cascade(c.table_id, [c.name], [row]);
  return { ok: true };
});

route("POST", "/api/cells/:row/:col/run", async ({ row, col }) => ({ queued: await queueCells(Number(col), [row], "all") }));

route("POST", "/api/tables/:id/sources", async ({ id }, b) => {
  if (!b.source || !sourceById[b.source]) bad("unknown source");
  return one("INSERT INTO sources (table_id, source, input) VALUES ($1, $2, $3) RETURNING *", [id, b.source, JSON.stringify(b.input || {})]);
});

route("GET", "/api/tables/:id/guess", async ({ id }, _, url) => {
  const p = need(byId[url.searchParams.get("preset") || ""], "unknown preset");
  const names = (await columnsOf(Number(id))).map((c) => c.name);
  return guessInputs(p, names);
});

// "Generate formula with AI": plain-English description → JS expression.
route("POST", "/api/ai/formula", async (_, b) => {
  const names = (await columnsOf(Number(b.tableId))).map((c) => c.name);
  const res = await llm().chat.completions.create({
    model: DEFAULT_MODEL, max_tokens: 400, temperature: 0,
    messages: [{ role: "system", content:
      `Write ONE JavaScript expression for a spreadsheet formula column. Reply with the expression only, no code fences.
Reference columns as {{Column Name}} (the cell text) or {{Column Name.path.to.field}} (a field inside a JSON cell).
Columns: ${JSON.stringify(names)}
Helpers available: domainOf(url), emailDomain(email), firstName(fullName), lastName(fullName), lower(s), upper(s), num(s), empty(v).
String methods toUpperCase, toLowerCase, trim, slice, includes, startsWith, endsWith, split, and replace are allowed.
Return "" when inputs are empty. One expression: comparisons, &&, ||, and ternaries are fine.
No statements, semicolons, loops, arrow functions, or global objects.` },
    { role: "user", content: String(b.description || "").slice(0, 2000) }],
  });
  const expr = String(res.choices[0].message.content || "").trim().replace(/^```\w*\n?|```$/g, "").trim();
  return { expr, credits: usageCredits(res.usage) };
});

route("GET", "/api/health", async () => ({ ok: true }));

export async function handleApi(method: string, url: URL, body: unknown): Promise<Response> {
  try {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] || "")]));
      const parsed = body && typeof body === "object" && !Array.isArray(body) ? requestBody(body) : {};
      const out = await r.fn(params, parsed, url) as { __raw?: string; type?: string; filename?: string } | null;
      if (out && out.__raw != null) {
        return new Response(out.__raw, {
          headers: { "content-type": out.type || "text/plain", "content-disposition": `attachment; filename="${out.filename}"` },
        });
      }
      return Response.json(out ?? null);
    }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    const err = e as { code?: number | string; message?: string };
    const code = e instanceof HttpError ? e.code : (err.code === "23505" ? 409 : 500);
    if (code === 500) console.error(method, url.pathname, e);
    return Response.json({ error: String(err.message || e) }, { status: code });
  }
}
