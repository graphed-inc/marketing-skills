import { pathToFileURL } from "node:url";
import { Migrator, type Migration, type MigrationProvider } from "kysely";
import { destroyDb, initDb } from "./index";
import * as ugc from "../migrations/0001_ugc";
import { ensureSchema } from "../migrations/0001_ugc";

// Migrations are imported here, not read off disk. The Next standalone server
// cannot import a loose .ts file, and the release command (`tsx`) uses this
// same list. Kysely records applied names in kysely_migration.
const migrations: Record<string, Migration> = {
  "0001_ugc": ugc,
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
  await ensureSchema(db);
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
