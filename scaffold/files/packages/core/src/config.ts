import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

// Environment access for every process type (jobs, dashboard routes, scripts).
//
// Precedence: variables already present in the environment always win; a
// project-root .env fills the gaps in local development. In Graphed cloud the
// platform injects env directly and no .env exists — loading is a no-op there.
//
// Convention: never read process.env from app code. Each domain declares a
// zod schema and calls envSlice() — validated at first use, so the dashboard
// boots without job-only secrets and a job fails fast naming what it needs.

/**
 * Finds the project root by walking up from `from`: the nearest directory
 * containing graphed.yaml (or, failing that, a .env). Falls back to the
 * starting directory so relative-path resolution degrades, never throws.
 */
export function projectRoot(from: string = process.cwd()): string {
  let dir = resolve(from);
  while (true) {
    if (
      existsSync(join(dir, "graphed.yaml")) ||
      existsSync(join(dir, ".env"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(from);
    dir = parent;
  }
}

let envLoaded = false;

/**
 * Loads the project-root .env, if one exists. Idempotent and gap-filling:
 * process.loadEnvFile never overrides variables that are already set.
 */
export function loadLocalEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const envFile = join(projectRoot(), ".env");
  if (!existsSync(envFile)) return;
  process.loadEnvFile(envFile);
}

/**
 * A string that must be present. `message` is used only when the value is
 * missing (`undefined`). Later checks (`.min()`, `.url()`, `.refine()`) keep
 * their own messages.
 */
export function requiredString(message: string) {
  return z.string({
    error: (issue) => (issue.input === undefined ? message : undefined),
  });
}

/** Validates process.env against a domain schema (after loading .env). */
export function envSlice<S extends z.ZodType>(schema: S): z.infer<S> {
  loadLocalEnv();
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Re-throw as a plain Error with a readable list — a raw ZodError
    // stringifies as a JSON blob (and crashes Node 24's console.error).
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(env)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

const coreEnvSchema = z.object({
  // Local: from .env (see env.example). Cloud: injected from databases.primary.
  DATABASE_URL: requiredString(
    "DATABASE_URL is not set — copy env.example to .env locally",
  ).min(1, "DATABASE_URL is not set — copy env.example to .env locally"),
});

let cachedCoreEnv: z.infer<typeof coreEnvSchema> | null = null;

/** Core's own slice — the variables every process needs. */
export function coreEnv(): z.infer<typeof coreEnvSchema> {
  cachedCoreEnv ??= envSlice(coreEnvSchema);
  return cachedCoreEnv;
}
