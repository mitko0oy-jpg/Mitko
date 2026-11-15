// Wire the engine to the real services, from environment variables.
import { openStore, getSettings } from "./store.mjs";
import { startCall } from "./elevenlabs.mjs";
import { sendTelegram } from "./telegram.mjs";
import { convertBuilder } from "./convertbuilder.mjs";
import { COUNTRIES, parseSiteCountries } from "./countries.mjs";

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
    maxCallsPerRun: Number(env("MAX_CALLS_PER_RUN", "1")) || 1,
    ready: Boolean(env("ELEVENLABS_API_KEY") && env("EL_AGENT_ID") && env("EL_PHONE_NUMBER_ID")),
    siteCountries: parseSiteCountries(env("SITE_COUNTRIES")),
    countries: countryConfigs(),
  };
}

/** Per-country settings: is its agent + local number configured, calling hours, texts. */
export function countryConfigs() {
  const out = {};
  for (const [code, c] of Object.entries(COUNTRIES)) {
    out[code] = {
      ready: Boolean(env("ELEVENLABS_API_KEY") && env(c.env.agent) && env(c.env.phone)),
      hours: env(c.env.hours, c.defaults.hours),
      hoursSunday: env(c.env.hoursSunday, c.defaults.hoursSunday),
      shopName: env(c.env.shopName, c.defaults.shopName),
      deliveryDays: env(c.env.deliveryDays, c.defaults.deliveryDays),
      deliveryText: c.defaults.deliveryText,
    };
  }
  return out;
}

/** Messages go to the chat that registered with /start <TELEGRAM_SETUP_CODE> (or TELEGRAM_CHAT_ID). */
export function telegramNotify(store) {
  return async (text) => {
    const chatId = env("TELEGRAM_CHAT_ID") || (await getSettings(store)).telegramChatId;
    return sendTelegram({ token: env("TELEGRAM_BOT_TOKEN"), chatId, text });
  };
}

/** Calls go out through the country's own agent and local number (Bulgarian by default). */
export function realCall() {
  return ({ to, variables, country = "bg" }) =>
    startCall({
      apiKey: env("ELEVENLABS_API_KEY"),
      agentId: env((COUNTRIES[country] || COUNTRIES.bg).env.agent),
      phoneNumberId: env((COUNTRIES[country] || COUNTRIES.bg).env.phone),
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
    cb: convertBuilder({ sites: config.sites, env, siteCountries: config.siteCountries }),
    call: realCall(),
    notify: telegramNotify(store),
    config,
  };
}

export { env };
