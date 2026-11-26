import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { syncOrders, runDueCalls, handleWebhook, purgeOld } from "../lib/engine.mjs";

// 2026-11-12 12:00 Sofia (winter time, UTC+2)
const T0 = new Date("2026-11-12T10:00:00Z");
const min = (n) => new Date(T0.getTime() + n * 60_000);

function setup({ mode = "live", pending = () => true } = {}) {
  const store = memoryStore();
  const orders = [];
  const calls = [];
  const messages = [];
  let conv = 0;
  const deps = {
    store,
    cb: {
      async fetchNewOrders() {
        return orders;
      },
      async isStillPending(rec) {
        return pending(rec);
      },
    },
    async call(args) {
      calls.push(args);
      return { conversationId: `conv_${++conv}` };
    },
    async notify(text) {
      messages.push(text);
    },
    config: { mode, testPhone: "+359877000000", hours: "09:00-21:00", hoursSunday: "10:00-19:00", shopName: "BeeVenom", deliveryDays: "един до два работни дни" },
  };
  const order = (n, extra = {}) => ({
    site: "bg",
    siteLabel: "BeeVenom BG",
    orderNo: n,
    createdAt: min(1).toISOString(),
    name: "Мария Петрова",
    phone: "0888 123 456",
    items: [{ name: "BeeVenom Care Gel 2+1 броя", qty: 1, price: 19.9 }],
    total: 24.4,
    deliveryText: "до офис на Еконт в Пловдив",
    ...extra,
  });
  return { deps, store, orders, calls, messages, order };
}

const postCall = (conversationId, orderKey, outcome, extra = {}) => ({
  type: "post_call_transcription",
  data: {
    conversation_id: conversationId,
    transcript: [{ role: "agent", message: "Здравейте" }],
    analysis: { data_collection_results: { outcome: { value: outcome }, ...extra }, transcript_summary: "обобщение" },
    conversation_initiation_client_data: { dynamic_variables: { order_key: orderKey, test: "no" } },
  },
});

test("first run only records the start time; older orders are never called", async () => {
  const { deps, orders, calls, order } = setup();
  orders.push(order(1, { createdAt: min(-60).toISOString() }));
  assert.equal(await syncOrders(deps, T0), 0);
  assert.equal(await syncOrders(deps, min(2)), 0); // order 1 is older than startedAt
  await runDueCalls(deps, min(2));
  assert.equal(calls.length, 0);
});

test("new order → call → confirmed → moved to done and Mitko notified", async () => {
  const { deps, store, orders, calls, messages, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(1703));
  assert.equal(await syncOrders(deps, min(2)), 1);
  assert.equal(await syncOrders(deps, min(3)), 0, "same order is not added twice");

  const rep = await runDueCalls(deps, min(3));
  assert.equal(rep.started, 1);
  assert.equal(calls[0].to, "+359888123456");
  assert.equal(calls[0].variables.customer_name, "госпожа Петрова");
  assert.equal(calls[0].variables.order_total, "24 евро и 40 цента");
  assert.equal(calls[0].variables.order_items, "BeeVenom Care Gel 2 плюс 1 броя");

  // While waiting for the result, the order is not called again.
  await runDueCalls(deps, min(5));
  assert.equal(calls.length, 1);

  const res = await handleWebhook(deps, postCall("conv_1", "order/bg/1703", "confirmed"), min(6));
  assert.equal(res.state, "done");
  assert.equal(await store.get("order/bg/1703"), null);
  assert.equal((await store.get("done/bg/1703", { type: "json" })).state, "done");
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Потвърдена/);

  // A duplicate webhook is ignored.
  const dup = await handleWebhook(deps, postCall("conv_1", "order/bg/1703", "confirmed"), min(7));
  assert.ok(dup.ignored);
  assert.equal(messages.length, 1);
});

test("no answer → retries after 1h and 3h, then tells Mitko", async () => {
  const { deps, orders, calls, messages, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(5));
  await syncOrders(deps, min(1));
  await runDueCalls(deps, min(1));
  await handleWebhook(deps, { type: "call_initiation_failure", data: { conversation_id: "conv_1", failure_reason: "no-answer" } }, min(2));
  await runDueCalls(deps, min(30));
  assert.equal(calls.length, 1, "not before an hour");
  await runDueCalls(deps, min(63));
  assert.equal(calls.length, 2);
  await handleWebhook(deps, postCall("conv_2", "order/bg/5", "voicemail"), min(64));
  await runDueCalls(deps, min(64 + 181));
  assert.equal(calls.length, 2, "third try is the next day");
  await runDueCalls(deps, min(64 + 21 * 60 + 1));
  assert.equal(calls.length, 3);
  assert.equal(messages.length, 0);
  await handleWebhook(deps, { type: "call_initiation_failure", data: { conversation_id: "conv_3", failure_reason: "busy" } }, min(64 + 21 * 60 + 2));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Не вдига/);
});

test("outside calling hours, paused, test mode and handled orders", async () => {
  const { deps, store, orders, calls, order } = setup({ mode: "test" });
  await syncOrders(deps, T0);
  orders.push(order(7));
  await syncOrders(deps, min(1));

  const night = new Date("2026-11-12T19:30:00Z"); // 21:30 Sofia
  const sunday = setup();
  await syncOrders(sunday.deps, T0);
  assert.equal((await runDueCalls(sunday.deps, new Date("2026-11-15T17:30:00Z"))).reason, "outside hours", "Sunday 19:30");
  assert.equal((await runDueCalls(deps, night)).reason, "outside hours");

  await store.setJSON("meta/settings", { ...(await store.get("meta/settings", { type: "json" })), paused: true });
  assert.equal((await runDueCalls(deps, min(2))).reason, "paused");
  await store.setJSON("meta/settings", { ...(await store.get("meta/settings", { type: "json" })), paused: false });

  await runDueCalls(deps, min(2));
  assert.equal(calls[0].to, "+359877000000", "test mode calls Mitko, not the customer");
  assert.equal(calls[0].variables.test, "yes");

  const h = setup({ pending: () => false });
  await syncOrders(h.deps, T0);
  h.orders.push(h.order(8));
  await syncOrders(h.deps, min(1));
  const rep = await runDueCalls(h.deps, min(1));
  assert.equal(rep.skipped, 1);
  assert.equal(h.calls.length, 0);
});

test("bad phone and change request go to Mitko", async () => {
  const { deps, orders, calls, messages, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(9, { phone: "12345" }), order(10));
  await syncOrders(deps, min(1));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Невалиден телефон/);
  await runDueCalls(deps, min(1));
  assert.equal(calls.length, 1);
  await handleWebhook(deps, postCall("conv_1", "order/bg/10", "change_requested", { delivery_change: { value: "Еконт, София, офис Люлин" } }), min(3));
  assert.match(messages[1], /Иска промяна/);
  assert.match(messages[1], /офис Люлин/);
});

test("stale call without a webhook is retried", async () => {
  const { deps, orders, calls, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(11));
  await syncOrders(deps, min(1));
  await runDueCalls(deps, min(1));
  const rep = await runDueCalls(deps, min(40));
  assert.equal(rep.stale, 1);
  await runDueCalls(deps, min(40 + 61));
  assert.equal(calls.length, 2);
});

test("purge removes old finished orders", async () => {
  const { deps, store, orders, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(12));
  await syncOrders(deps, min(1));
  await runDueCalls(deps, min(1));
  await handleWebhook(deps, postCall("conv_1", "order/bg/12", "canceled"), min(2));
  assert.equal(await purgeOld(store, min(60)), 0);
  assert.equal(await purgeOld(store, new Date(T0.getTime() + 15 * 86_400_000)), 1);
  assert.equal(await store.get("done/bg/12"), null);
});

test("orders older than 48 hours are skipped, and nothing is called before setup", async () => {
  const { deps, orders, calls, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(20));
  await syncOrders(deps, min(1));
  deps.config.ready = false;
  assert.equal((await runDueCalls(deps, min(2))).reason, "ElevenLabs not configured yet");
  deps.config.ready = true;
  const rep = await runDueCalls(deps, min(49 * 60));
  assert.equal(rep.skipped, 1);
  assert.equal(calls.length, 0);
});

test("only orders that came after /rezhim are called", async () => {
  const { deps, store, orders, calls, order } = setup({ mode: "off" });
  await syncOrders(deps, T0);
  orders.push(order(30, { createdAt: min(1).toISOString() }));
  await syncOrders(deps, min(2));
  assert.equal((await runDueCalls(deps, min(3))).reason, "off");
  const st = await store.get("meta/settings", { type: "json" });
  await store.setJSON("meta/settings", { ...st, mode: "test", modeSince: min(10).toISOString() });
  orders.push(order(31, { createdAt: min(12).toISOString() }));
  await syncOrders(deps, min(13));
  const rep = await runDueCalls(deps, min(14));
  assert.equal(rep.skipped, 1, "order 30 came before the switch");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].variables.order_number, "31");
  assert.equal(calls[0].to, "+359877000000");
});

test("a call the line answered and dropped before anyone could pick up is tried again in minutes", async () => {
  const { deps, store, orders, calls, messages, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(1801));
  await syncOrders(deps, min(2));
  await runDueCalls(deps, min(3));
  const key = "order/bg/1801";
  const short = (id) => ({ ...postCall(id, key, "no_conversation"), data: { ...postCall(id, key, "no_conversation").data, metadata: { call_duration_secs: 4 } } });

  deps.ringSecs = async () => 2.5; // "answered" after 2.5 s
  const r = await handleWebhook(deps, short("conv_1"), min(4));
  assert.equal(r.lineFault, true);
  let rec = await store.get(key, { type: "json" });
  assert.equal(rec.state, "queued");
  assert.equal(rec.attempts, 0, "a line fault is not an attempt");
  assert.equal(rec.lineFaults, 1);
  assert.equal(rec.nextAttemptAt, min(7).toISOString());
  assert.equal(messages.length, 0);

  await runDueCalls(deps, min(7));
  assert.equal(calls.length, 2);
  deps.ringSecs = async () => 15; // rang 15 s, then the customer hung up silently: a normal retry
  await handleWebhook(deps, short("conv_2"), min(8));
  rec = await store.get(key, { type: "json" });
  assert.equal(rec.attempts, 1);
  assert.equal(rec.lineFaults, 1);
  assert.equal(rec.nextAttemptAt, min(68).toISOString());
});

test("Zadarma's 'only possible within the country' recording counts as a line fault", async () => {
  const { deps, store, orders, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(1802));
  await syncOrders(deps, min(2));
  await runDueCalls(deps, min(3));
  const key = "order/bg/1802";
  const p = postCall("conv_1", key, "no_conversation");
  p.data.metadata = { call_duration_secs: 4 };
  p.data.transcript = [{ role: "agent", message: "Здравейте" }, { role: "user", message: "These calls are only possible within the country." }];
  deps.ringSecs = async () => 2.8;
  const r = await handleWebhook(deps, p, min(4));
  assert.equal(r.lineFault, true);
  assert.equal((await store.get(key, { type: "json" })).lineFaults, 1);
});

test("CALLS_PAUSED in the environment stops outgoing calls", async () => {
  const { deps, orders, calls, order } = setup();
  deps.config.pausedByEnv = true;
  await syncOrders(deps, T0);
  orders.push(order(1803));
  await syncOrders(deps, min(2));
  const rep = await runDueCalls(deps, min(3));
  assert.equal(rep.reason, "paused");
  assert.equal(calls.length, 0);
});

test("„📞 Обади се“ from OrderDesk calls the customer even with the order calls off, and first", async () => {
  const { deps, store, orders, calls, order } = setup({ mode: "off" });
  await syncOrders(deps, T0);
  // An old order (before /rezhim) Mitko asks for by hand, and a new order nobody asked for.
  orders.push(order(40, { createdAt: min(-300).toISOString(), requestedAt: min(5).toISOString() }));
  orders.push(order(41, { createdAt: min(4).toISOString() }));
  const st = await store.get("meta/settings", { type: "json" });
  await store.setJSON("meta/settings", { ...st, modeSince: min(3).toISOString() });
  assert.equal(await syncOrders(deps, min(6)), 2);
  assert.equal(await syncOrders(deps, min(7)), 0, "the same press is not added twice");

  const rep = await runDueCalls(deps, min(7));
  assert.equal(rep.started, 1);
  assert.equal(calls[0].variables.order_number, "40");
  assert.equal(calls[0].to, "+359888123456");
  assert.equal(calls[0].variables.test, "no");
  assert.equal(calls[0].variables.persona, "aleksandra", "a manual call is Александра's");
  assert.equal(calls[0].variables.shop_site, "beevenombg.eu", "what she says when asked where the number is from");
  // Order 41 waits: the order calls are off and nobody pressed the button for it.
  assert.equal((await store.get("order/bg/41", { type: "json" })).state, "queued");
  assert.equal((await runDueCalls(deps, min(8))).reason, "off");
  assert.equal(calls.length, 1);
});

test("a manual request in test mode still goes to the customer; /stop and the hours still hold", async () => {
  const { deps, store, orders, calls, order } = setup({ mode: "test" });
  await syncOrders(deps, T0);
  orders.push(order(50, { requestedAt: min(2).toISOString() }));
  await syncOrders(deps, min(3));
  await store.setJSON("meta/settings", { ...(await store.get("meta/settings", { type: "json" })), paused: true });
  assert.equal((await runDueCalls(deps, min(4))).reason, "paused");
  await store.setJSON("meta/settings", { ...(await store.get("meta/settings", { type: "json" })), paused: false });
  assert.equal((await runDueCalls(deps, new Date("2026-11-12T19:30:00Z"))).reason, "outside hours");
  assert.equal(calls.length, 0);
  await runDueCalls(deps, min(5));
  assert.equal(calls[0].to, "+359888123456");
  assert.equal(calls[0].variables.test, "no");
});

test("pressing the button for an order already in the queue moves it to the front; a new press calls again", async () => {
  const { deps, store, orders, calls, order } = setup({ mode: "live" });
  await syncOrders(deps, T0);
  orders.push(order(60, { createdAt: min(1).toISOString() }));
  orders.push(order(61, { createdAt: min(2).toISOString() }));
  await syncOrders(deps, min(3));
  // Order 61 is asked for by hand while both wait.
  orders[1] = { ...orders[1], requestedAt: min(4).toISOString() };
  assert.equal(await syncOrders(deps, min(5)), 1);
  const rec = await store.get("order/bg/61", { type: "json" });
  assert.equal(rec.manual, true);
  await runDueCalls(deps, min(5));
  assert.equal(calls[0].variables.order_number, "61", "the requested order goes first");

  // Later the call is over (not answered 3 times → finished) and Mitko presses again.
  const done = await store.get("order/bg/61", { type: "json" });
  await store.setJSON("done/bg/61", { ...done, state: "gave_up" });
  await store.delete("order/bg/61");
  orders[1] = { ...orders[1], requestedAt: min(200).toISOString() };
  assert.equal(await syncOrders(deps, min(201)), 1);
  assert.equal((await store.get("order/bg/61", { type: "json" })).state, "queued");
});

test("orderCallInProgress: a ringing or talking order call keeps the line busy", async () => {
  const { orderCallInProgress } = await import("../lib/engine.mjs");
  const { store } = setup();
  assert.equal(await orderCallInProgress(store, min(0)), false);
  await store.setJSON("order/bg/70", { state: "calling", callingSince: min(0).toISOString(), route: "elevenlabs" });
  assert.equal(await orderCallInProgress(store, min(3)), true);
  assert.equal(await orderCallInProgress(store, min(40)), false, "stale after half an hour");
  await store.setJSON("order/bg/70", { state: "calling", callingSince: min(0).toISOString(), route: "zadarma", answeredAt: null });
  assert.equal(await orderCallInProgress(store, min(2)), true);
  assert.equal(await orderCallInProgress(store, min(8)), false, "a Zadarma callback nobody answered is over");
});
