// Automatic SMS to parcels waiting at the courier's office (like „Невзета пратка“ in RevOrder: day 3 and day 5
// there, 72 h and +48 h after the arrival). Here the days follow the „Ден N в офиса“ badge – the arrival day is
// day 1 – so 72 h and 120 h are day 4 and day 6. Each reminder goes once per stay at the office, only while
// the parcel still waits (picked up, returned or redirected = no SMS), and not at night.
import { q } from "./db.mts";
import { addEvent } from "./edit.mts";
import { env } from "./http.mts";
import { fillTemplate, sendSms, smsSettings, toLatin } from "./sms.mts";
import { inCompany } from "./tenant.mts";

/** The day of waiting by Sofia days (the arrival day is day 1) – the same count as the badge in the list. */
const DAY_SQL = `((now() AT TIME ZONE 'Europe/Sofia')::date - (o.office_since AT TIME ZONE 'Europe/Sofia')::date + 1)`;

export async function runOfficeReminders(deadline: number) {
  const cfg = await smsSettings();
  if (!cfg.office.on) return { skipped: "off" };
  if (!cfg.token) return { skipped: "no sms" };
  const [from, to] = (env("REMINDER_HOURS") || "9-21").split("-").map(Number);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  if (hour < (from || 0) || hour >= (to || 24)) return { skipped: "night" };

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
          -- Someone already wrote to the client today (by hand or the other reminder): not again the same day.
          AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'sms' AND e.at > now() - interval '20 hours')
        ORDER BY o.office_since LIMIT 20`,
      [fromDay, toDay, step],
    );
    for (const o of rows) {
      if (Date.now() > deadline) return sent;
      o.total = Number(o.total);
      let text = fillTemplate(cfg.templates[step].text, o);
      if (cfg.latin) text = toLatin(text);
      const info = { auto: step, since: String(o.since), day: Number(o.office_day) };
      try {
        const r = await sendSms(o.phone, text);
        await addEvent(Number(o.id), "sms", `Автоматичен SMS (ден ${o.office_day} в офиса) до ${o.phone}: ${text}`, { ...info, parts: r.parts, points: r.points, id: r.id, status: r.status }, null, "OrderDesk");
        sent[step]++;
      } catch (e: any) {
        // Written down too, so a bad number is not tried every half hour.
        await addEvent(Number(o.id), "sms", `Автоматичният SMS (ден ${o.office_day} в офиса) не е изпратен: ${String(e.message).slice(0, 200)}`, { ...info, ok: false }, null, "OrderDesk");
        sent.failed++;
      }
    }
  }
  return sent;
}
