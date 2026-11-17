import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { cbSite } from "../lib/cb.mts";
import { getSetting, one, setSetting } from "../lib/db.mts";
import { cKey, companyId } from "../lib/tenant.mts";
import { handle, json, notFound, str } from "../lib/http.mts";
import { catalog, syncProducts } from "../lib/products.mts";

// GET /api/products?shop=bg&q=крем – what can be added to an order of this shop.
export default handle(async (req) => {
  await requireUser(req);
  if (req.method !== "GET") throw notFound();
  const u = new URL(req.url).searchParams;
  const shop = str(u.get("shop"), 20);
  if (!shop) return json({ products: [] });
  // Only the company's own shops.
  if (!(await one("SELECT 1 FROM shops WHERE id = $1 AND company_id = $2", [shop, companyId()]))) return json({ products: [] });
  // First time for this shop: fetch its products now (then once a day with the regular sync).
  const have = await one<any>("SELECT 1 FROM products WHERE shop = $1 LIMIT 1", [shop]);
  const tried = await getSetting<Record<string, number>>(cKey("products_tried"));
  const site = cbSite(shop);
  if (!have && site && (!tried?.[shop] || Date.now() - tried[shop] > 3600000)) {
    await setSetting(cKey("products_tried"), { ...(tried || {}), [shop]: Date.now() });
    await syncProducts(site, Date.now() + 15000).catch((e) => console.error("products", shop, e.message));
  }
  return json({ products: await catalog(shop, str(u.get("q"), 60)) });
});

export const config: Config = { path: "/api/products" };
