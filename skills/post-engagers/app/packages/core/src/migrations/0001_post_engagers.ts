import { sql, type Kysely } from "kysely";

// Idempotent schema. `up` is safe to run again: CREATE TABLE IF NOT EXISTS does
// not add columns to a database created by an older build, so the ALTER
// statements repair those. The partial unique index and the duplicate-job
// cleanup stay as SQL because the schema builder cannot express them.
export async function ensureSchema(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("jobs")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("post_url", "text", (col) => col.notNull())
    .addColumn("post_id", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("stage", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("error", "text")
    .addColumn("engagements", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("unique_people", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("profiles", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("emails", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("total_reactions", "integer")
    .addColumn("total_comments", "integer")
    .addColumn("max_profiles", "integer", (col) => col.notNull().defaultTo(1000))
    .addColumn("credits", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("created_by", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("started_at", "timestamptz")
    .addColumn("finished_at", "timestamptz")
    .addColumn("heartbeat_at", "timestamptz")
    .addColumn("attempt", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("reactions_page", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("comments_page", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("tracked_id", "integer")
    .addColumn("source", "text", (col) => col.notNull().defaultTo("manual"))
    .addColumn("new_people", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("verified", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable("people")
    .ifNotExists()
    .addColumn("urn", "text", (col) => col.primaryKey())
    .addColumn("name", "text")
    .addColumn("headline", "text")
    .addColumn("profile_url", "text")
    .addColumn("email", "text")
    .addColumn("data", "jsonb")
    .addColumn("profiled_at", "timestamptz")
    .addColumn("profile_failed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("first_job_id", "integer")
    .addColumn("email_source", "text")
    .addColumn("email_verify", "text")
    .addColumn("enriched_at", "timestamptz")
    .addColumn("enrich", "jsonb")
    .execute();

  await db.schema
    .createTable("job_people")
    .ifNotExists()
    .addColumn("job_id", "integer", (col) => col.notNull().references("jobs.id").onDelete("cascade"))
    .addColumn("urn", "text", (col) => col.notNull().references("people.urn"))
    .addColumn("reacted", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("reaction_type", "text")
    .addColumn("commented", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("comment", "text")
    .addColumn("comment_url", "text")
    .addPrimaryKeyConstraint("job_people_pkey", ["job_id", "urn"])
    .execute();

  await db.schema
    .createTable("profile_batches")
    .ifNotExists()
    .addColumn("job_id", "integer", (col) => col.notNull().references("jobs.id").onDelete("cascade"))
    .addColumn("batch_key", "text", (col) => col.notNull())
    .addColumn("urns", sql`text[]`, (col) => col.notNull())
    .addColumn("done", "boolean", (col) => col.notNull().defaultTo(false))
    .addPrimaryKeyConstraint("profile_batches_pkey", ["job_id", "batch_key"])
    .execute();

  await db.schema
    .createTable("meta")
    .ifNotExists()
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("tracked_profiles")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("name", "text")
    .addColumn("headline", "text")
    .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("backfill_days", "integer", (col) => col.notNull().defaultTo(7))
    .addColumn("max_profiles", "integer", (col) => col.notNull().defaultTo(1000))
    .addColumn("last_checked_at", "timestamptz")
    .addColumn("fetched_at", "timestamptz")
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("posts")
    .ifNotExists()
    .addColumn("post_id", "text", (col) => col.primaryKey())
    .addColumn("tracked_id", "integer", (col) => col.references("tracked_profiles.id").onDelete("set null"))
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("posted_at", "timestamptz")
    .addColumn("post_type", "text")
    .addColumn("snippet", "text")
    .addColumn("reactions", "integer")
    .addColumn("comments", "integer")
    .addColumn("first_seen_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("scrapes", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_scraped_at", "timestamptz")
    .execute();

  await db.schema.createIndex("job_people_urn").ifNotExists().on("job_people").column("urn").execute();
  await db.schema.createIndex("jobs_status").ifNotExists().on("jobs").column("status").execute();

  // Tables created by an older build. CREATE TABLE IF NOT EXISTS does not add a column.
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempt int NOT NULL DEFAULT 1`.execute(db);
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reactions_page int NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS comments_page int NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tracked_id int`.execute(db);
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`.execute(db);
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS new_people int NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS verified int NOT NULL DEFAULT 0`.execute(db);
  await sql`ALTER TABLE people ADD COLUMN IF NOT EXISTS first_job_id int`.execute(db);
  await sql`ALTER TABLE people ADD COLUMN IF NOT EXISTS email_source text`.execute(db);
  await sql`ALTER TABLE people ADD COLUMN IF NOT EXISTS email_verify text`.execute(db);
  await sql`ALTER TABLE people ADD COLUMN IF NOT EXISTS enriched_at timestamptz`.execute(db);
  await sql`ALTER TABLE people ADD COLUMN IF NOT EXISTS enrich jsonb`.execute(db);
  await sql`ALTER TABLE tracked_profiles ADD COLUMN IF NOT EXISTS fetched_at timestamptz`.execute(db);

  await sql`UPDATE jobs j SET status = 'failed',
      error = COALESCE(j.error, 'duplicate live job for this post')
    WHERE j.status <> 'failed'
      AND EXISTS (
        SELECT 1 FROM jobs o
        WHERE o.post_id = j.post_id AND o.status <> 'failed' AND o.id < j.id
      )`.execute(db);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_live_post ON jobs (post_id) WHERE status <> 'failed'`.execute(db);
  await sql`INSERT INTO meta (key, value) VALUES ('instance', md5(random()::text || clock_timestamp()::text))
      ON CONFLICT (key) DO NOTHING`.execute(db);
  await sql`UPDATE people p SET first_job_id = s.j FROM (SELECT urn, min(job_id) j FROM job_people GROUP BY urn) s
      WHERE p.urn = s.urn AND p.first_job_id IS NULL`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await ensureSchema(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("job_people").ifExists().execute();
  await db.schema.dropTable("profile_batches").ifExists().execute();
  await db.schema.dropTable("posts").ifExists().execute();
  await db.schema.dropTable("jobs").ifExists().execute();
  await db.schema.dropTable("tracked_profiles").ifExists().execute();
  await db.schema.dropTable("people").ifExists().execute();
  await db.schema.dropTable("meta").ifExists().execute();
}
