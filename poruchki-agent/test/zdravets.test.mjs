import test from "node:test";
import assert from "node:assert/strict";
import pl from "../agent/pricelist-zdravets.json" with { type: "json" };
import { quoteZ, quoteAnswer, renderZdravets, sayBG } from "../lib/zdravets.mjs";
import { quote, submitOrder } from "../lib/inbound.mjs";
import { memoryStore } from "../lib/store.mjs";

const BF = new Date("2026-11-22T10:00:00+02:00");
const AFTER = new Date("2026-12-01T10:00:00+02:00");
const q = (items, delivery = "econt_office", now = BF) => quoteZ(pl, { items: items.map(([product_id, quantity = 1]) => ({ product_id, quantity })), delivery }, now);

test("zdravets: packs, delivery and the free office delivery from 34,90 € – as on the site", () => {
  assert.equal(q([["gel"]]).total, 20.8);
  assert.equal(q([["gel", 2]]).total, 24.8);
  assert.equal(q([["gel", 3]]).total, 27.8);
  const five = q([["gel", 5]]);
  assert.equal(five.total, 34.9, "5 gels: free delivery to an office");
  assert.equal(five.freeDelivery, true);
  assert.equal(q([["gel", 5]], "speedy_address").total, 40.8, "to an address it is still paid");
  assert.equal(q([["spray", 3]]).total, 34.9);
  assert.equal(q([["trio"]], "speedy_address").total, 23.8);
  // 4 gels: 3-pack + one gel (the cheapest split), and the tool says 5 cost less.
  const four = q([["gel", 4]]);
  assert.equal(four.subtotal, 38.8);
  assert.match(four.suggestion, /5 броя гел за стави .* по-евтино от 4/);
});

test("zdravets: over 34,90 € every further single product is half price (packs never)", () => {
  // 3 gels (pack, 22,90) + vein cream 12,90 = 35,80 → threshold reached; the hyaluronic cream is half: 9,95.
  const r = q([["gel", 3], ["vein"], ["hyal"]]);
  assert.equal(r.halfOn, true);
  assert.equal(r.subtotal, 45.75);
  assert.equal(r.total, r.subtotal, "free delivery to an office");
  assert.ok(r.lines.some((l) => /хиалуронов крем за стави на половин цена/i.test(l.name) && l.sum === 9.95));
  assert.equal(r.saved, 9.95);
  // Single products only: the cheapest set that reaches 34,90 stays at full price.
  const singles = q([["gel"], ["spray"], ["vein"]]);
  assert.equal(singles.subtotal, 46.7, "no two of them reach 34,90 – all at full price");
  // Below the threshold nothing is halved.
  assert.equal(q([["vein"], ["nail"]]).subtotal, 22.8);
});

test("zdravets: wellness patches – 1 box 14,90, any 2 boxes 22,90, any 3 boxes 29,90", () => {
  assert.equal(q([["berberin"]]).subtotal, 14.9);
  assert.equal(q([["berberin"], ["focus"]]).subtotal, 22.9);
  assert.equal(q([["berberin", 2]]).subtotal, 22.9, "the same kind counts too");
  assert.equal(q([["berberin", 2], ["apetit"]]).subtotal, 29.9);
  assert.equal(q([["nad", 4]]).subtotal, 44.8);
  // They are never halved, but count towards the threshold.
  const r = q([["energy", 3], ["vein"]]);
  assert.equal(r.subtotal, 42.8);
  assert.equal(r.freeDelivery, true);
});

test("zdravets: Black Friday gift from 3 pieces until 30.11 – then it stops by itself", () => {
  assert.equal(q([["gel", 2]]).gift, null);
  assert.match(q([["gel", 3]]).gift.text, /12 лепенки за стави/);
  assert.match(q([["gel", 5]]).gift.text, /3 пакета .*36 броя/);
  assert.match(q([["trio"]]).gift.text, /12 лепенки/);
  assert.match(q([["gel"], ["vein"], ["nail"]]).gift.text, /12 лепенки/, "3 separate products");
  assert.match(q([["berberin", 3]]).gift.text, /уелнес лепенки по избор/, "wellness only: a 4th box of choice");
  assert.equal(q([["gel", 3]], "econt_office", AFTER).gift, null);
  assert.doesNotMatch(renderZdravets(pl, AFTER), /Черен петък|подарък/);
});

test("zdravets: one extra offer, with the exact new total", () => {
  assert.match(q([["gel"]]).suggestion, /3 броя гел за стави с пчелна отрова вместо 1.*22 евро и 90 цента и подарък 12 лепенки.*27 евро и 80 цента/);
  // 3 gels: one more product makes the delivery free – which one and the new total (not the gift's patches again).
  assert.match(q([["gel", 3]]).suggestion, /Ако добавите и спрей за стави с пчелна отрова, поръчката минава 34 евро и 90 цента: доставката до офис става безплатна и общата сума ще е 40 евро и 80 цента – само 13 евро повече/);
  assert.equal(q([["gel", 5]]).suggestion, "", "the 4,90 € checkout add-on is not offered on the phone");
  assert.match(q([["berberin"]]).suggestion, /още една кутия – от същите или друг вид – двете излизат 22 евро и 90 цента\. Общата сума ще е 27 евро и 80 цента/);
  const withAddon = q([["gel", 5], ["addon_bvpatch"]]);
  assert.equal(withAddon.subtotal, 39.8);
  assert.equal(q([["addon_bvpatch"]]).errors.length, 1, "an add-on only with another product");
});

test("zdravets: codes – unknown ones are refused, old incoming-line codes still work", () => {
  assert.match(q([["xyz"]]).errors[0], /непознат продукт „xyz“/);
  assert.equal(q([["gel-2p1"]]).subtotal, 22.9, "2+1 = three gels");
  assert.equal(q([["patches-herbal"]]).subtotal, 9.9);
  assert.equal(q([["gel", 0]]).errors.length, 1);
  assert.match(quoteZ(pl, { items: [{ product_id: "gel", quantity: 1 }], delivery: "post" }, BF).errors[0], /доставка/);
});

test("zdravets: what get_total answers", () => {
  const a = quoteAnswer(q([["gel", 3], ["vein"], ["hyal"]]));
  assert.equal(a.ok, true);
  assert.equal(a.total, "45 евро и 75 цента");
  assert.equal(a.delivery, "до офис на Еконт – безплатна");
  assert.match(a.gift, /12 лепенки/);
  assert.match(a.half_price, /половин цена/);
  assert.ok(a.items.every((i) => !/BeeVenom|пластир/.test(i)), "spoken names only");
});

test("zdravets: the catalogue in Стела's script", () => {
  const t = renderZdravets(pl, BF);
  assert.match(t, /### Гел за стави с пчелна отрова \[код gel\]\n20 г · около 40 нанасяния\. Цени: 1 брой – 15 евро и 90 цента; 2 броя – 19 евро и 90 цента; 3 броя – 22 евро и 90 цента \(най-избиран\); 5 броя – 34 евро и 90 цента/);
  assert.match(t, /две кутии по избор \(еднакви или различни\) – 22 евро и 90 цента/);
  assert.match(t, /не обещаваш отслабване, сваляне на кръвна захар/);
  assert.match(t, /Лепенки NAD\+ за жизненост \(казва се „Ен Ей Ди плюс“\)/);
  assert.doesNotMatch(t, /за енергия и тонус \(казва се/, "Bulgarian names are said as written");
  assert.match(t, /\[код trio\]/);
  assert.equal(t.match(/\[код trio\]/g).length, 1);
  assert.match(t, /0988 88 05 07, денонощно/);
  assert.equal(sayBG("Пластири с пчелна отрова (8 бр.)"), "Лепенки с пчелна отрова (8 бр.)");
  assert.equal(sayBG("Гел за стави BeeVenom"), "Гел за стави с пчелна отрова");
});

test("zdravets: a phone order is saved and sent to Telegram with the shop's product numbers", async () => {
  const store = memoryStore();
  const msgs = [];
  const deps = { store, notify: async (t) => msgs.push(t), priceList: pl };
  const missing = await submitOrder(deps, { customer_name: "Иван Петров", caller_phone: "+359888123456", items: [{ product_id: "gel", quantity: 3 }], city: "Пловдив", office_or_address: "Тракия" }, BF);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /доставка/);
  const ok = await submitOrder(deps, {
    customer_name: "Иван Петров",
    caller_phone: "+359888123456",
    items: [{ product_id: "gel", quantity: 3 }, { product_id: "vein", quantity: 1 }],
    delivery: "speedy_office",
    city: "Пловдив",
    office_or_address: "офис Тракия",
  }, BF);
  assert.equal(ok.ok, true);
  assert.equal(ok.total, "35 евро и 80 цента");
  assert.match(msgs[0], /№26/);
  assert.match(msgs[0], /№9/);
  assert.match(msgs[0], /🎁 Подарък: 1 × Пластири за стави 12 бр\. \[№32\]/);
  assert.match(msgs[0], /безплатна/);
  assert.match(msgs[0], /Здравец Натура в ConvertBuilder/);
  const saved = (await store.list({ prefix: "phone-orders/" })).blobs;
  assert.equal(saved.length, 1);
  assert.equal(quote(pl, { items: [{ product_id: "gel", quantity: 1 }], delivery: "econt_office" }, BF).total, 20.8, "quote() picks the zdravets rules");
});

test("zdravets: for this very order – the total if one more product is added", () => {
  const a = quoteAnswer(q([["gel", 3]]));
  const vein = a.if_you_add.find((x) => x.includes("[vein]"));
  assert.equal(vein, "Крем с конски кестен [vein]: обща сума 35 евро и 80 цента (с 8 евро повече) – доставката става безплатна");
  assert.match(a.if_you_add.find((x) => x.includes("[bvpatch]")), /обща сума 37 евро и 70 цента \(с 9 евро и 90 цента повече\)$/, "the patches at 9,90 €");
  // Above 34,90 € the next product is half price.
  const above = quoteAnswer(q([["gel", 5]]));
  assert.match(above.if_you_add.find((x) => x.includes("[bvpatch]")), /39 евро и 85 цента \(с 4 евро и 95 цента повече\) – той е на половин цена/);
  assert.match(above.if_you_add.find((x) => x.includes("[wellness]") || x.includes("уелнес")), /уелнес лепенки по избор/);
});

test("zdravets: a repeat order by phone – 30% off the products, after the offers; the thresholds use the price before it", () => {
  const r = q([["gel", 3]], "econt_office", BF);
  const rr = quoteZ(pl, { items: [{ product_id: "gel", quantity: 3 }], delivery: "econt_office" }, BF, { repeat: true });
  assert.equal(rr.repeatOff, 6.87);
  assert.equal(rr.total, 20.93, "16,03 € + 4,90 € delivery");
  assert.equal(r.total, 27.8);
  const five = quoteZ(pl, { items: [{ product_id: "gel", quantity: 5 }], delivery: "econt_office" }, BF, { repeat: true });
  assert.equal(five.freeDelivery, true, "34,90 € before the discount – the delivery stays free");
  assert.equal(five.total, 24.43);
  assert.match(quoteAnswer(rr).repeat_discount, /30% отстъпка от продуктите \(6 евро и 87 цента\)/);
  assert.equal(quoteAnswer(r).repeat_discount, undefined);
});

test("zdravets: who is a repeat customer – an earlier phone order or an order in OrderDesk that was not canceled", async () => {
  const { repeatCustomer } = await import("../lib/inbound.mjs");
  const store = memoryStore();
  const orders = { "+359888111111": [{ status: "delivered" }], "+359888222222": [{ status: "canceled" }, { status: "returned" }] };
  const platform = { enabled: true, searchByPhone: async (p, days) => (assert.equal(days, 730), orders[p] || []) };
  assert.equal(await repeatCustomer({ store, platform }, ["0888111111"]), true);
  assert.equal(await repeatCustomer({ store, platform }, ["+359888222222"]), false, "canceled or refused do not count");
  assert.equal(await repeatCustomer({ store, platform }, ["", undefined]), false);
  await store.setJSON("phone-orders/2026-11-20/Т1120-AB12", { phone: "+359888333333" });
  assert.equal(await repeatCustomer({ store, platform: { enabled: false } }, ["0888333333"]), true, "an earlier phone order");
  // Saved with the discount and shown in Telegram.
  const msgs = [];
  const ok = await submitOrder({ store, notify: async (t) => msgs.push(t), priceList: pl }, {
    customer_name: "Иван Петров", caller_phone: "+359888333333", items: [{ product_id: "gel", quantity: 3 }], delivery: "econt_office", city: "Пловдив", office_or_address: "офис Тракия",
  }, BF, { repeat: true });
  assert.equal(ok.total, "20 евро и 93 цента");
  assert.match(msgs[0], /🔁 Повторна поръчка по телефона: −30% от продуктите \(−6 евро и 87 цента\)/);
});


test("zdravets: the Black Friday sets with their own page – the gift comes with 2 products, gone after 30.11", () => {
  assert.equal(q([["sg"]]).total, 32.8, "Спрей + гел 27,90 + office 4,90");
  assert.equal(q([["gk"]]).total, 28.8, "Гел + крем 23,90 + office 4,90");
  assert.match(q([["sg"]]).gift.text, /12 лепенки за стави/, "the gift with only 2 products");
  assert.match(q([["gk"]]).gift.cb, /№32/);
  assert.match(q([["gk"]]).lines[0].cb, /\[№76\]/);
  assert.equal(q([["gk"], ["gel"]]).total, 39.8, "over 34,90 €: the office delivery is free");
  assert.match(q([["gk"]], "econt_office", AFTER).errors[0], /само за Черния петък/);
  const t = renderZdravets(pl, BF);
  assert.match(t, /### Спрей \+ гел за стави – само за Черен петък до 30 ноември \[код sg\]\n.*27 евро и 90 цента\. С подарък 12 лепенки за стави и мускули\. Поотделно струва 48 евро и 70 цента\./);
  assert.match(t, /Продава се само в този комплект: Крем за стави с пчелна отрова – ултра силна формула, 30 г/);
  assert.match(t, /zdravets\.eu\/gel-krem/);
  assert.doesNotMatch(renderZdravets(pl, AFTER), /\[код sg\]|\[код gk\]/);
});
