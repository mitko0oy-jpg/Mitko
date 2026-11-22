// ElevenLabs asks this, at the start of every incoming call to the agent's
// number, who is calling (conversation initiation webhook).
//   POST /webhook/el-init/<TOOLS_SECRET>  { caller_id, called_number, agent_id, call_sid, conversation_id }
// If Zadarma's callback just connected this customer (CALL_ROUTE=zadarma), the
// answer carries the order's variables and the order-confirmation script.
// Anyone else is a real incoming call and gets the normal incoming line: Стела with the
// zdravets.eu catalogue (INBOUND_SCRIPT=off on Netlify → the agent's own script in ElevenLabs).
import type { Config, Context } from "@netlify/functions";
import { env } from "../../lib/config.mjs";
import { openStore, getSettings } from "../../lib/store.mjs";
import { initiationData, outboundScriptLoader } from "../../lib/callback.mjs";
import { INBOUND_SCRIPT } from "../../lib/scripts.generated.mjs";
import { getLessons } from "../../lib/coach.mjs";
import { getFbRules } from "../../lib/sales-coach.mjs";

let loader: ReturnType<typeof outboundScriptLoader> | null = null;

export default async (req: Request, context: Context) => {
  const secret = env("TOOLS_SECRET");
  if (!secret || context.params.secret !== secret) return new Response("not found", { status: 404 });
  const body = await req.json().catch(() => ({}));
  const store = openStore();
  loader ??= outboundScriptLoader({ apiKey: env("ELEVENLABS_API_KEY"), agentId: env("EL_AGENT_ID"), store });
  try {
    const lessons = await getLessons(store).catch(() => []);
    const feedbackRules = await getFbRules(store).catch(() => []);
    const settings = await getSettings(store).catch(() => ({}));
    const { response, orderKey } = await initiationData({
      store,
      body,
      outboundScript: loader,
      ownNumber: env("ZADARMA_FROM"),
      lessons,
      feedbackRules,
      // Александра's voice: chosen in Telegram (/aleksandra 1|2|3), or from Netlify.
      aleksandraVoiceId: settings.aleksandraVoiceId ?? env("ALEKSANDRA_VOICE_ID"),
      inboundScript: env("INBOUND_SCRIPT") === "off" ? null : INBOUND_SCRIPT,
    });
    const matched = Object.keys(response.dynamic_variables || {}).length > 0;
    console.log(JSON.stringify({
      init: matched ? "callback" : "incoming",
      script: Boolean(response.conversation_config_override?.agent),
      persona: response.dynamic_variables?.persona || null,
      lessons: lessons.length,
      orderKey,
      from: String(body?.caller_id || "").replace(/\d{4}$/, "****"), // which line Zadarma shows, without the full number
      conversation: body?.conversation_id || null,
    }));
    return Response.json(response);
  } catch (err) {
    // Never block the call: without data it is answered as the normal incoming line.
    console.error("el-init", err);
    return Response.json({ type: "conversation_initiation_client_data", dynamic_variables: {} });
  }
};

export const config: Config = { path: "/webhook/el-init/:secret", method: "POST" };
