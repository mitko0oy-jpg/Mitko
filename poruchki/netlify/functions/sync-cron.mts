// Every 30 minutes: new and changed orders from the shops (plus history import when one is running).
import type { Config } from "@netlify/functions";
import { runSync } from "../lib/sync.mts";
// Netlify gives up on a scheduled call after about 15 s (cold start included) and calls it again, so each run stops after 8 s.

export default async () => {
  const info = await runSync({ deadline: Date.now() + 8000, job: "sync" });
  console.log(JSON.stringify(info));
};

export const config: Config = { schedule: "*/30 * * * *" };
