import { CompiledQuery } from "kysely";
import { destroyDb, initDb } from "./index";

export interface RawResult<T> {
  rows: T[];
  rowCount: number;
}

export async function raw<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<RawResult<T>> {
  const db = await initDb();
  const result = await db.executeQuery<T>(CompiledQuery.raw(text, params as unknown[]));
  return { rows: result.rows, rowCount: Number(result.numAffectedRows ?? result.rows.length) };
}

export async function q<T = any>(text: string, params: readonly unknown[] = []): Promise<T[]> {
  return (await raw<T>(text, params)).rows;
}

export async function one<T = any>(text: string, params: readonly unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

// The same shape the previous pg pool had, so callers can run a statement and read rowCount.
export const pool = {
  query: raw,
  end: destroyDb,
};

const VIDEO_FIELDS = new Set(["status", "stage", "error", "keys", "report", "steps", "credits", "secs", "words", "started_at", "finished_at", "attempt", "holder"]);
const PROJECT_FIELDS = new Set(["status", "stage", "error", "product", "insights", "brand", "credits", "threads"]);
const VIDEO_JSON = new Set(["keys", "report", "steps"]);
const PROJECT_JSON = new Set(["product", "insights"]);

export async function logVideo(id: unknown, line: string) {
  const stamp = new Date().toISOString().slice(11, 19);
  await pool.query("UPDATE videos SET log = log || $2, heartbeat_at = now() WHERE id = $1", [id, `${stamp} ${line}\n`]);
}

export async function setVideo(id: unknown, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter((k) => VIDEO_FIELDS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}${VIDEO_JSON.has(k) ? "::jsonb" : ""}`);
  await pool.query(`UPDATE videos SET ${sets.join(", ")}, heartbeat_at = now() WHERE id = $1`,
    [id, ...keys.map((k) => (VIDEO_JSON.has(k) ? JSON.stringify(fields[k]) : fields[k]))]);
}

export async function setProject(id: unknown, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter((k) => PROJECT_FIELDS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}${PROJECT_JSON.has(k) ? "::jsonb" : ""}`);
  await pool.query(`UPDATE projects SET ${sets.join(", ")}, updated_at = now(), heartbeat_at = now() WHERE id = $1`,
    [id, ...keys.map((k) => (PROJECT_JSON.has(k) ? JSON.stringify(fields[k]) : fields[k]))]);
}

// Queue a failed or canceled clip again. Refuses while a worker still holds it.
export async function retryVideo(id: unknown) {
  const row = await one(`UPDATE videos SET status = 'queued', error = NULL, attempt = attempt + 1
    WHERE id = $1 AND status IN ('error', 'canceled') AND holder IS NULL RETURNING id`, [id]);
  if (row) return { ok: true, held: false };
  const cur = await one<{ held: boolean }>("SELECT holder IS NOT NULL AS held FROM videos WHERE id = $1", [id]);
  if (cur && cur.held) return { ok: false, held: true };
  return { ok: true, held: false };
}
