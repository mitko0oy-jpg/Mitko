// Waybill building: the same choices Middleware made, from the order data.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanDraft, draftFor, econtLabel, fiscalItems } from "../netlify/lib/waybills.mts";
import { setLookupFetch, speedyByRef } from "../netlify/lib/lookup.mts";

const DEF = {
  speedy: { clientId: 1, dropoffOfficeId: 301, serviceId: 505, obpd: "TEST", package: "ENVELOPE", weight: 1, vatGroup: "А", paper: "A6" },
  econt: { senderOfficeCode: "1152", sms: true, weight: 0.5, agreement: true, payAfterTest: false, payAfterAccept: false },
};
const order = (extra = {}) => ({
  id: 7,
  shop: "edubel",
  order_no: "7846",
  customer_name: "Мария Петрова",
  phone: "0888123456",
  city: "Пловдив",
  zip: "4000",
  address: "До офис speedy[414]: ПЛОВДИВ - ВЕЛЕШКИ ул. Авксентий Велешки 31",
  address2: "",
  delivery: { type: "office", courier: "speedy", officeId: "414", officeName: "Пловдив – Велешки" },
  items: [
    { name: "Български език и Литература", qty: 1, total: 44.9 },
    { name: "Подарък", qty: 1, total: 0 },
  ],
  shipping: 0,
  total: 44.9,
  paid: false,
  shipping_name: "Доставка до офис на Спиди",
  ...extra,
});

test("draft from an order: office, COD = total, contents = products", () => {
  const d = draftFor(order(), DEF);
  assert.equal(d.courier, "speedy");
  assert.equal(d.type, "office");
  assert.equal(d.officeId, "414");
  assert.equal(d.cod, 44.9);
  assert.equal(d.contents, "Български език и Литература");
  assert.equal(d.address, ""); // the office line is not an address
  assert.equal(d.obpd, "TEST");
  assert.equal(draftFor(order({ paid: true }), DEF).cod, 0);
  const a = draftFor(order({ delivery: { type: "address", courier: "econt" }, address: "ул. Шипка 5", shipping_name: "До адрес – Еконт" }), DEF);
  assert.equal(a.courier, "econt");
  assert.equal(a.type, "address");
  assert.equal(a.address, "ул. Шипка 5");
  assert.equal(a.weight, 0.5);
});

test("draft checks", () => {
  const base = draftFor(order(), DEF);
  assert.throws(() => cleanDraft({ phone: "12" }, base), /телефона/);
  assert.throws(() => cleanDraft({ officeId: "" }, base), /офис/);
  assert.throws(() => cleanDraft({ type: "address", address: "" }, base), /адрес/);
  assert.equal(cleanDraft({ cod: "-5" }, base).cod, 0);
  assert.equal(cleanDraft({ weight: 999 }, base).weight, 50);
});

test("fiscal receipt lines add up to the COD amount", () => {
  assert.deepEqual(fiscalItems(order(), 44.9, "А"), [{ description: "Български език и Литература", vatGroup: "А", amount: 44.9, amountWithVat: 44.9 }]);
  const withShipping = fiscalItems(order({ shipping: 4.5, total: 49.4 }), 49.4, "А");
  assert.deepEqual(withShipping.map((i) => i.amount), [44.9, 4.5]);
  // A discount breaks the sum: one line for the whole order.
  assert.deepEqual(fiscalItems(order(), 40, "А"), [{ description: "Поръчка 7846", vatGroup: "А", amount: 40, amountWithVat: 40 }]);
});

test("Econt label: sender office, COD agreement, order number", () => {
  const d = draftFor(order({ delivery: { type: "office", courier: "econt", officeId: "8501" } }), DEF);
  const l = econtLabel(d, order(), DEF.econt, { client: { name: "Фирма" }, agreement: "CD1" });
  assert.equal(l.senderOfficeCode, "1152");
  assert.equal(l.receiverOfficeCode, "8501");
  assert.equal(l.orderNumber, "7846");
  assert.deepEqual(l.services, { cdAmount: 44.9, cdType: "get", cdCurrency: "EUR", cdPayOptionsTemplate: "CD1", smsNotification: true });
  assert.throws(() => econtLabel(d, order(), { ...DEF.econt, senderOfficeCode: "" }, { client: {}, agreement: null }), /офис на подателя/);
});

test("Econt label: a company sender needs „упълномощено лице“ – from Куриери → Еконт, else the МОЛ", () => {
  const d = draftFor(order({ delivery: { type: "office", courier: "econt", officeId: "8501" } }), DEF);
  const firm = { name: "Фирма ЕООД", juridicalEntity: true, phones: ["+359888000111"], mol: "Иван Иванов" };
  const set = econtLabel(d, order(), { ...DEF.econt, agentName: "Мария Петрова", agentPhone: "" }, { client: firm, agreement: null });
  assert.deepEqual(set.senderAgent, { name: "Мария Петрова", phones: ["+359888000111"] }, "the company's phone when none is set");
  const own = econtLabel(d, order(), { ...DEF.econt, agentName: "Мария Петрова", agentPhone: "0877123456" }, { client: firm, agreement: null });
  assert.deepEqual(own.senderAgent.phones, ["0877123456"]);
  assert.equal(econtLabel(d, order(), DEF.econt, { client: firm, agreement: null }).senderAgent.name, "Иван Иванов", "МОЛ from the profile");
  assert.throws(() => econtLabel(d, order(), DEF.econt, { client: { ...firm, mol: "" }, agreement: null }), /упълномощено лице/);
  assert.equal(econtLabel(d, order(), DEF.econt, { client: { name: "Физическо лице" }, agreement: null }).senderAgent, undefined, "a person sends without one");
});

test("Speedy: Middleware's waybill found by order number, only with the same phone", async () => {
  setLookupFetch(async (url, init) => {
    const b = JSON.parse(init.body);
    if (url.endsWith("/track")) {
      assert.deepEqual(b.parcels, [{ ref: "7846" }, { ref: "100" }]);
      return new Response(JSON.stringify({ parcels: [
        { parcelId: "111", ref: "7846", operations: [{ operationCode: 148, dateTime: "2026-11-17T15:39:02+0200", description: "Получена информация за пратка" }] },
        { parcelId: "222", ref: "7846", operations: [{ operationCode: -14, dateTime: "2026-10-01T10:00:00+0200", description: "Доставена" }] },
        { parcelId: "999", ref: "100", operations: [] },
      ] }));
    }
    assert.ok(url.endsWith("/shipment/info"));
    return new Response(JSON.stringify({ shipments: [
      { id: "111", recipient: { phones: [{ number: "+359888123456" }] }, content: { parcels: [{ id: "111" }] } },
      { id: "222", recipient: { phones: [{ number: "0899000000" }] }, content: { parcels: [{ id: "222" }] } }, // another shop's order 7846
    ] }));
  });
  const found = await speedyByRef({ user: "u", pass: "p" }, [
    { id: 1, order_no: "7846", phone: "0888 123 456", ordered_at: "2026-11-17T12:48:26Z" },
    { id: 2, order_no: "100", phone: "0888000000", ordered_at: "2026-11-17T12:00:00Z" },
  ], new Set(["999"]));
  setLookupFetch(null);
  assert.equal(found.length, 1);
  assert.equal(found[0].orderId, 1);
  assert.equal(found[0].number, "111");
  assert.equal(found[0].state.status, "prepared"); // only "Получена информация за пратка" so far
});
