import { type Kysely, sql } from "kysely";

// Placeholder number. Copy this file to
// packages/core/src/migrations/<next>_linkedin_engagers.ts where <next> is
// one higher than the latest file already in that directory. Never edit a
// migration that has already been applied. Kysely records applied names in
// kysely_migration.
//
// linkedin_engager_runs  one row per enrichment, the record a daily job keeps
// linkedin_engagers      one row per person in that run
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("linkedin_engager_runs")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("source_url", "text", (col) => col.notNull())
    .addColumn("source_kind", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("crm_enabled", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("crm_system", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("running"))
    .addColumn("engagers", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("emails", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("verified", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("excluded", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("not_found", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("skipped_urn", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("millionverifier_run_id", "text")
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("finished_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("linkedin_engager_runs_status_created_idx")
    .on("linkedin_engager_runs")
    .columns(["status", "created_at"])
    .execute();

  await db.schema
    .createTable("linkedin_engagers")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("run_id", "bigint", (col) =>
      col.notNull().references("linkedin_engager_runs.id").onDelete("cascade"),
    )
    .addColumn("full_name", "text")
    .addColumn("title", "text")
    .addColumn("company", "text")
    .addColumn("country", "text")
    .addColumn("linkedin_url", "text", (col) => col.notNull())
    .addColumn("engagement_type", "text", (col) => col.notNull())
    .addColumn("comment_text", "text")
    .addColumn("source_post_url", "text")
    .addColumn("email", "text")
    .addColumn("email_status", "text")
    .addColumn("verification_result", "text")
    .addColumn("excluded_reason", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("linkedin_engagers_run_url_unique", [
      "run_id",
      "linkedin_url",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("linkedin_engagers").execute();
  await db.schema.dropTable("linkedin_engager_runs").execute();
}
