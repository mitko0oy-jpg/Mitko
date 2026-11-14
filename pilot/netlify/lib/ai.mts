// Claude through the Netlify AI Gateway (Netlify injects ANTHROPIC_API_KEY and
// ANTHROPIC_BASE_URL – no separate key). Used for briefs, scripts and translations.
// Money decisions never go through the model: "the LLM proposes, the code disposes".
import Anthropic from "@anthropic-ai/sdk";
import { env, HttpError } from "./http.mts";

export const MODEL = () => env("AI_MODEL") || "claude-opus-5-5";

let client: Anthropic | null = null;
function ai(): Anthropic {
  if (!env("ANTHROPIC_API_KEY")) throw new HttpError(503, "ai_off", "AI не е включен в Netlify.");
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: 90_000 });
  return client;
}

const BRIEFS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "hookText", "script", "firstFrame", "videoPrompt", "translations"],
        properties: {
          title: { type: "string" },
          hookText: { type: "string" },
          script: { type: "string" },
          firstFrame: { type: "string" },
          videoPrompt: { type: "string" },
          translations: { type: "array", items: { type: "object", additionalProperties: false, required: ["lang", "text"], properties: { lang: { type: "string" }, text: { type: "string" } } } },
        },
      },
    },
  },
};

// Server-side refusal fallback is opt-in; if the gateway does not pass the beta through,
// repeat the same request without it.
async function create(params: any): Promise<any> {
  try {
    return await (ai().beta.messages.create as any)({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  } catch (e: any) {
    if (e?.status === 400) return ai().messages.create(params);
    throw e;
  }
}

export async function briefs(prompt: string): Promise<any[]> {
  const msg = await create({
    model: MODEL(),
    max_tokens: 16000,
    system: "Ти си старши креативен стратег за performance реклами в Мета. Пишеш кратко, конкретно и спазваш правилата за козметични твърдения. Отговаряш само в зададения JSON формат.",
    messages: [{ role: "user", content: prompt.replace(/Върни САМО JSON масив:[\s\S]*$/, "Върни концепциите в полето concepts. translations е списък {lang, text} с куката и основния текст на езика на държавата.") }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: BRIEFS_SCHEMA } },
  });
  if (msg.stop_reason === "refusal") throw new HttpError(422, "refused", "AI отказа тази заявка.");
  const text = (msg.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const data = JSON.parse(text);
  return (data.concepts || []).map((c: any) => ({ ...c, translations: Object.fromEntries((c.translations || []).map((t: any) => [t.lang, t.text])) }));
}

export const available = () => !!env("ANTHROPIC_API_KEY");
