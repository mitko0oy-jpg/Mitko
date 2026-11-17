// The link to the order platform: what the agent reads from it and what it writes back.
import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { syncOrders, runDueCalls, handleWebhook } from "../lib/engine.mjs";
import { platform, upsellEdit, reportBody, phoneOrderBody } from "../lib/platform.mjs";
import { submitOrder } from "../lib/inbound.mjs";
import priceList from "../agent/pricelist-bg.json" with { type: "json" };

const T0 = new Date("2026-11-12T10:00:00Z"); // 12:00 in Sofia
const min = (n) => new Date(T0.getTime() + n * 60_000);
const env = (vars) => (name) => vars[name];

test("platform client: bearer token, shops filter, mapping", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (url.includes("/orders?")) return Response.json({ orders: [{ id: 42, site: "bg", orderNo: "1735", requested: true, requestedAt: "2026-11-12T09:00:00.000Z" }] });
    if (url.endsWith("/orders/42")) return Response.json({ id: 42, stillToCall: false });
    if (url.includes("/by-phone")) return Response.json({ orders: [{ site: "bg", orderNo: "1700", createdAt: "2026-11-01T10:00:00Z", items: [{ name: "Гел", qty: 2, price: 30 }], total: 34, stage: "delivered", parcelText: "Доставена", courier: "speedy", trackingNo: "123" }] });
    if (url.endsWith("/orders/42/result")) return Response.json({ ok: true });
    return Response.json({ message: "няма такова" }, { status: 404 });
  };
  const off = platform({ env: env({}), fetchImpl });
  assert.equal(off.enabled, false);
  const p = platform({ env: env({ PLATFORM_URL: "https://p.example/", PLATFORM_TOKEN: "t0k" }), fetchImpl });
  assert.equal(p.enabled, true);

  const orders = await p.fetchNewOrders({ since: "2026-11-12T08:00:00.000Z", sites: ["bg", "max4"] });
  assert.equal(seen[0].url, "https://p.example/api/agent/orders?shops=bg%2Cmax4&since=2026-11-12T08%3A00%3A00.000Z");
  assert.equal(seen[0].init.headers.Authorization, "Bearer t0k");
  assert.equal(orders[0].platformId, 42);
  assert.equal(orders[0].requestedAt, "2026-11-12T09:00:00.000Z");

  assert.equal(await p.isStillPending({ platformId: 42 }), false);
  assert.equal(await p.isStillPending({}), true, "orders not from the platform are not checked there");

  const found = await p.searchByPhone("0888123456");
  assert.equal(found[0].orderNo, "1700");
  assert.equal(found[0].itemsText, "2 броя Гел");
  assert.equal(found[0].status, "delivered");

  await p.report({ platformId: 42 }, { outcome: "confirmed" });
  assert.equal(seen.at(-1).init.method, "POST");
  assert.deepEqual(JSON.parse(seen.at(-1).init.body), { outcome: "confirmed" });
  assert.equal(await p.report({}, {}), null, "no platform id → nothing sent");

  await assert.rejects(p.createPhoneOrder({}), /Платформа orders: няма такова/);
});

test("upsell box as a correction, prices from the price list", () => {
  const rec = { items: [{ name: "BeeVenom Care Gel 2+1 броя", qty: 1, price: 39.9 }], shipping: 4.5, upsell: { kind: "two_boxes_free" } };
  const two = upsellEdit(rec, "two_boxes");
  assert.equal(two.items.length, 2);
  assert.equal(two.items[1].qty, 2);
  assert.ok(two.items[1].price > 0);
  assert.equal(two.shipping, 0, "two boxes with the middle package → free delivery");
  const one = upsellEdit(rec, "one_box");
  assert.equal(one.items[1].qty, 1);
  assert.equal(one.shipping, 4.5);
  assert.equal(upsellEdit(rec, ""), null);
  assert.equal(upsellEdit(rec, "no"), null);
  // Unit prices: a line of 2 for 60 € is 30 € each.
  assert.equal(upsellEdit({ items: [{ name: "Гел", qty: 2, price: 60 }], shipping: 0 }, "one_box").items[0].price, 30);
});

test("report body: retries tell when, the last one says so, confirmations carry the edit", () => {
  const rec = { attempts: 1, items: [{ name: "Гел", qty: 1, price: 30 }], shipping: 4 };
  const retry = reportBody(rec, { state: "queued", attempts: 1, nextAttemptAt: "2026-11-12T11:00:00.000Z" }, null, "no_answer");
  assert.equal(retry.final, false);
  assert.equal(retry.next_at, "2026-11-12T11:00:00.000Z");
  assert.equal(retry.edit, null);
  const last = reportBody(rec, { state: "gave_up", attempts: 3 }, null, "no_answer");
  assert.equal(last.final, true);
  assert.equal(last.attempt, 3);
  const ok = reportBody(rec, { state: "done", attempts: 1 }, { summary: "Потвърди", deliveryChange: "офис Еконт Пловдив Тракия", upsell: "one_box" }, "confirmed");
  assert.equal(ok.delivery_change, "офис Еконт Пловдив Тракия");
  assert.equal(ok.edit.items.length, 2);
  assert.equal(reportBody(rec, { state: "done" }, { upsell: "" }, "confirmed").edit, null);
});

test("phone order in the platform's words", () => {
  const b = phoneOrderBody({
    name: "Иван Иванов",
    phone: "0888 123 456",
    delivery: { type: "econt_office", city: "Пловдив", place: "Тракия", price: 4.2 },
    items: [{ name: "Гел", cb: "BeeVenom Care Gel", qty: 2, sum: 59.8 }],
    note: "звънни преди",
    ref: "T-1",
  });
  assert.equal(b.shop, "bg");
  assert.equal(b.phone, "+359888123456");
  assert.deepEqual(b.delivery, { courier: "econt", type: "office", officeName: "Пловдив, Тракия" });
  assert.deepEqual(b.items, [{ name: "BeeVenom Care Gel", qty: 2, price: 29.9 }]);
  assert.equal(b.shipping, 4.2);
  assert.equal(b.note, "Поръчка по телефона (T-1). звънни преди");
  const a = phoneOrderBody({ name: "А", phone: "0888123456", delivery: { type: "speedy_address", city: "София", place: "ул. Шипка 5", price: 5 }, items: [], ref: "T-2" });
  assert.equal(a.delivery.courier, "speedy");
  assert.equal(a.address, "ул. Шипка 5");
});

/** The engine with a fake platform that records every call. */
function setup() {
  const store = memoryStore();
  const orders = [];
  const calls = [];
  const sent = [];
  let conv = 0;
  const plat = {
    enabled: true,
    async calling(rec) {
      sent.push(["calling", rec.platformId, rec.attempts]);
    },
    async report(rec, body) {
      sent.push(["report", rec.platformId, body]);
    },
  };
  const deps = {
    store,
    platform: plat,
    cb: {
      fetchNewOrders: async () => orders,
      isStillPending: async () => true,
    },
    async call(args) {
      calls.push(args);
      return { conversationId: `conv_${++conv}` };
    },
    async notify() {},
    config: { mode: "live", testPhone: "+359877000000", hours: "09:00-21:00", hoursSunday: "10:00-19:00", shopName: "BeeVenom", deliveryDays: "един до два работни дни" },
  };
  const order = (n, extra = {}) => ({
    id: 900 + n,
    platformId: 900 + n,
    site: "bg",
    siteLabel: "BeeVenom BG",
    orderNo: String(n),
    createdAt: min(1).toISOString(),
    name: "Мария Петрова",
    phone: "0888 123 456",
    items: [{ name: "BeeVenom Care Gel 2+1 броя", qty: 1, price: 39.9 }],
    total: 44.4,
    shipping: 4.5,
    deliveryText: "до офис на Еконт в Пловдив",
    ...extra,
  });
  return { deps, store, orders, calls, sent, order };
}

const postCall = (conversationId, orderKey, outcome, extra = {}) => ({
  type: "post_call_transcription",
  data: {
    conversation_id: conversationId,
    transcript: [{ role: "agent", message: "Здравейте" }],
    analysis: { data_collection_results: { outcome: { value: outcome }, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])) }, transcript_summary: "обобщение" },
    conversation_initiation_client_data: { dynamic_variables: { order_key: orderKey, test: "no" } },
  },
});

test("engine: calling and the result go to the platform, with the plasters as a correction", async () => {
  const { deps, orders, calls, sent, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(1736));
  assert.equal(await syncOrders(deps, min(2)), 1);
  await runDueCalls(deps, min(3));
  assert.equal(calls.length, 1);
  assert.deepEqual(sent[0], ["calling", 2636, 1]);

  await handleWebhook(deps, postCall("conv_1", "order/bg/1736", "confirmed", { upsell: "two_boxes" }), min(6));
  const [, id, body] = sent[1];
  assert.equal(id, 2636);
  assert.equal(body.outcome, "confirmed");
  assert.equal(body.edit.items.length, 2);
  assert.equal(body.edit.shipping, 0);
});

test("engine: no answer is reported each time, the third time as final", async () => {
  const { deps, orders, sent, order } = setup();
  await syncOrders(deps, T0);
  orders.push(order(1737));
  await syncOrders(deps, min(2));
  await runDueCalls(deps, min(3));
  await handleWebhook(deps, postCall("conv_1", "order/bg/1737", "no_conversation"), min(4));
  const first = sent.find((s) => s[0] === "report")[2];
  assert.equal(first.outcome, "no_conversation");
  assert.equal(first.final, false);
  assert.ok(first.next_at);
  await runDueCalls(deps, min(70));
  await handleWebhook(deps, postCall("conv_2", "order/bg/1737", "no_conversation"), min(71));
  await runDueCalls(deps, min(70 + 21 * 60 + 5));
  await handleWebhook(deps, postCall("conv_3", "order/bg/1737", "no_conversation"), min(70 + 21 * 60 + 6));
  const reports = sent.filter((s) => s[0] === "report").map((s) => s[2]);
  assert.equal(reports.length, 3);
  assert.equal(reports[2].final, true);
});

test("engine: an older order sent for AI confirmation is called, and can be sent again later", async () => {
  const { deps, store, orders, calls, order } = setup();
  await syncOrders(deps, T0);
  await store.setJSON("settings", { ...(await store.get("settings", { type: "json" })), modeSince: T0.toISOString() });
  const old = order(1500, { createdAt: new Date(T0.getTime() - 5 * 86_400_000).toISOString(), requested: true, requestedAt: min(1).toISOString() });
  orders.push(old);
  assert.equal(await syncOrders(deps, min(2)), 1);
  await runDueCalls(deps, min(3));
  assert.equal(calls.length, 1, "requested orders are called even if older than 48 h");
  await handleWebhook(deps, postCall("conv_1", "order/bg/1500", "callback"), min(5));
  // Sent again with a new request time → a new record.
  orders[0] = { ...old, requestedAt: min(30).toISOString() };
  assert.equal(await syncOrders(deps, min(31)), 1);
});

test("phone order goes into the platform, Telegram says its number", async () => {
  const store = memoryStore();
  const msgs = [];
  let body = null;
  const deps = {
    store,
    notify: async (t) => msgs.push(t),
    priceList,
    platform: { enabled: true, createPhoneOrder: async (b) => ((body = b), { id: 5, order_no: "T1001", waybill: null }) },
  };
  const res = await submitOrder(deps, {
    customer_name: "Иван Иванов",
    phone: "0888123456",
    delivery: "econt_office",
    city: "Пловдив",
    office_or_address: "офис Тракия",
    items: [{ product_id: "gel-2p1", quantity: 1 }],
  });
  if (res.error) assert.fail(res.error);
  assert.equal(body.items[0].qty, 1);
  assert.equal(body.shipping, 4.5);
  assert.equal(body.shop, "bg");
  assert.equal(body.delivery.courier, "econt");
  assert.match(msgs[0], /T1001/);
});
