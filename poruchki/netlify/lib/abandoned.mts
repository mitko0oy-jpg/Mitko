// Abandoned carts as orders (Изоставена), like Middleware: every unfinished order with a phone that has waited
// 20 minutes becomes an order row; confirming it turns it into a real order (manual, not in the shop);
// when the customer orders by themselves (or the cart is hidden), the abandoned row is archived.
import { sofiaDay } from "./dates.mts";
import { one, q } from "./db.mts";
import { addEvent } from "./edit.mts";
import { getRates, rateFor } from "./fx.mts";
import { MATCH, ORDERED } from "./leads.mts";
import { cartValue, trailingPrices } from "./reminders.mts";
import { inCompany } from "./tenant.mts";

/** The cart line from c.js → { name, qty, total } (total = the price of the line, the old crossed-out price is dropped):
 *  "Спрей с пчелна отрова · 2 · 25,80 €" (c.js since 22.11.2026) or the row's text as it was before
 *  ("Образователни карти за НВО €39.90 €27.90", "BeeVenom 3+2 VÁLTOZTAT - + Ft32,990Ft10,990"). */
export function cartLine(line: string, currency: string) {
  const parts = String(line || "").split(" · ").map((x) => x.trim());
  let name = parts[0] || "";
  let qty = 1;
  let price: { amount: number; currency: string };
  if (parts.length >= 3) {
    qty = Math.max(1, Math.min(99, parseInt(parts[1], 10) || 1));
    price = cartValue(parts[2], { rates: {}, date: null });
  } else {
    const t = trailingPrices(name);
    name = t.rest;
    price = t.prices[t.prices.length - 1] || { amount: 0, currency: "" };
  }
  // The buttons of the cart row ("ПРОМЕНИ - +", "VÁLTOZTAT - +") are not part of the name.
  const buttons = /\s*[-–−]\s*\+$/.test(name);
  name = name
    .replace(/\s*[-–−]\s*\+$/, "")
    .replace(buttons ? /\s+\p{Lu}{4,}$/u : /\s+(?:ПРОМЕНИ|VÁLTOZTAT|ZMENIŤ|ZMENIT|SPREMENI|CHANGE)$/iu, "")
    .trim();
  return { name: (name || "Продукт").slice(0, 200), qty, total: price.currency === currency || !price.currency ? price.amount : 0 };
}

/** Products and sums of an abandoned row from its cart (the shop's total; the difference to the products is the delivery). */
function fromCart(l: any, rates: any) {
  const currency = l.currency || "EUR";
  const items = (Array.isArray(l.cart) ? l.cart : []).map((c: string) => cartLine(c, currency)).filter((i: any) => i.name);
  const sub = Math.round(items.reduce((n: number, i: any) => n + i.total, 0) * 100) / 100;
  // The shop's total; in another currency than the shop's (rare) – in euro.
  const tv = cartValue(l.total, rates);
  const total = (tv.currency === currency ? tv.amount : currency === "EUR" ? tv.eur : 0) || sub;
  const shipping = total > sub ? Math.round((total - sub) * 100) / 100 : 0;
  return { currency, items, sub, shipping, total, fx: rateFor(currency, rates) };
}

export async function syncAbandoned(limit = 60) {
  const rates = await getRates();
  // 1) New abandoned rows.
  const leads = await q<any>(
    `SELECT l.*, s.currency,
            (SELECT x.country FROM orders x WHERE x.shop = l.shop AND x.country <> '' AND x.cb_status <> 'abandoned' ORDER BY x.ordered_at DESC LIMIT 1) AS shop_country
       FROM leads l JOIN shops s ON s.id = l.shop ${MATCH}
      WHERE ${inCompany("l.shop")} AND l.status = 'open' AND NOT ${ORDERED} AND l.phone <> ''
        AND l.last_at < now() - interval '20 minutes' AND l.first_at > now() - interval '3 days'
        AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.lead_id = l.id)
      ORDER BY l.last_at LIMIT $1`,
    [limit],
  );
  let made = 0;
  for (const l of leads) {
    const { currency, items, sub, shipping, total, fx } = fromCart(l, rates);
    const r = await one<any>(
      `INSERT INTO orders (shop, cb_id, order_no, ordered_at, day, cb_status, customer_name, phone, email, country, city, address,
                           shipping_name, delivery, items, currency, sub_total, shipping, discount, total, fx, total_eur, paid, payment_method,
                           cb_shipped, raw, cb_items, cb_sub_total, cb_shipping, cb_discount, cb_total, source, lead_id)
       VALUES ($1, $2, $3, $4, $5, 'abandoned', $6, $7, $8, $18, $9, $10, '', '{}'::jsonb, $11, $12, $13, $14, 0, $15, $16, round($15::numeric / $16::numeric, 2),
               false, 'cod', false, '{}'::jsonb, $11, $13, $14, 0, $15, 'abandoned', $17)
       ON CONFLICT DO NOTHING RETURNING id`,
      [l.shop, -(1_000_000_000 + Number(l.id)), `И${l.id}`, l.first_at, sofiaDay(new Date(l.first_at)), l.name || "", l.phone, l.email || "", l.city || "", l.address || "",
       JSON.stringify(items), currency, sub, shipping, total, fx, l.id, l.shop_country || "BG"],
    );
    if (r) {
      made++;
      await addEvent(Number(r.id), "create", "Изоставена количка: клиентът написа данните си във формата, но не поръча", {}, null, "OrderDesk");
    }
  }
  // 1b) Rows made before: the cart may have changed since (or was read without prices before 22.11.2026) –
  // the products and sums follow the cart until the row is corrected by hand (Редактирай) or confirmed.
  const open = await q<any>(
    `SELECT o.id, o.items, o.total, s.currency, l.cart, l.total AS lead_total
       FROM orders o JOIN leads l ON l.id = o.lead_id JOIN shops s ON s.id = o.shop
      WHERE ${inCompany("o.shop")} AND o.cb_status = 'abandoned' AND o.archived_at IS NULL AND o.edit IS NULL
      ORDER BY o.id DESC LIMIT 300`,
  );
  let refreshed = 0;
  for (const o of open) {
    const c = fromCart({ cart: o.cart, total: o.lead_total, currency: o.currency }, rates);
    const key = (items: any[]) => JSON.stringify((items || []).map((i: any) => [i.name, Number(i.qty), Number(i.total)]));
    if (!c.items.length || (key(c.items) === key(o.items) && Number(o.total) === c.total)) continue;
    const r = await one<any>(
      `UPDATE orders SET items = $2, cb_items = $2, sub_total = $3, cb_sub_total = $3, shipping = $4, cb_shipping = $4,
                         total = $5, cb_total = $5, fx = $6, total_eur = round($5::numeric / $6::numeric, 2)
        WHERE id = $1 AND cb_status = 'abandoned' AND edit IS NULL RETURNING id`,
      [o.id, JSON.stringify(c.items), c.sub, c.shipping, c.total, c.fx],
    );
    if (r) refreshed++;
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
  return { made, refreshed, archived: done.length };
}

/** Confirming an abandoned row makes it a real order (stage new) and the cart counts as ordered. */
export async function reviveAbandoned(id: number) {
  const o = await one<any>("UPDATE orders SET cb_status = 'pending', archived_at = NULL WHERE id = $1 AND cb_status = 'abandoned' RETURNING lead_id", [id]);
  if (o?.lead_id) await q("UPDATE leads SET order_id = $2 WHERE id = $1", [o.lead_id, id]);
  return Boolean(o);
}
