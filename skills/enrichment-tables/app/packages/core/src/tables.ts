// Table, row, and cell operations. SQL stays here so the queue, credit totals, and
// change cursor behave the same as before. The schema itself is the Kysely migration.
import { one, pool, q } from "./db/sql";
export { one, pool, q };
export { migrate } from "./db/migrate";

let instance: string | undefined;
export async function instanceId(): Promise<string> {
  if (!instance) {
    const row = await one<{ value: string }>("SELECT value FROM meta WHERE key = 'instance'");
    if (!row) throw new Error("instance id missing");
    instance = row.value.slice(0, 8);
  }
  return instance;
}

export const columnsOf = (tableId: number) =>
  q("SELECT * FROM columns WHERE table_id = $1 ORDER BY position, id", [tableId]);

// Cells of some rows as Map(rowId → Map(columnName → { display, value, status })).
export async function rowContexts(tableId: number, rowIds: Array<string | number>) {
  const cols = await columnsOf(tableId);
  const nameOf = new Map(cols.map((c) => [c.id, c.name]));
  const out = new Map(rowIds.map((id) => [String(id), new Map()]));
  if (!rowIds.length) return { cols, ctx: out };
  const cells = await q(
    "SELECT row_id, column_id, display, value, status FROM cells WHERE row_id = ANY($1::bigint[])",
    [rowIds.map(String)],
  );
  for (const c of cells) {
    const m = out.get(String(c.row_id));
    if (m && nameOf.has(c.column_id)) m.set(nameOf.get(c.column_id), { display: c.display ?? "", value: c.value, status: c.status });
  }
  for (const m of out.values()) for (const c of cols) if (!m.has(c.name)) m.set(c.name, { display: "", value: null, status: "" });
  return { cols, ctx: out };
}

// Queue cells (insert or reset). rowIds null = every row of the column's table.
// mode: all | empty (only blank / error / skipped) | new (only rows with no cell yet).
// A cell that is already running is not restarted in place. It is marked rerun so the
// worker drops the result for the old inputs and queues a fresh attempt when it finishes.
export async function queueCells(columnId: number, rowIds: Array<string | number> | null = null, mode = "all", limit: number | null = null): Promise<number> {
  const col = await one("SELECT * FROM columns WHERE id = $1", [columnId]);
  if (!col || col.type === "text") return 0;
  const params = [col.table_id, columnId];
  let rowFilter = "";
  if (rowIds) { params.push(rowIds.map(String)); rowFilter = `AND r.id = ANY($${params.length}::bigint[])`; }
  const statusFilter = mode === "empty"
    ? "AND (c.row_id IS NULL OR (c.status <> 'running' AND (c.status IN ('error', 'skipped') OR coalesce(c.display, '') = '')))"
    : mode === "new"
      ? "AND c.row_id IS NULL"
      : "";
  let lim = "";
  if (limit) { params.push(Number(limit)); lim = `LIMIT $${params.length}`; }
  const rows = await q(
    `SELECT r.id, c.status FROM rows r LEFT JOIN cells c ON c.row_id = r.id AND c.column_id = $2
     WHERE r.table_id = $1 ${rowFilter} ${statusFilter} ORDER BY r.id ${lim}`, params);
  if (!rows.length) return 0;
  const running = rows.filter((r) => r.status === "running").map((r) => String(r.id));
  const queue = rows.filter((r) => r.status !== "running").map((r) => String(r.id));
  if (queue.length) await pool.query(
    `INSERT INTO cells (row_id, column_id, status, attempt, updated_at)
     SELECT unnest($1::bigint[]), $2, 'queued', 1, now()
     ON CONFLICT (row_id, column_id) DO UPDATE
       SET status = 'queued', error = NULL, rerun = false, attempt = cells.attempt + 1, updated_at = now()`,
    [queue, columnId]);
  if (running.length) await pool.query(
    "UPDATE cells SET rerun = true, updated_at = now() WHERE column_id = $1 AND status = 'running' AND row_id = ANY($2::bigint[])",
    [columnId, running]);
  return queue.length + running.length;
}

// Write a finished attempt. Credits accumulate once per attempt, so a free replay does not
// add the cost again and a later error does not wipe what was already spent.
// Returns "saved", "requeued" (inputs changed mid-run), or "lost" (attempt moved on).
export async function settleCell(rowId: string | number, columnId: number, attempt: number, fields: { status?: string; display?: string; value?: unknown; error?: string | null; credits?: number }): Promise<string> {
  const value = fields.value === undefined ? null : JSON.stringify(fields.value);
  const saved = await q(
    `UPDATE cells SET status = $3, display = $4, value = $5::jsonb, error = $6,
       credits = CASE WHEN billed_attempt = $8 THEN credits ELSE credits + $7 END,
       billed_attempt = $8, rerun = false, updated_at = now(), heartbeat_at = NULL
     WHERE row_id = $1 AND column_id = $2 AND attempt = $8 AND status = 'running' AND rerun = false
     RETURNING row_id`,
    [String(rowId), columnId, fields.status, fields.display ?? "", value, fields.error || null, fields.credits || 0, attempt]);
  if (saved.length) return "saved";
  const again = await q(
    `UPDATE cells SET
       credits = CASE WHEN billed_attempt = $4 THEN credits ELSE credits + $3 END,
       billed_attempt = $4, status = 'queued', rerun = false, error = NULL,
       attempt = attempt + 1, updated_at = now(), heartbeat_at = NULL
     WHERE row_id = $1 AND column_id = $2 AND attempt = $4 AND status = 'running' AND rerun = true
     RETURNING row_id`,
    [String(rowId), columnId, fields.credits || 0, attempt]);
  return again.length ? "requeued" : "lost";
}

// Set a text cell.
export async function setText(rowId: string | number, columnId: number, text: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO cells (row_id, column_id, display, value, status, updated_at) VALUES ($1, $2, $3, NULL, 'done', now())
     ON CONFLICT (row_id, column_id) DO UPDATE SET display = $3, value = NULL, status = 'done', error = NULL, updated_at = now()`,
    [String(rowId), columnId, text == null ? "" : String(text)]);
}

// Insert rows from plain objects { columnName: text }. Creates missing text columns.
// sourceId tags each row "<sourceId>:<index>" so replaying the same lead search inserts nothing
// the second time and does not overwrite cells the user already edited. Returns every row id
// for this batch, existing ones included.
export async function insertRows(tableId: number, objs: Record<string, unknown>[], sourceId: number | null = null): Promise<Array<string | number>> {
  if (!objs.length) return [];
  let cols = await columnsOf(tableId);
  const names = new Set(cols.map((c) => c.name));
  const want: string[] = [];
  for (const o of objs) for (const k of Object.keys(o)) if (!names.has(k) && !want.includes(k)) want.push(k);
  let pos = cols.length ? Math.max(...cols.map((c) => c.position)) : 0;
  // New source columns go to the left of computed columns, after the last text column.
  const lastText = cols.filter((c) => c.type === "text").pop();
  for (const name of want) {
    const at = lastText ? await nextPositionAfter(tableId, lastText.position) : ++pos;
    const c = await one("INSERT INTO columns (table_id, name, type, position) VALUES ($1, $2, 'text', $3) RETURNING *", [tableId, name, at]);
    lastText && (lastText.position = c.position);
    names.add(name);
  }
  cols = await columnsOf(tableId);
  const idOf = new Map(cols.map((c) => [c.name, c.id]));
  const ids: Array<string | number> = [];
  for (let i = 0; i < objs.length; i += 500) {
    const chunk = objs.slice(i, i + 500);
    let made;
    if (sourceId == null) {
      made = await q("INSERT INTO rows (table_id) SELECT $1 FROM generate_series(1, $2) RETURNING id", [tableId, chunk.length]);
    } else {
      const keys = chunk.map((_, j) => `${sourceId}:${i + j}`);
      await q(
        `INSERT INTO rows (table_id, source_key) SELECT $1, k FROM unnest($2::text[]) AS k
         ON CONFLICT (table_id, source_key) DO NOTHING`, [tableId, keys]);
      made = await q(
        "SELECT id, source_key FROM rows WHERE table_id = $1 AND source_key = ANY($2::text[])", [tableId, keys]);
      const byKey = new Map(made.map((r) => [r.source_key, r]));
      made = keys.map((k) => byKey.get(k));
    }
    const rIds: string[] = [], cIds: Array<number | undefined> = [], texts: string[] = [];
    made.forEach((r, j) => {
      ids.push(r.id);
      for (const [k, v] of Object.entries(chunk[j])) {
        if (v == null || v === "") continue;
        rIds.push(String(r.id)); cIds.push(idOf.get(k)); texts.push(typeof v === "object" ? JSON.stringify(v) : String(v));
      }
    });
    if (rIds.length) await pool.query(
      `INSERT INTO cells (row_id, column_id, display, status)
       SELECT * , 'done' FROM unnest($1::bigint[], $2::int[], $3::text[])
       ON CONFLICT (row_id, column_id) DO NOTHING`, [rIds, cIds, texts]);
  }
  await pool.query("UPDATE tables SET updated_at = now() WHERE id = $1", [tableId]);
  return ids;
}

export async function queueSource(tableId: number, source: string, input: Record<string, string>): Promise<number> {
  const row = await one<{ id: number }>(
    "INSERT INTO sources (table_id, source, input) VALUES ($1, $2, $3) RETURNING id",
    [tableId, source, JSON.stringify(input)],
  );
  if (!row) throw new Error("could not queue lead search");
  return row.id;
}

export async function addColumn(tableId: number, name: string, type: string, config: object, autoRun: boolean): Promise<{ id: number; name: string; queued: number }> {
  const cols = await columnsOf(tableId);
  const have = new Set(cols.map((c) => String(c.name)));
  let unique = name.trim() || "Column";
  if (have.has(unique)) {
    for (let i = 2; ; i++) if (!have.has(`${name.trim() || "Column"} ${i}`)) { unique = `${name.trim() || "Column"} ${i}`; break; }
  }
  const pos = cols.length ? Math.max(...cols.map((c) => Number(c.position))) + 1 : 1;
  const col = await one<{ id: number; name: string }>(
    "INSERT INTO columns (table_id, name, type, config, position, auto_run) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name",
    [tableId, unique, type, JSON.stringify(config), pos, autoRun],
  );
  if (!col) throw new Error("could not add column");
  // A formula has to run on rows that already exist. Auto-run only queues rows added later.
  const queued = type === "formula" ? await queueCells(col.id, null, "all") : 0;
  await pool.query("UPDATE tables SET updated_at = now() WHERE id = $1", [tableId]);
  return { id: col.id, name: col.name, queued };
}

// Cells changed since a cursor ("<iso>|<row id>|<column id>", or a bare timestamp).
// When the page is full, the next cursor is the last row so nothing between it and now is skipped.
export function parseCursor(raw: unknown): { t: string; row: string; col: number } {
  const s = String(raw || "");
  const m = s.match(/^(.*)\|(\d+)\|(\d+)$/);
  if (m) return { t: m[1], row: m[2], col: Number(m[3]) };
  return { t: s || "1970-01-01T00:00:00.000Z", row: "0", col: 0 };
}

export function formatCursor(t: unknown, row: unknown, col: unknown): string {
  const iso = t instanceof Date ? t.toISOString() : new Date(String(t)).toISOString();
  return `${iso}|${row}|${col}`;
}

export async function changedCells(tableId: number, since: unknown, limit = 20000) {
  const cur = parseCursor(since);
  // Captured before the read so a cell written during the query is fetched again, not skipped.
  const clock = await one("SELECT clock_timestamp() AS now");
  const rows = await q(
    `SELECT c.row_id, c.column_id, left(c.display, 300) AS d, c.status, left(c.error, 200) AS e, c.updated_at
     FROM cells c JOIN rows r ON r.id = c.row_id
     WHERE r.table_id = $1 AND (
       c.updated_at > $2::timestamptz
       OR (c.updated_at = $2::timestamptz AND (c.row_id > $3::bigint OR (c.row_id = $3::bigint AND c.column_id > $4::int)))
     )
     ORDER BY c.updated_at, c.row_id, c.column_id
     LIMIT $5`,
    [tableId, cur.t, cur.row, cur.col, limit + 1]);
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const now = more ? formatCursor(last.updated_at, last.row_id, last.column_id) : formatCursor(clock.now, 0, 0);
  return { cells: page, now, more };
}

async function nextPositionAfter(tableId: number, p: number): Promise<number> {
  const n = await one("SELECT min(position) AS p FROM columns WHERE table_id = $1 AND position > $2", [tableId, p]);
  return n && n.p != null ? (p + n.p) / 2 : p + 1;
}
export { nextPositionAfter };
