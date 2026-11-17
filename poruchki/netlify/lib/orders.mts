// Writing orders from ConvertBuilder into the database.
// The shop owns the order data; the waybill number is taken from the shop unless we made the waybill
// ourselves; the parcel status belongs to the courier and is only reset when the waybill number changes.
import { normalize } from "./cb.mts";
import { sofiaDay } from "./dates.mts";
import { q } from "./db.mts";
import { rateFor, type Rates } from "./fx.mts";

const COLS = [
  "shop", "cb_id", "order_no", "ordered_at", "day", "cb_status", "customer_name", "phone", "email", "country", "city", "zip",
  "address", "address2", "shipping_name", "delivery", "items", "currency", "sub_total", "shipping", "discount", "total", "fx",
  "total_eur", "paid", "payment_method", "courier", "tracking_no", "tracking_url", "tracking_source", "cb_shipped", "raw",
];

// The courier's data for a parcel – forgotten when the shop starts showing a different waybill.
const KEEP_OWN = "orders.tracking_source = 'own' OR EXCLUDED.tracking_no IS NULL";
const NEW_WAYBILL = "(orders.tracking_source IS DISTINCT FROM 'own' AND EXCLUDED.tracking_no IS NOT NULL AND EXCLUDED.tracking_no IS DISTINCT FROM orders.tracking_no)";
const SAME_CURRENCY = "orders.currency = EXCLUDED.currency";

const UPSERT_TAIL = `
ON CONFLICT (shop, cb_id) DO UPDATE SET
  order_no = EXCLUDED.order_no, ordered_at = EXCLUDED.ordered_at, day = EXCLUDED.day, cb_status = EXCLUDED.cb_status,
  customer_name = EXCLUDED.customer_name, phone = EXCLUDED.phone, email = EXCLUDED.email, country = EXCLUDED.country,
  city = EXCLUDED.city, zip = EXCLUDED.zip, address = EXCLUDED.address, address2 = EXCLUDED.address2,
  shipping_name = EXCLUDED.shipping_name, delivery = EXCLUDED.delivery, items = EXCLUDED.items, currency = EXCLUDED.currency,
  sub_total = EXCLUDED.sub_total, shipping = EXCLUDED.shipping, discount = EXCLUDED.discount, total = EXCLUDED.total,
  fx = CASE WHEN ${SAME_CURRENCY} THEN orders.fx ELSE EXCLUDED.fx END,
  total_eur = round(EXCLUDED.total / CASE WHEN ${SAME_CURRENCY} THEN orders.fx ELSE EXCLUDED.fx END, 2),
  paid = EXCLUDED.paid, payment_method = EXCLUDED.payment_method, cb_shipped = EXCLUDED.cb_shipped, raw = EXCLUDED.raw,
  synced_at = now(),
  courier = CASE WHEN ${KEEP_OWN} THEN orders.courier ELSE EXCLUDED.courier END,
  tracking_url = CASE WHEN ${KEEP_OWN} THEN orders.tracking_url ELSE EXCLUDED.tracking_url END,
  tracking_source = CASE WHEN ${KEEP_OWN} THEN orders.tracking_source ELSE 'cb' END,
  tracking_no = CASE WHEN ${KEEP_OWN} THEN orders.tracking_no ELSE EXCLUDED.tracking_no END,
  parcel_status = CASE WHEN ${NEW_WAYBILL} THEN NULL ELSE orders.parcel_status END,
  parcel_text = CASE WHEN ${NEW_WAYBILL} THEN NULL ELSE orders.parcel_text END,
  parcel_at = CASE WHEN ${NEW_WAYBILL} THEN NULL ELSE orders.parcel_at END,
  parcel_final = CASE WHEN ${NEW_WAYBILL} THEN false ELSE orders.parcel_final END,
  parcel_events = CASE WHEN ${NEW_WAYBILL} THEN '[]'::jsonb ELSE orders.parcel_events END,
  tracked_at = CASE WHEN ${NEW_WAYBILL} THEN NULL ELSE orders.tracked_at END,
  delivered_at = CASE WHEN ${NEW_WAYBILL} THEN NULL ELSE orders.delivered_at END
RETURNING (xmax = 0) AS inserted`;

export async function upsertOrders(shop: { id: string; currency: string }, raws: any[], rates: Rates): Promise<{ inserted: number; updated: number }> {
  const seen = new Set<number>();
  const list = raws
    .filter((o) => o && Number.isFinite(Number(o.id)))
    .map((o) => ({ raw: o, n: normalize(o) }))
    .filter(({ n }) => !seen.has(n.cb_id) && !!seen.add(n.cb_id));
  let inserted = 0;
  let updated = 0;
  const fx = rateFor(shop.currency, rates);
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const vals: unknown[] = [];
    const tuples = chunk.map(({ raw, n }, j) => {
      vals.push(
        shop.id, n.cb_id, n.order_no, n.ordered_at.toISOString(), sofiaDay(n.ordered_at), n.cb_status, n.customer_name, n.phone, n.email,
        n.country, n.city, n.zip, n.address, n.address2, n.shipping_name, JSON.stringify(n.delivery), JSON.stringify(n.items),
        shop.currency, n.sub_total, n.shipping, n.discount, n.total, fx, Math.round((n.total / fx) * 100) / 100, n.paid,
        n.payment_method, n.courier, n.tracking_no, n.tracking_url, n.tracking_no ? "cb" : null, n.cb_shipped, JSON.stringify(raw),
      );
      const b = j * COLS.length;
      return `(${COLS.map((_, k) => `$${b + k + 1}`).join(", ")})`;
    });
    const rows = await q<{ inserted: boolean }>(`INSERT INTO orders (${COLS.join(", ")}) VALUES ${tuples.join(", ")} ${UPSERT_TAIL}`, vals);
    for (const r of rows) r.inserted ? inserted++ : updated++;
  }
  return { inserted, updated };
}

export const STAGES = ["new", "shipped", "at_office", "delivered", "returned", "canceled", "archived"] as const;
export type Stage = (typeof STAGES)[number];
