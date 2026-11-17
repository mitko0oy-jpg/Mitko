// Every hour: where is each parcel that is still on its way (Speedy, Econt).
import type { Config } from "@netlify/functions";
import { runTracking } from "../lib/track.mts";

export default async () => {
  const info = await runTracking({ deadline: Date.now() + 22000, job: "track" });
  console.log(JSON.stringify(info));
};

export const config: Config = { schedule: "17 * * * *" };
