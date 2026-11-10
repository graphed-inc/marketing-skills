import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z, type ZodTypeAny } from "zod";

// Environment access for every process type (jobs, dashboard routes, scripts).
//
// Precedence: variables already present in the environment always win; a
// project-root .env fills the gaps in local development. In Graphed cloud the
// platform injects env directly and no .env exists — loading is a no-op there.
//
// Convention: never read process.env from app code. Each domain declares a
// zod schema and calls envSlice() — validated at first use, so the dashboard
// boots without job-only secrets and a job fails fast naming what it needs.

export function projectSlug(from?: string): string {
  const file = join(from ? projectRoot(from) : projectRoot(), "graphed.yaml");
  if (!existsSync(file)) return "";
  const match = readFileSync(file, "utf8").match(/^slug:\s*(\S+)\s*$/m);
  return match ? match[1] : "";
}

export function projectRoot(from: string = process.cwd()): string {
  let dir = resolve(from);
  while (true) {
    if (existsSync(join(dir, "graphed.yaml")) || existsSync(join(dir, ".env"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(from);
    dir = parent;
  }
}

let envLoaded = false;

export function loadLocalEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const envFile = join(projectRoot(), ".env");
  if (!existsSync(envFile)) return;
  process.loadEnvFile(envFile);
}

export function envSlice<S extends ZodTypeAny>(schema: S): z.infer<S> {
  loadLocalEnv();
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(env)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

const coreEnvSchema = z.object({
  // Cloud: injected from databases.primary. Local and tests omit it and use embedded PGlite.
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  NO_WORKER: z.string().optional(),
  PROFILE_REFRESH_DAYS: z.string().optional(),
  EMAIL_WATERFALL: z.string().optional(),
  TRACK_MIN_AGE_HOURS: z.string().optional(),
  MAX_PROFILES_PER_JOB: z.string().optional(),
  GRAPHED_STORAGE_ENDPOINT: z.string().optional(),
  GRAPHED_STORAGE_ACCESS_KEY_ID: z.string().optional(),
  GRAPHED_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  GRAPHED_STORAGE_BUCKET: z.string().optional(),
});

let cachedCoreEnv: z.infer<typeof coreEnvSchema> | null = null;

export function coreEnv(): z.infer<typeof coreEnvSchema> {
  cachedCoreEnv ??= envSlice(coreEnvSchema);
  return cachedCoreEnv;
}

/** Tests swap DATABASE_URL before the first connection. */
export function resetCoreEnvCache(): void {
  cachedCoreEnv = null;
}

const nextProcessSchema = z.object({
  NEXT_PHASE: z.string().optional(),
  NEXT_RUNTIME: z.string().optional(),
});

// Next sets these around the build and the server boot. They are not app config,
// but they still go through envSlice so app code does not read process.env.
export function nextProcess(): z.infer<typeof nextProcessSchema> {
  return envSlice(nextProcessSchema);
}

export function numberEnv(value: string | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
