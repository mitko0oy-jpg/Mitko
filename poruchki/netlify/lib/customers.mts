// Клиенти (like RevOrder's customers page): every person who ordered, grouped by phone (the last 9 digits), with
// what they spent (taken parcels only), how many they took and sent back, a risk level and VIP / repeat marks.
// Abandoned carts and held duplicates are not orders, so they are left out.
import { one, q } from "./db.mts";
import { companyId } from "./tenant.mts";

const P9 = (col: string) => `right(regexp_replace(${col}, '\\D', '', 'g'), 9)`;

/**
 * Risk of a cash-on-delivery order to this client:
 *  high – sent back 2 or more, or sent back and never took one, or reports at nekorekten.com;
 *  medium – sent back one;
 *  low – no parcel sent back.
 */
const RISK = `CASE WHEN g.ret >= 2 OR (g.ret >= 1 AND g.got = 0) OR coalesce(pc.count, 0) > 0 THEN 'high'
                   WHEN g.ret >= 1 THEN 'medium' ELSE 'low' END`;

function grouped(company: number) {
  return `
    WITH c AS (
      SELECT ${P9("o.phone")} AS k, o.*, s.label AS shop_label
        FROM orders o JOIN shops s ON s.id = o.shop
       WHERE s.company_id = ${company} AND o.stage NOT IN ('abandoned', 'duplicate')
         AND length(regexp_replace(o.phone, '\\D', '', 'g')) >= 9
    ), g AS (
      SELECT k,
             (array_agg(customer_name ORDER BY ordered_at DESC))[1] AS name,
             (array_agg(phone ORDER BY ordered_at DESC))[1] AS phone,
             (array_agg(email ORDER BY ordered_at DESC) FILTER (WHERE email <> '' AND email !~* '@no\\.email$'))[1] AS email,
             (array_agg(city ORDER BY ordered_at DESC))[1] AS city,
             count(*) FILTER (WHERE stage <> 'canceled')::int AS n,
             count(*) FILTER (WHERE stage = 'delivered')::int AS got,
             count(*) FILTER (WHERE stage = 'returned')::int AS ret,
             count(*) FILTER (WHERE stage = 'canceled')::int AS canceled,
             count(*) FILTER (WHERE stage IN ('new', 'prepared', 'shipped', 'at_office'))::int AS open,
             coalesce(sum(total_eur) FILTER (WHERE stage = 'delivered'), 0)::float AS spent,
             coalesce(sum(total_eur) FILTER (WHERE stage = 'returned'), 0)::float AS lost,
             min(ordered_at) AS first_at, max(ordered_at) AS last_at,
             array_agg(DISTINCT shop_label) AS shops
        FROM c GROUP BY k
    )`;
}

/** The spent amount from which a client is VIP: the top 10% of the clients who took a parcel (at least 2 taken). */
async function vipFrom(company: number): Promise<number> {
  const r = await one<any>(`${grouped(company)} SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY spent)::float AS p FROM g WHERE got > 0`);
  return Math.max(1, Number(r?.p) || 0);
}

const SORTS: Record<string, string> = {
  last: "g.last_at DESC",
  spent: "g.spent DESC, g.last_at DESC",
  orders: "g.n DESC, g.last_at DESC",
  returned: "g.ret DESC, g.lost DESC",
  first: "g.first_at DESC",
};

export async function listCustomers(opts: { q?: string; seg?: string; risk?: string; sort?: string; page?: number; per?: number }) {
  const company = companyId();
  const vip = await vipFrom(company);
  const where: string[] = [];
  const params: unknown[] = [];
  const text = (opts.q || "").trim();
  if (text) {
    const digits = text.replace(/\D/g, "");
    params.push(`%${text.toLowerCase()}%`);
    const p = `$${params.length}`;
    if (digits.length >= 4) {
      params.push(`%${digits.slice(-9)}%`);
      where.push(`(lower(g.name) LIKE ${p} OR lower(coalesce(g.email, '')) LIKE ${p} OR g.k LIKE $${params.length})`);
    } else where.push(`(lower(g.name) LIKE ${p} OR lower(coalesce(g.email, '')) LIKE ${p} OR lower(g.city) LIKE ${p})`);
  }
  const isVip = `(g.got >= 2 AND g.spent >= ${vip})`;
  if (opts.seg === "repeat") where.push("g.n >= 2");
  else if (opts.seg === "new") where.push("g.n = 1");
  else if (opts.seg === "vip") where.push(isVip);
  else if (opts.seg === "open") where.push("g.open > 0");
  if (opts.risk && ["high", "medium", "low"].includes(opts.risk)) {
    params.push(opts.risk);
    where.push(`${RISK} = $${params.length}`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const per = Math.min(Math.max(Number(opts.per) || 50, 10), 200);
  const page = Math.max(Number(opts.page) || 1, 1);
  const order = SORTS[opts.sort || ""] || SORTS.last;
  const base = `${grouped(company)} SELECT g.*, coalesce(pc.count, 0)::int AS nek, ${RISK} AS risk, ${isVip} AS vip
      FROM g LEFT JOIN phone_checks pc ON pc.company_id = ${company} AND pc.phone_key = g.k ${w}`;
  const [rows, total, sum] = await Promise.all([
    q<any>(`${base} ORDER BY ${order} LIMIT ${per} OFFSET ${(page - 1) * per}`, params),
    one<any>(`SELECT count(*)::int AS n FROM (${base}) x`, params),
    // The whole base (no filter): how many, repeat share, average spent, VIP and risky.
    one<any>(
      `${grouped(company)} SELECT count(*)::int AS n, count(*) FILTER (WHERE g.n >= 2)::int AS repeat,
              count(*) FILTER (WHERE g.n = 1)::int AS once,
              count(*) FILTER (WHERE ${isVip})::int AS vip,
              count(*) FILTER (WHERE ${RISK} = 'high')::int AS high, count(*) FILTER (WHERE ${RISK} = 'medium')::int AS medium,
              coalesce(sum(g.spent), 0)::float AS spent,
              coalesce(sum(g.spent) FILTER (WHERE g.n >= 2), 0)::float AS spent_repeat,
              count(*) FILTER (WHERE g.got > 0)::int AS buyers,
              coalesce(sum(g.got), 0)::int AS got
         FROM g LEFT JOIN phone_checks pc ON pc.company_id = ${company} AND pc.phone_key = g.k`,
    ),
  ]);
  return {
    customers: rows.map((r) => ({ ...r, spent: Math.round(r.spent * 100) / 100, lost: Math.round(r.lost * 100) / 100 })),
    total: total?.n || 0,
    page,
    per,
    vipFrom: Math.round(vip * 100) / 100,
    summary: {
      customers: sum?.n || 0,
      repeat: sum?.repeat || 0,
      once: sum?.once || 0,
      vip: sum?.vip || 0,
      high: sum?.high || 0,
      medium: sum?.medium || 0,
      spent: Math.round((sum?.spent || 0) * 100) / 100,
      spentRepeat: Math.round((sum?.spent_repeat || 0) * 100) / 100,
      perBuyer: sum?.buyers ? Math.round((sum.spent / sum.buyers) * 100) / 100 : 0,
      ordersPerBuyer: sum?.buyers ? Math.round((sum.got / sum.buyers) * 100) / 100 : 0,
    },
  };
}

/** One client: the orders (newest first) with what happened, and the messages and calls they got. */
export async function customerOrders(key: string) {
  const k = String(key || "").replace(/\D/g, "").slice(-9);
  if (k.length < 9) return { orders: [], messages: 0, calls: 0 };
  const company = companyId();
  const orders = await q<any>(
    `SELECT o.id, o.order_no, o.ordered_at, s.label AS shop_label, o.stage, o.parcel_text, o.total, o.currency, o.total_eur::float AS total_eur,
            o.courier, o.tracking_no, o.items, o.customer_name, o.city
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE s.company_id = $1 AND ${P9("o.phone")} = $2 AND o.stage NOT IN ('abandoned')
      ORDER BY o.ordered_at DESC LIMIT 100`,
    [company, k],
  );
  const ev = await one<any>(
    `SELECT count(*) FILTER (WHERE e.kind = 'sms')::int AS sms, count(*) FILTER (WHERE e.kind = 'call')::int AS calls, max(e.at) AS last_at
       FROM order_events e WHERE e.order_id = ANY($1::bigint[])`,
    [orders.map((o) => o.id)],
  );
  return {
    orders: orders.map((o) => ({ ...o, items: (Array.isArray(o.items) ? o.items : []).map((i: any) => ({ name: i.name, qty: i.qty })) })),
    messages: ev?.sms || 0,
    calls: ev?.calls || 0,
    lastContact: ev?.last_at || null,
  };
}
