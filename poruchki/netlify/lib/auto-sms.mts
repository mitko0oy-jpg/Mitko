// Automatic SMS to customers (ideas taken from RevOrder's ready automations, done our way):
//  - „Пратката чака в офис“: day 4 and day 6 of waiting (RevOrder: 72 h and +48 h after the arrival). The days follow the
//    „Ден N в офиса“ badge – the arrival day is day 1.
//  - „Изпратена пратка“: once, when the courier has taken the parcel (in transit) – the client knows it is coming, fewer refusals.
//  - „Нова поръчка“: N days after the delivery, by product (a 5-gel package lasts longer than one gel); not when the client
//    already ordered again, was called by the agent lately or opted out.
// Each goes once (written in the order's history with info.auto), only in the day (REMINDER_HOURS, Sofia), and only to
// Bulgarian parcels of our couriers (Speedy, Econt) – abroad goes through the fulfilment company and another language.
import { q } from "./db.mts";
import { addEvent } from "./edit.mts";
import { env } from "./http.mts";
import { optedOut, shortUnsubLink } from "./reminders.mts";
import { fillTemplate, sendSms, smsSettings, toLatin, type ReorderRule } from "./sms.mts";
import { inCompany } from "./tenant.mts";

/** The day of waiting by Sofia days (the arrival day is day 1) – the same count as the badge in the list. */
const DAY_SQL = `((now() AT TIME ZONE 'Europe/Sofia')::date - (o.office_since AT TIME ZONE 'Europe/Sofia')::date + 1)`;
/** Not when someone already wrote to the client in the last 20 hours (by hand or another reminder). */
const NOT_TODAY = `NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'sms' AND e.at > now() - interval '20 hours')`;
const OUR_COURIERS = `o.courier IN ('speedy', 'econt')`;

export function quietNow() {
  const [from, to] = (env("REMINDER_HOURS") || "9-21").split("-").map(Number);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  return hour < (from || 0) || hour >= (to || 24);
}

type Cfg = Awaited<ReturnType<typeof smsSettings>>;

/** Sends one automatic SMS and writes it (or why it failed) in the order's history, so it is not tried again. */
async function sendAuto(cfg: Cfg, o: any, template: string, info: Record<string, unknown>, label: string, extra: Record<string, string> = {}) {
  o.total = Number(o.total);
  let text = fillTemplate(template, o);
  for (const [k, v] of Object.entries(extra)) text = text.split(k).join(v);
  text = text.replace(/\s{2,}/g, " ").trim();
  if (cfg.latin) text = toLatin(text);
  try {
    const r = await sendSms(o.phone, text);
    await addEvent(Number(o.id), "sms", `Автоматичен SMS (${label}) до ${o.phone}: ${text}`, { ...info, parts: r.parts, points: r.points, id: r.id, status: r.status }, null, "OrderDesk");
    return true;
  } catch (e: any) {
    await addEvent(Number(o.id), "sms", `Автоматичният SMS (${label}) не е изпратен: ${String(e.message).slice(0, 200)}`, { ...info, ok: false }, null, "OrderDesk");
    return false;
  }
}

// ---- 1) The parcel waits at the office: day 4 and day 6 ----

export async function runOfficeReminders(deadline: number) {
  const cfg = await smsSettings();
  if (!cfg.office.on) return { skipped: "off" };
  if (!cfg.token) return { skipped: "no sms" };
  if (quietNow()) return { skipped: "night" };

  const { day1, day2 } = cfg.office;
  const sent = { office1: 0, office2: 0, failed: 0 };
  // The first one only before the day of the second (a parcel found late gets just the last reminder);
  // the last one not long after its day (by then the courier is sending it back).
  const steps: ["office1" | "office2", number, number][] = [
    ["office1", day1, day2 - 1],
    ["office2", day2, day2 + 1],
  ];
  for (const [step, fromDay, toDay] of steps) {
    const rows = await q<any>(
      `SELECT o.*, s.label AS shop_label, ${DAY_SQL} AS office_day, floor(extract(epoch FROM o.office_since))::bigint AS since
         FROM orders o JOIN shops s ON s.id = o.shop
        WHERE ${inCompany("o.shop")} AND o.stage = 'at_office' AND o.parcel_status = 'at_office' AND o.office_since IS NOT NULL
          AND coalesce(o.phone, '') <> '' AND ${DAY_SQL} BETWEEN $1 AND $2
          AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'sms' AND e.info->>'auto' = $3
                             AND e.info->>'since' = floor(extract(epoch FROM o.office_since))::bigint::text)
          AND ${NOT_TODAY}
        ORDER BY o.office_since LIMIT 20`,
      [fromDay, toDay, step],
    );
    for (const o of rows) {
      if (Date.now() > deadline) return sent;
      const ok = await sendAuto(cfg, o, cfg.templates[step].text, { auto: step, since: String(o.since), day: Number(o.office_day) }, `ден ${o.office_day} в офиса`);
      if (ok) sent[step]++;
      else sent.failed++;
    }
  }
  return sent;
}

// ---- 2) The parcel is on its way ----

export async function runShippedSms(deadline: number) {
  const cfg = await smsSettings();
  if (!cfg.shippedAuto.on) return { skipped: "off" };
  if (!cfg.token) return { skipped: "no sms" };
  if (quietNow()) return { skipped: "night" };
  const sent = { shipped: 0, failed: 0 };
  // In transit by the courier's own tracking (not just a waybill made – it may still be cancelled), sent in the
  // last 3 days, once per waybill number.
  const rows = await q<any>(
    `SELECT o.*, s.label AS shop_label
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE ${inCompany("o.shop")} AND o.stage = 'shipped' AND o.parcel_status = 'in_transit' AND ${OUR_COURIERS}
        AND o.tracking_no IS NOT NULL AND coalesce(o.phone, '') <> '' AND o.archived_at IS NULL
        AND coalesce(o.sent_at, o.ordered_at) > now() - interval '3 days'
        AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'sms'
                         AND (e.info->>'auto' = 'shipped' AND e.info->>'tracking' = o.tracking_no OR e.at > coalesce(o.sent_at, o.ordered_at)))
      ORDER BY o.sent_at LIMIT 30`,
  );
  for (const o of rows) {
    if (Date.now() > deadline) return sent;
    const ok = await sendAuto(cfg, o, cfg.templates.shipped.text, { auto: "shipped", tracking: o.tracking_no }, "изпратена пратка");
    if (ok) sent.shipped++;
    else sent.failed++;
  }
  return sent;
}

// ---- 3) Time for a new order ----

/** The first rule whose word is in one of the order's product lines (an empty word = any product). */
export function reorderRule(items: any[], rules: ReorderRule[]): { rule: ReorderRule; product: string } | null {
  const lines = (Array.isArray(items) ? items : []).filter((i) => i && !i.digital && i.name);
  for (const rule of rules) {
    const w = rule.match.trim().toLowerCase();
    const hit = lines.find((i) => !w || String(i.name).toLowerCase().includes(w));
    if (hit) return { rule, product: String(hit.name).replace(/\s*[-–]\s*\d.*$/, "").trim() };
  }
  return null;
}

const DELIVERED_AT = `coalesce(o.delivered_at, o.parcel_at)`;

export async function runReorderReminders(deadline: number) {
  const cfg = await smsSettings();
  const rr = cfg.reorder;
  if (!rr.on || !rr.rules.length) return { skipped: "off" };
  if (!cfg.token) return { skipped: "no sms" };
  if (quietNow()) return { skipped: "night" };
  const sent = { reorder: 0, failed: 0, skipped: 0 };
  const minDays = Math.min(...rr.rules.map((r) => r.days));
  const maxDays = Math.max(...rr.rules.map((r) => r.days));
  // Delivered orders in the window of the rules (+3 days, so a missed run still catches them), whose client has
  // not ordered since, has no message or call in the last 30 days, and that did not get this reminder yet.
  const rows = await q<any>(
    `SELECT o.*, s.label AS shop_label, s.domain AS shop_domain,
            floor(extract(epoch FROM now() - ${DELIVERED_AT}) / 86400)::int AS days_since
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE ${inCompany("o.shop")} AND o.stage = 'delivered' AND ${OUR_COURIERS} AND coalesce(o.phone, '') <> ''
        AND ${DELIVERED_AT} < now() - make_interval(days => $1) AND ${DELIVERED_AT} > now() - make_interval(days => $2)
        AND NOT EXISTS (SELECT 1 FROM orders n WHERE n.id <> o.id AND right(regexp_replace(n.phone, '\\D', '', 'g'), 9) = right(regexp_replace(o.phone, '\\D', '', 'g'), 9)
                         AND n.ordered_at > o.ordered_at AND n.stage NOT IN ('abandoned', 'duplicate') AND n.shop IN (SELECT id FROM shops WHERE company_id = s.company_id))
        AND NOT EXISTS (SELECT 1 FROM order_events e JOIN orders x ON x.id = e.order_id
                         WHERE right(regexp_replace(x.phone, '\\D', '', 'g'), 9) = right(regexp_replace(o.phone, '\\D', '', 'g'), 9)
                           AND e.kind IN ('sms', 'call') AND e.at > now() - interval '30 days')
        AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.info->>'auto' = 'reorder')
      ORDER BY ${DELIVERED_AT} LIMIT 25`,
    [minDays, maxDays + 3],
  );
  for (const o of rows) {
    if (Date.now() > deadline) return sent;
    const hit = reorderRule(o.items, rr.rules);
    // Its own rule decides the day (a short rule matched the package of a longer one, or the day is not there yet).
    if (!hit || o.days_since < hit.rule.days || o.days_since > hit.rule.days + 3) {
      sent.skipped++;
      continue;
    }
    if (await optedOut(o.phone)) {
      await addEvent(Number(o.id), "sms", "Напомнянето за нова поръчка не е изпратено: клиентът се е отписал.", { auto: "reorder", ok: false }, null, "OrderDesk");
      sent.skipped++;
      continue;
    }
    const link = o.shop_domain ? `https://${String(o.shop_domain).replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : "";
    const ok = await sendAuto(cfg, o, cfg.templates.reorder.text, { auto: "reorder", days: o.days_since, rule: hit.rule.match }, `нова поръчка, ${o.days_since} дни след доставката`, {
      "{продукт}": hit.product,
      "{дни}": String(o.days_since),
      "{линк}": link,
      "{отписване}": shortUnsubLink(o.phone),
    });
    if (ok) sent.reorder++;
    else sent.failed++;
  }
  return sent;
}
