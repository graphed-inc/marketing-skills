export async function boot(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { migrate, seed, startWorker, coreEnv } = await import("@app/core");
  const { mkdirSync } = await import("node:fs");
  const { WORK } = await import("@app/core/render");
  await migrate();
  mkdirSync(WORK, { recursive: true });
  // Seed after the server can answer /health. Uploading built-in avatars must not fail the health check.
  seed().catch((e: { message?: string }) => console.error("seed:", e && e.message));
  if (coreEnv().NO_WORKER !== "1") startWorker();
}
