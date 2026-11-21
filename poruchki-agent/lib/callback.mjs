// Calls through the Zadarma callback (CALL_ROUTE=zadarma).
//
// 1. startCallbackCall(): saves what the agent needs to know (the order's
//    dynamic variables) under pending/<phone> and asks Zadarma to ring the customer.
// 2. When the customer answers, Zadarma connects them to +359 2 437 0192,
//    which forwards to ElevenLabs. Before the agent speaks, ElevenLabs asks
//    our initiation webhook who is calling (caller_id).
// 3. initiationData(): finds the pending call by that number and returns the
//    order's variables plus the order-confirmation agent's script and first
//    sentence. A caller with no pending call gets the normal incoming line.
import { requestCallback } from "./zadarma.mjs";
import { pickPersona, renamePersona, personaNote } from "./persona.mjs";
import { lessonsSection } from "./coach.mjs";
import { FEEDBACK_SCRIPT } from "./scripts.generated.mjs";
import { fbRulesSection } from "./sales-coach.mjs";

// Scripts that live in git (scripts/build-scripts.mjs) instead of an ElevenLabs agent.
const BUNDLED = { feedback: FEEDBACK_SCRIPT };

// A callback that has not reached the agent in this time is no longer ours.
export const PENDING_TTL_MIN = 15;
// Not answered: Zadarma rings the customer for about half a minute. If the
// agent has not been connected this long after the call started, the customer
// did not answer (or was busy).
export const NO_ANSWER_MIN = 5;

/** "+359 888 123 456" / "0888123456" → "359888123456"; null if it is not a phone. */
export function phoneDigits(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "359" + d.slice(1);
  if (/^[89]\d{8}$/.test(d)) d = "359" + d; // Bulgarian mobile without the leading 0
  return d.length >= 8 ? d : null;
}

const pendingKey = (digits) => `pending/${digits}`;

/** Every dynamic variable value must be a string (or number/boolean) for ElevenLabs. */
function cleanVariables(vars) {
  return Object.fromEntries(
    Object.entries(vars || {})
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === "number" || typeof v === "boolean" ? v : String(v)]),
  );
}

/**
 * Start a call through Zadarma.
 * @returns {Promise<{conversationId: null, route: "zadarma"}>}
 */
export async function startCallbackCall({ store, zadarma, to, variables, agentId = "", script = "", now = new Date(), fetchImpl }) {
  const digits = phoneDigits(to);
  if (!digits) {
    const err = new Error(`invalid phone number: ${to}`);
    err.status = 400;
    throw err;
  }
  // agentId: whose script the agent follows on this call (empty = the order-confirmation agent);
  // script: a script bundled in the code instead ("feedback").
  await store.setJSON(pendingKey(digits), { variables: cleanVariables(variables), agentId, script, at: now.toISOString() });
  await requestCallback({ ...zadarma, to: digits, fetchImpl });
  return { conversationId: null, route: "zadarma" };
}

/**
 * Answer ElevenLabs' conversation initiation webhook.
 * @param {object} args
 * @param {object} args.store   Blobs store
 * @param {object} args.body    { caller_id, called_number, agent_id, call_sid, conversation_id }
 * @param {(agentId?: string) => Promise<{prompt: string, firstMessage: string, language?: string}|null>} args.outboundScript
 *        an agent's script (read from ElevenLabs, cached); no id = the order-confirmation agent
 * @param {{text: string}[]} [args.lessons] rules Mitko approved from the call reviews (lib/coach.mjs)
 * @param {{text: string}[]} [args.feedbackRules] rules Mitko approved after feedback calls (lib/sales-coach.mjs)
 * @param {string} [args.aleksandraVoiceId] when set, half of the calls are made by Александра (lib/persona.mjs)
 * @returns {Promise<{response: object, orderKey: string|null}>}
 */
export async function initiationData({ store, body, outboundScript, ownNumber = "", lessons = [], feedbackRules = [], aleksandraVoiceId = "", now = new Date() }) {
  const inbound = { response: { type: "conversation_initiation_client_data", dynamic_variables: {} }, orderKey: null };
  const digits = phoneDigits(body?.caller_id);
  let key = digits ? pendingKey(digits) : null;
  let pending = key ? await store.get(key, { type: "json" }) : null;
  // Zadarma connects the callback with its own number, not the customer's: our
  // number, none, or a foreign line (seen: +44 20 4577 5777). Bulgarian
  // customers call from 359… numbers, so anything else right after a callback
  // is the callback: take the one started in the last 3 minutes (at most one at a time).
  const lineSide = !digits || digits === phoneDigits(ownNumber) || !digits.startsWith("359");
  if (!pending && lineSide) {
    let newest = null;
    for (const { key: k } of (await store.list({ prefix: "pending/" })).blobs) {
      const p = await store.get(k, { type: "json" });
      if (p && now - new Date(p.at) < 3 * 60_000 && (!newest || p.at > newest.p.at)) newest = { k, p };
    }
    if (newest) ({ k: key, p: pending } = newest);
  }
  if (!pending || now - new Date(pending.at) > PENDING_TTL_MIN * 60_000) return inbound;

  // One callback = one conversation: a second call from the same number is a real incoming call.
  await store.delete(key);
  const orderKey = pending.variables?.order_key || null;
  const bundled = BUNDLED[pending.script] || null;
  const script = bundled
    ? { prompt: bundled.prompt, firstMessage: bundled.firstMessage, language: bundled.language }
    : await outboundScript(pending.agentId || undefined).catch((err) => {
        console.error("outbound script unavailable", err.message);
        return null;
      });
  // ElevenLabs refuses to start if a {{variable}} in the script has no value.
  const variables = { ...(pending.variables || {}) };
  // Which voice makes this call (an order keeps its voice on retries); it comes back with the result.
  // A test call may ask for a specific voice (voice_id); otherwise Александра's chosen voice.
  const voiceId = variables.voice_id || aleksandraVoiceId;
  const persona =
    variables.persona === "nikolay" && variables.voice_id
      ? "nikolay"
      : variables.persona === "aleksandra" && voiceId
        ? "aleksandra"
        : variables.persona === "elena"
          ? "elena"
          : pickPersona(orderKey || key, { aleksandraVoiceId });
  variables.persona = persona;
  if (persona === "aleksandra") variables.voice_id = voiceId;
  for (const [, name] of `${script?.prompt || ""} ${script?.firstMessage || ""}`.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (!name.startsWith("system__") && !(name in variables)) variables[name] = "";
  }
  const response = { type: "conversation_initiation_client_data", dynamic_variables: variables };
  if (script?.prompt) {
    response.conversation_config_override = {
      agent: {
        // Learned rules are about confirming orders: not added to another agent's script.
        // Each script gets the rules learned for it: order rules, or the feedback rules Mitko approved.
        prompt: { prompt: renamePersona(script.prompt, persona) + personaNote(persona) + (bundled ? fbRulesSection(feedbackRules) : pending.agentId ? "" : lessonsSection(lessons)) },
        ...(script.firstMessage ? { first_message: renamePersona(script.firstMessage, persona) } : {}),
        ...(script.language ? { language: script.language } : {}),
      },
    };
  }
  if (persona !== "elena" && variables.voice_id) {
    response.conversation_config_override = { ...(response.conversation_config_override || {}), tts: { voice_id: variables.voice_id } };
  }
  // Remember the conversation and that the customer answered.
  if (orderKey && orderKey !== "test") {
    const conversationId = body?.conversation_id || null;
    if (conversationId) await store.setJSON(`conv/${conversationId}`, { key: orderKey });
    // The call loop may write the same record a moment earlier: retry on a lost race.
    for (let i = 0; i < 3; i++) {
      const entry = await store.getWithMetadata(orderKey, { type: "json" });
      if (!entry?.data) break;
      const rec = entry.data;
      const { modified } = await store.setJSON(
        orderKey,
        {
          ...rec,
          answeredAt: now.toISOString(),
          conversationIds: conversationId ? [...(rec.conversationIds || []).filter((c) => c !== conversationId), conversationId] : rec.conversationIds,
          history: [...(rec.history || []), { at: now.toISOString(), event: "answered", conversationId }],
        },
        { onlyIfMatch: entry.etag },
      );
      if (modified) break;
    }
  }
  return { response, orderKey };
}

/**
 * An agent's script (default: the order-confirmation agent), read from
 * ElevenLabs and cached for 10 minutes, so edits made in the ElevenLabs
 * dashboard apply to callbacks too.
 */
export function outboundScriptLoader({ apiKey, agentId: defaultAgentId, store, fetchImpl = fetch, ttlMin = 10 }) {
  const memo = new Map();
  const fresh = (c) => c && Date.now() - c.fetchedAt < ttlMin * 60_000;
  return async (wanted) => {
    const agentId = wanted || defaultAgentId;
    if (!agentId) return null;
    if (fresh(memo.get(agentId))) return memo.get(agentId);
    const cacheKey = `meta/script/${agentId}`;
    const cached = await store.get(cacheKey, { type: "json" }).catch(() => null);
    if (fresh(cached)) {
      memo.set(agentId, cached);
      return cached;
    }
    if (!apiKey) return cached || null;
    try {
      const res = await fetchImpl(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
      if (!res.ok) throw new Error(`ElevenLabs agent ${agentId}: ${res.status}`);
      const a = (await res.json())?.conversation_config?.agent || {};
      const script = { agentId, prompt: a.prompt?.prompt || "", firstMessage: a.first_message || "", language: a.language || "", fetchedAt: Date.now() };
      memo.set(agentId, script);
      await store.setJSON(cacheKey, script);
      return script;
    } catch (err) {
      // Better an older script than none.
      if (cached?.prompt) return cached;
      throw err;
    }
  };
}
