// One-time import of the orders that exist only in Middleware (api.middleware.bg): orders made by hand
// there, phone orders, abandoned carts and shop orders that ConvertBuilder no longer gives us.
// Read-only towards Middleware. Each call reads one page (100 orders, oldest first) and adds what is
// missing; running it again adds nothing twice (same shop + cb_id).
// Env: MW_TOKEN (secret, without "Bearer"). The tenant id and the store → shop map come with the request.
import { one, q } from "./db.mts";
import { addEvent } from "./edit.mts";
import { courierOf, parseOffice } from "./cb.mts";
import { sofiaDay } from "./dates.mts";
import { getRates, rateFor } from "./fx.mts";
import { companyId } from "./tenant.mts";
import { env } from "./http.mts";

const BASE = "https://api.middleware.bg/v1";
const INCLUDE = "store,addresses,items,items.product,meta,totals,statusHistory,fulfillment,fulfillment.shipping";
export const MW_PER_PAGE = 100;
/** Orders made in Middleware itself have no shop id: cb_id = -(MW_BASE + Middleware's number). */
export const MW_BASE = 2_000_000_000;

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setMwImportFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}

const STATUS_BG: Record<string, string> = {
  pending: "Чакаща",
  shipped: "Изпратена",
  redirected: "Пренасочена",
  completed: "Завършена",
  returned: "Върната",
  cancelled: "Отказана",
  abounded: "Изоставена",
  abandoned: "Изоставена",
};

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cents = (v: unknown) => Math.round(Number(v) || 0) / 100;
const round2 = (x: number) => Math.round(x * 100) / 100;

function mwCourier(text: unknown): string {
  const t = String(text || "").toLowerCase();
  if (/dpd|speedy|спиди/.test(t)) return "speedy";
  return courierOf(t);
}

const titleCase = (t: string) =>
  t
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ");

/** "Плевен - ПЛЕВЕН - ХАДЖИ ДИМИТЪР (УЛ.) - ул. …" → "Плевен – Хаджи Димитър (ул.)" (city, then the office). */
function mwOfficeName(line: string): string {
  const rest = line.replace(/^[^:]*:\s*/, "").replace(/\s+/g, " ").trim();
  const parts = rest.split(" - ").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  const city = parts[0];
  const name = (parts[1].toLowerCase() === city.toLowerCase() ? parts[2] : parts[1]) || "";
  const clean = name.replace(/\(?автомат\)?/i, "").trim();
  return [titleCase(city), titleCase(clean)].filter(Boolean).join(" – ");
}

/** Middleware writes the office like ConvertBuilder, but Speedy is "dpd" and a locker is "До автомат". */
function mwDelivery(ad: any, carrier: string) {
  const line = String(ad?.address1 || "")
    .replace(/^\s*До (?:офис|автомат) (?:dpd|speedy)\[/i, "До офис speedy[")
    .replace(/^\s*До автомат econt\[/i, "До офис econt[");
  const office = parseOffice(line);
  const courier = mwCourier(ad?.courier) || carrier;
  if (office) return { ...office, courier: office.courier || courier, officeName: mwOfficeName(line) || office.officeName, ...(ad?.for === "locker" ? { type: "automat" } : {}) };
  const kind = String(ad?.for || "");
  const type = kind === "locker" ? "automat" : kind === "office" ? "office" : kind === "address" ? "address" : "unknown";
  return { type, courier, ...(ad?.for_id && type !== "address" ? { officeId: String(ad.for_id) } : {}) };
}

function shippingName(d: { type: string; courier: string }) {
  const where = d.type === "address" ? "До адрес" : d.type === "automat" ? "До автомат" : "До офис";
  const c = d.courier === "speedy" ? " Спиди" : d.courier === "econt" ? " Еконт" : "";
  return `${where}${c}`;
}

/** When Middleware last put the order in this status (its history), else its last change. */
function statusAt(o: any, key: string): string {
  const h = (Array.isArray(o?.status_history) ? o.status_history : []).filter((x: any) => x?.key === key && x?.changed_at);
  const at = h.length ? h[h.length - 1].changed_at : o?.updated_at || o?.ordered_at;
  return new Date(Date.parse(at) || Date.now()).toISOString();
}

export type MwRow = ReturnType<typeof fromMw>;

/** One Middleware order as an OrderDesk row (pure – no database). */
export function fromMw(o: any, shop: string, now = Date.now()) {
  const sn = Number(o?.sn) || 0;
  const ext = Number(o?.external_id) || 0;
  const label = str(o?.label, 40);
  const fromShop = ext > 0 && label && label !== "0";
  const status = String(o?.status_key || "").toLowerCase();
  const ad = (Array.isArray(o?.addresses) ? o.addresses : []).find((a: any) => a?.type === "shipping") || o?.addresses?.[0] || {};
  const f = o?.fulfillment || {};
  const carrier = mwCourier(f.carrier || f.shipping?.name);
  const delivery = mwDelivery(ad, carrier);
  const totals: Record<string, number> = {};
  for (const t of Array.isArray(o?.totals) ? o.totals : []) totals[String(t.key)] = cents(t.value);
  const items = (Array.isArray(o?.items) ? o.items : []).map((it: any) => {
    const qty = Number(it?.quantity) || 1;
    return {
      name: str(it?.name || it?.product?.name, 200),
      qty,
      total: round2(cents(it?.price) * qty),
      ...(it?.sku ? { sku: str(it.sku, 60) } : {}),
      ...(it?.is_virtual || it?.product?.is_virtual ? { digital: true } : {}),
    };
  });
  const subTotal = totals.subtotal ?? round2(items.reduce((a: number, i: any) => a + i.total, 0));
  const shipping = totals.shipping ?? 0;
  const total = totals.total ?? round2(subTotal + shipping);
  const discount = Math.max(0, round2(subTotal + shipping - total));
  const trackingNo = str(o?.tracking_number || f.waybill_number, 60) || null;
  const orderedAt = new Date(Date.parse(o?.ordered_at || o?.created_at) || now).toISOString();
  const abandoned = status === "abounded" || status === "abandoned";
  const final = ["completed", "returned", "cancelled"].includes(status);
  const finalAt = final ? statusAt(o, status) : null;
  const sentAt = trackingNo ? new Date(Date.parse(String(o?.meta?.local_shipping || "").replace(" ", "T") + "Z") || Date.parse(orderedAt)).toISOString() : null;
  const old = now - Date.parse(orderedAt) > 3 * 86400000;
  // Kept out of „Активни“ what Middleware itself has put away: old carts, and archived orders that would
  // otherwise look new or on the way for ever (no waybill to follow).
  const archive = (abandoned && (o?.is_archived || old)) || (o?.is_archived && (status === "pending" || ((status === "shipped" || status === "redirected") && !trackingNo)));
  return {
    shop,
    cb_id: fromShop ? ext : -(MW_BASE + sn),
    order_no: fromShop ? label : `MW${sn}`,
    from_shop: Boolean(fromShop),
    mw_sn: sn,
    ordered_at: orderedAt,
    cb_status: abandoned ? "abandoned" : "pending",
    mw_status: abandoned ? null : status || null,
    customer_name: str(ad?.name || o?.customer?.name || o?.name, 200),
    phone: str(ad?.phone || o?.customer?.phone, 40),
    email: str(ad?.email || o?.customer?.email, 200),
    country: str(ad?.country_iso2 || "BG", 40),
    city: str(ad?.city, 120),
    zip: str(ad?.postal_code, 20),
    address: str(ad?.address1 || [ad?.street, ad?.street_number].filter(Boolean).join(" "), 400),
    address2: str(ad?.address2, 400),
    shipping_name: shippingName(delivery),
    delivery,
    items,
    currency: str(o?.currency || "EUR", 3).toUpperCase(),
    sub_total: subTotal,
    shipping,
    discount,
    total,
    paid: String(o?.paid || "") === "yes" || o?.paid === true,
    payment_method: str(o?.payment_name || "cod", 60),
    courier: trackingNo ? carrier || delivery.courier || null : null,
    tracking_no: trackingNo,
    tracking_url: str(f.tracking_url, 400) || null,
    sent_at: sentAt,
    // A finished parcel is not followed again; one still on the way is left to the courier tracking.
    parcel_final: Boolean(trackingNo && final),
    parcel_status: trackingNo && status === "completed" ? "delivered" : trackingNo && status === "returned" ? "returned" : null,
    parcel_text: final ? `Middleware: ${STATUS_BG[status] || status}` : null,
    parcel_at: finalAt,
    delivered_at: status === "completed" ? finalAt : null,
    confirmed: String(o?.is_confirmed || "") === "yes" || o?.is_confirmed === true,
    archive: Boolean(archive),
    note: str(o?.notes || o?.description, 1000) || null,
    status_bg: STATUS_BG[status] || status,
    raw: { middleware: { id: o?.id, sn, label: label || null, external_id: ext || null, status: status || null, store: o?.store?.name || null } },
  };
}

async function readPage(token: string, tenant: string, page: number, per: number) {
  const qs = new URLSearchParams({ include: INCLUDE, sort: "ordered_at", per_page: String(per), page: String(page) });
  const res = await fetchImpl(`${env("MW_API_URL") || BASE}/orders?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenant, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) throw new Error("Middleware не прие ключа (401) – провери MW_TOKEN в Netlify.");
  if (!res.ok) throw new Error(`Middleware: HTTP ${res.status}`);
  return res.json();
}

const INSERT = `
INSERT INTO orders (shop, cb_id, order_no, ordered_at, day, cb_status, mw_status, customer_name, phone, email, country, city, zip, address, address2,
                    shipping_name, delivery, items, currency, sub_total, shipping, discount, total, fx, total_eur, paid, payment_method,
                    courier, tracking_no, tracking_url, tracking_source, sent_at, parcel_status, parcel_text, parcel_at, parcel_final, delivered_at,
                    cb_shipped, raw, cb_items, cb_sub_total, cb_shipping, cb_discount, cb_total, source, confirmed_at, confirmed_by, note, archived_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, round($23::numeric / $24::numeric, 2), $25, $26,
        $27, $28, $29, CASE WHEN $28::text IS NULL THEN NULL ELSE 'middleware' END, $30, $31, $32, $33, $34, $35,
        false, $36, $18, $20, $21, $22, $23, 'middleware', $37, $38, $39, $40)
ON CONFLICT (shop, cb_id) DO NOTHING
RETURNING id`;

export type ImportResult = {
  page: number;
  lastPage: number;
  total: number;
  seen: number;
  added: number;
  skipped: Record<string, number>;
  addedByStatus: Record<string, number>;
  sample: string[];
};

/**
 * One page of Middleware orders. `stores` = { "<Middleware store id>": "<our shop id>" }.
 * dry = only count what would be added.
 */
export async function importMwPage(opts: { page: number; per?: number; tenant: string; stores: Record<string, string>; dry: boolean; by: string; userId: number }): Promise<ImportResult> {
  const token = env("MW_TOKEN") || "";
  if (!token) throw new Error("Липсва MW_TOKEN в настройките на Netlify.");
  if (!opts.tenant) throw new Error("Липсва X-Tenant-Id на Middleware.");
  const shops = await q<any>("SELECT id FROM shops WHERE company_id = $1", [companyId()]);
  const own = new Set(shops.map((s) => String(s.id)));
  for (const shop of Object.values(opts.stores)) if (!own.has(shop)) throw new Error(`Няма магазин „${shop}“ в тази фирма.`);

  const per = Math.max(10, Math.min(MW_PER_PAGE, Number(opts.per) || MW_PER_PAGE));
  const d = await readPage(token, opts.tenant, opts.page, per);
  const rows: any[] = Array.isArray(d?.data) ? d.data : [];
  const out: ImportResult = { page: opts.page, lastPage: Number(d?.meta?.last_page) || opts.page, total: Number(d?.meta?.total) || 0, seen: rows.length, added: 0, skipped: {}, addedByStatus: {}, sample: [] };
  const skip = (why: string) => (out.skipped[why] = (out.skipped[why] || 0) + 1);
  const rates = await getRates();
  const now = Date.now();

  for (const o of rows) {
    const shop = opts.stores[String(o?.store_id || "")];
    if (!shop) {
      skip("друг магазин");
      continue;
    }
    const r = fromMw(o, shop, now);
    // Already here: the shop's order (by its id or number), or this Middleware order from an earlier run.
    const here = await one<any>(
      r.from_shop
        ? "SELECT id FROM orders WHERE shop = $1 AND (cb_id = $2 OR order_no = $3) LIMIT 1"
        : "SELECT id FROM orders WHERE shop = $1 AND cb_id = $2 LIMIT 1",
      r.from_shop ? [shop, r.cb_id, r.order_no] : [shop, r.cb_id],
    );
    if (here) {
      skip("вече е в OrderDesk");
      continue;
    }
    // A Middleware order for a parcel we already have (e.g. a second order on the same waybill).
    if (r.tracking_no) {
      const same = await one<any>(`SELECT id FROM orders WHERE tracking_no = $1 AND shop IN (SELECT id FROM shops WHERE company_id = $2) LIMIT 1`, [r.tracking_no, companyId()]);
      if (same) {
        skip("същата товарителница вече е тук");
        continue;
      }
    }
    if (opts.dry) {
      out.added++;
      out.addedByStatus[r.status_bg] = (out.addedByStatus[r.status_bg] || 0) + 1;
      if (out.sample.length < 5) out.sample.push(`${r.order_no} ${r.customer_name} ${r.total} ${r.currency} ${r.status_bg}`);
      continue;
    }
    const fx = rateFor(r.currency, rates);
    const ins = await one<any>(INSERT, [
      r.shop, r.cb_id, r.order_no, r.ordered_at, sofiaDay(new Date(r.ordered_at)), r.cb_status, r.mw_status, r.customer_name, r.phone, r.email, r.country, r.city, r.zip, r.address, r.address2,
      r.shipping_name, JSON.stringify(r.delivery), JSON.stringify(r.items), r.currency, r.sub_total, r.shipping, r.discount, r.total, fx, r.paid, r.payment_method,
      r.courier, r.tracking_no, r.tracking_url, r.sent_at, r.parcel_status, r.parcel_text, r.parcel_at, r.parcel_final, r.delivered_at,
      JSON.stringify(r.raw), r.confirmed ? r.ordered_at : null, r.confirmed ? "Middleware" : null, r.note, r.archive ? new Date(now).toISOString() : null,
    ]);
    if (!ins) {
      skip("вече е в OrderDesk");
      continue;
    }
    out.added++;
    out.addedByStatus[r.status_bg] = (out.addedByStatus[r.status_bg] || 0) + 1;
    if (out.sample.length < 5) out.sample.push(`${r.order_no} ${r.customer_name} ${r.total} ${r.currency} ${r.status_bg}`);
    await addEvent(Number(ins.id), "create", `Внесена от Middleware (№ ${r.mw_sn}, статус „${r.status_bg}“) – ${opts.by}`, { middleware: r.raw.middleware }, opts.userId);
  }
  return out;
}
