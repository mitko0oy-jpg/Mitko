// Background work (up to 15 minutes), started by sync-cron and track-cron.
import type { Config } from "@netlify/functions";
import { validJobKey } from "../lib/jobs.mts";
import { sub } from "../lib/http.mts";
import { runSync } from "../lib/sync.mts";
import { runTrackingAll } from "../lib/track.mts";

export default async (req: Request) => {
  if (req.method !== "POST" || !validJobKey(req.headers.get("x-job-key"))) return new Response(null, { status: 404 });
  const [name] = sub(req, "/api/jobs/");
  const deadline = Date.now() + 8 * 60000;
  if (name === "sync") console.log(JSON.stringify(await runSync({ deadline, job: "sync" })));
  else if (name === "track") console.log(JSON.stringify(await runTrackingAll({ deadline, job: "track" })));
  return new Response(null, { status: 202 });
};

export const config: Config = { background: true, path: "/api/jobs/*" };
