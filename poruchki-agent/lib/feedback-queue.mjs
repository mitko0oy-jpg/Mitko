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
import { feedbackVariables } from "./feedback.mjs";
import { normalizePhoneBG, sofiaNow, inCallingHours } from "./format.mjs";
import { getSettings, saveSettings } from "./store.mjs";
import { PENDING_TTL_MIN, phoneDigits } from "./callback.mjs";

export const FEEDBACK_HOURS = "10:00-19:30"; // Monday to Saturday
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
    if (await deps.store.get(`feedback/fb-${r.label}`, { type: "json" })) {
      skipped.push(`#${esc(r.label)} – вече говорихме с този клиент`);
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
    ok.length ? `Пробно обаждане до теб: /obratna_test ${esc(results.find((r) => !r.error)?.label || "")}\nЗвъни на всички (пон–съб 10:00–19:30, по един): /obratna_start` : "Няма кого да звъннем.",
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
  const variables = { ...feedbackVariables(order, now), order_key: "test", test: "yes", persona: "elena" };
  try {
    await deps.call({ to: deps.config.testPhone, variables, script: "feedback" });
  } catch (err) {
    return `⚠️ Не успях да звънна: ${esc(String(err.message).slice(0, 300))}`;
  }
  return `📞 Елена звъни на ${esc(deps.config.testPhone)} като за поръчка #${esc(label)} (${esc(variables.customer_name)}, ${esc(variables.bought_text)}). Отговаряй като клиента. После ще ти пиша резултата.`;
}

async function records(store) {
  const out = [];
  for (const { key } of (await store.list({ prefix: "fb-" })).blobs) {
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
  const t = sofiaNow(now);
  const open = t.weekday !== 0 && inCallingHours(FEEDBACK_HOURS, now);
  const lines = [
    `▶️ Обратна връзка: ${clients(n)} на опашката. Звъня един след друг – следващият, щом свърши предишният разговор${open ? ". Започвам до 5 минути." : ". От понеделник до събота, 10:00–19:30."}`,
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

/** /obratna_status */
export async function feedbackStatus(deps) {
  const all = await records(deps.store);
  if (!all.length) return "Няма клиенти за обратна връзка. /obratna и номерата на поръчките.";
  const settings = await getSettings(deps.store);
  return [
    `<b>Обратна връзка</b> – ${settings.feedbackOn ? "▶️ звъни" : "⏸ спряна"}`,
    ...all.slice(-25).map(({ rec }) => `#${esc(rec.label)} ${esc(String(rec.order.name || "").split(/\s+/)[0])} – ${STATUS_BG[rec.status] || esc(rec.status)}${rec.outcome ? ` (${esc(rec.outcome)})` : ""}`),
  ].join("\n");
}

/**
 * Every tick: close calls nobody answered, then start the next one.
 * One call at a time, and never while another callback is waiting to connect,
 * so the initiation webhook cannot mix two customers up.
 */
export async function runFeedbackQueue(deps, now = new Date()) {
  const { store } = deps;
  const all = await records(store);
  if (!all.length) return { feedback: "empty" };
  const settings = await getSettings(store);

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
      await deps.notify(`✅ <b>Обратна връзка – готово</b>\nГоворихме: ${talked} · Не вдигнаха: ${finished.filter((r) => r.rec.status === "no_answer").length}\nПодробности: /obratna_status`);
    }
    return { feedback: "nothing to call" };
  }

  // 3. Start the next call, if we may.
  if (!settings.feedbackOn) return { feedback: "stopped" };
  // /stop in Telegram stops these too. CALLS_PAUSED in Netlify is only for the order calls:
  // feedback calls start only when Mitko writes /obratna_start.
  if (settings.paused) return { feedback: "paused" };
  const t = sofiaNow(now);
  if (t.weekday === 0 || !inCallingHours(FEEDBACK_HOURS, now)) return { feedback: "outside hours" };
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
  const variables = feedbackVariables(next.rec.order, now);
  try {
    await deps.call({ to: next.rec.order.phone, variables, script: "feedback" });
    return { feedback: `calling #${next.rec.label} (try ${tries})` };
  } catch (err) {
    const entry = await store.getWithMetadata(next.key, { type: "json" });
    if (entry?.data) await update(store, { key: next.key, etag: entry.etag, rec: entry.data }, { status: tries < MAX_TRIES ? "waiting" : "failed", error: String(err.message).slice(0, 200), notBefore: new Date(now.getTime() + 10 * 60_000).toISOString() });
    return { feedback: `call failed #${next.rec.label}: ${err.message}` };
  }
}
