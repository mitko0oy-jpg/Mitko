// Abandoned carts as orders (Изоставена), like Middleware: every unfinished order with a phone that has waited
// 20 minutes becomes an order row; confirming it turns it into a real order (manual, not in the shop);
// when the customer orders by themselves (or the cart is hidden), the abandoned row is archived.
import { sofiaDay } from "./dates.mts";
import { one, q } from "./db.mts";
import { addEvent } from "./edit.mts";
import { getRates, rateFor } from "./fx.mts";
import { MATCH, ORDERED } from "./leads.mts";
import { cartValue } from "./reminders.mts";
import { inCompany } from "./tenant.mts";

/** "Спрей с пчелна отрова · 2 · 25,80 €" → { name, qty, total } (the shop's cart line). */
export function cartLine(line: string, currency: string) {
  const parts = String(line || "").split(" · ").map((x) => x.trim());
  const name = parts[0] || "Продукт";
  const qty = Math.max(1, Math.min(99, parseInt(parts[1] || "1", 10) || 1));
  const v = cartValue(parts[2] || "", { rates: {}, date: null });
  return { name: name.slice(0, 200), qty, total: v.currency === currency || !v.currency ? v.amount : 0 };
}

export async function syncAbandoned(limit = 60) {
  const rates = await getRates();
  // 1) New abandoned rows.
  const leads = await q<any>(
    `SELECT l.*, s.currency FROM leads l JOIN shops s ON s.id = l.shop ${MATCH}
      WHERE ${inCompany("l.shop")} AND l.status = 'open' AND NOT ${ORDERED} AND l.phone <> ''
        AND l.last_at < now() - interval '20 minutes' AND l.first_at > now() - interval '3 days'
        AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.lead_id = l.id)
      ORDER BY l.last_at LIMIT $1`,
    [limit],
  );
  let made = 0;
  for (const l of leads) {
    const currency = l.currency || "EUR";
    const items = (Array.isArray(l.cart) ? l.cart : []).map((c: string) => cartLine(c, currency)).filter((i: any) => i.name);
    const sub = Math.round(items.reduce((n: number, i: any) => n + i.total, 0) * 100) / 100;
    // The shop's total; in another currency than the shop's (rare) – in euro.
    const tv = cartValue(l.total, rates);
    const total = (tv.currency === currency ? tv.amount : currency === "EUR" ? tv.eur : 0) || sub;
    const shipping = total > sub ? Math.round((total - sub) * 100) / 100 : 0;
    const fx = rateFor(currency, rates);
    const r = await one<any>(
      `INSERT INTO orders (shop, cb_id, order_no, ordered_at, day, cb_status, customer_name, phone, email, country, city, address,
                           shipping_name, delivery, items, currency, sub_total, shipping, discount, total, fx, total_eur, paid, payment_method,
                           cb_shipped, raw, cb_items, cb_sub_total, cb_shipping, cb_discount, cb_total, source, lead_id)
       VALUES ($1, $2, $3, $4, $5, 'abandoned', $6, $7, $8, 'BG', $9, $10, '', '{}'::jsonb, $11, $12, $13, $14, 0, $15, $16, round($15::numeric / $16::numeric, 2),
               false, 'cod', false, '{}'::jsonb, $11, $13, $14, 0, $15, 'abandoned', $17)
       ON CONFLICT DO NOTHING RETURNING id`,
      [l.shop, -(1_000_000_000 + Number(l.id)), `И${l.id}`, l.first_at, sofiaDay(new Date(l.first_at)), l.name || "", l.phone, l.email || "", l.city || "", l.address || "",
       JSON.stringify(items), currency, sub, shipping, total, fx, l.id],
    );
    if (r) {
      made++;
      await addEvent(Number(r.id), "create", "Изоставена количка: клиентът написа данните си във формата, но не поръча", {}, null, "OrderDesk");
    }
  }
  // 2) The customer ordered by themselves, or the cart was hidden: the abandoned row goes to the archive.
  const done = await q<any>(
    `SELECT o.id, l.status, m.order_no FROM orders o JOIN leads l ON l.id = o.lead_id ${MATCH}
      WHERE ${inCompany("o.shop")} AND o.stage = 'abandoned' AND o.archived_at IS NULL
        AND (l.status = 'dismissed' OR m.id IS NOT NULL)`,
  );
  for (const o of done) {
    await q("UPDATE orders SET archived_at = now() WHERE id = $1", [o.id]);
    await addEvent(Number(o.id), "archive", o.order_no ? `Клиентът поръча сам – поръчка № ${o.order_no}` : "Количката е скрита в Незавършени", {}, null, "OrderDesk");
  }
  return { made, archived: done.length };
}

/** Confirming an abandoned row makes it a real order (stage new) and the cart counts as ordered. */
export async function reviveAbandoned(id: number) {
  const o = await one<any>("UPDATE orders SET cb_status = 'pending', archived_at = NULL WHERE id = $1 AND cb_status = 'abandoned' RETURNING lead_id", [id]);
  if (o?.lead_id) await q("UPDATE leads SET order_id = $2 WHERE id = $1", [o.lead_id, id]);
  return Boolean(o);
}
