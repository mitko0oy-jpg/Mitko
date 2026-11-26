// The one extra offer during a call: herbal plasters (see "upsell" in agent/pricelist-bg.json).
// All totals are computed here so the AI never does arithmetic.
import priceList from "../agent/pricelist-bg.json" with { type: "json" };

const round = (x) => Math.round(x * 100) / 100;
const isMiddle = (name) => /2\s*\+\s*1/.test(String(name || ""));
// Any patches already in the order – paid or a gift, herbal, bee-venom or „12 пластира за стави и мускули“:
// then the agent offers none (offering what the customer has just ordered sounds odd).
const isPlasters = (name) => /пластир|лепенк|patch|plaster/iu.test(String(name || ""));

/**
 * What to offer for an existing order.
 * @param {{items: {name: string, qty: number, price: number}[], total: number, shipping: number}} order
 * @returns {{kind: "none"|"one_box"|"two_boxes_free", box: number, totalBase: number, totalOne: number, totalTwo: number|null, shipping: number}}
 */
export function upsellFor(order, pl = priceList) {
  const u = pl.upsell;
  const items = order.items || [];
  const total = Number(order.total) || 0;
  const shipping = Number(order.shipping) || 0;
  const base = { box: u.price, totalBase: round(total), totalOne: round(total + u.price), totalTwo: null, shipping };
  if (!u || items.some((i) => isPlasters(i.name))) return { ...base, kind: "none" };
  if (items.some((i) => isMiddle(i.name) && Number(i.price) > 0) && shipping > 0) {
    return { ...base, kind: "two_boxes_free", totalTwo: round(total + u.free_delivery_boxes * u.price - shipping) };
  }
  return { ...base, kind: "one_box" };
}

/** True when a phone order earns free delivery: a middle package plus enough plaster boxes. */
export function freeDeliveryFor(lines, pl = priceList) {
  const u = pl.upsell;
  if (!u) return false;
  const hasMiddle = lines.some((l) => u.middle_packages.includes(l.id));
  const boxes = lines.filter((l) => l.id === u.product_id).reduce((s, l) => s + l.qty, 0);
  return hasMiddle && boxes >= u.free_delivery_boxes;
}
