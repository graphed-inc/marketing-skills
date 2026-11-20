import { z } from "zod";
import { envSlice, loadLocalEnv, requiredString } from "../config";

// Graphed Tools proxy. Cloud jobs/services and `graphed dev run` inject
// GRAPHED_TOKEN and GRAPHED_TOOLS_URL. Article drafting posts chat
// completions to `{toolsUrl}/openrouter/v1/chat/completions`. SERP research
// starts a catalog run (`serper:search`, `exa:search`) and downloads the
// vendor JSON. Neither path takes an OpenRouter, Serper, or Exa key.
//
// Lives in the seo kit for copy-paste simplicity, the same way warehouse.ts
// does — the kit overlays files and does not add npm dependencies. If the
// project already depends on `@graphed-inc/sdk`, this file can be replaced
// with `new Graphed().tools.run` and `new Graphed().openRouter`.

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

const POLL_MS = 1_000;
const WAIT_MS = 90_000;
/** Per-request cap. WAIT_MS only bounds time between polls. */
const REQUEST_MS = 30_000;

/** Chat completions can run long; still bounded so a hung socket fails the job. */
const CHAT_TIMEOUT_MS = 180_000;

export async function chatCompletion(input: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  json?: boolean;
}): Promise<string> {
  const { url, token } = openRouterChatCompletions();
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      ...(input.temperature == null ? {} : { temperature: input.temperature }),
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Graphed Tools OpenRouter call failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Graphed Tools OpenRouter returned no content.");
  return content;
}

export function toolsConfigured(): boolean {
  loadLocalEnv();
  return toolsEnvSchema.safeParse(process.env).success;
}

function requireToolsEnv(): { toolsUrl: string; token: string } {
  const env = envSlice(toolsEnvSchema);
  return {
    toolsUrl: env.GRAPHED_TOOLS_URL.replace(/\/$/, ""),
    token: env.GRAPHED_TOKEN,
  };
}

/** Chat completions on the Graphed Tools OpenRouter proxy. */
export function openRouterChatCompletions(): { url: string; token: string } {
  const { toolsUrl, token } = requireToolsEnv();
  return {
    url: `${toolsUrl}/openrouter/v1/chat/completions`,
    token,
  };
}

interface ToolRunStatus {
  status: string;
  statusMessage?: string | null;
  result?: { url?: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRunId(value: unknown): string {
  if (isRecord(value) && typeof value.id === "string" && value.id.length > 0) {
    return value.id;
  }
  throw new Error("Tools run start response had no id.");
}

function readRunStatus(value: unknown): ToolRunStatus {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error("Tools run status response was not a run.");
  }
  const result = isRecord(value.result) ? value.result : null;
  return {
    status: value.status,
    statusMessage:
      typeof value.statusMessage === "string" ? value.statusMessage : null,
    result:
      result && typeof result.url === "string" ? { url: result.url } : null,
  };
}

async function readError(response: Response): Promise<string> {
  return (await response.text()).slice(0, 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_MS,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Start a Graphed Tools run, poll until it finishes, and return the vendor
 * JSON. Serper and Exa are sync providers: the vendor call and the bill
 * happen inside the start request, and the first status read is already
 * ready or failed. There is no abort — those providers do not implement it.
 */
export async function runTool(tool: string, input: object): Promise<unknown> {
  const { toolsUrl, token } = requireToolsEnv();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const start = await fetchWithTimeout(
    `${toolsUrl}/${encodeURIComponent(tool)}/runs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    },
  );
  if (!start.ok) {
    throw new Error(
      `Tools run failed to start (${tool}): ${start.status} ${await readError(start)}`,
    );
  }
  const runId = readRunId(await start.json());
  return pollToolRun({ tool, toolsUrl, token, runId });
}

async function pollToolRun(options: {
  tool: string;
  toolsUrl: string;
  token: string;
  runId: string;
}): Promise<unknown> {
  const { tool, toolsUrl, token, runId } = options;
  const deadline = Date.now() + WAIT_MS;

  for (;;) {
    const status = await fetchWithTimeout(
      `${toolsUrl}/runs/${encodeURIComponent(runId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!status.ok) {
      throw new Error(
        `Tools run status failed (${tool}): ${status.status} ${await readError(status)}`,
      );
    }
    const run = readRunStatus(await status.json());
    if (run.status === "ready") {
      const url = run.result?.url;
      if (!url) throw new Error(`Tools run ${tool} finished without a result.`);
      const download = await fetchWithTimeout(url);
      if (!download.ok) {
        throw new Error(
          `Tools result download failed (${tool}): ${download.status} ${await readError(download)}`,
        );
      }
      return download.json();
    }
    if (run.status === "failed") {
      throw new Error(
        `Tools run failed (${tool}): ${run.statusMessage ?? "failed"}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(`Tools run timed out (${tool}).`);
    }
    await sleep(POLL_MS);
  }
}
