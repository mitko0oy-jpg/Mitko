// „Невзета пратка“ for the phone agent (like RevOrder's call reason „Невзета пратка в офис/локер“): the parcels that
// still wait at the courier's office after the SMS reminders, for Елена to call, and what the customer said.
// Each stay at the office is called once (orders.office_since, in info.pickup of the call's history line).
import { q } from "./db.mts";
import { addEvent } from "./edit.mts";
import { AI } from "./agent.mts";
import { addNote } from "./manage.mts";
import { inCompany } from "./tenant.mts";

const DAY_SQL = `((now() AT TIME ZONE 'Europe/Sofia')::date - (o.office_since AT TIME ZONE 'Europe/Sofia')::date + 1)`;
const SINCE = `floor(extract(epoch FROM o.office_since))::bigint`;

/** Parcels waiting at the office since day `day` (the arrival day is day 1), not yet called for this stay. */
export async function pickupToCall(day = 6, limit = 30) {
  const d = Math.min(Math.max(Math.trunc(day) || 6, 2), 9);
  const rows = await q<any>(
    `SELECT o.id, o.order_no, s.label AS shop_label, o.customer_name, o.phone, o.courier, o.tracking_no, o.total, o.currency,
            o.delivery, o.parcel_text, o.items, ${DAY_SQL} AS office_day, ${SINCE} AS since
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE ${inCompany("o.shop")} AND o.stage = 'at_office' AND o.parcel_status = 'at_office' AND o.office_since IS NOT NULL
        AND o.courier IN ('speedy', 'econt') AND coalesce(o.phone, '') <> '' AND o.archived_at IS NULL
        AND ${DAY_SQL} BETWEEN $1 AND $1 + 2
        AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'call' AND e.info->>'pickup' = ${SINCE}::text AND (e.info->>'done')::boolean)
      ORDER BY o.office_since LIMIT ${Math.min(Math.max(limit, 1), 100)}`,
    [d],
  );
  return rows.map((o) => ({
    id: Number(o.id),
    orderNo: o.order_no,
    shop: o.shop_label,
    name: o.customer_name,
    phone: o.phone,
    courier: o.courier,
    trackingNo: o.tracking_no,
    office: String(o.delivery?.officeName || o.parcel_text || "").slice(0, 160),
    total: Number(o.total),
    currency: o.currency || "EUR",
    officeDay: Number(o.office_day),
    since: String(o.since),
    canRedirect: o.courier === "econt",
    items: (Array.isArray(o.items) ? o.items : []).filter((i: any) => i && !i.digital).map((i: any) => ({ name: i.name, qty: i.qty || 1 })),
  }));
}

const OUTCOMES: Record<string, string> = {
  will_pickup: "ще я вземе",
  already_picked: "казва, че вече я е взел",
  redirect: "иска друг офис или адрес",
  someone_else: "ще я вземе друг човек",
  refuse: "не я иска",
  busy: "зает, да звъннем по-късно",
  wrong_person: "вдигна друг човек",
  wrong_number: "грешен номер",
  do_not_call: "не иска обаждания",
  needs_human: "иска да говори с колега",
  voicemail: "гласова поща",
  no_answer: "не вдигна",
  no_conversation: "няма разговор",
  unknown: "говорихме, но резултатът не е ясен – виж разговора",
};
// What a person must do next: written as the order's note („Провери: …“).
const ACT = new Set(["redirect", "refuse", "needs_human", "wrong_number", "already_picked", "unknown"]);

/** One pickup call: written in the order's history (and as a note when someone must act). */
export async function pickupResult(id: number, b: any) {
  const outcome = OUTCOMES[String(b?.outcome)] ? String(b.outcome) : "no_conversation";
  const s = (v: unknown, n = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const since = /^\d{6,12}$/.test(String(b?.since || "")) ? String(b.since) : "";
  const when = s(b?.when, 120);
  const place = s(b?.new_place, 200);
  const reason = s(b?.reason, 200);
  const summary = s(b?.summary, 500);
  const attempt = Math.max(1, Math.trunc(Number(b?.attempt)) || 1);
  // Done = we talked (whatever came out of it) or gave up after the last try: not called again for this stay.
  const talked = !["no_answer", "no_conversation", "voicemail", "busy"].includes(outcome);
  const done = talked || b?.final === true;
  const text = [
    `Обаждане за невзета пратка (опит ${attempt}): ${OUTCOMES[outcome]}`,
    when ? `кога: „${when}“` : "",
    place ? `къде: „${place}“` : "",
    reason ? `защо: „${reason}“` : "",
    summary ? `— ${summary}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  await addEvent(id, "call", text, { pickup: since, outcome, done, attempt }, null, AI);
  if (ACT.has(outcome)) {
    const what =
      outcome === "redirect"
        ? `пренасочи пратката${place ? ` към „${place}“` : ""} (за Еконт: „Пренасочи“ в поръчката)`
        : outcome === "refuse"
          ? `клиентът не иска пратката${reason ? ` („${reason}“)` : ""}`
          : outcome === "already_picked"
            ? "клиентът казва, че вече я е взел – виж статуса при куриера"
            : outcome === "wrong_number"
              ? "грешен номер – провери телефона"
              : outcome === "unknown"
                ? "говорихме, но резултатът не е ясен – виж разговора в Telegram"
                : "клиентът иска да говори с колега";
    await addNote(id, `Провери (невзета пратка): ${what}.`, null, AI);
  }
  return { ok: true, outcome, done };
}
