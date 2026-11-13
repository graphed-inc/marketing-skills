import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { coreEnv } from "../config";
import type { Database } from "./types";

// One pool per process. The globalThis stash survives Next.js dev hot-reloads
// and is harmless in short-lived job processes. Without DATABASE_URL the
// process uses embedded PGlite, so tests and a local run need no Postgres.
type AppDbGlobal = typeof globalThis & {
  __appDb?: Kysely<Database>;
  __appDbOpening?: Promise<Kysely<Database>>;
};
const globalForDb = globalThis as AppDbGlobal;

async function open(): Promise<Kysely<Database>> {
  const env = coreEnv();
  // `PGLITE_DIR=memory` is the test switch. It wins over DATABASE_URL, including
  // a value loadLocalEnv() copied out of a project .env, so `npm test` cannot
  // migrate or write fixtures into a real database.
  if (env.PGLITE_DIR === "memory" || !env.DATABASE_URL) {
    const { openPglite } = await import("./pglite");
    return openPglite(env.PGLITE_DIR);
  }
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: env.DATABASE_URL, max: 8 }) }),
  });
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
