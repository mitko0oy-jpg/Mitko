// Every 5 minutes: pick up new orders, start due calls, clean old data once a day.
import type { Config, Context } from "@netlify/functions";
import { realDeps, env } from "../../lib/config.mjs";
import { ensureTelegramWebhook } from "../../lib/telegram.mjs";
import { syncOrders, runDueCalls, purgeOld } from "../../lib/engine.mjs";
import { runFeedbackQueue } from "../../lib/feedback-queue.mjs";
import { runPickupQueue } from "../../lib/pickup-calls.mjs";
import { sofiaNow } from "../../lib/format.mjs";
import { getSettings, saveSettings } from "../../lib/store.mjs";
import { reviewPending, buildDigest, sofiaDay, DIGEST_AT } from "../../lib/coach.mjs";
import { salesReviewPending } from "../../lib/sales-coach.mjs";

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
  // Feedback calls Mitko started from Telegram (/obratna_start): one at a time, after the order calls.
  const feedback = await runFeedbackQueue(deps, now).catch((e) => ({ feedback: `error: ${e.message}` }));
  // „Невзета пратка“ calls (/nevzeti_start): when the line is free.
  const pickup = await runPickupQueue(deps, now).catch((e) => ({ pickup: `error: ${e.message}` }));
  const t = sofiaNow(now);
  let purged = 0;
  if (t.hour === 4 && t.minute < 5) purged = await purgeOld(deps.store, now);

  // Learning from the calls (lib/coach.mjs): review up to two finished calls per run,
  // and once a day after the last calls send Mitko the report with proposed rules.
  const ai = { store: deps.store, env };
  const reviews = await reviewPending(ai, now, { max: 2 }).catch((e) => ({ error: e.message }));
  // Every feedback call without a sale: why, and one proposed rule for Mitko (lib/sales-coach.mjs).
  const sales = await salesReviewPending({ ...ai, notify: deps.notify }, now, { max: 1 }).catch((e) => ({ error: e.message }));
  let digest = "";
  const today = sofiaDay(now);
  if (t.hour * 60 + t.minute >= DIGEST_AT.hour * 60 + DIGEST_AT.minute) {
    const settings = await getSettings(deps.store);
    if (settings.coachDay !== today) {
      await saveSettings(deps.store, { ...settings, coachDay: today }); // once a day, even if it fails
      const text = await buildDigest(ai, now).catch((e) => `⚠️ Вечерният преглед не стана: ${String(e.message).slice(0, 200)}`);
      if (text) await deps.notify(text);
      digest = text ? "sent" : "no calls";
    }
  }
  console.log(JSON.stringify({ added, ...report, ...feedback, ...pickup, purged, telegram, reviews, sales, digest }));
};

export const config: Config = {
  schedule: "*/5 * * * *", // every 5 minutes (UTC; calling hours are checked in Sofia time in code)
};
