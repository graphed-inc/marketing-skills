import type { ColumnType, Generated } from "kysely";

type Json = ColumnType<unknown, unknown, unknown>;

export interface JobsTable {
  id: Generated<number>;
  post_url: string;
  post_id: string;
  status: Generated<string>;
  stage: Generated<string>;
  error: string | null;
  engagements: Generated<number>;
  unique_people: Generated<number>;
  profiles: Generated<number>;
  emails: Generated<number>;
  total_reactions: number | null;
  total_comments: number | null;
  max_profiles: Generated<number>;
  credits: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  finished_at: Date | null;
  heartbeat_at: Date | null;
  attempt: Generated<number>;
  reactions_page: Generated<number>;
  comments_page: Generated<number>;
  tracked_id: number | null;
  source: Generated<string>;
  new_people: Generated<number>;
  verified: Generated<number>;
}

export interface PeopleTable {
  urn: string;
  name: string | null;
  headline: string | null;
  profile_url: string | null;
  email: string | null;
  data: Json | null;
  profiled_at: Date | null;
  profile_failed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  first_job_id: number | null;
  email_source: string | null;
  email_verify: string | null;
  enriched_at: Date | null;
  enrich: Json | null;
}

export interface JobPeopleTable {
  job_id: number;
  urn: string;
  reacted: Generated<boolean>;
  reaction_type: string | null;
  commented: Generated<boolean>;
  comment: string | null;
  comment_url: string | null;
}

export interface ProfileBatchesTable {
  job_id: number;
  batch_key: string;
  urns: string[];
  done: Generated<boolean>;
}

export interface MetaTable {
  key: string;
  value: string;
}

export interface TrackedProfilesTable {
  id: Generated<number>;
  username: string;
  name: string | null;
  headline: string | null;
  active: Generated<boolean>;
  backfill_days: Generated<number>;
  max_profiles: Generated<number>;
  last_checked_at: Date | null;
  fetched_at: Date | null;
  last_error: string | null;
  created_at: Generated<Date>;
}

export interface PostsTable {
  post_id: string;
  tracked_id: number | null;
  url: string;
  posted_at: Date | null;
  post_type: string | null;
  snippet: string | null;
  reactions: number | null;
  comments: number | null;
  first_seen_at: Generated<Date>;
  scrapes: Generated<number>;
  last_scraped_at: Date | null;
}

export interface Database {
  jobs: JobsTable;
  people: PeopleTable;
  job_people: JobPeopleTable;
  profile_batches: ProfileBatchesTable;
  meta: MetaTable;
  tracked_profiles: TrackedProfilesTable;
  posts: PostsTable;
}
