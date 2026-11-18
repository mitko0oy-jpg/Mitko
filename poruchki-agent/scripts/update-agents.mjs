#!/usr/bin/env node
// Push the current texts to the existing ElevenLabs agents without touching
// their tools, phone number or voice:
//   ELEVENLABS_API_KEY=… node scripts/update-agents.mjs agent/beevenom-bg.json=<agent_id> agent/inbound-bg.json=<agent_id>
import { loadSpec } from "../lib/prompt.mjs";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY missing");

for (const pair of process.argv.slice(2)) {
  const [file, agentId] = pair.split("=");
  const { spec, prompt } = await loadSpec(file);
  const body = {
    conversation_config: {
      // Optional: let the greeting finish even if the customer says "ало", and do not stop
      // talking at short "да" / "аха" (older customers say them while listening).
      ...(spec.turn ? { turn: spec.turn } : {}),
      agent: {
        first_message: spec.first_message,
        ...(spec.disable_first_message_interruptions != null ? { disable_first_message_interruptions: spec.disable_first_message_interruptions } : {}),
        prompt: { prompt },
        ...(spec.placeholders ? { dynamic_variables: { dynamic_variable_placeholders: spec.placeholders } } : {}),
      },
    },
    platform_settings: {
      data_collection: Object.fromEntries(
        Object.entries(spec.data_collection).map(([id, d]) => [
          id,
          typeof d === "string" ? { type: id === "allergy_or_health" ? "boolean" : "string", description: d } : d,
        ]),
      ),
      evaluation: {
        criteria: Object.entries(spec.evaluation_criteria).map(([id, goal]) => ({ id, name: id, type: "prompt", conversation_goal_prompt: goal })),
      },
      // No audio recordings are kept; transcripts still reach the post-call webhook.
      privacy: { record_voice: false },
    },
  };
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const a = await res.json();
  if (!res.ok) throw new Error(`${file}: ${res.status} ${JSON.stringify(a).slice(0, 800)}`);
  const p = a.conversation_config?.agent?.prompt || {};
  console.log(`${file} → ${agentId}: ok | first: ${a.conversation_config?.agent?.first_message?.slice(0, 70)}… | tools ${(p.tool_ids || []).length} | record_voice ${a.platform_settings?.privacy?.record_voice}`);
}
