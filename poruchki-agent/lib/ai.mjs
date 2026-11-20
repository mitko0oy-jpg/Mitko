// Claude through the Netlify AI Gateway (it injects ANTHROPIC_API_KEY and
// ANTHROPIC_BASE_URL into the functions – no key of our own). Used only for
// reviewing finished calls, never during a call.

export const REVIEW_MODEL = "claude-haiku-5-5";
export const COACH_MODEL = "claude-sonnet-5-5";

/**
 * One request that must answer with JSON matching `schema`.
 * @returns {Promise<any>}
 */
export async function askJson({ env, system, user, schema, model, maxTokens = 1500, fetchImpl = fetch }) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) {
    const err = new Error("AI прегледът не е включен (Netlify AI Gateway не дава ANTHROPIC_API_KEY)");
    err.code = "ai_unavailable";
    throw err;
  }
  const base = (env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetchImpl(`${base}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: { type: "json_schema", schema } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  const text = (body.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("AI върна текст, а не JSON");
  }
}
