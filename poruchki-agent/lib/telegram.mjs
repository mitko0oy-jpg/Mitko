import { createHash } from "node:crypto";
import { getSettings, saveSettings } from "./store.mjs";

// Minimal Telegram bot client: send a message to Mitko's chat.

export async function sendTelegram({ token, chatId, text, fetchImpl = fetch }) {
  if (!token || !chatId) {
    console.log("[telegram not configured]\n" + text);
    return false;
  }
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  });
  if (!res.ok) {
    console.error("Telegram send failed", res.status, (await res.text()).slice(0, 300));
    return false;
  }
  return true;
}

/**
 * Point the bot at our /webhook/telegram once (and again if token or URL change),
 * so nobody has to call Telegram's setWebhook by hand.
 */
export async function ensureTelegramWebhook({ store, token, secret, url, fetchImpl = fetch }) {
  if (!token || !secret || !url) return "not configured";
  const mark = createHash("sha256").update(`${token}|${url}|${secret}`).digest("hex").slice(0, 16);
  const settings = await getSettings(store);
  if (settings.telegramHook === mark) return "ok";
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
  });
  if (!res.ok) return `setWebhook failed: ${res.status}`;
  await saveSettings(store, { ...(await getSettings(store)), telegramHook: mark });
  return "registered";
}
