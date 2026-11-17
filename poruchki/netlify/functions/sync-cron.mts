// Every 30 minutes: new and changed orders from the shops (plus history import when one is running).
// The work runs as a background job; only if that cannot start, a short run happens here
// (Netlify cuts a scheduled call off after ~15 s, cold start included).
import type { Config, Context } from "@netlify/functions";
import { startJob } from "../lib/jobs.mts";
import { runSync } from "../lib/sync.mts";

export default async (_req: Request, context: Context) => {
  if (await startJob("sync", context?.site?.url)) return;
  console.log(JSON.stringify(await runSync({ deadline: Date.now() + 8000, job: "sync" })));
};

export const config: Config = { schedule: "*/30 * * * *" };
