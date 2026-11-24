// Paying with the real Stripe code path against a stand-in Stripe (no money, no network): a new code bought with a
// card, and a renewal, both settled without any webhook – by the page after paying, or by the first opening of the
// trainer when that page was closed. Starts its own local server: node --test test/stripe.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const PORT = 8893, STRIPE_PORT = 8894;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "local-admin-token-local-admin-token-0000";

// The stand-in Stripe: Checkout sessions that become paid when the test says so.
const sessions = new Map();
let made = 0;
const stripe = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const send = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.headers.authorization !== "Bearer sk_test_standin") return send({ error: { message: "bad key" } }, 401);
  if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
    const f = new URLSearchParams(body);
    const id = `cs_test_${++made}`;
    sessions.set(id, { id, paid: false, name: f.get("line_items[0][price_data][product_data][name]"), amount: f.get("line_items[0][price_data][unit_amount]"), success: f.get("success_url"), message: f.get("custom_text[submit][message]") });
    return send({ id, url: `https://checkout.stripe.test/${id}` });
  }
  const m = req.url.match(/^\/v1\/checkout\/sessions\/([\w]+)$/);
  if (req.method === "GET" && m && sessions.has(m[1])) {
    const s = sessions.get(m[1]);
    return send({ id: s.id, payment_status: s.paid ? "paid" : "unpaid", status: s.paid ? "complete" : "open", customer_details: s.paid ? { email: "parent@example.com" } : null });
  }
  send({ error: { message: "not found" } }, 404);
});

let server;
async function call(path, data, admin) {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(admin ? { "x-admin-token": ADMIN } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const dev = (n) => `${n}`.padStart(2, "0").repeat(24).replace(/^../, "fa");

test.before(async () => {
  await new Promise((ok) => stripe.listen(STRIPE_PORT, ok));
  server = spawn(process.execPath, ["scripts/dev-server.mjs", String(PORT)], {
    env: { ...process.env, STRIPE_SECRET_KEY: "sk_test_standin", STRIPE_API: `http://localhost:${STRIPE_PORT}`, PAY_FAKE: "0" },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { await fetch(BASE); break; } catch (e) { await new Promise((ok) => setTimeout(ok, 250)); }
  }
  const mods = [{ id: "chetene", area: "read", title: "Четене", desc: "" }];
  const questions = Array.from({ length: 10 }, (_, i) => ({ id: `chetene-${i}`, m: "chetene", t: "mc", q: `Въпрос ${i}`, o: ["а", "б"], a: 0, why: "Обяснение, което е достатъчно дълго за водния знак." }));
  await call("admin/trener-bank", { passages: {}, questions, modules: mods }, true);
  await call("admin/plans", { plans: [{ id: "full-1m", title: "1 месец", tier: "full", months: 1, price: 9.9 }] }, true);
});
test.after(() => { server?.kill(); stripe.close(); });

test("a card payment through Stripe, settled without a webhook", async () => {
  let r = await call("pay/plans");
  assert.equal(r.payments, true);
  assert.equal(r.test, true, "an sk_test_ key is test mode (edubel.bg keeps its own order pages)");

  // A new code: chosen before paying, named in the purchase (so it is in the receipt), alive only once paid.
  r = await call("pay/checkout", { plan: "full-1m", agree: true });
  assert.match(r.url, /^https:\/\/checkout\.stripe\.test\/cs_test_/);
  const s1 = sessions.get(r.url.split("/").pop());
  const code = s1.name.match(/код ([A-Z0-9]{5}-[A-Z0-9]{5})/)[1];
  assert.equal(s1.amount, "990");
  assert.ok(s1.message.includes(code), "the code is also on Stripe's page");
  assert.match(s1.success, /\/dostap\/\?s=\{CHECKOUT_SESSION_ID\}$/);
  r = await call("trener/open", { code, device: dev(1) });
  assert.equal(r.status, 404, "not before the payment");
  // Paid, but the page after paying was closed and no webhook came: the code from the receipt opens anyway.
  s1.paid = true;
  r = await call("trener/open", { code, device: dev(1) });
  assert.equal(r.status, 200);
  assert.equal(r.access.tier, "full");
  assert.ok(new Date(r.expiresAt) > new Date(Date.now() + 27 * 86400e3), "a month from the first opening");
  r = await call(`pay/status?s=${s1.id}`);
  assert.equal(r.status, "paid");
  assert.equal(r.code, code);

  // A renewal of the same code: paid, page closed, no webhook – the next opening of the trainer adds the month.
  const before = new Date((await call("trener/open", { code, device: dev(1) })).expiresAt);
  r = await call("pay/checkout", { plan: "full-1m", agree: true, code });
  const s2 = sessions.get(r.url.split("/").pop());
  assert.ok(s2.name.includes(`удължаване на код ${code}`));
  r = await call("trener/open", { code, device: dev(1) });
  assert.equal(+new Date(r.expiresAt), +before, "nothing before the payment");
  s2.paid = true;
  r = await call("trener/open", { code, device: dev(1) });
  const after = new Date(r.expiresAt);
  assert.ok(after - before > 27 * 86400e3, "a month more after the payment");
  // Settled once only: opening again does not add another month.
  r = await call("trener/open", { code, device: dev(1) });
  assert.equal(+new Date(r.expiresAt), +after);
  const pays = await call("admin/payments", undefined, true);
  assert.deepEqual(pays.payments.filter((p) => p.session.startsWith("cs_test_")).map((p) => p.status), ["paid", "paid"]);
});
