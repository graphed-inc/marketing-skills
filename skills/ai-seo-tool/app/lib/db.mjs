// Postgres. In the cloud DATABASE_URL points at the project's database. Locally (no
// DATABASE_URL) an embedded PGlite database in ./.data is used, so the app and tests run with
// no server to install.
import pg from "pg";

let impl;
if (process.env.DATABASE_URL) {
  impl = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || "./.data/pglite";
  if (dir !== "memory") (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const db = dir === "memory" ? new PGlite() : new PGlite(dir);
  let chain = Promise.resolve();
  impl = {
    query: (sql, params = []) => {
      const run = chain.then(() => (params.length || !sql.includes(";") ? db.query(sql, params) : db.exec(sql).then((r) => r[r.length - 1] || { rows: [] })));
      chain = run.catch(() => {});
      return run;
    },
    end: () => db.close(),
  };
}

export const pool = impl;
export const q = async (sql, params) => (await pool.query(sql, params)).rows;
export const one = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id          serial PRIMARY KEY,
      name        text NOT NULL,
      domain      text NOT NULL,
      competitors text[] NOT NULL DEFAULT '{}',
      brand_terms text[] NOT NULL DEFAULT '{}',
      location    int  NOT NULL DEFAULT 2840,
      language    text NOT NULL DEFAULT 'en',
      about       text NOT NULL DEFAULT '',
      gsc_schema  text, gsc_site text,
      ga4_schema  text, ga4_property text,
      rank_depth  int  NOT NULL DEFAULT 20,
      weekly_audit boolean NOT NULL DEFAULT false,   -- recurring paid work: off until the user turns it on
      weekly_ai    boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    -- Every paid call is cached here. Re-opening a result is free.
    CREATE TABLE IF NOT EXISTS lookups (
      key        text PRIMARY KEY,
      tool       text NOT NULL,
      input      jsonb NOT NULL,
      result     jsonb,
      credits    double precision NOT NULL DEFAULT 0,
      fetched_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS credit_log (
      id         bigserial PRIMARY KEY,
      project_id int,
      job_id     bigint,
      tool       text NOT NULL,
      credits    double precision NOT NULL,
      at         timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS credit_log_at ON credit_log(at);
    -- Every research run (domain, keywords, serp, gap, audit, ai, rank) is a job; its result is kept.
    CREATE TABLE IF NOT EXISTS jobs (
      id          bigserial PRIMARY KEY,
      project_id  int REFERENCES projects(id) ON DELETE CASCADE,
      kind        text NOT NULL,
      title       text NOT NULL DEFAULT '',
      input       jsonb NOT NULL DEFAULT '{}',
      status      text NOT NULL DEFAULT 'queued',  -- queued | running | done | error
      progress    text NOT NULL DEFAULT '',
      result      jsonb,
      error       text,
      credits     double precision NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now(),
      started_at  timestamptz,
      finished_at timestamptz,
      heartbeat_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status) WHERE status IN ('queued', 'running');
    CREATE INDEX IF NOT EXISTS jobs_kind ON jobs(kind, created_at DESC);
    CREATE TABLE IF NOT EXISTS tracked (
      id         serial PRIMARY KEY,
      project_id int NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      keyword    text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, keyword)
    );
    CREATE TABLE IF NOT EXISTS ranks (
      tracked_id int NOT NULL REFERENCES tracked(id) ON DELETE CASCADE,
      day        date NOT NULL,
      position   int,                 -- null = not in the checked depth
      url        text,
      depth      int NOT NULL,
      competitors jsonb NOT NULL DEFAULT '{}',  -- { domain: position }
      top        jsonb NOT NULL DEFAULT '[]',   -- [{ pos, domain, url, title }]
      PRIMARY KEY (tracked_id, day)
    );
    CREATE TABLE IF NOT EXISTS prompts (
      id         serial PRIMARY KEY,
      project_id int NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      prompt     text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, prompt)
    );
    CREATE TABLE IF NOT EXISTS ai_runs (
      id         bigserial PRIMARY KEY,
      job_id     bigint,
      prompt_id  int NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      engine     text NOT NULL,
      run_no     int NOT NULL,
      mentioned  boolean NOT NULL,
      position   int,
      brands     text[] NOT NULL DEFAULT '{}',
      citations  text[] NOT NULL DEFAULT '{}',
      answer     text NOT NULL DEFAULT '',
      at         timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ai_runs_prompt ON ai_runs(prompt_id, at DESC);
    -- Saved keyword lists (any keyword from any page).
    CREATE TABLE IF NOT EXISTS lists (
      id         serial PRIMARY KEY,
      name       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS list_keywords (
      list_id    int NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      keyword    text NOT NULL,
      metrics    jsonb NOT NULL DEFAULT '{}',
      added_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (list_id, keyword)
    );
    -- Bearer tokens for the MCP endpoint (/mcp). Only the hash is stored.
    CREATE TABLE IF NOT EXISTS api_tokens (
      id         serial PRIMARY KEY,
      name       text NOT NULL,
      prefix     text NOT NULL,
      hash       text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz
    );
    -- Databases made before the defaults changed.
    ALTER TABLE projects ALTER COLUMN weekly_audit SET DEFAULT false;
    ALTER TABLE projects ALTER COLUMN weekly_ai SET DEFAULT false;
  `);
}
