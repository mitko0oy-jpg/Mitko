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
  assert.match(q([["gel", 3]]).suggestion, /Още 12 евро до 34 евро и 90 цента/);
  assert.match(q([["gel", 5]]).suggestion, /лепенки с пчелна отрова, осем броя, за 4 евро и 90 цента/);
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
  assert.match(t, /Лепенки Energy \(казва се „Енерджи“\)/);
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
