// E-mail through Brevo (transactional API: https://developers.brevo.com/reference/sendtransacemail).
// The key is typed in Незавършени → Напомняния (kept encrypted) or set as BREVO_API_KEY (company 1).
import { getSetting, setSetting } from "./db.mts";
import { env, HttpError } from "./http.mts";
import { seal, unseal } from "./secret.mts";
import { cKey, companyId, ENV_COMPANY } from "./tenant.mts";

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setEmailFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}
const base = () => env("EMAIL_API_URL") || "https://api.brevo.com/v3";
const fail = (m: string) => new HttpError(400, "email", m);
type Stored = { sealed?: string; fromName?: string; fromEmail?: string; at?: string };
export const validEmail = (e: string) => /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i.test(e);

export async function emailSettings() {
  const s = (await getSetting<Stored>(cKey("email"))) || {};
  const own = companyId() === ENV_COMPANY;
  let key = own ? env("BREVO_API_KEY") || "" : "";
  let source: "app" | "env" | null = key ? "env" : null;
  if (s.sealed) {
    try {
      key = unseal<string>(s.sealed);
      source = "app";
    } catch {
      /* the env key stays */
    }
  }
  const fromEmail = s.fromEmail || (own ? env("EMAIL_FROM") : "") || "";
  const fromName = s.fromName || (own ? env("EMAIL_FROM_NAME") : "") || "";
  return { key, source, fromEmail, fromName, configured: Boolean(key && fromEmail) };
}

async function call(key: string, path: string, init: RequestInit = {}) {
  const res = await fetchImpl(base() + path, {
    ...init,
    headers: { "api-key": key, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) throw fail(`Имейл: ${res.status === 401 ? "ключът не е приет" : data?.message || `грешка ${res.status}`}`);
  return data;
}

export async function saveEmailSettings(input: any) {
  const cur = (await getSetting<Stored>(cKey("email"))) || {};
  const next: Stored = { ...cur, at: new Date().toISOString() };
  if (typeof input?.key === "string" && input.key.trim()) {
    await call(input.key.trim(), "/account"); // a key that works
    next.sealed = seal(input.key.trim());
  }
  if (input?.removeKey === true) delete next.sealed;
  if (typeof input?.fromEmail === "string") {
    const e = input.fromEmail.trim().toLowerCase();
    if (e && !validEmail(e)) throw fail("Провери имейла на подателя.");
    next.fromEmail = e;
  }
  if (typeof input?.fromName === "string") next.fromName = input.fromName.trim().slice(0, 60);
  await setSetting(cKey("email"), next);
  const s = await emailSettings();
  return { source: s.source, fromEmail: s.fromEmail, fromName: s.fromName, configured: s.configured };
}

const html = (text: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2933">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>")}</div>`;

export type Attachment = { name: string; content: string }; // content in base64

export async function sendEmail(m: { to: string; name?: string; subject: string; text: string; footer?: string; html?: string; cc?: string[]; attachments?: Attachment[] }) {
  const cfg = await emailSettings();
  if (!cfg.configured) throw fail("Имейлът не е свързан. Добави ключ от Brevo и подател в Незавършени → Напомняния.");
  if (!validEmail(m.to)) throw fail("Невалиден имейл.");
  const text = m.footer ? `${m.text}\n\n—\n${m.footer}` : m.text;
  const d = await call(cfg.key, "/smtp/email", {
    method: "POST",
    body: JSON.stringify({
      sender: { email: cfg.fromEmail, ...(cfg.fromName ? { name: cfg.fromName } : {}) },
      to: [{ email: m.to, ...(m.name ? { name: m.name } : {}) }],
      ...(m.cc && m.cc.filter((e) => validEmail(e) && e !== m.to).length ? { cc: [...new Set(m.cc.filter((e) => validEmail(e) && e !== m.to))].map((email) => ({ email })) } : {}),
      subject: m.subject.slice(0, 200),
      textContent: text,
      htmlContent: m.html || html(text),
      ...(m.attachments && m.attachments.length ? { attachment: m.attachments } : {}),
    }),
  });
  return { id: String(d?.messageId || "") };
}
