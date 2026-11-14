// Higgsfield API (docs.higgsfield.ai, Nov 2026): one async API for image and video models.
// Auth: HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET (console.higgsfield.ai), sent as
// "Authorization: Key id:secret". Billing is the API balance (Ads Studio ≈ $0.084/image).
import { env, HttpError } from "./http.mts";
import { pgStore } from "./db.mts";

const BASE = "https://api.higgsfield.ai";
const ADS_STUDIO = "higgsfield/ads-studio/v1.0";
const VIDEO = () => env("HIGGSFIELD_VIDEO_MODEL") || "kling-video/v3.0/std/image-to-video";

function auth() {
  const id = env("HIGGSFIELD_KEY_ID"), secret = env("HIGGSFIELD_KEY_SECRET");
  const combined = env("HIGGSFIELD_API_KEY"); // "id:secret" in one value also works
  if (combined && combined.includes(":")) return `Key ${combined}`;
  if (id && secret) return `Key ${id}:${secret}`;
  return null;
}
export const available = () => !!auth();

async function call(method: string, path: string, body?: unknown) {
  const a = auth();
  if (!a) throw new HttpError(503, "hf_off", "Higgsfield не е свързан (ключ от console.higgsfield.ai).");
  const r = await fetch(`${BASE}/${path}`, {
    method,
    headers: { authorization: a, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (r.status === 401) throw new HttpError(502, "hf_auth", "Higgsfield не прие ключа – провери го в console.higgsfield.ai.");
  if (r.status === 402) throw new HttpError(402, "hf_balance", "Няма достатъчно баланс в Higgsfield API – зареди от console.higgsfield.ai.");
  if (!r.ok) throw new HttpError(502, "hf_error", `Higgsfield: ${j?.detail || j?.message || r.status}`);
  return j;
}

// Banners are drawn by ChatGPT's image model (GPT Image 2.5 "Flare"): by default through
// Ads Studio (same model + ad layout know-how, 4:5, 4 variants per call); with
// HIGGSFIELD_IMAGE_MODE=flare straight through the model (one image per call, 3:4 instead of 4:5).
const FLARE = "marketing-studio/image/flare";
export async function startImages(o: { prompt: string; niche: string; language: string; audience: string; imageUrls: string[]; aspect: string; batch: number }) {
  if (env("HIGGSFIELD_IMAGE_MODE") === "flare") {
    const aspect = o.aspect === "4:5" ? "3:4" : o.aspect;
    const ids = await Promise.all(
      Array.from({ length: Math.max(1, Math.min(4, o.batch)) }, (_, i) =>
        call("POST", FLARE, { prompt: `${o.prompt} Variant ${i + 1}: a different layout and composition.`.slice(0, 4900), aspect_ratio: aspect, quality: "high", resolution: "2k", ...(o.imageUrls.length ? { image_urls: o.imageUrls.slice(0, 8) } : {}) }).then((j) => j.request_id),
      ),
    );
    return { provider: "higgsfield", model: FLARE, requestIds: ids, at: new Date().toISOString() };
  }
  const j = await call("POST", ADS_STUDIO, {
    prompt: o.prompt.slice(0, 7900),
    niche: o.niche.slice(0, 990),
    language: o.language,
    target_audience: o.audience.slice(0, 1990),
    batch_size: Math.max(1, Math.min(8, o.batch)),
    aspect_ratio: o.aspect,
    ...(o.imageUrls.length ? { image_urls: o.imageUrls.slice(0, 10) } : {}),
  });
  return { provider: "higgsfield", model: ADS_STUDIO, requestId: j.request_id, at: new Date().toISOString() };
}

export async function startVideo(o: { imageUrl: string; prompt: string; duration: number }) {
  const j = await call("POST", VIDEO(), { image_url: o.imageUrl, prompt: o.prompt.slice(0, 2400), duration: o.duration, sound: "off" });
  return { provider: "higgsfield", model: VIDEO(), requestId: j.request_id, at: new Date().toISOString() };
}

const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled", "cancelled"]);
export async function poll(job: any): Promise<{ done: boolean; images?: string[]; video?: string; error?: string }> {
  if (Array.isArray(job.requestIds)) {
    // Several single-image requests: done when all are done; keep whatever succeeded.
    const rs = await Promise.all(job.requestIds.map((id: string) => poll({ requestId: id })));
    if (rs.some((r) => !r.done)) return { done: false };
    const images = rs.flatMap((r) => r.images || []);
    return images.length ? { done: true, images } : { done: true, error: rs.find((r) => r.error)?.error || "Няма готови банери." };
  }
  const j = await call("GET", `requests/${job.requestId}/status`);
  const st = String(j.status || "").toLowerCase();
  if (!TERMINAL.has(st)) return { done: false };
  if (st !== "completed") return { done: true, error: st === "nsfw" ? "Отхвърлено от проверката за съдържание – опитай с друга идея." : `Неуспешно (${st}).` };
  const images = (j.images || j.payload?.images || []).map((x: any) => x?.url).filter(Boolean);
  const video = j.video?.url || j.payload?.video?.url;
  return { done: true, images, video };
}

// Product photos straight from the landing page (og:image + uploaded images), cached a day.
export async function productImages(line: any): Promise<string[]> {
  if (Array.isArray(line.images) && line.images.length) return line.images.slice(0, 4);
  const sites: any[] = ((await pgStore.get("meta", "sites")) as any)?.list || [];
  const domains = (line.sites || []).map((s: string) => sites.find((x) => x.id === s)?.domain).filter(Boolean);
  const key = `img:${line.id}`;
  const cached: any = await pgStore.get("cache", key);
  if (cached?.at && Date.now() - new Date(cached.at).getTime() < 864e5 && cached.list?.length) return cached.list;
  const found: string[] = [];
  for (const d of domains.slice(0, 2)) {
    try {
      const r = await fetch(`https://${d}/`, { headers: { "user-agent": "Mozilla/5.0 (compatible; Kosher/1.0)" }, signal: AbortSignal.timeout(8_000) });
      const html = await r.text();
      const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
      if (og) found.push(og);
      for (const m of html.matchAll(/(?:src|data-src)=["'](https:[^"']+?\.(?:png|jpe?g|webp))(?:\?[^"']*)?["']/gi)) {
        const u = m[1].replace("/thumbnails/640x480/", "/uploads/");
        if (/certif|сертифик|коментар|logo|icon|review/i.test(decodeURIComponent(u))) continue;
        if (!found.includes(u)) found.push(u);
        if (found.length >= 4) break;
      }
    } catch {}
  }
  const list = found.slice(0, 4);
  await pgStore.put("cache", key, { at: new Date().toISOString(), list });
  return list;
}
