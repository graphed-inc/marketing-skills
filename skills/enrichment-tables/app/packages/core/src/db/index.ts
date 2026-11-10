import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { coreEnv } from "../config";
import type { Database } from "./types";

// One pool per process. The globalThis stash survives Next.js dev hot-reloads
// and is harmless in short-lived job processes. Without DATABASE_URL the
// process uses embedded PGlite, so tests and a local run need no Postgres.
const globalForDb = globalThis as unknown as { __appDb?: Kysely<Database>; __appDbOpening?: Promise<Kysely<Database>> };

async function open(): Promise<Kysely<Database>> {
  const url = coreEnv().DATABASE_URL;
  if (url) {
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: url, max: 8 }) }),
    });
  }
  const { openPglite } = await import("./pglite");
  return openPglite(coreEnv().PGLITE_DIR);
}

export async function initDb(): Promise<Kysely<Database>> {
  if (globalForDb.__appDb) return globalForDb.__appDb;
  globalForDb.__appDbOpening ??= open().then((db) => {
    globalForDb.__appDb = db;
    return db;
  });
  return globalForDb.__appDbOpening;
}

export function getDb(): Kysely<Database> {
  if (!globalForDb.__appDb) throw new Error("Database is not open yet. Await initDb() first.");
  return globalForDb.__appDb;
}

export async function destroyDb(): Promise<void> {
  if (!globalForDb.__appDb) return;
  await globalForDb.__appDb.destroy();
  globalForDb.__appDb = undefined;
  globalForDb.__appDbOpening = undefined;
}
