// Middleware → OrderDesk: how one Middleware order becomes our row (no database).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMw, MW_BASE } from "../netlify/lib/mw-import.mts";

const NOW = Date.parse("2026-11-27T12:00:00Z");

const made = {
  id: "uuid-1",
  store_id: "store-edu",
  external_id: null,
  sn: 5255,
  label: null,
  is_confirmed: "no",
  is_archived: false,
  status_key: "shipped",
  paid: "no",
  payment_name: "cod",
  currency: "EUR",
  tracking_number: "63846282004",
  ordered_at: "2026-11-27T10:39:07.000000Z",
  updated_at: "2026-11-27T10:51:53.000000Z",
  meta: { local_shipping: "2026-11-27 10:39:14" },
  addresses: [
    {
      type: "shipping",
      for: "office",
      for_id: "247",
      courier: "dpd-courier",
      name: "Анелия Христова",
      email: "a@example.com",
      country_iso2: "BG",
      city: "Плевен",
      postal_code: "5800",
      address1: "До офис dpd[247]: Плевен - ПЛЕВЕН - ХАДЖИ ДИМИТЪР (УЛ.) - ул. Хаджи Димитър No 52",
      phone: "+359886552047",
    },
  ],
  items: [
    { name: "Решения на задачите по математика (PDF)", quantity: 1, price: 0, product: { is_virtual: true } },
    { name: "Карти по математика", quantity: 1, price: 1490, product: { is_virtual: false } },
  ],
  totals: [
    { key: "shipping", value: "490" },
    { key: "subtotal", value: "1490" },
    { key: "total", value: "1980" },
  ],
  status_history: [],
  fulfillment: { carrier: "dpd-courier", waybill_number: "63846282004", tracking_url: "https://track/x" },
  store: { name: "EduBel" },
};

test("an order made in Middleware gets its own number and a negative id", () => {
  const r = fromMw(made, "edubel", NOW);
  assert.equal(r.order_no, "MW5255");
  assert.equal(r.cb_id, -(MW_BASE + 5255));
  assert.equal(r.from_shop, false);
  assert.equal(r.mw_status, "shipped");
  assert.equal(r.cb_status, "pending");
  assert.deepEqual(r.delivery, { type: "office", courier: "speedy", officeId: "247", officeName: "Плевен – Хаджи Димитър (ул.)" });
  assert.equal(r.shipping_name, "До офис Спиди");
  assert.equal(r.courier, "speedy");
  assert.equal(r.tracking_no, "63846282004");
  assert.equal(r.sub_total, 14.9);
  assert.equal(r.shipping, 4.9);
  assert.equal(r.total, 19.8);
  assert.equal(r.discount, 0);
  assert.equal(r.items[0].digital, true);
  assert.equal(r.items[1].total, 14.9);
  assert.equal(r.sent_at, "2026-11-27T10:39:14.000Z");
  // Still on the way: the courier tracking follows it, nothing is final yet.
  assert.equal(r.parcel_final, false);
  assert.equal(r.parcel_status, null);
  assert.equal(r.archive, false);
});

test("a shop order keeps the shop's id and number", () => {
  const r = fromMw({ ...made, external_id: "2851", label: "7889", status_key: "completed", status_history: [{ key: "completed", changed_at: "2026-11-29T09:00:00.000000Z" }] }, "edubel", NOW);
  assert.equal(r.order_no, "7889");
  assert.equal(r.cb_id, 2851);
  assert.equal(r.from_shop, true);
  assert.equal(r.parcel_final, true);
  assert.equal(r.parcel_status, "delivered");
  assert.equal(r.delivered_at, "2026-11-29T09:00:00.000Z");
  assert.equal(r.parcel_text, "Middleware: Завършена");
});

test("label 0 is not a shop number", () => {
  const r = fromMw({ ...made, external_id: null, label: "0" }, "edubel", NOW);
  assert.equal(r.order_no, "MW5255");
});

test("old abandoned carts come in put away", () => {
  const r = fromMw({ ...made, status_key: "abounded", tracking_number: null, fulfillment: { carrier: "dpd-courier" }, ordered_at: "2026-11-01T10:00:00Z" }, "edubel", NOW);
  assert.equal(r.cb_status, "abandoned");
  assert.equal(r.mw_status, null);
  assert.equal(r.archive, true);
  assert.equal(r.courier, null);
  assert.equal(r.sent_at, null);
});

test("an archived 'shipped' order without a waybill is put away, a refused one is final", () => {
  const stale = fromMw({ ...made, is_archived: true, tracking_number: null, fulfillment: { carrier: "econt-courier" } }, "bg", NOW);
  assert.equal(stale.archive, true);
  const refused = fromMw({ ...made, is_archived: true, status_key: "cancelled" }, "bg", NOW);
  assert.equal(refused.archive, false);
  assert.equal(refused.parcel_final, true);
  assert.equal(refused.parcel_status, null);
});

test("a locker and an Econt office", () => {
  const locker = fromMw({ ...made, addresses: [{ ...made.addresses[0], for: "locker", for_id: "9663", address1: "До автомат dpd[9663]: Козлодуй - КОЗЛОДУЙ - ЛУКОЙЛ (АВТОМАТ) - [3320] ул. Княз Дондуков No 28" }] }, "bg", NOW);
  assert.equal(locker.delivery.type, "automat");
  assert.equal(locker.delivery.courier, "speedy");
  assert.equal(locker.delivery.officeId, "9663");
  const econt = fromMw({ ...made, addresses: [{ ...made.addresses[0], courier: "econt", for_id: "6602", address1: "До офис econt[6602]: Кърджали - Възрожденци - кв. Възрожденци ул. Баба Тонка №8" }] }, "bg", NOW);
  assert.equal(econt.delivery.courier, "econt");
  assert.equal(econt.delivery.officeId, "6602");
  assert.equal(econt.shipping_name, "До офис Еконт");
});

test("an order in leva keeps its currency", () => {
  const r = fromMw({ ...made, currency: "BGN", totals: [{ key: "subtotal", value: "4500", currency: "BGN" }, { key: "shipping", value: "0" }, { key: "total", value: "4500" }] }, "bg", NOW);
  assert.equal(r.currency, "BGN");
  assert.equal(r.total, 45);
});
