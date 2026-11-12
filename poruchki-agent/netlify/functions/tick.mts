// Every 5 minutes: pick up new orders, start due calls, clean old data once a day.
import type { Config } from "@netlify/functions";
import { realDeps } from "../../lib/config.mjs";
import { syncOrders, runDueCalls, purgeOld } from "../../lib/engine.mjs";
import { sofiaNow } from "../../lib/format.mjs";

export default async () => {
  const deps = realDeps();
  const now = new Date();
  const added = await syncOrders(deps, now);
  const report = await runDueCalls(deps, now);
  const t = sofiaNow(now);
  let purged = 0;
  if (t.hour === 4 && t.minute < 5) purged = await purgeOld(deps.store, now);
  console.log(JSON.stringify({ added, ...report, purged }));
};

export const config: Config = {
  schedule: "*/5 * * * *", // every 5 minutes (UTC; calling hours are checked in Sofia time in code)
};
