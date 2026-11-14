// Every 15 minutes: fresh Meta numbers and shop orders, video jobs, then the autopilot.
import type { Config } from "@netlify/functions";
import { syncMeta, syncSales, pollVideos } from "../lib/sync.mts";
import { app, isDemo } from "../lib/app.mts";
import { pgStore } from "../lib/db.mts";

export default async () => {
  const deadline = Date.now() + 20_000; // scheduled functions have ~30 s
  const out: Record<string, unknown> = {};
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
    if (Date.now() < deadline + 5_000) out.autopilot = await app().run({ by: "auto" });
  } catch (e: any) {
    out.autopilot = { error: e.message };
  }
  await pgStore.put("meta", "lastSync", { at: new Date().toISOString(), out });
  console.log("sync", JSON.stringify(out));
};

export const config: Config = { schedule: "*/15 * * * *" };
