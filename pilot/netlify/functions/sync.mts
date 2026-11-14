// Every 15 minutes: fresh Meta numbers and shop orders, video jobs, then the autopilot.
import type { Config } from "@netlify/functions";
import { syncMeta, syncSales, pollVideos } from "../lib/sync.mts";
import { app, isDemo } from "../lib/app.mts";
import { pgStore } from "../lib/db.mts";

export default async () => {
  // The scheduler gives up after ~15 s and calls again, so stay well under that and never
  // let two runs overlap. Whatever is not done now is picked up by the next run.
  const start = Date.now();
  const deadline = start + 9_000;
  const lock: any = await pgStore.get("meta", "syncLock");
  if (lock?.at && start - new Date(lock.at).getTime() < 60_000) return new Response(null, { status: 204 });
  await pgStore.put("meta", "syncLock", { at: new Date(start).toISOString() });
  const out: Record<string, unknown> = {};
  try {
    if (!isDemo()) {
      for (const [k, f] of [["meta", () => syncMeta(deadline)], ["sales", syncSales], ["video", pollVideos]] as const) {
        try {
          out[k] = await (f as any)();
        } catch (e: any) {
          out[k] = { error: e.message };
        }
      }
    }
    try {
      if (Date.now() < start + 12_000) out.autopilot = await app().run({ by: "auto" });
      else out.autopilot = { skipped: "next run" };
    } catch (e: any) {
      out.autopilot = { error: e.message };
    }
  } finally {
    out.ms = Date.now() - start;
    await pgStore.put("meta", "lastSync", { at: new Date().toISOString(), out });
    await pgStore.put("meta", "syncLock", { at: null });
    console.log("sync", JSON.stringify(out));
  }
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "*/15 * * * *" };
