// Telegram commands from Mitko: стоп / пусни / статус / тест.
import { getSettings, saveSettings } from "./store.mjs";
import { labelFor } from "./policy.mjs";
import { personaFromText, voiceFromText, PERSONAS, ALEKSANDRA_VOICES } from "./persona.mjs";
import { approveLessons, dismissProposal, lessonsList, removeLesson, abStats, abText, reviewPending, buildDigest } from "./coach.mjs";
import { prepareFeedback, testFeedback, startFeedback, stopFeedback, feedbackStatus } from "./feedback-queue.mjs";
import { approveFbRule, rejectFbRule, fbRulesList, removeFbRule } from "./sales-coach.mjs";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HELP = [
  "Команди:",
  "/stop – спира всички обаждания веднага",
  "/pusni – пуска ги отново",
  "/status – какво става в момента",
  "/test – Елена звъни на твоя тестов номер с примерна поръчка",
  "/test 1, /test 2, /test 3 – звъни Александра с глас 1, 2 или 3 (/glasove)",
  "/aleksandra 2 – Александра с глас 2 поема половината обаждания; /aleksandra off – само Елена",
  "/rezhim test – звъни на теб за всяка нова поръчка (тест)",
  "/rezhim live – звъни на клиентите",
  "/rezhim off – не звъни за поръчки",
  "",
  "Обратна връзка от стари клиенти:",
  "/obratna 1649 1641 … – подготвя тези поръчки (само доставени)",
  "/obratna_test 1649 – Елена звъни на теб като на този клиент",
  "/obratna_start – звъни на всички, по един (пон–съб 10:00–19:30)",
  "/obratna_stop, /obratna_status (с продажбите спрямо целта 20–25%)",
  "/da_N, /ne_N – добави или откажи правило, предложено след разговор без продажба",
  "/pravila – научените правила за обратната връзка; /mahni_p_N – махни едно",
  "",
  "Учене от разговорите:",
  "/uroci – какво е научила",
  "/urok_1, /urok_2… – одобри предложен урок от вечерния преглед",
  "/mahni_1… – махни научен урок",
  "/pregled – прегледай днешните разговори сега",
  "/ab – Елена срещу Александра",
].join("\n");

const SAMPLE = {
  order_key: "test",
  test: "yes",
  customer_name: "Митко",
  order_number: "1000",
  order_items: "BeeVenom Care Gel 2 плюс 1 броя",
  order_total: "27 евро и 40 цента",
  delivery_text: "до офис на Еконт „Пловдив – Тракия“",
  upsell_kind: "two_boxes_free",
  upsell_box_price: "4 евро и 90 цента",
  total_with_one_box: "32 евро и 30 цента",
  total_with_two_boxes: "32 евро и 70 цента",
  delivery_fee: "4 евро и 50 цента",
};

/**
 * @param {import("./engine.mjs").Deps} deps
 * @param {any} update Telegram Update object
 * @param {{setupCode?: string, fixedChatId?: string}} opts
 * @returns {Promise<{chatId?: number|string, reply?: string}>}
 */
export async function handleTelegram(deps, update, opts = {}) {
  const msg = update?.message;
  if (!msg?.text || !msg.chat) return {};
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const { store, config } = deps;
  const settings = await getSettings(store);
  const owner = String(opts.fixedChatId || settings.telegramChatId || "");

  // Registration: /start <setup code> (from the bot link Claude gives Mitko).
  const start = /^\/start(?:\s+(\S+))?$/.exec(text);
  if (start && opts.setupCode && start[1] === opts.setupCode && !owner) {
    await saveSettings(store, { ...settings, telegramChatId: chatId });
    return { chatId, reply: "Свързан съм ✅ Тук ще ти пиша за всяко обаждане, което трябва да видиш.\n\n" + HELP };
  }
  if (!owner || String(chatId) !== owner) return {}; // strangers get no answer

  const cmd = text.toLowerCase().split(/\s+/)[0].replace(/@.*$/, "");
  if (["/stop", "стоп", "спри"].includes(cmd)) {
    await saveSettings(store, { ...settings, paused: true });
    return { chatId, reply: "⏸ Спрях обажданията. Новите поръчки се събират и ще се обадим, когато напишеш /pusni." };
  }
  if (["/pusni", "/resume", "пусни"].includes(cmd)) {
    await saveSettings(store, { ...settings, paused: false });
    if (config.pausedByEnv) return { chatId, reply: "⏸ Обажданията са спрени от настройките в Netlify (CALLS_PAUSED=1), докато оправим линията. Входящите работят." };
    return { chatId, reply: "▶️ Обажданията са пуснати." };
  }
  if (["/rezhim", "режим"].includes(cmd)) {
    const want = (text.split(/\s+/)[1] || "").toLowerCase();
    const map = { test: "test", тест: "test", live: "live", клиенти: "live", off: "off", изкл: "off" };
    if (!map[want]) return { chatId, reply: "Напиши: /rezhim test, /rezhim live или /rezhim off" };
    await saveSettings(store, { ...settings, mode: map[want], modeSince: new Date().toISOString(), paused: false });
    const msg = {
      test: "🧪 Режим ТЕСТ: за всяка нова поръчка агентът звъни на теб (" + esc(config.testPhone || "няма тестов номер") + ") с истинските ѝ данни.",
      live: "📞 Режим КЛИЕНТИ: агентът звъни на клиентите за всяка нова поръчка. /stop спира веднага.",
      off: "⏹ Изключено: агентът не звъни за поръчки. /test работи.",
    }[map[want]];
    return { chatId, reply: msg + "\nВажи за поръчките, дошли от този момент нататък." };
  }
  if (["/status", "статус"].includes(cmd)) {
    const active = (await store.list({ prefix: "order/" })).blobs.length;
    const done = (await store.list({ prefix: "done/" })).blobs;
    const recent = [];
    for (const { key } of done.slice(-50)) {
      const r = await store.get(key, { type: "json" });
      if (r) recent.push(r);
    }
    recent.sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
    const lines = [
      `Режим: ${{ live: "звъни на клиентите", test: "ТЕСТ – звъни само на теб", off: "изключен" }[settings.mode || config.mode] || "изключен"}`,
      config.pausedByEnv ? "⏸ Спрени от настройките в Netlify (CALLS_PAUSED) – /pusni не ги пуска" : settings.paused ? "⏸ На пауза" : "▶️ Работи",
      `Часове: ${config.hours} (неделя ${config.hoursSunday || config.hours})`,
      `Чакат обаждане: ${active}`,
      "",
      "Последни:",
      ...recent.slice(0, 8).map((r) => `#${esc(r.orderNo)} ${esc(r.firstName)} – ${labelFor(r.state === "gave_up" ? "gave_up" : r.lastOutcome || r.state)}`),
    ];
    return { chatId, reply: lines.join("\n") };
  }
  if (cmd === "/callback_setup") {
    if (!opts.setupCallback) return { chatId, reply: "Настройката не е налична тук." };
    try {
      const { ok, report } = await opts.setupCallback();
      return { chatId, reply: [ok ? "✅ ElevenLabs е настроен за обаждания през Zadarma." : "⚠️ Настройката не е пълна:", ...report].join("\n") };
    } catch (err) {
      return { chatId, reply: `⚠️ Не успях да настроя ElevenLabs: ${esc(String(err.message).slice(0, 300))}` };
    }
  }
  // Learning from the calls (lib/coach.mjs).
  const urok = /^\/urok_(\d+)$/.exec(cmd);
  if (urok) return { chatId, reply: await approveLessons(store, [Number(urok[1])]) };
  if (cmd === "/uroci_vsichki") return { chatId, reply: await approveLessons(store, "all") };
  if (cmd === "/uroci_ne") return { chatId, reply: await dismissProposal(store) };
  if (["/uroci", "уроци"].includes(cmd)) return { chatId, reply: await lessonsList(store) };
  const mahni = /^\/mahni_(\d+)$/.exec(cmd);
  if (mahni) return { chatId, reply: await removeLesson(store, Number(mahni[1])) };
  if (["/glasove", "гласове"].includes(cmd)) {
    const cur = settings.aleksandraVoiceId;
    return {
      chatId,
      reply: [
        "<b>Гласове за Александра</b> (пробвай с /test 1, /test 2, /test 3):",
        ...ALEKSANDRA_VOICES.map((v, i) => `${i + 1}. ${esc(v.label)}${v.id === cur ? " ✅ избран" : ""}`),
        "",
        cur ? "Александра поема половината обаждания. /aleksandra off – само Елена." : "Още не е избран. /aleksandra 1, 2 или 3 – пуска теста Елена срещу Александра.",
      ].join("\n"),
    };
  }
  if (["/aleksandra", "александра"].includes(cmd)) {
    const arg = (text.split(/\s+/)[1] || "").toLowerCase();
    if (["off", "изкл", "не", "0"].includes(arg)) {
      await saveSettings(store, { ...settings, aleksandraVoiceId: null });
      return { chatId, reply: "Само Елена звъни. Резултатите от теста остават в /ab." };
    }
    const v = voiceFromText(arg);
    if (!v) return { chatId, reply: "Напиши /aleksandra 1, 2 или 3 (виж /glasove) или /aleksandra off." };
    await saveSettings(store, { ...settings, aleksandraVoiceId: v.id });
    return { chatId, reply: `✅ Александра е с гласа „${esc(v.label)}“ и поема половината обаждания по поръчки. Сравнението: /ab и във вечерния преглед.` };
  }
  if (cmd === "/ab") return { chatId, reply: "<b>Елена срещу Александра (последните 30 дни):</b>\n" + abText(await abStats(store)) };
  if (cmd === "/pregled") {
    if (!opts.ai) return { chatId, reply: "Прегледът не е наличен тук." };
    try {
      await reviewPending(opts.ai, new Date(), { max: 3 });
      return { chatId, reply: (await buildDigest(opts.ai)) || "Днес още няма разговори за преглед." };
    } catch (err) {
      return { chatId, reply: `⚠️ Прегледът не стана: ${esc(String(err.message).slice(0, 300))}` };
    }
  }
  // Feedback calls to earlier customers (lib/feedback-queue.mjs).
  if (cmd === "/obratna") return { chatId, reply: await prepareFeedback(deps, text.slice(cmd.length)) };
  if (cmd === "/obratna_test") return { chatId, reply: await testFeedback(deps, text.slice(cmd.length)) };
  if (cmd === "/obratna_start") return { chatId, reply: await startFeedback(deps) };
  if (cmd === "/obratna_stop") return { chatId, reply: await stopFeedback(deps) };
  if (cmd === "/obratna_status") return { chatId, reply: await feedbackStatus(deps) };
  const da = /^\/da_(\d+)$/.exec(cmd);
  if (da) return { chatId, reply: await approveFbRule(store, Number(da[1])) };
  const ne = /^\/ne_(\d+)$/.exec(cmd);
  if (ne) return { chatId, reply: await rejectFbRule(store, Number(ne[1])) };
  if (["/pravila", "правила"].includes(cmd)) return { chatId, reply: await fbRulesList(store) };
  const mp = /^\/mahni_p_(\d+)$/.exec(cmd);
  if (mp) return { chatId, reply: await removeFbRule(store, Number(mp[1])) };
  if (["/test", "тест"].includes(cmd)) {
    if (!config.testPhone) return { chatId, reply: "Няма зададен тестов номер (TEST_PHONE)." };
    const arg = text.split(/\s+/)[1];
    const persona = personaFromText(arg) || "elena";
    // A test of Александра uses the asked voice, else her chosen one, else the first.
    const voice = persona === "aleksandra" ? voiceFromText(arg) || ALEKSANDRA_VOICES.find((v) => v.id === settings.aleksandraVoiceId) || ALEKSANDRA_VOICES[0] : null;
    try {
      await deps.call({
        to: config.testPhone,
        variables: { ...SAMPLE, shop_name: config.shopName, delivery_days: config.deliveryDays, persona, ...(voice ? { voice_id: voice.id } : {}) },
      });
      const who = voice ? `Александра (глас „${esc(voice.label)}“)` : PERSONAS[persona];
      return { chatId, reply: `📞 ${who} звъни на ${config.testPhone} с примерна поръчка. След разговора ще ти пиша резултата.` };
    } catch (err) {
      return { chatId, reply: `⚠️ Не успях да звънна: ${esc(String(err.message).slice(0, 300))}` };
    }
  }
  return { chatId, reply: HELP };
}
