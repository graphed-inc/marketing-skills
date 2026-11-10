import { type Kysely, sql } from "kysely";
import type { Database } from "../db/types";

// Idempotent. createTable().ifNotExists() does not add columns, so the later
// addColumn().ifNotExists() calls stay for a database created by an older build.
// The migration name is already recorded on deployed databases; this body also
// runs again from ensureSchema on every boot.
async function apply(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("voices")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("voice_id", "text")
    .addColumn("ref_key", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("ready"))
    .addColumn("error", "text")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("avatars")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("persona", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("tags", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("voice", "text", (col) => col.notNull().defaultTo("default"))
    .addColumn("image_key", "text", (col) => col.notNull())
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("thumb_key", "text")
    .execute();

  await db.schema
    .createTable("projects")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("brand", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("stage", "text")
    .addColumn("n", "integer", (col) => col.notNull().defaultTo(10))
    .addColumn("styles", "text", (col) => col.notNull().defaultTo("story,hook"))
    .addColumn("avatar_id", "integer")
    .addColumn("product", "jsonb")
    .addColumn("insights", "jsonb")
    .addColumn("threads", "integer")
    .addColumn("error", "text")
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("heartbeat_at", "timestamptz")
    .addColumn("board_id", "integer")
    .execute();

  await db.schema
    .createTable("scripts")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("project_id", "integer", (col) => col.references("projects.id").onDelete("cascade"))
    .addColumn("style", "text")
    .addColumn("angle", "text")
    .addColumn("pain", "text")
    .addColumn("persona", "text")
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("words", "integer")
    .addColumn("fits", "boolean")
    .addColumn("claims", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("brand", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("videos")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("batch", "text")
    .addColumn("title", "text")
    .addColumn("script_id", "integer")
    .addColumn("script", "text", (col) => col.notNull())
    .addColumn("brand", "text")
    .addColumn("avatar_id", "integer", (col) => col.notNull())
    .addColumn("engine", "text", (col) => col.notNull().defaultTo("seedance"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("stage", "text")
    .addColumn("words", "integer")
    .addColumn("secs", "double precision")
    .addColumn("est_credits", "double precision")
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("keys", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("report", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("steps", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("error", "text")
    .addColumn("log", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("attempt", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("started_at", "timestamptz")
    .addColumn("finished_at", "timestamptz")
    .addColumn("heartbeat_at", "timestamptz")
    .addColumn("board_id", "integer")
    .addColumn("holder", "text")
    .execute();

  await db.schema
    .createTable("boards")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull().defaultTo("Untitled board"))
    .addColumn("script_ids", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("avatar_ids", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.alterTable("videos").addColumn("steps", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`).ifNotExists()).execute();
  await db.schema.alterTable("videos").addColumn("board_id", "integer", (col) => col.ifNotExists()).execute();
  await db.schema.alterTable("projects").addColumn("board_id", "integer", (col) => col.ifNotExists()).execute();
  await db.schema.alterTable("avatars").addColumn("thumb_key", "text", (col) => col.ifNotExists()).execute();
  await db.schema.alterTable("videos").addColumn("holder", "text", (col) => col.ifNotExists()).execute();

  await db.schema
    .createIndex("videos_status")
    .ifNotExists()
    .on("videos")
    .column("status")
    .where(sql<boolean>`"status" in ('queued', 'running')`)
    .execute();
  await db.schema
    .createIndex("videos_pair")
    .ifNotExists()
    .on("videos")
    .column("script_id")
    .column("avatar_id")
    .column("id desc")
    .execute();
}

export async function up(db: Kysely<Database>): Promise<void> {
  await apply(db);
}

export async function down(): Promise<void> {}

export async function ensureSchema(db: Kysely<Database>): Promise<void> {
  await apply(db);
}
