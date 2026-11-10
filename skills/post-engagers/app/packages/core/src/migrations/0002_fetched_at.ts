import { Kysely, sql } from "kysely";

// fetched_at moves only after a check has saved its posts. last_checked_at also
// moves when a run claims the profile, so it cannot bound the next fetch.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE tracked_profiles ADD COLUMN IF NOT EXISTS fetched_at timestamptz`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE tracked_profiles DROP COLUMN IF EXISTS fetched_at`.execute(db);
}
