// One-time ElevenLabs setup for calls through the Zadarma callback.
// Runs on the server (Telegram: /callback_setup), so no key or secret has to be typed anywhere.
//
// 1. Workspace: the conversation initiation webhook → <site>/webhook/el-init/<TOOLS_SECRET>.
// 2. The incoming agent (the one on +359 2 437 0192, which now also takes the callbacks):
//    - may fetch its start data from that webhook,
//    - may have its script, first sentence and language replaced per call,
//    - also collects the order-confirmation fields (outcome, cancel_reason, …),
//      so results of callback calls reach the order the same way as before,
//    - and the feedback call's fields (fb_outcome, fb_reorder_pack, …).

import { FEEDBACK_SCRIPT } from "./scripts.generated.mjs";

const API = "https://api.elevenlabs.io";

// The feedback call's fields, with a "fb_" prefix: the incoming agent's own
// "outcome" and "summary" mean something else (lib/feedback.mjs reads both).
export const FEEDBACK_FIELDS = Object.fromEntries(Object.entries(FEEDBACK_SCRIPT.dataCollection).map(([k, d]) => [`fb_${k}`, d]));

export async function setupCallback({ apiKey, inboundAgentId, outboundAgentId, initUrl, fetchImpl = fetch }) {
  if (!apiKey || !inboundAgentId || !outboundAgentId || !initUrl) {
    throw new Error("липсва ELEVENLABS_API_KEY, EL_INBOUND_AGENT_ID, EL_AGENT_ID или адресът на сайта/TOOLS_SECRET");
  }
  const api = async (method, path, body) => {
    const res = await fetchImpl(API + path, {
      method,
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  };
  const report = [];

  // 1. Workspace webhook. Do not overwrite one that belongs to something else.
  const settings = await api("GET", "/v1/convai/settings");
  const current = settings.conversation_initiation_client_data_webhook?.url || "";
  if (current && current !== initUrl && !current.includes("/webhook/el-init/")) {
    throw new Error(`в ElevenLabs вече има друг webhook за начало на разговор (${new URL(current).host}) – не го пипам`);
  }
  await api("PATCH", "/v1/convai/settings", {
    conversation_initiation_client_data_webhook: { url: initUrl, request_headers: { "Content-Type": "application/json" } },
  });
  report.push("✅ webhook за начало на разговор");

  // 2. The incoming agent.
  const inbound = await api("GET", `/v1/convai/agents/${inboundAgentId}`);
  const outbound = await api("GET", `/v1/convai/agents/${outboundAgentId}`);
  const inDc = inbound.platform_settings?.data_collection || {};
  const outDc = outbound.platform_settings?.data_collection || {};
  const added = Object.keys(outDc).filter((k) => !(k in inDc));
  const fbAdded = Object.keys(FEEDBACK_FIELDS).filter((k) => !(k in inDc));
  const ov = inbound.platform_settings?.overrides || {};
  const agentOv = ov.conversation_config_override?.agent || {};
  await api("PATCH", `/v1/convai/agents/${inboundAgentId}`, {
    platform_settings: {
      data_collection: { ...outDc, ...FEEDBACK_FIELDS, ...inDc },
      overrides: {
        ...ov,
        enable_conversation_initiation_client_data_from_webhook: true,
        conversation_config_override: {
          ...(ov.conversation_config_override || {}),
          agent: { ...agentOv, first_message: true, language: true, prompt: { ...(agentOv.prompt || {}), prompt: true } },
          // Александра speaks with another voice (lib/persona.mjs).
          tts: { ...(ov.conversation_config_override?.tts || {}), voice_id: true },
        },
      },
    },
  });

  // Check what ElevenLabs kept: a field it does not know is dropped silently.
  const after = await api("GET", `/v1/convai/agents/${inboundAgentId}`);
  const aOv = after.platform_settings?.overrides || {};
  const aAgent = aOv.conversation_config_override?.agent || {};
  const fetchOn = aOv.enable_conversation_initiation_client_data_from_webhook === true;
  const overridesOn = aAgent.first_message === true && aAgent.prompt?.prompt === true;
  const voiceOn = aOv.conversation_config_override?.tts?.voice_id === true;
  const afterDc = after.platform_settings?.data_collection || {};
  const dcOk = added.every((k) => k in afterDc);
  const fbOk = Object.keys(FEEDBACK_FIELDS).every((k) => k in afterDc);
  report.push(`${dcOk ? "✅" : "⚠️"} полета за резултата: ${added.length ? added.join(", ") : "вече ги има"}`);
  report.push(`${fbOk ? "✅" : "⚠️"} полета за обратна връзка: ${fbAdded.length ? `добавени ${fbAdded.length}` : "вече ги има"}`);
  report.push(`${fetchOn ? "✅" : "⚠️"} входящият агент взима данните от webhook-а`);
  report.push(`${overridesOn ? "✅" : "⚠️"} сценарият и първото изречение може да се сменят при обаждане`);
  report.push(`${voiceOn ? "✅" : "⚠️"} гласът може да се сменя при обаждане (за Александра)`);
  return { ok: fetchOn && overridesOn && dcOk && fbOk && voiceOn, report };
}
