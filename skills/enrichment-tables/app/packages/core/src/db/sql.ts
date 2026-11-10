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
