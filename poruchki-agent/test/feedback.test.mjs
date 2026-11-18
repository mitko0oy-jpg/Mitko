import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { handleWebhook } from "../lib/engine.mjs";
import { gelTubes, addressBG, feedbackVariables } from "../lib/feedback.mjs";

const NOW = new Date("2026-11-18T13:00:00Z");

test("gelTubes counts the gel in each package and skips gifts", () => {
  assert.equal(gelTubes([{ name: "BeeVenom Care Gel", q: 1 }]), 1);
  assert.equal(gelTubes([{ name: "BeeVenom Care Gel 2+1 броя ", q: 1 }, { name: "Подарък 1 Тибетски пластири 8 бр.", q: 1 }]), 3);
  assert.equal(gelTubes([{ name: "Пчелна отрова Пакет 3+2 бр.", q: 1 }, { name: "Кутия Билкови пластири 12бр.", q: 1 }]), 5);
});

test("addressBG uses the vocative for women and the first name when unsure", () => {
  assert.equal(addressBG("Мария Петрова"), "госпожо Петрова");
  assert.equal(addressBG("Иван Георгиев"), "господин Георгиев");
  assert.equal(addressBG("милка"), "Милка");
  assert.equal(addressBG("Petko Petkov"), "господин Петков");
  assert.equal(addressBG("Nikolinka Shtereva"), "госпожо Щерева");
});

test("feedbackVariables: 2+1 buyers get the 3-pack first, 3+2 buyers the 5-pack", () => {
  const base = { label: "1000", name: "Мария Иванова", city: "Ловеч", deliveredAt: "2026-11-04T10:00:00Z", address: "До офис speedy[1]: ЛОВЕЧ - ЦЕНТЪР ул. Търговска No 1" };
  const a = feedbackVariables({ ...base, items: [{ name: "BeeVenom Care Gel 2+1 броя", q: 1 }] }, NOW);
  assert.equal(a.main_pack, "3");
  assert.equal(a.main_offer, "пакет от три гела за 15 евро и 90 цента, и подарък 8 билкови пластира");
  assert.equal(a.main_total, "20 евро и 40 цента");
  assert.equal(a.alt_total, "24 евро и 40 цента");
  assert.equal(a.delivered_ago, "преди около две седмици");
  assert.equal(a.delivery_text, "до офис на Спиди „Ловеч – Център“");
  assert.equal(a.order_key, "fb-1000");
  const b = feedbackVariables({ ...base, address: "ул. Роза 5", items: [{ name: "Пчелна отрова Пакет 3+2 бр.", q: 1 }] }, NOW);
  assert.equal(b.main_pack, "5");
  assert.equal(b.main_total, "24 евро и 40 цента");
  assert.equal(b.delivery_text, "до адреса Ви в Ловеч");
});

function payload(vars, fields) {
  return {
    type: "post_call_transcription",
    data: {
      conversation_id: "conv_fb1",
      agent_id: "agent_fb",
      conversation_initiation_client_data: { dynamic_variables: vars },
      analysis: { data_collection_results: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }])), evaluation_criteria_results: {} },
      transcript: [{ role: "agent", message: "Здравейте!" }, { role: "user", message: "Да, доволна съм." }],
    },
  };
}

test("a feedback call result is saved and sent to Mitko with the new order", async () => {
  const store = memoryStore();
  const messages = [];
  const deps = { store, notify: async (t) => messages.push(t), config: {} };
  const vars = feedbackVariables({ label: "1000", name: "Мария Иванова", city: "Ловеч", deliveredAt: "2026-11-04T10:00:00Z", items: [{ name: "BeeVenom Care Gel 2+1 броя", q: 1 }] }, NOW);
  const r = await handleWebhook(deps, payload(vars, { outcome: "reorder", uses_product: "yes", satisfaction: "5", reorder_pack: "5", do_not_call: false, summary: "Доволна е, поръча пет." }), NOW);
  assert.equal(r.feedback, "feedback/fb-1000");
  assert.equal((await store.get("feedback/fb-1000", { type: "json" })).reorderPack, "5");
  assert.match(messages[0], /ПОРЪЧА ОТНОВО/);
  assert.match(messages[0], /пакет от пет гела.*24 евро и 40 цента/);
  assert.match(messages[0], /⭐ 5\/5/);
});

test("a test feedback call is reported but not saved", async () => {
  const store = memoryStore();
  const messages = [];
  const deps = { store, notify: async (t) => messages.push(t), config: {} };
  await handleWebhook(deps, payload({ campaign: "feedback", order_key: "fb-test", test: "yes", order_number: "1000" }, { outcome: "later", callback_when: "след пенсията" }), NOW);
  assert.equal((await store.list({ prefix: "feedback/" })).blobs.length, 0);
  assert.match(messages[0], /🧪 ТЕСТ/);
  assert.match(messages[0], /Да звъннем:<\/b> след пенсията/);
});

test("a 'reorder' without a confirmed pack is flagged for checking, not sent as an order", async () => {
  const messages = [];
  const deps = { store: memoryStore(), notify: async (t) => messages.push(t), config: {} };
  await handleWebhook(deps, payload({ campaign: "feedback", order_key: "fb-test", test: "yes", order_number: "1000" }, { outcome: "reorder", reorder_pack: "none" }), NOW);
  assert.match(messages[0], /Може би иска поръчка/);
  assert.doesNotMatch(messages[0], /Нова поръчка/);
});
