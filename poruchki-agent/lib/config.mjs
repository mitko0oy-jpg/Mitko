// Wire the engine to the real services, from environment variables.
import { openStore, getSettings } from "./store.mjs";
import { startCall } from "./elevenlabs.mjs";
import { sendTelegram } from "./telegram.mjs";
import { convertBuilder } from "./convertbuilder.mjs";

const env = (k, d = "") => (globalThis.Netlify?.env.get(k) ?? process.env[k] ?? d);

export function readConfig() {
  return {
    mode: env("MODE", "test"), // test | live | off
    testPhone: env("TEST_PHONE"),
    hours: env("CALL_HOURS", "09:00-21:00"),
    hoursSunday: env("CALL_HOURS_SUNDAY", "10:00-19:00"),
    shopName: env("SHOP_NAME", "магазина с пчелната отрова"),
    deliveryDays: env("DELIVERY_DAYS", "един до два работни дни"),
    sites: env("SITES", "bg").split(",").map((s) => s.trim()).filter(Boolean),
    inboundAgentId: env("EL_INBOUND_AGENT_ID"),
    ready: Boolean(env("ELEVENLABS_API_KEY") && env("EL_AGENT_ID") && env("EL_PHONE_NUMBER_ID")),
  };
}

/** Messages go to the chat that registered with /start <TELEGRAM_SETUP_CODE> (or TELEGRAM_CHAT_ID). */
export function telegramNotify(store) {
  return async (text) => {
    const chatId = env("TELEGRAM_CHAT_ID") || (await getSettings(store)).telegramChatId;
    return sendTelegram({ token: env("TELEGRAM_BOT_TOKEN"), chatId, text });
  };
}

export function realCall() {
  return ({ to, variables }) =>
    startCall({
      apiKey: env("ELEVENLABS_API_KEY"),
      agentId: env("EL_AGENT_ID"),
      phoneNumberId: env("EL_PHONE_NUMBER_ID"),
      provider: env("EL_PHONE_PROVIDER", "sip"),
      to,
      variables,
    });
}

export function realDeps() {
  const config = readConfig();
  const store = openStore();
  return {
    store,
    cb: convertBuilder({ sites: config.sites, env }),
    call: realCall(),
    notify: telegramNotify(store),
    config,
  };
}

export { env };
