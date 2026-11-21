// Wire the engine to the real services, from environment variables.
import { openStore, getSettings } from "./store.mjs";
import { startCall, ringSeconds, conversationState } from "./elevenlabs.mjs";
import { sendTelegram } from "./telegram.mjs";
import { convertBuilder } from "./convertbuilder.mjs";
import { middleware } from "./middleware.mjs";
import { startCallbackCall } from "./callback.mjs";
import { platform } from "./platform.mjs";

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
    // CALLS_PAUSED=1 in Netlify stops all outgoing calls, whatever Telegram says (incoming calls still work).
    pausedByEnv: env("CALLS_PAUSED") === "1",
    // "zadarma": Zadarma rings the customer and connects them to the agent (see lib/callback.mjs).
    // "elevenlabs": ElevenLabs calls out itself (blocked by Zadarma for Bulgarian numbers).
    callRoute: callRoute(),
    ready:
      callRoute() === "zadarma"
        ? Boolean(env("ZADARMA_KEY") && env("ZADARMA_SECRET") && env("ZADARMA_FROM"))
        : Boolean(env("ELEVENLABS_API_KEY") && env("EL_AGENT_ID") && env("EL_PHONE_NUMBER_ID")),
  };
}

const callRoute = () => (env("CALL_ROUTE", "elevenlabs").toLowerCase() === "zadarma" ? "zadarma" : "elevenlabs");

/** Zadarma settings for the callback: our number, the PBX extension, API key. */
export function zadarmaConfig() {
  return {
    key: env("ZADARMA_KEY"),
    secret: env("ZADARMA_SECRET"),
    from: env("ZADARMA_FROM"), // the agent's number, e.g. +35924370192
    sip: env("ZADARMA_SIP"), // PBX extension, e.g. 100
  };
}

/** Messages go to the chat that registered with /start <TELEGRAM_SETUP_CODE> (or TELEGRAM_CHAT_ID). */
export function telegramNotify(store) {
  return async (text) => {
    const chatId = env("TELEGRAM_CHAT_ID") || (await getSettings(store)).telegramChatId;
    return sendTelegram({ token: env("TELEGRAM_BOT_TOKEN"), chatId, text });
  };
}

export function realCall(store) {
  if (callRoute() === "zadarma") {
    // script: "feedback" = the feedback script bundled in the code (lib/scripts.generated.mjs).
    return ({ to, variables, script = "" }) => startCallbackCall({ store, zadarma: zadarmaConfig(), to, variables, script });
  }
  return ({ to, variables, script = "" }) =>
    startCall({
      apiKey: env("ELEVENLABS_API_KEY"),
      agentId: script === "feedback" ? env("EL_FEEDBACK_AGENT_ID") : env("EL_AGENT_ID"),
      phoneNumberId: env("EL_PHONE_NUMBER_ID"),
      provider: env("EL_PHONE_PROVIDER", "sip"),
      to,
      variables,
    });
}

export function realDeps() {
  const config = readConfig();
  const store = openStore();
  const shop = convertBuilder({ sites: config.sites, env });
  const mw = middleware({ env });
  // OrderDesk (PLATFORM_URL, PLATFORM_TOKEN): where the orders live now. The agent takes the orders to call
  // from it and reports every call; after a confirmation OrderDesk confirms the order and makes the waybill.
  const plat = platform({ env });
  return {
    store,
    mw,
    platform: plat,
    cb: plat.enabled
      ? {
          ...shop,
          // If OrderDesk does not answer, fall back to ConvertBuilder for the shops the agent has keys for.
          fetchNewOrders: async (args) => {
            try {
              return await plat.fetchNewOrders({ ...args, sites: config.sites });
            } catch (err) {
              console.error("platform unavailable, reading ConvertBuilder", err.message);
              return shop.fetchNewOrders(args);
            }
          },
          isStillPending: async (rec) => (rec.platformId ? await plat.isStillPending(rec) : await shop.isStillPending(rec)) && (await mw.stillOpen(rec)),
        }
      : // Call only if the order is still pending in ConvertBuilder AND nobody confirmed or shipped it in Middleware.
        { ...shop, isStillPending: async (rec) => (await shop.isStillPending(rec)) && (await mw.stillOpen(rec)) },
    call: realCall(store),
    ringSecs: (conversationId) => ringSeconds({ apiKey: env("ELEVENLABS_API_KEY"), conversationId }),
    conversationState: (conversationId) => conversationState({ apiKey: env("ELEVENLABS_API_KEY"), conversationId }),
    notify: telegramNotify(store),
    config,
  };
}

export { env };
