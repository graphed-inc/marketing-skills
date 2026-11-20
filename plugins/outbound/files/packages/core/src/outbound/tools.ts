import { z } from "zod";
import { envSlice, loadLocalEnv, requiredString } from "../config";

// Graphed Tools OpenRouter proxy. Cloud services/jobs and `graphed dev run`
// inject GRAPHED_TOKEN and GRAPHED_TOOLS_URL. Chat completions go to
// `{toolsUrl}/openrouter/v1/chat/completions`. There is no model API key.

const MISSING_TOOLS =
  "Run through `graphed dev run -- <command>` locally, or deploy, so Graphed injects GRAPHED_TOKEN and GRAPHED_TOOLS_URL.";

const toolsEnvSchema = z.object({
  GRAPHED_TOOLS_URL: requiredString(
    `GRAPHED_TOOLS_URL is not set. ${MISSING_TOOLS}`,
  ).url(),
  GRAPHED_TOKEN: requiredString(
    `GRAPHED_TOKEN is not set. ${MISSING_TOOLS}`,
  ).min(1, `GRAPHED_TOKEN is not set. ${MISSING_TOOLS}`),
});

const CHAT_TIMEOUT_MS = 90_000;

export function openRouterModel(): string {
  loadLocalEnv();
  const configured = process.env.OPENROUTER_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : "anthropic/claude-sonnet-4.5";
}

export function toolsConfigured(): boolean {
  loadLocalEnv();
  return toolsEnvSchema.safeParse(process.env).success;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readChatContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) return null;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return null;
  const content = choice.message.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

function requireToolsEnv(): { toolsUrl: string; token: string } {
  const env = envSlice(toolsEnvSchema);
  return {
    toolsUrl: env.GRAPHED_TOOLS_URL.replace(/\/$/, ""),
    token: env.GRAPHED_TOKEN,
  };
}

export async function chatCompletion(input: {
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const { toolsUrl, token } = requireToolsEnv();
  const url = `${toolsUrl}/openrouter/v1/chat/completions`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, 1500 * attempt);
      });
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          temperature: 0.3,
          max_tokens: 2500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        }),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(
        `Graphed Tools OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `Graphed Tools OpenRouter call failed: ${response.status} ${(await response.text()).slice(0, 500)}`,
      );
    }
    const content = readChatContent(await response.json());
    if (!content) {
      throw new Error("Graphed Tools OpenRouter returned no content.");
    }
    return content;
  }

  throw lastError ?? new Error("Graphed Tools OpenRouter request failed.");
}
