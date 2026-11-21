import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { saveReview } from "../lib/coach.mjs";
import { initiationData } from "../lib/callback.mjs";
import { salesReviewPending, approveFbRule, rejectFbRule, fbRulesList, removeFbRule, salesStats, salesText, getFbRules } from "../lib/sales-coach.mjs";
import { handleTelegram } from "../lib/commands.mjs";

const NOW = new Date("2026-11-21T15:00:00Z");
const env = (k) => ({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "https://ai.test" })[k] || "";

function fakeAI(answer) {
  const asked = [];
  const fetchImpl = async (_url, init) => {
    asked.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(answer) }] }), { status: 200 });
  };
  return { asked, fetchImpl };
}

function feedbackCall(id, outcome, transcript = "Асистент: Здравейте!\nКлиент: Имам още гел.") {
  return {
    conversationId: id,
    transcript,
    outcome: "confirmed", // the order agent's own field – must not be used for feedback calls
    fields: { fb_outcome: outcome },
    variables: { campaign: "feedback", order_number: "939", order_key: "fb-939" },
  };
}

test("a feedback call without a sale: Mitko gets the reason and one rule to approve", async () => {
  const store = memoryStore();
  const messages = [];
  await saveReview(store, feedbackCall("c1", "later"), NOW);
  await saveReview(store, feedbackCall("c2", "reorder"), NOW); // a sale – nothing to learn
  await saveReview(store, feedbackCall("c3", "no_conversation", "Асистент: Здравейте!"), NOW);
  const { asked, fetchImpl } = fakeAI({
    reason: "has_stock",
    summary: "Има още половин туба и каза да звъннем след празниците.",
    agent_part: "Можеше да спомене, че цената за клиенти важи и за подарък.",
    rule: "Когато клиентът още има гел, кажи веднъж, че цената за клиенти важи и за подарък на близък.",
    why: "Много клиенти купуват подаръци преди празниците.",
  });
  const r = await salesReviewPending({ store, env, fetchImpl, notify: async (t) => messages.push(t) }, NOW, { max: 5 });
  assert.equal(r.sales, 1);
  assert.equal(asked.length, 1, "only the call without a sale is analysed");
  assert.match(asked[0].system, /20–25%/);
  assert.match(messages[0], /Урок от разговор #939/);
  assert.match(messages[0], /Причина: още има гел/);
  assert.match(messages[0], /\/da_1 – добави го · ❌ \/ne_1/);

  // Not used before approval.
  assert.equal((await getFbRules(store)).length, 0);
  assert.match(await approveFbRule(store, 1, NOW), /Добавено – важи от следващия разговор/);
  assert.match(await approveFbRule(store, 1, NOW), /вече е добавено/);
  assert.match(await fbRulesList(store), /1\. Когато клиентът още има гел/);

  // The next feedback call carries the rule; an order call does not.
  await store.setJSON("pending/359888123456", { variables: { campaign: "feedback", order_key: "fb-944", customer_name: "госпожо Петрова" }, script: "feedback", at: NOW.toISOString() });
  const init = await initiationData({ store, body: { caller_id: "+442045775777", conversation_id: "x" }, outboundScript: async () => ({ prompt: "Потвърждение", firstMessage: "Здравейте" }), feedbackRules: await getFbRules(store), now: NOW });
  assert.match(init.response.conversation_config_override.agent.prompt.prompt, /Научено от истински разговори[\s\S]*цената за клиенти важи и за подарък/);

  assert.match(await removeFbRule(store, 1), /Махнах/);
  assert.equal((await getFbRules(store)).length, 0);
});

test("a rejected rule is never added; the reviewer is not asked twice about a call", async () => {
  const store = memoryStore();
  const messages = [];
  await saveReview(store, feedbackCall("c1", "declined"), NOW);
  const { asked, fetchImpl } = fakeAI({ reason: "no_need", summary: "Не му трябва.", agent_part: "", rule: "Когато каже не, предложи пак.", why: "" });
  await salesReviewPending({ store, env, fetchImpl, notify: async (t) => messages.push(t) }, NOW);
  await salesReviewPending({ store, env, fetchImpl, notify: async (t) => messages.push(t) }, NOW);
  assert.equal(asked.length, 1);
  assert.match(messages[0], /Елена е постъпила добре/);
  assert.match(await rejectFbRule(store, 1), /не го добавям/);
  assert.match(await approveFbRule(store, 1, NOW), /отказано/);
  assert.equal((await getFbRules(store)).length, 0);
});

test("sales are counted against the 20–25% goal from real conversations only", async () => {
  const store = memoryStore();
  const at = NOW.toISOString();
  await store.setJSON("feedback/fb-1", { at, outcome: "reorder", reorderPack: "3" });
  await store.setJSON("feedback/fb-2", { at, outcome: "declined" });
  await store.setJSON("feedback/fb-3", { at, outcome: "later" });
  await store.setJSON("feedback/fb-4", { at, outcome: "not_using" });
  await store.setJSON("feedback/fb-5", { at, outcome: "no_conversation" }); // not a talk
  await store.setJSON("feedback/fb-6", { at, outcome: "voicemail" }); // not a talk
  const s = await salesStats(store, NOW);
  assert.deepEqual(s, { talks: 4, sales: 1, pct: 25 });
  assert.equal(salesText(s), "✅ Продажби: 1 от 4 разговора (25%) · цел 20–25%");
  assert.match(salesText({ talks: 5, sales: 0, pct: 0 }), /📈 Продажби: 0 от 5/);
});

test("Telegram: /da_N, /ne_N, /pravila, /mahni_p_N", async () => {
  const store = memoryStore();
  await store.setJSON("meta/settings", { telegramChatId: 7 });
  await store.setJSON("coach/fb-prop/0001", { no: 1, text: "Правило едно.", status: "proposed" });
  const deps = { store, config: {} };
  const send = async (text) => (await handleTelegram(deps, { message: { chat: { id: 7 }, text } })).reply;
  assert.match(await send("/da_1"), /Добавено/);
  assert.match(await send("/pravila"), /Правило едно\. – \/mahni_p_1/);
  assert.match(await send("/mahni_p_1"), /Махнах/);
  assert.match(await send("/ne_2"), /Няма предложение №2/);
});
