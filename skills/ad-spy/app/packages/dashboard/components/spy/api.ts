export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: opts.method,
    headers: { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload as T;
}
