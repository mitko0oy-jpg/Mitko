// „Невзета пратка“ (idea from RevOrder's call center): Елена calls the customers whose parcel still waits at the
// courier's office after OrderDesk's two SMS reminders (day 4 and day 6), before the courier sends it back.
//   /nevzeti_start [ден] – switched on: every half hour in the calling hours the list comes from OrderDesk
//                          (parcels from day 6 – or the given day – not called yet for this stay) and Елена calls
//                          them one by one, like the feedback calls (never two calls at once).
//   /nevzeti_stop, /nevzeti (the list now and the queue), /nevzeti_test <id> – the call to Mitko's test phone.
// What the customer said goes to OrderDesk (the order's history; a „Провери“ note when someone must act, e.g.
// redirect the parcel) and to Telegram. Records: "pk-<order id>-<since>" (one per stay at the office).
import { addressBG } from "./feedback.mjs";
import { feedbackHoursOpen } from "./feedback-queue.mjs";
import { moneyBG } from "./format.mjs";
import { lineBusy } from "./line.mjs";
import { getSettings, saveSettings } from "./store.mjs";
import { phoneDigits } from "./callback.mjs";

export const PICKUP_DAY = 6; // after the second SMS (OrderDesk: day 4 and day 6)
export const MAX_TRIES = 2;
export const RETRY_AFTER_MIN = 90;
const NO_ANSWER_MIN = 2;
const RESULT_WAIT_MIN = 15;
const REFRESH_MIN = 30;
const KEEP_DAYS = 14;
const HOURS_TEXT = "пон–съб 10:00–19:30, нед 11:00–18:00";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "?";
const recKey = (o) => `pk-${o.id}-${o.since}`;
const ORD = { 2: "втори", 3: "трети", 4: "четвърти", 5: "пети", 6: "шести", 7: "седми", 8: "осми", 9: "девети", 10: "десети" };
const COURIER = { econt: "Еконт", speedy: "Спиди" };

export const OUTCOME_BG = {
  will_pickup: "✅ ще я вземе",
  someone_else: "✅ ще я вземе друг човек",
  redirect: "🔀 иска друг офис или адрес",
  already_picked: "❔ казва, че вече я е взел",
  refuse: "❌ не я иска",
  busy: "⏰ зает, да звъннем по-късно",
  wrong_person: "👤 вдигна друг човек",
  wrong_number: "⚠️ грешен номер",
  do_not_call: "🚫 не иска обаждания",
  needs_human: "🙋 иска да говори с колега",
  voicemail: "📭 гласова поща",
  no_answer: "📵 не вдигна",
  no_conversation: "📵 няма разговор",
  unknown: "❔ говорихме, но резултатът не дойде – виж разговора",
};

/** The office as it is said: „в офис на Еконт „Шумен – Център““ (the street left out). */
export function officeText(o) {
  const name = String(o.office || "")
    .replace(/^До офис (econt|speedy)\[\d+\]:\s*/i, "")
    .replace(/\s*(,\s*)?(ул\.|бул\.|ж\.к\.|кв\.|пл\.).*$/i, "")
    .replace(/\s*\(автомат\)\s*/i, "")
    .trim();
  const c = COURIER[o.courier] || "куриера";
  const automat = /автомат|apt|box/i.test(String(o.office || ""));
  return name ? `в ${automat ? "автомат" : "офис"} на ${c} „${name}“` : `в офиса на ${c}`;
}

/** What Елена knows for the call. */
export function pickupVariables(o, { test = false } = {}) {
  const edu = /edu|еду/i.test(String(o.shop || ""));
  const items = (o.items || []).map((i) => `${Number(i.qty) > 1 ? `${i.qty} броя ` : ""}${String(i.name || "").replace(/\s*[-–]\s*\d.*$/, "").trim()}`).filter(Boolean);
  const amount = String(o.currency || "EUR") === "EUR" ? moneyBG(o.total) : `${o.total} ${o.currency}`;
  return {
    campaign: "pickup",
    order_key: test ? "test" : recKey(o),
    persona: "elena",
    test: test ? "yes" : "no",
    customer_name: addressBG(o.name),
    shop_name: edu ? "Еду БЕЛ" : "магазина за продукти с пчелна отрова",
    order_number: String(o.orderNo || ""),
    items_text: items.join(", ") || "поръчката Ви",
    office_text: officeText(o),
    days_text: ORD[o.officeDay] ? `вече ${ORD[o.officeDay]} ден` : "от няколко дни",
    courier_name: COURIER[o.courier] || "куриера",
    tracking_text: String(o.trackingNo || "").replace(/(\d{3})(?=\d)/g, "$1 "),
    amount_text: amount || "сумата по поръчката",
    redirect_text: o.canRedirect ? "да – колега може да я пренасочи към друг офис или адрес" : "не – при този куриер не може; може да я вземе друг човек с номера на пратката",
  };
}

/** The pickup call's fields (the incoming agent collects them with a "pk_" prefix). */
export function pickupFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) if (k.startsWith("pk_") && v !== "" && v != null) out[k.slice(3)] = v;
  return out;
}

async function records(store) {
  const out = [];
  for (const { key } of (await store.list({ prefix: "pk-" })).blobs) {
    const entry = await store.getWithMetadata(key, { type: "json" });
    if (entry?.data?.order) out.push({ key, etag: entry.etag, rec: entry.data });
  }
  return out.sort((a, b) => String(a.rec.queuedAt).localeCompare(String(b.rec.queuedAt)));
}
async function update(store, { key, etag, rec }, changes) {
  const { modified } = await store.setJSON(key, { ...rec, ...changes }, { onlyIfMatch: etag });
  return modified;
}

/** Tell OrderDesk (never stops the queue). */
async function report(deps, rec, body) {
  if (!deps.platform?.enabled || !rec.order?.id) return null;
  return deps.platform.pickupResult(rec.order.id, { since: rec.order.since, attempt: rec.tries || 1, ...body }).catch((err) => ({ error: err.message }));
}

/** New parcels from OrderDesk into the queue (and old finished records out). */
async function refresh(deps, settings, now) {
  if (!deps.platform?.enabled) return { added: 0, error: "OrderDesk не е свързан (PLATFORM_URL, PLATFORM_TOKEN)" };
  const list = await deps.platform.pickupOrders(settings.pickupDay || PICKUP_DAY);
  let added = 0;
  for (const o of list) {
    if (!phoneDigits(o.phone)) continue;
    const key = recKey(o);
    if (await deps.store.get(key, { type: "json" })) continue;
    await deps.store.setJSON(key, { status: "waiting", tries: 0, order: o, queuedAt: now.toISOString(), notBefore: now.toISOString() });
    added++;
  }
  for (const r of await records(deps.store)) {
    if (["done", "no_answer", "failed"].includes(r.rec.status) && now - new Date(r.rec.finishedAt || r.rec.queuedAt) > KEEP_DAYS * 86_400_000) await deps.store.delete(r.key);
  }
  return { added, found: list.length };
}

/** Every tick (and after each result): close unanswered calls, take new parcels, start the next call. */
export async function runPickupQueue(deps, now = new Date()) {
  const { store } = deps;
  let settings = await getSettings(store);
  if (!settings.pickupOn) return { pickup: "off" };

  // 1. Calls in progress.
  let busy = false;
  for (const r of await records(store)) {
    if (r.rec.status !== "calling") continue;
    const mins = (now - new Date(r.rec.startedAt)) / 60_000;
    let answered = Boolean(r.rec.answeredAt);
    if (answered && mins > 2 && deps.conversationState) {
      const conv = (r.rec.conversationIds || []).at(-1);
      const st = conv ? await deps.conversationState(conv).catch(() => null) : null;
      if (st && ["done", "failed"].includes(st.status) && !st.secs && !st.messages) answered = false;
    }
    if (answered) {
      if (mins > RESULT_WAIT_MIN) await update(store, r, { status: "done", outcome: r.rec.outcome || "no_result", finishedAt: now.toISOString() });
      else busy = true;
    } else if (mins > NO_ANSWER_MIN) {
      const digits = phoneDigits(r.rec.order.phone);
      if (digits) await store.delete(`pending/${digits}`);
      const again = (r.rec.tries || 0) < MAX_TRIES;
      if (await update(store, r, again ? { status: "waiting", notBefore: new Date(now.getTime() + RETRY_AFTER_MIN * 60_000).toISOString() } : { status: "no_answer", finishedAt: now.toISOString() })) {
        await report(deps, r.rec, { outcome: "no_answer", final: !again });
        if (!again) await deps.notify(`📦 Невзета пратка #${esc(r.rec.order.orderNo)} ${esc(first(r.rec.order.name))} – 📵 не вдигна и на втория опит. Пратката чака ${esc(officeText(r.rec.order))}.`);
      }
    } else busy = true;
  }

  // 2. New parcels, every half hour in the calling hours.
  const open = feedbackHoursOpen(now);
  let refreshed = null;
  if (open && (!settings.pickupRefreshedAt || now - new Date(settings.pickupRefreshedAt) > REFRESH_MIN * 60_000)) {
    refreshed = await refresh(deps, settings, now).catch((err) => ({ error: err.message }));
    settings = { ...(await getSettings(store)), pickupRefreshedAt: now.toISOString() };
    await saveSettings(store, settings);
  }

  // 3. The next call, if the line is free.
  if (settings.paused) return { pickup: "paused", refreshed };
  if (!open) return { pickup: "outside hours", refreshed };
  if (busy) return { pickup: "call in progress", refreshed };
  const line = await lineBusy(store, now, "pk-");
  if (line) return { pickup: line, refreshed };
  const next = (await records(store)).find((r) => r.rec.status === "waiting" && new Date(r.rec.notBefore || 0) <= now);
  if (!next) return { pickup: "nothing to call", refreshed };
  const tries = (next.rec.tries || 0) + 1;
  if (!(await update(store, next, { status: "calling", tries, startedAt: now.toISOString(), answeredAt: null }))) return { pickup: "busy", refreshed };
  try {
    await deps.call({ to: next.rec.order.phone, variables: pickupVariables(next.rec.order), script: "pickup" });
    return { pickup: `calling #${next.rec.order.orderNo} (try ${tries})`, refreshed };
  } catch (err) {
    const entry = await store.getWithMetadata(next.key, { type: "json" });
    if (entry?.data) await update(store, { key: next.key, etag: entry.etag, rec: entry.data }, { status: tries < MAX_TRIES ? "waiting" : "failed", error: String(err.message).slice(0, 200), notBefore: new Date(now.getTime() + 10 * 60_000).toISOString(), ...(tries < MAX_TRIES ? {} : { finishedAt: now.toISOString() }) });
    return { pickup: `call failed #${next.rec.order.orderNo}: ${err.message}`, refreshed };
  }
}

/** The result of a pickup call (ElevenLabs webhook): OrderDesk, the queue and Telegram. */
export async function handlePickupCall(deps, call, now = new Date()) {
  const v = call.variables || {};
  const f = pickupFields(call.fields);
  const spoke = /^Клиент:/m.test(call.transcript || "");
  let outcome = String(f.outcome || "").toLowerCase();
  // No pk_ result although the customer spoke (e.g. /callback_setup not run yet): a person must look.
  if (!OUTCOME_BG[outcome]) outcome = spoke ? "unknown" : "no_conversation";
  const lines = [
    `📦 <b>Невзета пратка</b>${v.test === "yes" ? " (тест)" : ""} #${esc(v.order_number)} ${esc(v.customer_name)} – ${OUTCOME_BG[outcome]}`,
    f.when ? `Кога: „${esc(f.when)}“` : "",
    f.new_place ? `Къде: „${esc(f.new_place)}“${outcome === "redirect" ? " → пренасочи я от OrderDesk (за Еконт: „Пренасочи“ в поръчката)" : ""}` : "",
    f.reason ? `Защо: „${esc(f.reason)}“` : "",
    f.questions ? `Въпроси: ${esc(f.questions)}` : "",
    f.summary ? esc(f.summary) : call.summary ? esc(call.summary) : "",
  ].filter(Boolean);
  if (v.test === "yes" || v.order_key === "test") {
    await deps.notify(lines.join("\n"));
    return { pickup: "test" };
  }
  const entry = await deps.store.getWithMetadata(String(v.order_key || ""), { type: "json" });
  const rec = entry?.data;
  if (!rec) {
    await deps.notify(lines.join("\n"));
    return { pickup: "no record" };
  }
  // Dropped before the customer said anything: once more later, like a missed call.
  if (outcome === "no_conversation" && !spoke && (rec.tries || 0) < MAX_TRIES) {
    await deps.store.setJSON(v.order_key, { ...rec, status: "waiting", notBefore: new Date(now.getTime() + RETRY_AFTER_MIN * 60_000).toISOString() }, { onlyIfMatch: entry.etag });
    await report(deps, rec, { outcome: "no_conversation", final: false });
    return { pickup: "dropped, retry" };
  }
  await deps.store.setJSON(v.order_key, { ...rec, status: "done", outcome, finishedAt: now.toISOString(), conversationId: call.conversationId }, { onlyIfMatch: entry.etag });
  const pr = await report(deps, rec, {
    outcome,
    when: String(f.when || ""),
    new_place: String(f.new_place || ""),
    reason: String(f.reason || ""),
    summary: String(f.summary || call.summary || "").slice(0, 500),
    final: true,
  });
  if (pr?.error) lines.push(`⚠️ Не успях да го запиша в OrderDesk: ${esc(pr.error)}`);
  await deps.notify(lines.join("\n"));
  return { pickup: outcome };
}

// ---- Telegram ----

const parseDay = (text) => {
  const n = Number((String(text || "").match(/\d+/) || [])[0]);
  return n >= 2 && n <= 9 ? n : null;
};

/** /nevzeti_start [ден] */
export async function startPickup(deps, text = "", now = new Date()) {
  if (!deps.platform?.enabled) return "OrderDesk не е свързан с агента (PLATFORM_URL, PLATFORM_TOKEN в Netlify).";
  const settings = await getSettings(deps.store);
  const day = parseDay(text) || settings.pickupDay || PICKUP_DAY;
  await saveSettings(deps.store, { ...settings, pickupOn: true, pickupDay: day, pickupRefreshedAt: null });
  const lines = [
    `▶️ <b>Невзети пратки</b>: Елена звъни на клиентите, чиято пратка чака в офиса от ${day}-ия ден (денят на пристигане е 1-ви), след двата SMS-а от OrderDesk.`,
    `Всеки ден ${HOURS_TEXT}, по един – след обратната връзка, никога две обаждания наведнъж. Всеки клиент веднъж за пратка (до 2 опита).`,
    "Какво каза клиентът – тук и в поръчката в OrderDesk (при пренасочване – бележка „Провери“).",
    "Първия път след обновяването пусни веднъж /callback_setup – добавя в ElevenLabs полетата за резултата (pk_…).",
    "/nevzeti_stop спира, /nevzeti показва списъка.",
  ];
  if (settings.paused) lines.push("⚠️ Обажданията са на пауза (/stop) – напиши /pusni.");
  return lines.join("\n");
}

/** /nevzeti_stop */
export async function stopPickup(deps) {
  const settings = await getSettings(deps.store);
  await saveSettings(deps.store, { ...settings, pickupOn: false });
  return "⏸ Обажданията за невзети пратки са спрени. /nevzeti_start ги пуска пак.";
}

/** /nevzeti: the parcels waiting now (from OrderDesk) and what happened with the ones called. */
export async function pickupStatus(deps, now = new Date()) {
  const settings = await getSettings(deps.store);
  const day = settings.pickupDay || PICKUP_DAY;
  const head = `<b>Невзети пратки</b> – ${settings.pickupOn ? `▶️ звъни (от ${day}-ия ден)` : "⏸ спряно (/nevzeti_start)"}`;
  let list = [];
  let err = "";
  if (deps.platform?.enabled) list = await deps.platform.pickupOrders(day).catch((e) => ((err = e.message), []));
  else err = "OrderDesk не е свързан";
  const recs = (await records(deps.store)).filter((r) => now - new Date(r.rec.queuedAt) < 7 * 86_400_000);
  const STATUS = { waiting: "⏳ на опашката", calling: "📞 звъни се", no_answer: "📵 не вдигна", failed: "⚠️ грешка" };
  return [
    head,
    err ? `⚠️ ${esc(err)}` : `Чакат в офис от ${day}-ия ден и не са звънени: ${list.length}`,
    ...list.slice(0, 15).map((o) => `#${esc(o.orderNo)} ${esc(first(o.name))} · ден ${o.officeDay} · ${esc(COURIER[o.courier] || o.courier)} · id ${o.id}`),
    ...(recs.length ? ["", "Последните 7 дни:"] : []),
    ...recs.slice(-15).map(({ rec }) => `#${esc(rec.order.orderNo)} ${esc(first(rec.order.name))} – ${rec.status === "done" ? OUTCOME_BG[rec.outcome] || esc(rec.outcome) : STATUS[rec.status] || esc(rec.status)}`),
    "",
    list.length ? `Пробно обаждане до теб: /nevzeti_test ${list[0].id}` : "",
  ]
    .filter((l) => l !== null)
    .join("\n")
    .trim();
}

/** /nevzeti_test <id>: the call for that parcel, to Mitko's test phone. */
export async function testPickup(deps, text = "") {
  if (!deps.config?.testPhone) return "Няма зададен тестов номер (TEST_PHONE).";
  if (!deps.platform?.enabled) return "OrderDesk не е свързан с агента.";
  const settings = await getSettings(deps.store);
  const list = await deps.platform.pickupOrders(2).catch(() => []);
  const id = Number((String(text).match(/\d+/) || [])[0]);
  const o = id ? list.find((x) => Number(x.id) === id) : list.find((x) => x.officeDay >= (settings.pickupDay || PICKUP_DAY)) || list[0];
  if (!o) return id ? `Няма чакаща пратка с id ${id}. /nevzeti показва списъка.` : "Няма пратки, които чакат в офис.";
  try {
    await deps.call({ to: deps.config.testPhone, variables: pickupVariables(o, { test: true }), script: "pickup" });
  } catch (err) {
    return `⚠️ Не успях да звънна: ${esc(String(err.message).slice(0, 300))}`;
  }
  return `📞 Елена звъни на ${esc(deps.config.testPhone)} като за пратка #${esc(o.orderNo)} (${esc(o.name)}, ${esc(officeText(o))}). Отговаряй като клиента. После ще ти пиша резултата – в OrderDesk нищо не се записва.`;
}

