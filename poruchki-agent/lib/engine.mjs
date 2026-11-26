// The calling loop: pick up new orders, call when due, apply results.
// All I/O comes in through arguments, so this file is testable with fakes.
import { purgeCalled } from "./feedback-callbacks.mjs";
import { saveReview, purgeReviews } from "./coach.mjs";
import { normalizePhoneBG, moneyBG, itemsTextBG, inCallingHours, sofiaNow, formalNameBG } from "./format.mjs";
import { applyOutcome, buildMessage, labelFor, STALE_CALL_MIN, MAX_LINE_FAULTS, LINE_FAULT_RETRY_MIN } from "./policy.mjs";
import { readPostCall } from "./elevenlabs.mjs";
import { upsellFor } from "./upsell.mjs";
import { orderKey, getSettings } from "./store.mjs";
import { reportBody } from "./platform.mjs";
import { handleFeedbackCall } from "./feedback.mjs";
import { runFeedbackQueue } from "./feedback-queue.mjs";
import { handlePickupCall, runPickupQueue } from "./pickup-calls.mjs";
import { NO_ANSWER_MIN } from "./callback.mjs";

const seenKey = (site, orderNo) => `seen/${site}/${orderNo}`;
const doneKey = (key) => key.replace(/^order\//, "done/");
const FINISHED = new Set(["done", "gave_up", "needs_mitko", "skipped"]);

/** Tell OrderDesk about a call (best effort: an OrderDesk hiccup never stops the calls). */
async function toPlatform(deps, what, ...args) {
  if (!deps.platform?.enabled) return null;
  try {
    return await deps.platform[what](...args);
  } catch (err) {
    console.error(`platform ${what} failed`, err.message);
    return { platformError: String(err.message).slice(0, 200) };
  }
}

const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The line about the waybill OrderDesk made after a confirmation (or why it did not). */
export function waybillLine(res) {
  if (res?.waybill?.number) {
    const courier = res.waybill.courier === "speedy" ? "Спиди" : "Еконт";
    return `📦 Товарителница ${courier} № <b>${escHtml(res.waybill.number)}</b> – готова за печат в OrderDesk.`;
  }
  if (res?.waybillError) return `⚠️ Товарителницата не се създаде автоматично: ${escHtml(res.waybillError)}. Направи я в OrderDesk.`;
  if (res?.platformError) return `⚠️ OrderDesk не отговори (${escHtml(res.platformError)}) – потвърди и направи товарителницата ръчно.`;
  return "";
}

/** Write the record; finished orders move from order/ to done/. */
async function save(store, key, rec, opts) {
  if (FINISHED.has(rec.state)) {
    await store.setJSON(doneKey(key), rec);
    await store.delete(key);
    return { modified: true };
  }
  return store.setJSON(key, rec, opts);
}

// One call per 5-minute run by default: a single PBX extension may carry only one call at a time.
const MAX_CALLS_PER_RUN = 1;
// Never call about an order older than this (e.g. after a pause or before setup was finished).
const MAX_ORDER_AGE_H = 48;

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
    // „📞 Обади се“ in OrderDesk: Mitko asked for this call himself (requestedAt = when he pressed it).
    const manual = Boolean(o.requestedAt);
    if (!manual && new Date(o.createdAt) < new Date(settings.startedAt)) continue;
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
      upsell: upsellFor(o),
      deliveryText: o.deliveryText || "",
      // For OrderDesk: its id, and the lines and delivery so an extra box can be added to the order.
      platformId: o.platformId ?? null,
      items: o.items || [],
      shipping: o.shipping ?? null,
      state: phone ? "queued" : "needs_mitko",
      attempts: 0,
      nextAttemptAt: now.toISOString(),
      callingSince: null,
      conversationIds: [],
      history: [{ at: now.toISOString(), event: manual ? "requested from OrderDesk" : "new" }],
      ...(manual ? { manual: true, requestedAt: o.requestedAt } : {}),
    };
    if (manual) {
      // Each press of the button is one request, even for an order that was already called before.
      const { modified } = await store.setJSON(`${seenKey(o.site, o.orderNo)}/manual/${o.requestedAt}`, { at: now.toISOString() }, { onlyIfNew: true });
      if (!modified) continue;
      await store.setJSON(seenKey(o.site, o.orderNo), { at: now.toISOString() }, { onlyIfNew: true });
      const key = orderKey(o.site, o.orderNo);
      const cur = await store.getWithMetadata(key, { type: "json" });
      if (cur !== null && cur.data && !FINISHED.has(cur.data.state)) {
        // Already waiting in the queue: it becomes a manual call, and a queued one is called first, now.
        const history = [...(cur.data.history || []), { at: now.toISOString(), event: "requested from OrderDesk" }];
        const next = { ...cur.data, manual: true, requestedAt: o.requestedAt, history, ...(cur.data.state === "queued" ? { nextAttemptAt: now.toISOString() } : {}) };
        await store.setJSON(key, next, { onlyIfMatch: cur.etag });
        added++;
        continue;
      }
      await save(store, key, rec);
      added++;
      if (!phone) await notify(buildMessage(rec, labelFor("bad_phone"), null, { testMode: false }));
      continue;
    }
    const { modified } = await store.setJSON(seenKey(o.site, o.orderNo), { at: now.toISOString() }, { onlyIfNew: true });
    if (!modified) continue;
    await save(store, orderKey(o.site, o.orderNo), rec);
    added++;
    if (!phone && (settings.mode || config.mode) !== "off") await notify(buildMessage(rec, labelFor("bad_phone"), null, { testMode: (settings.mode || config.mode) === "test" }));
  }
  return added;
}

/** An order call that is ringing or talking right now (one phone line: never start a second one). */
export async function orderCallInProgress(store, now = new Date()) {
  for (const { key } of (await store.list({ prefix: "order/" })).blobs) {
    const rec = await store.get(key, { type: "json" });
    if (rec?.state !== "calling" || !rec.callingSince) continue;
    const sinceMin = (now - new Date(rec.callingSince)) / 60_000;
    // A Zadarma callback nobody answered is over (the next run counts it as "no answer").
    const unanswered = rec.route === "zadarma" && !rec.answeredAt && sinceMin > NO_ANSWER_MIN;
    if (!unanswered && sinceMin < STALE_CALL_MIN) return true;
  }
  return false;
}

/** Start calls that are due. Returns a short report. */
export async function runDueCalls(/** @type {Deps} */ deps, now = new Date()) {
  const { store, cb, call, notify, config } = deps;
  const settings = await getSettings(store);
  const report = { started: 0, skipped: 0, stale: 0, reason: "" };
  const mode = settings.mode || config.mode; // set from Telegram (/rezhim) or MODE env
  const testMode = mode === "test";
  // A call Mitko asked for with „📞 Обади се“ always goes to the customer, whatever the mode.
  const asTest = (rec) => testMode && !rec.manual;

  const { blobs } = await store.list({ prefix: "order/" });
  const due = [];
  for (const { key } of blobs) {
    const entry = await store.getWithMetadata(key, { type: "json" });
    if (entry === null) continue;
    const rec = entry.data;
    // A Zadarma callback the customer did not answer never reaches ElevenLabs:
    // if the agent was not connected within a few minutes, count it as "no answer".
    const sinceMin = rec.callingSince ? (now - new Date(rec.callingSince)) / 60_000 : 0;
    const unanswered = rec.route === "zadarma" && !rec.answeredAt && sinceMin > NO_ANSWER_MIN;
    // A call that never reported back: count it as "no conversation".
    if (rec.state === "calling" && rec.callingSince && (unanswered || sinceMin > STALE_CALL_MIN)) {
      const r = applyOutcome(rec, { outcome: unanswered ? "no-answer" : "no_conversation" }, now);
      await save(store, key, r.rec, { onlyIfMatch: entry.etag });
      if (!asTest(rec)) await toPlatform(deps, "report", rec, reportBody(rec, r.rec, null, r.rec.lastOutcome));
      if (r.notify) await notify(buildMessage(r.rec, r.label, null, { testMode: asTest(rec) }));
      report.stale++;
      continue;
    }
    // Orders that came in before the current mode was switched on are never called
    // (a manual request counts from the moment Mitko pressed the button).
    const tooOld = now - new Date(rec.manual && rec.requestedAt ? rec.requestedAt : rec.createdAt) > MAX_ORDER_AGE_H * 3_600_000;
    const beforeMode = !rec.manual && settings.modeSince && new Date(rec.createdAt) < new Date(settings.modeSince);
    if (rec.state === "queued" && (tooOld || beforeMode)) {
      await save(store, key, { ...rec, state: "skipped", finishedAt: now.toISOString(), history: [...rec.history, { at: now.toISOString(), event: tooOld ? "too old to call" : "came before the mode was switched on" }] });
      report.skipped++;
      continue;
    }
    if (rec.state === "queued" && new Date(rec.nextAttemptAt) <= now) due.push({ key, rec, etag: entry.etag });
  }

  // With the order calls switched off (or a test without a test number), only the calls Mitko asked for go out.
  const manualDue = due.filter((d) => d.rec.manual);
  let callable = due;
  if (mode === "off") {
    if (!manualDue.length) return { ...report, reason: "off" };
    callable = manualDue;
  }
  if (config.ready === false) return { ...report, reason: "ElevenLabs not configured yet" };
  if (settings.paused || config.pausedByEnv) return { ...report, reason: "paused" };
  const hours = sofiaNow(now).weekday === 0 ? config.hoursSunday || config.hours : config.hours;
  if (!inCallingHours(hours, now)) return { ...report, reason: "outside hours" };
  if (testMode && !config.testPhone) {
    if (!manualDue.length) return { ...report, reason: "test mode without TEST_PHONE" };
    callable = manualDue;
  }

  // The calls Mitko asked for first, then the oldest due.
  callable.sort((a, b) => Number(Boolean(b.rec.manual)) - Number(Boolean(a.rec.manual)) || String(a.rec.nextAttemptAt).localeCompare(String(b.rec.nextAttemptAt)));
  for (const { key, rec, etag } of callable.slice(0, config.maxCallsPerRun || MAX_CALLS_PER_RUN)) {
    // If Mitko already handled the order in ConvertBuilder, do not call.
    if (cb.isStillPending && !(await cb.isStillPending(rec))) {
      await save(store, key, { ...rec, state: "skipped", finishedAt: now.toISOString(), history: [...rec.history, { at: now.toISOString(), event: "not pending in ConvertBuilder" }] });
      report.skipped++;
      continue;
    }
    const claimed = { ...rec, state: "calling", attempts: rec.attempts + 1, callingSince: now.toISOString(), answeredAt: null };
    const { modified, etag: claimEtag } = await store.setJSON(key, claimed, { onlyIfMatch: etag });
    if (!modified) continue; // another run took it
    try {
      const { conversationId, route } = await call({
        to: asTest(rec) ? config.testPhone : rec.phone,
        variables: {
          order_key: key,
          test: asTest(rec) ? "yes" : "no",
          shop_name: config.shopName,
          customer_name: formalNameBG(rec.name) || rec.firstName || rec.name,
          order_number: String(rec.orderNo),
          order_items: rec.itemsText,
          order_total: rec.totalText,
          delivery_text: rec.deliveryText || "както е посочено в поръчката",
          delivery_days: config.deliveryDays,
          ...upsellVariables(rec.upsell),
          // „📞 Обади се“ is Александра's call (zdravets.eu tells customers she will call); the A/B split is for the rest.
          ...(rec.manual ? { persona: "aleksandra" } : {}),
        },
      });
      const updated = {
        ...claimed,
        route: route || "elevenlabs",
        conversationIds: [...(rec.conversationIds || []), conversationId].filter(Boolean),
        history: [...rec.history, { at: now.toISOString(), event: "call", attempt: claimed.attempts, conversationId }],
      };
      await store.setJSON(key, updated, { onlyIfMatch: claimEtag });
      if (conversationId) await store.setJSON(`conv/${conversationId}`, { key });
      if (!asTest(rec)) await toPlatform(deps, "calling", claimed);
      report.started++;
    } catch (err) {
      const transient = err.status === 429 || err.status >= 500;
      const back = transient
        ? { ...rec, state: "queued", nextAttemptAt: new Date(now.getTime() + 10 * 60_000).toISOString() }
        : { ...claimed, state: "needs_mitko", callingSince: null, error: String(err.message).slice(0, 300), finishedAt: now.toISOString() };
      back.history = [...rec.history, { at: now.toISOString(), event: "call error", error: String(err.message).slice(0, 200) }];
      await save(store, key, back);
      if (!transient) await notify(buildMessage(back, labelFor("call_error"), null, { testMode: asTest(rec) }));
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
    // Every call is kept for the evening review (lib/coach.mjs); never blocks the result.
    await saveReview(store, call, now).catch((err) => console.error("saveReview", err.message));
  } else if (type === "call_initiation_failure") {
    outcome = data.failure_reason || "unknown";
  } else {
    return { ignored: type };
  }

  // „Невзета пратка“ (lib/pickup-calls.mjs): OrderDesk and Telegram, then the next parcel.
  if (call?.variables?.campaign === "pickup") {
    const r = await handlePickupCall(deps, call, now);
    if (call.variables.test !== "yes" && deps.call) {
      r.next = (await runPickupQueue(deps, now).catch((err) => ({ pickup: `error: ${err.message}` }))).pickup;
    }
    return r;
  }

  if (call?.variables?.campaign === "feedback") {
    const r = await handleFeedbackCall(deps, call, now);
    // One after another: the next customer is called as soon as this result is in.
    if (call.variables.test !== "yes" && deps.call) {
      r.next = (await runFeedbackQueue(deps, now).catch((err) => ({ feedback: `error: ${err.message}` }))).feedback;
    }
    return r;
  }

  let key = call?.variables?.order_key;
  if (!key && conversationId) key = (await store.get(`conv/${conversationId}`, { type: "json" }))?.key;
  if (!key && call && deps.config.inboundAgentId && call.agentId === deps.config.inboundAgentId) return handleInboundCall(deps, call);
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
  // The line "answered" and dropped before the customer could pick up: try again soon.
  // Zadarma's recording "These calls are only possible within the country" is transcribed as the customer.
  const announcement = /only possible within the country/i.test(call?.transcript || "");
  const silentShort = call && (call.durationSecs ?? 99) <= 8 && (announcement || !/^Клиент:/m.test(call.transcript || ""));
  // (Not for Zadarma callbacks: the agent is only connected after the customer answered.)
  if (silentShort && rec.route !== "zadarma" && deps.ringSecs && (rec.lineFaults || 0) < MAX_LINE_FAULTS) {
    const ring = await deps.ringSecs(conversationId).catch(() => null);
    if (ring != null && ring < 5) {
      const next = {
        ...rec,
        state: "queued",
        callingSince: null,
        attempts: Math.max(0, (rec.attempts || 1) - 1),
        lineFaults: (rec.lineFaults || 0) + 1,
        nextAttemptAt: new Date(now.getTime() + LINE_FAULT_RETRY_MIN * 60_000).toISOString(),
        history: [...(rec.history || []), { at: now.toISOString(), event: "line fault", ring }],
      };
      await save(store, key, next, { onlyIfMatch: entry.etag });
      return { key, state: "queued", lineFault: true };
    }
  }

  const r = applyOutcome(rec, { outcome }, now);
  if (call) r.rec.lastSummary = call.summary;
  await save(store, key, r.rec, { onlyIfMatch: entry.etag });
  // OrderDesk writes the comment, confirms, adds the extra box and makes the waybill.
  const pr = testMode ? null : await toPlatform(deps, "report", rec, reportBody(rec, r.rec, call, r.rec.lastOutcome));
  if (r.notify) {
    const extra = r.rec.lastOutcome === "confirmed" || pr?.platformError ? waybillLine(pr) : "";
    await notify(buildMessage(r.rec, r.label, call, { testMode }) + (extra ? `\n${extra}` : ""));
  }
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
  // Orders taken by phone: kept 30 days (Mitko has entered them in Middleware by then).
  for (const { key } of (await store.list({ prefix: "phone-orders/" })).blobs) {
    const day = key.split("/")[1];
    if (day && now - new Date(`${day}T00:00:00Z`) > 30 * 86_400_000) {
      await store.delete(key);
      n++;
    }
  }
  // Feedback queue (/obratna): finished records go after 60 days – unless we promised to call again.
  for (const { key } of (await store.list({ prefix: "fb-" })).blobs) {
    if (key.startsWith("fb-called/")) continue;
    const r = await store.get(key, { type: "json" });
    const at = r?.finishedAt || r?.queuedAt;
    if (r?.callbackDue && !r.callbackStarted) continue;
    if (!r || (at && now - new Date(at) > 60 * 86_400_000)) await store.delete(key);
  }
  // Who we talked to (only a hash of the number): a year; "do not call" stays.
  n += await purgeCalled(store, now);
  // Feedback results: kept 60 days (callbacks are asked for up to a month later).
  for (const { key } of (await store.list({ prefix: "feedback/" })).blobs) {
    const r = await store.get(key, { type: "json" });
    if (r?.at && now - new Date(r.at) > 60 * 86_400_000) {
      await store.delete(key);
      n++;
    }
  }
  // Call transcripts for the review: kept 60 days.
  n += await purgeReviews(store, now);
  // "seen" markers hold no personal data; they only need to outlive the 7-day order window.
  for (const { key } of (await store.list({ prefix: "seen/" })).blobs) {
    const m = await store.get(key, { type: "json" });
    if (m?.at && now - new Date(m.at) > 30 * 86_400_000) await store.delete(key);
  }
  return n;
}

const INBOUND_LABELS = {
  order_placed: "📥 Поръчка по телефона",
  order_status: "📦 Пита за пратка",
  question: "❓ Въпрос",
  complaint: "⚠️ Оплакване",
  other: "📞 Входящо обаждане",
};

/** After an inbound call: tell Mitko only when someone has to act. */
async function handleInboundCall({ notify }, call) {
  const caller = call.variables?.system__caller_id || "";
  const act = call.needsHuman || call.health || call.questions || ["complaint", "other", ""].includes(call.intent) || call.failedChecks.length;
  if (!act) return { inbound: true, notified: false };
  const label = (call.needsHuman ? "🙋 Обади се – " : "") + (INBOUND_LABELS[call.intent] || INBOUND_LABELS.other);
  await notify(buildMessage({ orderNo: "входящо", site: "входяща линия", name: "клиент", phone: caller }, label, call));
  return { inbound: true, notified: true };
}

/** Ready-made texts for the agent's one extra offer (no arithmetic left to the AI). */
export function upsellVariables(u) {
  if (!u) return { upsell_kind: "none", upsell_box_price: "", total_with_one_box: "", total_with_two_boxes: "", delivery_fee: "" };
  return {
    upsell_kind: u.kind,
    upsell_box_price: moneyBG(u.box),
    total_with_one_box: moneyBG(u.totalOne),
    total_with_two_boxes: u.totalTwo == null ? "" : moneyBG(u.totalTwo),
    delivery_fee: moneyBG(u.shipping),
  };
}
