// Correcting an order: products, quantities, prices, shipping and discount.
// ConvertBuilder's API cannot change amounts or products, so the correction lives here (orders.edit),
// the shop's own numbers stay in cb_*, and a re-sync never undoes it.
import { one, q } from "./db.mts";
import { HttpError } from "./http.mts";

const round2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const fail = (m: string) => new HttpError(400, "edit", m);
const euro = (x: number) => `${round2(x).toFixed(2).replace(".", ",")} €`;

/** `who` names someone who is not a user of the platform, e.g. "Агент". */
export async function addEvent(orderId: number, kind: string, text: string, info: Record<string, unknown> = {}, userId: number | null = null, who: string | null = null) {
  await q("INSERT INTO order_events (order_id, kind, text, info, user_id, who) VALUES ($1, $2, $3, $4, $5, $6)", [orderId, kind, text.slice(0, 1000), JSON.stringify(info), userId, who]);
}

export type Item = { name: string; qty: number; total: number; sku?: string };

export function cleanItems(input: unknown): Item[] {
  if (!Array.isArray(input) || !input.length) throw fail("Поръчката трябва да има поне един продукт.");
  if (input.length > 50) throw fail("Твърде много продукти.");
  return input.map((raw: any) => {
    const name = String(raw?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const qty = Math.trunc(Number(raw?.qty));
    const price = round2(Number(raw?.price));
    if (!name) throw fail("Всеки продукт трябва да има име.");
    if (!(qty >= 1 && qty <= 999)) throw fail(`Провери бройката на „${name}“.`);
    if (!(price >= 0 && price <= 100000)) throw fail(`Провери цената на „${name}“.`);
    const sku = String(raw?.sku ?? "").trim().slice(0, 60);
    return { name, qty, total: round2(qty * price), ...(sku ? { sku } : {}) };
  });
}

/** What changed, in words, for the history of the order. */
export function describe(before: { items: Item[]; shipping: number; discount: number; total: number }, after: { items: Item[]; shipping: number; discount: number; total: number }) {
  const parts: string[] = [];
  const key = (i: Item) => i.name.toLowerCase();
  const old = new Map(before.items.map((i) => [key(i), i]));
  const now = new Map(after.items.map((i) => [key(i), i]));
  for (const [k, i] of now) {
    const o = old.get(k);
    if (!o) parts.push(`добавен „${i.name}“ (${i.qty} × ${euro(i.total / i.qty)})`);
    else if (o.qty !== i.qty || round2(o.total) !== round2(i.total)) parts.push(`„${i.name}“: ${o.qty} бр. за ${euro(o.total)} → ${i.qty} бр. за ${euro(i.total)}`);
  }
  for (const [k, o] of old) if (!now.has(k)) parts.push(`премахнат „${o.name}“`);
  if (round2(before.shipping) !== round2(after.shipping)) parts.push(`доставка ${euro(before.shipping)} → ${euro(after.shipping)}`);
  if (round2(before.discount) !== round2(after.discount)) parts.push(`отстъпка ${euro(before.discount)} → ${euro(after.discount)}`);
  if (round2(before.total) !== round2(after.total)) parts.push(`общо ${euro(before.total)} → ${euro(after.total)}`);
  return parts;
}

async function load(id: number) {
  const o = await one<any>("SELECT id, items, sub_total, shipping, discount, total, fx, cb_total, tracking_no, tracking_source, waybill, edit FROM orders WHERE id = $1", [id]);
  if (!o) throw new HttpError(404, "not_found", "Няма такава поръчка.");
  for (const k of ["sub_total", "shipping", "discount", "total", "fx", "cb_total"]) o[k] = Number(o[k]);
  return o;
}

function waybillWarning(o: any, total: number) {
  if (o.tracking_source === "own" && o.waybill?.number === o.tracking_no && round2(o.waybill?.cod) !== round2(total)) {
    return `Товарителница № ${o.tracking_no} е с наложен платеж ${euro(o.waybill.cod)}. Анулирай я и създай нова, за да е с новата сума.`;
  }
  return null;
}

export async function editOrder(id: number, input: any, userId: number | null, who: string | null = null) {
  const o = await load(id);
  const items = cleanItems(input?.items);
  const shipping = round2(Number(input?.shipping));
  const discount = round2(Number(input?.discount ?? 0));
  if (!(shipping >= 0 && shipping <= 1000)) throw fail("Провери цената за доставка.");
  const subTotal = round2(items.reduce((a, i) => a + i.total, 0));
  if (!(discount >= 0 && discount <= subTotal + shipping)) throw fail("Отстъпката е по-голяма от сумата.");
  const total = round2(subTotal + shipping - discount);
  const changes = describe({ items: o.items || [], shipping: o.shipping, discount: o.discount, total: o.total }, { items, shipping, discount, total });
  if (!changes.length) return { changed: false, total, warning: null, changes };
  await q(
    `UPDATE orders SET items = $2, sub_total = $3, shipping = $4, discount = $5, total = $6, total_eur = round($6 / fx, 2),
            edit = jsonb_build_object('at', now(), 'by', $7::bigint, 'cbTotal', cb_total)
      WHERE id = $1`,
    [id, JSON.stringify(items), subTotal, shipping, discount, total, userId],
  );
  await addEvent(id, "edit", `Поръчката е коригирана: ${changes.join("; ")}`, { before: { items: o.items, shipping: o.shipping, discount: o.discount, total: o.total } }, userId, who);
  return { changed: true, total, warning: waybillWarning(o, total), changes };
}

/** Back to the shop's own products and amounts. */
export async function resetOrder(id: number, userId: number | null) {
  const o = await load(id);
  if (!o.edit) return { changed: false };
  const r = await one<any>(
    `UPDATE orders SET items = cb_items, sub_total = cb_sub_total, shipping = cb_shipping, discount = cb_discount, total = cb_total,
            total_eur = round(cb_total / fx, 2), edit = NULL
      WHERE id = $1 RETURNING total`,
    [id],
  );
  await addEvent(id, "edit_reset", `Върнати са сумите от магазина: общо ${euro(o.total)} → ${euro(Number(r.total))}`, {}, userId);
  return { changed: true, total: Number(r.total), warning: waybillWarning(o, Number(r.total)) };
}
