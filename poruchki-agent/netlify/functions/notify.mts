// Известие от OrderDesk към Telegram на Митко (същият бот и чат като обажданията).
//   POST /api/notify   Authorization: Bearer <PLATFORM_TOKEN>  (= AGENT_TOKEN на OrderDesk)   {"text": "..."}
// Текстът е обикновен (без HTML) – тук се ескейпва; до 3500 знака.
import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { env, telegramNotify } from "../../lib/config.mjs";
import { openStore } from "../../lib/store.mjs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default async (req: Request) => {
  const want = env("PLATFORM_TOKEN") || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (want.length < 32 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new Response("not found", { status: 404 });
  }
  let text = "";
  try {
    text = String((await req.json())?.text || "").trim().slice(0, 3500);
  } catch {
    return Response.json({ ok: false, reason: "bad_json" }, { status: 400 });
  }
  if (!text) return Response.json({ ok: false, reason: "empty" }, { status: 400 });
  const sent = await telegramNotify(openStore())(esc(text));
  return Response.json({ ok: Boolean(sent) }, { status: sent ? 200 : 502 });
};

export const config: Config = { path: "/api/notify", method: "POST" };
