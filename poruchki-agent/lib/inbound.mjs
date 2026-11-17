// Inbound line: tools the agent calls during a call.
//   find_order   – "Къде ми е пратката?" – orders of this phone number in ConvertBuilder
//   submit_order – a new order taken by phone → saved and sent to Mitko in Telegram
// Prices and totals are computed here from agent/pricelist-bg.json, never by the AI.
import { randomBytes } from "node:crypto";
import { phoneOrderBody } from "./platform.mjs";
import { normalizePhoneBG, moneyBG } from "./format.mjs";
import { freeDeliveryFor } from "./upsell.mjs";

/** Price list as text for the inbound agent's prompt. */
export function renderPriceList(pl) {
  const lines = pl.products.map((p) => `- ${p.name}: ${moneyBG(p.price)}${p.gift ? ` (подарък: ${p.gift})` : ""} [код ${p.id}]`);
  const d = Object.values(pl.delivery).map((x) => `- Доставка ${x.label}: ${moneyBG(x.price)}`);
  return [...lines, "", ...d, "- Плащане: наложен платеж – на куриера при получаване, в брой или с карта."].join("\n");
}

/**
 * Total for an order. Unknown product codes or bad quantities are errors.
 * @param {any} pl price list
 * @param {{items: {product_id: string, quantity: number}[], delivery: string}} order
 */
export function quote(pl, order) {
  const errors = [];
  const lines = [];
  for (const it of order.items || []) {
    const p = pl.products.find((x) => x.id === it.product_id);
    const qty = Math.round(Number(it.quantity) || 0);
    if (!p) errors.push(`непознат продукт „${it.product_id}“`);
    else if (qty < 1 || qty > 10) errors.push(`невалиден брой за ${p.name}`);
    else lines.push({ ...p, qty, sum: Math.round(p.price * qty * 100) / 100 });
  }
  if (!lines.length && !errors.length) errors.push("няма избран продукт");
  const d = pl.delivery[order.delivery];
  if (!d) errors.push("не е избран начин на доставка (офис на Еконт, офис на Спиди или адрес със Спиди)");
  const subtotal = lines.reduce((s, l) => s + l.sum, 0);
  const free = Boolean(d) && freeDeliveryFor(lines, pl);
  const delivery = d && free ? { ...d, price: 0, label: `${d.label} (безплатна)` } : d;
  const total = Math.round((subtotal + (delivery?.price || 0)) * 100) / 100;
  return { errors, lines, delivery, freeDelivery: free, subtotal, total, totalText: moneyBG(total) };
}

const STATUS_BG = {
  pending: "приета е и още не е изпратена",
  shipped: "изпратена е",
  completed: "завършена е",
  canceled: "отказана е",
  archived: "архивирана е",
};

/**
 * Recent orders of a phone number, newest first, in words the agent can read out.
 * @param {{searchByPhone: (phone: string) => Promise<any[]>}} cb
 */
export async function findOrders(cb, rawPhone, mw = null) {
  const phone = normalizePhoneBG(rawPhone);
  if (!phone) return { found: 0, message: "Не мога да разпозная телефонния номер. Попитай клиента за номера, с който е поръчал." };
  const orders = await cb.searchByPhone(phone);
  if (!orders.length) return { found: 0, message: "Няма поръчка с този телефонен номер през последните 45 дни. Попитай дали е поръчал от друг номер." };
  const out = [];
  for (const o of orders.slice(0, 3)) {
    // Middleware knows the real courier status; ConvertBuilder only knows "pending/shipped".
    const m = mw?.enabled ? await mw.lookup(o.site, o.orderNo).catch(() => null) : null;
    out.push({
      order_number: String(o.orderNo),
      date: o.dateText,
      products: o.itemsText,
      total: moneyBG(o.total),
      status: m?.statusText || STATUS_BG[o.status] || o.status,
      courier: m?.carrier || o.courier || "",
      courier_status: m?.waybillStatus || "",
      tracking_number: o.trackingNo || "",
    });
  }
  return { found: orders.length, orders: out };
}

/**
 * Save an order taken by phone and tell Mitko. Returns what the agent should say.
 * @param {{store: any, notify: (t: string) => Promise<any>, priceList: any}} deps
 */
export async function submitOrder(deps, body, now = new Date()) {
  const { store, notify, priceList, platform } = deps;
  const q = quote(priceList, body);
  const name = String(body.customer_name || "").trim();
  const phone = normalizePhoneBG(body.phone) || normalizePhoneBG(body.caller_phone);
  const city = String(body.city || "").trim();
  const place = String(body.office_or_address || "").trim();
  if (name.split(/\s+/).length < 2) q.errors.push("трябват име и фамилия");
  if (!phone) q.errors.push("трябва валиден български телефонен номер");
  if (!city) q.errors.push("трябва град или село");
  if (!place) q.errors.push(body.delivery === "speedy_address" ? "трябва точен адрес" : "трябва кой офис на куриера");
  if (q.errors.length) return { ok: false, error: `Не мога да запиша поръчката: ${q.errors.join("; ")}. Попитай клиента и опитай пак.` };

  const ref = `Т${now.toISOString().slice(5, 10).replace("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const rec = {
    ref,
    at: now.toISOString(),
    name,
    phone,
    callerPhone: body.caller_phone || "",
    items: q.lines.map((l) => ({ id: l.id, name: l.name, cb: l.cb, qty: l.qty, sum: l.sum, gift: l.gift || "" })),
    delivery: { type: body.delivery, label: q.delivery.label, price: q.delivery.price, city, place },
    total: q.total,
    note: String(body.note || "").slice(0, 500),
    conversationId: body.conversation_id || "",
  };
  await store.setJSON(`phone-orders/${now.toISOString().slice(0, 10)}/${ref}`, rec);
  // Straight into the platform (as a confirmed order); Telegram still gets the message.
  let made = null;
  if (platform?.enabled) {
    try {
      made = await platform.createPhoneOrder(phoneOrderBody({ name, phone, delivery: rec.delivery, items: rec.items, note: rec.note, ref, officeId: body.office_id }));
    } catch (err) {
      console.error("platform phone order failed", err.message);
    }
  }

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    `📥 <b>Нова поръчка по телефона</b> · ${esc(ref)}`,
    `${esc(name)} · ${esc(phone)}`,
    ...rec.items.map((i) => `🛒 ${i.qty} × ${esc(i.cb || i.name)} – ${esc(moneyBG(i.sum))}${i.gift ? ` (+ подарък ${esc(i.gift)})` : ""}`),
    `🚚 ${esc(q.delivery.label)}: ${esc(city)}, ${esc(place)} – ${esc(moneyBG(q.delivery.price))}`,
    `💶 Общо с доставката: <b>${esc(q.totalText)}</b>, наложен платеж`,
    rec.note ? `📝 ${esc(rec.note)}` : "",
    "",
    made ? `Записана в платформата като № ${esc(made.order_no)}${made.waybill ? ", товарителницата е създадена" : " – избери офис и създай товарителницата"}.` : "Въведи я в платформата или в Middleware.",
  ].filter((l) => l !== "");
  await notify(lines.join("\n"));

  return {
    ok: true,
    reference: ref,
    total: q.totalText,
    message: `Поръчката е записана. Обща сума с доставката: ${q.totalText}, плаща се на куриера. Колега ще я обработи и ще бъде изпратена в най-скоро време.`,
  };
}
