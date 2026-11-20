import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../lib/store.mjs";
import { initiationData } from "../lib/callback.mjs";
import { pickPersona, personaFromText, voiceFromText, renamePersona, ALEKSANDRA_VOICES } from "../lib/persona.mjs";
import { saveReview, reviewPending, buildDigest, approveLessons, removeLesson, lessonsList, getLessons, abStats, abText, purgeReviews, sofiaDay } from "../lib/coach.mjs";
import { handleWebhook } from "../lib/engine.mjs";
import { handleTelegram } from "../lib/commands.mjs";

const T0 = new Date("2026-11-20T15:00:00Z");
const SCRIPT = async () => ({ prompt: "Ти си Елена. Поръчка за {{customer_name}}.", firstMessage: "Здравейте, обажда се Елена.", language: "bg" });
const env = (vars) => (k) => vars[k] ?? "";

// A fake AI Gateway: answers each request with the next queued JSON.
function fakeAI(answers) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body, key: init.headers["x-api-key"] });
    return Response.json({ content: [{ type: "text", text: JSON.stringify(answers.shift()) }] });
  };
  return { fetchImpl, requests };
}

test("persona: Александра only when she has a voice, same order keeps the same voice", () => {
  assert.equal(pickPersona("order/bg/1", {}), "elena");
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(pickPersona(`order/bg/${i}`, { aleksandraVoiceId: "v" }));
  assert.deepEqual([...seen].sort(), ["aleksandra", "elena"]);
  assert.equal(pickPersona("order/bg/7", { aleksandraVoiceId: "v" }), pickPersona("order/bg/7", { aleksandraVoiceId: "v" }));
  assert.equal(renamePersona("Здравейте, обажда се Елена.", "aleksandra"), "Здравейте, обажда се Александра.");
  assert.equal(personaFromText("2"), "aleksandra");
  assert.equal(personaFromText("елена"), "elena");
  assert.equal(personaFromText(undefined), null);
  assert.equal(voiceFromText("моника").key, "monica");
  assert.equal(voiceFromText("3").id, ALEKSANDRA_VOICES[2].id);
});

test("call start: Александра gets her name, her voice and the learned rules", async () => {
  const store = memoryStore();
  await store.setJSON("pending/359899876063", { variables: { order_key: "test", persona: "aleksandra", voice_id: "voiceX", customer_name: "Митко" }, at: T0.toISOString() });
  const { response } = await initiationData({
    store,
    body: { caller_id: "+359899876063" },
    outboundScript: SCRIPT,
    lessons: [{ text: "Не казвай „Чудесно“ два пъти." }],
    now: new Date(T0.getTime() + 30_000),
  });
  const o = response.conversation_config_override;
  assert.equal(o.tts.voice_id, "voiceX");
  assert.equal(o.agent.first_message, "Здравейте, обажда се Александра.");
  assert.match(o.agent.prompt.prompt, /^Ти си Александра\./);
  assert.match(o.agent.prompt.prompt, /# Научено от истински разговори[\s\S]*Не казвай „Чудесно“ два пъти\./);
  assert.equal(response.dynamic_variables.persona, "aleksandra");
});

test("call start: Елена by default, no voice change", async () => {
  const store = memoryStore();
  await store.setJSON("pending/359899876063", { variables: { order_key: "order/bg/5" }, at: T0.toISOString() });
  const { response } = await initiationData({ store, body: { caller_id: "0899876063" }, outboundScript: SCRIPT, now: T0 });
  assert.equal(response.dynamic_variables.persona, "elena");
  assert.equal(response.conversation_config_override.tts, undefined);
  assert.doesNotMatch(response.conversation_config_override.agent.prompt.prompt, /Научено/);
});

function postCall(id, { persona = "elena", outcome = "confirmed", upsell = "none", orderKey = "test" } = {}) {
  return {
    type: "post_call_transcription",
    data: {
      conversation_id: id,
      agent_id: "agent_in",
      conversation_initiation_client_data: { dynamic_variables: { order_key: orderKey, persona, test: "yes" } },
      analysis: { data_collection_results: { outcome: { value: outcome }, upsell: { value: upsell } } },
      metadata: { call_duration_secs: 60 },
      transcript: [
        { role: "agent", message: "Здравейте, обажда се Елена." },
        { role: "user", message: "Да, аз съм." },
        { role: "agent", message: "Чудесно! Чудесно!" },
      ],
    },
  };
}

test("every call is kept for review; the review and the evening report propose rules", async () => {
  const store = memoryStore();
  const notified = [];
  const deps = { store, notify: async (t) => notified.push(t), config: {} };
  await handleWebhook(deps, postCall("conv_a"), T0);
  const key = `review/${sofiaDay(T0)}/conv_a`;
  const saved = await store.get(key, { type: "json" });
  assert.equal(saved.kind, "test");
  assert.match(saved.transcript, /Клиент: Да, аз съм\./);

  const ai = fakeAI([
    { natural: 3, clear: 5, correct: 5, issues: [{ kind: "repetition", quote: "Чудесно! Чудесно!", fix: "Кажи кратко „Добре.“" }], good: ["Представи се ясно."] },
    { summary: "Денят мина добре.", lessons: [{ text: "Не повтаряй „Чудесно“.", why: "Звучи като робот." }] },
  ]);
  const ctx = { store, env: env({ ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "https://gw.example/anthropic" }), fetchImpl: ai.fetchImpl };
  assert.deepEqual(await reviewPending(ctx, T0), { reviewed: 1 });
  assert.equal(ai.requests[0].url, "https://gw.example/anthropic/v1/messages");
  assert.equal(ai.requests[0].key, "k");
  assert.equal((await store.get(key, { type: "json" })).review.natural, 3);

  const text = await buildDigest(ctx, T0);
  assert.match(text, /Естественост 3\.0/);
  assert.match(text, /„Чудесно! Чудесно!“ → Кажи кратко/);
  assert.match(text, /\/urok_1/);

  assert.match(await approveLessons(store, [1], T0), /Научено/);
  assert.deepEqual((await getLessons(store)).map((l) => l.text), ["Не повтаряй „Чудесно“."]);
  assert.match(await approveLessons(store, [1], T0), /вече е научено/);
  assert.match(await lessonsList(store), /mahni_1/);
  assert.match(await removeLesson(store, 1), /Махнах/);
  assert.equal((await getLessons(store)).length, 0);
});

test("no AI: calls are still kept, the review waits", async () => {
  const store = memoryStore();
  await saveReview(store, { conversationId: "c1", transcript: "Клиент: ало", variables: {} }, T0);
  assert.deepEqual(await reviewPending({ store, env: env({}) }, T0), { reviewed: 0, aiOff: true });
});

test("A/B numbers count only order calls, per voice", async () => {
  const store = memoryStore();
  const add = (id, persona, outcome, upsell, orderKey = "order/bg/1") =>
    saveReview(store, { conversationId: id, transcript: "Клиент: да", outcome, upsell, variables: { order_key: orderKey, persona } }, T0);
  await add("1", "elena", "confirmed", "one_box");
  await add("2", "elena", "canceled", "none");
  await add("3", "aleksandra", "confirmed", "two_boxes");
  await add("4", "aleksandra", "confirmed", "none", "test");
  const by = await abStats(store, T0);
  assert.deepEqual(by, { elena: { calls: 2, confirmed: 1, upsell: 1 }, aleksandra: { calls: 1, confirmed: 1, upsell: 1 } });
  assert.match(abText(by), /Елена: 2 разговора, потвърдени 1 \(50%\)[\s\S]*Александра: 1 разговора/);
  assert.equal(await purgeReviews(store, new Date(T0.getTime() + 61 * 86_400_000)), 4);
});

test("Telegram: test with a chosen voice, pick Александра's voice, approve a rule", async () => {
  const store = memoryStore();
  await store.setJSON("meta/settings", { telegramChatId: 1 });
  const calls = [];
  const deps = { store, config: { testPhone: "+359899876063" }, call: async (c) => calls.push(c) };
  const upd = (text) => ({ message: { chat: { id: 1 }, text } });

  assert.match((await handleTelegram(deps, upd("/test 2"), {})).reply, /Александра \(глас „Monica/);
  assert.equal(calls[0].variables.persona, "aleksandra");
  assert.equal(calls[0].variables.voice_id, ALEKSANDRA_VOICES[1].id);
  await handleTelegram(deps, upd("/test"), {});
  assert.equal(calls[1].variables.persona, "elena");

  assert.match((await handleTelegram(deps, upd("/aleksandra 3"), {})).reply, /Milena/);
  assert.equal((await store.get("meta/settings", { type: "json" })).aleksandraVoiceId, ALEKSANDRA_VOICES[2].id);
  assert.match((await handleTelegram(deps, upd("/glasove"), {})).reply, /3\. Milena.*✅ избран/);
  assert.match((await handleTelegram(deps, upd("/aleksandra off"), {})).reply, /Само Елена/);

  await store.setJSON("coach/proposal", { day: "2026-11-20", lessons: [{ text: "Правило А", why: "" }, { text: "Правило Б", why: "" }], used: [] });
  assert.match((await handleTelegram(deps, upd("/uroci_vsichki"), {})).reply, /Правило А[\s\S]*Правило Б/);
  assert.match((await handleTelegram(deps, upd("/uroci"), {})).reply, /1\. Правило А/);
  assert.match((await handleTelegram(deps, upd("/mahni_2"), {})).reply, /Правило Б/);
});
