// Unfinished orders ("Незавършени"): a customer filled in the shop's order form but did not send it.
// The shop pages load /c.js, which posts the typed fields to /api/collect. An order with the same
// phone that comes later marks the lead as ordered (computed when listing, nothing to keep in sync).
import { cbSites } from "./cb.mts";
import { one, q } from "./db.mts";
import { inCompany } from "./tenant.mts";

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** The shop whose site sent the request (from its Origin), or null for anything else. */
export function shopForOrigin(origin: string | null): string | null {
  if (!origin) return null;
  let host = "";
  try {
    host = new URL(origin).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const site = cbSites().find((s) => s.domain.toLowerCase().replace(/^www\./, "") === host);
  return site ? site.id : null;
}

export type Lead = { sid: string; name: string; phone: string; city: string; address: string; cart: string[]; total: string; page: string };

/** What the script sent, cleaned; null when there is no usable phone yet. */
export function cleanLead(input: any): Lead | null {
  const sid = clean(input?.sid, 40);
  if (!/^[a-z0-9]{8,40}$/i.test(sid)) return null;
  const phone = clean(input?.phone, 30);
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return null;
  const cart = Array.isArray(input?.cart) ? input.cart.slice(0, 10).map((x: unknown) => clean(x, 160)).filter(Boolean) : [];
  return {
    sid,
    name: clean(input?.name, 120),
    phone,
    city: clean(input?.city, 80),
    address: clean(input?.address, 200),
    cart,
    total: clean(input?.total, 40),
    page: clean(input?.page, 200),
  };
}

/** One visit is one row; later posts update it (empty fields never wipe what was typed before). */
export async function saveLead(shop: string, l: Lead) {
  await q(
    `INSERT INTO leads (shop, sid, name, phone, city, address, cart, total, page) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     ON CONFLICT (shop, sid) DO UPDATE SET
       name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE leads.name END,
       phone = excluded.phone,
       city = CASE WHEN excluded.city <> '' THEN excluded.city ELSE leads.city END,
       address = CASE WHEN excluded.address <> '' THEN excluded.address ELSE leads.address END,
       cart = CASE WHEN jsonb_array_length(excluded.cart) > 0 THEN excluded.cart ELSE leads.cart END,
       total = CASE WHEN excluded.total <> '' THEN excluded.total ELSE leads.total END,
       page = excluded.page, hits = leads.hits + 1, last_at = now()
     WHERE leads.hits < 300`,
    [shop, l.sid, l.name, l.phone, l.city, l.address, JSON.stringify(l.cart), l.total, l.page],
  );
}

// The first order with the same phone placed after the form was opened (30 min slack for clocks and retries).
const MATCH = `LEFT JOIN LATERAL (
    SELECT o.id, o.order_no, o.ordered_at FROM orders o
    WHERE o.shop IN (SELECT id FROM shops WHERE company_id = (SELECT company_id FROM shops WHERE id = l.shop))
      AND right(regexp_replace(o.phone, '\\D', '', 'g'), 9) = right(regexp_replace(l.phone, '\\D', '', 'g'), 9)
      AND o.ordered_at >= l.first_at - interval '30 minutes'
    ORDER BY o.ordered_at LIMIT 1) m ON true`;

const ORDERED = "(m.id IS NOT NULL OR l.order_id IS NOT NULL)";
// Still typing: the form was touched in the last 15 minutes.
const TABS: Record<string, string> = {
  open: `NOT ${ORDERED} AND l.status = 'open'`,
  ordered: ORDERED,
  hidden: `NOT ${ORDERED} AND l.status = 'dismissed'`,
  all: "true",
};

export async function listLeads(tab: string, shop = "") {
  const where = TABS[tab] || TABS.open;
  const params: unknown[] = [];
  let shopSql = "";
  if (shop) {
    params.push(shop);
    shopSql = ` AND l.shop = $${params.length}`;
  }
  const rows = await q<any>(
    `SELECT l.id, l.shop, coalesce(s.label, l.shop) AS shop_label, l.name, l.phone, l.city, l.address, l.cart, l.total, l.page,
            l.first_at, l.last_at, l.status, l.last_at > now() - interval '15 minutes' AS typing,
            coalesce(l.order_id, m.id) AS order_id, coalesce(lo.order_no, m.order_no) AS order_no,
            (SELECT count(*) FROM orders x WHERE ${inCompany("x.shop")} AND right(regexp_replace(x.phone, '\\D', '', 'g'), 9) = right(regexp_replace(l.phone, '\\D', '', 'g'), 9))::int AS orders_before
       FROM leads l LEFT JOIN shops s ON s.id = l.shop
       ${MATCH}
       LEFT JOIN orders lo ON lo.id = l.order_id
      WHERE ${where}${shopSql} AND ${inCompany("l.shop")} AND l.last_at > now() - interval '30 days'
      ORDER BY l.last_at DESC LIMIT 300`,
    params,
  );
  const counts = await one<any>(
    `SELECT count(*) FILTER (WHERE ${TABS.open})::int AS open, count(*) FILTER (WHERE ${TABS.ordered})::int AS ordered,
            count(*) FILTER (WHERE ${TABS.hidden})::int AS hidden, count(*)::int AS all
       FROM leads l ${MATCH} WHERE ${inCompany("l.shop")} AND l.last_at > now() - interval '30 days'${shopSql}`,
    params,
  );
  return { leads: rows, counts };
}

export async function setLead(id: number, action: string, orderId?: number) {
  const mine = inCompany();
  if (action === "dismiss") return q(`UPDATE leads SET status = 'dismissed' WHERE id = $1 AND ${mine}`, [id]);
  if (action === "restore") return q(`UPDATE leads SET status = 'open' WHERE id = $1 AND ${mine}`, [id]);
  if (action === "ordered" && orderId) return q(`UPDATE leads SET order_id = $2 WHERE id = $1 AND ${mine} AND $2 IN (SELECT id FROM orders WHERE ${mine})`, [id, orderId]);
  return null;
}

/** Unfinished orders not ordered yet (for the count in the orders filters). */
export async function countOpenLeads(shop = "") {
  const r = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM leads l ${MATCH}
      WHERE ${TABS.open} AND ${inCompany("l.shop")} AND l.last_at > now() - interval '30 days'${shop ? " AND l.shop = $1" : ""}`,
    shop ? [shop] : [],
  );
  return r?.n || 0;
}

export const purgeLeads = () => q("DELETE FROM leads WHERE last_at < now() - interval '30 days'");
