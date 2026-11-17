// Every hour: where is each parcel that is still on its way (Speedy, Econt).
import type { Config } from "@netlify/functions";
import { runTracking } from "../lib/track.mts";
// Netlify gives up on a scheduled call after about 15 s (cold start included) and calls it again, so each run stops after 8 s.

export default async () => {
  const info = await runTracking({ deadline: Date.now() + 8000, job: "track" });
  console.log(JSON.stringify(info));
};

export const config: Config = { schedule: "17 * * * *" };
