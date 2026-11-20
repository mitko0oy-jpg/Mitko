// ElevenLabs asks this, at the start of every incoming call to the agent's
// number, who is calling (conversation initiation webhook).
//   POST /webhook/el-init/<TOOLS_SECRET>  { caller_id, called_number, agent_id, call_sid, conversation_id }
// If Zadarma's callback just connected this customer (CALL_ROUTE=zadarma), the
// answer carries the order's variables and the order-confirmation script.
// Anyone else is a real incoming call and gets the normal incoming line.
import type { Config, Context } from "@netlify/functions";
import { env } from "../../lib/config.mjs";
import { openStore } from "../../lib/store.mjs";
import { initiationData, outboundScriptLoader } from "../../lib/callback.mjs";

let loader: ReturnType<typeof outboundScriptLoader> | null = null;

export default async (req: Request, context: Context) => {
  const secret = env("TOOLS_SECRET");
  if (!secret || context.params.secret !== secret) return new Response("not found", { status: 404 });
  const body = await req.json().catch(() => ({}));
  const store = openStore();
  loader ??= outboundScriptLoader({ apiKey: env("ELEVENLABS_API_KEY"), agentId: env("EL_AGENT_ID"), store });
  try {
    const { response, orderKey } = await initiationData({ store, body, outboundScript: loader, ownNumber: env("ZADARMA_FROM") });
    console.log(JSON.stringify({ init: orderKey ? "callback" : "incoming", orderKey, conversation: body?.conversation_id || null }));
    return Response.json(response);
  } catch (err) {
    // Never block the call: without data it is answered as the normal incoming line.
    console.error("el-init", err);
    return Response.json({ type: "conversation_initiation_client_data", dynamic_variables: {} });
  }
};

export const config: Config = { path: "/webhook/el-init/:secret", method: "POST" };
