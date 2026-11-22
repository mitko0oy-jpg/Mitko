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

test("initiation webhook: a real incoming caller gets Стела with the zdravets.eu catalogue", async () => {
  const store = memoryStore();
  const { response, orderKey } = await initiationData({ store, body: { caller_id: "+359877111222" }, outboundScript: SCRIPT, now: new Date("2026-11-22T10:00:00+02:00") });
  assert.equal(orderKey, null);
  assert.deepEqual(response.dynamic_variables, {});
  const agent = response.conversation_config_override.agent;
  assert.match(agent.first_message, /Здравец Натура – Стела/);
  assert.equal(agent.language, "bg");
  const prompt = agent.prompt.prompt;
  assert.ok(!prompt.includes("[["), "every placeholder is filled");
  assert.match(prompt, /Ти си Стела/);
  assert.match(prompt, /### Гел за стави с пчелна отрова \[код gel\]/);
  assert.match(prompt, /Лепенки с берберин \[код berberin\]/);
  assert.match(prompt, /Черен петък – до 30 ноември включително/);
  assert.match(prompt, /# Как говориш/, "the shared speaking style is in");
  // After Black Friday the offer is gone by itself.
  const after = await initiationData({ store, body: { caller_id: "+359877111222" }, outboundScript: SCRIPT, now: new Date("2026-12-01T10:00:00+02:00") });
  assert.doesNotMatch(after.response.conversation_config_override.agent.prompt.prompt, /Черен петък/);
  // Switched off (INBOUND_SCRIPT=off): the agent's own script in ElevenLabs.
  const off = await initiationData({ store, body: { caller_id: "+359877111222" }, outboundScript: SCRIPT, inboundScript: null, now: T0 });
  assert.deepEqual(off.response, { type: "conversation_initiation_client_data", dynamic_variables: {} });
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
  let inbound = {
    conversation_config: { agent: { prompt: { tool_ids: ["t_find", "t_total", "t_submit"] } } },
    platform_settings: { data_collection: { intent: { type: "string", description: "x" } }, overrides: {} },
  };
  const orderTool = (name) => ({
    tool_config: {
      type: "webhook",
      name,
      api_schema: {
        url: "https://s/tools/abc/x",
        method: "POST",
        request_body_schema: {
          type: "object",
          properties: {
            items: { type: "array", items: { type: "object", properties: { product_id: { type: "string", description: "Кодът", enum: ["gel-1", "gel-2p1"] }, quantity: { type: "integer", description: "Брой" } } } },
            delivery: { type: "string", enum: ["econt_office", "speedy_office", "speedy_address"], description: "старо" },
          },
        },
      },
    },
  });
  const tools = { t_find: { tool_config: { type: "webhook", name: "find_order", api_schema: { request_body_schema: { properties: { phone: { type: "string" } } } } } }, t_total: orderTool("get_total"), t_submit: orderTool("submit_order") };
  const outbound = { platform_settings: { data_collection: { outcome: { type: "string", description: "y" }, summary: { type: "string", description: "s" } } } };
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://api.elevenlabs.io", "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, body });
    if (path === "/v1/convai/settings") return Response.json(init.method === "GET" ? {} : {});
    if (path === "/v1/convai/agents/in") {
      if (init.method === "PATCH") inbound = { ...inbound, platform_settings: { ...inbound.platform_settings, ...body.platform_settings } };
      return Response.json(inbound);
    }
    const tool = /^\/v1\/convai\/tools\/(\w+)$/.exec(path);
    if (tool && tools[tool[1]]) {
      if (init.method === "PATCH") tools[tool[1]] = { tool_config: body.tool_config };
      return Response.json(tools[tool[1]]);
    }
    if (path === "/v1/convai/agents/out") return Response.json(outbound);
    return new Response("nope", { status: 404 });
  };
  const r = await setupCallback({ apiKey: "x", inboundAgentId: "in", outboundAgentId: "out", initUrl: "https://s/webhook/el-init/abc", fetchImpl });
  assert.equal(r.ok, true, r.report.join("\n"));
  const ws = calls.find((c) => c.method === "PATCH" && c.path === "/v1/convai/settings");
  assert.equal(ws.body.conversation_initiation_client_data_webhook.url, "https://s/webhook/el-init/abc");
  assert.ok(inbound.platform_settings.data_collection.outcome && inbound.platform_settings.data_collection.intent);
  // The feedback call's fields, prefixed so they do not clash with the order's "outcome".
  assert.match(inbound.platform_settings.data_collection.fb_outcome.description, /reorder/);
  assert.equal(inbound.platform_settings.data_collection.fb_do_not_call.type, "boolean");
  assert.match(r.report.join("\n"), /полета за обратна връзка/);
  // The order tools: any product code (checked on our side), the rest of the tool untouched.
  for (const id of ["t_total", "t_submit"]) {
    const cfg = tools[id].tool_config;
    const pid = cfg.api_schema.request_body_schema.properties.items.items.properties.product_id;
    assert.equal(pid.enum, undefined);
    assert.match(pid.description, /Каталог/);
    assert.equal(cfg.api_schema.url, "https://s/tools/abc/x");
    assert.deepEqual(cfg.api_schema.request_body_schema.properties.delivery.enum, ["econt_office", "speedy_office", "speedy_address"]);
  }
  assert.equal(calls.filter((c) => c.method === "PATCH" && c.path.startsWith("/v1/convai/tools/")).length, 2);
  assert.match(r.report.join("\n"), /приемат всички продукти от zdravets\.eu \(2\)/);
  // A second run changes nothing.
  const again = await setupCallback({ apiKey: "x", inboundAgentId: "in", outboundAgentId: "out", initUrl: "https://s/webhook/el-init/abc", fetchImpl });
  assert.equal(again.ok, true);
  assert.equal(calls.filter((c) => c.method === "PATCH" && c.path.startsWith("/v1/convai/tools/")).length, 2);
});

test("setup: refuses to replace someone else's initiation webhook", async () => {
  const fetchImpl = async (url) =>
    url.endsWith("/v1/convai/settings") ? Response.json({ conversation_initiation_client_data_webhook: { url: "https://other.example/hook" } }) : Response.json({});
  await assert.rejects(setupCallback({ apiKey: "x", inboundAgentId: "in", outboundAgentId: "out", initUrl: "https://s/webhook/el-init/abc", fetchImpl }), /друг webhook/);
});

test("Николай: women get him or Елена half/half, men always Елена; he speaks with Kosta's voice as a man", async () => {
  const { feedbackPersona, NIKOLAY_VOICE } = await import("../lib/persona.mjs");
  assert.equal(feedbackPersona("Иван Петров", "1649"), "elena");
  assert.equal(feedbackPersona("Мария", "1649"), "elena", "no surname – we cannot tell");
  const women = Array.from({ length: 200 }, (_, i) => feedbackPersona("Мария Петрова", String(1000 + i)));
  const n = women.filter((p) => p === "nikolay").length;
  assert.ok(n > 70 && n < 130, `about half: ${n}`);
  assert.equal(feedbackPersona("Мария Петрова", "1649"), feedbackPersona("Мария Петрова", "1649"), "a retry keeps the voice");

  const { memoryStore } = await import("../lib/store.mjs");
  const { initiationData } = await import("../lib/callback.mjs");
  const store = memoryStore();
  const now = new Date("2026-11-23T10:00:00Z");
  await store.setJSON("pending/359888123456", { variables: { campaign: "feedback", order_key: "fb-1649", customer_name: "госпожо Петрова", persona: "nikolay", voice_id: NIKOLAY_VOICE.id }, script: "feedback", at: now.toISOString() });
  const init = await initiationData({ store, body: { caller_id: "+442045775777", conversation_id: "x" }, outboundScript: async () => null, now });
  const o = init.response.conversation_config_override;
  assert.match(o.agent.first_message, /Обажда се Николай/);
  assert.doesNotMatch(o.agent.first_message, /Елена/);
  assert.match(o.agent.prompt.prompt, /Ти си Николай – дигиталният асистент/);
  assert.match(o.agent.prompt.prompt, /мъжки род/);
  assert.equal(o.tts.voice_id, "gdk0ZsvfAOobfbTtnx6p");
  assert.equal(init.response.dynamic_variables.persona, "nikolay");
});
