import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore, getSettings } from "../lib/store.mjs";
import { handleWebhook } from "../lib/engine.mjs";
import { initiationData } from "../lib/callback.mjs";
import { officeText, pickupVariables, runPickupQueue, startPickup, stopPickup, pickupStatus, testPickup, MAX_TRIES, RETRY_AFTER_MIN } from "../lib/pickup-calls.mjs";
import { runFeedbackQueue, prepareFeedback, startFeedback } from "../lib/feedback-queue.mjs";
import { PICKUP_SCRIPT } from "../lib/scripts.generated.mjs";
import { PICKUP_FIELDS } from "../lib/setup-callback.mjs";
import { handleTelegram } from "../lib/commands.mjs";

// Monday 23 Nov 2026, 11:00 Sofia.
const T0 = new Date("2026-11-23T09:00:00Z");
const min = (n) => new Date(T0.getTime() + n * 60_000);

const PARCELS = [
  { id: 501, orderNo: "1701", shop: "BeeVenom BG", name: "Пенка Петрова", phone: "0888 500 001", courier: "econt", trackingNo: "1051605000001", office: "Шумен Център", total: 27.4, currency: "EUR", officeDay: 6, since: "1795400000", canRedirect: true, items: [{ name: "BeeVenom Care Gel 2+1 броя", qty: 1 }] },
  { id: 502, orderNo: "1702", shop: "BeeVenom BG", name: "Стоян Иванов", phone: "0888 500 002", courier: "speedy", trackingNo: "62000500002", office: "До офис speedy[77]: ВАРНА - ЧАЙКА ул. Тест 1", total: 19.9, currency: "EUR", officeDay: 7, since: "1795300000", canRedirect: false, items: [{ name: "BeeVenom Care Gel", qty: 2 }] },
];

function deps(store = memoryStore(), parcels = PARCELS) {
  const calls = [];
  const messages = [];
  const reports = [];
  return {
    store,
    calls,
    messages,
    reports,
    config: { sites: ["bg"], testPhone: "+359877000000" },
    platform: {
      enabled: true,
      pickupOrders: async () => parcels.filter((p) => !reports.some((r) => r.id === p.id && r.body.final)),
      pickupResult: async (id, body) => {
        reports.push({ id, body });
        return { ok: true };
      },
    },
    mw: { findOrder: async () => null },
    cb: { getOrder: async () => null },
    call: async (c) => {
      calls.push(c);
      return { conversationId: null, route: "zadarma" };
    },
    notify: async (t) => messages.push(t),
  };
}

const postCall = (vars, fields, conv = "conv_pk", said = "Ще мина утре.") => ({
  type: "post_call_transcription",
  data: {
    conversation_id: conv,
    conversation_initiation_client_data: { dynamic_variables: vars },
    analysis: { data_collection_results: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }])) },
    transcript: said ? [{ role: "user", message: said }] : [],
  },
});

test("what Елена says: the office without the street, the day in words, the amount, whether it can be redirected", () => {
  assert.equal(officeText(PARCELS[0]), "в офис на Еконт „Шумен Център“");
  assert.equal(officeText(PARCELS[1]), "в офис на Спиди „ВАРНА - ЧАЙКА“");
  const v = pickupVariables(PARCELS[0]);
  assert.deepEqual([v.campaign, v.order_key, v.persona, v.customer_name, v.days_text, v.amount_text, v.courier_name], ["pickup", "pk-501-1795400000", "elena", "госпожо Петрова", "вече шести ден", "27 евро и 40 цента", "Еконт"]);
  assert.match(v.redirect_text, /^да/);
  assert.match(pickupVariables(PARCELS[1]).redirect_text, /^не/);
  assert.equal(pickupVariables(PARCELS[0], { test: true }).order_key, "test");
  // Every {{variable}} of the script has a value.
  for (const [, name] of `${PICKUP_SCRIPT.prompt} ${PICKUP_SCRIPT.firstMessage}`.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) assert.ok(name in v, name);
  // The script never threatens and never says „пластири“.
  assert.doesNotMatch(PICKUP_SCRIPT.prompt.replace(/^.*Думата „пластири“.*$/m, ""), /пластир/i);
  assert.match(PICKUP_SCRIPT.prompt, /Никога не казвай, че клиентът ще плати нещо/);
  // ElevenLabs collects the result with "pk_".
  assert.ok(PICKUP_FIELDS.pk_outcome && PICKUP_FIELDS.pk_new_place && PICKUP_FIELDS.pk_when);
});

test("off until /nevzeti_start; then the parcels from OrderDesk are called one by one with the pickup script", async () => {
  const d = deps();
  assert.equal((await runPickupQueue(d, T0)).pickup, "off");
  assert.match(await startPickup(d, "", T0), /от 6-ия ден/);
  assert.equal((await getSettings(d.store)).pickupDay, 6);
  const r = await runPickupQueue(d, T0);
  assert.equal(r.refreshed.added, 2);
  assert.match(r.pickup, /calling #1701 \(try 1\)/);
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0].script, "pickup");
  assert.equal(d.calls[0].to, "0888 500 001");
  // One call at a time.
  assert.equal((await runPickupQueue(d, min(1))).pickup, "call in progress");

  // The agent connects: the pickup script, no feedback rules and no order lessons added.
  await d.store.setJSON("pending/359888500001", { variables: d.calls[0].variables, script: "pickup", at: T0.toISOString() });
  const init = await initiationData({ store: d.store, body: { caller_id: "+359888500001", conversation_id: "conv_pk" }, outboundScript: async () => null, feedbackRules: [{ text: "ПРАВИЛО ЗА ОБРАТНА ВРЪЗКА" }], lessons: [{ text: "УРОК ЗА ПОРЪЧКИ" }], now: min(0.5) });
  const prompt = init.response.conversation_config_override.agent.prompt.prompt;
  assert.match(prompt, /невзет|чака в офиса на куриера/);
  assert.doesNotMatch(prompt, /ПРАВИЛО ЗА ОБРАТНА ВРЪЗКА|УРОК ЗА ПОРЪЧКИ/);
  assert.match(init.response.conversation_config_override.agent.first_message, /Пратката Ви чака \{\{office_text\}\} \{\{days_text\}\}/);
  assert.equal(init.response.dynamic_variables.persona, "elena");

  // She wants another office: OrderDesk gets it, Mitko gets a message, and the next parcel is called.
  await handleWebhook(d, postCall(init.response.dynamic_variables, { outcome: "confirmed", pk_outcome: "redirect", pk_new_place: "Еконт Шумен Тракия", pk_summary: "Иска офис по-близо." }), min(3));
  const rec = await d.store.get("pk-501-1795400000", { type: "json" });
  assert.deepEqual([rec.status, rec.outcome], ["done", "redirect"]);
  assert.deepEqual(d.reports.at(-1), { id: 501, body: { since: "1795400000", attempt: 1, outcome: "redirect", when: "", new_place: "Еконт Шумен Тракия", reason: "", summary: "Иска офис по-близо.", final: true } });
  assert.match(d.messages.at(-1), /Невзета пратка<\/b> #1701 госпожо Петрова – 🔀 иска друг офис или адрес[\s\S]*Къде: „Еконт Шумен Тракия“ → пренасочи я от OrderDesk/);
  assert.equal(d.calls.length, 2, "the next parcel right after the result");
  assert.equal(d.calls[1].variables.order_key, "pk-502-1795300000");
  // Not refreshed into the queue again (called for this stay).
  await runPickupQueue(d, min(40));
  assert.ok(!(await d.store.list({ prefix: "pk-" })).blobs.some((b) => b.key.startsWith("pk-501") && b.key !== "pk-501-1795400000"));
});

test("not answered: once more after 90 minutes, then given up – OrderDesk and Mitko know", async () => {
  const d = deps(memoryStore(), [PARCELS[1]]);
  await startPickup(d, "", T0);
  await runPickupQueue(d, T0);
  assert.equal(d.calls.length, 1);
  // Nobody answered within the ring time.
  await runPickupQueue(d, min(3));
  let rec = await d.store.get("pk-502-1795300000", { type: "json" });
  assert.equal(rec.status, "waiting");
  assert.deepEqual(d.reports.at(-1).body, { since: "1795300000", attempt: 1, outcome: "no_answer", final: false });
  assert.equal((await runPickupQueue(d, min(30))).pickup, "nothing to call");
  assert.match((await runPickupQueue(d, min(3 + RETRY_AFTER_MIN + 1))).pickup, /calling #1702 \(try 2\)/);
  await runPickupQueue(d, min(3 + RETRY_AFTER_MIN + 5));
  rec = await d.store.get("pk-502-1795300000", { type: "json" });
  assert.equal(MAX_TRIES, 2);
  assert.equal(rec.status, "no_answer");
  assert.deepEqual(d.reports.at(-1).body, { since: "1795300000", attempt: 2, outcome: "no_answer", final: true });
  assert.match(d.messages.at(-1), /#1702 Стоян – 📵 не вдигна и на втория опит/);
});

test("one line: no pickup call while a feedback call runs, and no feedback call while a pickup call runs; outside hours and /stop", async () => {
  const d = deps();
  await d.store.setJSON("fb-1649", { label: "1649", status: "calling", startedAt: T0.toISOString(), order: { phone: "0888 123 456", name: "Мария" }, queuedAt: T0.toISOString() });
  await startPickup(d, "", T0);
  assert.equal((await runPickupQueue(d, min(1))).pickup, "feedback call in progress");
  assert.equal(d.calls.length, 0);
  await d.store.delete("fb-1649");
  await runPickupQueue(d, min(2));
  assert.equal(d.calls.length, 1);

  // A feedback queue waiting at the same time does not start over the pickup call.
  const fbDeps = { ...d, mw: { findOrder: async () => ({ status: "completed", statusText: "доставена е", externalId: "cb-1" }) }, cb: { getOrder: async () => ({ customerName: "Иван Георгиев", created: Date.parse("2026-07-20T09:00:00Z") / 1000, shippingAddress: { phone: "0899 111 222", city: "Русе", address: "ул. Роза 5" }, items: [{ name: "BeeVenom Care Gel", quantity: 1 }] }) } };
  await prepareFeedback(fbDeps, "1641", min(2));
  await startFeedback(fbDeps, min(2));
  await d.store.delete("pending/359888500001");
  assert.equal((await runFeedbackQueue(fbDeps, min(2.5))).feedback, "pickup call in progress");

  // Sunday evening: no calls; /stop pauses; /nevzeti_stop switches off.
  const e = deps();
  await startPickup(e, "5", T0);
  assert.equal((await getSettings(e.store)).pickupDay, 5);
  assert.equal((await runPickupQueue(e, new Date("2026-11-22T17:30:00Z"))).pickup, "outside hours");
  await stopPickup(e);
  assert.equal((await runPickupQueue(e, T0)).pickup, "off");
});

test("Telegram: /nevzeti lists the waiting parcels; /nevzeti_test calls Mitko and writes nothing in OrderDesk", async () => {
  const d = deps();
  assert.match(await pickupStatus(d, T0), /⏸ спряно[\s\S]*Чакат в офис от 6-ия ден и не са звънени: 2[\s\S]*#1701 Пенка · ден 6 · Еконт · id 501/);
  assert.match(await testPickup(d, "502"), /Елена звъни на \+359877000000 като за пратка #1702/);
  assert.equal(d.calls[0].to, "+359877000000");
  assert.equal(d.calls[0].variables.test, "yes");
  await handleWebhook(d, postCall(d.calls[0].variables, { pk_outcome: "will_pickup", pk_when: "утре" }, "conv_test"), min(2));
  assert.equal(d.reports.length, 0);
  assert.match(d.messages.at(-1), /Невзета пратка<\/b> \(тест\) #1702 .* – ✅ ще я вземе\nКога: „утре“/);
  // No pk_ fields although the customer spoke: „unknown“, a person looks.
  const u = await testPickup(d, "501");
  await handleWebhook(d, postCall(d.calls.at(-1).variables, { outcome: "confirmed" }, "conv_test2", "Не знам."), min(4));
  assert.match(d.messages.at(-1), /❔ говорихме, но резултатът не дойде/);
  assert.match(u, /#1701/);
  // From Telegram (Mitko's chat only): start, the list, stop; the help knows them.
  const upd = (text) => ({ message: { chat: { id: 1 }, text } });
  assert.match((await handleTelegram(d, upd("/nevzeti_start"), { fixedChatId: "1" })).reply, /Невзети пратки/);
  assert.equal((await getSettings(d.store)).pickupOn, true);
  assert.match((await handleTelegram(d, upd("/nevzeti"), { fixedChatId: "1" })).reply, /▶️ звъни \(от 6-ия ден\)/);
  assert.match((await handleTelegram(d, upd("/nevzeti_stop"), { fixedChatId: "1" })).reply, /спрени/);
  assert.match((await handleTelegram(d, upd("/help"), { fixedChatId: "1" })).reply || "", /nevzeti_start/);
});
