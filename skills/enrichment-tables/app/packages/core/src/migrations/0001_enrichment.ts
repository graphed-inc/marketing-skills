import { Kysely, sql } from "kysely";

// Enrichment spreadsheet. `up` is safe to run again: an older database already
// has these tables without source_key, billed_attempt, and rerun. Creating the
// index before that column exists is what used to stop the server from booting.
export async function ensureSchema(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("tables")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("columns")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("table_id", "integer", (col) => col.notNull().references("tables.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("config", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("position", "double precision", (col) => col.notNull())
    .addColumn("auto_run", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("width", "integer", (col) => col.notNull().defaultTo(180))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("columns_table_name", ["table_id", "name"])
    .execute();

  await db.schema
    .createTable("rows")
    .ifNotExists()
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("table_id", "integer", (col) => col.notNull().references("tables.id").onDelete("cascade"))
    .addColumn("source_key", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("cells")
    .ifNotExists()
    .addColumn("row_id", "bigint", (col) => col.notNull().references("rows.id").onDelete("cascade"))
    .addColumn("column_id", "integer", (col) => col.notNull().references("columns.id").onDelete("cascade"))
    .addColumn("display", "text")
    .addColumn("value", "jsonb")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("done"))
    .addColumn("error", "text")
    .addColumn("attempt", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("billed_attempt", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("rerun", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("heartbeat_at", "timestamptz")
    .addPrimaryKeyConstraint("cells_pkey", ["row_id", "column_id"])
    .execute();

  await db.schema
    .createTable("sources")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("table_id", "integer", (col) => col.notNull().references("tables.id").onDelete("cascade"))
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("input", "jsonb", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("error", "text")
    .addColumn("added", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("heartbeat_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("meta")
    .ifNotExists()
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .execute();

  // Tables created by an older build. CREATE TABLE IF NOT EXISTS does not add a column.
  await sql`ALTER TABLE cells ADD COLUMN IF NOT EXISTS billed_attempt int NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE cells ADD COLUMN IF NOT EXISTS rerun boolean NOT NULL DEFAULT false`.execute(db);
  await sql`ALTER TABLE rows ADD COLUMN IF NOT EXISTS source_key text`.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS rows_table ON rows(table_id, id)`.execute(db);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS rows_source_key ON rows(table_id, source_key)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS cells_status ON cells(status) WHERE status IN ('queued', 'running')`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS cells_column ON cells(column_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS cells_updated ON cells(updated_at)`.execute(db);
  await sql`INSERT INTO meta (key, value) VALUES ('instance', md5(random()::text || clock_timestamp()::text)) ON CONFLICT (key) DO NOTHING`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await ensureSchema(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("sources").ifExists().execute();
  await db.schema.dropTable("cells").ifExists().execute();
  await db.schema.dropTable("rows").ifExists().execute();
  await db.schema.dropTable("columns").ifExists().execute();
  await db.schema.dropTable("meta").ifExists().execute();
  await db.schema.dropTable("tables").ifExists().execute();
}
