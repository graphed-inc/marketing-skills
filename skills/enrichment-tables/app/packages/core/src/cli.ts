// Terminal access to the cloud tables (run with `graphed exec --project <slug> -- node cli.mjs …`).
// The web service's worker does the work; this only reads and writes rows in Postgres.
//
//   node cli.mjs tables                         list tables
//   node cli.mjs columns <table>                columns with progress + credits
//   node cli.mjs status <table>                 same, plus the latest lead searches
//   node cli.mjs csv <table>                    CSV to stdout
//   node cli.mjs import <table|new:Name> <file> import a CSV file (path inside the container: pipe with -)
//   node cli.mjs find <table|new:Name> <source> '<json>'
//   node cli.mjs column <table> <type> <name> '<json>' [auto]
//   node cli.mjs run <columnId> [all|empty]     queue a column
import { readFileSync } from "node:fs";
import { q, one, columnsOf, queueCells, insertRows, queueSource, addColumn, pool } from "./tables";
import { parseCsv, toCsv } from "./template";
import { queueNewRows } from "./worker";
import { estimate } from "./runner";
import { validateColumn, type ColumnConfig } from "./api";
import { sourceById } from "./presets";

const [cmd, a, b, c, d] = process.argv.slice(2);
const out = (s: string) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");

function jsonObject(raw: string, label: string): object {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (e) { throw new Error(`${label} is not JSON (${e instanceof Error ? e.message : e})`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

function stringFields(raw: string, label: string): Record<string, string> {
  const parsed = jsonObject(raw, label);
  const out: Record<string, string> = {};
  for (const key of Object.keys(parsed)) {
    const value = Reflect.get(parsed, key);
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = String(value);
    else throw new Error(`${key} must be a string`);
  }
  return out;
}

async function tableRef(x: string): Promise<number> {
  if (String(x).startsWith("new:")) {
    const name = x.slice(4).trim().slice(0, 200) || "Demo";
    const t = await one<{ id: number }>("INSERT INTO tables (name) VALUES ($1) RETURNING id", [name]);
    if (!t) throw new Error("could not create table");
    return t.id;
  }
  return tableId(x);
}

async function tableId(x: string): Promise<number> {
  if (/^\d+$/.test(String(x))) return Number(x);
  const t = await one("SELECT id FROM tables WHERE name = $1 ORDER BY id DESC LIMIT 1", [x]);
  if (!t) throw new Error(`no table "${x}"`);
  return t.id;
}

try {
  if (cmd === "tables") {
    for (const t of await q(`SELECT t.id, t.name, (SELECT count(*)::int FROM rows r WHERE r.table_id = t.id) n FROM tables t ORDER BY t.id`))
      out(`${t.id}\t${t.n} rows\t${t.name}`);
  } else if (cmd === "columns" || cmd === "status") {
    const id = await tableId(a);
    const stats = new Map((await q(
      `SELECT column_id, count(*) FILTER (WHERE status='queued')::int q, count(*) FILTER (WHERE status='running')::int r,
              count(*) FILTER (WHERE status='error')::int e, count(*) FILTER (WHERE status='done' AND coalesce(display,'')<>'')::int f,
              coalesce(sum(credits),0)::float cr
       FROM cells WHERE column_id IN (SELECT id FROM columns WHERE table_id = $1) GROUP BY column_id`, [id])).map((s) => [s.column_id, s]));
    for (const c of await columnsOf(id)) {
      const s = stats.get(c.id) || { q: 0, r: 0, e: 0, f: 0, cr: 0 };
      out(`${c.id}\t${c.type}\t${c.name}\tfilled ${s.f}  queued ${s.q}  running ${s.r}  errors ${s.e}  credits ${s.cr.toFixed(2)}  (≈${estimate(c)}/row)${c.auto_run ? "  auto" : ""}`);
    }
    if (cmd === "status") {
      for (const s of await q("SELECT id, source, status, added, error FROM sources WHERE table_id = $1 ORDER BY id DESC LIMIT 5", [id]))
        out(`source ${s.id}\t${s.source}\t${s.status}\tadded ${s.added}${s.error ? `\t${String(s.error).slice(0, 200)}` : ""}`);
    }
  } else if (cmd === "csv") {
    const id = await tableId(a);
    const cols = await columnsOf(id);
    const rows = await q("SELECT id FROM rows WHERE table_id = $1 ORDER BY id", [id]);
    const lines = [cols.map((c) => c.name)];
    for (let i = 0; i < rows.length; i += 2000) {
      const ids = rows.slice(i, i + 2000).map((r) => String(r.id));
      const m = new Map((await q("SELECT row_id, column_id, display FROM cells WHERE row_id = ANY($1::bigint[])", [ids])).map((c) => [`${c.row_id}:${c.column_id}`, c.display ?? ""]));
      for (const r of ids) lines.push(cols.map((c) => m.get(`${r}:${c.id}`) ?? ""));
    }
    process.stdout.write(toCsv(lines));
  } else if (cmd === "import") {
    let id;
    if (String(a).startsWith("new:")) id = (await one("INSERT INTO tables (name) VALUES ($1) RETURNING id", [a.slice(4)])).id;
    else id = await tableId(a);
    const text = b === "-" || !b ? readFileSync(0, "utf8") : readFileSync(b, "utf8");
    const rows = parseCsv(text);
    const header = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
    const ids = await insertRows(id, rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))));
    await queueNewRows(id, ids);
    out(`table ${id}: added ${ids.length} rows`);
  } else if (cmd === "find") {
    if (!sourceById[b]) throw new Error(`unknown source ${b}`);
    const id = await tableRef(a);
    const sourceId = await queueSource(id, b, stringFields(c, "lead search input"));
    out(`table ${id}: queued ${b} as source ${sourceId}. Rows appear when the web worker finishes.`);
  } else if (cmd === "column") {
    const id = await tableId(a);
    const type = b || "text";
    const config = validateColumn(type, jsonObject(d || "{}", "column config") as ColumnConfig);
    const col = await addColumn(id, c || type, type, config, process.argv[7] === "auto" || type === "formula");
    out(`column ${col.id}\t${type}\t${col.name}\tqueued ${col.queued}`);
  } else if (cmd === "run") {
    const n = await queueCells(Number(a), null, b || "all");
    out(`queued ${n} cells`);
  } else {
    out("usage: node cli.mjs tables | columns <table> | status <table> | csv <table> | import <table|new:Name> <file|-> | find <table|new:Name> <source> '<json>' | column <table> <type> <name> '<json>' [auto] | run <columnId> [all|empty]");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
await pool.end();
