// Products of each shop, to add to an order: from ConvertBuilder (GET /products), plus what was
// actually sold lately (names and prices exactly as in the orders) so the list is never empty.
import { allSites, cb, PAGE, type Site } from "./cb.mts";
import { q } from "./db.mts";
import { inCompany } from "./tenant.mts";

const s = (v: unknown, max = 200) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, max));
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);

export type ProductRow = { cb_id: number; variant: string; title: string; price: number; sku: string; image: string | null; hidden: boolean };

/** One row per variant: "Крем – 3 бр.", with the sale price when the variant is on sale. */
export function productRows(p: any): ProductRow[] {
  const title = s(p?.title || p?.name);
  if (!title || !Number.isFinite(Number(p?.id))) return [];
  const img = Array.isArray(p.images) && p.images.length ? (typeof p.images[0] === "string" ? p.images[0] : p.images[0]?.url) : null;
  const variants: any[] = Array.isArray(p.variants) && p.variants.length ? p.variants : [p];
  return variants.map((v, i) => {
    const opts = Array.isArray(v?.options) ? v.options.map((o: any) => (typeof o === "string" ? o : o?.value ?? o?.name)).filter(Boolean).join(" / ") : "";
    const sale = v?.onSale && n(v?.salePrice) > 0 ? n(v.salePrice) : 0;
    const price = sale || n(v?.price) || n(v?.regularPrice) || n(p?.price);
    const variant = opts || (variants.length > 1 ? String(i + 1) : "");
    return { cb_id: Number(p.id), variant, title: opts ? `${title} – ${opts}` : title, price, sku: s(v?.sku, 60), image: img ? s(img, 500) : null, hidden: p?.hidden === true };
  });
}

export async function syncProducts(site: Site, deadline: number) {
  const rows: ProductRow[] = [];
  for (let skip = 0; skip < 2000 && Date.now() < deadline; skip += PAGE) {
    const d = await cb(site, "/products", { query: { limit: PAGE, skip } });
    const items: any[] = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
    for (const p of items) rows.push(...productRows(p));
    if (items.length < PAGE || (d?.totalCount && skip + PAGE >= d.totalCount)) break;
  }
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const vals: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      vals.push(site.id, r.cb_id, r.variant, r.title, r.price, r.sku, r.image, r.hidden);
      const b = j * 8;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, now())`;
    });
    await q(
      `INSERT INTO products (shop, cb_id, variant, title, price, sku, image, hidden, synced_at) VALUES ${tuples.join(", ")}
       ON CONFLICT (shop, cb_id, variant) DO UPDATE SET title = EXCLUDED.title, price = EXCLUDED.price, sku = EXCLUDED.sku,
         image = EXCLUDED.image, hidden = EXCLUDED.hidden, synced_at = now()`,
      vals,
    );
  }
  return rows.length;
}

/** Products once a day per shop (the shop list rarely changes). */
export async function syncAllProducts(deadline: number) {
  const done: Record<string, number | string> = {};
  const fresh = new Set((await q<any>("SELECT DISTINCT shop FROM products WHERE synced_at > now() - interval '20 hours'")).map((r) => r.shop));
  const active = new Set((await q<any>("SELECT id FROM shops WHERE active")).map((r) => r.id));
  for (const site of await allSites()) {
    if (Date.now() > deadline || fresh.has(site.id) || !active.has(site.id)) continue;
    try {
      done[site.id] = await syncProducts(site, deadline);
    } catch (e: any) {
      done[site.id] = e.message;
    }
  }
  return done;
}

/** What can be added to an order of this shop. */
export async function catalog(shop: string, query: string) {
  const like = `%${query.trim().toLowerCase()}%`;
  const [fromShop, sold] = await Promise.all([
    q<any>(
      `SELECT title AS name, price::float AS price, sku, image FROM products
        WHERE shop = $1 AND ${inCompany()} AND NOT hidden AND lower(title) LIKE $2 ORDER BY title LIMIT 60`,
      [shop, like],
    ),
    q<any>(
      `SELECT it->>'name' AS name, (mode() WITHIN GROUP (ORDER BY round((it->>'total')::numeric / greatest((it->>'qty')::numeric, 1), 2)))::float AS price,
              count(*)::int AS n
         FROM orders o CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.cb_items, o.items)) it
        WHERE o.shop = $1 AND ${inCompany("o.shop")} AND o.ordered_at > now() - interval '120 days' AND lower(it->>'name') LIKE $2
        GROUP BY 1 ORDER BY n DESC LIMIT 40`,
      [shop, like],
    ),
  ]);
  const seen = new Set<string>();
  const out: { name: string; price: number; sku?: string; image?: string | null; source: "shop" | "sold" }[] = [];
  for (const p of fromShop) if (!seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase())) out.push({ ...p, source: "shop" });
  for (const p of sold) if (p.name && !seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase())) out.push({ name: p.name, price: p.price, source: "sold" });
  return out;
}
