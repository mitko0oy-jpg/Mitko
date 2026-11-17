// Pure logic: reading shop orders, courier statuses, phone matching, webhook signatures.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { courierOf, normalize, parseDelivery, parseOffice } from "../netlify/lib/cb.mts";
import { econtState, speedyState, speedyTrack, setCourierFetch } from "../netlify/lib/couriers.mts";
import { phoneKey, pickMatches } from "../netlify/lib/match.mts";
import { mapMwOrder } from "../netlify/lib/mw.mts";
import { validSignature } from "../netlify/functions/hook.mts";
import { addDays, sofiaDay } from "../netlify/lib/dates.mts";

test("office written by ConvertBuilder into the address line", () => {
  assert.deepEqual(parseOffice("До офис speedy[141]: БОТЕВГРАД - СКЛАД жк Васил Левски ул. Цар Иван Шишман No 42"), {
    type: "office",
    courier: "speedy",
    officeId: "141",
    officeName: "Ботевград – Склад",
  });
  const a = parseOffice("До офис speedy[9317]: КИЛИФАРЕВО - СУПЕРМАРКЕТ СТИВИ (АВТОМАТ) ул. Иван Вазов");
  assert.equal(a.type, "automat");
  assert.equal(a.officeName, "Килифарево – Супермаркет Стиви");
  assert.equal(parseOffice("До офис econt[6308]: Хасково -  Хасково Източна индустриална зона бул. Съединение №66").officeName, "Хасково – Източна индустриална зона");
  assert.equal(parseOffice("ул. Шипка 5"), null);
});

test("delivery from the shipping method name when there is no office", () => {
  assert.deepEqual(parseDelivery({ shippingName: "До адрес speedy - Безплатна доставка", shippingAddress: { address: "ул. Шипка 5" } }), { type: "address", courier: "speedy" });
  assert.deepEqual(parseDelivery({ shippingName: "Офис на Еконт", shippingAddress: {} }), { type: "office", courier: "econt" });
  assert.equal(courierOf("To office gls-new"), "gls");
});

test("normalize a ConvertBuilder order", () => {
  const n = normalize({
    id: 77,
    invoiceNo: 1732,
    created: 1794480000,
    status: "SHIPPED",
    customerName: "Мария Петрова",
    customerEmail: "m@example.com",
    shippingAddress: { name: "Мария Петрова", phone: "0888123456", city: "Пловдив", address: "До офис econt[1]: Пловдив - Тракия", zipCode: "4000" },
    items: [{ name: " BeeVenom Care Gel ", quantity: 2, total: 31.8 }],
    subTotal: 31.8,
    shippingAmount: 4.5,
    total: 36.3,
    fulfillment: { courier: "Econt", trackingNo: "1051603000123" },
  });
  assert.equal(n.order_no, "1732");
  assert.equal(n.cb_status, "shipped");
  assert.equal(n.items[0].name, "BeeVenom Care Gel");
  assert.equal(n.items[0].qty, 2);
  assert.equal(n.courier, "econt");
  assert.equal(n.tracking_no, "1051603000123");
  assert.equal(n.cb_shipped, true);
  assert.equal(n.delivery.courier, "econt");
  assert.equal(normalize({ id: 1, created: 1794480000, status: "pending" }).cb_shipped, false);
});

test("Speedy operation codes", () => {
  const op = (code, h) => ({ operationCode: code, dateTime: `2026-11-1${h}T10:00:00+02:00`, description: `op ${code}` });
  assert.equal(speedyState([op(1, 0), op(-14, 2)]).status, "delivered");
  assert.equal(speedyState([op(1, 0), op(-14, 2)]).final, true);
  assert.equal(speedyState([op(1, 0), op(134, 1)]).status, "at_office");
  assert.equal(speedyState([op(1, 0), op(123, 1), op(111, 2)]).status, "refused");
  assert.equal(speedyState([op(1, 0), op(111, 3)]).status, "returned");
  assert.equal(speedyState([op(1, 0), op(11, 1)]).status, "in_transit");
  assert.equal(speedyState([]).status, "prepared");
  assert.equal(speedyState([op(148, 0)]).status, "prepared");
});

test("Econt statuses as they come for real parcels", () => {
  const ev = (type, t) => ({ destinationType: type, destinationDetails: type, time: t });
  assert.equal(econtState({ shortDeliveryStatus: "Очаква предаване към Еконт", shortDeliveryStatusEn: "Awaiting delivery to Econt", trackingEvents: [ev("prepared", 1)] }).status, "prepared");
  assert.equal(econtState({ shortDeliveryStatus: "Пристигнала в офис", shortDeliveryStatusEn: "In delivery office", trackingEvents: [ev("courier_direction", 1), ev("office", 2)] }).status, "at_office");
  const d = econtState({ shortDeliveryStatus: "Доставена", shortDeliveryStatusEn: "Delivered", deliveryTime: 1794480000000, cdCollectedAmount: 44.8, trackingEvents: [ev("office", 1), ev("client", 2)] });
  assert.equal(d.status, "delivered");
  assert.equal(d.final, true);
  assert.equal(d.deliveredAt, new Date(1794480000000).toISOString());
  assert.equal(econtState({ shortDeliveryStatus: "Върната", shortDeliveryStatusEn: "Returned", deliveryTime: 1, nextShipments: [{ reason: "return" }], trackingEvents: [ev("return", 1), ev("client", 2)] }).status, "returned");
  assert.equal(econtState({ shortDeliveryStatus: "Отказана от получател", shortDeliveryStatusEn: "Refused" }).status, "refused");
});

test("Speedy track: 10 parcels per request, answers matched by id", async () => {
  const calls = [];
  setCourierFetch(async (url, init) => {
    const b = JSON.parse(init.body);
    calls.push(b.parcels.length);
    assert.equal(url, "https://api.speedy.bg/v1/track");
    assert.equal(b.userName, "u");
    return new Response(JSON.stringify({ parcels: b.parcels.map((p) => ({ parcelId: p.id, operations: [{ operationCode: -14, dateTime: "2026-11-10T10:00:00+02:00", description: "Доставена" }] })) }));
  });
  const ids = Array.from({ length: 23 }, (_, i) => String(600000000 + i));
  const r = await speedyTrack({ user: "u", pass: "p" }, ids);
  setCourierFetch(null);
  assert.deepEqual(calls, [10, 10, 3]);
  assert.equal(r.size, 23);
  assert.equal(r.get("600000005").status, "delivered");
});

test("phone keys and waybill matching", () => {
  assert.equal(phoneKey("+359 888 123 456"), phoneKey("0888123456"));
  const t = Date.parse("2026-11-10T12:00:00Z");
  const orders = [
    { id: 1, phone: phoneKey("0888123456"), total: 32.4, at: t - 86400000 },
    { id: 2, phone: phoneKey("0888123456"), total: 49.4, at: t - 3600000 },
    { id: 3, phone: phoneKey("0899000000"), total: 20.4, at: t - 86400000 },
  ];
  const m = pickMatches(
    [
      { number: "A", phone: phoneKey("359888123456"), cod: 32.4, created: t },
      { number: "B", phone: phoneKey("0899000000"), cod: 99, created: t }, // one order only, amount differs: still taken
      { number: "C", phone: phoneKey("0877777777"), cod: 10, created: t },
    ],
    orders,
  );
  assert.deepEqual(m, [
    { orderId: 1, number: "A" },
    { orderId: 3, number: "B" },
  ]);
});

test("Middleware order mapping", () => {
  const o = mapMwOrder({ label: 1732, status_key: "completed", tracking_number: "62000000001", updated_at: "2026-11-12T10:00:00.000000Z", fulfillment: { shipping: { name: "Speedy" }, tracking_url: "https://t" } });
  assert.deepEqual({ ...o, updatedAt: !!o.updatedAt }, { label: "1732", status: "completed", trackingNo: "62000000001", courier: "speedy", trackingUrl: "https://t", updatedAt: true });
});

test("webhook signature: HMAC-SHA512 hex of the raw body", () => {
  const body = '{"id":1}';
  const sig = createHmac("sha512", "s3cret").update(body).digest("hex");
  assert.equal(validSignature(body, "s3cret", sig), true);
  assert.equal(validSignature(body, "other", sig), false);
  assert.equal(validSignature(body + " ", "s3cret", sig), false);
  assert.equal(validSignature(body, "s3cret", null), false);
});

test("Sofia days", () => {
  assert.equal(sofiaDay(Date.parse("2026-11-16T22:30:00Z")), "2026-11-17");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});
