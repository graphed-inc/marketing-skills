import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z, type ZodTypeAny } from "zod";

// Environment access for every process type (the Next server, the CLI, tests).
// Variables already in the environment win; a project-root .env fills the gaps locally.

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
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  NO_WORKER: z.string().optional(),
  PORT: z.string().optional(),
  WORK_DIR: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().optional(),
  VIDEO_LANES: z.string().optional(),
  HEAVY_LANES: z.string().optional(),
  LLM_MODEL: z.string().optional(),
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

const txTokenSchema = z.object({
  UGC_TX_TOKEN: z.string().min(1).optional(),
});

// The worker and the route are separate bundles. serve.cjs sets this before
// either loads; if it is still empty, the first caller publishes one value
// for the rest of the process. Read fresh so a token set after startup is seen.
export function txToken(): string {
  const existing = envSlice(txTokenSchema).UGC_TX_TOKEN;
  if (existing) return existing;
  const token = randomUUID();
  process.env.UGC_TX_TOKEN = token;
  return token;
}

export function projectSlug(from?: string): string {
  const file = join(from ? projectRoot(from) : projectRoot(), "graphed.yaml");
  if (!existsSync(file)) return "";
  const match = readFileSync(file, "utf8").match(/^slug:\s*(\S+)\s*$/m);
  return match ? match[1] : "";
}
