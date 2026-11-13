import { CompiledQuery, type Kysely, type Transaction } from "kysely";
import { destroyDb, initDb } from "./index";
import type { Database } from "./types";

export interface RawResult<T> {
  rows: T[];
  rowCount: number;
}

export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<RawResult<T>>;
}

function clientFor(db: Kysely<Database> | Transaction<Database>): SqlClient {
  return {
    async query<T>(text: string, params: readonly unknown[] = []): Promise<RawResult<T>> {
      const result = await db.executeQuery<T>(CompiledQuery.raw(text, params as unknown[]));
      return {
        rows: result.rows,
        rowCount: Number(result.numAffectedRows ?? result.rows.length),
      };
    },
  };
}

export async function raw<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<RawResult<T>> {
  const db = await initDb();
  return clientFor(db).query<T>(text, params);
}

export async function q<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<T[]> {
  return (await raw<T>(text, params)).rows;
}

export async function one<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

// The same shape the previous pg pool had, so callers can run a statement and read rowCount.
export const pool = {
  query: raw,
  end: destroyDb,
};

export async function withTx<T>(fn: (c: SqlClient) => Promise<T>): Promise<T> {
  const db = await initDb();
  return db.transaction().execute(async (trx) => fn(clientFor(trx)));
}
