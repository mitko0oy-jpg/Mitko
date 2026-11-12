import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore, getSettings } from "../lib/store.mjs";
import { handleTelegram } from "../lib/commands.mjs";

const upd = (chatId, text) => ({ message: { chat: { id: chatId }, text } });

function deps() {
  const calls = [];
  return {
    calls,
    store: memoryStore(),
    config: { mode: "test", testPhone: "+359877000000", hours: "09:00-21:00", hoursSunday: "10:00-19:00", shopName: "Здравец Натура", deliveryDays: "един до два работни дни" },
    async call(a) {
      calls.push(a);
      return { conversationId: "c1" };
    },
  };
}

test("registration with the setup code, then only that chat is obeyed", async () => {
  const d = deps();
  assert.deepEqual(await handleTelegram(d, upd(555, "/stop"), { setupCode: "abc" }), {}, "nobody registered yet");
  assert.deepEqual(await handleTelegram(d, upd(555, "/start wrong"), { setupCode: "abc" }), {});
  const r = await handleTelegram(d, upd(555, "/start abc"), { setupCode: "abc" });
  assert.match(r.reply, /Свързан съм/);
  assert.equal((await getSettings(d.store)).telegramChatId, 555);
  assert.deepEqual(await handleTelegram(d, upd(999, "/start abc"), { setupCode: "abc" }), {}, "second chat cannot take over");
  assert.deepEqual(await handleTelegram(d, upd(999, "/stop"), { setupCode: "abc" }), {});
  assert.equal((await getSettings(d.store)).paused, false);
});

test("stop, resume, status and test call", async () => {
  const d = deps();
  await handleTelegram(d, upd(1, "/start abc"), { setupCode: "abc" });
  assert.match((await handleTelegram(d, upd(1, "стоп"), {})).reply, /Спрях/);
  assert.equal((await getSettings(d.store)).paused, true);
  assert.match((await handleTelegram(d, upd(1, "/status"), {})).reply, /На пауза/);
  assert.match((await handleTelegram(d, upd(1, "/pusni"), {})).reply, /пуснати/);
  assert.equal((await getSettings(d.store)).paused, false);
  const t = await handleTelegram(d, upd(1, "/test"), {});
  assert.match(t.reply, /Звъня на \+359877000000/);
  assert.equal(d.calls[0].variables.order_key, "test");
  assert.equal(d.calls[0].to, "+359877000000");
  assert.match((await handleTelegram(d, upd(1, "здрасти"), {})).reply, /Команди/);
});
