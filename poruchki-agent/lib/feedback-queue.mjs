// Feedback calls from Telegram, through the Zadarma callback (the customer sees
// our Bulgarian number). Mitko picks the orders:
//   /obratna 1649 1641 …  → reads each order (Middleware: delivered?, ConvertBuilder:
//                            name, phone, address, items) and shows the list
//   /obratna_test 1649    → the same call, but to Mitko's test phone
//   /obratna_start        → calls them one after another (Mon–Sat 10:00–19:30): the next
//                            call starts as soon as the previous result arrives; a customer
//                            who did not answer is noticed by the tick (every 5 minutes)
//   /obratna_stop, /obratna_status
// Each order is a record "fb-<number>" – the same key as the call's order_key, so the
// initiation webhook marks it answered and the result (lib/feedback.mjs) marks it done.
import { NIKOLAY_VOICE, PERSONAS } from "./persona.mjs";
import { feedbackVariables } from "./feedback.mjs";
import { normalizePhoneBG, sofiaNow, inCallingHours } from "./format.mjs";
import { getSettings, saveSettings } from "./store.mjs";
import { PENDING_TTL_MIN, phoneDigits } from "./callback.mjs";
import { salesStats, salesText } from "./sales-coach.mjs";
import { alreadyCalled, callbackDue, dateBG } from "./feedback-callbacks.mjs";

export const FEEDBACK_HOURS = "10:00-19:30"; // Monday to Saturday
export const FEEDBACK_HOURS_SUNDAY = "11:00-18:00";
const HOURS_TEXT = "пон–съб 10:00–19:30, нед 11:00–18:00";

/** May a feedback call start now (Sofia time)? */
export function feedbackHoursOpen(now = new Date()) {
  return inCallingHours(sofiaNow(now).weekday === 0 ? FEEDBACK_HOURS_SUNDAY : FEEDBACK_HOURS, now);
}
export const MAX_TRIES = 2; // not answered → once more, an hour later
export const RETRY_AFTER_MIN = 60;
// Zadarma rings the customer for under a minute: after this, nobody answered.
// (The tick runs every 5 minutes, so this is checked at the first run after it.)
export const FB_NO_ANSWER_MIN = 2;
const MAX_ORDERS = 20;
// Connected, but no result yet: after this, ask ElevenLabs how the conversation ended.
const CHECK_AFTER_MIN = 2;
// Never wait longer than this for a result (a real call lasts 2–5 minutes).
const RESULT_WAIT_MIN = 15;

const recKey = (label) => `fb-${label}`;
const clients = (n) => (n === 1 ? "1 клиент" : `${n} клиента`);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const STATUS_BG = {
  ready: "⏳ чака /obratna_start",
  waiting: "⏳ на опашката",
  calling: "📞 звъни се",
  done: "✅ говорихме",
  no_answer: "📵 не вдигна",
  failed: "⚠️ грешка",
};

/** "1649, 1641 1638" → ["1649", "1641", "1638"] */
export function parseLabels(text) {
  return [...new Set(String(text || "").match(/\d{3,7}/g) || [])].slice(0, MAX_ORDERS);
}

/**
 * One order's data for a feedback call, or {label, error}.
 * Middleware says whether it was delivered and gives ConvertBuilder's id;
 * ConvertBuilder has the name, phone, address and items.
 */
export async function loadFeedbackOrder(deps, site, label) {
  try {
    const mw = await deps.mw.findOrder(site, label);
    if (!mw) return { label, error: "няма я в Middleware" };
    if (mw.status !== "completed") return { label, error: `не е доставена (${mw.statusText})` };
    // ConvertBuilder's copy: by its id from Middleware, else by the number around the order date.
    let o = mw.externalId ? await deps.cb.getOrder(site, mw.externalId).catch(() => null) : null;
    if (!o && mw.createdAt && deps.cb.findByNumber) o = await deps.cb.findByNumber(site, label, mw.createdAt);
    if (!o) return { label, error: "няма я в ConvertBuilder" };
    const ship = o.shippingAddress || {};
    const bill = o.billingAddress || {};
    const phone = normalizePhoneBG(ship.phone || bill.phone || "");
    if (!phone) return { label, error: "няма валиден телефон" };
    return {
      label: String(label),
      site,
      name: o.customerName || ship.name || bill.name || "",
      phone,
      city: ship.city || bill.city || "",
      address: ship.address || bill.address || "",
      items: (o.items || []).map((it) => ({ name: String(it.name || "").trim(), q: it.quantity || 1 })),
      orderedAt: o.created ? new Date(Number(o.created) * 1000).toISOString() : mw.createdAt || null,
    };
  } catch (err) {
    return { label, error: `не успях да я прочета (${String(err.message).slice(0, 80)})` };
  }
}

/** One line about a customer for Telegram (first name only). */
function line(order, vars) {
  const first = String(order.name || "").trim().split(/\s+/)[0] || "?";
  return `#${esc(order.label)} · ${esc(first)} · ${esc(vars.bought_text)} · получена ${esc(vars.delivered_ago)}`;
}

/** /obratna <numbers>: read the orders and keep them ready for /obratna_start. */
export async function prepareFeedback(deps, text, now = new Date()) {
  const labels = parseLabels(text);
  if (!labels.length) {
    return "Напиши номерата на поръчките, например:\n/obratna 1649 1641 1638\nПосле /obratna_test 1649 – пробно обаждане до теб, и /obratna_start – звъни на всички.";
  }
  const site = deps.config.sites?.[0] || "bg";
  const results = await Promise.all(labels.map((l) => loadFeedbackOrder(deps, site, l)));
  const ok = [];
  const skipped = [];
  for (const r of results) {
    if (r.error) {
      skipped.push(`#${esc(r.label)} – ${esc(r.error)}`);
      continue;
    }
    const called = (await deps.store.get(`feedback/fb-${r.label}`, { type: "json" })) || (await alreadyCalled(deps.store, r.label, r.phone));
    if (called) {
      skipped.push(`#${esc(r.label)} – ${called.doNotCall ? "не иска обаждания" : "вече говорихме с този клиент"}`);
      continue;
    }
    const existing = await deps.store.get(recKey(r.label), { type: "json" });
    if (existing && ["waiting", "calling"].includes(existing.status)) {
      skipped.push(`#${esc(r.label)} – вече е на опашката`);
      continue;
    }
    await deps.store.setJSON(recKey(r.label), { label: r.label, status: "ready", tries: 0, order: r, queuedAt: now.toISOString() });
    ok.push(line(r, feedbackVariables(r, now)));
  }
  return [
    `<b>Обратна връзка – ${clients(ok.length)} ${ok.length === 1 ? "готов" : "готови"}</b>`,
    ...ok,
    ...(skipped.length ? ["", "Пропуснати:", ...skipped] : []),
    "",
    ok.length ? `Пробно обаждане до теб: /obratna_test ${esc(results.find((r) => !r.error)?.label || "")}\nЗвъни на всички (${HOURS_TEXT}, по един): /obratna_start` : "Няма кого да звъннем.",
  ].join("\n");
}

/** /obratna_test <number>: the feedback call for that order, to Mitko's phone. */
export async function testFeedback(deps, text, now = new Date()) {
  const label = parseLabels(text)[0];
  if (!label) return "Напиши номер на поръчка, например /obratna_test 1649";
  if (!deps.config.testPhone) return "Няма зададен тестов номер (TEST_PHONE).";
  let order = (await deps.store.get(recKey(label), { type: "json" }))?.order;
  if (!order) {
    const r = await loadFeedbackOrder(deps, deps.config.sites?.[0] || "bg", label);
    if (r.error) return `#${esc(label)} – ${esc(r.error)}`;
    order = r;
  }
  // "/obratna_test 1649 николай" – hear Николай's voice; otherwise Елена.
  const persona = /николай|nikolay|nikolai|мъж/i.test(String(text)) ? "nikolay" : "elena";
  const { voice_id: _voice, ...base } = feedbackVariables(order, now);
  const variables = { ...base, order_key: "test", test: "yes", persona, ...(persona === "nikolay" ? { voice_id: NIKOLAY_VOICE.id } : {}) };
  try {
    await deps.call({ to: deps.config.testPhone, variables, script: "feedback" });
  } catch (err) {
    return `⚠️ Не успях да звънна: ${esc(String(err.message).slice(0, 300))}`;
  }
  return `📞 ${PERSONAS[persona]} звъни на ${esc(deps.config.testPhone)} като за поръчка #${esc(label)} (${esc(variables.customer_name)}, ${esc(variables.bought_text)}). Отговаряй като клиента. После ще ти пиша резултата.`;
}

async function records(store) {
  const out = [];
  for (const { key } of (await store.list({ prefix: "fb-" })).blobs) {
    if (key.startsWith("fb-called/")) continue;
    const entry = await store.getWithMetadata(key, { type: "json" });
    if (entry?.data?.order) out.push({ key, etag: entry.etag, rec: entry.data });
  }
  return out.sort((a, b) => String(a.rec.queuedAt).localeCompare(String(b.rec.queuedAt)));
}

/** Save a change unless the webhook changed the record in between (then the next run decides). */
async function update(store, { key, etag, rec }, changes) {
  const { modified } = await store.setJSON(key, { ...rec, ...changes }, { onlyIfMatch: etag });
  return modified;
}

/** /obratna_start */
export async function startFeedback(deps, now = new Date()) {
  let n = 0;
  for (const r of await records(deps.store)) {
    if (r.rec.status !== "ready") continue;
    if (await update(deps.store, r, { status: "waiting", notBefore: now.toISOString() })) n++;
  }
  const settings = await getSettings(deps.store);
  if (!n && !(await records(deps.store)).some((r) => ["waiting", "calling"].includes(r.rec.status))) {
    return "Няма клиенти за обаждане. Първо /obratna и номерата на поръчките.";
  }
  await saveSettings(deps.store, { ...settings, feedbackOn: true, feedbackReported: false });
  const open = feedbackHoursOpen(now);
  const lines = [
    `▶️ Обратна връзка: ${clients(n)} на опашката. Звъня един след друг – следващият, щом свърши предишният разговор${open ? ". Започвам до 5 минути." : `. Звъня ${HOURS_TEXT}.`}`,
    "/obratna_stop спира, /obratna_status показва докъде сме.",
  ];
  if (settings.paused) lines.push("⚠️ Обажданията са на пауза (/stop) – напиши /pusni, за да тръгнат.");
  return lines.join("\n");
}

/** /obratna_stop */
export async function stopFeedback(deps) {
  const settings = await getSettings(deps.store);
  await saveSettings(deps.store, { ...settings, feedbackOn: false });
  return "⏸ Обратната връзка е спряна. Който е на опашката, остава там – /obratna_start продължава.";
}

/** /obratna_obeshtani: the calls we promised, by date. */
export async function promisedCalls(deps, now = new Date()) {
  const due = (await records(deps.store))
    .filter((r) => r.rec.callbackDue && !r.rec.callbackStarted)
    .sort((a, b) => String(a.rec.callbackDue).localeCompare(String(b.rec.callbackDue)));
  if (!due.length) return "Няма обещани обаждания.";
  return [
    `<b>Обещани обаждания – ${clients(due.length)}</b>`,
    ...due.map(({ rec }) => `${esc(dateBG(new Date(rec.callbackDue)))} · #${esc(rec.label)} ${esc(String(rec.order.name || "").split(/\s+/)[0])}${rec.callbackWhen ? ` – каза „${esc(rec.callbackWhen)}“` : ""}`),
    "",
    "В този ден звъня сама (в часовете за обратна връзка) и ти пиша.",
  ].join("\n");
}

/** /obratna_status */
export async function feedbackStatus(deps) {
  const all = await records(deps.store);
  if (!all.length) return "Няма клиенти за обратна връзка. /obratna и номерата на поръчките.";
  const settings = await getSettings(deps.store);
  return [
    `<b>Обратна връзка</b> – ${settings.feedbackOn ? "▶️ звъни" : "⏸ спряна"}`,
    salesText(await salesStats(deps.store)),
    "",
    ...all.slice(-25).map(({ rec }) => `#${esc(rec.label)} ${esc(String(rec.order.name || "").split(/\s+/)[0])} – ${STATUS_BG[rec.status] || esc(rec.status)}${rec.outcome ? ` (${esc(rec.outcome)})` : ""}${rec.callbackDue && !rec.callbackStarted ? ` · 🔁 ${esc(dateBG(new Date(rec.callbackDue)))}` : ""}`),
    ...(all.some((r) => r.rec.callbackDue && !r.rec.callbackStarted) ? ["", "Обещаните обаждания: /obratna_obeshtani"] : []),
  ].join("\n");
}

/**
 * Every tick: close calls nobody answered, then start the next one.
 * One call at a time, and never while another callback is waiting to connect,
 * so the initiation webhook cannot mix two customers up.
 */
export async function runFeedbackQueue(deps, now = new Date()) {
  const { store } = deps;
  let all = await records(store);
  if (!all.length) return { feedback: "empty" };
  let settings = await getSettings(store);

  // 0. Calls we promised („след месец“): on that day, in the calling hours, back to the queue.
  if (!settings.callbacksBackfilled) {
    // Results from before this existed: their date from the customer's words and the day of the call.
    for (const r of all) {
      if (r.rec.status !== "done" || r.rec.callbackDue || r.rec.callbackStarted) continue;
      const res = await store.get(`feedback/fb-${r.rec.label}`, { type: "json" }).catch(() => null);
      if (!res || !["later", "busy"].includes(res.outcome) || res.doNotCall) continue;
      const { due } = callbackDue(res.callbackWhen, res.outcome, new Date(res.at));
      await update(store, r, { callbackDue: due.toISOString(), callbackWhen: res.callbackWhen || "" });
    }
    settings = { ...settings, callbacksBackfilled: true };
    await saveSettings(store, settings);
    all = await records(store);
  }
  if (feedbackHoursOpen(now) && !settings.paused) {
    const due = all.filter((r) => r.rec.status === "done" && r.rec.callbackDue && !r.rec.callbackStarted && new Date(r.rec.callbackDue) <= now);
    const back = [];
    for (const r of due) {
      const callback = { when: r.rec.callbackWhen || "", prevAt: r.rec.finishedAt || r.rec.queuedAt };
      if (await update(store, r, { status: "waiting", tries: 0, notBefore: now.toISOString(), callbackStarted: now.toISOString(), callback, outcome: null })) back.push(r.rec);
    }
    if (back.length) {
      settings = { ...settings, feedbackOn: true, feedbackReported: false };
      await saveSettings(store, settings);
      await deps.notify(
        [`🔁 <b>Днес звъня пак, както обещахме – ${clients(back.length)}</b>`, ...back.map((rec) => `#${esc(rec.label)} ${esc(String(rec.order.name || "").split(/\s+/)[0])}${rec.callbackWhen ? ` – каза „${esc(rec.callbackWhen)}“` : ""}`), "/obratna_stop спира."].join("\n"),
      );
      all = await records(store);
    }
  }

  // 1. Calls in progress.
  let busy = false;
  for (const r of all) {
    if (r.rec.status !== "calling") continue;
    const mins = (now - new Date(r.rec.startedAt)) / 60_000;
    let answered = Boolean(r.rec.answeredAt);
    if (answered && mins > CHECK_AFTER_MIN && deps.conversationState) {
      // The customer may have dropped the call while it was connecting: ElevenLabs then
      // ends the conversation with 0 seconds and sends no result. That is a missed call.
      const conv = (r.rec.conversationIds || []).at(-1);
      const st = conv ? await deps.conversationState(conv).catch(() => null) : null;
      if (st && ["done", "failed"].includes(st.status) && !st.secs && !st.messages) answered = false;
    }
    if (answered) {
      if (mins > RESULT_WAIT_MIN) await update(store, r, { status: "done", outcome: r.rec.outcome || "no_result", finishedAt: now.toISOString() });
      else busy = true;
    } else if (mins > FB_NO_ANSWER_MIN) {
      // Not answered: the waiting callback is no longer ours, so the next call need not wait for it.
      const digits = phoneDigits(r.rec.order.phone);
      if (digits) await store.delete(`pending/${digits}`);
      const again = (r.rec.tries || 0) < MAX_TRIES;
      await update(store, r, again ? { status: "waiting", notBefore: new Date(now.getTime() + RETRY_AFTER_MIN * 60_000).toISOString() } : { status: "no_answer", finishedAt: now.toISOString() });
    } else {
      busy = true;
    }
  }

  // 2. Everything finished: one summary for Mitko.
  const fresh = await records(store);
  const open = fresh.filter((r) => ["waiting", "calling"].includes(r.rec.status));
  if (!open.length) {
    if (settings.feedbackOn && !settings.feedbackReported) {
      await saveSettings(store, { ...settings, feedbackOn: false, feedbackReported: true });
      const finished = fresh.filter((r) => ["done", "no_answer", "failed"].includes(r.rec.status));
      const talked = finished.filter((r) => r.rec.status === "done").length;
      await deps.notify(`✅ <b>Обратна връзка – готово</b>\nГоворихме: ${talked} · Не вдигнаха: ${finished.filter((r) => r.rec.status === "no_answer").length}\n${salesText(await salesStats(store, now))}\nПодробности: /obratna_status · Научени правила: /pravila`);
    }
    return { feedback: "nothing to call" };
  }

  // 3. Start the next call, if we may.
  if (!settings.feedbackOn) return { feedback: "stopped" };
  // /stop in Telegram stops these too. CALLS_PAUSED in Netlify is only for the order calls:
  // feedback calls start only when Mitko writes /obratna_start.
  if (settings.paused) return { feedback: "paused" };
  if (!feedbackHoursOpen(now)) return { feedback: "outside hours" };
  if (busy) return { feedback: "call in progress" };
  for (const { key } of (await store.list({ prefix: "pending/" })).blobs) {
    const p = await store.get(key, { type: "json" });
    if (p && now - new Date(p.at) < PENDING_TTL_MIN * 60_000) return { feedback: "another call is connecting" };
  }
  const next = open.find((r) => r.rec.status === "waiting" && new Date(r.rec.notBefore || 0) <= now);
  if (!next) return { feedback: "waiting for retries" };

  const tries = (next.rec.tries || 0) + 1;
  // Claim it before calling, so the webhook finds the record when the customer answers.
  if (!(await update(store, next, { status: "calling", tries, startedAt: now.toISOString(), answeredAt: null }))) return { feedback: "busy" };
  const variables = feedbackVariables(next.rec.order, now, next.rec.callback || null);
  try {
    await deps.call({ to: next.rec.order.phone, variables, script: "feedback" });
    return { feedback: `calling #${next.rec.label} (try ${tries})` };
  } catch (err) {
    const entry = await store.getWithMetadata(next.key, { type: "json" });
    if (entry?.data) await update(store, { key: next.key, etag: entry.etag, rec: entry.data }, { status: tries < MAX_TRIES ? "waiting" : "failed", error: String(err.message).slice(0, 200), notBefore: new Date(now.getTime() + 10 * 60_000).toISOString() });
    return { feedback: `call failed #${next.rec.label}: ${err.message}` };
  }
}
