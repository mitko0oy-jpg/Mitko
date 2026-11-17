// Every 30 minutes: new and changed orders from the shops (plus history import when one is running).
import type { Config } from "@netlify/functions";
import { runSync } from "../lib/sync.mts";

export default async () => {
  const info = await runSync({ deadline: Date.now() + 22000, job: "sync" });
  console.log(JSON.stringify(info));
};

export const config: Config = { schedule: "*/30 * * * *" };
