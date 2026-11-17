// Order corrections, product list from the shops, SMS texts.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanItems, describe } from "../netlify/lib/edit.mts";
import { productRows } from "../netlify/lib/products.mts";
import { fillTemplate, smsNumber, smsParts, toLatin } from "../netlify/lib/sms.mts";

test("items: quantity × unit price, checks", () => {
  assert.deepEqual(cleanItems([{ name: " Спрей ", qty: 2, price: 12.9 }]), [{ name: "Спрей", qty: 2, total: 25.8 }]);
  assert.throws(() => cleanItems([]), /поне един продукт/);
  assert.throws(() => cleanItems([{ name: "", qty: 1, price: 1 }]), /име/);
  assert.throws(() => cleanItems([{ name: "А", qty: 0, price: 1 }]), /бройката/);
  assert.throws(() => cleanItems([{ name: "А", qty: 1, price: -1 }]), /цената/);
});

test("what changed, in words", () => {
  const before = { items: [{ name: "Крем", qty: 1, total: 29.9 }], shipping: 4.5, discount: 0, total: 34.4 };
  const after = { items: [{ name: "Крем", qty: 2, total: 59.8 }, { name: "Спрей", qty: 1, total: 12.9 }], shipping: 0, discount: 0, total: 72.7 };
  assert.deepEqual(describe(before, after), [
    "„Крем“: 1 бр. за 29,90 € → 2 бр. за 59,80 €",
    "добавен „Спрей“ (1 × 12,90 €)",
    "доставка 4,50 € → 0,00 €",
    "общо 34,40 € → 72,70 €",
  ]);
  assert.deepEqual(describe(before, before), []);
});

test("products from ConvertBuilder: one row per variant, sale price wins", () => {
  const rows = productRows({
    id: 5,
    title: "Крем за стави",
    images: ["https://x/1.jpg"],
    variants: [
      { options: [{ name: "Брой", value: "1 бр." }], price: 15.9, sku: "K1" },
      { options: [{ name: "Брой", value: "3+2" }], price: 39.9, onSale: true, salePrice: 29.9, sku: "K5" },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.title, r.price, r.sku, r.variant]), [
    ["Крем за стави – 1 бр.", 15.9, "K1", "1 бр."],
    ["Крем за стави – 3+2", 29.9, "K5", "3+2"],
  ]);
  assert.deepEqual(productRows({ id: 6, title: "Спрей", price: 12.9 }).map((r) => [r.title, r.price, r.variant]), [["Спрей", 12.9, ""]]);
  assert.deepEqual(productRows({ title: "без id" }), []);
});

test("SMS: numbers, Latin, parts, templates", () => {
  assert.equal(smsNumber("0888 123 456"), "359888123456");
  assert.equal(smsNumber("+359888123456"), "359888123456");
  assert.equal(smsNumber("00421905123456"), "421905123456");
  assert.equal(smsNumber("123"), null);
  assert.equal(toLatin("Здравейте, Щастлива Юлия! Поръчка № 5 – 12,90 €"), "Zdraveyte, Shtastliva Yuliya! Porachka No 5 - 12,90 EUR");
  assert.deepEqual(smsParts("a".repeat(160)), { chars: 160, unicode: false, parts: 1 });
  assert.deepEqual(smsParts("a".repeat(161)), { chars: 161, unicode: false, parts: 2 });
  assert.deepEqual(smsParts("я".repeat(70)), { chars: 70, unicode: true, parts: 1 });
  assert.deepEqual(smsParts("я".repeat(71)), { chars: 71, unicode: true, parts: 2 });
  const t = fillTemplate("{име}, поръчка № {номер} от {магазин} за {сума}, {куриер} {товарителница}.", {
    customer_name: "Мария Петрова",
    order_no: "1734",
    shop_label: "BeeVenom BG",
    total: 42.8,
    currency: "EUR",
    courier: "econt",
    tracking_no: "1055",
  });
  assert.equal(t, "Мария, поръчка № 1734 от BeeVenom за 42,80 €, Еконт 1055.");
});
