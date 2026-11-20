import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { envSlice, projectRoot, requiredString } from "../config";
import type { ClientConfig } from "./types";

export interface SeoConfig {
  /** Model id sent to the Graphed Tools OpenRouter proxy. */
  openRouterModel: string;
  client: ClientConfig;
}

// The SEO plugin's env slice. Validated when the job runs — never at import
// time, so the dashboard boots fine without these set. Drafting and research
// authenticate with GRAPHED_TOKEN (injected), not a vendor API key.
const seoEnvSchema = z.object({
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-4.5"),
  SEO_CONFIG_PATH: z.string().default("clients/seo/client.config.json"),
});

const clientConfigEnvSchema = z.object({
  SEO_CONFIG_PATH: z.string().default("clients/seo/client.config.json"),
});

/**
 * Just the client config file — no CMS secrets. Anything that doesn't
 * generate text (the dashboard, unpublish, imports) should use this so it
 * works without CMS credentials. Drafting uses Graphed Tools, not a key
 * stored here.
 */
export function loadClientConfig(configPath?: string): ClientConfig {
  const env = envSlice(clientConfigEnvSchema);
  const resolved = resolve(
    projectRoot(),
    configPath ?? env.SEO_CONFIG_PATH,
  );
  return JSON.parse(readFileSync(resolved, "utf-8")) as ClientConfig;
}

export function loadSeoConfig(): SeoConfig {
  const env = envSlice(seoEnvSchema);

  return {
    openRouterModel: env.OPENROUTER_MODEL,
    client: loadClientConfig(env.SEO_CONFIG_PATH),
  };
}

// Refresh knobs have code defaults, so they are not plugin secrets. Listing
// them on the job would block deploy with waiting_for_secrets. To override,
// add the name to the seo-refresh job env list and `graphed secrets set` it.
const refreshEnvSchema = z.object({
  SEO_REFRESH_APPLY: z.string().optional(),
  SEO_REFRESH_BATCH: z.string().optional(),
  SEO_REFRESH_THIN_WORD_THRESHOLD: z.string().optional(),
  SEO_REFRESH_MIN_AGE_DAYS: z.string().optional(),
  SEO_GAP_MODEL: z.string().optional(),
  SEO_REFRESH_MODEL: z.string().optional(),
});

export interface SeoRefreshSettings {
  apply: boolean;
  batchSize: number;
  thinWordThreshold: number;
  minAgeDays: number;
  /** Short JSON comparison of ranking pages to our article. */
  gapModel: string;
  /** Long rewrite. Separate from OPENROUTER_MODEL, which the publish job uses. */
  rewriteModel: string;
}

function parseRefreshInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseRefreshBool(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function loadSeoRefreshSettings(): SeoRefreshSettings {
  const env = envSlice(refreshEnvSchema);
  return {
    apply: parseRefreshBool(env.SEO_REFRESH_APPLY),
    batchSize: parseRefreshInt(env.SEO_REFRESH_BATCH, 8),
    thinWordThreshold: parseRefreshInt(env.SEO_REFRESH_THIN_WORD_THRESHOLD, 500),
    minAgeDays: parseRefreshInt(env.SEO_REFRESH_MIN_AGE_DAYS, 30),
    gapModel: env.SEO_GAP_MODEL?.trim() || "anthropic/claude-sonnet-4.5",
    // Long rewrites time out on Sonnet through the tools proxy. gpt-4.1 finishes them.
    rewriteModel: env.SEO_REFRESH_MODEL?.trim() || "openai/gpt-4.1",
  };
}

// CMS secrets load lazily — only the selected CMS's env vars are required.

const ghostEnvSchema = z.object({
  GHOST_API_URL: requiredString("GHOST_API_URL is not set").min(
    1,
    "GHOST_API_URL is not set",
  ),
  GHOST_ADMIN_API_KEY: requiredString("GHOST_ADMIN_API_KEY is not set").min(
    1,
    "GHOST_ADMIN_API_KEY is not set",
  ),
});

export function ghostCredentials(): { apiUrl: string; adminApiKey: string } {
  const env = envSlice(ghostEnvSchema);
  return {
    apiUrl: env.GHOST_API_URL.replace(/\/$/, ""),
    adminApiKey: env.GHOST_ADMIN_API_KEY,
  };
}

const wordpressEnvSchema = z.object({
  WP_URL: requiredString("WP_URL is not set").min(1, "WP_URL is not set"),
  WP_USERNAME: requiredString("WP_USERNAME is not set").min(
    1,
    "WP_USERNAME is not set",
  ),
  WP_APPLICATION_PASSWORD: requiredString(
    "WP_APPLICATION_PASSWORD is not set",
  ).min(1, "WP_APPLICATION_PASSWORD is not set"),
});

export function wordpressCredentials(): {
  url: string;
  username: string;
  applicationPassword: string;
} {
  const env = envSlice(wordpressEnvSchema);
  return {
    url: env.WP_URL.replace(/\/$/, ""),
    username: env.WP_USERNAME,
    applicationPassword: env.WP_APPLICATION_PASSWORD,
  };
}

const strapiEnvSchema = z.object({
  STRAPI_API_URL: requiredString("STRAPI_API_URL is not set").min(
    1,
    "STRAPI_API_URL is not set",
  ),
  STRAPI_API_TOKEN: requiredString("STRAPI_API_TOKEN is not set").min(
    1,
    "STRAPI_API_TOKEN is not set",
  ),
});

export function strapiCredentials(): { apiUrl: string; apiToken: string } {
  const env = envSlice(strapiEnvSchema);
  return {
    apiUrl: env.STRAPI_API_URL.replace(/\/$/, ""),
    apiToken: env.STRAPI_API_TOKEN,
  };
}
