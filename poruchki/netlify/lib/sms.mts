// SMS to customers through SMSAPI (smsapi.bg): POST https://api.smsapi.com/sms.do, Bearer token.
// The token is typed in Настройки (kept encrypted) or set as SMSAPI_TOKEN in the Netlify env.
// Price ~0.054 € per part; a part is 160 Latin characters or 70 with Cyrillic (153 / 67 when longer).
import { getSetting, setSetting } from "./db.mts";
import { cKey, companyId, ENV_COMPANY } from "./tenant.mts";
import { env, HttpError } from "./http.mts";
import { seal, unseal } from "./secret.mts";

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setSmsFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}
const base = () => env("SMSAPI_URL") || "https://api.smsapi.com";
const fail = (m: string) => new HttpError(400, "sms", m);

export const PRICE_PER_PART = 0.054;

export const DEFAULT_TEMPLATES: Record<string, { label: string; text: string }> = {
  confirm: { label: "Потвърждение", text: "Здравейте, {име}! Поръчка № {номер} от {магазин} за {сума} е приета и ще бъде изпратена до 1 работен ден. Благодарим Ви!" },
  shipped: { label: "Изпратена", text: "{име}, поръчка № {номер} е изпратена с {куриер}, товарителница {товарителница}. Сума за плащане при получаване: {сума}." },
  office: { label: "Чака в офис", text: "{име}, пратката Ви № {товарителница} чака в офис {офис} на {куриер}. Моля, вземете я до 7 дни. Сума: {сума}." },
};

type Stored = { sealed?: string; sender?: string; templates?: Record<string, string>; latin?: boolean; at?: string };

export async function smsSettings() {
  const s = (await getSetting<Stored>(cKey("sms"))) || {};
  let token = companyId() === ENV_COMPANY ? env("SMSAPI_TOKEN") || "" : "";
  let source: "app" | "env" | null = token ? "env" : null;
  if (s.sealed) {
    try {
      token = unseal<string>(s.sealed);
      source = "app";
    } catch {
      /* fall back to env */
    }
  }
  const templates = Object.fromEntries(Object.entries(DEFAULT_TEMPLATES).map(([k, t]) => [k, { label: t.label, text: s.templates?.[k] || t.text }]));
  return { token, source, sender: s.sender || (companyId() === ENV_COMPANY ? env("SMSAPI_SENDER") : "") || "", templates, latin: s.latin ?? false };
}

export async function saveSmsSettings(input: any) {
  const cur = (await getSetting<Stored>(cKey("sms"))) || {};
  const next: Stored = { ...cur, at: new Date().toISOString() };
  if (typeof input?.token === "string" && input.token.trim()) next.sealed = seal(input.token.trim());
  if (input?.removeToken === true) delete next.sealed;
  if (typeof input?.sender === "string") {
    const sender = input.sender.trim();
    if (sender && !/^[A-Za-z0-9 .-]{1,11}$/.test(sender)) throw fail("Името на подателя е до 11 латински букви, цифри, точка, тире или интервал.");
    next.sender = sender;
  }
  if (input?.templates && typeof input.templates === "object") {
    next.templates = {};
    for (const k of Object.keys(DEFAULT_TEMPLATES)) {
      const t = String(input.templates[k] ?? "").trim().slice(0, 600);
      if (t && t !== DEFAULT_TEMPLATES[k].text) next.templates[k] = t;
    }
  }
  if (typeof input?.latin === "boolean") next.latin = input.latin;
  await setSetting(cKey("sms"), next);
  return smsSettings();
}

/** 0888 123 456 → 359888123456; foreign numbers keep their country code. */
export function smsNumber(phone: string): string | null {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^0\d{9}$/.test(d)) d = "359" + d.slice(1);
  if (/^8\d{8}$/.test(d)) d = "359" + d;
  return /^\d{10,15}$/.test(d) ? d : null;
}

// Bulgarian Latin transliteration (Закон за транслитерацията), for cheaper 160-character SMS.
const TR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya", ё: "yo", ы: "y", э: "e",
};
export function toLatin(text: string): string {
  return text
    .replace(/[„“”«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/№/g, "No")
    .replace(/€/g, "EUR")
    .replace(/[Ѐ-ӿ]/g, (ch) => {
      const low = ch.toLowerCase();
      const t = TR[low] ?? ch;
      return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
    });
}

const GSM = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r^{}\\[~\]|€]*$/;
/** How many SMS a text costs. */
export function smsParts(text: string): { chars: number; parts: number; unicode: boolean } {
  const unicode = !GSM.test(text);
  const chars = unicode ? [...text].length : [...text].reduce((a, c) => a + ("^{}\\[~]|€".includes(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { chars, unicode, parts: chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi) };
}

export function fillTemplate(text: string, o: Record<string, any>): string {
  const euro = (x: number) => `${(Math.round(Number(x) * 100) / 100).toFixed(2).replace(".", ",")} €`;
  const courier = { speedy: "Спиди", econt: "Еконт" }[String(o.courier || o.delivery?.courier || "")] || "куриер";
  const first = String(o.customer_name || "").trim().split(/\s+/)[0] || "";
  const values: Record<string, string> = {
    "{име}": first,
    "{номер}": String(o.order_no ?? ""),
    "{сума}": o.currency && o.currency !== "EUR" ? `${o.total} ${o.currency}` : euro(o.total),
    "{магазин}": String(o.shop_label || "").replace(/\s+(BG|SK|SI|HU)$/i, ""),
    "{товарителница}": String(o.tracking_no || ""),
    "{куриер}": courier,
    "{офис}": String(o.delivery?.officeName || o.city || ""),
  };
  return Object.entries(values).reduce((t, [k, v]) => t.split(k).join(v), text).replace(/\s+([,.!])/g, "$1").trim();
}

async function call(token: string, path: string, init: RequestInit) {
  const res = await fetchImpl(base() + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    const code = Number(data?.error);
    const why =
      code === 101 || code === 102 || res.status === 401 ? "токенът не е приет" :
      code === 103 ? "няма достатъчно кредит в SMSAPI" :
      code === 14 ? "името на подателя не е одобрено в SMSAPI" :
      code === 13 ? "невалиден телефонен номер" :
      code === 98 ? "акаунтът в SMSAPI още не е активиран – засега праща само до твоя номер" :
      data?.message || `грешка ${res.status}`;
    throw fail(`SMS: ${why}`);
  }
  return data;
}

/** Checks the token: returns the account's remaining points. */
export async function smsProfile(token: string) {
  const d = await call(token, "/profile", { method: "GET" });
  return { points: Number(d?.points ?? 0), name: String(d?.name || d?.username || "") };
}

export async function sendSms(to: string, text: string, opts: { test?: boolean } = {}) {
  const cfg = await smsSettings();
  if (!cfg.token) throw fail("SMS не е свързан. Добави токена от SMSAPI в Настройки → SMS.");
  const number = smsNumber(to);
  if (!number) throw fail("Невалиден телефонен номер.");
  if (!text.trim()) throw fail("Празно съобщение.");
  if (smsParts(text).parts > 4) throw fail("Съобщението е твърде дълго (над 4 SMS).");
  const body = new URLSearchParams({ to: number, message: text, format: "json", encoding: "utf-8", ...(cfg.sender ? { from: cfg.sender } : {}), ...(opts.test ? { test: "1" } : {}) });
  const d = await call(cfg.token, "/sms.do", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const m = d?.list?.[0] || {};
  return { id: String(m.id || ""), parts: Number(m.parts || smsParts(text).parts), points: Number(m.points || 0), status: String(m.status || "") };
}
