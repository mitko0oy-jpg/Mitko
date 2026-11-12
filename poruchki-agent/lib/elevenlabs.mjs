// ElevenLabs Agents: start an outbound call and verify post-call webhooks.
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.elevenlabs.io";

/**
 * Start an outbound call. `provider` is "twilio" or "sip" (how the phone
 * number was connected to ElevenLabs).
 * @returns {Promise<{conversationId: string|null, raw: any}>}
 */
export async function startCall({ apiKey, agentId, phoneNumberId, provider = "sip", to, variables, fetchImpl = fetch }) {
  const path = provider === "twilio" ? "/v1/convai/twilio/outbound-call" : "/v1/convai/sip-trunk/outbound-call";
  const res = await fetchImpl(API + path, {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: to,
      conversation_initiation_client_data: { dynamic_variables: variables },
      telephony_call_config: { ringing_timeout_secs: 35 },
    }),
  });
  const text = await res.text();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = { message: text };
  }
  if (!res.ok || raw.success === false) {
    const err = new Error(`ElevenLabs outbound call failed (${res.status}): ${raw.message || raw.detail?.[0]?.msg || text}`.slice(0, 500));
    err.status = res.status;
    throw err;
  }
  return { conversationId: raw.conversation_id || null, raw };
}

/**
 * Verify the `ElevenLabs-Signature` header ("t=<unix>,v0=<hex hmac>"), the
 * same way the official SDK does: HMAC-SHA256 over "<t>.<raw body>", and the
 * timestamp must not be older than 30 minutes.
 */
export function verifySignature(rawBody, sigHeader, secret, now = Date.now()) {
  if (!sigHeader || !secret) return false;
  const parts = String(sigHeader).split(",");
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sig = parts.find((p) => p.startsWith("v0="));
  if (!t || !sig) return false;
  const ts = Number(t) * 1000;
  if (!Number.isFinite(ts) || ts < now - 30 * 60 * 1000 || ts > now + 5 * 60 * 1000) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pull the fields we care about out of a post_call_transcription payload. */
export function readPostCall(payload) {
  const d = payload?.data || {};
  const analysis = d.analysis || {};
  const dc = analysis.data_collection_results || {};
  const val = (k) => {
    const v = dc[k];
    if (v == null) return "";
    if (typeof v === "object" && "value" in v) return v.value ?? "";
    return v;
  };
  const evals = analysis.evaluation_criteria_results || {};
  const failedChecks = Object.entries(evals)
    .filter(([, r]) => r && typeof r === "object" && r.result === "failure")
    .map(([id]) => id);
  const transcript = (d.transcript || [])
    .filter((t) => t && t.message)
    .map((t) => `${t.role === "agent" ? "Асистент" : "Клиент"}: ${t.message}`)
    .join("\n");
  return {
    conversationId: d.conversation_id || null,
    variables: d.conversation_initiation_client_data?.dynamic_variables || {},
    outcome: String(val("outcome") || "").trim().toLowerCase(),
    cancelReason: String(val("cancel_reason") || ""),
    deliveryChange: String(val("delivery_change") || ""),
    orderChange: String(val("order_change") || ""),
    callbackWhen: String(val("callback_when") || ""),
    questions: String(val("questions") || ""),
    health: val("allergy_or_health") === true || String(val("allergy_or_health")).toLowerCase() === "true",
    summary: String(val("summary") || analysis.transcript_summary || ""),
    durationSecs: d.metadata?.call_duration_secs ?? null,
    failedChecks,
    transcript,
  };
}
