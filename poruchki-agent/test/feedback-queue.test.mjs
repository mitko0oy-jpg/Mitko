import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { handleWebhook } from "../lib/engine.mjs";
import { initiationData } from "../lib/callback.mjs";
import { deliveredAgo, feedbackVariables } from "../lib/feedback.mjs";
import { parseLabels, prepareFeedback, testFeedback, startFeedback, runFeedbackQueue, feedbackStatus, MAX_TRIES } from "../lib/feedback-queue.mjs";
import { FEEDBACK_SCRIPT } from "../lib/scripts.generated.mjs";
import { buildScripts } from "../scripts/build-scripts.mjs";
import { readFile } from "node:fs/promises";

// Saturday 21 Nov 2026, 15:00 Sofia.
const T0 = new Date("2026-11-21T13:00:00Z");
const min = (n) => new Date(T0.getTime() + n * 60_000);

// Middleware + ConvertBuilder for three July orders: 1649 delivered, 1641 delivered, 1638 returned.
const MW = {
  1649: { status: "completed", statusText: "доставена е", externalId: "cb-1649" },
  1641: { status: "completed", statusText: "доставена е", externalId: "cb-1641" },
  1638: { status: "returned", statusText: "върната е", externalId: "cb-1638" },
};
const CB = {
  "cb-1649": {
    customerName: "Мария Петрова",
    created: Date.parse("2026-07-14T09:00:00Z") / 1000,
    shippingAddress: { phone: "0888 123 456", city: "Ловеч", address: "До офис speedy[1]: ЛОВЕЧ - ЦЕНТЪР ул. Търговска No 1" },
    items: [{ name: "BeeVenom Care Gel 2+1 броя", quantity: 1 }, { name: "Кутия Билкови пластири 12бр.", quantity: 1 }],
  },
  "cb-1641": {
    customerName: "Иван Георгиев",
    created: Date.parse("2026-07-20T09:00:00Z") / 1000,
    shippingAddress: { phone: "0899 111 222", city: "Русе", address: "ул. Роза 5" },
    items: [{ name: "BeeVenom Care Gel", quantity: 1 }],
  },
};

function deps(store = memoryStore()) {
  const calls = [];
  const messages = [];
  return {
    store,
    calls,
    messages,
    config: { sites: ["bg"], testPhone: "+359877000000" },
    mw: { findOrder: async (_site, label) => (MW[label] ? { ...MW[label] } : null) },
    cb: { getOrder: async (_site, id) => CB[id] || null },
    call: async (c) => {
      calls.push(c);
      return { conversationId: null, route: "zadarma" };
    },
    notify: async (t) => messages.push(t),
  };
}

test("the generated feedback script is up to date with agent/feedback-bg*", async () => {
  assert.equal(await readFile(new URL("../lib/scripts.generated.mjs", import.meta.url), "utf8"), await buildScripts());
  // Only the style rule that forbids the word may mention it.
  assert.doesNotMatch(FEEDBACK_SCRIPT.prompt.replace(/^.*Думата „пластири“.*$/m, ""), /пластир/i);
  assert.match(FEEDBACK_SCRIPT.prompt, /петдесет ужилвания/);
  assert.match(FEEDBACK_SCRIPT.prompt, /дванайсет билкови лепенки/);
});

test("delivered_ago: weeks for fresh orders, the month for old ones", () => {
  assert.equal(deliveredAgo({ deliveredAt: "2026-11-07T10:00:00Z" }, T0), "преди около две седмици");
  assert.equal(deliveredAgo({ orderedAt: "2026-07-14T09:00:00Z" }, T0), "през юли");
  assert.equal(deliveredAgo({ orderedAt: "2026-07-30T09:00:00Z" }, T0), "през август"); // + 2 days delivery
  assert.equal(deliveredAgo({}, T0), "наскоро");
});

test("parseLabels takes the order numbers out of any text", () => {
  assert.deepEqual(parseLabels(" 1649, 1641 1641\n#1638"), ["1649", "1641", "1638"]);
  assert.deepEqual(parseLabels("няма"), []);
});

test("/obratna: delivered orders are made ready, others are listed with the reason", async () => {
  const d = deps();
  const reply = await prepareFeedback(d, "1649 1641 1638 1777", T0);
  assert.match(reply, /2 клиента готови/);
  assert.match(reply, /#1649 · Мария · гела с пчелна отрова – пакета 2 плюс 1, три туби, и билкови лепенки · получена през юли/);
  assert.match(reply, /#1638 – не е доставена \(върната е\)/);
  assert.match(reply, /#1777 – няма я в Middleware/);
  const rec = await d.store.get("fb-1649", { type: "json" });
  assert.equal(rec.status, "ready");
  assert.equal(rec.order.phone, "+359888123456");
  assert.equal(d.calls.length, 0, "nobody is called before /obratna_start");
});

test("/obratna_test calls Mitko's phone with that customer's data and the feedback script", async () => {
  const d = deps();
  await prepareFeedback(d, "1649", T0);
  const reply = await testFeedback(d, " 1649", T0);
  assert.match(reply, /звъни на \+359877000000 като за поръчка #1649/);
  assert.equal(d.calls[0].to, "+359877000000");
  assert.equal(d.calls[0].script, "feedback");
  assert.equal(d.calls[0].variables.test, "yes");
  assert.equal(d.calls[0].variables.customer_name, "госпожо Петрова");
  assert.equal(d.calls[0].variables.delivered_ago, "през юли");
  assert.equal(d.calls[0].variables.main_offer, "три гела на цената на един – 15 евро и 90 цента, и подарък дванайсет билкови лепенки");
});

test("the queue: one call at a time, no answer → once more an hour later, answered → done", async () => {
  const d = deps();
  await prepareFeedback(d, "1649 1641", T0);
  assert.match(await startFeedback(d, T0), /2 клиента на опашката/);

  // First tick: calls 1649.
  assert.match((await runFeedbackQueue(d, T0)).feedback, /calling #1649/);
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0].to, "+359888123456");
  assert.equal(d.calls[0].variables.order_key, "fb-1649");
  // Still ringing: nothing else starts.
  assert.equal((await runFeedbackQueue(d, min(1))).feedback, "call in progress");

  // Not answered after 2+ minutes (the next tick) → back on the queue for later; 1641 goes next.
  assert.match((await runFeedbackQueue(d, min(6))).feedback, /calling #1641/);
  assert.equal((await d.store.get("fb-1649", { type: "json" })).status, "waiting");

  // 1641 answers (the initiation webhook marks it) and the result arrives.
  await d.store.setJSON("pending/359899111222", { variables: d.calls[1].variables, script: "feedback", at: min(6).toISOString() });
  const init = await initiationData({ store: d.store, body: { caller_id: "+442045775777", conversation_id: "conv_fb" }, outboundScript: async () => null, now: min(6.5) });
  assert.match(init.response.conversation_config_override.agent.prompt.prompt, /Елена/);
  assert.match(init.response.conversation_config_override.agent.first_message, /^Здравейте, \{\{customer_name\}\}! Обажда се Елена/);
  assert.equal(init.response.dynamic_variables.customer_name, "господин Георгиев");
  assert.equal(init.response.dynamic_variables.campaign, "feedback");
  assert.ok((await d.store.get("fb-1641", { type: "json" })).answeredAt);
  assert.equal((await runFeedbackQueue(d, min(12))).feedback, "call in progress");

  await handleWebhook(d, {
    type: "post_call_transcription",
    data: {
      conversation_id: "conv_fb",
      conversation_initiation_client_data: { dynamic_variables: init.response.dynamic_variables },
      // Through the callback the incoming agent collects the feedback fields with "fb_".
      analysis: { data_collection_results: { outcome: { value: "confirmed" }, fb_outcome: { value: "reorder" }, fb_reorder_pack: { value: "3" }, fb_satisfaction: { value: "5" } } },
      transcript: [{ role: "user", message: "Много съм доволен." }],
    },
  }, min(13));
  assert.equal((await d.store.get("fb-1641", { type: "json" })).status, "done");
  assert.match(d.messages.find((m) => /ПОРЪЧА ОТНОВО/.test(m)) || "", /ПОРЪЧА ОТНОВО/);
  assert.match(d.messages.find((m) => /ПОРЪЧА ОТНОВО/.test(m)), /три гела на цената на един.*20 евро и 40 цента/);
  // 1649 waits for its retry hour, so the result did not start another call.
  assert.equal(d.calls.length, 2);

  // 1649 is not called again before the hour is up, then once more.
  assert.equal((await runFeedbackQueue(d, min(30))).feedback, "waiting for retries");
  assert.match((await runFeedbackQueue(d, min(67))).feedback, /calling #1649 \(try 2\)/);
  // Not answered again → given up after MAX_TRIES, and Mitko gets one summary.
  assert.equal(MAX_TRIES, 2);
  await runFeedbackQueue(d, min(74));
  assert.equal((await d.store.get("fb-1649", { type: "json" })).status, "no_answer");
  assert.match(d.messages.at(-1), /Обратна връзка – готово[\s\S]*Говорихме: 1 · Не вдигнаха: 1/);
  assert.match(await feedbackStatus(d), /#1641 Иван – ✅ говорихме/);
});

test("the queue does not call on Sunday, outside 10:00–19:30, when stopped or while another call connects", async () => {
  const d = deps();
  await prepareFeedback(d, "1649", T0);
  await startFeedback(d, T0);
  assert.equal((await runFeedbackQueue(d, new Date("2026-11-22T10:00:00Z"))).feedback, "outside hours"); // Sunday
  assert.equal((await runFeedbackQueue(d, new Date("2026-11-21T18:00:00Z"))).feedback, "outside hours"); // 20:00
  await d.store.setJSON("pending/359888000111", { variables: {}, at: min(-2).toISOString() });
  assert.equal((await runFeedbackQueue(d, T0)).feedback, "another call is connecting");
  await d.store.delete("pending/359888000111");
  await d.store.setJSON("meta/settings", { ...(await d.store.get("meta/settings", { type: "json" })), paused: true });
  assert.equal((await runFeedbackQueue(d, T0)).feedback, "paused");
  assert.equal(d.calls.length, 0);
});

test("CALLS_PAUSED in Netlify keeps the order calls stopped, but not the feedback calls Mitko started", async () => {
  const d = deps();
  d.config.pausedByEnv = true;
  await prepareFeedback(d, "1649", T0);
  await startFeedback(d, T0);
  assert.match((await runFeedbackQueue(d, T0)).feedback, /calling #1649/);
  assert.equal(d.calls[0].to, "+359888123456");
});

test("without ConvertBuilder's id from Middleware, the order is found by its number and date", async () => {
  const d = deps();
  MW[1700] = { status: "completed", statusText: "доставена е", externalId: null, createdAt: "2026-07-14T09:00:00Z" };
  d.cb.findByNumber = async (_site, no, around) => (no === "1700" && around ? CB["cb-1649"] : null);
  assert.match(await prepareFeedback(d, "1700", T0), /1 клиент готов[\s\S]*#1700 · Мария/);
  delete MW[1700];
});

test("a customer we already talked to is not queued again", async () => {
  const d = deps();
  await d.store.setJSON("feedback/fb-1649", { outcome: "declined" });
  const reply = await prepareFeedback(d, "1649", T0);
  assert.match(reply, /#1649 – вече говорихме с този клиент/);
  assert.equal(await d.store.get("fb-1649", { type: "json" }), null);
});

test("feedbackVariables still works for the old list format (deliveredAt)", () => {
  const v = feedbackVariables({ label: "1", name: "Мария Иванова", deliveredAt: "2026-11-07T10:00:00Z", items: [{ name: "BeeVenom Care Gel", q: 1 }] }, T0);
  assert.equal(v.delivered_ago, "преди около две седмици");
  assert.equal(v.bought_text, "гела с пчелна отрова – една туба");
});

test("one after another: the next customer is called as soon as a result arrives", async () => {
  const d = deps();
  await prepareFeedback(d, "1649 1641", T0);
  await startFeedback(d, T0);
  await runFeedbackQueue(d, T0); // calls 1649
  await d.store.setJSON("pending/359888123456", { variables: d.calls[0].variables, script: "feedback", at: T0.toISOString() });
  const init = await initiationData({ store: d.store, body: { caller_id: "+442045775777", conversation_id: "conv_a" }, outboundScript: async () => null, now: min(0.5) });
  const r = await handleWebhook(d, {
    type: "post_call_transcription",
    data: {
      conversation_id: "conv_a",
      conversation_initiation_client_data: { dynamic_variables: init.response.dynamic_variables },
      analysis: { data_collection_results: { fb_outcome: { value: "declined" } } },
      transcript: [{ role: "user", message: "Не, благодаря." }],
    },
  }, min(3));
  assert.match(r.next, /calling #1641/);
  assert.equal(d.calls.length, 2);
  assert.equal(d.calls[1].to, "+359899111222");
});

test("a test call's result does not start the queue", async () => {
  const d = deps();
  await prepareFeedback(d, "1649", T0);
  await startFeedback(d, T0);
  await handleWebhook(d, { type: "post_call_transcription", data: { conversation_id: "c", conversation_initiation_client_data: { dynamic_variables: { campaign: "feedback", test: "yes", order_key: "test" } }, analysis: {}, transcript: [] } }, T0);
  assert.equal(d.calls.length, 0);
});

test("a call dropped while connecting (no conversation, no result) counts as not answered", async () => {
  const d = deps();
  d.conversationState = async () => ({ status: "done", secs: 0, messages: 0 });
  await prepareFeedback(d, "1649 1641", T0);
  await startFeedback(d, T0);
  await runFeedbackQueue(d, T0); // calls 1649
  await d.store.setJSON("pending/359888123456", { variables: d.calls[0].variables, script: "feedback", at: T0.toISOString() });
  await initiationData({ store: d.store, body: { caller_id: "+442045775777", conversation_id: "conv_nocall" }, outboundScript: async () => null, now: min(0.5) });
  assert.ok((await d.store.get("fb-1649", { type: "json" })).answeredAt);
  // 5 minutes later ElevenLabs says "done, 0 seconds": back on the queue, the next one is called.
  assert.match((await runFeedbackQueue(d, min(5))).feedback, /calling #1641/);
  const rec = await d.store.get("fb-1649", { type: "json" });
  assert.equal(rec.status, "waiting");
});

test("a real conversation still going on is waited for", async () => {
  const d = deps();
  d.conversationState = async () => ({ status: "in-progress", secs: 0, messages: 4 });
  await prepareFeedback(d, "1649 1641", T0);
  await startFeedback(d, T0);
  await runFeedbackQueue(d, T0);
  await d.store.setJSON("pending/359888123456", { variables: d.calls[0].variables, script: "feedback", at: T0.toISOString() });
  await initiationData({ store: d.store, body: { caller_id: "+442045775777", conversation_id: "conv_talk" }, outboundScript: async () => null, now: min(0.5) });
  assert.equal((await runFeedbackQueue(d, min(5))).feedback, "call in progress");
  // A lost result does not block the queue for long.
  assert.match((await runFeedbackQueue(d, min(16))).feedback, /calling #1641/);
});
