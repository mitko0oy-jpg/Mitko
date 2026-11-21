import test from "node:test";
import assert from "node:assert/strict";
import { middleware } from "../lib/middleware.mjs";
import { findOrders } from "../lib/inbound.mjs";

const env = (k) => ({ MW_TOKEN: "t", MW_TENANT: "ten", MW_STORES: JSON.stringify({ bg: "store-bg" }) })[k] || "";
const order = (o) => ({ data: [{ id: "m1", label: "1732", is_confirmed: "no", status_key: "pending", fulfillment: { shipping: { name: "Speedy" }, waybill_status_label: "" }, ...o }] });

function fake(resp) {
  const seen = [];
  const f = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(resp), { status: 200 });
  };
  return { f, seen };
}

test("lookup by shop order number in the right store", async () => {
  const { f, seen } = fake(order({ status_key: "shipped", fulfillment: { shipping: { name: "Speedy" }, waybill_status_label: "Получена информация за пратка" } }));
  const mw = middleware({ env, fetchImpl: f });
  const o = await mw.lookup("bg", 1732);
  const u = new URL(seen[0].url);
  assert.equal(u.searchParams.get("filter[store_id]"), "store-bg");
  assert.equal(u.searchParams.get("filter[label]"), "1732");
  assert.equal(seen[0].init.headers["X-Tenant-Id"], "ten");
  assert.equal(o.statusText, "изпратена е");
  assert.equal(o.carrier, "Speedy");
  assert.equal(o.waybillStatus, "Получена информация за пратка");
  assert.equal(await mw.lookup("sk", 1), null, "unknown store");
});

test("stillOpen: skip orders confirmed or shipped by the team", async () => {
  assert.equal(await middleware({ env, fetchImpl: fake(order({})).f }).stillOpen({ site: "bg", orderNo: 1 }), true);
  assert.equal(await middleware({ env, fetchImpl: fake(order({ is_confirmed: "yes" })).f }).stillOpen({ site: "bg", orderNo: 1 }), false);
  assert.equal(await middleware({ env, fetchImpl: fake(order({ status_key: "shipped" })).f }).stillOpen({ site: "bg", orderNo: 1 }), false);
  assert.equal(await middleware({ env, fetchImpl: fake({ data: [] }).f }).stillOpen({ site: "bg", orderNo: 1 }), true, "not synced yet");
  const broken = middleware({ env, fetchImpl: async () => new Response("x", { status: 500 }) });
  assert.equal(await broken.stillOpen({ site: "bg", orderNo: 1 }), true, "Middleware down never blocks calls");
  assert.equal(middleware({ env: () => "" }).enabled, false);
});

test("find_order tells the real courier status from Middleware", async () => {
  const cb = { async searchByPhone() { return [{ site: "bg", orderNo: 1732, dateText: "17 ноември", itemsText: "Гел", total: 20.4, status: "pending" }]; } };
  const mw = middleware({ env, fetchImpl: fake(order({ status_key: "shipped", fulfillment: { shipping: { name: "Speedy" }, waybill_status_label: "В офис" } })).f });
  const r = await findOrders(cb, "0888123456", mw);
  assert.equal(r.orders[0].status, "изпратена е");
  assert.equal(r.orders[0].courier, "Speedy");
  assert.equal(r.orders[0].courier_status, "В офис");
  const r2 = await findOrders(cb, "0888123456");
  assert.equal(r2.orders[0].status, "приета е и още не е изпратена");
});

test("findOrder: exact shop number, archived orders first, same filters as Middleware's own list", async () => {
  const seen = [];
  const f = async (url) => {
    seen.push(new URL(url));
    const archived = new URL(url).searchParams.get("filter[is_archived]") === "1";
    // The search matches other numbers too (a phone with 981 in it).
    const data = archived ? [{ id: "x", label: "1981", status_key: "cancelled" }, { id: "m981", label: "981", status_key: "completed", external_id: 4242, ordered_at: "2026-07-31T15:57:01Z" }] : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  const mw = middleware({ env, fetchImpl: f });
  const o = await mw.findOrder("bg", 981);
  assert.equal(o.id, "m981");
  assert.equal(o.externalId, 4242);
  assert.equal(o.statusText, "доставена е");
  assert.equal(seen[0].searchParams.get("filter[is_archived]"), "1");
  assert.equal(seen[0].searchParams.get("filter[store.id]"), "store-bg");
  assert.equal(seen[0].searchParams.get("filter[query]"), "981");
  assert.equal(await mw.findOrder("bg", 77), null);
  assert.equal(seen.at(-1).searchParams.get("filter[is_archived]"), "0", "then the active ones");
});
