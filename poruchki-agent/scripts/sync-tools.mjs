#!/usr/bin/env node
// Bring the webhook tools of an existing ElevenLabs agent in line with the spec, without touching
// anything else: tools already attached are updated in place (by name), new ones are created and attached.
//   ELEVENLABS_API_KEY=… TOOLS_SECRET=… node scripts/sync-tools.mjs agent/inbound-bg.json <agent_id> https://<site>
import { loadSpec } from "../lib/prompt.mjs";

const key = process.env.ELEVENLABS_API_KEY;
const secret = process.env.TOOLS_SECRET;
const [file, agentId, site] = process.argv.slice(2);
if (!key || !secret || !file || !agentId || !site) throw new Error("usage: ELEVENLABS_API_KEY=… TOOLS_SECRET=… node scripts/sync-tools.mjs <spec.json> <agent_id> https://<site>");

async function api(method, path, body) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const { spec, priceList } = await loadSpec(file);
const shared = {
  $ITEMS: {
    type: "array",
    description: "Продуктите в поръчката.",
    items: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "Кодът на продукта от ценоразписа.", enum: priceList.products.map((p) => p.id) },
        quantity: { type: "integer", description: "Брой (обикновено 1)." },
      },
      required: ["product_id", "quantity"],
    },
  },
  $DELIVERY: {
    type: "string",
    description: "Начин на доставка: econt_office (офис на Еконт), speedy_office (офис на Спиди) или speedy_address (до адрес със Спиди).",
    enum: Object.keys(priceList.delivery),
  },
};
const configOf = (t) => ({
  type: "webhook",
  name: t.name,
  description: t.description,
  response_timeout_secs: 20,
  api_schema: {
    url: `${site.replace(/\/$/, "")}/tools/${secret}/${t.path}`,
    method: "POST",
    request_body_schema: {
      type: "object",
      properties: Object.fromEntries(Object.entries(t.properties).map(([k, v]) => [k, typeof v === "string" ? shared[v] : v])),
      required: t.required,
    },
  },
});

const agent = await api("GET", `/v1/convai/agents/${agentId}`);
const ids = agent.conversation_config?.agent?.prompt?.tool_ids || [];
const byName = new Map();
for (const id of ids) {
  const t = await api("GET", `/v1/convai/tools/${id}`);
  byName.set(t.tool_config?.name, id);
}
const next = [...ids];
for (const t of spec.tools || []) {
  if (byName.has(t.name)) {
    await api("PATCH", `/v1/convai/tools/${byName.get(t.name)}`, { tool_config: configOf(t) });
    console.log(`updated ${t.name}`);
  } else {
    const r = await api("POST", "/v1/convai/tools", { tool_config: configOf(t) });
    next.push(r.id);
    console.log(`created ${t.name} id=${r.id}`);
  }
}
if (next.length !== ids.length) {
  await api("PATCH", `/v1/convai/agents/${agentId}`, { conversation_config: { agent: { prompt: { tool_ids: next } } } });
  console.log(`attached: ${next.length} tools`);
}
