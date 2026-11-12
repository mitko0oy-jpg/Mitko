// ElevenLabs calls this after every call (result) or failed call (no answer, busy).
import type { Config } from "@netlify/functions";
import { realDeps, env } from "../../lib/config.mjs";
import { verifySignature } from "../../lib/elevenlabs.mjs";
import { handleWebhook } from "../../lib/engine.mjs";

export default async (req: Request) => {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("elevenlabs-signature"), env("EL_WEBHOOK_SECRET"))) {
    return new Response("bad signature", { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const result = await handleWebhook(realDeps(), payload);
  console.log(JSON.stringify({ type: payload?.type, ...result }));
  return Response.json({ ok: true });
};

export const config: Config = { path: "/webhook/elevenlabs", method: "POST" };
