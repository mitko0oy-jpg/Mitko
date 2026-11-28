import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { body } from "../lib/http.mts";
import { getOrder, siteFor } from "../lib/cb.mts";
import { trackingUrl } from "../lib/couriers.mts";
import { isDay } from "../lib/dates.mts";
import { getSetting, one, q, setSetting } from "../lib/db.mts";
import { companyId, ownOrder } from "../lib/tenant.mts";
import { countOpenLeads } from "../lib/leads.mts";
import { getRates } from "../lib/fx.mts";
import { bad, handle, json, notFound, str, sub } from "../lib/http.mts";
import { STAGES, upsertOrders } from "../lib/orders.mts";
import { runTracking } from "../lib/track.mts";
import { addEvent, editOrder, resetOrder } from "../lib/edit.mts";
import { releaseDuplicate } from "../lib/duplicates.mts";
import { askAgentToCall } from "../lib/agent.mts";
import { importMwPage } from "../lib/mw-import.mts";
import { addNote, archiveOrder, cancelOrder, confirmOrder, createOrder, duplicateOrder, editContact, setStage, uncancelOrder, unconfirmOrder } from "../lib/manage.mts";

const ACTIVE = "o.stage IN ('abandoned', 'new', 'duplicate', 'prepared', 'shipped', 'at_office')";
const DONE = "o.stage IN ('delivered', 'returned', 'canceled', 'archived')";

// "Изпратени днес": the waybill appeared today (Sofia time); sent_at is kept by a trigger.
const SENT_TODAY = "o.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Sofia') AT TIME ZONE 'Europe/Sofia')";

// "Връщат се скоро": waiting at the office/automat since the 5th day (Sofia days, the arrival day is day 1).
// The couriers send a parcel back after about 7 days, so these are the ones to call now.
const SOON_DAY = 5;
const RETURNING_SOON = `o.parcel_status = 'at_office' AND o.office_since IS NOT NULL
  AND (o.office_since AT TIME ZONE 'Europe/Sofia')::date <= (now() AT TIME ZONE 'Europe/Sofia')::date - ${SOON_DAY - 1}`;

const SORTS: Record<string, string> = {
  new: "o.ordered_at DESC, o.id DESC",
  old: "o.ordered_at ASC, o.id ASC",
  sum_desc: "o.total_eur DESC NULLS LAST, o.ordered_at DESC",
  sum_asc: "o.total_eur ASC NULLS LAST, o.ordered_at DESC",
  sent: "o.sent_at DESC NULLS LAST, o.ordered_at DESC",
  courier: "o.parcel_at DESC NULLS LAST, o.ordered_at DESC",
  parcel_asc: "o.parcel_at ASC NULLS LAST, o.ordered_at DESC",
  stage_asc: "array_position(ARRAY['abandoned','new','duplicate','prepared','shipped','at_office','delivered','returned','canceled','archived'], o.stage) ASC, o.ordered_at DESC",
  stage_desc: "array_position(ARRAY['abandoned','new','duplicate','prepared','shipped','at_office','delivered','returned','canceled','archived'], o.stage) DESC, o.ordered_at DESC",
  shop_asc: "s.label ASC, o.ordered_at DESC",
  shop_desc: "s.label DESC, o.ordered_at DESC",
  cour_asc: "coalesce(o.courier, o.delivery->>'courier', 'я') ASC, o.ordered_at DESC",
  cour_desc: "coalesce(o.courier, o.delivery->>'courier', '') DESC, o.ordered_at DESC",
  note_desc: "(coalesce(o.note, '') <> '') DESC, o.ordered_at DESC",
  note_asc: "(coalesce(o.note, '') <> '') ASC, o.ordered_at DESC",
  office: "o.office_since ASC NULLS LAST, o.ordered_at ASC",
};

/**
 * WHERE for the list. The stage/tab part is left out for the counts next to each status,
 * the product for the product list, and "sent today" for its own count.
 */
function filters(u: URLSearchParams, withStage: boolean, skip: { product?: boolean; sent?: boolean; soon?: boolean } = {}) {
  const params: unknown[] = [];
  // Only this company's shops – the first thing in every list, count and export.
  const parts = ["s.active", `s.company_id = ${companyId()}`];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    parts.push(sql.replaceAll("?", `$${params.length}`));
  };
  const from = u.get("from");
  const to = u.get("to");
  if (isDay(from)) add("o.day >= ?", from);
  if (isDay(to)) add("o.day <= ?", to);
  // A search looks in every tab – active, finished and archived – so an order is never hidden by the tab you are in.
  // The status switches and the other filters still apply: those are chosen on purpose.
  const search = str(u.get("q"), 80);
  if (withStage) {
    const tab = search ? "" : u.get("tab");
    if (tab === "active") parts.push(ACTIVE);
    if (tab === "done") parts.push(DONE);
    const stages = String(u.get("stage") || "").split(",").filter((x) => x === "abandoned" || (STAGES as readonly string[]).includes(x));
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
  if (u.get("nek") === "1") parts.push("EXISTS (SELECT 1 FROM phone_checks pc2 WHERE pc2.company_id = s.company_id AND pc2.phone_key = right(regexp_replace(o.phone, '\\D', '', 'g'), 9) AND pc2.count > 0)");
  if (u.get("sent") === "today" && !skip.sent) parts.push(SENT_TODAY);
  if (u.get("soon") === "1" && !skip.soon) parts.push(RETURNING_SOON);
  const product = str(u.get("product"), 200);
  if (product && !skip.product) add("EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) i WHERE i->>'name' = ?)", product);
  const conf = u.get("confirmed");
  if (conf === "no") parts.push("o.confirmed_at IS NULL");
  if (conf === "ai") parts.push("o.confirmed_by = 'AI агент'");
  if (conf === "us") parts.push("o.confirmed_at IS NOT NULL AND o.confirmed_by IS DISTINCT FROM 'AI агент'");
  if (!search) parts.push(u.get("archived") === "1" ? "o.archived_at IS NOT NULL" : "o.archived_at IS NULL");
  if (search) {
    const digits = search.replace(/\D/g, "");
    params.push(`%${search.toLowerCase()}%`);
    const p = `$${params.length}`;
    // "#5060" or "№ 5060" is the number 5060.
    params.push(search.replace(/^[#№\s]+/, ""));
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
  const noSoon = filters(u, false, { soon: true });
  // The ones going back soon: the longest waiting first, unless another order was chosen.
  const order = SORTS[String(u.get("sort"))] || (u.get("soon") === "1" ? SORTS.office : SORTS.new);
  const [rows, count, facets, products, sent, abandoned, soon] = await Promise.all([
    q<any>(
      `SELECT o.id, o.shop, s.label AS shop_label, s.region, o.order_no, o.ordered_at, o.customer_name, o.phone, o.city,
              o.total, o.sub_total, o.shipping, o.discount, o.raw->>'discountCode' AS discount_code, o.currency, o.total_eur::float AS total_eur, o.paid,
              o.stage, o.cb_status, o.parcel_status, o.parcel_text, o.parcel_at, o.office_since, o.courier, o.tracking_no, o.tracking_source,
              o.canceled_at, o.cancel_reason, o.cb_shipped, o.manual_stage, o.manual_stage_at,
              o.dup_of, o.dup_state, (SELECT d.order_no FROM orders d WHERE d.id = o.dup_of) AS dup_no,
              o.delivery, o.shipping_name, o.items, o.waybill, o.edit IS NOT NULL AS edit,
              o.confirmed_at, o.confirmed_by, o.note, o.call, o.source, o.archived_at, h.n AS other_orders, h.ret AS returned_before,
              h.got AS delivered_before, h.ret_shops,
              pc.count AS nek_count, CASE WHEN pc.count > 0 THEN pc.reports END AS nek_reports
         FROM orders o JOIN shops s ON s.id = o.shop
         LEFT JOIN phone_checks pc ON pc.company_id = s.company_id AND pc.phone_key = right(regexp_replace(o.phone, '\\D', '', 'g'), 9)
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS n, count(*) FILTER (WHERE x.stage = 'returned')::int AS ret,
                  count(*) FILTER (WHERE x.stage = 'delivered')::int AS got,
                  array_remove(array_agg(DISTINCT CASE WHEN x.stage = 'returned' THEN xs.label END), NULL) AS ret_shops
             FROM orders x JOIN shops xs ON xs.id = x.shop
            WHERE o.phone <> '' AND x.id <> o.id AND xs.company_id = s.company_id AND x.stage <> 'abandoned'
              AND right(regexp_replace(x.phone, '\\D', '', 'g'), 9) = right(regexp_replace(o.phone, '\\D', '', 'g'), 9)
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
    one<any>(`SELECT count(*)::int AS n FROM orders o JOIN shops s ON s.id = o.shop WHERE ${noSoon.sql} AND ${RETURNING_SOON}`, noSoon.params),
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
    facets: { stages, refused, products, sentToday: sent?.n || 0, abandoned, soon: soon?.n || 0, soonDay: SOON_DAY },
    orders: rows.map((r) => ({
      ...r,
      id: Number(r.id),
      dup_of: r.dup_of == null ? null : Number(r.dup_of),
      total: Number(r.total),
      sub_total: Number(r.sub_total),
      shipping: Number(r.shipping),
      discount: Number(r.discount) || 0,
      waybill: r.waybill && r.waybill.number === r.tracking_no ? { price: r.waybill.price, at: r.waybill.at } : null,
      tracking_link: trackingUrl(r.courier, r.tracking_no),
      // Only digital products (PDFs): nothing to send.
      digital_only: (r.items || []).length > 0 && (r.items || []).every((i: any) => i.digital),
      // Things to pack: no digital products, no free gifts.
      items_qty: (r.items || []).filter((i: any) => !i.digital && (i.total > 0 || !/подар|gift|ajánd|darček/i.test(i.name))).reduce((n: number, i: any) => n + (Number(i.qty) || 1), 0),
      nek_reports: Array.isArray(r.nek_reports) ? r.nek_reports.slice(0, 3).map((x: any) => ({ text: String(x.text || "").slice(0, 240), date: x.date || null })) : null,
      items: (r.items || []).filter((i: any) => i.total > 0 || !/подар|gift|ajánd|darček/i.test(i.name)).map((i: any) => `${i.qty > 1 ? i.qty + " × " : ""}${i.name}${i.digital ? " (дигитален)" : ""}`),
    })),
  };
}

async function exportCsv(u: URLSearchParams) {
  const w = filters(u, true);
  const order = SORTS[String(u.get("sort"))] || SORTS.new;
  const rows = await q<any>(
    `SELECT o.order_no, s.label AS shop, o.ordered_at, o.customer_name, o.phone, o.city, o.address, coalesce(o.courier, o.delivery->>'courier') AS courier,
            o.delivery->>'type' AS dtype, o.delivery->>'officeName' AS office, o.tracking_no, o.stage, o.parcel_text, o.total, o.sub_total, o.shipping,
            o.currency, o.total_eur, o.items, o.confirmed_by, o.note
       FROM orders o JOIN shops s ON s.id = o.shop WHERE ${w.sql} ORDER BY ${order} LIMIT 5000`,
    w.params,
  );
  const cell = (v: unknown) => {
    let t = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // never a formula
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // Phones as "0888 123 456": the spaces keep Excel from turning them into numbers.
  const phone = (p: unknown) => {
    const raw = String(p || "");
    let d = raw.replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("359") && d.length === 12) d = `0${d.slice(3)}`;
    else if (raw.trim().startsWith("+")) d = `00${d}`;
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`.trim();
  };
  const dec = (n: unknown) => (n == null ? "" : Number(n).toFixed(2).replace(".", ","));
  const when = (d: any) => new Date(d).toLocaleString("bg-BG", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" г.", "");
  const STAGE_BG: Record<string, string> = { new: "Нова", prepared: "Изготвена", shipped: "Изпратена", at_office: "В офис", delivered: "Взета", returned: "Върната", canceled: "Отказана", archived: "Архивирана" };
  const head = ["№", "Магазин", "Поръчана", "Клиент", "Телефон", "Град", "Адрес", "Куриер", "Доставка", "Офис", "Товарителница", "Статус", "Куриер статус", "Продукти", "Сума продукти", "Доставка (сума)", "Общо", "Валута", "Общо EUR", "Потвърдена от", "Бележка"];
  const lines = rows.map((r) =>
    [
      r.order_no, r.shop, when(r.ordered_at), r.customer_name, phone(r.phone), r.city, r.address, r.courier,
      { office: "до офис", automat: "до автомат", address: "до адрес" }[String(r.dtype)] || "", r.office, r.tracking_no, STAGE_BG[r.stage] || r.stage, r.parcel_text,
      (r.items || []).map((i: any) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.name}`).join(", "),
      dec(r.sub_total), dec(r.shipping), dec(r.total), r.currency, dec(r.total_eur), r.confirmed_by, r.note,
    ].map(cell).join(";"),
  );
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Sofia" });
  return new Response("\ufeff" + [head.join(";"), ...lines].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="poruchki-${day}.csv"`, "cache-control": "no-store" },
  });
}

const P9 = (col: string) => `right(regexp_replace(${col}, '\\D', '', 'g'), 9)`;
const noEmail = (e: unknown) => !e || /@no\.email$/i.test(String(e));

/**
 * For „Създай поръчка“: the customer behind a phone (`phone`, the last 9 digits), or the ones whose name or
 * part of the phone matches `q` – each with the data from the last order and the earlier orders.
 */
async function customers(u: URLSearchParams) {
  const phone = str(u.get("phone"), 40).replace(/\D/g, "");
  const text = str(u.get("q"), 60);
  const digits = text.replace(/\D/g, "");
  const params: unknown[] = [companyId()];
  let match: string;
  if (phone.length >= 9) {
    params.push(phone.slice(-9));
    match = `${P9("o.phone")} = $2`;
  } else if (digits.length >= 5 && !/\p{L}/u.test(text)) {
    // "0894 217", "+359894217", "894217" – the same part of the number.
    params.push(`%${digits.replace(/^(00359|359|0)/, "")}%`);
    match = `regexp_replace(o.phone, '\\D', '', 'g') LIKE $2`;
  } else if (text.length >= 3) {
    params.push(`%${text.toLowerCase()}%`);
    match = "lower(o.customer_name) LIKE $2";
  } else return { customers: [] };
  const keys = await q<any>(
    `SELECT k FROM (
       SELECT ${P9("o.phone")} AS k, max(o.ordered_at) AS last
         FROM orders o JOIN shops s ON s.id = o.shop
        WHERE s.company_id = $1 AND o.phone <> '' AND ${match}
        GROUP BY 1
     ) t WHERE length(k) = 9 ORDER BY last DESC LIMIT 8`,
    params,
  );
  if (!keys.length) return { customers: [] };
  const rows = await q<any>(
    `SELECT o.id, o.order_no, o.ordered_at, o.stage, o.total, o.currency, o.shop, s.label AS shop_label,
            o.customer_name, o.phone, o.email, o.city, o.zip, o.address, o.address2, o.delivery, o.courier, ${P9("o.phone")} AS k
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE s.company_id = $1 AND ${P9("o.phone")} = ANY($2::text[])
      ORDER BY o.ordered_at DESC, o.id DESC
      LIMIT 400`,
    [companyId(), keys.map((x) => x.k)],
  );
  return {
    customers: keys
      .map(({ k }) => {
        const all = rows.filter((r) => r.k === k);
        if (!all.length) return null;
        // Abandoned carts are not orders, but their data is still the customer's own.
        const real = all.filter((r) => r.stage !== "abandoned");
        const src = real[0] || all[0];
        const d = src.delivery || {};
        const n = (stage: string) => real.filter((r) => r.stage === stage).length;
        return {
          key: k,
          name: src.customer_name || "",
          phone: src.phone || "",
          email: all.map((r) => r.email).find((e) => !noEmail(e)) || "",
          city: src.city || "",
          zip: src.zip || "",
          address: [src.address, src.address2].filter((x: string) => x && !/^\s*До офис/i.test(x)).join(", "),
          delivery: {
            courier: d.courier === "econt" || d.courier === "speedy" ? d.courier : src.courier === "econt" || src.courier === "speedy" ? src.courier : "",
            type: ["office", "automat", "address"].includes(d.type) ? d.type : "",
            officeId: d.officeId ? String(d.officeId) : "",
            officeName: d.officeName ? String(d.officeName) : "",
          },
          shop: src.shop,
          count: real.length,
          delivered: n("delivered"),
          returned: n("returned"),
          canceled: n("canceled"),
          orders: real.slice(0, 5).map((r) => ({
            id: Number(r.id),
            order_no: r.order_no,
            ordered_at: r.ordered_at,
            stage: r.stage,
            total: Number(r.total),
            currency: r.currency,
            shop_label: r.shop_label,
          })),
        };
      })
      .filter(Boolean),
  };
}

async function detail(id: number) {
  const o = await one<any>(
    `SELECT o.*, s.label AS shop_label, s.domain AS shop_domain, s.region FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1 AND s.company_id = $2`,
    [id, companyId()],
  );
  if (!o) throw notFound("Няма такава поръчка.");
  const raw = o.raw || {};
  const { raw: _r, ...rest } = o;
  const nek = await one<any>(
    "SELECT checked_at, count, reports, error FROM phone_checks WHERE company_id = $2 AND phone_key = right(regexp_replace($1, '\\D', '', 'g'), 9)",
    [o.phone || "", companyId()],
  );
  const events = await q<any>(
    `SELECT e.kind, e.text, e.at, coalesce(u.name, e.who) AS who FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = $1 ORDER BY e.at`,
    [id],
  );
  // „Откъде дойде“: the visit that filled in the order form (the same lead the attribution used) – the device and
  // the city by IP – and how many visits the same browser made before the order.
  const visit = await one<any>(
    `SELECT v.device, v.country, v.city, v.source, v.landing, v.page, v.pages, v.first_at, v.last_at,
            (SELECT count(*) FROM visits b WHERE v.vid <> '' AND b.shop = v.shop AND b.vid = v.vid AND b.first_at <= $3::timestamptz + interval '10 minutes')::int AS browser_visits
       FROM leads l JOIN visits v ON v.shop = l.shop AND v.sid = l.sid
      WHERE l.shop IN (SELECT id FROM shops WHERE company_id = $4)
        AND (l.id = $5
             OR ($5::bigint IS NULL AND ((l.phone <> '' AND $1 <> '' AND ${P9("l.phone")} = ${P9("$1")}) OR (l.email <> '' AND lower($2) = l.email))
                 AND l.first_at BETWEEN $3::timestamptz - interval '1 day' AND $3::timestamptz + interval '10 minutes'))
      ORDER BY l.last_at DESC LIMIT 1`,
    [o.phone || "", o.email || "", o.ordered_at, companyId(), o.lead_id ?? null],
  ).catch(() => null);
  // Held as a duplicate: the order it repeats.
  const dup = o.dup_of
    ? await one<any>(
        `SELECT d.id, d.order_no, d.ordered_at, d.stage, d.total, d.currency, d.items, s.label AS shop_label FROM orders d JOIN shops s ON s.id = d.shop WHERE d.id = $1 AND s.company_id = $2`,
        [o.dup_of, companyId()],
      )
    : null;
  // The products with what the shop knows about them (picture, SKU, weight, variant), like Middleware's panel.
  const rawItems: any[] = Array.isArray(raw.items) ? raw.items : [];
  const catalog = await q<any>("SELECT title, sku, image FROM products WHERE shop = $1", [o.shop]);
  const lines = (Array.isArray(o.items) ? o.items : []).map((it: any) => {
    const r = rawItems.find((x) => (it.sku && x?.sku === it.sku) || x?.name === it.name) || {};
    const p = catalog.find((c) => (it.sku && c.sku === it.sku) || c.title === it.name) || catalog.find((c) => it.name && String(it.name).startsWith(c.title));
    const variant = Array.isArray(r.variation) ? r.variation.map((v: any) => [v?.name, v?.value].filter(Boolean).join(": ")).filter(Boolean).join(", ") : "";
    const qty = Number(it.qty) || 1;
    return {
      name: String(it.name || ""),
      qty,
      total: Number(it.total) || 0,
      price: Math.round(((Number(it.total) || 0) / qty) * 100) / 100,
      sku: String(it.sku || r.sku || p?.sku || ""),
      image: (Array.isArray(r.images) && typeof r.images[0] === "string" ? r.images[0] : null) || p?.image || null,
      weight: Number(r.weight) > 0 ? Number(r.weight) : null,
      variant,
      url: typeof r.url === "string" ? r.url : null,
      digital: Boolean(it.digital || r.shippingRequired === false || r.type === "digital"),
    };
  });
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
    nekorekten: nek,
    visit,
    dup_of: o.dup_of == null ? null : Number(o.dup_of),
    dup: dup ? { ...dup, id: Number(dup.id), total: Number(dup.total) } : null,
    lines,
    courier_cost: o.courier_cost == null ? null : Number(o.courier_cost),
  };
}

export default handle(async (req) => {
  await requireUser(req);
  const [idStr, action] = sub(req, "/api/orders");
  const u = new URL(req.url).searchParams;
  if (req.method === "GET" && !idStr) return json(await list(u));
  // Excel (CSV with ; and a BOM, so Bulgarian Excel opens it with Cyrillic and decimal commas).
  if (req.method === "GET" && idStr === "export") return exportCsv(u);
  // „Създай поръчка“: who is this customer and what did they order before.
  if (req.method === "GET" && idStr === "customer") return json(await customers(u));
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
  // One-time import of the orders that are only in Middleware (owner only; one page of 100 per call).
  if (req.method === "POST" && idStr === "import-mw") {
    const user = await requireUser(req, ["admin"]);
    const b = await body(req);
    const stores: Record<string, string> = {};
    for (const [k, v] of Object.entries(b?.stores && typeof b.stores === "object" ? b.stores : {})) stores[str(k, 60)] = str(v, 20);
    const page = Math.max(1, Math.min(1000, Number(b?.page) || 1));
    try {
      return json(await importMwPage({ page, per: Number(b?.per) || 100, tenant: str(b?.tenant, 60), stores, dry: b?.dry !== false, by: user.name || user.email, userId: user.id }));
    } catch (e: any) {
      throw bad("import", e.message);
    }
  }
  // A new order made by hand.
  if (req.method === "POST" && !idStr) {
    const user = await requireUser(req);
    const r = await createOrder(await body(req), { source: "manual", userId: user.id, who: null, by: user.name || user.email });
    return json(r);
  }
  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  // Every action on an order: only the company's own.
  await ownOrder(one, id);
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

  if (req.method === "POST" && ["confirm", "unconfirm", "note", "contact", "archive", "unarchive", "duplicate", "not-duplicate", "ai-call", "cancel-order", "uncancel-order", "stage"].includes(action)) {
    const user = await requireUser(req);
    const b = await body(req);
    const by = user.name || user.email;
    if (action === "confirm") await confirmOrder(id, by, user.id);
    if (action === "unconfirm") await unconfirmOrder(id, user.id);
    if (action === "note") await addNote(id, str(b.text, 1000), user.id);
    if (action === "contact") await editContact(id, b, user.id);
    if (action === "archive" || action === "unarchive") await archiveOrder(id, action === "archive", user.id);
    // „✕ Откажи“ / „Върни“ (like Middleware's status „Отказана“).
    if (action === "cancel-order") await cancelOrder(id, str(b.reason, 300), user.id);
    if (action === "uncancel-order") await uncancelOrder(id, user.id);
    // A status chosen by hand (a click on the status in the list), or „auto“ – back to the courier's / shop's.
    if (action === "stage") await setStage(id, str(b.stage, 20), user.id);
    if (action === "duplicate") return json(await duplicateOrder(id, user.id, by));
    // Held as a duplicate, but it is a real second order: it goes on as new.
    if (action === "not-duplicate" && !(await releaseDuplicate(id, user.id))) throw bad("not_held", "Поръчката не е задържана като дублирана.");
    // „📞 Обади се“: the phone agent (Александра) calls this order now – or, if it cannot right now,
    // at its next run (every 5 minutes, in calling hours). See askAgentToCall in lib/agent.mts.
    if (action === "ai-call") {
      const r = await q("UPDATE orders SET call = jsonb_build_object('state', 'requested', 'at', now(), 'by', $2::text) WHERE id = $1 AND confirmed_at IS NULL RETURNING id", [id, by]);
      if (!r.length) throw bad("confirmed", "Поръчката вече е потвърдена.");
      await addEvent(id, "call", "„Обади се“ – Александра да звънне за потвърждение", {}, user.id);
      const callNow = await askAgentToCall();
      return json({ ...(await detail(id)), call_now: callNow });
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
    const site = await siteFor(o.shop);
    if (!site) throw bad("no_site", "Липсва API ключ за този магазин.");
    await upsertOrders({ id: o.shop, currency: o.currency }, [await getOrder(site, o.cb_id)], await getRates());
    await runTracking({ deadline: Date.now() + 15000, orderIds: [id], job: "track-one" });
    return json(await detail(id));
  }
  throw notFound();
});

export const config: Config = { path: ["/api/orders", "/api/orders/*"] };
