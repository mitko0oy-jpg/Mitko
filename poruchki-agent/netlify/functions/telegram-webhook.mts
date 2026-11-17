// Telegram sends Mitko's messages to the bot here (/stop, /pusni, /status, /test).
import type { Config } from "@netlify/functions";
import { realDeps, env } from "../../lib/config.mjs";
import { handleTelegram } from "../../lib/commands.mjs";
import { sendTelegram } from "../../lib/telegram.mjs";

export default async (req: Request) => {
  const secret = env("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json().catch(() => null);
  const { chatId, reply } = await handleTelegram(realDeps(), update, {
    setupCode: env("TELEGRAM_SETUP_CODE"),
    fixedChatId: env("TELEGRAM_CHAT_ID"),
  });
  if (chatId && reply) await sendTelegram({ token: env("TELEGRAM_BOT_TOKEN"), chatId, text: reply });
  return Response.json({ ok: true });
};

export const config: Config = { path: "/webhook/telegram", method: "POST" };
