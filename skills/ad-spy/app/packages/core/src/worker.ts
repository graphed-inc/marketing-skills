// @ts-nocheck
// Background work inside the web server (started from packages/dashboard/boot.ts):
//   - Gemini analysis queue for new ads (every 5 s)
//   - resume a market research run cut off by a redeploy
//   - map newly analyzed ads into the persona matrix (every 60 s)
// The daily cron only pulls; this worker does the rest even when the cron is not running.
import { startAnalysis } from "./analyze";
import { resumeMarkets, tagAds, researching } from "./research";
import { currentMarket } from "./gaps";

type WorkerGlobal = typeof globalThis & { __adSpyWorker?: boolean };

export function startWorker(): void {
  const g = globalThis as WorkerGlobal;
  if (g.__adSpyWorker) return; // Next dev hot-reloads re-run boot
  g.__adSpyWorker = true;
  startAnalysis();
  const recover = () => resumeMarkets().catch((e) => console.error("resume markets:", e.message));
  recover();
  // A restart just after a heartbeat skips that market once. Keep checking until the heartbeat is stale.
  setInterval(recover, 60_000).unref?.();
  setInterval(async () => {
    try {
      const m = await currentMarket();
      if (m && m.status === "done" && !researching()) await tagAds(m.id);
    } catch (e) { console.error("map ads:", e.message); }
  }, 60_000).unref?.();
}
