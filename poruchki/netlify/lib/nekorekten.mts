// nekorekten.com – reports about unreliable customers (https://nekorekten.com/bg/api/doc).
// GET https://api.nekorekten.com/api/v1/reports?phone=359888888888, header "Api-Key".
// The key is typed in Настройки (kept encrypted) or set as NEKOREKTEN_KEY. It works only from the IPs
// allowed for it on nekorekten.com – Netlify has no fixed IP, so the key needs "*".
// Their terms: say where the reports come from wherever they are shown, and name them in the privacy policy.
import { getSetting, one, q, setSetting } from "./db.mts";
import { cKey, companyId, ENV_COMPANY } from "./tenant.mts";
import { env, HttpError } from "./http.mts";
import { seal, unseal } from "./secret.mts";
import { smsNumber } from "./sms.mts";

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setNekFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}
const base = () => (env("NEKOREKTEN_URL") || "https://api.nekorekten.com").replace(/\/$/, "");
const fail = (m: string) => new HttpError(400, "nekorekten", m);
export const phoneKey = (p: string) => String(p || "").replace(/\D/g, "").slice(-9);

type Stored = { sealed?: string; auto?: boolean; at?: string };

export async function nekSettings() {
  const s = (await getSetting<Stored>(cKey("nekorekten"))) || {};
  let key = companyId() === ENV_COMPANY ? env("NEKOREKTEN_KEY") || "" : "";
  let source: "app" | "env" | null = key ? "env" : null;
  if (s.sealed) {
    try {
      key = unseal<string>(s.sealed);
      source = "app";
    } catch {
      /* fall back to env */
    }
  }
  return { key, source, auto: s.auto ?? true };
}

export async function saveNekSettings(input: any) {
  const cur = (await getSetting<Stored>(cKey("nekorekten"))) || {};
  const next: Stored = { ...cur, at: new Date().toISOString() };
  if (typeof input?.key === "string" && input.key.trim()) {
    const k = input.key.trim();
    if (!/^[\w.-]{8,200}$/.test(k)) throw fail("Ключът изглежда грешен – копирай го целия от nekorekten.com → Профил → API ключове.");
    next.sealed = seal(k);
  }
  if (input?.removeKey === true) delete next.sealed;
  if (typeof input?.auto === "boolean") next.auto = input.auto;
  await setSetting(cKey("nekorekten"), next);
  return nekSettings();
}

async function call(key: string, path: string, init: RequestInit = {}) {
  const res = await fetchImpl(`${base()}/api/v1/${path}`, {
    ...init,
    headers: { "Api-Key": key, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const why =
      res.status === 401 ? "ключът не е приет (провери го в nekorekten.com)"
      : res.status === 403 ? "ключът не е разрешен от този адрес – в nekorekten.com за IP на ключа сложи „*“"
      : res.status === 429 ? "дневният лимит за проверки е изчерпан"
      : data?.message || `грешка ${res.status}`;
    throw new HttpError(res.status === 429 ? 429 : 502, "nekorekten", `nekorekten.com: ${why}`);
  }
  return data;
}

/** Plan and limits of the key: { plan, perMinute, perDay, usedToday }. */
export async function nekUsage(key: string) {
  const d = await call(key, "api-keys/current/usage");
  const i = d?.items || {};
  return {
    plan: i.plan?.name || "",
    perMinute: Number(i.apiRequests?.limit) || null,
    perDay: Number(i.searchRequests?.limit) || null,
    usedToday: Number(i.searchRequests?.used) || 0,
  };
}

const short = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Look a phone up and keep the result (also when there is nothing: count 0). */
export async function checkPhone(key: string, phone: string) {
  const number = smsNumber(phone);
  if (!number) throw fail("Телефонът не е валиден.");
  const d = await call(key, `reports?phone=${encodeURIComponent(number)}&itemsPerPage=10`);
  const items = Array.isArray(d?.items) ? d.items : [];
  const reports = items.slice(0, 10).map((r: any) => ({
    id: r.id ?? null,
    text: short(r.text, 600),
    date: r.createDate || null,
    name: short([r.firstName, r.lastName].filter(Boolean).join(" "), 80),
    city: short(r.city?.name, 60),
  }));
  const count = Number(d?.count) || reports.length;
  await q(
    `INSERT INTO phone_checks (company_id, phone_key, phone, checked_at, count, reports, error) VALUES (${companyId()}, $1, $2, now(), $3, $4::jsonb, NULL)
     ON CONFLICT (company_id, phone_key) DO UPDATE SET phone = excluded.phone, checked_at = now(), count = excluded.count, reports = excluded.reports, error = NULL`,
    [phoneKey(number), number, count, JSON.stringify(reports)],
  );
  return { phone: number, count, reports };
}

export async function phoneCheck(phone: string) {
  const k = phoneKey(phone);
  if (k.length < 9) return null;
  return one<any>("SELECT phone, checked_at, count, reports FROM phone_checks WHERE company_id = $2 AND phone_key = $1", [k, companyId()]);
}

/** A report from us: what happened with this order (their API needs the text and at least one contact field). */
export async function sendReport(key: string, r: { phone: string; name: string; text: string }) {
  const number = smsNumber(r.phone);
  const text = String(r.text || "").trim();
  if (!number) throw fail("Телефонът не е валиден.");
  if (text.length < 10) throw fail("Опиши накратко какво стана (поне 10 знака).");
  const [firstName, ...rest] = String(r.name || "").trim().split(/\s+/);
  const body = { text: text.slice(0, 2000), phone: number, ...(firstName ? { firstName } : {}), ...(rest.length ? { lastName: rest.join(" ") } : {}) };
  const d = await call(key, "reports", { method: "POST", body: JSON.stringify(body) });
  return { message: d?.message || "Сигналът е изпратен.", id: d?.details?.id ?? null };
}

/**
 * New Bulgarian orders whose phone was not checked in the last 30 days, a few per run
 * (their limit is 10 requests a minute; the daily limit comes from the key's plan).
 */
export async function runNekChecks(deadline: number) {
  const s = await nekSettings();
  if (!s.key || !s.auto) return { skipped: !s.key ? "no key" : "off" };
  let left = 5;
  try {
    const u = await nekUsage(s.key);
    // Keep 3 searches a day for the "Провери" button.
    if (u.perDay) left = Math.min(left, u.perDay - u.usedToday - 3);
  } catch (e: any) {
    return { error: e.message };
  }
  if (left <= 0) return { checked: 0, reason: "daily limit" };
  const rows = await q<{ phone: string }>(
    `SELECT DISTINCT ON (right(regexp_replace(o.phone, '\\D', '', 'g'), 9)) o.phone
       FROM orders o JOIN shops s ON s.id = o.shop
       LEFT JOIN phone_checks pc ON pc.company_id = s.company_id AND pc.phone_key = right(regexp_replace(o.phone, '\\D', '', 'g'), 9)
      WHERE s.region = 'bg' AND s.company_id = ${companyId()} AND o.phone <> '' AND o.ordered_at > now() - interval '3 days' AND o.archived_at IS NULL
        AND (pc.phone_key IS NULL OR pc.checked_at < now() - interval '30 days')
      ORDER BY right(regexp_replace(o.phone, '\\D', '', 'g'), 9), o.ordered_at DESC
      LIMIT $1`,
    [left],
  );
  let checked = 0;
  let found = 0;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    try {
      const c = await checkPhone(s.key, r.phone);
      checked++;
      if (c.count) found++;
    } catch (e: any) {
      // A key or limit problem stops the round (and checks nothing); only a bad phone is written down.
      if (e.status !== 400) return { checked, found, error: e.message };
      const k = phoneKey(r.phone);
      if (k.length === 9)
        await q(
          `INSERT INTO phone_checks (company_id, phone_key, phone, checked_at, error) VALUES (${companyId()}, $1, $2, now(), $3)
           ON CONFLICT (company_id, phone_key) DO UPDATE SET checked_at = now(), error = excluded.error`,
          [k, r.phone, String(e.message).slice(0, 200)],
        );
    }
  }
  return { checked, found };
}
