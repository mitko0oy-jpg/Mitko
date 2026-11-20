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
orders.push(order(3, 2, "completed", {
  fulfillment: { courier: "Econt", trackingNo: "1051600000003" },
  items: [{ name: "BeeVenom Care Gel", quantity: 1, total: 20, sku: "BV-GEL", weight: 0.25, images: ["https://cdn.example.com/gel.jpg"], variation: [{ name: "Размер", value: "50 мл" }] }],
  discountCode: "ESEN10",
}));
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
  if (u.pathname === "/api/site/products") {
    const items = [
      { id: 900, title: "Спрей с пчелна отрова", variants: [{ price: 12.9, sku: "SP1" }] },
      { id: 901, title: "Крем", variants: [{ options: [{ name: "Брой", value: "3+2" }], price: 39.9, onSale: true, salePrice: 29.9 }] },
    ];
    return res.end(JSON.stringify({ totalCount: items.length, limit: 50, skip: 0, items }));
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
    let b = {};
    try {
      b = raw ? JSON.parse(raw) : {};
    } catch {
      b = {};
    }
    sent.push({ path: u.pathname, body: b });
    const json = (x) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(x));
    switch (u.pathname) {
      case "/email/account":
        return req.headers["api-key"] === "brevo-key-123" ? json({ email: "owner@example.com" }) : res.writeHead(401, { "content-type": "application/json" }).end('{"message":"Key not found"}');
      case "/email/smtp/email":
        if (req.headers["api-key"] !== "brevo-key-123") return res.writeHead(401).end("{}");
        return json({ messageId: "<m1@brevo>" });
      case "/speedy/shipment/info":
        return json({ shipments: (b.shipmentIds || []).map((id) => ({ id, price: { amount: 3.17, vat: 0.63, total: 3.8, currency: "EUR" } })) });
      case "/econt/Shipments/ShipmentService.getShipmentStatuses.json":
        return json({ shipmentStatuses: (b.shipmentNumbers || []).map((n) => ({ status: { shipmentNumber: n, shortDeliveryStatus: "Доставена", shortDeliveryStatusEn: "Delivered", trackingEvents: [], totalPrice: 3.24, currency: "EUR" } })) });
      case "/speedy/client/contract":
        return json({ clients: [{ clientId: 100000000001, clientName: "БИ ВЕНОМ ЕООД", objectName: "Склад", address: { fullAddressString: "Пловдив, ул. Тест 1" } }] });
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
      case "/sms/sms.do": {
        const form = new URLSearchParams(raw);
        sent.push({ path: "sms", body: Object.fromEntries(form) });
        return json({ count: 1, list: [{ id: "77", points: 0.054, number: form.get("to"), status: "QUEUE", parts: 1 }] });
      }
      case "/nek/api/v1/api-keys/current/usage":
        if (req.headers["api-key"] !== "nek-key-12345") return res.writeHead(401, { "content-type": "application/json" }).end('{"message":"bad key"}');
        return json({ items: { plan: { name: "Безплатен" }, apiRequests: { used: 1, limit: 10, period: "minute" }, searchRequests: { used: 2, limit: 30, period: "day" } } });
      case "/nek/api/v1/reports":
        if (req.headers["api-key"] !== "nek-key-12345") return res.writeHead(401).end("{}");
        if (req.method === "POST") return json({ message: "Сигналът е изпратен успешно.", details: { id: 555 } });
        if (u.searchParams.get("phone") === "359888100004")
          return json({ items: [
            { id: 1, firstName: "К***", lastName: "4", phone: "+359888100004", text: "Не взе пратката", city: { name: "София" }, createDate: "2026-10-01T10:15:00+03:00" },
            { id: 2, text: "Отказа на място", createDate: "2026-09-01T10:15:00+03:00" },
          ], count: 2 });
        return json({ items: [], count: 0 });
      case "/econt/Nomenclatures/NomenclaturesService.getOffices.json":
        return json({ offices: [
          { code: "1234", name: "София Осогово", address: { fullAddress: "гр. София, ул. Осогово 2", city: { name: "София" } }, isAPS: false },
          { code: "5678", name: "София Център", address: { fullAddress: "гр. София, бул. Витоша 1", city: { name: "София" } }, isAPS: false },
          { code: "9012", name: "Пловдив Тракия", address: { fullAddress: "гр. Пловдив, ул. София 3", city: { name: "Пловдив" } }, isAPS: false },
        ] });
      case "/econt/Shipments/LabelService.deleteLabels.json":
        return json({ results: [{ shipmentNum: b.shipmentNumbers[0], error: null }] });
      default:
        return res.writeHead(404).end("{}");
    }
  });
});

let server;
let dbUrl = "";
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
      AGENT_TOKEN: "agent-token-agent-token-agent-token-0000",
      SMSAPI_TOKEN: "sms-token", SMSAPI_URL: `http://127.0.0.1:${COURIER_PORT}/sms`,
      EMAIL_API_URL: `http://127.0.0.1:${COURIER_PORT}/email`, REMINDER_HOURS: "0-24", PRINT_DB: "1",
      NEKOREKTEN_URL: `http://127.0.0.1:${COURIER_PORT}/nek`, NEKOREKTEN_KEY: "",
      SHIPPING_DEFAULTS: JSON.stringify({ speedy: { clientId: 100000000001, dropoffOfficeId: 301 }, econt: { senderOfficeCode: "1152" } }),
      CB_SITES: JSON.stringify([
        { id: "bg", label: "Тест BG", domain: `127.0.0.1:${SHOP_PORT}`, key: "test-key" },
        { id: "hu", label: "Тест HU", domain: `127.0.0.1:${SHOP_PORT}`, key: "wrong" },
      ]),
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((ok, fail) => {
    server.stdout.on("data", (d) => {
      const m = /db (postgres\S+)/.exec(String(d));
      if (m) dbUrl = m[1];
      if (String(d).includes("dev server on")) ok();
    });
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
  assert.equal(row.stage, "prepared"); // "Изготвена" until the courier takes it

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

test("correct an order: shipping and an added product; a re-sync keeps it; reset brings the shop back", async () => {
  const o = (await api("/api/orders?q=5060")).data.orders[0];
  const products = await api("/api/products?shop=bg&q=спрей");
  assert.equal(products.status, 200);
  const spray = products.data.products.find((p) => p.name === "Спрей с пчелна отрова");
  assert.equal(spray.price, 12.9);
  const all = (await api("/api/products?shop=bg&q=")).data.products.map((p) => `${p.name} ${p.price}`);
  assert.ok(all.includes("Крем – 3+2 29.9"), all.join(", "));

  const r = await api(`/api/orders/${o.id}/edit`, { items: [{ name: "BeeVenom Care Gel", qty: 1, price: 20 }, { name: spray.name, qty: 1, price: spray.price }], shipping: 0 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.total, 32.9);
  assert.equal(r.data.order.total, 32.9);
  assert.equal(r.data.order.cb_total, 24.5);
  assert.match(r.data.order.events.at(-1).text, /добавен „Спрей с пчелна отрова“.*доставка 4,50 € → 0,00 €.*общо 24,50 € → 32,90 €/);

  // The next pull from the shop does not undo the correction.
  await api("/api/settings/sync", {});
  const again = await api(`/api/orders/${o.id}`);
  assert.equal(again.data.total, 32.9);
  assert.equal(again.data.items.length, 2);
  // The waybill window takes the corrected amount for cash on delivery.
  assert.equal((await api(`/api/waybills/draft?order=${o.id}`)).data.draft.cod, 32.9);

  const back = await api(`/api/orders/${o.id}/reset`, {});
  assert.equal(back.data.order.total, 24.5);
  assert.equal(back.data.order.edit, null);
  assert.match(back.data.order.events.at(-1).text, /Върнати са сумите от магазина/);
});

test("SMS: templates filled for the order, sent through SMSAPI, kept in the history", async () => {
  const o = (await api("/api/orders?q=5060")).data.orders[0];
  const d = await api(`/api/sms/draft?order=${o.id}`);
  assert.equal(d.status, 200);
  assert.equal(d.data.configured, true);
  assert.match(d.data.filled.confirm, /Поръчка № 5060 от Тест за 24,50 €/);
  const s = await api("/api/sms/send", { orderId: o.id, text: d.data.filled.confirm, latin: true });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const msg = sent.filter((x) => x.path === "sms").pop().body;
  assert.equal(msg.to, "359888100060");
  assert.match(msg.message, /^Zdraveyte, Klient! Porachka No 5060/);
  assert.equal(msg.format, "json");
  const ev = (await api(`/api/orders/${o.id}`)).data.events.at(-1);
  assert.equal(ev.kind, "sms");
  assert.match(ev.text, /^SMS до 0888100060: Zdraveyte/);
});

const AGENT = "agent-token-agent-token-agent-token-0000";
async function agent(p, body) {
  const r = await fetch(B + "/api/agent/" + p, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${AGENT}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

test("confirm by hand, notes, AI call request, archive", async () => {
  const o = (await api("/api/orders?q=5060")).data.orders[0];
  assert.equal(o.confirmed_at, null);
  const ai = await api(`/api/orders/${o.id}/ai-call`, {});
  assert.equal(ai.data.call.state, "requested");
  const n = await api(`/api/orders/${o.id}/note`, { text: "Да се провери адресът" });
  assert.equal(n.data.note, "Да се провери адресът");
  const c = await api(`/api/orders/${o.id}/confirm`, {});
  assert.equal(c.data.confirmed_by, "Митко");
  assert.equal((await api("/api/orders?confirmed=us&q=5060")).data.total, 1);
  assert.equal((await api("/api/orders?confirmed=ai&q=5060")).data.total, 0);
  await api(`/api/orders/${o.id}/unconfirm`, {});
  await api(`/api/orders/${o.id}/archive`, {});
  assert.equal((await api("/api/orders?q=5060")).data.total, 0);
  assert.equal((await api("/api/orders?q=5060&archived=1")).data.total, 1);
  await api(`/api/orders/${o.id}/unarchive`, {});
  await api(`/api/waybills/settings`, { automation: { autoWaybill: true } });
});

test("contact correction survives the shop sync; new and duplicated orders", async () => {
  const o = (await api("/api/orders?q=5059")).data.orders[0];
  const r = await api(`/api/orders/${o.id}/contact`, { name: "Нова Клиентка", phone: "0888999888", delivery: { courier: "speedy", type: "office", officeId: "414", officeName: "Пловдив – Велешки" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await api("/api/settings/sync", {});
  const after = (await api(`/api/orders/${o.id}`)).data;
  assert.equal(after.customer_name, "Нова Клиентка");
  assert.equal(after.delivery.officeId, "414");
  assert.match(after.events.at(-1).text, /Променени данни: име: Нова Клиентка; телефон: 0888999888; доставка: До офис Спиди № 414/);

  const made = await api("/api/orders", { shop: "bg", name: "Иван Иванов", phone: "0899123123", delivery: { courier: "econt", type: "office", officeId: "8501", officeName: "Айтос" }, items: [{ name: "Спрей", qty: 2, price: 12.9 }], shipping: 4.5, note: "по телефона" });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  assert.match(made.data.order_no, /^T\d+$/);
  assert.equal(made.data.total, 30.3);
  const mo = (await api(`/api/orders/${made.data.id}`)).data;
  assert.equal(mo.source, "manual");
  assert.equal(mo.confirmed_by, "Митко");
  assert.equal(mo.note, "по телефона");
  await api("/api/settings/sync", {}); // the shop sync leaves it alone
  assert.equal((await api(`/api/orders/${made.data.id}`)).data.total, 30.3);

  const dup = await api(`/api/orders/${made.data.id}/duplicate`, {});
  assert.equal(dup.status, 200, JSON.stringify(dup.data));
  const d2 = (await api(`/api/orders/${dup.data.id}`)).data;
  assert.equal(d2.total, 30.3);
  assert.equal(d2.confirmed_at, null);
  assert.equal(d2.delivery.officeId, "8501");
});

test("phone agent: refused without the token; orders to call; no answer is written down", async () => {
  assert.equal((await fetch(B + "/api/agent/orders?shops=bg")).status, 403);
  const list = await agent(`orders?shops=bg&since=${new Date(Date.now() - 3 * 86400000).toISOString()}`);
  assert.equal(list.status, 200);
  const o = list.data.orders.find((x) => x.orderNo === "5060");
  assert.ok(o, JSON.stringify(list.data.orders.map((x) => x.orderNo)));
  assert.equal(o.stillToCall, true);
  assert.ok(o.items[0].price > 0);
  assert.match(o.deliveryText, /до офис на Спиди/);
  // Orders of other shops come only when someone asked for an AI call.
  const other = (await agent(`orders?shops=sk&since=${new Date(Date.now() - 86400000).toISOString()}`)).data.orders;
  assert.deepEqual(other.map((x) => [x.orderNo, x.requested]), [["5060", true]]); // 5060 was sent for AI confirmation above

  await agent(`orders/${o.id}/calling`, { attempt: 1 });
  const next = new Date(Date.now() + 3600000).toISOString();
  const r = await agent(`orders/${o.id}/result`, { outcome: "voicemail", attempt: 1, next_at: next });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = (await api(`/api/orders/${o.id}`)).data;
  assert.match(d.note, /^☎ AI звъня \(опит 1\) – не вдигна, ще опита пак (утре )?около \d\d:\d\d$/);
  assert.equal(d.call.state, "voicemail");
  assert.equal(d.confirmed_at, null);
});

test("phone agent confirms with an extra box: correction, note, waybill made and waiting for print", async () => {
  const o = (await agent("by-phone?phone=0888100060")).data.orders.find((x) => x.orderNo === "5060");
  const r = await agent(`orders/${o.id}/result`, {
    outcome: "confirmed",
    attempt: 2,
    summary: "Потвърди и добави една кутия пластири.",
    upsell: "one_box",
    edit: { items: [...o.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price / i.qty })), { name: "Билкови пластири 12 бр.", qty: 1, price: 4.9 }], shipping: o.shipping },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.waybill.courier, "speedy");
  const d = (await api(`/api/orders/${o.id}`)).data;
  assert.equal(d.confirmed_by, "AI агент");
  assert.equal(d.total, 29.4);
  assert.match(d.note, /^AI потвърди по телефона\. Корекция: добавен „Билкови пластири 12 бр\.“/);
  assert.equal(d.tracking_source, "own");
  assert.equal(d.stage, "prepared");
  assert.equal((await api("/api/orders?confirmed=ai&q=5060")).data.total, 1);
  // The COD of the automatic waybill is the corrected total.
  const sh = sent.filter((x) => x.path === "/speedy/shipment").pop().body;
  assert.equal(sh.service.additionalServices.cod.amount, 29.4);

  const queue = (await api("/api/waybills/queue")).data.queue;
  assert.ok(queue.some((x) => x.id === o.id));
  await fetch(`${B}/api/waybills/label?ids=${o.id}`, { headers: { cookie } });
  assert.ok(!(await api("/api/waybills/queue")).data.queue.some((x) => x.id === o.id));
  await api("/api/waybills/cancel", { orderId: o.id });
});

test("phone agent: a delivery change stops the automatic waybill; an order taken by phone", async () => {
  const o = (await api("/api/orders?q=5059")).data.orders[0];
  await api(`/api/orders/${o.id}/unconfirm`, {});
  const r = await agent(`orders/${o.id}/result`, { outcome: "confirmed", delivery_change: "иска до адрес в Пловдив, ул. Шипка 5" });
  assert.equal(r.data.waybill, undefined);
  const d = (await api(`/api/orders/${o.id}`)).data;
  assert.match(d.note, /⚠ Провери: иска друга доставка: иска до адрес в Пловдив/);
  assert.equal(d.tracking_no, null);

  const made = await agent("orders", { shop: "bg", name: "Петър Петров", phone: "0877111222", delivery: { courier: "speedy", type: "office", officeId: "414" }, items: [{ name: "Крем", qty: 1, price: 29.9 }], shipping: 4.5, note: "Поръчка по телефона" });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const p = (await api(`/api/orders/${made.data.id}`)).data;
  assert.equal(p.source, "phone");
  assert.equal(p.confirmed_by, "AI агент");
  assert.equal(made.data.waybill.courier, "speedy");
});

test("unfinished orders: taken only from the shops' sites, merged per visit, matched to a later order", async () => {
  const send = (body, origin = `http://127.0.0.1:${SHOP_PORT}`) =>
    fetch(`${B}/api/collect`, { method: "POST", headers: { "Content-Type": "text/plain", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await send({ sid: "visit000001", phone: "0888555111" }, "https://evil.example")).status, 403);
  assert.equal((await send({ sid: "visit000001", phone: "0888555111" }, null)).status, 403);
  // No phone yet: nothing kept.
  assert.equal((await send({ sid: "visit000001", name: "Мария" })).status, 204);
  assert.equal((await send({ sid: "visit000001", name: "Мария Иванова", phone: "0888 555 111", cart: ["BeeVenom Care Gel · 1 · 20,00 €"], total: "24,50 €" })).status, 204);
  // A later post of the same visit fills the city and keeps what was typed before.
  await send({ sid: "visit000001", name: "", phone: "0888555111", city: "Плевен <b>", cart: [] });
  // Someone who ordered afterwards (order 1 has this phone).
  await send({ sid: "visit000002", name: "Клиент 1", phone: "0888100001" });

  const open = (await api("/api/leads?tab=open")).data;
  const l = open.leads.find((x) => x.phone === "0888555111");
  assert.ok(l, JSON.stringify(open));
  assert.equal(l.name, "Мария Иванова");
  assert.equal(l.city, "Плевен b");
  assert.deepEqual(l.cart, ["BeeVenom Care Gel · 1 · 20,00 €"]);
  assert.equal(l.shop, "bg");
  assert.equal(l.typing, true);
  const ordered = (await api("/api/leads?tab=ordered")).data;
  assert.equal(ordered.leads.find((x) => x.phone === "0888100001")?.order_no, "5001");
  assert.equal(open.counts.open, 1);

  assert.equal((await api(`/api/leads/${l.id}`, { action: "dismiss" })).status, 200);
  assert.equal((await api("/api/leads?tab=hidden")).data.leads[0].id, l.id);
  assert.equal((await api("/api/leads?tab=open")).data.counts.open, 0);
  // Not for visitors.
  assert.equal((await fetch(`${B}/api/leads`)).status, 401);

  // A returning visitor (data remembered by the script from an earlier visit, nothing typed now).
  assert.equal((await send({ sid: "visit000003", name: "Иван Петров", phone: "0888 777 222", city: "Русе", cart: ["Спрей · 1 · 12,90 €"], known: true })).status, 204);
  let back = (await api("/api/leads?tab=open")).data.leads.find((x) => x.phone === "0888 777 222");
  assert.equal(back.known, true);
  assert.equal(back.name, "Иван Петров");
  // ...who then types: an ordinary unfinished order.
  await send({ sid: "visit000003", name: "Иван Петров", phone: "0888777222" });
  back = (await api("/api/leads?tab=open")).data.leads.find((x) => x.id === back.id);
  assert.equal(back.known, false);
  // Someone who ordered in the last days and only came back to look is not an unfinished order.
  await send({ sid: "visit000004", name: "Клиент 1", phone: "0888100001", known: true });
  assert.equal((await api("/api/leads?tab=all")).data.leads.filter((x) => x.phone === "0888100001").length, 1);
});

test("filters like Middleware: sorting, product, sent today, saved filters", async () => {
  const newest = (await api("/api/orders?tab=")).data;
  const oldest = (await api("/api/orders?tab=&sort=old")).data;
  assert.equal(oldest.total, newest.total);
  assert.ok(new Date(oldest.orders[0].ordered_at) <= new Date(oldest.orders.at(-1).ordered_at));
  assert.ok(new Date(newest.orders[0].ordered_at) >= new Date(newest.orders.at(-1).ordered_at));
  const gel = newest.facets.products.find((p) => p.name === "BeeVenom Care Gel");
  assert.ok(gel && gel.n > 0, JSON.stringify(newest.facets.products));
  const byProduct = (await api(`/api/orders?tab=&product=${encodeURIComponent("BeeVenom Care Gel")}`)).data;
  assert.equal(byProduct.total, gel.n);
  assert.equal((await api(`/api/orders?tab=&product=${encodeURIComponent("Няма такъв")}`)).data.total, 0);
  // Sent today: every order whose waybill appeared today, and only those.
  const sent = (await api("/api/orders?tab=&sent=today")).data;
  assert.equal(sent.total, newest.facets.sentToday);
  assert.ok(sent.total >= 1);
  assert.ok(sent.orders.every((o) => o.tracking_no));
  assert.equal(typeof newest.facets.abandoned, "number");
  // ☆ saved filters
  assert.deepEqual((await api("/api/orders/saved")).data.saved, []);
  await api("/api/orders/saved", { name: "Спиди без товарителница", query: "?courier=speedy&nowaybill=1" });
  const saved = (await api("/api/orders/saved")).data.saved;
  assert.deepEqual(saved, [{ name: "Спиди без товарителница", query: "courier=speedy&nowaybill=1" }]);
  await api("/api/orders/saved", { name: "Спиди без товарителница", delete: true });
  assert.deepEqual((await api("/api/orders/saved")).data.saved, []);
});

test("bell counts and the Excel export", async () => {
  const a = (await api("/api/stats/alerts")).data;
  for (const k of ["unconfirmed", "ai", "toShip", "leads", "toPrint"]) assert.equal(typeof a[k], "number", k);
  const r = await fetch(`${B}/api/orders/export?tab=&sort=old`, { headers: { cookie } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/csv/);
  assert.match(r.headers.get("content-disposition"), /poruchki-\d{4}-\d{2}-\d{2}\.csv/);
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM: Excel reads it as UTF-8
  const lines = new TextDecoder().decode(bytes).split("\r\n");
  assert.match(lines[0], /^№;Магазин;Поръчана;Клиент;Телефон/);
  assert.equal(lines.length - 1, (await api("/api/orders?tab=")).data.total);
  assert.match(lines[1], /;0888 \d{3} \d{3};/); // phones stay text in Excel
  assert.equal((await fetch(`${B}/api/orders/export`)).status, 401);
});

test("nekorekten.com: key in settings, new phones checked in the sync, marks, report", async () => {
  assert.equal((await api("/api/nekorekten/settings")).data.configured, false);
  assert.equal((await api("/api/nekorekten/check", { orderId: 1 })).status, 400); // no key yet
  assert.equal((await api("/api/nekorekten/settings", { key: "bad" })).status, 400);
  const wrong = (await api("/api/nekorekten/settings", { key: "wrong-key-000", auto: true })).data;
  assert.match(wrong.usage.error, /ключът не е приет/);
  const ok = (await api("/api/nekorekten/settings", { key: "nek-key-12345", auto: true })).data;
  assert.equal(ok.configured, true);
  assert.equal(ok.usage.plan, "Безплатен");
  assert.equal(ok.usage.perDay, 30);

  // 4 phones per run (the free plan allows 5 requests a minute): two runs.
  for (let i = 0; i < 2; i++) assert.equal((await api("/api/settings/sync", {})).status, 200);
  const o = (await api("/api/orders?tab=&q=5004")).data.orders[0];
  assert.equal(o.nek_count, 2);
  const flagged = (await api("/api/orders?tab=&nek=1")).data;
  assert.ok(flagged.orders.every((x) => x.nek_count > 0) && flagged.total >= 1);
  const d = (await api(`/api/orders/${o.id}`)).data;
  assert.equal(d.nekorekten.count, 2);
  assert.equal(d.nekorekten.reports[0].text, "Не взе пратката");
  assert.equal(d.nekorekten.reports[0].city, "София");

  // A clean phone checked by hand.
  const clean = (await api("/api/orders?tab=&q=5001")).data.orders[0];
  const c = (await api("/api/nekorekten/check", { orderId: clean.id })).data;
  assert.equal(c.check.count, 0);

  // Report: text required; goes out with the phone and the name, and is kept in the history.
  assert.equal((await api("/api/nekorekten/report", { orderId: o.id, text: "кратко" })).status, 400);
  const r = (await api("/api/nekorekten/report", { orderId: o.id, text: "Не взе пратката от офиса, поръчка 5004" })).data;
  assert.match(r.message, /успешно/);
  const posted = sent.filter((x) => x.path === "/nek/api/v1/reports" && x.body.text).at(-1).body;
  assert.equal(posted.phone, "359888100004");
  assert.equal(posted.firstName, "Клиент");
  assert.equal(posted.lastName, "4");
  const after = (await api(`/api/orders/${o.id}`)).data;
  assert.ok(after.events.some((e) => e.kind === "nekorekten"));
});

test("phone order: an office said in words is found by city and street; an unknown one waits for a person", async () => {
  const agent = (p, body) =>
    fetch(`${B}/api/agent/${p}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: "Bearer agent-token-agent-token-agent-token-0000", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, data: await r.json() }));
  const offices = (await agent(`offices?courier=econt&city=${encodeURIComponent("София")}&q=${encodeURIComponent("до офиса на Осогово")}`)).data.offices;
  assert.equal(offices[0].id, "1234");
  assert.equal(offices.length, 2); // only Sofia

  const base = { shop: "bg", name: "Димитър Димитров", phone: "0899876063", city: "София", items: [{ name: "Гел", qty: 1, price: 15.9 }], shipping: 4.5 };
  const ok = await agent("orders", { ...base, delivery: { courier: "econt", type: "office", officeName: "София, Офис на Еконт, ул. Осогово" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const o = (await api(`/api/orders/${ok.data.id}`)).data;
  assert.equal(o.delivery.officeId, "1234");
  assert.ok(ok.data.waybill, "the waybill goes out on its own");

  const unknown = await agent("orders", { ...base, delivery: { courier: "econt", type: "office", officeName: "при моста" } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.waybill, null);
  const u = (await api(`/api/orders/${unknown.data.id}`)).data;
  assert.match(u.note, /Избери офиса/);
  assert.ok(!u.events.some((e) => /не се създаде автоматично/.test(e.text)));
  // The waybill window keeps it an office and asks for one.
  const draft = (await api(`/api/waybills/draft?order=${unknown.data.id}`)).data.draft;
  assert.equal(draft.type, "office");
  assert.equal(draft.officeId, "");
});

test("companies: another company sees none of our orders, shops, people or settings", async () => {
  // Only the platform owner creates companies.
  const made = await api("/api/companies", { name: "Друга фирма ЕООД", userName: "Иван", email: "ivan@example.com", password: "ivan-password-1" });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const other = made.data.companies.find((c) => c.name === "Друга фирма ЕООД");
  assert.equal(other.users, 1);
  assert.equal(other.shops, 0);

  // Ivan's own session.
  let ck = "";
  const as = async (p, body) => {
    const r = await fetch(B + p, { method: body ? "POST" : "GET", headers: { ...(body ? { "content-type": "application/json" } : {}), cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get("set-cookie");
    if (set) ck = set.split(";")[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  assert.equal((await as("/api/auth/login", { email: "ivan@example.com", password: "ivan-password-1" })).status, 200);
  const me = (await as("/api/auth/me")).data.user;
  assert.equal(me.company, "Друга фирма ЕООД");
  assert.equal(me.owner, false);

  const ours = (await api("/api/orders?tab=")).data;
  assert.ok(ours.total > 0);
  const theirs = (await as("/api/orders?tab=")).data;
  assert.equal(theirs.total, 0);
  assert.equal(theirs.facets.products.length, 0);
  assert.equal((await as(`/api/orders/${ours.orders[0].id}`)).status, 404);
  assert.equal((await as(`/api/orders/${ours.orders[0].id}/note`, { text: "чужда" })).status, 404);
  assert.equal((await as(`/api/waybills/draft?order=${ours.orders[0].id}`)).status, 404);
  const set = (await as("/api/settings")).data;
  assert.equal(set.shops.length, 0);
  assert.deepEqual(set.users.map((u) => u.email), ["ivan@example.com"]);
  assert.equal(set.couriers.speedy.configured, false, "our Speedy login is not theirs");
  assert.equal((await as("/api/sms/settings")).data.configured, false);
  const alerts = (await as("/api/stats/alerts")).data;
  assert.equal(alerts.unconfirmed + alerts.toShip + alerts.leads + alerts.toPrint, 0);
  assert.equal((await as("/api/leads?tab=all")).data.leads.length, 0);
  assert.equal((await as("/api/companies")).status, 403);
  // A new order needs one of their own shops.
  assert.equal((await as("/api/orders", { shop: "bg", name: "X Y", phone: "0888000000", city: "София", delivery: { courier: "speedy", type: "office", officeId: "1" }, items: [{ name: "a", qty: 1, price: 1 }] })).status, 400);

  // Shops: theirs only; ours cannot be touched.
  assert.equal((await as("/api/shops")).data.shops.length, 0);
  assert.equal((await as("/api/shops/bg", { active: false })).status, 404);
  assert.equal((await as("/api/shops/bg/sync", {})).status, 404);

  // Switched off: Ivan cannot work any more.
  await api(`/api/companies/${other.id}`, { archived: true });
  assert.equal((await as("/api/orders?tab=")).status, 401);
});

test("shops like Middleware: add a ConvertBuilder shop with its key, change it, switch it off", async () => {
  const list = (await api("/api/shops")).data.shops;
  const bg = list.find((s) => s.id === "bg");
  assert.equal(bg.source, "netlify");
  assert.ok(bg.orders > 0);
  // A wrong key is refused before anything is saved.
  const wrong = await api("/api/shops", { label: "Нов магазин", domain: `localhost:${SHOP_PORT}`, key: "not-the-right-key" });
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.message, /не прие ключа/);
  assert.equal((await api("/api/shops", { label: "Дубъл", domain: `127.0.0.1:${SHOP_PORT}`, key: "test-key-test" })).status, 400, "the same site twice");
  // The right key: saved encrypted, the orders come in at once.
  const ok = await api("/api/shops", { label: "Нов магазин", domain: `http://localhost:${SHOP_PORT}/`, key: "test-key", currency: "eur" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const added = ok.data.shops.find((s) => s.id === ok.data.id);
  assert.equal(added.domain, `localhost:${SHOP_PORT}`);
  assert.equal(added.source, "app");
  assert.equal(added.currency, "EUR");
  assert.ok(added.orders > 0, "orders pulled right after adding");
  assert.ok(!JSON.stringify(ok.data).includes("test-key"), "the key never goes back to the browser");
  // Change, sync, switch off.
  const ch = await api(`/api/shops/${added.id}`, { label: "Преименуван", note: "тест", active: false });
  const after = ch.data.shops.find((s) => s.id === added.id);
  assert.equal(after.label, "Преименуван");
  assert.equal(after.note, "тест");
  assert.equal(after.active, false);
  assert.equal((await api(`/api/shops/${added.id}`, { key: "short" })).status, 400);
  assert.equal((await api(`/api/shops/${added.id}`, { active: true })).status, 200);
  assert.equal((await api(`/api/shops/${added.id}/sync`, {})).status, 200);
  assert.equal((await api("/api/shops/nope", { active: false })).status, 404);
});

test("people like Middleware: add with a role, change, new password ends their sessions, remove", async () => {
  const add = await api("/api/settings/users", { name: "Мария", email: "maria@example.com", password: "maria-password-1", role: "admin" });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  const maria = add.data.users.find((u) => u.email === "maria@example.com");
  assert.equal(maria.role, "admin");
  assert.equal(maria.last_login, null);
  // She logs in, then gets a new password: her session ends.
  let ck = "";
  const as = async (p, body) => {
    const r = await fetch(B + p, { method: body ? "POST" : "GET", headers: { ...(body ? { "content-type": "application/json" } : {}), cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get("set-cookie");
    if (set) ck = set.split(";")[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  assert.equal((await as("/api/auth/login", { email: "maria@example.com", password: "maria-password-1" })).status, 200);
  assert.equal((await as("/api/orders?tab=")).status, 200);
  const list = (await api("/api/settings")).data.users;
  assert.ok(list.find((u) => u.email === "maria@example.com").last_login, "last login shown");
  const ch = await api("/api/settings/users/change", { id: Number(maria.id), name: "Мария Иванова", role: "staff", password: "maria-password-2" });
  assert.equal(ch.status, 200, JSON.stringify(ch.data));
  const after = ch.data.users.find((u) => u.email === "maria@example.com");
  assert.equal(after.name, "Мария Иванова");
  assert.equal(after.role, "staff");
  assert.equal((await as("/api/orders?tab=")).status, 401, "old session ended");
  assert.equal((await api("/api/settings/users/change", { id: Number(maria.id), password: "short" })).status, 400);
  // The owner stays owner; a staff member cannot change people.
  const owner = ch.data.users.find((u) => u.owner);
  assert.equal((await api("/api/settings/users/change", { id: Number(owner.id), role: "staff" })).status, 400);
  assert.equal((await api("/api/settings/users/delete", { id: Number(owner.id) })).status, 400);
  assert.equal((await as("/api/auth/login", { email: "maria@example.com", password: "maria-password-2" })).status, 200);
  assert.equal((await as("/api/settings/users", { name: "X", email: "x@example.com", password: "x-password-123" })).status, 400, "staff cannot add people");
  assert.equal((await api("/api/settings/users/delete", { id: Number(maria.id) })).status, 200);
});

test("couriers page: Speedy sender objects for the dropdown, sender settings saved", async () => {
  const r = await api("/api/waybills/clients?courier=speedy");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.clients, [{ id: "100000000001", name: "БИ ВЕНОМ ЕООД – Склад", address: "Пловдив, ул. Тест 1" }]);
  assert.deepEqual((await api("/api/waybills/clients?courier=econt")).data.clients, []);
  const saved = await api("/api/waybills/settings", { econt: { senderOfficeCode: "1152", weight: "0.7", sms: false } });
  assert.equal(saved.data.defaults.econt.senderOfficeCode, "1152");
  assert.equal(saved.data.defaults.econt.weight, 0.7);
  assert.equal(saved.data.defaults.econt.sms, false);
});

test("the ! like Middleware: parcels not picked up and how many the client took, from every shop", async () => {
  // Order 5 (0888100005) was sent and came back. The same client orders again, typed with spaces.
  const made = await api("/api/orders", { shop: "bg", name: "Клиент Пет", phone: "0888 100 005", city: "София", delivery: { courier: "econt", type: "office", officeId: "1234", officeName: "София Осогово" }, items: [{ name: "BeeVenom Care Gel", qty: 1, price: 20 }] });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const o = (await api("/api/orders?tab=&q=100005")).data.orders.find((x) => x.id === made.data.id);
  // (the shop added in the shops test pulls the same orders: there it came back too)
  assert.equal(o.returned_before, o.ret_shops.length);
  assert.ok(o.ret_shops.includes("Тест BG"));
  assert.equal(o.delivered_before, 0);
});

test("order panel like Middleware: products with SKU, weight and picture; what the courier really charged", async () => {
  const r = await api("/api/settings/track", {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const list = (await api("/api/orders?tab=&q=5003")).data.orders;
  const d = (await api(`/api/orders/${list[0].id}`)).data;
  assert.equal(d.courier_cost, 3.24, "Econt's price from the shipment status");
  assert.equal(d.discount_code, "ESEN10");
  assert.deepEqual(d.lines[0], { name: "BeeVenom Care Gel", qty: 1, total: 20, price: 20, sku: "BV-GEL", image: "https://cdn.example.com/gel.jpg", weight: 0.25, variant: "Размер: 50 мл", url: null, digital: false });
  // A Speedy parcel made elsewhere (Middleware): its price is asked with shipment/info.
  const sp = (await api("/api/orders?tab=&q=62000000001")).data.orders[0];
  if (sp) assert.equal((await api(`/api/orders/${sp.id}`)).data.courier_cost, 3.8);
  assert.ok(sent.some((x) => x.path === "/speedy/shipment/info"));
});

test("now in the shops: signs of life from the shop pages, counted per shop and stage", async () => {
  const ping = (body, origin = `http://127.0.0.1:${SHOP_PORT}`) =>
    fetch(`${B}/api/collect`, { method: "POST", headers: { "Content-Type": "text/plain", Origin: origin, "x-dev-geo": encodeURIComponent("BG/Пловдив") }, body: JSON.stringify({ t: "ping", ...body }) });
  assert.equal((await ping({ sid: "tab0000001", vid: "browser001", page: "/" }, "https://evil.example")).status, 403);
  assert.equal((await ping({ sid: "tab0000001", vid: "browser001", page: "/", stage: "browsing", device: "mobile", source: "Facebook / Instagram" })).status, 204);
  await ping({ sid: "tab0000002", vid: "browser002", page: "/store/checkout", stage: "filling", device: "desktop", source: "Google", cart: 2, value: "39,90 €" });
  await ping({ sid: "tab0000002", vid: "browser002", page: "/", stage: "browsing" }); // scrolled back up: reached stays "filling"
  await ping({ sid: "tab0000003", vid: "browser003", page: "/", stage: "checkout" });
  await ping({ sid: "tab0000003", vid: "browser003", page: "/", stage: "checkout", gone: true }); // closed the tab
  const live = (await api("/api/live")).data;
  const bg = live.shops.find((s) => s.id === "bg");
  assert.equal(bg.now.online, 2);
  assert.equal(bg.now.browsing, 2);
  assert.equal(bg.now.mobile, 1);
  assert.equal(bg.today.people, 3);
  assert.equal(bg.today.filling, 1);
  const s1 = live.sessions.find((x) => x.sid === "tab0000001");
  assert.equal(s1.country, "BG");
  assert.equal(s1.city, "Пловдив");
  assert.equal(s1.source, "Facebook / Instagram");
  assert.equal(s1.online, true);
  const s2 = live.sessions.find((x) => x.sid === "tab0000002");
  assert.equal(s2.reached, "filling");
  assert.equal(s2.pages, 2);
  assert.equal(s2.cart_lines, 2);
  assert.equal(live.sessions.find((x) => x.sid === "tab0000003").online, false);
  // By channel: Facebook → Meta, Google (search) → Търсачки; the feed tells what happened.
  assert.equal(live.channels.find((c) => c.id === "meta").now, 1);
  assert.equal(live.channels.find((c) => c.id === "search").now, 1);
  assert.equal(s1.channel, "meta");
  const kinds = live.feed.filter((e) => e.shop === "bg" && e.kind !== "order").map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["came", "came", "came", "checkout", "filling"]);
  assert.equal(live.feed.find((e) => e.kind === "filling").city, "Пловдив");
  assert.equal((await fetch(`${B}/api/live`)).status, 401);
});

test("cart reminders: SMS and e-mail by hand, unsubscribe, automatic once per step, the cart stream", async () => {
  const pg = (await import("pg")).default;
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  const send = (body) =>
    fetch(`${B}/api/collect`, { method: "POST", headers: { "Content-Type": "text/plain", Origin: `http://127.0.0.1:${SHOP_PORT}` }, body: JSON.stringify(body) });
  // A cart with a phone and an e-mail, and one with only an e-mail.
  await send({ sid: "cart000001", name: "Петър Петров", phone: "0888 444 333", email: "Petar@Example.com", cart: ["Спрей · 1 · 12,90 €"], total: "17,40 €", page: "/sprei" });
  assert.equal((await send({ sid: "cart000002", name: "Ана", email: "ana@example.com", cart: ["Крем · 1 · 29,90 €"], total: "34,40 €" })).status, 204);
  let leads = (await api("/api/leads?tab=open")).data.leads;
  const p = leads.find((l) => l.email === "petar@example.com");
  const a = leads.find((l) => l.email === "ana@example.com");
  assert.ok(p && a, "an e-mail alone is enough");
  assert.equal(a.phone, "");

  // SMS by hand: the link goes to the page where they ordered.
  const sms = await api(`/api/leads/${p.id}`, { action: "sms" });
  assert.equal(sms.status, 200, JSON.stringify(sms.data));
  assert.equal(sms.data.text, `Здравейте, Петър! Поръчката Ви в Тест не е завършена. Може да я завършите тук: https://127.0.0.1:${SHOP_PORT}/sprei`);
  assert.ok(sent.some((x) => x.path === "sms" && x.body.to === "359888444333" && x.body.message.includes("/sprei")));
  // E-mail needs Brevo: a wrong key is refused, then the right one.
  assert.equal((await api(`/api/leads/${a.id}`, { action: "email" })).status, 400);
  assert.equal((await api("/api/leads/email", { key: "bad-key", fromEmail: "shop@example.com" })).status, 400);
  const em = await api("/api/leads/email", { key: "brevo-key-123", fromEmail: "shop@example.com", fromName: "Тест" });
  assert.equal(em.data.email.configured, true);
  assert.equal((await api(`/api/leads/${a.id}`, { action: "email", subject: "Здравейте", text: "Количката Ви чака." })).status, 200);
  const mail = sent.filter((x) => x.path === "/email/smtp/email").at(-1).body;
  assert.equal(mail.to[0].email, "ana@example.com");
  assert.equal(mail.sender.email, "shop@example.com");
  assert.match(mail.textContent, /Отпишете се: http\S+\/api\/unsub\?c=1&k=ana%40example\.com&s=/);
  // Unsubscribe: no more.
  const link = /(http\S+\/api\/unsub\S+)/.exec(mail.textContent)[1].replace(/^https?:\/\/[^/]+/, B);
  assert.equal((await fetch(link)).status, 200);
  assert.equal((await fetch(link.replace(/s=[^&]+/, "s=wrong"))).status, 400);
  const again = await api(`/api/leads/${a.id}`, { action: "email" });
  assert.equal(again.status, 400);
  assert.match(again.data.message, /отписал/);

  // Automatic: off by default; switched on, step 1 goes once to the carts that waited long enough.
  const set = await api("/api/leads/reminders", { auto: true, step1: { after: 30, sms: true, email: true }, step2: { on: false } });
  assert.equal(set.data.settings.auto, true);
  assert.equal((await api("/api/leads/reminders", { sms: "без линк" })).status, 400, "the SMS needs {линк}");
  await send({ sid: "cart000003", name: "Иво", phone: "0888 222 111", email: "ivo@example.com", cart: ["Пластири · 1 · 4,90 €"], total: "9,40 €" });
  await db.query("UPDATE leads SET last_at = now() - interval '40 minutes', first_at = now() - interval '45 minutes' WHERE sid = 'cart000003'");
  const before = sent.length;
  assert.equal((await api("/api/settings/sync", {})).status, 200);
  const auto = sent.slice(before);
  assert.ok(auto.some((x) => x.path === "sms" && x.body.to === "359888222111"), "automatic SMS");
  assert.ok(auto.some((x) => x.path === "/email/smtp/email" && x.body.to[0].email === "ivo@example.com"), "automatic e-mail");
  const n = sent.length;
  await api("/api/settings/sync", {});
  assert.equal(sent.filter((x, i) => i >= n && (x.path === "sms" || x.path === "/email/smtp/email") && /222111|ivo@/.test(JSON.stringify(x.body))).length, 0, "only once");
  leads = (await api("/api/leads?tab=open")).data.leads;
  const ivo = leads.find((l) => l.email === "ivo@example.com");
  assert.deepEqual(ivo.messages.map((m) => `${m.channel}:${m.step}:${m.ok}`).sort(), ["email:auto1:true", "sms:auto1:true"]);

  // The stream: the open carts with their value and reminders.
  const st = (await api("/api/leads/stream")).data;
  const c = st.carts.find((x) => x.email === "ivo@example.com");
  assert.equal(c.value.eur, 9.4);
  assert.equal(c.reminders, 2);
  assert.ok(c.hours > 0.6 && c.hours < 0.7);
  assert.equal(st.window, 72);
  await api("/api/leads/reminders", { auto: false });
  await db.end();
});

test("abandoned carts in the orders list (Изоставена): made by the sync, confirmed into an order, archived when the client orders", async () => {
  const pg = (await import("pg")).default;
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  const send = (body) =>
    fetch(`${B}/api/collect`, { method: "POST", headers: { "Content-Type": "text/plain", Origin: `http://127.0.0.1:${SHOP_PORT}` }, body: JSON.stringify(body) });
  await send({ sid: "aband00001", name: "Росица Петрова", phone: "0876 751 695", cart: ["Спрей с пчелна отрова · 2 · 25,80 €"], total: "30,30 €" });
  await send({ sid: "aband00002", name: "Донка Славчева", phone: "0885 965 671", cart: ["Крем · 1 · 29,90 €"], total: "34,40 €" });
  await send({ sid: "aband00003", name: "Нов", phone: "0885 111 999", cart: [] }); // still typing: not yet
  await db.query("UPDATE leads SET last_at = now() - interval '25 minutes', first_at = now() - interval '30 minutes' WHERE sid IN ('aband00001', 'aband00002')");
  const statsBefore = (await api("/api/stats/summary")).data;
  assert.equal((await api("/api/settings/sync", {})).status, 200);

  const list = (await api("/api/orders?tab=&stage=abandoned")).data;
  const r = list.orders.find((o) => o.phone === "0876 751 695");
  const d = list.orders.find((o) => o.phone === "0885 965 671");
  assert.ok(r && d, JSON.stringify(list.orders.map((o) => o.phone)));
  assert.ok(!list.orders.some((o) => o.phone === "0885 111 999"));
  assert.equal(r.stage, "abandoned");
  assert.match(r.order_no, /^И\d+$/);
  assert.equal(r.total, 30.3);
  assert.equal(r.shipping, 4.5);
  assert.deepEqual(r.items, ["2 × Спрей с пчелна отрова"]);
  assert.ok((await api("/api/orders?tab=active")).data.orders.some((o) => o.id === r.id), "in the active tab, like Middleware");
  assert.equal(list.facets.stages.abandoned, list.total);
  // Not orders: not in the numbers; no waybill before it is confirmed.
  assert.deepEqual((await api("/api/stats/summary")).data.periods, statsBefore.periods);
  assert.equal((await api("/api/waybills/create", { orderId: r.id, draft: {} })).status, 400);
  // The sync does not make it twice.
  await api("/api/settings/sync", {});
  assert.equal((await api("/api/orders?tab=&stage=abandoned")).data.orders.filter((o) => o.phone === "0876 751 695").length, 1);

  // Confirmed after a call: a real order, and the cart counts as ordered.
  assert.equal((await api(`/api/orders/${r.id}/confirm`, {})).status, 200);
  const now = (await api(`/api/orders/${r.id}`)).data;
  assert.equal(now.stage, "new");
  assert.ok(now.confirmed_at);
  const ordered = (await api("/api/leads?tab=ordered")).data.leads;
  assert.ok(ordered.some((l) => l.phone === "0876 751 695"));

  // The other one orders by herself: the abandoned row goes to the archive.
  const own = await api("/api/orders", { shop: "bg", name: "Донка Славчева", phone: "0885965671", city: "София", delivery: { courier: "econt", type: "office", officeId: "1234", officeName: "София Осогово" }, items: [{ name: "Крем", qty: 1, price: 29.9 }] });
  assert.equal(own.status, 200);
  await api("/api/settings/sync", {});
  const gone = (await api(`/api/orders/${d.id}`)).data;
  assert.ok(gone.archived_at, "archived");
  assert.ok(gone.events.some((e) => /поръча сам/.test(e.text)));
  await db.end();
});
