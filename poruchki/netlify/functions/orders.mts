import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { body } from "../lib/http.mts";
import { cbSite, getOrder } from "../lib/cb.mts";
import { trackingUrl } from "../lib/couriers.mts";
import { isDay } from "../lib/dates.mts";
import { getSetting, one, q, setSetting } from "../lib/db.mts";
import { countOpenLeads } from "../lib/leads.mts";
import { getRates } from "../lib/fx.mts";
import { bad, handle, json, notFound, str, sub } from "../lib/http.mts";
import { STAGES, upsertOrders } from "../lib/orders.mts";
import { runTracking } from "../lib/track.mts";
import { addEvent, editOrder, resetOrder } from "../lib/edit.mts";
import { addNote, archiveOrder, confirmOrder, createOrder, duplicateOrder, editContact, unconfirmOrder } from "../lib/manage.mts";

const ACTIVE = "o.stage IN ('new', 'prepared', 'shipped', 'at_office')";
const DONE = "o.stage IN ('delivered', 'returned', 'canceled', 'archived')";

// "Изпратени днес": the waybill appeared today (Sofia time); sent_at is kept by a trigger.
const SENT_TODAY = "o.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Sofia') AT TIME ZONE 'Europe/Sofia')";

const SORTS: Record<string, string> = {
  new: "o.ordered_at DESC, o.id DESC",
  old: "o.ordered_at ASC, o.id ASC",
  sum_desc: "o.total_eur DESC NULLS LAST, o.ordered_at DESC",
  sum_asc: "o.total_eur ASC NULLS LAST, o.ordered_at DESC",
  sent: "o.sent_at DESC NULLS LAST, o.ordered_at DESC",
  courier: "o.parcel_at DESC NULLS LAST, o.ordered_at DESC",
};

/**
 * WHERE for the list. The stage/tab part is left out for the counts next to each status,
 * the product for the product list, and "sent today" for its own count.
 */
function filters(u: URLSearchParams, withStage: boolean, skip: { product?: boolean; sent?: boolean } = {}) {
  const params: unknown[] = [];
  const parts = ["s.active"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    parts.push(sql.replaceAll("?", `$${params.length}`));
  };
  const from = u.get("from");
  const to = u.get("to");
  if (isDay(from)) add("o.day >= ?", from);
  if (isDay(to)) add("o.day <= ?", to);
  if (withStage) {
    const tab = u.get("tab");
    if (tab === "active") parts.push(ACTIVE);
    if (tab === "done") parts.push(DONE);
    const stages = String(u.get("stage") || "").split(",").filter((x) => (STAGES as readonly string[]).includes(x));
    if (u.get("stage") === "open") parts.push(ACTIVE);
    if (u.get("stage") === "refused") parts.push("o.parcel_status = 'refused'");
    if (stages.length) add("o.stage = ANY(?)", stages);
  }
  const region = u.get("region");
  if (region === "bg" || region === "abroad") add("s.region = ?", region);
  const shop = str(u.get("shop"), 20);
  if (shop) add("o.shop = ?", shop);
  const courier = u.get("courier");
  if (courier === "speedy" || courier === "econt") add("coalesce(o.courier, o.delivery->>'courier') = ?", courier);
  if (courier === "other") parts.push("coalesce(o.courier, o.delivery->>'courier', '') NOT IN ('speedy', 'econt')");
  if (u.get("nowaybill") === "1") parts.push("o.tracking_no IS NULL");
  if (u.get("sent") === "today" && !skip.sent) parts.push(SENT_TODAY);
  const product = str(u.get("product"), 200);
  if (product && !skip.product) add("EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) i WHERE i->>'name' = ?)", product);
  const conf = u.get("confirmed");
  if (conf === "no") parts.push("o.confirmed_at IS NULL");
  if (conf === "ai") parts.push("o.confirmed_by = 'AI агент'");
  if (conf === "us") parts.push("o.confirmed_at IS NOT NULL AND o.confirmed_by IS DISTINCT FROM 'AI агент'");
  parts.push(u.get("archived") === "1" ? "o.archived_at IS NOT NULL" : "o.archived_at IS NULL");
  const search = str(u.get("q"), 80);
  if (search) {
    const digits = search.replace(/\D/g, "");
    params.push(`%${search.toLowerCase()}%`);
    const p = `$${params.length}`;
    params.push(search);
    const exact = `$${params.length}`;
    const or = [`lower(o.customer_name) LIKE ${p}`, `o.order_no = ${exact}`, `o.tracking_no = ${exact}`, `lower(o.city) LIKE ${p}`];
    if (digits.length >= 6) {
      params.push(`%${digits.slice(-9)}`);
      or.push(`regexp_replace(o.phone, '\\D', '', 'g') LIKE $${params.length}`);
    }
    parts.push(`(${or.join(" OR ")})`);
  }
  return { sql: parts.join(" AND "), params };
}

async function list(u: URLSearchParams) {
  const perPage = Number(u.get("per")) === 100 ? 100 : 50;
  const page = Math.max(1, Math.min(1000, Number(u.get("page")) || 1));
  const w = filters(u, true);
  const all = filters(u, false);
  const noProduct = filters(u, false, { product: true });
  const noSent = filters(u, false, { sent: true });
  const order = SORTS[String(u.get("sort"))] || SORTS.new;
  const [rows, count, facets, products, sent, abandoned] = await Promise.all([
    q<any>(
      `SELECT o.id, o.shop, s.label AS shop_label, s.region, o.order_no, o.ordered_at, o.customer_name, o.phone, o.city,
              o.total, o.sub_total, o.shipping, o.currency, o.total_eur::float AS total_eur, o.paid,
              o.stage, o.cb_status, o.parcel_status, o.parcel_text, o.parcel_at, o.courier, o.tracking_no, o.tracking_source,
              o.delivery, o.shipping_name, o.items, o.waybill, o.edit IS NOT NULL AS edit,
              o.confirmed_at, o.confirmed_by, o.note, o.call, o.source, o.archived_at, h.n AS other_orders, h.ret AS returned_before
         FROM orders o JOIN shops s ON s.id = o.shop
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS n, count(*) FILTER (WHERE x.stage = 'returned')::int AS ret
             FROM orders x
            WHERE o.phone <> '' AND x.id <> o.id AND right(regexp_replace(x.phone, '\\D', '', 'g'), 9) = right(regexp_replace(o.phone, '\\D', '', 'g'), 9)
         ) h ON true
        WHERE ${w.sql}
        ORDER BY ${order}
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
      w.params,
    ),
    one<any>(`SELECT count(*)::int AS n, coalesce(sum(o.total_eur), 0)::float AS sum FROM orders o JOIN shops s ON s.id = o.shop WHERE ${w.sql}`, w.params),
    q<any>(
      `SELECT o.stage, count(*)::int AS n, count(*) FILTER (WHERE o.parcel_status = 'refused')::int AS refused
         FROM orders o JOIN shops s ON s.id = o.shop WHERE ${all.sql} GROUP BY o.stage`,
      all.params,
    ),
    // Products sold in the last 6 months (paid lines only), for the product filter.
    q<any>(
      `SELECT i->>'name' AS name, count(DISTINCT o.id)::int AS n
         FROM orders o JOIN shops s ON s.id = o.shop, jsonb_array_elements(o.items) i
        WHERE ${noProduct.sql} AND o.ordered_at > now() - interval '180 days' AND coalesce((i->>'total')::numeric, 0) > 0
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 150`,
      noProduct.params,
    ),
    one<any>(`SELECT count(*)::int AS n FROM orders o JOIN shops s ON s.id = o.shop WHERE ${noSent.sql} AND ${SENT_TODAY}`, noSent.params),
    countOpenLeads(str(u.get("shop"), 20)).catch(() => 0),
  ]);
  const stages: Record<string, number> = {};
  let refused = 0;
  for (const f of facets) {
    stages[f.stage] = f.n;
    refused += f.refused;
  }
  return {
    page,
    perPage,
    total: count?.n || 0,
    sum: Math.round((count?.sum || 0) * 100) / 100,
    facets: { stages, refused, products, sentToday: sent?.n || 0, abandoned },
    orders: rows.map((r) => ({
      ...r,
      id: Number(r.id),
      total: Number(r.total),
      sub_total: Number(r.sub_total),
      shipping: Number(r.shipping),
      waybill: r.waybill && r.waybill.number === r.tracking_no ? { price: r.waybill.price, at: r.waybill.at } : null,
      tracking_link: trackingUrl(r.courier, r.tracking_no),
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
  const events = await q<any>(
    `SELECT e.kind, e.text, e.at, coalesce(u.name, e.who) AS who FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = $1 ORDER BY e.at`,
    [id],
  );
  return {
    ...rest,
    id: Number(o.id),
    events,
    cb_total: o.cb_total == null ? null : Number(o.cb_total),
    cb_shipping: o.cb_shipping == null ? null : Number(o.cb_shipping),
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
  // Saved filters (☆), per user.
  if (idStr === "saved") {
    const user = await requireUser(req);
    const key = `saved_filters:${user.id}`;
    let saved: { name: string; query: string }[] = (await getSetting(key)) || [];
    if (req.method === "POST") {
      const b = await body(req);
      const name = str(b.name, 60);
      if (!name) throw bad("name", "Дай име на филтъра.");
      saved = saved.filter((x) => x.name !== name);
      if (!b.delete) {
        const query = str(b.query, 1000).replace(/^\?/, "");
        saved = [...saved, { name, query }].slice(-20);
      }
      await setSetting(key, saved);
    }
    return json({ saved });
  }
  // A new order made by hand.
  if (req.method === "POST" && !idStr) {
    const user = await requireUser(req);
    const r = await createOrder(await body(req), { source: "manual", userId: user.id, who: null, by: user.name || user.email });
    return json(r);
  }
  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  if (req.method === "GET" && !action) return json(await detail(id));

  // Correct products, quantities, prices, shipping or discount (kept here; the shop's API cannot change them).
  if (req.method === "POST" && action === "edit") {
    const user = await requireUser(req);
    const r = await editOrder(id, await body(req), user.id);
    return json({ ...r, order: await detail(id) });
  }
  if (req.method === "POST" && action === "reset") {
    const user = await requireUser(req);
    const r = await resetOrder(id, user.id);
    return json({ ...r, order: await detail(id) });
  }

  if (req.method === "POST" && ["confirm", "unconfirm", "note", "contact", "archive", "unarchive", "duplicate", "ai-call"].includes(action)) {
    const user = await requireUser(req);
    const b = await body(req);
    const by = user.name || user.email;
    if (action === "confirm") await confirmOrder(id, by, user.id);
    if (action === "unconfirm") await unconfirmOrder(id, user.id);
    if (action === "note") await addNote(id, str(b.text, 1000), user.id);
    if (action === "contact") await editContact(id, b, user.id);
    if (action === "archive" || action === "unarchive") await archiveOrder(id, action === "archive", user.id);
    if (action === "duplicate") return json(await duplicateOrder(id, user.id, by));
    // Ask the phone agent to call this order (it picks requests up within 5 minutes, in calling hours).
    if (action === "ai-call") {
      const r = await q("UPDATE orders SET call = jsonb_build_object('state', 'requested', 'at', now(), 'by', $2::text) WHERE id = $1 AND confirmed_at IS NULL RETURNING id", [id, by]);
      if (!r.length) throw bad("confirmed", "Поръчката вече е потвърдена.");
      await addEvent(id, "call", "Изпратена за AI потвърждение по телефона", {}, user.id);
    }
    return json(await detail(id));
  }

  // Re-read this order from the shop and ask the courier again.
  if (req.method === "POST" && action === "refresh") {
    const o = await one<any>("SELECT o.shop, o.cb_id, o.source, s.currency FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1", [id]);
    if (!o) throw notFound();
    if (o.source !== "shop") {
      await runTracking({ deadline: Date.now() + 15000, orderIds: [id], job: "track-one" });
      return json(await detail(id));
    }
    const site = cbSite(o.shop);
    if (!site) throw bad("no_site", "Липсва API ключ за този магазин.");
    await upsertOrders({ id: o.shop, currency: o.currency }, [await getOrder(site, o.cb_id)], await getRates());
    await runTracking({ deadline: Date.now() + 15000, orderIds: [id], job: "track-one" });
    return json(await detail(id));
  }
  throw notFound();
});

export const config: Config = { path: ["/api/orders", "/api/orders/*"] };
