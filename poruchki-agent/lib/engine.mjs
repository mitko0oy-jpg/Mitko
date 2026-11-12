// The calling loop: pick up new orders, call when due, apply results.
// All I/O comes in through arguments, so this file is testable with fakes.
import { normalizePhoneBG, moneyBG, itemsTextBG, inCallingHours, sofiaNow, formalNameBG } from "./format.mjs";
import { applyOutcome, buildMessage, labelFor, STALE_CALL_MIN } from "./policy.mjs";
import { readPostCall } from "./elevenlabs.mjs";
import { orderKey, getSettings } from "./store.mjs";

const seenKey = (site, orderNo) => `seen/${site}/${orderNo}`;
const doneKey = (key) => key.replace(/^order\//, "done/");
const FINISHED = new Set(["done", "gave_up", "needs_mitko", "skipped"]);

/** Write the record; finished orders move from order/ to done/. */
async function save(store, key, rec, opts) {
  if (FINISHED.has(rec.state)) {
    await store.setJSON(doneKey(key), rec);
    await store.delete(key);
    return { modified: true };
  }
  return store.setJSON(key, rec, opts);
}

const MAX_CALLS_PER_RUN = 3;

/**
 * @typedef {object} Deps
 * @property {any} store            Netlify Blobs store (or memoryStore())
 * @property {{fetchNewOrders: Function, isStillPending?: Function}} cb   ConvertBuilder adapter
 * @property {(args: object) => Promise<{conversationId: string|null}>} call  starts an outbound call
 * @property {(text: string) => Promise<any>} notify  message to Mitko
 * @property {{mode: string, testPhone?: string, hours: string, hoursSunday?: string, shopName: string, deliveryDays: string}} config
 */

/** Save new pending orders as "queued" records. Returns how many were added. */
export async function syncOrders(/** @type {Deps} */ deps, now = new Date()) {
  const { store, cb, notify, config } = deps;
  const settings = await getSettings(store);
  if (!settings.startedAt) {
    // First run: remember the moment, so we never call orders placed before the agent existed.
    settings.startedAt = now.toISOString();
    await store.setJSON("meta/settings", settings);
    return 0;
  }
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const since = new Date(Math.max(new Date(settings.startedAt).getTime(), weekAgo.getTime())).toISOString();
  const orders = await cb.fetchNewOrders({ since });
  let added = 0;
  for (const o of orders) {
    if (new Date(o.createdAt) < new Date(settings.startedAt)) continue;
    const phone = normalizePhoneBG(o.phone);
    const rec = {
      site: o.site,
      siteLabel: o.siteLabel,
      orderNo: o.orderNo,
      apiId: o.apiId ?? null,
      createdAt: o.createdAt,
      name: o.name,
      firstName: String(o.name || "").trim().split(/\s+/)[0] || "",
      rawPhone: o.phone,
      phone,
      itemsText: itemsTextBG(o.items),
      totalText: moneyBG(o.total),
      deliveryText: o.deliveryText || "",
      state: phone ? "queued" : "needs_mitko",
      attempts: 0,
      nextAttemptAt: now.toISOString(),
      callingSince: null,
      conversationIds: [],
      history: [{ at: now.toISOString(), event: "new" }],
    };
    const { modified } = await store.setJSON(seenKey(o.site, o.orderNo), { at: now.toISOString() }, { onlyIfNew: true });
    if (!modified) continue;
    await save(store, orderKey(o.site, o.orderNo), rec);
    added++;
    if (!phone) await notify(buildMessage(rec, labelFor("bad_phone"), null, { testMode: config.mode === "test" }));
  }
  return added;
}

/** Start calls that are due. Returns a short report. */
export async function runDueCalls(/** @type {Deps} */ deps, now = new Date()) {
  const { store, cb, call, notify, config } = deps;
  const settings = await getSettings(store);
  const report = { started: 0, skipped: 0, stale: 0, reason: "" };
  const testMode = config.mode === "test";

  const { blobs } = await store.list({ prefix: "order/" });
  const due = [];
  for (const { key } of blobs) {
    const entry = await store.getWithMetadata(key, { type: "json" });
    if (entry === null) continue;
    const rec = entry.data;
    // A call that never reported back: count it as "no conversation".
    if (rec.state === "calling" && rec.callingSince && now - new Date(rec.callingSince) > STALE_CALL_MIN * 60_000) {
      const r = applyOutcome(rec, { outcome: "no_conversation" }, now);
      await save(store, key, r.rec, { onlyIfMatch: entry.etag });
      if (r.notify) await notify(buildMessage(r.rec, r.label, null, { testMode }));
      report.stale++;
      continue;
    }
    if (rec.state === "queued" && new Date(rec.nextAttemptAt) <= now) due.push({ key, rec, etag: entry.etag });
  }

  if (config.mode === "off") return { ...report, reason: "off" };
  if (settings.paused) return { ...report, reason: "paused" };
  const hours = sofiaNow(now).weekday === 0 ? config.hoursSunday || config.hours : config.hours;
  if (!inCallingHours(hours, now)) return { ...report, reason: "outside hours" };
  if (testMode && !config.testPhone) return { ...report, reason: "test mode without TEST_PHONE" };

  due.sort((a, b) => String(a.rec.nextAttemptAt).localeCompare(String(b.rec.nextAttemptAt)));
  for (const { key, rec, etag } of due.slice(0, MAX_CALLS_PER_RUN)) {
    // If Mitko already handled the order in ConvertBuilder, do not call.
    if (cb.isStillPending && !(await cb.isStillPending(rec))) {
      await save(store, key, { ...rec, state: "skipped", finishedAt: now.toISOString(), history: [...rec.history, { at: now.toISOString(), event: "not pending in ConvertBuilder" }] });
      report.skipped++;
      continue;
    }
    const claimed = { ...rec, state: "calling", attempts: rec.attempts + 1, callingSince: now.toISOString() };
    const { modified, etag: claimEtag } = await store.setJSON(key, claimed, { onlyIfMatch: etag });
    if (!modified) continue; // another run took it
    try {
      const { conversationId } = await call({
        to: testMode ? config.testPhone : rec.phone,
        variables: {
          order_key: key,
          test: testMode ? "yes" : "no",
          shop_name: config.shopName,
          customer_name: formalNameBG(rec.name) || rec.firstName || rec.name,
          order_number: String(rec.orderNo),
          order_items: rec.itemsText,
          order_total: rec.totalText,
          delivery_text: rec.deliveryText || "както е посочено в поръчката",
          delivery_days: config.deliveryDays,
        },
      });
      const updated = {
        ...claimed,
        conversationIds: [...(rec.conversationIds || []), conversationId].filter(Boolean),
        history: [...rec.history, { at: now.toISOString(), event: "call", attempt: claimed.attempts, conversationId }],
      };
      await store.setJSON(key, updated, { onlyIfMatch: claimEtag });
      if (conversationId) await store.setJSON(`conv/${conversationId}`, { key });
      report.started++;
    } catch (err) {
      const transient = err.status === 429 || err.status >= 500;
      const back = transient
        ? { ...rec, state: "queued", nextAttemptAt: new Date(now.getTime() + 10 * 60_000).toISOString() }
        : { ...claimed, state: "needs_mitko", callingSince: null, error: String(err.message).slice(0, 300), finishedAt: now.toISOString() };
      back.history = [...rec.history, { at: now.toISOString(), event: "call error", error: String(err.message).slice(0, 200) }];
      await save(store, key, back);
      if (!transient) await notify(buildMessage(back, labelFor("call_error"), null, { testMode }));
    }
  }
  return report;
}

/** Handle one ElevenLabs webhook (already signature-checked). */
export async function handleWebhook(/** @type {Deps} */ deps, payload, now = new Date()) {
  const { store, notify } = deps;
  const type = payload?.type;
  const data = payload?.data || {};
  const conversationId = data.conversation_id;
  let call = null;
  let outcome = "";
  if (type === "post_call_transcription") {
    call = readPostCall(payload);
    outcome = call.outcome;
  } else if (type === "call_initiation_failure") {
    outcome = data.failure_reason || "unknown";
  } else {
    return { ignored: type };
  }

  let key = call?.variables?.order_key;
  if (!key && conversationId) key = (await store.get(`conv/${conversationId}`, { type: "json" }))?.key;
  if (!key) return { ignored: "unknown conversation" };
  const testMode = call?.variables?.test === "yes";

  if (key === "test") {
    // Manual test call (/test in Telegram): just report it.
    const label = outcome ? labelFor(outcome) : "Тестов разговор";
    await notify(buildMessage({ orderNo: "ТЕСТ", site: "тест", name: "тестов клиент" }, label, call, { testMode: true }));
    return { test: true };
  }

  const entry = await store.getWithMetadata(key, { type: "json" });
  if (entry === null) return { ignored: "no record" };
  const rec = entry.data;
  // Ignore duplicates and results for an older attempt.
  if (rec.state !== "calling" || (conversationId && rec.conversationIds?.length && rec.conversationIds.at(-1) !== conversationId)) {
    return { ignored: "not waiting for this call" };
  }
  const r = applyOutcome(rec, { outcome }, now);
  if (call) r.rec.lastSummary = call.summary;
  await save(store, key, r.rec, { onlyIfMatch: entry.etag });
  if (r.notify) await notify(buildMessage(r.rec, r.label, call, { testMode }));
  return { key, state: r.rec.state };
}

/** Delete personal data of orders finished more than `days` ago. */
export async function purgeOld(store, now = new Date(), days = 14) {
  let n = 0;
  for (const { key } of (await store.list({ prefix: "done/" })).blobs) {
    const rec = await store.get(key, { type: "json" });
    if (rec?.finishedAt && now - new Date(rec.finishedAt) > days * 86_400_000) {
      for (const c of rec.conversationIds || []) await store.delete(`conv/${c}`);
      await store.delete(key);
      n++;
    }
  }
  // "seen" markers hold no personal data; they only need to outlive the 7-day order window.
  for (const { key } of (await store.list({ prefix: "seen/" })).blobs) {
    const m = await store.get(key, { type: "json" });
    if (m?.at && now - new Date(m.at) > 30 * 86_400_000) await store.delete(key);
  }
  return n;
}
