import { type Kysely, sql } from "kysely";
import type { Database } from "../db/types";

// One cell per ad. 0001 is already applied on the live project, so the cleanup
// and the unique index live here. `pending` is the cross-process claim in tagAds.
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    DELETE FROM ad_tags a USING ad_tags b
    WHERE a.ctid < b.ctid
      AND a.market_id = b.market_id
      AND a.ad_id = b.ad_id
      AND a.persona_id IS NOT DISTINCT FROM b.persona_id
      AND a.theme_id IS NOT DISTINCT FROM b.theme_id
  `.execute(db);
  await db.schema
    .createIndex("ad_tags_cell")
    .unique()
    .ifNotExists()
    .on("ad_tags")
    .column("market_id")
    .column("ad_id")
    .column("persona_id")
    .column("theme_id")
    .execute();
  await db.schema
    .alterTable("ad_mapped")
    .addColumn("pending", "boolean", (col) => col.notNull().defaultTo(false).ifNotExists())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("ad_mapped").dropColumn("pending").execute();
  await db.schema.dropIndex("ad_tags_cell").ifExists().execute();
}
