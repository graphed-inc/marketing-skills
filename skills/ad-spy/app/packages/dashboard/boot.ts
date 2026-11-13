import { nextProcess } from "@app/core/config";

export async function boot(): Promise<void> {
  if (nextProcess().NEXT_PHASE === "phase-production-build") return;
  const { migrate, startWorker, coreEnv } = await import("@app/core");
  await migrate();
  if (coreEnv().NO_WORKER !== "1") startWorker();
}
