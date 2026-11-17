// Every 5 minutes: pick up new orders, start due calls, clean old data once a day.
import type { Config, Context } from "@netlify/functions";
import { realDeps, env } from "../../lib/config.mjs";
import { ensureTelegramWebhook } from "../../lib/telegram.mjs";
import { syncOrders, runDueCalls, purgeOld } from "../../lib/engine.mjs";
import { sofiaNow } from "../../lib/format.mjs";

export default async (_req: Request, context: Context) => {
  const deps = realDeps();
  const now = new Date();
  // Telegram only accepts https webhooks.
  const site = (context?.site?.url || env("URL") || "").replace(/^http:/, "https:");
  const telegram = await ensureTelegramWebhook({
    store: deps.store,
    token: env("TELEGRAM_BOT_TOKEN"),
    secret: env("TELEGRAM_WEBHOOK_SECRET"),
    url: site ? `${site}/webhook/telegram` : "",
  }).catch((e) => `error: ${e.message}`);
  const added = await syncOrders(deps, now);
  const report = await runDueCalls(deps, now);
  const t = sofiaNow(now);
  let purged = 0;
  if (t.hour === 4 && t.minute < 5) purged = await purgeOld(deps.store, now);
  console.log(JSON.stringify({ added, ...report, purged, telegram }));
};

export const config: Config = {
  schedule: "*/5 * * * *", // every 5 minutes (UTC; calling hours are checked in Sofia time in code)
};
