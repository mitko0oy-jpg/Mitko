// The link to OrderDesk: orders come from it, every call is reported to it, and after a
// confirmation OrderDesk confirms the order and makes the waybill (Mitko sees its number in Telegram).
import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { syncOrders, runDueCalls, handleWebhook, waybillLine } from "../lib/engine.mjs";
import { platform, upsellEdit, reportBody } from "../lib/platform.mjs";

const T0 = new Date("2026-11-12T10:00:00Z"); // 12:00 in Sofia
const min = (n) => new Date(T0.getTime() + n * 60_000);
const env = (vars) => (name) => vars[name];

test("OrderDesk client: bearer token, shops filter, mapping", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (url.includes("/orders?")) return Response.json({ orders: [{ id: 42, site: "bg", orderNo: "1735" }] });
    if (url.endsWith("/orders/42")) return Response.json({ id: 42, stillToCall: false });
    if (url.endsWith("/orders/42/result")) return Response.json({ ok: true, outcome: "confirmed", waybill: { number: "1051234567", courier: "econt" } });
    return Response.json({ message: "няма такова" }, { status: 404 });
  };
  assert.equal(platform({ env: env({}), fetchImpl }).enabled, false);
  const p = platform({ env: env({ PLATFORM_URL: "https://p.example/", PLATFORM_TOKEN: "t0k" }), fetchImpl });
  const orders = await p.fetchNewOrders({ since: "2026-11-12T08:00:00.000Z", sites: ["bg", "max4"] });
  assert.equal(seen[0].url, "https://p.example/api/agent/orders?shops=bg%2Cmax4&since=2026-11-12T08%3A00%3A00.000Z");
  assert.equal(seen[0].init.headers.Authorization, "Bearer t0k");
  assert.equal(orders[0].platformId, 42);
  assert.equal(await p.isStillPending({ platformId: 42 }), false);
  assert.equal(await p.isStillPending({}), true, "orders not from OrderDesk are not checked there");
  const r = await p.report({ platformId: 42 }, { outcome: "confirmed" });
  assert.equal(r.waybill.number, "1051234567");
  assert.equal(await p.report({}, {}), null, "no OrderDesk id → nothing sent");
});

test("the extra box is sent as a correction with prices from the price list", () => {
  const rec = { items: [{ name: "BeeVenom Care Gel 2+1 броя", qty: 1, price: 39.9 }], shipping: 4.5, upsell: { kind: "two_boxes_free" } };
  const two = upsellEdit(rec, "two_boxes");
  assert.equal(two.items[1].qty, 2);
  assert.equal(two.shipping, 0);
  assert.equal(upsellEdit(rec, "none"), null);
  const body = reportBody(rec, { attempts: 1, state: "done" }, { summary: "Потвърди", upsell: "one_box" }, "confirmed");
  assert.equal(body.outcome, "confirmed");
  assert.equal(body.edit.items[1].qty, 1);
  assert.equal(reportBody(rec, { attempts: 1, state: "queued" }, null, "no-answer").edit, null);
});

function setup(result = { ok: true, outcome: "confirmed", waybill: { number: "1051234567", courier: "econt" } }) {
  const store = memoryStore();
  const sent = [];
  const messages = [];
  const calls = [];
  const plat = {
    enabled: true,
    calling: async (rec) => sent.push(["calling", rec.platformId, rec.attempts]),
    report: async (rec, body) => {
      sent.push(["report", rec.platformId, body.outcome]);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  const deps = {
    store,
    platform: plat,
    cb: {
      fetchNewOrders: async () => [
        { site: "bg", siteLabel: "BeeVenom BG", orderNo: "1735", platformId: 42, apiId: 42, createdAt: min(1).toISOString(), name: "Мария Петрова", phone: "0888 123 456", items: [{ name: "Гел", qty: 1, price: 19.9 }], total: 24.4, shipping: 4.5, deliveryText: "до офис на Еконт" },
      ],
      isStillPending: async () => true,
    },
    call: async (args) => (calls.push(args), { conversationId: "conv_1" }),
    notify: async (t) => messages.push(t),
    config: { mode: "live", hours: "09:00-21:00", hoursSunday: "10:00-19:00", shopName: "BeeVenom", deliveryDays: "един до два работни дни" },
  };
  return { deps, store, sent, messages, calls };
}

const confirmed = (key) => ({
  type: "post_call_transcription",
  data: {
    conversation_id: "conv_1",
    transcript: [{ role: "agent", message: "Здравейте" }, { role: "user", message: "Да, потвърждавам" }],
    analysis: { data_collection_results: { outcome: { value: "confirmed" } }, transcript_summary: "Потвърди" },
    conversation_initiation_client_data: { dynamic_variables: { order_key: key, test: "no" } },
  },
});

test("confirmed by phone → OrderDesk is told, makes the waybill, and its number is in Telegram", async () => {
  const { deps, sent, messages, calls } = setup();
  await syncOrders(deps, T0);
  assert.equal(await syncOrders(deps, min(2)), 1);
  await runDueCalls(deps, min(3));
  assert.equal(calls.length, 1);
  assert.deepEqual(sent[0], ["calling", 42, 1]);
  const key = calls[0].variables.order_key;
  await handleWebhook(deps, confirmed(key), min(5));
  assert.deepEqual(sent[1], ["report", 42, "confirmed"]);
  assert.match(messages.at(-1), /📦 Товарителница Еконт № <b>1051234567<\/b>/);
});

test("when OrderDesk cannot make the waybill or does not answer, Mitko is told to do it by hand", async () => {
  for (const [result, re] of [
    [{ ok: true, outcome: "confirmed", waybillError: "няма код на офиса" }, /не се създаде автоматично: няма код на офиса/],
    [new Error("HTTP 502"), /OrderDesk не отговори \(HTTP 502\)/],
  ]) {
    const { deps, messages, calls } = setup(result);
    await syncOrders(deps, T0);
    await syncOrders(deps, min(2));
    await runDueCalls(deps, min(3));
    await handleWebhook(deps, confirmed(calls[0].variables.order_key), min(5));
    assert.match(messages.at(-1), re);
  }
  assert.equal(waybillLine(null), "");
});
