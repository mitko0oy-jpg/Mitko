import test from "node:test";
import assert from "node:assert/strict";
import priceList from "../agent/pricelist-bg.json" with { type: "json" };
import { quote, renderPriceList, findOrders, submitOrder } from "../lib/inbound.mjs";
import { memoryStore } from "../lib/store.mjs";
import { handleWebhook, purgeOld } from "../lib/engine.mjs";

test("totals come from the price list, not from the AI", () => {
  const q = quote(priceList, { items: [{ product_id: "gel-2p1", quantity: 1 }, { product_id: "spray", quantity: 2 }], delivery: "speedy_office" });
  assert.deepEqual(q.errors, []);
  assert.equal(q.total, 22.9 + 25.8 + 4.5);
  assert.equal(q.totalText, "53 евро и 20 цента");
  assert.equal(quote(priceList, { items: [{ product_id: "gel-1", quantity: 1 }], delivery: "speedy_address" }).totalText, "21 евро и 80 цента");
  const bad = quote(priceList, { items: [{ product_id: "xxx", quantity: 1 }], delivery: "post" });
  assert.equal(bad.errors.length, 2);
  assert.match(renderPriceList(priceList), /пакет 2 плюс 1, три броя: 22 евро и 90 цента \[код gel-2p1\]/);
  assert.match(renderPriceList(priceList), /пакет 3 плюс 2.*подарък: 12 пластира/);
  assert.match(renderPriceList(priceList), /Доставка до адрес със Спиди: 5 евро и 90 цента/);
});

test("find orders by phone", async () => {
  const cb = {
    async searchByPhone(p) {
      assert.equal(p, "+359888123456");
      return [{ orderNo: 1712, dateText: "12 ноември", itemsText: "BeeVenom Care Gel", total: 20.4, status: "shipped", courier: "Спиди", trackingNo: "123" }];
    },
  };
  const r = await findOrders(cb, "0888 123 456");
  assert.equal(r.found, 1);
  assert.equal(r.orders[0].status, "изпратена е");
  assert.equal(r.orders[0].total, "20 евро и 40 цента");
  assert.equal((await findOrders({ async searchByPhone() { return []; } }, "0888123456")).found, 0);
  assert.equal((await findOrders(cb, "123")).found, 0);
});

test("submit order: validation, saving and Telegram message", async () => {
  const store = memoryStore();
  const msgs = [];
  const deps = { store, notify: async (t) => msgs.push(t), priceList };
  const bad = await submitOrder(deps, { customer_name: "Иван", items: [], delivery: "econt_office" });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /име и фамилия/);
  assert.equal(msgs.length, 0);

  const ok = await submitOrder(deps, {
    customer_name: "Иван Петров",
    caller_phone: "+359888123456",
    items: [{ product_id: "gel-3p2", quantity: 1 }],
    delivery: "econt_office",
    city: "Пловдив",
    office_or_address: "офис Тракия",
  }, new Date("2026-11-13T09:00:00Z"));
  assert.equal(ok.ok, true);
  assert.equal(ok.total, "34 евро и 40 цента");
  assert.match(ok.reference, /^Т1113-[0-9A-F]{4}$/);
  const saved = (await store.list({ prefix: "phone-orders/2026-11-13/" })).blobs;
  assert.equal(saved.length, 1);
  assert.match(msgs[0], /Нова поръчка по телефона/);
  assert.match(msgs[0], /Пчелна отрова Пакет 3\+2 бр\./);
  assert.match(msgs[0], /\+359888123456/);
  assert.match(msgs[0], /34 евро и 40 цента/);
  assert.equal(await purgeOld(store, new Date("2026-11-20T00:00:00Z")), 0);
  assert.equal(await purgeOld(store, new Date("2026-12-14T00:00:00Z")), 1);
});

test("inbound post-call: notify only when someone must act", async () => {
  const msgs = [];
  const deps = { store: memoryStore(), notify: async (t) => msgs.push(t), config: { inboundAgentId: "agent_in" } };
  const payload = (dc) => ({
    type: "post_call_transcription",
    data: { agent_id: "agent_in", conversation_id: "c9", transcript: [], analysis: { data_collection_results: dc, transcript_summary: "x" }, conversation_initiation_client_data: { dynamic_variables: { system__caller_id: "+359888000111" } } },
  });
  assert.deepEqual(await handleWebhook(deps, payload({ intent: { value: "order_placed" } })), { inbound: true, notified: false });
  assert.deepEqual(await handleWebhook(deps, payload({ intent: { value: "order_status" } })), { inbound: true, notified: false });
  const r = await handleWebhook(deps, payload({ intent: { value: "complaint" }, needs_human: { value: true } }));
  assert.equal(r.notified, true);
  assert.match(msgs[0], /Обади се – ⚠️ Оплакване/);
  assert.match(msgs[0], /\+359888000111/);
});
