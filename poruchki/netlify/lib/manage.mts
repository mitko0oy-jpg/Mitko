// Everyday order handling: confirm, comment, correct the customer's details, make an order by hand
// (or from a phone call), duplicate, archive.
import { normalize } from "./cb.mts";
import { sofiaDay } from "./dates.mts";
import { one, q } from "./db.mts";
import { addEvent, cleanItems } from "./edit.mts";
import { getRates, rateFor } from "./fx.mts";
import { HttpError } from "./http.mts";

const fail = (m: string) => new HttpError(400, "order", m);
const round2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const s = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const COURIER_NAME: Record<string, string> = { speedy: "Спиди", econt: "Еконт" };

export async function addNote(id: number, text: string, userId: number | null, who: string | null = null) {
  const t = s(text, 1000);
  if (!t) throw fail("Празна бележка.");
  const r = await q("UPDATE orders SET note = $2 WHERE id = $1 RETURNING id", [id, t]);
  if (!r.length) throw new HttpError(404, "not_found", "Няма такава поръчка.");
  await addEvent(id, "note", t, {}, userId, who);
}

export async function confirmOrder(id: number, by: string, userId: number | null, who: string | null = null) {
  const r = await one<any>("UPDATE orders SET confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, $2) WHERE id = $1 RETURNING confirmed_at", [id, by]);
  if (!r) throw new HttpError(404, "not_found", "Няма такава поръчка.");
  await addEvent(id, "confirm", `Поръчката е потвърдена (${by})`, {}, userId, who);
}

export async function unconfirmOrder(id: number, userId: number | null) {
  await q("UPDATE orders SET confirmed_at = NULL, confirmed_by = NULL WHERE id = $1", [id]);
  await addEvent(id, "confirm", "Потвърждението е махнато", {}, userId);
}

export async function archiveOrder(id: number, archived: boolean, userId: number | null) {
  await q(`UPDATE orders SET archived_at = ${archived ? "now()" : "NULL"} WHERE id = $1`, [id]);
  await addEvent(id, "archive", archived ? "Поръчката е архивирана" : "Поръчката е върната от архива", {}, userId);
}

export type Contact = { name: string; phone: string; email: string; city: string; zip: string; address: string; delivery: { type: string; courier: string; officeId?: string; officeName?: string } };

export function cleanContact(input: any, current?: Partial<Contact>): Contact {
  const d = input?.delivery || {};
  const courier = d.courier === "econt" || d.courier === "speedy" ? d.courier : current?.delivery?.courier || "";
  const type = ["office", "automat", "address"].includes(d.type) ? d.type : current?.delivery?.type || "address";
  const out: Contact = {
    name: s(input?.name ?? current?.name, 200),
    phone: s(input?.phone ?? current?.phone, 40),
    email: s(input?.email ?? current?.email, 200),
    city: s(input?.city ?? current?.city, 120),
    zip: s(input?.zip ?? current?.zip, 20),
    address: s(input?.address ?? current?.address, 400),
    delivery: { type, courier, ...(type !== "address" ? { officeId: s(d.officeId ?? current?.delivery?.officeId, 12), officeName: s(d.officeName ?? current?.delivery?.officeName, 120) } : {}) },
  };
  if (!out.name) throw fail("Липсва името на клиента.");
  if (out.phone.replace(/\D/g, "").length < 9) throw fail("Провери телефона.");
  if (type !== "address" && !/^\d{1,8}$/.test(out.delivery.officeId || "")) throw fail("Избери офис или автомат.");
  if (type === "address" && (!out.city || out.address.length < 3)) throw fail("За доставка до адрес попълни град и адрес.");
  return out;
}

const shippingName = (c: Contact) => `${c.delivery.type === "address" ? "До адрес" : c.delivery.type === "automat" ? "До автомат" : "До офис"}${c.delivery.courier ? ` ${COURIER_NAME[c.delivery.courier] || c.delivery.courier}` : ""}`;

/** Name, phone and delivery corrected here; the shop sync keeps them from now on. */
export async function editContact(id: number, input: any, userId: number | null, who: string | null = null) {
  const o = await one<any>("SELECT customer_name, phone, email, city, zip, address, delivery FROM orders WHERE id = $1", [id]);
  if (!o) throw new HttpError(404, "not_found", "Няма такава поръчка.");
  const c = cleanContact(input, { name: o.customer_name, phone: o.phone, email: o.email, city: o.city, zip: o.zip, address: o.address, delivery: o.delivery });
  const changes: string[] = [];
  if (c.name !== o.customer_name) changes.push(`име: ${c.name}`);
  if (c.phone !== o.phone) changes.push(`телефон: ${c.phone}`);
  const before = o.delivery || {};
  if (c.delivery.courier !== before.courier || c.delivery.type !== before.type || (c.delivery.officeId || "") !== (before.officeId || "")) {
    changes.push(`доставка: ${shippingName(c)}${c.delivery.officeId ? ` № ${c.delivery.officeId}${c.delivery.officeName ? ` ${c.delivery.officeName}` : ""}` : ""}`);
  }
  if (c.city !== o.city || c.address !== o.address || c.zip !== o.zip) changes.push(`адрес: ${[c.zip, c.city, c.address].filter(Boolean).join(", ")}`);
  if (!changes.length) return { changed: false };
  await q(
    `UPDATE orders SET customer_name = $2, phone = $3, email = $4, city = $5, zip = $6, address = $7, address2 = '', delivery = $8,
            contact_edit = jsonb_build_object('at', now(), 'by', $9::bigint)
      WHERE id = $1`,
    [id, c.name, c.phone, c.email, c.city, c.zip, c.address, JSON.stringify(c.delivery), userId],
  );
  await addEvent(id, "contact", `Променени данни: ${changes.join("; ")}`, {}, userId, who);
  return { changed: true };
}

/** A new order made here (by hand, duplicated, or taken over the phone). */
export async function createOrder(input: any, opts: { source: "manual" | "phone"; userId: number | null; who: string | null; by: string }) {
  const shop = await one<any>("SELECT id, currency FROM shops WHERE id = $1", [s(input?.shop, 20)]);
  if (!shop) throw fail("Избери магазин.");
  const c = cleanContact(input);
  const items = cleanItems(input?.items);
  const shipping = round2(Number(input?.shipping ?? 0));
  const discount = round2(Number(input?.discount ?? 0));
  if (!(shipping >= 0 && shipping <= 1000)) throw fail("Провери цената за доставка.");
  const subTotal = round2(items.reduce((a, i) => a + i.total, 0));
  const total = round2(subTotal + shipping - discount);
  if (total < 0) throw fail("Отстъпката е по-голяма от сумата.");
  const fx = rateFor(shop.currency, await getRates());
  const seq = await one<any>("SELECT nextval('manual_order_seq')::int AS n");
  const no = `T${seq.n}`;
  const now = new Date();
  const confirmed = input?.confirmed !== false;
  const row = await one<any>(
    `INSERT INTO orders (shop, cb_id, order_no, ordered_at, day, cb_status, customer_name, phone, email, country, city, zip, address, address2,
                         shipping_name, delivery, items, currency, sub_total, shipping, discount, total, fx, total_eur, paid, payment_method,
                         cb_shipped, raw, cb_items, cb_sub_total, cb_shipping, cb_discount, cb_total, source, confirmed_at, confirmed_by, note)
     VALUES ($1, -$2::bigint, $3, $4, $5, 'pending', $6, $7, $8, 'BG', $9, $10, $11, '', $12, $13, $14, $15, $16, $17, $18, $19, $20, round($19::numeric / $20::numeric, 2),
             false, 'cod', false, '{}'::jsonb, $14, $16, $17, $18, $19, $21, $22, $23, $24)
     RETURNING id`,
    [
      shop.id, seq.n, no, now.toISOString(), sofiaDay(now), c.name, c.phone, c.email, c.city, c.zip, c.address, shippingName(c), JSON.stringify(c.delivery),
      JSON.stringify(items), shop.currency, subTotal, shipping, discount, total, fx, opts.source, confirmed ? now.toISOString() : null, confirmed ? opts.by : null,
      s(input?.note, 1000) || null,
    ],
  );
  const id = Number(row.id);
  await addEvent(id, "create", `Поръчката е създадена ${opts.source === "phone" ? "по телефона" : "ръчно"} (${opts.by})`, {}, opts.userId, opts.who);
  if (s(input?.note, 1000)) await addEvent(id, "note", s(input.note, 1000), {}, opts.userId, opts.who);
  return { id, order_no: no, total };
}

/** Same customer, delivery and products, as a new order. */
export async function duplicateOrder(id: number, userId: number | null, by: string) {
  const o = await one<any>("SELECT * FROM orders WHERE id = $1", [id]);
  if (!o) throw new HttpError(404, "not_found", "Няма такава поръчка.");
  const items = (o.items || []).map((i: any) => ({ name: i.name, qty: i.qty, price: round2(Number(i.total) / (Number(i.qty) || 1)), sku: i.sku }));
  const delivery = o.delivery?.type ? o.delivery : normalize(o.raw || {}).delivery;
  const r = await createOrder(
    { shop: o.shop, name: o.customer_name, phone: o.phone, email: o.email, city: o.city, zip: o.zip, address: [o.address, o.address2].filter((x: string) => x && !/^\s*До офис/i.test(x)).join(", ") || o.city, delivery, items, shipping: Number(o.shipping), discount: Number(o.discount), confirmed: false },
    { source: "manual", userId, who: null, by },
  );
  await addEvent(r.id, "create", `Копие на поръчка № ${o.order_no}`, {}, userId);
  return r;
}
