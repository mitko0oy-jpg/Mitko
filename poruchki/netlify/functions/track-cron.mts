// Every hour: where is each parcel (Speedy, Econt), and which waybills Middleware made.
// The work runs as a background job; only if that cannot start, a short run happens here.
import type { Config, Context } from "@netlify/functions";
import { startJob } from "../lib/jobs.mts";
import { runTracking } from "../lib/track.mts";

export default async (_req: Request, context: Context) => {
  if (await startJob("track", context?.site?.url)) return;
  console.log(JSON.stringify(await runTracking({ deadline: Date.now() + 8000, job: "track" })));
};

export const config: Config = { schedule: "17 * * * *" };
