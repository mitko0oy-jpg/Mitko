// Unfinished orders ("Незавършени"): a customer filled in the shop's order form but did not send it.
// The shop pages load /c.js, which posts the typed fields to /api/collect. An order with the same
// phone that comes later marks the lead as ordered (computed when listing, nothing to keep in sync).
import { allSites } from "./cb.mts";
import { one, q } from "./db.mts";
import { inCompany } from "./tenant.mts";
import { cleanPath, cleanTrail, cleanUtm, type Touch, type Utm } from "./visits.mts";

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** The shop whose site sent the request (from its Origin), or null for anything else. */
export async function shopForOrigin(origin: string | null): Promise<string | null> {
  if (!origin) return null;
  let host = "";
  try {
    host = new URL(origin).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const site = (await allSites()).find((s) => s.domain.toLowerCase().replace(/^www\./, "") === host);
  return site ? site.id : null;
}

export type Lead = { sid: string; name: string; phone: string; email: string; city: string; address: string; cart: string[]; total: string; page: string; known: boolean; utm: Utm | null; trail: Touch[] | null; path: string[] | null };

/** What the script sent, cleaned; null when there is no usable phone yet. */
export function cleanLead(input: any): Lead | null {
  const sid = clean(input?.sid, 40);
  if (!/^[a-z0-9]{8,40}$/i.test(sid)) return null;
  const phone = clean(input?.phone, 30);
  const digits = phone.replace(/\D/g, "");
  const email = clean(input?.email, 200).toLowerCase();
  const okEmail = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i.test(email);
  // A phone or an e-mail to reach them by.
  if ((digits.length < 9 || digits.length > 15) && !okEmail) return null;
  const cart = Array.isArray(input?.cart) ? input.cart.slice(0, 10).map((x: unknown) => clean(x, 160)).filter(Boolean) : [];
  return {
    sid,
    name: clean(input?.name, 120),
    phone: digits.length >= 9 && digits.length <= 15 ? phone : "",
    email: okEmail ? email : "",
    city: clean(input?.city, 80),
    address: clean(input?.address, 200),
    cart,
    total: clean(input?.total, 40),
    page: clean(input?.page, 200),
    // Remembered from an earlier visit (the visitor typed nothing this time).
    known: input?.known === true,
    utm: cleanUtm(input?.utm),
    // Път на клиента: the browser's earlier visits and the pages of this one.
    trail: cleanTrail(input?.trail),
    path: cleanPath(input?.path),
  };
}

/** One visit is one row; later posts update it (empty fields never wipe what was typed before). */
export async function saveLead(shop: string, l: Lead) {
  // A returning visitor who ordered in the last 3 days is only looking: not an unfinished order.
  if (l.known && l.phone) {
    const recent = await one(
      `SELECT 1 FROM orders o JOIN shops s ON s.id = o.shop
        WHERE s.company_id = (SELECT company_id FROM shops WHERE id = $1)
          AND right(regexp_replace(o.phone, '\\D', '', 'g'), 9) = right(regexp_replace($2, '\\D', '', 'g'), 9)
          AND o.ordered_at > now() - interval '3 days' LIMIT 1`,
      [shop, l.phone],
    );
    if (recent) return;
  }
  await q(
    `INSERT INTO leads (shop, sid, name, phone, city, address, cart, total, page, known, email, utm, trail, path)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb)
     ON CONFLICT (shop, sid) DO UPDATE SET
       utm = coalesce(leads.utm, excluded.utm),
       trail = coalesce(excluded.trail, leads.trail),
       path = coalesce(excluded.path, leads.path),
       known = leads.known AND excluded.known,
       email = CASE WHEN excluded.email <> '' THEN excluded.email ELSE leads.email END,
       name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE leads.name END,
       phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE leads.phone END,
       city = CASE WHEN excluded.city <> '' THEN excluded.city ELSE leads.city END,
       address = CASE WHEN excluded.address <> '' THEN excluded.address ELSE leads.address END,
       cart = CASE WHEN jsonb_array_length(excluded.cart) > 0 THEN excluded.cart ELSE leads.cart END,
       total = CASE WHEN excluded.total <> '' THEN excluded.total ELSE leads.total END,
       page = excluded.page, hits = leads.hits + 1, last_at = now()
     WHERE leads.hits < 300`,
    [shop, l.sid, l.name, l.phone, l.city, l.address, JSON.stringify(l.cart), l.total, l.page, l.known, l.email, l.utm ? JSON.stringify(l.utm) : null, l.trail ? JSON.stringify(l.trail) : null, l.path ? JSON.stringify(l.path) : null],
  );
}

// The first order with the same phone placed after the form was opened (30 min slack for clocks and retries).
export const MATCH = `LEFT JOIN LATERAL (
    SELECT o.id, o.order_no, o.ordered_at, o.total_eur FROM orders o
    WHERE o.shop IN (SELECT id FROM shops WHERE company_id = (SELECT company_id FROM shops WHERE id = l.shop)) AND o.stage <> 'abandoned'
      AND ((l.phone <> '' AND right(regexp_replace(o.phone, '\\D', '', 'g'), 9) = right(regexp_replace(l.phone, '\\D', '', 'g'), 9))
           OR (l.email <> '' AND lower(o.email) = l.email))
      AND o.ordered_at >= l.first_at - interval '30 minutes'
    ORDER BY o.ordered_at LIMIT 1) m ON true`;

export const ORDERED = "(m.id IS NOT NULL OR l.order_id IS NOT NULL)";
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
    `SELECT l.id, l.shop, coalesce(s.label, l.shop) AS shop_label, s.domain AS shop_domain, l.name, l.phone, l.email, l.city, l.address, l.cart, l.total, l.page, l.known,
            (SELECT json_agg(json_build_object('channel', lm.channel, 'step', lm.step, 'ok', lm.ok, 'error', lm.error, 'at', lm.at) ORDER BY lm.at DESC)
               FROM lead_messages lm WHERE lm.lead_id = l.id) AS messages,
            l.first_at, l.last_at, l.status, l.last_at > now() - interval '15 minutes' AS typing,
            coalesce(l.order_id, m.id) AS order_id, coalesce(lo.order_no, m.order_no) AS order_no,
            (SELECT count(*) FROM orders x WHERE l.phone <> '' AND x.stage <> 'abandoned' AND ${inCompany("x.shop")} AND right(regexp_replace(x.phone, '\\D', '', 'g'), 9) = right(regexp_replace(l.phone, '\\D', '', 'g'), 9))::int AS orders_before
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
