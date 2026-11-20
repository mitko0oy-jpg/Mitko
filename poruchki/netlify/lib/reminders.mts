// Reminders to unfinished orders: the cart stream (Поток от колички), SMS and e-mail by hand,
// and the automatic ones (step 1 soon after leaving, step 2 the next day), each at most once.
import { createHmac } from "node:crypto";
import { getSetting, one, q, setSetting } from "./db.mts";
import { emailSettings, sendEmail } from "./email.mts";
import { getRates, rateFor } from "./fx.mts";
import { env, HttpError } from "./http.mts";
import { MATCH, ORDERED } from "./leads.mts";
import { sendSms, smsSettings, toLatin } from "./sms.mts";
import { cKey, companyId, inCompany } from "./tenant.mts";

const fail = (m: string) => new HttpError(400, "remind", m);
export const WINDOW_H = 72; // a cart older than this is gone

export type ReminderSettings = {
  auto: boolean;
  step1: { after: number; sms: boolean; email: boolean }; // minutes after they left the form
  step2: { on: boolean; after: number; sms: boolean; email: boolean }; // hours after they left the form
  sms: string;
  emailSubject: string;
  emailText: string;
};
export const DEFAULT_REMINDERS: ReminderSettings = {
  auto: false,
  step1: { after: 30, sms: true, email: true },
  step2: { on: true, after: 24, sms: false, email: true },
  sms: "Здравейте, {име}! Поръчката Ви в {магазин} не е завършена. Може да я завършите тук: {линк}",
  emailSubject: "{име}, поръчката Ви в {магазин} не е завършена",
  emailText:
    "Здравейте, {име}!\n\nВидяхме, че не завършихте поръчката си в {магазин}:\n{количка}\nОбщо: {сума}\n\nМожете да я завършите тук: {линк}\n\nАко имате въпрос, просто отговорете на този имейл.",
};

export async function reminderSettings(): Promise<ReminderSettings> {
  const s: any = (await getSetting(cKey("cart_reminders"))) || {};
  return {
    ...DEFAULT_REMINDERS,
    ...s,
    step1: { ...DEFAULT_REMINDERS.step1, ...s.step1 },
    step2: { ...DEFAULT_REMINDERS.step2, ...s.step2 },
  };
}

export async function saveReminderSettings(input: any) {
  const cur = await reminderSettings();
  const int = (v: unknown, min: number, max: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const text = (v: unknown, max: number, d: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);
  const next: ReminderSettings = {
    auto: bool(input?.auto, cur.auto),
    step1: {
      after: int(input?.step1?.after, 10, 24 * 60, cur.step1.after),
      sms: bool(input?.step1?.sms, cur.step1.sms),
      email: bool(input?.step1?.email, cur.step1.email),
    },
    step2: {
      on: bool(input?.step2?.on, cur.step2.on),
      after: int(input?.step2?.after, 2, WINDOW_H - 1, cur.step2.after),
      sms: bool(input?.step2?.sms, cur.step2.sms),
      email: bool(input?.step2?.email, cur.step2.email),
    },
    sms: text(input?.sms, 600, cur.sms),
    emailSubject: text(input?.emailSubject, 200, cur.emailSubject),
    emailText: text(input?.emailText, 4000, cur.emailText),
  };
  if (!next.sms.includes("{линк}")) throw fail("SMS-ът трябва да съдържа {линк}, за да може клиентът да завърши поръчката.");
  await setSetting(cKey("cart_reminders"), next);
  return next;
}

// ---- the cart's value in EUR (the shop shows "24,50 €" or "12 780 Ft") ----
export function cartValue(total: string, rates: { rates: Record<string, number>; date: string | null }) {
  const t = String(total || "");
  const n = Number(t.replace(/[^\d,.]/g, "").replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return { amount: 0, currency: "", eur: 0 };
  const currency = /huf|ft/i.test(t) ? "HUF" : /czk|kč/i.test(t) ? "CZK" : /ron|lei/i.test(t) ? "RON" : /pln|zł/i.test(t) ? "PLN" : "EUR";
  return { amount: n, currency, eur: Math.round((n / rateFor(currency, rates)) * 100) / 100 };
}

const first = (name: string) => String(name || "").trim().split(/\s+/)[0] || "";
/** {име} {магазин} {линк} {количка} {сума} for a cart. */
export function fillLead(text: string, l: any) {
  const values: Record<string, string> = {
    "{име}": first(l.name),
    "{магазин}": String(l.shop_label || "").replace(/\s+(BG|SK|SI|HU)$/i, ""),
    "{линк}": l.shop_domain ? `https://${l.shop_domain}${l.page && l.page.startsWith("/") ? l.page : "/"}` : "",
    "{количка}": (l.cart || []).map((c: string) => `• ${c}`).join("\n"),
    "{сума}": String(l.total || ""),
  };
  return Object.entries(values)
    .reduce((t, [k, v]) => t.split(k).join(v), text)
    .replace(/^Здравейте, !/, "Здравейте!")
    .replace(/[ \t]+([,.!])/g, "$1")
    .trim();
}

// ---- opting out (the link in every e-mail) ----
const contactKey = (c: string) => (c.includes("@") ? c.trim().toLowerCase() : c.replace(/\D/g, "").slice(-9));
const sign = (company: number, contact: string) =>
  createHmac("sha256", env("SECRET_KEY") || "dev").update(`unsub:${company}:${contact}`).digest("base64url").slice(0, 22);
export function unsubLink(contact: string) {
  const k = contactKey(contact);
  const site = env("URL") || "https://mitko-poruchki.netlify.app";
  return `${site}/api/unsub?c=${companyId()}&k=${encodeURIComponent(k)}&s=${sign(companyId(), k)}`;
}
export async function optOut(company: number, contact: string, sig: string) {
  const k = contactKey(contact);
  if (!k || sig !== sign(company, k)) return false;
  await q("INSERT INTO optouts (company_id, contact) VALUES ($1, $2) ON CONFLICT DO NOTHING", [company, k]);
  return true;
}
async function optedOut(contact: string) {
  return Boolean(await one("SELECT 1 FROM optouts WHERE company_id = $1 AND contact = $2", [companyId(), contactKey(contact)]));
}

async function loadLead(id: number) {
  const l = await one<any>(
    `SELECT l.*, s.label AS shop_label, s.domain AS shop_domain FROM leads l JOIN shops s ON s.id = l.shop
      WHERE l.id = $1 AND s.company_id = $2`,
    [id, companyId()],
  );
  if (!l) throw new HttpError(404, "not_found", "Няма такава незавършена поръчка.");
  return l;
}

/** One SMS or e-mail to the customer of a cart; written to its history either way. */
export async function remind(id: number, channel: "sms" | "email", input: { text?: string; subject?: string }, step: "manual" | "auto1" | "auto2", userId: number | null) {
  const l = await loadLead(id);
  const cfg = await reminderSettings();
  const to = channel === "sms" ? l.phone : l.email;
  if (!to) throw fail(channel === "sms" ? "Няма телефон." : "Няма имейл – клиентът не го е написал.");
  if (await optedOut(to)) throw fail("Клиентът се е отписал от напомнянията.");
  let text = fillLead(typeof input.text === "string" && input.text.trim() ? input.text.trim() : channel === "sms" ? cfg.sms : cfg.emailText, l);
  try {
    if (channel === "sms") {
      if ((await smsSettings()).latin) text = toLatin(text);
      await sendSms(to, text);
    } else {
      const subject = fillLead(typeof input.subject === "string" && input.subject.trim() ? input.subject.trim() : cfg.emailSubject, l);
      await sendEmail({ to, name: l.name, subject, text, footer: `Не искате напомняния? Отпишете се: ${unsubLink(to)}` });
    }
    await q("INSERT INTO lead_messages (lead_id, channel, step, text, ok, user_id) VALUES ($1, $2, $3, $4, true, $5)", [id, channel, step, text, userId]);
    return { ok: true, channel, text };
  } catch (e: any) {
    await q("INSERT INTO lead_messages (lead_id, channel, step, text, ok, error, user_id) VALUES ($1, $2, $3, $4, false, $5, $6)", [id, channel, step, text, String(e.message).slice(0, 300), userId]);
    throw e;
  }
}

/** The automatic reminders of the company (from the sync, every 30 minutes). Quiet at night. */
export async function runCartReminders(deadline: number) {
  const cfg = await reminderSettings();
  if (!cfg.auto) return { skipped: "off" };
  // Quiet hours in Sofia (REMINDER_HOURS, default 9-21).
  const [from, to] = (env("REMINDER_HOURS") || "9-21").split("-").map(Number);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  if (hour < (from || 0) || hour >= (to || 24)) return { skipped: "night" };
  const sms = Boolean((await smsSettings()).token);
  const mail = (await emailSettings()).configured;
  const sent = { auto1: 0, auto2: 0, failed: 0 };
  const steps: ["auto1" | "auto2", string, { sms: boolean; email: boolean }][] = [["auto1", `${cfg.step1.after} minutes`, cfg.step1]];
  if (cfg.step2.on) steps.push(["auto2", `${cfg.step2.after} hours`, cfg.step2]);
  for (const [step, after, how] of steps) {
    const rows = await q<any>(
      `SELECT l.id, l.phone, l.email FROM leads l ${MATCH}
        WHERE ${inCompany("l.shop")} AND l.status = 'open' AND NOT ${ORDERED}
          AND l.last_at < now() - $1::interval AND l.last_at > now() - interval '${WINDOW_H} hours'
          AND NOT EXISTS (SELECT 1 FROM lead_messages x WHERE x.lead_id = l.id AND x.step = $2)
        ORDER BY l.last_at DESC LIMIT 15`,
      [after, step],
    );
    for (const r of rows) {
      if (Date.now() > deadline) return sent;
      const channels: ("sms" | "email")[] = [];
      if (how.sms && sms && r.phone) channels.push("sms");
      if (how.email && mail && r.email) channels.push("email");
      if (!channels.length) {
        // Nothing to send it with: marked, so it is not looked at again.
        await q("INSERT INTO lead_messages (lead_id, channel, step, ok, error) VALUES ($1, 'sms', $2, false, 'няма как да се прати')", [r.id, step]);
        continue;
      }
      for (const ch of channels) {
        try {
          await remind(Number(r.id), ch, {}, step, null);
          sent[step]++;
        } catch {
          sent.failed++;
        }
      }
    }
  }
  return sent;
}

/** The cart stream: open carts of the last 72 hours with their value and reminders, and today's recovered ones. */
export async function cartStream(shop = "") {
  const rates = await getRates();
  const params: unknown[] = [];
  let shopSql = "";
  if (shop) {
    params.push(shop);
    shopSql = ` AND l.shop = $${params.length}`;
  }
  const rows = await q<any>(
    `SELECT l.id, l.shop, s.label AS shop_label, s.domain AS shop_domain, l.page, l.city, l.address, l.name, l.phone, l.email, l.total, l.cart, l.first_at, l.last_at, l.known,
            (SELECT count(*) FROM lead_messages x WHERE x.lead_id = l.id AND x.ok)::int AS reminders,
            (SELECT max(x.at) FROM lead_messages x WHERE x.lead_id = l.id AND x.ok) AS last_reminder
       FROM leads l JOIN shops s ON s.id = l.shop ${MATCH}
      WHERE ${inCompany("l.shop")} AND l.status = 'open' AND NOT ${ORDERED}
        AND l.last_at > now() - interval '${WINDOW_H} hours'${shopSql}
      ORDER BY l.last_at DESC LIMIT 400`,
    params,
  );
  const carts = rows.map((r: any) => ({ ...r, id: Number(r.id), value: cartValue(r.total, rates), hours: (Date.now() - Date.parse(r.last_at)) / 3600e3 }));
  // Recovered today: a cart that got a reminder and then the order came (today).
  const rec = await one<any>(
    `SELECT count(*)::int AS n, coalesce(sum(m.total_eur), 0)::float AS sum,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM lead_messages x WHERE x.lead_id = l.id AND x.ok AND x.at < m.ordered_at))::int AS after_reminder
       FROM leads l ${MATCH}
      WHERE ${inCompany("l.shop")} AND m.id IS NOT NULL
        AND (m.ordered_at AT TIME ZONE 'Europe/Sofia')::date = (now() AT TIME ZONE 'Europe/Sofia')::date${shopSql}`,
    params,
  );
  return { window: WINDOW_H, carts, recovered: { n: rec?.n || 0, sum: Math.round((rec?.sum || 0) * 100) / 100, afterReminder: rec?.after_reminder || 0 } };
}
