// Background worker. Cells with status "queued" are the work queue.
//
// - A cell runs only when no column to its LEFT in the same row is still queued/running, so
//   {{Column}} inputs are always final before a dependent column reads them.
// - When a cell finishes (or a text cell is edited), every auto-run column that reads that
//   column is queued for the same row: Clay's "auto-update".
// - Every Graphed Tools call uses the key ct-<instance>-<row>-<col>-a<attempt>. A deploy that
//   kills a run mid-flight requeues it (stale heartbeat) with the same attempt, so the replay
//   returns the finished vendor run for free.
import { coreEnv } from "./config";
import { pool, q, one, instanceId, rowContexts, queueCells, insertRows, settleCell } from "./tables";
import { deps, getPath } from "./template";
import { runCell } from "./runner";
import { tool, lanes } from "./tools";
import { sourceById } from "./presets";

function laneCount(): number {
  return Number(coreEnv().WORKER_LANES || 12);
}

type SourceJob = {
  id: number;
  table_id: number;
  source: string;
  input: Record<string, string> | null;
};
const STALE_MIN = 5;
let running = false;
let stop = false;
let inFlight = 0;

async function claim(n: number) {
  return q(
    `UPDATE cells SET status = 'running', heartbeat_at = now(), updated_at = now()
     WHERE (row_id, column_id) IN (
       SELECT c.row_id, c.column_id FROM cells c JOIN columns col ON col.id = c.column_id
       WHERE c.status = 'queued' AND NOT EXISTS (
         SELECT 1 FROM cells c2 JOIN columns col2 ON col2.id = c2.column_id
         WHERE c2.row_id = c.row_id AND col2.position < col.position AND c2.status IN ('queued', 'running'))
       ORDER BY col.position, c.row_id
       LIMIT $1
       FOR UPDATE OF c SKIP LOCKED)
     RETURNING row_id, column_id, attempt`, [n]);
}

// Columns with auto_run that read `changedName` → queue them for these rows.
export async function cascade(tableId: number, changedNames: string[], rowIds: Array<string | number>): Promise<void> {
  if (!rowIds.length) return;
  const cols = await q("SELECT * FROM columns WHERE table_id = $1", [tableId]);
  const names = cols.map((c) => c.name);
  for (const c of cols) {
    if (!c.auto_run || c.type === "text" || changedNames.includes(c.name)) continue;
    const d = deps(c.config, names);
    if (d.some((n) => changedNames.includes(n))) await queueCells(c.id, rowIds);
  }
}

// New rows: queue every auto-run column (formulas included) that does not have a cell yet.
// Replaying an import therefore does not pay for rows that already ran.
export async function queueNewRows(tableId: number, rowIds: Array<string | number>): Promise<void> {
  if (!rowIds.length) return;
  const cols = await q("SELECT id FROM columns WHERE table_id = $1 AND auto_run AND type <> 'text' ORDER BY position", [tableId]);
  for (const c of cols) await queueCells(c.id, rowIds, "new");
}

async function process1(cell: { row_id: string | number; column_id: number; attempt: number }): Promise<void> {
  const col = await one("SELECT * FROM columns WHERE id = $1", [cell.column_id]);
  if (!col) return;
  const { ctx } = await rowContexts(col.table_id, [cell.row_id]);
  const inst = await instanceId();
  const key = `ct-${inst}-${cell.row_id}-${col.id}-a${cell.attempt}`;
  const beat = setInterval(() => pool.query("UPDATE cells SET heartbeat_at = now() WHERE row_id = $1 AND column_id = $2", [String(cell.row_id), col.id]).catch(() => {}), 60_000);
  let r;
  try {
    r = await runCell(col, ctx.get(String(cell.row_id)), key);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    r = { status: "error", display: "", value: null, credits: 0, error: message.slice(0, 1000) };
  } finally { clearInterval(beat); }
  let value = r.value;
  if (value !== null && value !== undefined) {
    const s = JSON.stringify(value);
    if (s.length > 400_000) value = { truncated: true, preview: s.slice(0, 20000) };
  }
  // A rerun flag means an input changed while this attempt was in flight. settleCell then
  // keeps the credits and queues a new attempt instead of saving the stale value.
  const how = await settleCell(cell.row_id, col.id, cell.attempt, {
    status: r.status, display: r.display ?? "", value, error: ("error" in r ? r.error : null) || ("note" in r ? r.note : null) || null, credits: r.credits || 0,
  });
  if (how === "saved" && r.status !== "error") await cascade(col.table_id, [col.name], [cell.row_id]);
}

// ---------- lead sources (Find people / companies) ----------
async function processSource(src: SourceJob): Promise<void> {
  const def = sourceById[src.source];
  try {
    if (!def) throw new Error(`unknown source ${src.source}`);
    const inst = await instanceId();
    const result = await tool(def.tool, def.body(src.input || {}), `ct-${inst}-src${src.id}`);
    const items = def.items(result);
    const objs = items.map((it) => {
      const o: Record<string, string> = {};
      for (const [col, path] of Object.entries(def.columns as unknown as Record<string, string>)) {
        const v = getPath(it, path);
        if (v != null && v !== "") o[col] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      return o;
    }).filter((o) => Object.keys(o).length);
    const ids = await insertRows(src.table_id, objs, src.id);
    await queueNewRows(src.table_id, ids);
    const credits = def.rateUnit === "search" ? def.rate : def.rate * items.length;
    const added = await one("SELECT count(*)::int n FROM rows WHERE table_id = $1 AND source_key LIKE $2", [src.table_id, `${src.id}:%`]);
    await pool.query("UPDATE sources SET status = 'done', added = $2, credits = $3, heartbeat_at = NULL WHERE id = $1", [src.id, added.n, credits]);
  } catch (e) {
    await pool.query("UPDATE sources SET status = 'error', error = $2 WHERE id = $1", [src.id, String(e instanceof Error ? e.message : e).slice(0, 1000)]);
  }
}

async function loop() {
  let lastStale = 0;
  while (!stop) {
    try {
      if (Date.now() - lastStale > 60_000) {
        lastStale = Date.now();
        await pool.query(`UPDATE cells SET status = 'queued' WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '${STALE_MIN} minutes')`);
        await pool.query(`UPDATE sources SET status = 'queued' WHERE status = 'running' AND heartbeat_at < now() - interval '20 minutes'`);
      }
      const src = await one<SourceJob>(
        `UPDATE sources SET status = 'running', heartbeat_at = now() WHERE id = (
           SELECT id FROM sources WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`);
      if (src) processSource(src); // runs alongside cells; a long Maps scrape must not block the grid
      // Continuous lanes: a slow AI cell never holds up the next claim.
      const free = laneCount() - inFlight;
      if (free <= 0) { await sleep(100); continue; }
      const cells = await claim(free);
      for (const c of cells) {
        inFlight++;
        process1(c).catch((e) => console.error("cell:", e instanceof Error ? e.message : e)).finally(() => { inFlight--; });
      }
      await sleep(cells.length ? 30 : 700);
    } catch (e) {
      console.error("worker:", e instanceof Error ? e.message : e);
      await sleep(3000);
    }
  }
  running = false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startWorker() {
  if (running) return;
  running = true; stop = false;
  loop();
}
export function stopWorker() { stop = true; }

// For tests and the CLI: run until the queue is empty.
export async function drain(timeoutMs = 60_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const cells = await claim(laneCount() * 4);
    if (!cells.length) {
      const left = await one("SELECT count(*)::int n FROM cells WHERE status IN ('queued', 'running')");
      if (!left.n) return;
      await sleep(100);
      continue;
    }
    await lanes(cells, laneCount(), process1);
  }
  throw new Error("drain timeout");
}
