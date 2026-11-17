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
      AGENT_TOKEN: "agent-token-agent-token-agent-token-0000",
      SMSAPI_TOKEN: "sms-token", SMSAPI_URL: `http://127.0.0.1:${COURIER_PORT}/sms`,
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
  assert.match(d.note, /^☎ AI звъня \(опит 1\) – не вдигна, ще опита пак около \d\d:\d\d$/);
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
