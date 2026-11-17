// ConvertBuilder shop API (docs: https://websitebuilder.app-sources.com).
// Base: https://<shop domain>/api/site, header "Authorization: Bearer <key>".
// The key is per shop: Website Settings → Applications → API Key.
// CB_SITES env: JSON [{ "id": "bg", "label": "BeeVenom BG", "domain": "beevenombg.eu", "key": "…" }]
import { q } from "./db.mts";
import { env } from "./http.mts";
import { unseal } from "./secret.mts";

export type Site = { id: string; label: string; domain: string; key: string };

export function cbSites(): Site[] {
  let list: any[] = [];
  try {
    list = JSON.parse(env("CB_SITES") || "[]");
  } catch {
    console.error("CB_SITES is not valid JSON");
  }
  return (Array.isArray(list) ? list : [])
    .filter((s) => s && /^[a-z0-9_-]{1,20}$/i.test(s.id) && typeof s.domain === "string" && typeof s.key === "string")
    .map((s) => ({ id: String(s.id), label: String(s.label || s.id), domain: String(s.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, ""), key: String(s.key) }));
}

export const cbSite = (id: string) => cbSites().find((s) => s.id === id) || null;

/** Every shop with an API key: the ones in CB_SITES (company 1) and the ones added in the app (key kept encrypted). */
export async function allSites(): Promise<(Site & { company: number })[]> {
  const fromEnv = cbSites().map((s) => ({ ...s, company: 1 }));
  const rows = await q<any>("SELECT id, label, domain, api_key_sealed, company_id FROM shops WHERE api_key_sealed IS NOT NULL");
  const known = new Set(fromEnv.map((s) => s.id));
  const fromApp = rows.flatMap((r) => {
    if (known.has(r.id)) return [];
    try {
      return [{ id: String(r.id), label: String(r.label), domain: String(r.domain), key: unseal<string>(r.api_key_sealed), company: Number(r.company_id) }];
    } catch {
      return [];
    }
  });
  return [...fromEnv, ...fromApp];
}

export const siteFor = async (id: string) => (await allSites()).find((s) => s.id === id) || null;

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Tests swap the network for a fake. */
export function setCbFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}

export class CbError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function cb(site: Site, path: string, opts: { method?: string; query?: Record<string, string | number>; body?: unknown; timeoutMs?: number } = {}) {
  const qs = opts.query ? `?${new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)]))}` : "";
  // Only the local test server runs without https.
  const scheme = /^(localhost|127\.0\.0\.1):\d+$/.test(site.domain) ? "http" : "https";
  const res = await fetchImpl(`${scheme}://${site.domain}/api/site${path}${qs}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${site.key}`,
      "User-Agent": "MitkoPoruchki/1.0",
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs || 15000),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || text.slice(0, 120) || res.statusText;
    throw new CbError(res.status, `${site.label}: ${res.status === 401 || res.status === 403 ? "ключът за API не е приет" : `грешка ${res.status}`} (${msg})`);
  }
  return data;
}

export const PAGE = 50;

/** One page of orders created between min and max (Unix seconds, inclusive). */
export async function listOrders(site: Site, min: number, max: number, skip = 0): Promise<{ items: any[]; totalCount: number }> {
  const d = await cb(site, "/orders", { query: { created_at_min: min, created_at_max: max, limit: PAGE, skip } });
  return { items: Array.isArray(d?.items) ? d.items : [], totalCount: Number(d?.totalCount) || 0 };
}

export async function getOrder(site: Site, id: number | string) {
  const d = await cb(site, `/orders/${encodeURIComponent(String(id))}`);
  return d?.item && d.item.id ? d.item : d;
}

export const listWebhooks = (site: Site) => cb(site, "/webhooks");
export const createWebhook = (site: Site, target: string, secret: string) =>
  cb(site, "/webhooks", { method: "POST", body: { target, secret, events: ["order_created", "order_updated"] } });
export const deleteWebhook = (site: Site, id: string) => cb(site, `/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });

// ---------- turning a ConvertBuilder order into our row ----------

const s = (v: unknown, max = 300) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, max));
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
};

export type Delivery = { type: "office" | "automat" | "address" | "unknown"; courier: string; officeId?: string; officeName?: string };

/** "speedy", "econt", "boxnow", "gls" or "" – from any free text the shop or Middleware wrote. */
export function courierOf(text: unknown): string {
  const t = String(text || "").toLowerCase();
  if (/спиди|speedy/.test(t)) return "speedy";
  if (/еконт|econt/.test(t)) return "econt";
  if (/box ?now|бокс ?нау/.test(t)) return "boxnow";
  if (/\bgls\b/.test(t)) return "gls";
  if (/sameday|сеймдей/.test(t)) return "sameday";
  return "";
}

const STREET = /\s(?:жк|ж\.к\.|ул\.|бул\.|пл\.|кв\.|бл\.|No|№)(?=[\s\d.]|$)/i;

function titleCase(text: string) {
  return text
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * ConvertBuilder writes the chosen office into the address line:
 *   "До офис speedy[141]: БОТЕВГРАД - СКЛАД жк Васил Левски ул. …"
 *   "До офис econt[6308]: Хасково -  Хасково Източна индустриална зона бул. …"
 */
export function parseOffice(address: unknown): Delivery | null {
  const m = /^\s*До офис (econt|speedy)\[(\d+)\]:\s*(.+)$/i.exec(String(address || ""));
  if (!m) return null;
  const rest = m[3].replace(/\s+/g, " ").trim();
  const dash = rest.indexOf(" - ");
  let left = dash >= 0 ? rest.slice(0, dash) : rest;
  const right = dash >= 0 ? rest.slice(dash + 3) : "";
  if (!right) left = left.split(STREET)[0];
  let place = right.split(STREET)[0].trim();
  if (place.toLowerCase().startsWith(left.toLowerCase())) place = place.slice(left.length).trim();
  if (place && left.toLowerCase().includes(place.toLowerCase())) place = "";
  const automat = /автомат/i.test(rest);
  place = place.replace(/\(?автомат\)?/i, "").trim();
  return {
    type: automat ? "automat" : "office",
    courier: m[1].toLowerCase(),
    officeId: m[2],
    officeName: [titleCase(left.trim()), titleCase(place)].filter(Boolean).join(" – "),
  };
}

export function parseDelivery(o: any): Delivery {
  const ship = o.shippingAddress || o.billingAddress || {};
  const office = parseOffice(ship.address) || parseOffice(ship.address2);
  if (office) return office;
  const name = String(o.shippingName || "");
  const courier = courierOf(name);
  const type = /адрес|address/i.test(name) ? "address" : /автомат|локер|locker|box/i.test(name) ? "automat" : /офис|office/i.test(name) ? "office" : "unknown";
  return { type, courier };
}

export type Normalized = {
  cb_id: number;
  order_no: string;
  ordered_at: Date;
  cb_status: string;
  customer_name: string;
  phone: string;
  email: string;
  country: string;
  city: string;
  zip: string;
  address: string;
  address2: string;
  shipping_name: string;
  delivery: Delivery;
  items: { name: string; qty: number; total: number; sku?: string }[];
  sub_total: number;
  shipping: number;
  discount: number;
  total: number;
  paid: boolean;
  payment_method: string;
  courier: string | null;
  tracking_no: string | null;
  tracking_url: string | null;
  cb_shipped: boolean;
};

export function normalize(o: any): Normalized {
  const ship = o.shippingAddress || {};
  const bill = o.billingAddress || {};
  const f = o.fulfillment && typeof o.fulfillment === "object" ? o.fulfillment : {};
  const trackingNo = s(f.trackingNo || f.tracking_no || f.trackingNumber, 60) || null;
  const delivery = parseDelivery(o);
  const courierText = s(f.courier || f.carrier, 60);
  const created = Number(o.created);
  return {
    cb_id: Number(o.id),
    order_no: s(o.invoiceNo ?? o.id, 40),
    ordered_at: new Date((Number.isFinite(created) && created > 0 ? created : Date.now() / 1000) * 1000),
    cb_status: s(o.status || "pending", 20).toLowerCase(),
    customer_name: s(o.customerName || ship.name || bill.name, 200),
    phone: s(ship.phone || bill.phone, 40),
    email: s(o.customerEmail, 200),
    country: s(ship.country || bill.country, 40),
    city: s(ship.city || bill.city, 120),
    zip: s(ship.zipCode || bill.zipCode, 20),
    address: s(ship.address || bill.address, 400),
    address2: s(ship.address2 || bill.address2, 400),
    shipping_name: s(o.shippingName, 200),
    delivery,
    items: (Array.isArray(o.items) ? o.items : []).map((it: any) => ({
      name: s(it.name, 200),
      qty: Number(it.quantity) || 1,
      total: n(it.total),
      ...(it.sku ? { sku: s(it.sku, 60) } : {}),
    })),
    sub_total: n(o.subTotal),
    shipping: n(o.shippingAmount),
    discount: n(o.discountAmount),
    total: n(o.total),
    paid: o.paid === true,
    payment_method: s(o.paymentMethod, 60),
    courier: trackingNo ? courierOf(courierText) || courierText.toLowerCase() || delivery.courier || null : null,
    tracking_no: trackingNo,
    tracking_url: s(f.trackingUrl || f.tracking_url, 400) || null,
    cb_shipped: Boolean(trackingNo || courierText || o.shipped === true || o.shippedAt || o.fulfilled === true),
  };
}
