import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { cbSite, getOrder } from "../lib/cb.mts";
import { trackingUrl } from "../lib/couriers.mts";
import { isDay } from "../lib/dates.mts";
import { one, q } from "../lib/db.mts";
import { getRates } from "../lib/fx.mts";
import { bad, handle, json, notFound, str, sub } from "../lib/http.mts";
import { STAGES, upsertOrders } from "../lib/orders.mts";
import { runTracking } from "../lib/track.mts";

const PER_PAGE = 50;

async function list(u: URLSearchParams) {
  const params: unknown[] = [];
  const parts = ["s.active"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    parts.push(sql.replace("?", `$${params.length}`));
  };
  const from = u.get("from");
  const to = u.get("to");
  if (isDay(from)) add("o.day >= ?", from);
  if (isDay(to)) add("o.day <= ?", to);
  const stage = u.get("stage") || "";
  if ((STAGES as readonly string[]).includes(stage)) add("o.stage = ?", stage);
  if (stage === "open") parts.push("o.stage IN ('new', 'shipped', 'at_office')");
  if (stage === "refused") parts.push("o.parcel_status = 'refused'");
  const region = u.get("region");
  if (region === "bg" || region === "abroad") add("s.region = ?", region);
  const shop = str(u.get("shop"), 20);
  if (shop) add("o.shop = ?", shop);
  const search = str(u.get("q"), 80);
  if (search) {
    const digits = search.replace(/\D/g, "");
    params.push(`%${search.toLowerCase()}%`);
    const p = `$${params.length}`;
    const or = [`lower(o.customer_name) LIKE ${p}`, `o.order_no = $${params.length + 1}`, `o.tracking_no = $${params.length + 1}`, `lower(o.city) LIKE ${p}`];
    params.push(search);
    if (digits.length >= 6) {
      params.push(`%${digits.slice(-9)}`);
      or.push(`regexp_replace(o.phone, '\\D', '', 'g') LIKE $${params.length}`);
    }
    parts.push(`(${or.join(" OR ")})`);
  }
  const page = Math.max(1, Math.min(1000, Number(u.get("page")) || 1));
  const whereSql = parts.join(" AND ");
  const [rows, count] = await Promise.all([
    q<any>(
      `SELECT o.id, o.shop, s.label AS shop_label, o.order_no, o.ordered_at, o.customer_name, o.city, o.total, o.currency, o.total_eur::float AS total_eur,
              o.stage, o.parcel_status, o.parcel_text, o.courier, o.tracking_no, o.delivery, o.items
         FROM orders o JOIN shops s ON s.id = o.shop
        WHERE ${whereSql}
        ORDER BY o.ordered_at DESC, o.id DESC
        LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`,
      params,
    ),
    one<any>(`SELECT count(*)::int AS n, coalesce(sum(o.total_eur), 0)::float AS sum FROM orders o JOIN shops s ON s.id = o.shop WHERE ${whereSql}`, params),
  ]);
  return {
    page,
    perPage: PER_PAGE,
    total: count?.n || 0,
    sum: Math.round((count?.sum || 0) * 100) / 100,
    orders: rows.map((r) => ({
      ...r,
      total: Number(r.total),
      items: (r.items || []).filter((i: any) => i.total > 0 || !/подар|gift|ajánd|darček/i.test(i.name)).map((i: any) => `${i.qty > 1 ? i.qty + " × " : ""}${i.name}`),
    })),
  };
}

async function detail(id: number) {
  const o = await one<any>(
    `SELECT o.*, s.label AS shop_label, s.domain AS shop_domain, s.region FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1`,
    [id],
  );
  if (!o) throw notFound("Няма такава поръчка.");
  const raw = o.raw || {};
  const { raw: _r, ...rest } = o;
  return {
    ...rest,
    total: Number(o.total),
    sub_total: Number(o.sub_total),
    shipping: Number(o.shipping),
    discount: Number(o.discount),
    total_eur: Number(o.total_eur),
    tracking_link: o.tracking_url || trackingUrl(o.courier, o.tracking_no),
    shop_notes: Array.isArray(raw.notes) ? raw.notes.map((n: any) => ({ at: n.time ? new Date(Number(n.time) * 1000).toISOString() : null, text: String(n.value || "") })) : [],
    extra_fields: Array.isArray(raw.additionalFields) ? raw.additionalFields.map((f: any) => ({ field: String(f.field || ""), value: String(f.value || "") })) : [],
    discount_code: raw.discountCode || null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

export default handle(async (req) => {
  await requireUser(req);
  const [idStr, action] = sub(req, "/api/orders");
  const u = new URL(req.url).searchParams;
  if (req.method === "GET" && !idStr) return json(await list(u));
  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  if (req.method === "GET" && !action) return json(await detail(id));

  // Re-read this order from the shop and ask the courier again.
  if (req.method === "POST" && action === "refresh") {
    const o = await one<any>("SELECT o.shop, o.cb_id, s.currency FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1", [id]);
    if (!o) throw notFound();
    const site = cbSite(o.shop);
    if (!site) throw bad("no_site", "Липсва API ключ за този магазин.");
    await upsertOrders({ id: o.shop, currency: o.currency }, [await getOrder(site, o.cb_id)], await getRates());
    await runTracking({ deadline: Date.now() + 15000, orderIds: [id], job: "track-one" });
    return json(await detail(id));
  }
  throw notFound();
});

export const config: Config = { path: ["/api/orders", "/api/orders/*"] };
