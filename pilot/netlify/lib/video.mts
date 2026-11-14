// Video generation through fal.ai's queue API (one key, many models).
// Model routes change often – set FAL_MODEL_<ID> in Netlify to the exact endpoint
// shown on fal.ai (e.g. FAL_MODEL_MINIMAX_H3). Without it the provider is reported as not set up.
import { env, HttpError } from "./http.mts";

const DEFAULT_ROUTES: Record<string, string> = {
  // Fill these with the exact fal.ai endpoint ids after checking fal.ai/models.
};

function route(provider: string) {
  const key = `FAL_MODEL_${provider.replace(/[^a-z0-9]/gi, "_").toUpperCase()}`;
  return env(key) || DEFAULT_ROUTES[provider] || null;
}

export const available = () => !!env("FAL_KEY");

export async function start(o: { provider: string; prompt: string; aspect: string; creative: any }) {
  const key = env("FAL_KEY");
  if (!key) throw new HttpError(503, "video_off", "Видео моделите не са свързани (FAL_KEY).");
  const r = route(o.provider);
  if (!r) throw new HttpError(503, "video_route", `Няма зададен модел за ${o.provider} (FAL_MODEL_… в Netlify).`);
  const res = await fetch(`https://queue.fal.run/${r}`, {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt: o.prompt, aspect_ratio: o.aspect.replace("x", ":"), ...(o.creative.packshotUrl ? { image_url: o.creative.packshotUrl } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, "video_start", j?.detail || `fal.ai върна ${res.status}`);
  return { route: r, requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url, startedAt: new Date().toISOString() };
}

export async function poll(job: any): Promise<{ done: boolean; url?: string; error?: string }> {
  const key = env("FAL_KEY");
  const s: any = await fetch(job.statusUrl, { headers: { authorization: `Key ${key}` } }).then((r) => r.json());
  if (s.status === "COMPLETED") {
    const out: any = await fetch(job.responseUrl, { headers: { authorization: `Key ${key}` } }).then((r) => r.json());
    const url = out?.video?.url || out?.videos?.[0]?.url || out?.output?.url;
    return url ? { done: true, url } : { done: true, error: "няма видео в отговора" };
  }
  if (s.status === "FAILED" || s.status === "ERROR") return { done: true, error: s.error || "неуспешно" };
  return { done: false };
}
