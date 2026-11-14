// Telegram commands from Mitko: стоп / пусни / статус / тест.
import { getSettings, saveSettings } from "./store.mjs";
import { labelFor } from "./policy.mjs";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HELP = [
  "Команди:",
  "/stop – спира всички обаждания веднага",
  "/pusni – пуска ги отново",
  "/status – какво става в момента",
  "/test – агентът звъни на твоя тестов номер с примерна поръчка",
  "/rezhim test – звъни на теб за всяка нова поръчка (тест)",
  "/rezhim live – звъни на клиентите",
  "/rezhim off – не звъни за поръчки",
].join("\n");

const SAMPLE = {
  order_key: "test",
  test: "yes",
  customer_name: "Митко",
  order_number: "1000",
  order_items: "BeeVenom Care Gel 2 плюс 1 броя",
  order_total: "24 евро и 40 цента",
  delivery_text: "Доставка до офис на Еконт, Пловдив, офис Тракия",
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
      settings.paused ? "⏸ На пауза" : "▶️ Работи",
      `Часове: ${config.hours} (неделя ${config.hoursSunday || config.hours})`,
      `Чакат обаждане: ${active}`,
      "",
      "Последни:",
      ...recent.slice(0, 8).map((r) => `#${esc(r.orderNo)} ${esc(r.firstName)} – ${labelFor(r.state === "gave_up" ? "gave_up" : r.lastOutcome || r.state)}`),
    ];
    return { chatId, reply: lines.join("\n") };
  }
  if (["/test", "тест"].includes(cmd)) {
    if (!config.testPhone) return { chatId, reply: "Няма зададен тестов номер (TEST_PHONE)." };
    try {
      await deps.call({ to: config.testPhone, variables: { ...SAMPLE, shop_name: config.shopName, delivery_days: config.deliveryDays } });
      return { chatId, reply: `📞 Звъня на ${config.testPhone} с примерна поръчка. След разговора ще ти пиша резултата.` };
    } catch (err) {
      return { chatId, reply: `⚠️ Не успях да звънна: ${esc(String(err.message).slice(0, 300))}` };
    }
  }
  return { chatId, reply: HELP };
}
