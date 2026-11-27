// Склад: какво има, колко струва по доставна цена и за колко дни стига.
// Наличността не се пише при всяка поръчка – смята се при показване:
//   последното броене + доставките след него − бракуваното след него
//   − изпратеното след него (поръчка с товарителница) + върнатите пратки след него.
// Продукт от поръчка взима от склада според връзките (stock_links): „Пакет 3+2“ → 5 гела.
import { createDecipheriv } from "node:crypto";
import { getSetting, one, q, setSetting, tx, type Q } from "./db.mts";
import { bad, env, notFound } from "./http.mts";
import { cKey, companyId, ENV_COMPANY } from "./tenant.mts";
import { SEED } from "./stock-seed.mts";

/** Over how many days the sales speed is measured. */
export const SPEED_DAYS = 30;

const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown, max = 200) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, max));
const key = (name: string) => s(name).toLowerCase();

type Calc = { received: number; written: number; out: number; back: number; sold: number; waiting: number };
const ZERO: Calc = { received: 0, written: 0, out: 0, back: 0, sold: 0, waiting: 0 };

/** What moved since each item's last count, and how fast it sells (per item id). */
async function movement(company: number, itemId: number | null = null): Promise<Map<number, Calc>> {
  const rows = await q<any>(
    `WITH it AS (
       SELECT id, counted_at FROM stock_items WHERE company_id = $1 AND ($2::bigint IS NULL OR id = $2)
     ), b AS (
       SELECT least(coalesce(min(counted_at), now()), now() - make_interval(days => $3)) AS since FROM it
     ), mv AS (
       SELECT m.item_id,
              coalesce(sum(m.qty) FILTER (WHERE m.kind = 'receipt'), 0) AS received,
              coalesce(sum(m.qty) FILTER (WHERE m.kind = 'writeoff'), 0) AS written
         FROM stock_moves m JOIN it ON it.id = m.item_id
        WHERE m.at > it.counted_at
        GROUP BY m.item_id
     ), k AS (
       SELECT it.id AS item_id, it.counted_at, lower(btrim(l.product)) AS p, l.units
         FROM it JOIN stock_links l ON l.item_id = it.id
     ), ln AS (
       SELECT lower(btrim(x->>'name')) AS p, coalesce((x->>'qty')::numeric, 1) AS qty,
              o.stage, o.ordered_at, sent.at AS sent_at, coalesce(CASE WHEN o.manual_stage = 'returned' THEN o.manual_stage_at END, o.parcel_at, sent.at) AS back_at, o.archived_at
         FROM orders o JOIN shops s ON s.id = o.shop CROSS JOIN b
         -- sent: when it got a waybill; a sent order with no waybill number here (abroad: the fulfilment
         -- company sends it) counts as sent on the day it was ordered
         CROSS JOIN LATERAL (SELECT coalesce(o.sent_at, CASE WHEN o.stage IN ('prepared', 'shipped', 'at_office', 'delivered', 'returned') THEN o.ordered_at END) AS at) sent
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) x
        WHERE s.company_id = $1 AND coalesce(x->>'digital', '') <> 'true'
          AND (o.ordered_at > b.since OR o.sent_at > b.since OR o.parcel_at > b.since OR o.manual_stage_at > b.since)
     ), used AS (
       SELECT k.item_id,
              -- left the shelf: got a waybill after the count
              coalesce(sum(ln.qty * k.units) FILTER (WHERE ln.sent_at > k.counted_at), 0) AS out,
              -- came back: a sent parcel returned after the count
              coalesce(sum(ln.qty * k.units) FILTER (WHERE ln.stage = 'returned' AND ln.sent_at IS NOT NULL AND ln.back_at > k.counted_at), 0) AS back,
              -- speed: ordered in the last days and not cancelled or returned
              coalesce(sum(ln.qty * k.units) FILTER (WHERE ln.ordered_at > now() - make_interval(days => $3) AND ln.stage NOT IN ('canceled', 'returned')), 0) AS sold,
              -- in new orders that are not sent yet
              coalesce(sum(ln.qty * k.units) FILTER (WHERE ln.stage = 'new' AND ln.sent_at IS NULL AND ln.archived_at IS NULL AND ln.ordered_at > now() - interval '30 days'), 0) AS waiting
         FROM k JOIN ln ON ln.p = k.p
        GROUP BY k.item_id
     )
     SELECT it.id::int AS id, coalesce(mv.received, 0)::float AS received, coalesce(mv.written, 0)::float AS written,
            coalesce(used.out, 0)::float AS out, coalesce(used.back, 0)::float AS back,
            coalesce(used.sold, 0)::float AS sold, coalesce(used.waiting, 0)::float AS waiting
       FROM it LEFT JOIN mv ON mv.item_id = it.id LEFT JOIN used ON used.item_id = it.id`,
    [company, itemId, SPEED_DAYS],
  );
  return new Map(rows.map((r) => [r.id, r as Calc]));
}

function shape(i: any, c: Calc, links: { product: string; units: number }[]) {
  const qty = r2(Number(i.counted_qty) + c.received - c.written - c.out + c.back);
  const perDay = c.sold / SPEED_DAYS;
  const days = perDay > 0 ? Math.max(0, Math.floor(qty / perDay)) : null;
  const status = qty <= 0 ? "out" : days == null ? (links.length ? "still" : "nolink") : days <= Math.min(7, i.min_days) ? "out" : days <= i.min_days ? "low" : "ok";
  return {
    id: Number(i.id),
    name: i.name,
    grp: i.grp,
    note: i.note,
    archived: i.archived,
    min_days: i.min_days,
    unit_cost: Number(i.unit_cost),
    counted_qty: Number(i.counted_qty),
    counted_at: i.counted_at,
    qty,
    value: r2(Math.max(qty, 0) * Number(i.unit_cost)),
    since: { received: r2(c.received), written: r2(c.written), out: r2(c.out), back: r2(c.back) },
    sold: r2(c.sold),
    perDay: r2(perDay),
    waiting: r2(c.waiting),
    days,
    status,
    links,
  };
}

async function linksOf(company: number) {
  const rows = await q<any>(
    `SELECT l.item_id::int AS item_id, l.product, l.units::float AS units
       FROM stock_links l JOIN stock_items i ON i.id = l.item_id WHERE i.company_id = $1 ORDER BY l.units, l.product`,
    [company],
  );
  const m = new Map<number, { product: string; units: number }[]>();
  for (const r of rows) {
    if (!m.has(r.item_id)) m.set(r.item_id, []);
    m.get(r.item_id)!.push({ product: r.product, units: r.units });
  }
  return m;
}

const ITEM_COLS = "id, name, grp, unit_cost, counted_qty, counted_at, min_days, position, archived, note";

/** The warehouse page: every item with its quantity, value and days left, plus sold products with no link. */
export async function overview() {
  const company = companyId();
  await seedOnce();
  const [items, calc, links, unlinked, ignored] = await Promise.all([
    q<any>(`SELECT ${ITEM_COLS} FROM stock_items WHERE company_id = $1 ORDER BY archived, grp, position, name`, [company]),
    movement(company),
    linksOf(company),
    unlinkedProducts(company),
    getSetting<string[]>(cKey("stock_ignored")),
  ]);
  const rows = items.map((i) => shape(i, calc.get(Number(i.id)) || ZERO, links.get(Number(i.id)) || []));
  const active = rows.filter((r) => !r.archived);
  const groups: Record<string, { value: number; qty: number; items: number }> = {};
  for (const r of active) {
    const g = (groups[r.grp || "Други"] ||= { value: 0, qty: 0, items: 0 });
    g.value = r2(g.value + r.value);
    g.qty = r2(g.qty + Math.max(r.qty, 0));
    g.items++;
  }
  const hide = new Set((ignored || []).map(key));
  return {
    speedDays: SPEED_DAYS,
    items: rows,
    groups,
    total: { value: r2(active.reduce((a, r) => a + r.value, 0)), items: active.length, low: active.filter((r) => r.status === "low" || r.status === "out").length },
    unlinked: unlinked.filter((u) => !hide.has(key(u.name))),
    ignored: unlinked.filter((u) => hide.has(key(u.name))).map((u) => u.name),
  };
}

/** Physical products sold lately that no warehouse item covers (so they are not counted anywhere). */
async function unlinkedProducts(company: number) {
  return q<any>(
    `SELECT max(x->>'name') AS name, count(DISTINCT o.id)::int AS orders, sum(coalesce((x->>'qty')::numeric, 1))::float AS qty,
            bool_and(s.region = 'abroad') AS abroad, string_agg(DISTINCT s.label, ', ') AS shops
       FROM orders o JOIN shops s ON s.id = o.shop
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) x
      WHERE s.company_id = $1 AND o.ordered_at > now() - make_interval(days => $2) AND o.stage <> 'canceled'
        AND coalesce(x->>'digital', '') <> 'true' AND coalesce(x->>'name', '') <> ''
        AND NOT EXISTS (SELECT 1 FROM stock_links l JOIN stock_items i ON i.id = l.item_id
                         WHERE i.company_id = $1 AND lower(btrim(l.product)) = lower(btrim(x->>'name')))
      GROUP BY lower(btrim(x->>'name'))
      ORDER BY bool_and(s.region = 'abroad'), 3 DESC
      LIMIT 150`,
    [company, SPEED_DAYS],
  );
}

/** Names of products from the orders (last 120 days), for the link picker. */
export async function productNames() {
  return q<any>(
    `SELECT max(x->>'name') AS name, count(*)::int AS n, bool_and(s.region = 'abroad') AS abroad
       FROM orders o JOIN shops s ON s.id = o.shop
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) x
      WHERE s.company_id = $1 AND o.ordered_at > now() - interval '120 days'
        AND coalesce(x->>'digital', '') <> 'true' AND coalesce(x->>'name', '') <> ''
      GROUP BY lower(btrim(x->>'name'))
      ORDER BY bool_and(s.region = 'abroad'), 2 DESC
      LIMIT 400`,
    [companyId()],
  );
}

async function ownItem(id: number) {
  const i = await one<any>(`SELECT ${ITEM_COLS} FROM stock_items WHERE id = $1 AND company_id = $2`, [id, companyId()]);
  if (!i) throw notFound("Няма такъв продукт в склада.");
  return i;
}

/** One item with its history. */
export async function itemDetail(id: number) {
  const company = companyId();
  const i = await ownItem(id);
  const [calc, links, moves] = await Promise.all([
    movement(company, id),
    linksOf(company),
    q<any>(
      `SELECT id::int AS id, kind, qty::float AS qty, unit_cost::float AS unit_cost, before::float AS before, note, who, at
         FROM stock_moves WHERE item_id = $1 ORDER BY at DESC, id DESC LIMIT 100`,
      [id],
    ),
  ]);
  return { item: shape(i, calc.get(id) || ZERO, links.get(id) || []), moves };
}

const num = (v: unknown, { min = 0, max = 1e7 } = {}) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
};

export async function createItem(b: any, who: { id: number; name: string }) {
  const name = s(b.name, 120);
  if (!name) throw bad("name", "Напиши името на продукта.");
  const qty = num(b.qty ?? 0);
  const cost = num(b.unit_cost ?? 0, { max: 1e5 });
  if (Number.isNaN(qty)) throw bad("qty", "Бройката трябва да е число.");
  if (Number.isNaN(cost)) throw bad("unit_cost", "Доставната цена трябва да е число.");
  const company = companyId();
  if (await one("SELECT 1 FROM stock_items WHERE company_id = $1 AND lower(name) = lower($2)", [company, name]))
    throw bad("exists", "Вече има продукт с това име в склада.");
  return tx(async (t) => {
    const [row] = await t<any>(
      `INSERT INTO stock_items (company_id, name, grp, unit_cost, counted_qty, counted_at, note, position)
       VALUES ($1, $2, $3, $4, $5, now(), $6, coalesce((SELECT max(position) + 1 FROM stock_items WHERE company_id = $1), 0)) RETURNING id::int AS id`,
      [company, name, s(b.grp, 60), cost, qty, s(b.note, 300)],
    );
    await t(`INSERT INTO stock_moves (item_id, kind, qty, unit_cost, note, user_id, who) VALUES ($1, 'count', $2, $3, 'Начална наличност', $4, $5)`, [row.id, qty, cost, who.id, who.name]);
    await saveLinks(t, row.id, b.links);
    return row.id as number;
  });
}

export async function updateItem(id: number, b: any) {
  await ownItem(id);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => (vals.push(v), sets.push(`${col} = $${vals.length}`));
  if (b.name !== undefined) {
    const name = s(b.name, 120);
    if (!name) throw bad("name", "Напиши името на продукта.");
    if (await one("SELECT 1 FROM stock_items WHERE company_id = $1 AND lower(name) = lower($2) AND id <> $3", [companyId(), name, id]))
      throw bad("exists", "Вече има продукт с това име в склада.");
    set("name", name);
  }
  if (b.grp !== undefined) set("grp", s(b.grp, 60));
  if (b.note !== undefined) set("note", s(b.note, 300));
  if (b.unit_cost !== undefined) {
    const c = num(b.unit_cost, { max: 1e5 });
    if (Number.isNaN(c)) throw bad("unit_cost", "Доставната цена трябва да е число.");
    set("unit_cost", c);
  }
  if (b.min_days !== undefined) {
    const d = num(b.min_days, { max: 365 });
    if (Number.isNaN(d)) throw bad("min_days", "Дните трябва да са между 0 и 365.");
    set("min_days", Math.round(d));
  }
  if (b.archived !== undefined) set("archived", Boolean(b.archived));
  if (sets.length) {
    vals.push(id);
    await q(`UPDATE stock_items SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  }
  if (b.links !== undefined) await tx((t) => saveLinks(t, id, b.links, true));
}

async function saveLinks(t: Q, id: number, links: unknown, replace = false) {
  if (!Array.isArray(links)) return;
  if (replace) await t("DELETE FROM stock_links WHERE item_id = $1", [id]);
  const seen = new Set<string>();
  for (const l of links.slice(0, 100)) {
    const product = s((l as any)?.product, 200);
    const units = num((l as any)?.units ?? 1, { min: 0.01, max: 1000 });
    if (!product || Number.isNaN(units) || seen.has(key(product))) continue;
    seen.add(key(product));
    await t(`INSERT INTO stock_links (item_id, product, units) VALUES ($1, $2, $3) ON CONFLICT (item_id, product) DO UPDATE SET units = EXCLUDED.units`, [id, product, units]);
  }
}

/** One product from the orders to an item: „Пакет 3+2“ takes 5 of this item. */
export async function addLink(b: any) {
  const id = Number(b.item_id);
  await ownItem(id);
  await tx((t) => saveLinks(t, id, [{ product: b.product, units: b.units }]));
}

export async function setIgnored(product: string, ignore: boolean) {
  const name = s(product, 200);
  if (!name) throw bad("product", "Липсва продукт.");
  const list = (await getSetting<string[]>(cKey("stock_ignored"))) || [];
  const rest = list.filter((x) => key(x) !== key(name));
  await setSetting(cKey("stock_ignored"), ignore ? [...rest, name].slice(-500) : rest);
}

/**
 * A delivery (receipt), a count (the real number on the shelf) or a write-off.
 * A delivery with a price makes the item's cost the average of what is there and what came.
 */
export async function addMove(id: number, b: any, who: { id: number; name: string }) {
  const kind = String(b.kind || "");
  if (!["receipt", "count", "writeoff"].includes(kind)) throw bad("kind", "Избери какво правиш.");
  const qty = num(b.qty);
  if (Number.isNaN(qty) || (kind !== "count" && qty <= 0)) throw bad("qty", kind === "count" ? "Напиши колко броя има." : "Напиши бройките.");
  const cost = b.unit_cost === undefined || b.unit_cost === "" || b.unit_cost === null ? null : num(b.unit_cost, { max: 1e5 });
  if (Number.isNaN(cost)) throw bad("unit_cost", "Доставната цена трябва да е число.");
  const i = await ownItem(id);
  const now = shape(i, (await movement(companyId(), id)).get(id) || ZERO, []);
  const note = s(b.note, 300);
  await tx(async (t) => {
    await t(`INSERT INTO stock_moves (item_id, kind, qty, unit_cost, before, note, user_id, who) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, kind, qty, cost, now.qty, note, who.id, who.name]);
    if (kind === "count") {
      await t(`UPDATE stock_items SET counted_qty = $2, counted_at = now()${cost != null ? ", unit_cost = $3" : ""} WHERE id = $1`, cost != null ? [id, qty, cost] : [id, qty]);
    } else if (kind === "receipt" && cost != null) {
      const have = Math.max(now.qty, 0);
      const avg = have + qty > 0 ? (have * Number(i.unit_cost) + qty * cost) / (have + qty) : cost;
      await t(`UPDATE stock_items SET unit_cost = $2 WHERE id = $1`, [id, Math.round(avg * 10000) / 10000]);
    }
  });
}

/** CSV for Excel (and for the accountant): what is in the warehouse today and what it is worth. */
export async function exportCsv() {
  const d = await overview();
  const cell = (v: unknown) => {
    const t = String(v ?? "");
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const dec = (n: number, p = 2) => n.toFixed(p).replace(".", ",");
  const lines = [["Група", "Продукт", "Наличност", "Доставна цена", "Стойност", `Продадени за ${d.speedDays} дни`, "На ден", "Стигат за (дни)", "Бележка"].join(";")];
  for (const r of d.items.filter((x) => !x.archived))
    lines.push([r.grp, r.name, dec(r.qty, 0), dec(r.unit_cost, 2), dec(r.value), dec(r.sold, 0), dec(r.perDay, 1), r.days ?? "", r.note].map(cell).join(";"));
  lines.push(["", "Общо", "", "", dec(d.total.value), "", "", "", ""].join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ---- the first stock list, loaded once ----
// The starting quantities and costs are not public, so the list lives in stock-seed.mts encrypted
// (AES-256-GCM); the key is STOCK_SEED_KEY in the Netlify env. Loaded once for company 1, on the
// first visit of the warehouse page.

export function openSeed(sealed: string, keyB64: string): any {
  const [v, iv, tag, data] = String(sealed).split(".");
  if (v !== "v1") throw new Error("unknown seed format");
  const k = Buffer.from(keyB64, "base64url");
  if (k.length !== 32) throw new Error("bad seed key");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8"));
}

async function seedOnce() {
  if (companyId() !== ENV_COMPANY || !SEED) return;
  const k = env("STOCK_SEED_KEY");
  if (!k || (await getSetting(cKey("stock_seed")))) return;
  let data: any;
  try {
    data = openSeed(SEED, k);
  } catch (e: any) {
    console.error("stock seed:", e.message);
    return;
  }
  await tx(async (t) => {
    // Only the first request does it.
    const got = await t(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key`, [
      cKey("stock_seed"),
      JSON.stringify({ at: new Date().toISOString(), items: data.items?.length || 0 }),
    ]);
    if (!got.length) return;
    let pos = 0;
    for (const it of data.items || []) {
      const [row] = await t<any>(
        `INSERT INTO stock_items (company_id, name, grp, unit_cost, counted_qty, counted_at, note, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (company_id, name) DO NOTHING RETURNING id::int AS id`,
        [ENV_COMPANY, s(it.name, 120), s(it.grp, 60), Number(it.cost) || 0, Number(it.qty) || 0, data.countedAt, s(it.note, 300), pos++],
      );
      if (!row) continue;
      await t(`INSERT INTO stock_moves (item_id, kind, qty, unit_cost, note, who, at) VALUES ($1, 'count', $2, $3, $4, 'Начални наличности', $5)`, [
        row.id,
        Number(it.qty) || 0,
        Number(it.cost) || 0,
        s(it.note, 300),
        data.countedAt,
      ]);
      await saveLinks(t, row.id, it.links);
    }
    if (Array.isArray(data.ignore)) await t(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [cKey("stock_ignored"), JSON.stringify(data.ignore)]);
  });
}
