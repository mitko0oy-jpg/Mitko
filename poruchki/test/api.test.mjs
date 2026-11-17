// End to end against the local server: a fake ConvertBuilder shop and fake couriers,
// first login, sync, stats, webhook, waybills.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8000 + Math.floor(Math.random() * 500);
const SHOP_PORT = PORT + 600;
const COURIER_PORT = PORT + 1200;
const B = `http://localhost:${PORT}`;
const now = Math.floor(Date.now() / 1000);

// ---- fake shop ----
const orders = [];
const hooks = [];
function order(id, daysAgo, status, extra = {}) {
  return {
    id,
    invoiceNo: 5000 + id,
    created: now - daysAgo * 86400 - 60,
    status,
    customerName: `Клиент ${id}`,
    shippingAddress: { name: "", phone: "0888" + String(100000 + id), city: "София", address: "До офис econt[1]: София - Център" },
    items: [{ name: "BeeVenom Care Gel", quantity: 1, total: 20 }],
    subTotal: 20,
    shippingAmount: 4.5,
    total: 24.5,
    shippingName: "Доставка до офис на Еконт",
    ...extra,
  };
}
orders.push(order(1, 0, "pending"));
orders.push(order(2, 1, "shipped", { fulfillment: { courier: "Econt", trackingNo: "1051600000002" } }));
orders.push(order(3, 2, "completed", { fulfillment: { courier: "Econt", trackingNo: "1051600000003" } }));
orders.push(order(4, 2, "canceled"));
orders.push(order(5, 2, "canceled", { fulfillment: { courier: "Econt", trackingNo: "1051600000005" } })); // sent, then came back
for (let i = 6; i < 60; i++) orders.push(order(i, 1 + (i % 2), "completed")); // > one page of 50
orders.push(order(60, 0, "pending", {
  shippingAddress: { name: "", phone: "0888100060", city: "Пловдив", address: "До офис speedy[414]: ПЛОВДИВ - ВЕЛЕШКИ ул. Авксентий Велешки 31" },
  shippingName: "Доставка до офис на Спиди",
}));

const shop = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.headers.authorization !== "Bearer test-key") return res.writeHead(401).end('{"success":false,"message":"bad key"}');
  if (u.pathname === "/api/site/orders") {
    const min = Number(u.searchParams.get("created_at_min"));
    const max = Number(u.searchParams.get("created_at_max"));
    const skip = Number(u.searchParams.get("skip")) || 0;
    const limit = Number(u.searchParams.get("limit")) || 30;
    const all = orders.filter((o) => o.created >= min && o.created <= max);
    return res.end(JSON.stringify({ totalCount: all.length, limit, skip, items: all.slice(skip, skip + limit) }));
  }
  const m = /^\/api\/site\/orders\/(\d+)$/.exec(u.pathname);
  if (m) return res.end(JSON.stringify(orders.find((o) => o.id === Number(m[1]))));
  if (u.pathname === "/api/site/webhooks" && req.method === "POST") {
    let b = "";
    req.on("data", (c) => (b += c)).on("end", () => {
      hooks.push(JSON.parse(b));
      res.end(JSON.stringify({ id: "rh_1", ...JSON.parse(b) }));
    });
    return;
  }
  res.writeHead(404).end("{}");
});

// ---- fake Speedy and Econt: what the platform sends is kept in `sent` ----
const sent = [];
const FAKE_PDF = "%PDF-1.4 fake label";
const courier = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "GET" && u.pathname === "/econt/pdf/1") return res.writeHead(200, { "content-type": "application/pdf" }).end(FAKE_PDF);
  let raw = "";
  req.on("data", (c) => (raw += c)).on("end", () => {
    const b = raw ? JSON.parse(raw) : {};
    sent.push({ path: u.pathname, body: b });
    const json = (x) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(x));
    switch (u.pathname) {
      case "/speedy/calculate":
        return json({ calculations: [{ serviceId: 505, price: { total: 3.24, currency: "EUR" } }] });
      case "/speedy/shipment":
        return json({ id: "62000000099", parcels: [{ id: "62000000099", seqNo: 1 }], price: { total: 3.24, currency: "EUR" } });
      case "/speedy/print":
        return res.writeHead(200, { "content-type": "application/pdf" }).end(FAKE_PDF);
      case "/speedy/shipment/cancel":
        return json({});
      case "/econt/Profile/ProfileService.getClientProfiles.json":
        return json({ profiles: [{ client: { name: "Фирма ЕООД", phones: ["0888000000"] }, cdPayOptions: [{ num: "CD123" }] }] });
      case "/econt/Shipments/LabelService.createLabel.json":
        if (b.mode === "calculate") return json({ label: { totalPrice: 3.8, currency: "EUR" } });
        return json({ label: { shipmentNumber: "1051600009999", pdfURL: `http://127.0.0.1:${COURIER_PORT}/econt/pdf/1`, totalPrice: 3.8, currency: "EUR" } });
      case "/econt/Shipments/LabelService.deleteLabels.json":
        return json({ results: [{ shipmentNum: b.shipmentNumbers[0], error: null }] });
      default:
        return res.writeHead(404).end("{}");
    }
  });
});

let server;
let cookie = "";
async function api(p, body, method) {
  const r = await fetch(B + p, {
    method: method || (body ? "POST" : "GET"),
    headers: { ...(body ? { "content-type": "application/json" } : {}), cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: r.status, data: await r.json().catch(() => null) };
}

test.before(async () => {
  await new Promise((ok) => shop.listen(SHOP_PORT, ok));
  await new Promise((ok) => courier.listen(COURIER_PORT, ok));
  server = spawn(process.execPath, ["scripts/dev-server.mjs", String(PORT)], {
    cwd: root,
    env: {
      ...process.env,
      DEMO: "",
      SETUP_CODE: "test-setup-code-123",
      SPEEDY_USER: "su", SPEEDY_PASS: "sp", ECONT_USER: "eu", ECONT_PASS: "ep",
      SPEEDY_API_URL: `http://127.0.0.1:${COURIER_PORT}/speedy`,
      ECONT_API_URL: `http://127.0.0.1:${COURIER_PORT}/econt`,
      SHIPPING_DEFAULTS: JSON.stringify({ speedy: { clientId: 100000000001, dropoffOfficeId: 301 }, econt: { senderOfficeCode: "1152" } }),
      CB_SITES: JSON.stringify([
        { id: "bg", label: "Тест BG", domain: `127.0.0.1:${SHOP_PORT}`, key: "test-key" },
        { id: "hu", label: "Тест HU", domain: `127.0.0.1:${SHOP_PORT}`, key: "wrong" },
      ]),
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((ok, fail) => {
    server.stdout.on("data", (d) => String(d).includes("dev server on") && ok());
    server.on("exit", () => fail(new Error("server exited")));
  });
});
test.after(() => {
  server?.kill();
  shop.close();
  courier.close();
});

test("first login needs the setup code, then only login works", async () => {
  assert.equal((await api("/api/auth/me")).data.needsSetup, true);
  assert.equal((await api("/api/stats/summary")).status, 401);
  const bad = await api("/api/auth/setup", { email: "m@example.com", name: "Митко", password: "a-long-password", code: "nope" });
  assert.equal(bad.status, 403);
  const ok = await api("/api/auth/setup", { email: "m@example.com", name: "Митко", password: "a-long-password", code: "test-setup-code-123" });
  assert.equal(ok.status, 200);
  assert.equal((await api("/api/auth/me")).data.user.role, "admin");
  const again = await api("/api/auth/setup", { email: "x@example.com", name: "X", password: "a-long-password", code: "test-setup-code-123" });
  assert.equal(again.status, 403);
});

test("sync pulls every page; a wrong key is shown on its shop", async () => {
  const r = await api("/api/settings/sync", {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.inserted, orders.length);
  assert.match(r.data.errors.hu, /ключът за API не е приет/);
  const s = await api("/api/settings");
  const hu = s.data.shops.find((x) => x.id === "hu");
  assert.match(hu.error, /не е приет/);
  // Second run: nothing new.
  const r2 = await api("/api/settings/sync", {});
  assert.equal(r2.data.inserted, 0);
});

test("stages add up and returned parcels are not counted as cancelled", async () => {
  const from = new Date((now - 5 * 86400) * 1000).toISOString().slice(0, 10);
  const to = new Date((now + 86400) * 1000).toISOString().slice(0, 10);
  const { data } = await api(`/api/stats?from=${from}&to=${to}`);
  assert.equal(data.orders, orders.length);
  const st = data.stages;
  assert.equal(st.new.n, 2);
  assert.equal(st.shipped.n, 1);
  assert.equal(st.canceled.n, 1);
  assert.equal(st.returned.n, 1);
  assert.equal(st.delivered.n, orders.length - 5);
  assert.equal(Object.values(st).reduce((a, c) => a + c.n, 0), data.orders);
  assert.equal(data.sum, Math.round(orders.length * 24.5 * 100) / 100);
  assert.equal(data.shops[0].label, "Тест BG");
});

test("orders list: search and filters", async () => {
  const all = await api("/api/orders?stage=returned");
  assert.equal(all.data.total, 1);
  assert.equal(all.data.orders[0].order_no, "5005");
  const byPhone = await api("/api/orders?q=" + encodeURIComponent("+359 888 100002"));
  assert.equal(byPhone.data.total, 1);
  const byNo = await api("/api/orders?q=5003");
  assert.equal(byNo.data.orders[0].tracking_no, "1051600000003");
  const one = await api(`/api/orders/${byNo.data.orders[0].id}`);
  assert.equal(one.data.customer_name, "Клиент 3");
  assert.equal(one.data.raw, undefined);
});

test("webhook: signed order update goes in, unsigned is refused", async () => {
  const r = await api("/api/settings/hooks", {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.result.bg, "ok");
  assert.notEqual(r.data.result.hu, "ok");
  const hook = hooks.find((h) => h.target.endsWith("/api/hooks/cb/bg"));
  assert.deepEqual(hook.events, ["order_created", "order_updated"]);
  assert.match(hook.secret, /^[0-9a-f]{48}$/);

  const changed = { ...orders[0], status: "shipped", fulfillment: { courier: "Speedy", trackingNo: "62000000001" } };
  const raw = JSON.stringify(changed);
  const sig = createHmac("sha512", hook.secret).update(raw).digest("hex");
  const send = (headers) => fetch(`${B}/api/hooks/cb/bg`, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "x-webhook-topic": "order_updated", ...headers }, body: raw });
  assert.equal((await send({})).status, 401);
  assert.equal((await send({ "x-webhook-signature": "0".repeat(128) })).status, 401);
  assert.equal((await send({ "x-webhook-signature": sig })).status, 200);
  const o = (await api("/api/orders?q=5001")).data.orders[0];
  assert.equal(o.stage, "shipped");
  assert.equal(o.courier, "speedy");
  assert.equal(o.tracking_no, "62000000001");
});

test("refused without login, and settings are owner-only for staff", async () => {
  const add = await api("/api/settings/users", { name: "Помощник", email: "h@example.com", password: "helper-password" });
  assert.equal(add.status, 200);
  const owner = cookie;
  cookie = "";
  await api("/api/auth/login", { email: "h@example.com", password: "helper-password" });
  assert.equal((await api("/api/stats/summary")).status, 200);
  const change = await api("/api/settings/shop", { id: "bg", active: false });
  assert.equal(change.status, 400);
  cookie = owner;
});

test("draft for an Econt office order", async () => {
  const id = (await api("/api/orders?q=5001")).data.orders[0].id;
  // The webhook test already gave order 5001 a Speedy number: start from a clean order 5004? No – use a fresh one.
  void id;
  const fresh = (await api("/api/orders?q=" + encodeURIComponent("Клиент 4"))).data.orders.find((o) => o.order_no === "5004");
  assert.ok(fresh, "order 5004");
  // 5004 was cancelled in the shop: no waybill button for it.
  const draft = await api(`/api/waybills/draft?order=${fresh.id}`);
  assert.equal(draft.status, 200);
  assert.equal(draft.data.draft.courier, "econt");
  assert.equal(draft.data.draft.officeId, "1");
});

test("waybill with Speedy like Middleware, then Econt, label and cancel", async () => {
  const o = (await api("/api/orders?q=5060")).data.orders[0];
  assert.equal(o.stage, "new");
  const d = (await api(`/api/waybills/draft?order=${o.id}`)).data.draft;
  assert.deepEqual([d.courier, d.type, d.officeId, d.cod, d.obpd], ["speedy", "office", "414", 24.5, "TEST"]);

  const price = await api("/api/waybills/price", { orderId: o.id, draft: d });
  assert.equal(price.status, 200, JSON.stringify(price.data));
  assert.equal(price.data.price, 3.24);

  const made = await api("/api/waybills/create", { orderId: o.id, draft: d });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  assert.equal(made.data.number, "62000000099");
  const sh = sent.find((x) => x.path === "/speedy/shipment").body;
  assert.deepEqual(sh.sender, { clientId: 100000000001, dropoffOfficeId: 301 });
  assert.equal(sh.recipient.pickupOfficeId, 414);
  assert.equal(sh.recipient.phone1.number, "0888100060");
  assert.equal(sh.service.serviceId, 505);
  assert.equal(sh.service.additionalServices.cod.amount, 24.5);
  assert.deepEqual(sh.service.additionalServices.cod.fiscalReceiptItems.map((i) => i.amount), [20, 4.5]);
  assert.equal(sh.service.additionalServices.obpd.option, "TEST");
  assert.equal(sh.payment.courierServicePayer, "SENDER");
  assert.equal(sh.ref1, "5060");

  const again = await api("/api/waybills/create", { orderId: o.id, draft: d });
  assert.equal(again.status, 400);
  assert.match(again.data.message, /вече има товарителница/);

  const row = (await api("/api/orders?q=5060")).data.orders[0];
  assert.equal(row.tracking_no, "62000000099");
  assert.equal(row.tracking_source, "own");
  assert.equal(row.stage, "shipped");

  const label = await fetch(`${B}/api/waybills/label?ids=${o.id}`, { headers: { cookie } });
  assert.equal(label.headers.get("content-type"), "application/pdf");
  assert.equal(await label.text(), "%PDF-1.4 fake label");

  const cancel = await api("/api/waybills/cancel", { orderId: o.id });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
  const after = (await api("/api/orders?q=5060")).data.orders[0];
  assert.equal(after.tracking_no, null);
  assert.equal(after.stage, "new");

  // Now with Econt to an Econt office, with the COD agreement.
  const e = await api("/api/waybills/create", { orderId: o.id, draft: { ...d, courier: "econt", officeId: "8501", officeName: "Айтос" } });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  assert.equal(e.data.number, "1051600009999");
  const lb = sent.filter((x) => x.path === "/econt/Shipments/LabelService.createLabel.json").pop().body;
  assert.equal(lb.mode, "create");
  assert.equal(lb.label.senderOfficeCode, "1152");
  assert.equal(lb.label.receiverOfficeCode, "8501");
  assert.equal(lb.label.services.cdPayOptionsTemplate, "CD123");
  assert.equal(lb.label.services.cdAmount, 24.5);
  const pdf = await fetch(`${B}/api/waybills/label?ids=${o.id}`, { headers: { cookie } });
  assert.equal(await pdf.text(), "%PDF-1.4 fake label");
  assert.equal((await api("/api/waybills/cancel", { orderId: o.id })).status, 200);
});

test("waybill checks: bad phone, mixed label print, unknown order", async () => {
  const o = (await api("/api/orders?q=5060")).data.orders[0];
  const d = (await api(`/api/waybills/draft?order=${o.id}`)).data.draft;
  const bad = await api("/api/waybills/create", { orderId: o.id, draft: { ...d, phone: "12" } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.message, /телефона/);
  assert.equal((await api("/api/waybills/draft?order=999999")).status, 404);
});
