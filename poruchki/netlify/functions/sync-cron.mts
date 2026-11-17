// Every 30 minutes: new and changed orders from the shops (plus history import when one is running).
import type { Config } from "@netlify/functions";
import { runSync } from "../lib/sync.mts";
// Netlify gives up on a scheduled call after about 15 s and calls it again, so each run stays well under that.

export default async () => {
  const info = await runSync({ deadline: Date.now() + 11000, job: "sync" });
  console.log(JSON.stringify(info));
};

export const config: Config = { schedule: "*/30 * * * *" };
