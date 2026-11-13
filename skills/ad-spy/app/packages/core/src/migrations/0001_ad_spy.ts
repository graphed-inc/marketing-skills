import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";

// Schema for the ad library and the positioning-gaps heat map.
// createTable().ifNotExists() is safe to run again from ensureSchema on every boot.
// New columns and indexes that an already-applied database must pick up go in a later file.
async function apply(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("brands")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("domain", "text")
    .addColumn("logo_key", "text")
    .addColumn("fb_page_id", "text")
    .addColumn("fb_page_name", "text")
    .addColumn("google_domain", "text")
    .addColumn("google_advertiser_id", "text")
    .addColumn("linkedin_company_id", "text")
    .addColumn("linkedin_company", "text")
    .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("max_ads", "integer", (col) => col.notNull().defaultTo(150))
    .addColumn("last_pulled_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("ads")
    .ifNotExists()
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("brand_id", "integer", (col) => col.notNull().references("brands.id").onDelete("cascade"))
    .addColumn("platform", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("url", "text")
    .addColumn("format", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("started_at", "timestamptz")
    .addColumn("ended_at", "timestamptz")
    .addColumn("days_running", "integer")
    .addColumn("headline", "text")
    .addColumn("body", "text")
    .addColumn("cta", "text")
    .addColumn("link_url", "text")
    .addColumn("landing_domain", "text")
    .addColumn("placements", sql`text[]`)
    .addColumn("impressions", "text")
    .addColumn("variants", "integer")
    .addColumn("media", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("youtube_url", "text")
    .addColumn("raw", "jsonb")
    .addColumn("analysis_status", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("analysis_error", "text")
    .addColumn("analysis", "jsonb")
    .addColumn("transcript", "text")
    .addColumn("on_screen_text", "text")
    .addColumn("visual_description", "text")
    .addColumn("summary", "text")
    .addColumn("hook", "text")
    .addColumn("hook_type", "text")
    .addColumn("angle", "text")
    .addColumn("offer", "text")
    .addColumn("creative_style", "text")
    .addColumn("target_audience", "text")
    .addColumn("emotions", sql`text[]`)
    .addColumn("pain_points", sql`text[]`)
    .addColumn("benefits", sql`text[]`)
    .addColumn("tags", sql`text[]`)
    .addColumn("language", "text")
    .addColumn("duration_seconds", "double precision")
    .addColumn("analyzed_at", "timestamptz")
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("heartbeat_at", "timestamptz")
    .addColumn("first_seen_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_seen_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("ads_platform_external", ["platform", "external_id"])
    .execute();

  await db.schema.createIndex("ads_brand").ifNotExists().on("ads").column("brand_id").column("first_seen_at desc").execute();
  await db.schema
    .createIndex("ads_queue")
    .ifNotExists()
    .on("ads")
    .column("analysis_status")
    .where(sql<boolean>`analysis_status in ('queued', 'running')`)
    .execute();

  await db.schema
    .createTable("pulls")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("brand_id", "integer", (col) => col.notNull().references("brands.id").onDelete("cascade"))
    .addColumn("platform", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("running"))
    .addColumn("seen", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("new_ads", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("error", "text")
    .addColumn("started_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("markets")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("profile", "jsonb")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("stage", "text", (col) => col.notNull().defaultTo("site"))
    .addColumn("progress", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("error", "text")
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("heartbeat_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("voices")
    .ifNotExists()
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("market_id", "integer", (col) => col.notNull().references("markets.id").onDelete("cascade"))
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("url", "text")
    .addColumn("title", "text")
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("author", "text")
    .addColumn("score", "integer")
    .addColumn("query", "text")
    .addColumn("tagged", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("hash", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("voices_market_hash", ["market_id", "hash"])
    .execute();

  await db.schema
    .createTable("personas")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("market_id", "integer", (col) => col.notNull().references("markets.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("position", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable("themes")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("market_id", "integer", (col) => col.notNull().references("markets.id").onDelete("cascade"))
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("position", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable("voice_tags")
    .ifNotExists()
    .addColumn("voice_id", "bigint", (col) => col.notNull().references("voices.id").onDelete("cascade"))
    .addColumn("persona_id", "integer", (col) => col.notNull().references("personas.id").onDelete("cascade"))
    .addColumn("theme_id", "integer", (col) => col.notNull().references("themes.id").onDelete("cascade"))
    .addColumn("intensity", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("quote", "text")
    .addPrimaryKeyConstraint("voice_tags_pkey", ["voice_id", "persona_id", "theme_id"])
    .execute();

  await db.schema
    .createTable("ad_tags")
    .ifNotExists()
    .addColumn("market_id", "integer", (col) => col.notNull().references("markets.id").onDelete("cascade"))
    .addColumn("ad_id", "bigint", (col) => col.notNull().references("ads.id").onDelete("cascade"))
    .addColumn("persona_id", "integer", (col) => col.references("personas.id").onDelete("cascade"))
    .addColumn("theme_id", "integer", (col) => col.references("themes.id").onDelete("cascade"))
    .addColumn("strength", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("reason", "text")
    .execute();

  await db.schema.createIndex("ad_tags_ad").ifNotExists().on("ad_tags").column("market_id").column("ad_id").execute();

  await db.schema
    .createTable("ad_mapped")
    .ifNotExists()
    .addColumn("market_id", "integer", (col) => col.notNull().references("markets.id").onDelete("cascade"))
    .addColumn("ad_id", "bigint", (col) => col.notNull().references("ads.id").onDelete("cascade"))
    .addColumn("mapped_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("ad_mapped_pkey", ["market_id", "ad_id"])
    .execute();

  await db.schema
    .createTable("briefs")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("market_id", "integer", (col) => col.notNull().references("markets.id").onDelete("cascade"))
    .addColumn("persona_id", "integer", (col) => col.references("personas.id").onDelete("cascade"))
    .addColumn("theme_id", "integer", (col) => col.references("themes.id").onDelete("cascade"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("running"))
    .addColumn("content", "jsonb")
    .addColumn("error", "text")
    .addColumn("credits", "double precision", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function ensureSchema(db: Kysely<Database>): Promise<void> {
  await apply(db);
}

export async function up(db: Kysely<Database>): Promise<void> {
  await apply(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const name of ["briefs", "ad_mapped", "ad_tags", "voice_tags", "themes", "personas", "voices", "markets", "pulls", "ads", "brands"] as const) {
    await db.schema.dropTable(name).ifExists().cascade().execute();
  }
}
