import { promises as fs } from "node:fs";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Kysely 0.29 moved the migrator out of the package root. Importing it from
// "kysely" typechecks as an error and fails at runtime.
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { destroyDb, getDb } from "./index";

// Applies every pending migration in src/migrations/ (numbered TS modules
// exporting up/down, same convention as the rest of the fleet). Kysely tracks
// applied migrations in its own kysely_migration table.
const migrationFolder = path.resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

async function main(): Promise<void> {
  const migrator = new Migrator({
    db: getDb(),
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === "Success") {
      console.log(`Applied ${result.migrationName}`);
    }
  }

  if (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } else if (!results || results.length === 0) {
    console.log("Migrations already up to date.");
  }

  await destroyDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
