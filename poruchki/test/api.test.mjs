// End to end against the local server: a fake ConvertBuilder shop, first login, sync, stats, webhook.
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
  server = spawn(process.execPath, ["scripts/dev-server.mjs", String(PORT)], {
    cwd: root,
    env: {
      ...process.env,
      DEMO: "",
      SETUP_CODE: "test-setup-code-123",
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
  assert.equal(st.new.n, 1);
  assert.equal(st.shipped.n, 1);
  assert.equal(st.canceled.n, 1);
  assert.equal(st.returned.n, 1);
  assert.equal(st.delivered.n, orders.length - 4);
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
