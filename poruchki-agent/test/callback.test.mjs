import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { buildQuery, sign, phpUrlencode } from "../lib/zadarma.mjs";
import { startCallbackCall, initiationData, phoneDigits, NO_ANSWER_MIN } from "../lib/callback.mjs";
import { syncOrders, runDueCalls, handleWebhook } from "../lib/engine.mjs";
import { setupCallback } from "../lib/setup-callback.mjs";

const T0 = new Date("2026-11-12T10:00:00Z"); // 12:00 Sofia
const min = (n) => new Date(T0.getTime() + n * 60_000);
const ZD = { key: "k123", secret: "test-secret", from: "+35924370192", sip: "100" };

test("Zadarma: query sorted and encoded like PHP, signature matches a reference", () => {
  const q = buildQuery({ to: "+359888123456", from: "+35924370192", sip: "100", predicted: 1 });
  assert.equal(q, "from=%2B35924370192&predicted=1&sip=100&to=%2B359888123456");
  // Reference computed separately: base64(hex(HMAC-SHA1(path + query + md5(query))))
  assert.equal(sign("/v1/request/callback/", q, "test-secret"), "NzhhM2E5YzdjMGNhMzVlZjRjZDk3NzExNGIyZmJlODZhNTUzMWRkYQ==");
  assert.equal(phpUrlencode("a b~*"), "a+b%7E%2A");
});

test("phone numbers in every shape map to the same key", () => {
  for (const p of ["+359 888 123 456", "0888123456", "359888123456", "00359888123456", "888123456"]) {
    assert.equal(phoneDigits(p), "359888123456", p);
  }
  assert.equal(phoneDigits(""), null);
});

function fakeZadarma(reply = { status: "success" }) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, auth: init.headers.Authorization });
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  return { requests, fetchImpl };
}

test("a callback call saves the order data and asks Zadarma to ring the customer first", async () => {
  const store = memoryStore();
  const { requests, fetchImpl } = fakeZadarma();
  const r = await startCallbackCall({ store, zadarma: ZD, to: "+359888123456", variables: { order_key: "order/bg/7", order_total: "24 евро" }, now: T0, fetchImpl });
  assert.deepEqual(r, { conversationId: null, route: "zadarma" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.zadarma.com/v1/request/callback/?from=%2B35924370192&predicted=1&sip=100&to=%2B359888123456");
  assert.match(requests[0].auth, /^k123:[A-Za-z0-9+/=]+$/);
  const saved = await store.get("pending/359888123456", { type: "json" });
  assert.equal(saved.variables.order_key, "order/bg/7");
});

test("a Zadarma error is thrown, not hidden", async () => {
  const store = memoryStore();
  const { fetchImpl } = fakeZadarma({ status: "error", message: "Wrong parameter" });
  await assert.rejects(startCallbackCall({ store, zadarma: ZD, to: "0888123456", variables: {}, now: T0, fetchImpl }), /Wrong parameter/);
});

const SCRIPT = async () => ({ prompt: "Ти си Елена. Поръчка {{order_number}} за {{customer_name}}, сума {{order_total}}. Подарък: {{upsell_kind}}.", firstMessage: "Здравейте, {{customer_name}}?", language: "bg" });

test("initiation webhook: the connected customer gets the order data and the confirmation script", async () => {
  const store = memoryStore();
  await store.setJSON("order/bg/7", { state: "calling", history: [], conversationIds: [] });
  await store.setJSON("pending/359888123456", { variables: { order_key: "order/bg/7", order_number: "7", customer_name: "госпожа Петрова", order_total: "24 евро" }, at: T0.toISOString() });
  const { response, orderKey } = await initiationData({ store, body: { caller_id: "0888123456", conversation_id: "conv_1" }, outboundScript: SCRIPT, now: min(1) });
  assert.equal(orderKey, "order/bg/7");
  assert.equal(response.type, "conversation_initiation_client_data");
  assert.equal(response.dynamic_variables.customer_name, "госпожа Петрова");
  assert.equal(response.dynamic_variables.upsell_kind, ""); // missing variable filled, so the call can start
  assert.match(response.conversation_config_override.agent.prompt.prompt, /Ти си Елена/);
  assert.equal(response.conversation_config_override.agent.first_message, "Здравейте, {{customer_name}}?");
  // Used once; the order knows the customer answered and which conversation it is.
  assert.equal(await store.get("pending/359888123456"), null);
  const rec = await store.get("order/bg/7", { type: "json" });
  assert.ok(rec.answeredAt);
  assert.deepEqual(rec.conversationIds, ["conv_1"]);
  assert.deepEqual(await store.get("conv/conv_1", { type: "json" }), { key: "order/bg/7" });
});

test("initiation webhook: a real incoming caller gets the normal line", async () => {
  const store = memoryStore();
  const { response, orderKey } = await initiationData({ store, body: { caller_id: "+359877111222" }, outboundScript: SCRIPT, now: T0 });
  assert.equal(orderKey, null);
  assert.deepEqual(response, { type: "conversation_initiation_client_data", dynamic_variables: {} });
});

test("initiation webhook: an old pending callback is not used", async () => {
  const store = memoryStore();
  await store.setJSON("pending/359888123456", { variables: { order_key: "order/bg/7" }, at: T0.toISOString() });
  const { orderKey } = await initiationData({ store, body: { caller_id: "0888123456" }, outboundScript: SCRIPT, now: min(20) });
  assert.equal(orderKey, null);
});

test("initiation webhook: if Zadarma shows our own number, the fresh callback is used", async () => {
  const store = memoryStore();
  await store.setJSON("pending/359888123456", { variables: { order_key: "test", customer_name: "Митко" }, at: T0.toISOString() });
  const { orderKey, response } = await initiationData({ store, body: { caller_id: "+35924370192" }, outboundScript: SCRIPT, ownNumber: "+35924370192", now: min(1) });
  assert.equal(orderKey, "test");
  assert.equal(response.dynamic_variables.customer_name, "Митко");
});

test("initiation webhook: Zadarma's foreign line number (+44…) is the fresh callback", async () => {
  const store = memoryStore();
  await store.setJSON("pending/359899876063", { variables: { order_key: "test", customer_name: "Митко" }, at: T0.toISOString() });
  const { orderKey, response } = await initiationData({ store, body: { caller_id: "+442045775777" }, outboundScript: SCRIPT, ownNumber: "+35924370192", now: min(1) });
  assert.equal(orderKey, "test");
  assert.equal(response.dynamic_variables.customer_name, "Митко");
  assert.match(response.conversation_config_override.agent.prompt.prompt, /Ти си Елена/);
});

test("initiation webhook: a Bulgarian caller with no callback is not mixed up with someone else's order", async () => {
  const store = memoryStore();
  await store.setJSON("pending/359899876063", { variables: { order_key: "order/bg/9" }, at: T0.toISOString() });
  const { orderKey } = await initiationData({ store, body: { caller_id: "0877111222" }, outboundScript: SCRIPT, ownNumber: "+35924370192", now: min(1) });
  assert.equal(orderKey, null);
  assert.ok(await store.get("pending/359899876063")); // still waiting for its customer
});

test("initiation webhook: without the script it still sends the order data", async () => {
  const store = memoryStore();
  await store.setJSON("pending/359888123456", { variables: { order_key: "test" }, at: T0.toISOString() });
  const { response } = await initiationData({ store, body: { caller_id: "0888123456" }, outboundScript: async () => { throw new Error("down"); }, now: min(1) });
  assert.equal(response.dynamic_variables.order_key, "test");
  assert.equal(response.conversation_config_override, undefined);
});

// Engine with calls through Zadarma: the call returns no conversation id.
function setupEngine() {
  const store = memoryStore();
  const orders = [];
  const calls = [];
  const messages = [];
  const deps = {
    store,
    cb: { fetchNewOrders: async () => orders, isStillPending: async () => true },
    async call(args) {
      calls.push(args);
      return { conversationId: null, route: "zadarma" };
    },
    notify: async (t) => messages.push(t),
    config: { mode: "live", testPhone: "+359877000000", hours: "09:00-21:00", hoursSunday: "10:00-19:00", shopName: "BeeVenom", deliveryDays: "един до два работни дни" },
  };
  const order = (n) => ({ site: "bg", siteLabel: "BeeVenom BG", orderNo: n, createdAt: min(1).toISOString(), name: "Мария Петрова", phone: "0888 123 456", items: [{ name: "Гел", qty: 1, price: 19.9 }], total: 24.4, deliveryText: "офис" });
  return { deps, store, orders, calls, messages, order };
}

test("Zadarma: not answered within a few minutes → retry later, Mitko not bothered", async () => {
  const { deps, store, orders, calls, order } = setupEngine();
  await syncOrders(deps, T0);
  orders.push(order(5));
  await syncOrders(deps, min(2));
  await runDueCalls(deps, min(2));
  assert.equal(calls.length, 1);
  assert.equal((await store.get("order/bg/5", { type: "json" })).route, "zadarma");
  await runDueCalls(deps, min(2 + NO_ANSWER_MIN - 1)); // still ringing
  assert.equal((await store.get("order/bg/5", { type: "json" })).state, "calling");
  await runDueCalls(deps, min(2 + NO_ANSWER_MIN + 1));
  const rec = await store.get("order/bg/5", { type: "json" });
  assert.equal(rec.state, "queued");
  assert.equal(rec.lastOutcome, "no-answer");
});

test("Zadarma: answered → the result arrives by order_key and confirms the order", async () => {
  const { deps, store, orders, messages, order } = setupEngine();
  await syncOrders(deps, T0);
  orders.push(order(6));
  await syncOrders(deps, min(2));
  await runDueCalls(deps, min(2));
  const pending = await store.get("pending/359888123456", { type: "json" });
  assert.equal(pending, null); // the fake call does not save it; the real one does (tested above)
  await store.setJSON("pending/359888123456", { variables: { order_key: "order/bg/6" }, at: min(2).toISOString() });
  await initiationData({ store, body: { caller_id: "+359888123456", conversation_id: "conv_9" }, outboundScript: SCRIPT, now: min(3) });
  await runDueCalls(deps, min(10)); // a long conversation is not "not answered"
  assert.equal((await store.get("order/bg/6", { type: "json" })).state, "calling");
  const res = await handleWebhook(deps, {
    type: "post_call_transcription",
    data: {
      conversation_id: "conv_9",
      transcript: [{ role: "agent", message: "Здравейте" }],
      analysis: { data_collection_results: { outcome: { value: "confirmed" } }, transcript_summary: "ок" },
      conversation_initiation_client_data: { dynamic_variables: { order_key: "order/bg/6", test: "no" } },
    },
  }, min(12));
  assert.equal(res.state, "done");
  assert.equal(messages.length, 1);
});

test("setup: points the workspace at our webhook and opens the incoming agent for callbacks", async () => {
  const calls = [];
  let inbound = { platform_settings: { data_collection: { intent: { type: "string", description: "x" } }, overrides: {} } };
  const outbound = { platform_settings: { data_collection: { outcome: { type: "string", description: "y" }, summary: { type: "string", description: "s" } } } };
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://api.elevenlabs.io", "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, body });
    if (path === "/v1/convai/settings") return Response.json(init.method === "GET" ? {} : {});
    if (path === "/v1/convai/agents/in") {
      if (init.method === "PATCH") inbound = { platform_settings: { ...inbound.platform_settings, ...body.platform_settings } };
      return Response.json(inbound);
    }
    if (path === "/v1/convai/agents/out") return Response.json(outbound);
    return new Response("nope", { status: 404 });
  };
  const r = await setupCallback({ apiKey: "x", inboundAgentId: "in", outboundAgentId: "out", initUrl: "https://s/webhook/el-init/abc", fetchImpl });
  assert.equal(r.ok, true, r.report.join("\n"));
  const ws = calls.find((c) => c.method === "PATCH" && c.path === "/v1/convai/settings");
  assert.equal(ws.body.conversation_initiation_client_data_webhook.url, "https://s/webhook/el-init/abc");
  assert.ok(inbound.platform_settings.data_collection.outcome && inbound.platform_settings.data_collection.intent);
});

test("setup: refuses to replace someone else's initiation webhook", async () => {
  const fetchImpl = async (url) =>
    url.endsWith("/v1/convai/settings") ? Response.json({ conversation_initiation_client_data_webhook: { url: "https://other.example/hook" } }) : Response.json({});
  await assert.rejects(setupCallback({ apiKey: "x", inboundAgentId: "in", outboundAgentId: "out", initUrl: "https://s/webhook/el-init/abc", fetchImpl }), /друг webhook/);
});
