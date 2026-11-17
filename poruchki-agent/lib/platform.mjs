// The order platform "Поръчки" (mitko-poruchki.netlify.app): where orders live now.
// The agent takes the orders to call from it, reports every call, and writes orders taken by phone.
// Env: PLATFORM_URL (https://mitko-poruchki.netlify.app), PLATFORM_TOKEN (= AGENT_TOKEN of the platform).
import priceList from "../agent/pricelist-bg.json" with { type: "json" };
import { normalizePhoneBG, itemsTextBG } from "./format.mjs";

const round = (x) => Math.round(Number(x) * 100) / 100;

export function platform({ env, fetchImpl = fetch }) {
  const base = String(env("PLATFORM_URL") || "").replace(/\/$/, "");
  const token = env("PLATFORM_TOKEN") || "";
  const enabled = Boolean(base && token);

  async function call(path, body) {
    const res = await fetchImpl(`${base}/api/agent/${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Платформа ${path.split("?")[0]}: ${data?.message || `HTTP ${res.status}`}`);
    return data;
  }

  return {
    enabled,
    /** Orders to call: new ones of `sites`, and any order sent for "AI потвърждение". */
    async fetchNewOrders({ since, sites }) {
      const d = await call(`orders?shops=${encodeURIComponent(sites.join(","))}&since=${encodeURIComponent(since)}`);
      return (d.orders || []).map((o) => ({ ...o, apiId: o.id, platformId: o.id, requestedAt: o.requestedAt || null }));
    },
    /** False once the order is confirmed, has a waybill or is no longer new. */
    async isStillPending(rec) {
      if (!rec.platformId) return true;
      const o = await call(`orders/${rec.platformId}`);
      return Boolean(o.stillToCall);
    },
    async searchByPhone(phone, days = 45) {
      const d = await call(`by-phone?phone=${encodeURIComponent(phone)}&days=${days}`);
      return (d.orders || []).map((o) => ({
        site: o.site,
        orderNo: o.orderNo,
        created: Math.floor(new Date(o.createdAt).getTime() / 1000),
        dateText: new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "long" }).format(new Date(o.createdAt)),
        itemsText: itemsTextBG(o.items),
        total: o.total,
        status: o.stage,
        statusText: o.parcelText || "",
        courier: o.courier || "",
        trackingNo: o.trackingNo || "",
      }));
    },
    calling: (rec) => (rec.platformId ? call(`orders/${rec.platformId}/calling`, { attempt: rec.attempts }) : null),
    /** One call's result; the platform writes the comment, confirms, corrects and makes the waybill. */
    report: (rec, body) => (rec.platformId ? call(`orders/${rec.platformId}/result`, body) : null),
    createPhoneOrder: (body) => call("orders", body),
    /** Offices of a town, best matches for the words first. */
    async offices(courier, city, query = "") {
      const d = await call(`offices?courier=${encodeURIComponent(courier)}&city=${encodeURIComponent(city)}&q=${encodeURIComponent(query)}`);
      return d.offices || [];
    },
  };
}

/** The extra box(es) of herbal plasters as a correction of the order (prices from the price list, never from the AI). */
export function upsellEdit(rec, upsell, pl = priceList) {
  const u = pl.upsell;
  const n = upsell === "one_box" ? 1 : upsell === "two_boxes" ? 2 : 0;
  if (!u || !n || !rec.items?.length) return null;
  const product = pl.products?.find((p) => p.id === u.product_id);
  const items = rec.items.map((i) => ({ name: i.name, qty: i.qty || 1, price: round((Number(i.price) || 0) / (i.qty || 1)) }));
  items.push({ name: product?.cb || product?.name || u.name, qty: n, price: u.price });
  const freeDelivery = n === 2 && rec.upsell?.kind === "two_boxes_free";
  return { items, shipping: freeDelivery ? 0 : Number(rec.shipping ?? rec.upsell?.shipping ?? 0) };
}

/** What the platform needs to know about one call. */
export function reportBody(rec, next, call, outcome) {
  const confirmed = outcome === "confirmed";
  return {
    outcome,
    attempt: next.attempts || rec.attempts || 1,
    final: next.state === "gave_up",
    next_at: next.state === "queued" ? next.nextAttemptAt : undefined,
    summary: call?.summary || "",
    cancel_reason: call?.cancelReason || "",
    delivery_change: call?.deliveryChange || "",
    order_change: call?.orderChange || "",
    callback_when: call?.callbackWhen || "",
    questions: call?.questions || "",
    upsell: call?.upsell || "",
    edit: confirmed ? upsellEdit(rec, call?.upsell) : null,
  };
}

/** An order taken by phone, in the platform's words. */
export function phoneOrderBody({ name, phone, delivery, items, note, ref, officeId }) {
  const courier = String(delivery.type || "").startsWith("econt") ? "econt" : "speedy";
  const type = String(delivery.type || "").endsWith("address") ? "address" : "office";
  return {
    shop: "bg",
    name,
    phone: normalizePhoneBG(phone) || phone,
    city: delivery.city,
    address: type === "address" ? delivery.place : "",
    delivery: { courier, type, ...(type === "office" ? { officeName: `${delivery.city}, ${delivery.place}`, ...(/^\d{1,8}$/.test(String(officeId || "")) ? { officeId: String(officeId) } : {}) } : {}) },
    items: items.map((i) => ({ name: i.cb || i.name, qty: i.qty, price: round(i.sum / (i.qty || 1)) })),
    shipping: delivery.price,
    note: [`Поръчка по телефона (${ref})`, note].filter(Boolean).join(". "),
  };
}
