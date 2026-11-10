import { pathToFileURL } from "node:url";
import { Migrator, type Migration, type MigrationProvider } from "kysely";
import { destroyDb, initDb } from "./index";
import * as postEngagers from "../migrations/0001_post_engagers";
import * as fetchedAt from "../migrations/0002_fetched_at";
import { ensureSchema } from "../migrations/0001_post_engagers";
import { one } from "./sql";
import { setInstanceId } from "../store";

// Migrations are imported here, not read off disk. The Next standalone server
// cannot import a loose .ts file, and the release command (`tsx`) uses this
// same list. Kysely records applied names in kysely_migration.
const migrations: Record<string, Migration> = {
  "0001_post_engagers": postEngagers,
  "0002_fetched_at": fetchedAt,
};

class InCodeMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  }
}

export async function migrate(): Promise<void> {
  const db = await initDb();
  const migrator = new Migrator({ db, provider: new InCodeMigrationProvider() });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === "Success") console.log(`Applied ${result.migrationName}`);
  }
  if (error) throw error;
  // Repair a database whose migration row exists but whose columns were created
  // by an older build. ensureSchema is idempotent.
  await ensureSchema(db);
  const row = await one<{ value: string }>("SELECT value FROM meta WHERE key = 'instance'");
  if (row) setInstanceId(row.value.slice(0, 10));
}

async function main(): Promise<void> {
  try {
    await migrate();
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await destroyDb();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
