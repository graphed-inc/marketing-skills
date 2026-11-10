import {
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../config";
import type { Database } from "./types";

// PGlite is one connection. Hold it for a whole Kysely transaction so a second
// query cannot land between BEGIN and COMMIT.
class PgliteDriver implements Driver {
  #tail: Promise<void> = Promise.resolve();

  constructor(private client: PGlite) {}

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    let release!: () => void;
    const previous = this.#tail;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    return new PgliteConnection(this.client, release);
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("begin"));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"));
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    (connection as PgliteConnection).release();
  }

  async destroy(): Promise<void> {
    await this.client.close();
  }
}

class PgliteConnection implements DatabaseConnection {
  constructor(private client: PGlite, private releaseLock: () => void) {}

  release(): void {
    this.releaseLock();
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.client.query<R>(compiledQuery.sql, [...compiledQuery.parameters]);
    const affected = (result as { affectedRows?: number }).affectedRows;
    return {
      rows: result.rows,
      numAffectedRows: affected == null ? undefined : BigInt(affected),
    };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("PGlite streaming is not used");
  }
}

// A relative default would follow the process cwd. Next starts in
// packages/dashboard and the CLI starts at the app root, so both use the
// project root, the same place local files already go.
export function pgliteDir(dir: string | undefined): string {
  return dir || join(projectRoot(), ".data", "pglite");
}

export async function openPglite(dir: string | undefined): Promise<Kysely<Database>> {
  const where = pgliteDir(dir);
  if (where !== "memory") mkdirSync(where, { recursive: true });
  const client = where === "memory" ? new PGlite() : new PGlite(where);
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new PgliteDriver(client),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}
