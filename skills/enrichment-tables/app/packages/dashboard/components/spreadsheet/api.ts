export async function api<T>(path: string, opts: { method?: string; body?: object } = {}): Promise<T> {
  const r = await fetch(path, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  const parsed: T | { error?: string } = text ? JSON.parse(text) as T | { error?: string } : ({} as T);
  if (!r.ok) {
    const message = parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string"
      ? parsed.error
      : r.statusText;
    throw new Error(message);
  }
  return parsed as T;
}
