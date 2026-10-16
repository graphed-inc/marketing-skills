import type { Generated } from "kysely";

// Fresh scaffold: replace packages/core/src/db/types.ts with this file.
// Existing project: add the LinkedIn interfaces below and the two Database
// keys. Do not drop tables the project already has. Do not create a second
// copy of these types.

export interface ExampleHeartbeatsTable {
  id: Generated<number>;
  message: string;
  created_at: Generated<Date>;
}

export type LinkedinEngagerRunStatus =
  | "running"
  | "waiting"
  | "succeeded"
  | "failed";

export interface LinkedinEngagerRunsTable {
  id: Generated<number>;
  source_url: string;
  source_kind: string;
  slug: string;
  crm_enabled: Generated<boolean>;
  crm_system: string | null;
  status: Generated<LinkedinEngagerRunStatus>;
  engagers: Generated<number>;
  emails: Generated<number>;
  verified: Generated<number>;
  excluded: Generated<number>;
  not_found: Generated<number>;
  skipped_urn: Generated<number>;
  millionverifier_run_id: string | null;
  last_error: string | null;
  created_at: Generated<Date>;
  finished_at: Date | null;
}

export interface LinkedinEngagersTable {
  id: Generated<number>;
  run_id: number;
  full_name: string | null;
  title: string | null;
  company: string | null;
  country: string | null;
  linkedin_url: string;
  engagement_type: string;
  comment_text: string | null;
  source_post_url: string | null;
  email: string | null;
  email_status: string | null;
  verification_result: string | null;
  excluded_reason: string | null;
  created_at: Generated<Date>;
}

// The single source of truth for table types — dashboard pages and jobs both
// query through this. Add a row type per migration (plugins do this too).
// (Applied migrations are tracked in kysely's own kysely_migration table,
// which is intentionally not part of this schema.)
export interface Database {
  example_heartbeats: ExampleHeartbeatsTable;
  linkedin_engager_runs: LinkedinEngagerRunsTable;
  linkedin_engagers: LinkedinEngagersTable;
}
