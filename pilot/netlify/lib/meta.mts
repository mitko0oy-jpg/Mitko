// Meta Marketing API client (Graph API v27.0, Nov 2026).
// Token: a System User token with ads_read + ads_management (Netlify env META_TOKEN).
import { createHmac } from "node:crypto";
import { env, HttpError } from "./http.mts";
import { q } from "./db.mts";

const VERSION = () => env("META_API_VERSION") || "v27.0";
const ZERO_DECIMAL = new Set(["HUF", "JPY", "KRW", "CLP", "ISK", "TWD", "VND", "COP", "IDR", "PYG", "UGX"]);
export const offset = (currency = "EUR") => (ZERO_DECIMAL.has(currency) ? 1 : 100);

export class MetaError extends Error {
  constructor(public code: number, public subcode: number | undefined, message: string, public userMsg?: string) {
    super(message);
  }
}

let lastUtil = 0; // highest usage % seen in the rate-limit headers
export const usage = () => lastUtil;

function readUsage(h: Headers) {
  let max = 0;
  for (const name of ["x-business-use-case-usage", "x-ad-account-usage", "x-fb-ads-insights-throttle", "x-app-usage"]) {
    const v = h.get(name);
    if (!v) continue;
    try {
      const j = JSON.parse(v);
      const scan = (o: any) => {
        if (!o || typeof o !== "object") return;
        for (const [k, x] of Object.entries(o)) {
          if (typeof x === "number" && /pct|count|time/.test(k)) max = Math.max(max, x);
          else scan(x);
        }
      };
      scan(j);
    } catch {}
  }
  lastUtil = max;
}

export async function graph(path: string, params: Record<string, unknown> = {}, method: "GET" | "POST" = "GET"): Promise<any> {
  const token = env("META_TOKEN");
  if (!token) throw new HttpError(503, "no_meta", "Мета не е свързана (липсва META_TOKEN в Netlify).");
  if (lastUtil > 90) throw new HttpError(429, "meta_busy", "Мета ограничава заявките в момента. Ще опитам при следващата проверка.");
  const url = path.startsWith("https://") ? new URL(path) : new URL(`https://graph.facebook.com/${VERSION()}/${path}`);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  if (!url.searchParams.has("access_token")) p.set("access_token", token);
  const secret = env("META_APP_SECRET");
  if (secret) p.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
  let res: Response;
  const ctl = AbortSignal.timeout(25_000);
  if (method === "GET") {
    for (const [k, v] of p) url.searchParams.set(k, v);
    res = await fetch(url, { signal: ctl });
  } else {
    res = await fetch(url, { method: "POST", body: p, signal: ctl });
  }
  readUsage(res.headers);
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const e = j.error || {};
    throw new MetaError(e.code || res.status, e.error_subcode, e.message || `HTTP ${res.status}`, e.error_user_msg);
  }
  return j;
}

export async function all(path: string, params: Record<string, unknown>, maxPages = 25): Promise<any[]> {
  const out: any[] = [];
  let j = await graph(path, params);
  for (let i = 0; i < maxPages; i++) {
    out.push(...(j.data || []));
    if (!j.paging?.next) break;
    j = await graph(j.paging.next);
  }
  return out;
}

// Log every write (audit trail) – also failed ones.
async function write(objectId: string, op: string, params: Record<string, unknown>) {
  try {
    const r = await graph(objectId, params, "POST");
    await q("INSERT INTO meta_writes (object_id, op, request, response, ok) VALUES ($1,$2,$3,$4,true)", [objectId, op, JSON.stringify(params), JSON.stringify(r)]);
    return r;
  } catch (e: any) {
    await q("INSERT INTO meta_writes (object_id, op, request, response, ok) VALUES ($1,$2,$3,$4,false)", [objectId, op, JSON.stringify(params), JSON.stringify({ code: e.code, subcode: e.subcode, message: e.message })]).catch(() => {});
    throw new HttpError(502, "meta_write", explain(e), { code: e.code, subcode: e.subcode });
  }
}

export function explain(e: any): string {
  const c = e?.code, s = e?.subcode;
  if (c === 190) return "Токенът на Мета е невалиден или изтекъл.";
  if (c === 613 && s === 1487632) return "Бюджетът на този адсет е сменян 4 пъти този час – Мета не позволява повече.";
  if (c === 613 && s === 4841018) return "Обектът се променя в момента – опитай след 30 секунди.";
  if ([4, 17, 613, 80000, 80003, 80004, 80014].includes(c)) return "Мета ограничава заявките в момента. Опитай след малко.";
  if ([1885650, 1885272, 2238055].includes(s)) return "Бюджетът е под минимума на Мета.";
  if (s === 1885183) return "Приложението в Мета е в режим за разработка – превключи го на Live.";
  return e?.userMsg || e?.message || "Мета върна грешка.";
}

export async function accounts() {
  const rows = await all("me/adaccounts", { fields: "account_id,name,currency,account_status,timezone_name", limit: 100 });
  return rows.map((a) => ({ id: String(a.account_id), name: a.name, currency: a.currency, status: a.account_status, tz: a.timezone_name }));
}

const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const pick = (arr: any[] | undefined, types: string[]) => {
  for (const t of types) {
    const x = (arr || []).find((a) => a.action_type === t);
    if (x) return Number(x.value) || 0;
  }
  return 0;
};

export async function structure(acct: { id: string; currency?: string; country?: string; name?: string }) {
  const off = offset(acct.currency);
  const money = (v: any) => (v == null || v === "" ? null : Number(v) / off);
  const st = (e: any) => (e.effective_status === "ACTIVE" ? "ACTIVE" : "PAUSED");
  const [camps, sets, ads] = await Promise.all([
    all(`act_${acct.id}/campaigns`, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time", limit: 200 }),
    all(`act_${acct.id}/adsets`, { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,created_time,learning_stage_info", limit: 300 }),
    all(`act_${acct.id}/ads`, { fields: "id,name,status,effective_status,adset_id,campaign_id,created_time,creative.thumbnail_width(480).thumbnail_height(480){id,name,title,body,thumbnail_url,image_url,video_id,object_type}", limit: 300 }),
  ]);
  const day = (t: string) => String(t || "").slice(0, 10);
  return {
    campaigns: camps.map((c) => ({ id: c.id, account: acct.id, name: c.name, status: st(c), rawStatus: c.effective_status, objective: c.objective, budget: money(c.daily_budget), created: day(c.created_time) })),
    adsets: sets.map((s) => ({ id: s.id, account: acct.id, campaign: s.campaign_id, name: s.name, status: st(s), rawStatus: s.effective_status, budget: money(s.daily_budget), created: day(s.created_time), learning: s.learning_stage_info?.status === "LEARNING" ? "learning" : "active" })),
    ads: ads.map((a) => ({ id: a.id, account: acct.id, campaign: a.campaign_id, adset: a.adset_id, name: a.name, status: st(a), rawStatus: a.effective_status, creative: a.creative?.id ? `cr_${a.creative.id}` : `cr_ad_${a.id}`, created: day(a.created_time) })),
    creatives: ads.filter((a) => a.creative).map((a) => ({
      id: `cr_${a.creative.id}`, metaCreativeId: a.creative.id, name: a.creative.name || a.name, account: acct.id, country: acct.country,
      kind: a.creative.video_id ? "video" : "image", hookText: a.creative.body || a.creative.title || "", thumb: a.creative.image_url || a.creative.thumbnail_url || null, tags: {}, source: "meta", status: "live", createdAt: day(a.created_time),
    })),
  };
}

export async function insights(acctId: string, since: string, until: string) {
  const rows = await all(`act_${acctId}/insights`, {
    level: "ad", time_increment: 1, time_range: { since, until }, limit: 500, use_unified_attribution_setting: true,
    fields: "ad_id,adset_id,campaign_id,spend,impressions,reach,inline_link_clicks,actions,action_values,video_thruplay_watched_actions",
  }, 60);
  return rows.map((r) => ({
    date: r.date_start, ad: r.ad_id, adset: r.adset_id, campaign: r.campaign_id, account: acctId,
    spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, reach: Number(r.reach) || 0, clicks: Number(r.inline_link_clicks) || 0,
    lpv: pick(r.actions, ["omni_landing_page_view", "landing_page_view"]), purchases: pick(r.actions, PURCHASE), value: pick(r.action_values, PURCHASE),
    video3s: pick(r.actions, ["video_view"]), thruplay: Number(r.video_thruplay_watched_actions?.[0]?.value) || 0,
  }));
}

export const setBudget = (id: string, amount: number, currency = "EUR") => write(id, "budget", { daily_budget: Math.round(amount * offset(currency)) });
export const setStatus = (id: string, status: "ACTIVE" | "PAUSED") => write(id, "status", { status });

// Upload a ready creative (video URL or image) and create the ad. The ad is created
// PAUSED and activated only because a human pressed "Пусни" in the app.
export async function launch(o: { acct: string; adset: string; pageId: string; link: string; creative: any }) {
  const c = o.creative;
  let mediaSpec: any;
  if (c.videoUrl) {
    const v = await write(`act_${o.acct}/advideos`, "upload_video", { file_url: c.videoUrl, name: c.name });
    for (let i = 0; i < 12; i++) {
      const s = await graph(v.id, { fields: "status" });
      if (s.status?.video_status === "ready") break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    mediaSpec = { video_data: { video_id: v.id, message: c.primaryText || c.hookText, title: c.headline || c.name, image_url: c.thumb || undefined, call_to_action: { type: "ORDER_NOW", value: { link: o.link } } } };
  } else if (c.imageBase64 || c.imageUrl) {
    // Meta takes image bytes, not a link: download the picked banner first.
    let b64 = c.imageBase64;
    if (!b64) {
      const r = await fetch(c.imageUrl, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new HttpError(502, "img_download", "Не успях да изтегля банера.");
      b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    }
    const img = await write(`act_${o.acct}/adimages`, "upload_image", { bytes: b64 });
    const hash = Object.values<any>(img.images || {})[0]?.hash;
    mediaSpec = { link_data: { image_hash: hash, link: o.link, message: c.primaryText || c.hookText, name: c.headline || c.name, call_to_action: { type: "ORDER_NOW" } } };
  } else {
    throw new HttpError(422, "no_media", "Креативът още няма готово видео или изображение.");
  }
  const cr = await write(`act_${o.acct}/adcreatives`, "create_creative", {
    name: `PILOT | ${c.id} | ${c.tags?.angle || ""} | ${c.tags?.persona || ""} | ${c.tags?.format || ""} | ${c.tags?.language || ""}`,
    object_story_spec: { page_id: o.pageId, ...mediaSpec },
    // No AI rewriting of our approved copy (claims!) – every enhancement explicitly off.
    degrees_of_freedom_spec: { creative_features_spec: Object.fromEntries(["text_optimizations", "image_animation", "video_uncrop", "translate_voiceover", "image_text_translation", "product_extensions"].map((k) => [k, { enroll_status: "OPT_OUT" }])) },
    url_tags: "utm_source=meta&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}",
  });
  const ad = await write(`act_${o.acct}/ads`, "create_ad", { name: c.name, adset_id: o.adset, creative: { creative_id: cr.id }, status: "PAUSED" });
  await setStatus(ad.id, "ACTIVE");
  return { adId: ad.id, creativeId: cr.id };
}

// Ad Library (EU: every ad that reached the EU, with reach – no spend for commercial ads).
export async function adLibrary(o: { pageIds?: string[]; terms?: string; countries: string[] }) {
  return all("ads_archive", {
    ad_type: "ALL", ad_reached_countries: o.countries, ad_active_status: "ALL", limit: 100,
    ...(o.pageIds?.length ? { search_page_ids: o.pageIds.slice(0, 10) } : { search_terms: (o.terms || "").slice(0, 100) }),
    fields: "id,page_id,page_name,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,languages,publisher_platforms,eu_total_reach",
  }, 5);
}

export async function tokenOk(): Promise<boolean> {
  try {
    await graph("me", { fields: "id" });
    return true;
  } catch {
    return false;
  }
}
