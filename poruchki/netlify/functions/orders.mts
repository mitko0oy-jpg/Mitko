import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { body } from "../lib/http.mts";
import { cbSite, getOrder } from "../lib/cb.mts";
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
  parcel_asc: "o.parcel_at ASC NULLS LAST, o.ordered_at DESC",
  stage_asc: "array_position(ARRAY['new','prepared','shipped','at_office','delivered','returned','canceled','archived'], o.stage) ASC, o.ordered_at DESC",
  stage_desc: "array_position(ARRAY['new','prepared','shipped','at_office','delivered','returned','canceled','archived'], o.stage) DESC, o.ordered_at DESC",
  shop_asc: "s.label ASC, o.ordered_at DESC",
  shop_desc: "s.label DESC, o.ordered_at DESC",
  cour_asc: "coalesce(o.courier, o.delivery->>'courier', 'я') ASC, o.ordered_at DESC",
  cour_desc: "coalesce(o.courier, o.delivery->>'courier', '') DESC, o.ordered_at DESC",
  note_desc: "(coalesce(o.note, '') <> '') DESC, o.ordered_at DESC",
  note_asc: "(coalesce(o.note, '') <> '') ASC, o.ordered_at DESC",
};

/**
 * WHERE for the list. The stage/tab part is left out for the counts next to each status,
 * the product for the product list, and "sent today" for its own count.
 */
function filters(u: URLSearchParams, withStage: boolean, skip: { product?: boolean; sent?: boolean } = {}) {
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
  if (u.get("nek") === "1") parts.push("EXISTS (SELECT 1 FROM phone_checks pc2 WHERE pc2.company_id = s.company_id AND pc2.phone_key = right(regexp_replace(o.phone, '\D', '', 'g'), 9) AND pc2.count > 0)");
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
              o.confirmed_at, o.confirmed_by, o.note, o.call, o.source, o.archived_at, h.n AS other_orders, h.ret AS returned_before,
              pc.count AS nek_count, CASE WHEN pc.count > 0 THEN pc.reports END AS nek_reports
         FROM orders o JOIN shops s ON s.id = o.shop
         LEFT JOIN phone_checks pc ON pc.company_id = s.company_id AND pc.phone_key = right(regexp_replace(o.phone, '\D', '', 'g'), 9)
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS n, count(*) FILTER (WHERE x.stage = 'returned')::int AS ret
             FROM orders x
            WHERE o.phone <> '' AND x.id <> o.id AND x.shop IN (SELECT id FROM shops WHERE company_id = s.company_id)
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
      items_qty: (r.items || []).filter((i: any) => i.total > 0 || !/подар|gift|ajánd|darček/i.test(i.name)).reduce((n: number, i: any) => n + (Number(i.qty) || 1), 0),
      nek_reports: Array.isArray(r.nek_reports) ? r.nek_reports.slice(0, 3).map((x: any) => ({ text: String(x.text || "").slice(0, 240), date: x.date || null })) : null,
      items: (r.items || []).filter((i: any) => i.total > 0 || !/подар|gift|ajánd|darček/i.test(i.name)).map((i: any) => `${i.qty > 1 ? i.qty + " × " : ""}${i.name}`),
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
  };
}

export default handle(async (req) => {
  await requireUser(req);
  const [idStr, action] = sub(req, "/api/orders");
  const u = new URL(req.url).searchParams;
  if (req.method === "GET" && !idStr) return json(await list(u));
  // Excel (CSV with ; and a BOM, so Bulgarian Excel opens it with Cyrillic and decimal commas).
  if (req.method === "GET" && idStr === "export") return exportCsv(u);
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
