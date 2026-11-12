#!/usr/bin/env node
// Create or update the ElevenLabs agent from agent/<name>.json + its prompt file,
// and (once) the post-call webhook that reports results to our Netlify site.
//
//   ELEVENLABS_API_KEY=… node scripts/setup-elevenlabs.mjs agent/beevenom-bg.json \
//     [--agent <agent_id>] [--voice <voice_id>] [--webhook https://<site>/webhook/elevenlabs] [--webhook-id <id>]
//
// Prints the agent id and, when a webhook is created, its secret (put it in EL_WEBHOOK_SECRET on Netlify).
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const API = "https://api.elevenlabs.io";
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!file) {
  console.error("usage: node scripts/setup-elevenlabs.mjs agent/beevenom-bg.json [--agent id] [--voice id] [--webhook url] [--webhook-id id]");
  process.exit(1);
}

const key = process.env.ELEVENLABS_API_KEY || "injected-by-proxy";
async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 1500)}`);
  return text ? JSON.parse(text) : {};
}

const spec = JSON.parse(await readFile(file, "utf8"));
const prompt = await readFile(join(dirname(file), spec.prompt_file), "utf8");

let webhookId = opt("webhook-id");
const webhookUrl = opt("webhook");
if (webhookUrl && !webhookId) {
  const w = await api("POST", "/v1/workspace/webhooks", {
    settings: { auth_type: "hmac", name: `${spec.name} – резултати`, webhook_url: webhookUrl },
  });
  webhookId = w.webhook_id;
  console.log(`webhook_id=${webhookId}`);
  console.log(`EL_WEBHOOK_SECRET=${w.webhook_secret ?? "(not returned – copy it from the ElevenLabs dashboard)"}`);
}

const placeholders = {
  shop_name: spec.defaults.shop_name,
  delivery_days: spec.defaults.delivery_days,
  customer_name: "Мария",
  order_number: "1000",
  order_items: "BeeVenom Care Gel 2+1 броя, и подарък: 8 бр. пластири за стави и мускули",
  order_total: "24 евро и 40 цента",
  delivery_text: "Доставка до офис на Еконт, Пловдив, офис Тракия",
  order_key: "test",
  test: "yes",
};

const body = {
  name: spec.name,
  tags: ["poruchki-agent"],
  conversation_config: {
    agent: {
      first_message: spec.first_message,
      language: spec.language,
      dynamic_variables: { dynamic_variable_placeholders: placeholders },
      prompt: {
        prompt,
        llm: spec.llm || "claude-opus-5-5",
        built_in_tools: {
          end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } },
        },
      },
    },
    conversation: { max_duration_seconds: 300 },
    // Lively, expressive delivery like the demo Mitko liked (lower stability = more intonation).
    tts: { ...(opt("voice") ? { voice_id: opt("voice") } : {}), stability: 0.4, similarity_boost: 0.8, speed: 1 },
  },
  platform_settings: {
    data_collection: Object.fromEntries(
      Object.entries(spec.data_collection).map(([id, description]) => [
        id,
        { type: id === "allergy_or_health" ? "boolean" : "string", description },
      ]),
    ),
    evaluation: {
      criteria: Object.entries(spec.evaluation_criteria).map(([id, goal]) => ({
        id,
        name: id,
        type: "prompt",
        conversation_goal_prompt: goal,
      })),
    },
    ...(webhookId
      ? { workspace_overrides: { webhooks: { post_call_webhook_id: webhookId, events: ["transcript", "call_initiation_failure"] } } }
      : {}),
  },
};

const agentId = opt("agent");
if (agentId) {
  await api("PATCH", `/v1/convai/agents/${agentId}`, body);
  console.log(`updated agent_id=${agentId}`);
} else {
  const r = await api("POST", "/v1/convai/agents/create", body);
  console.log(`EL_AGENT_ID=${r.agent_id}`);
}
