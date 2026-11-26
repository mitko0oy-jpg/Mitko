import test from "node:test";
import assert from "node:assert/strict";
import priceList from "../agent/pricelist-bg.json" with { type: "json" };
import { upsellFor } from "../lib/upsell.mjs";
import { upsellVariables } from "../lib/engine.mjs";
import { quote } from "../lib/inbound.mjs";
import { buildMessage } from "../lib/policy.mjs";

test("middle package with paid delivery: two boxes give free delivery", () => {
  const u = upsellFor({ items: [{ name: "BeeVenom Care Gel 2+1 броя", qty: 1, price: 22.9 }], total: 27.4, shipping: 4.5 });
  assert.equal(u.kind, "two_boxes_free");
  assert.equal(u.totalOne, 32.3);
  assert.equal(u.totalTwo, 32.7, "22.90 + 2 × 4.90, no delivery");
  const v = upsellVariables(u);
  assert.equal(v.total_with_two_boxes, "32 евро и 70 цента");
  assert.equal(v.total_with_one_box, "32 евро и 30 цента");
  assert.equal(v.upsell_box_price, "4 евро и 90 цента");
});

test("other packages: one box; orders that already have plasters: nothing", () => {
  assert.equal(upsellFor({ items: [{ name: "BeeVenom Care Gel", qty: 1, price: 15.9 }], total: 20.4, shipping: 4.5 }).kind, "one_box");
  assert.equal(upsellFor({ items: [{ name: "Пчелна отрова Пакет 3+2 бр.", qty: 1, price: 29.9 }], total: 29.9, shipping: 0 }).kind, "one_box");
  assert.equal(upsellFor({ items: [{ name: "Bee Venom крем за стави 2+1 бурканчета", qty: 1, price: 22.9 }], total: 22.9, shipping: 0 }).kind, "one_box", "delivery already free");
  assert.equal(upsellFor({ items: [{ name: "BeeVenom Care Gel 2+1 броя", qty: 1, price: 22.9 }, { name: "Кутия Билкови пластири 12бр.", qty: 1, price: 4.9 }], total: 32.3, shipping: 4.5 }).kind, "none");
  assert.equal(upsellVariables(null).upsell_kind, "none");
});

test("phone orders: 2+1 plus two plaster boxes gets free delivery", () => {
  const q = quote(priceList, { items: [{ product_id: "gel-2p1", quantity: 1 }, { product_id: "patches-herbal", quantity: 2 }], delivery: "speedy_office" });
  assert.equal(q.freeDelivery, true);
  assert.equal(q.total, 32.7);
  const one = quote(priceList, { items: [{ product_id: "gel-2p1", quantity: 1 }, { product_id: "patches-herbal", quantity: 1 }], delivery: "speedy_office" });
  assert.equal(one.freeDelivery, false);
  assert.equal(one.total, 32.3);
  const notMiddle = quote(priceList, { items: [{ product_id: "gel-1", quantity: 1 }, { product_id: "patches-herbal", quantity: 2 }], delivery: "econt_office" });
  assert.equal(notMiddle.freeDelivery, false);
});

test("Telegram tells what to add and the new total", () => {
  const rec = { orderNo: 1, site: "bg", name: "Х", phone: "+359888", upsell: upsellFor({ items: [{ name: "Гел 2+1", qty: 1, price: 22.9 }], total: 27.4, shipping: 4.5 }) };
  assert.match(buildMessage(rec, "✅", { upsell: "two_boxes", failedChecks: [] }), /2 кутии билкови пластири \+ БЕЗПЛАТНА доставка<\/b> · нова сума: <b>32,70 €/);
  assert.match(buildMessage(rec, "✅", { upsell: "one_box", failedChecks: [] }), /1 кутия билкови пластири \(4,90 €\)<\/b> · нова сума: <b>32,30 €/);
  assert.doesNotMatch(buildMessage(rec, "✅", { upsell: "none", failedChecks: [] }), /Добави/);
});

test("any patches already in the order – paid, gift, bee-venom or wellness – mean no offer", () => {
  // Order № 13 (Здравец Натура, 26.11.2026): the agent offered patches the customer had just ordered.
  const boyka = [
    { name: "5 гела за стави BeeVenom", qty: 1, price: 34.9 },
    { name: "Подарък: 12 пластира за стави и мускули", qty: 3, price: 0 },
    { name: "Bee Venom пластири с пчелна отрова – −50% към поръчка над 34,90 €", qty: 1, price: 4.95 },
    { name: "Хиалуронов крем за стави – специална цена към поръчка", qty: 1, price: 7.9 },
  ];
  assert.equal(upsellFor({ items: boyka, total: 47.75, shipping: 0 }).kind, "none");
  assert.equal(upsellFor({ items: [{ name: "Гел 3+1", qty: 1, price: 24.9 }, { name: "Подарък 12 пластира", qty: 1, price: 0 }], total: 24.9, shipping: 0 }).kind, "none", "a gift box of patches");
  assert.equal(upsellFor({ items: [{ name: "Лепенки за стрес и напрежение", qty: 2, price: 19.8 }], total: 24.7, shipping: 4.9 }).kind, "none");
  assert.equal(upsellFor({ items: [{ name: "Хиалуронов крем за стави", qty: 1, price: 14.9 }], total: 19.8, shipping: 4.9 }).kind, "one_box", "no patches yet: offer");
});
