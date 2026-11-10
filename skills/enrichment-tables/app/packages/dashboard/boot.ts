export async function boot(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { migrate, startWorker, coreEnv } = await import("@app/core");
  await migrate();
  if (coreEnv().NO_WORKER !== "1") startWorker();
}
