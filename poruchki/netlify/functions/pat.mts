// Път на клиента: how the orders got there (first and last visit, paid or not, the paths, by shop, when),
// and the shops' connection to Microsoft Clarity.
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { clarityStatus, connectClarity, disconnectClarity, pullShop } from "../lib/clarity.mts";
import { one } from "../lib/db.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { journeyReport } from "../lib/journey.mts";
import { inCompany } from "../lib/tenant.mts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ownShop = async (shop: string) => {
  if (!shop || !(await one(`SELECT 1 FROM shops WHERE id = $1 AND ${inCompany("id")}`, [shop]))) throw bad("shop", "Няма такъв магазин.");
};

export default handle(async (req) => {
  const [what] = sub(req, "/api/pat");
  if (!what) {
    await requireUser(req);
    if (req.method !== "GET") throw notFound();
    const u = new URL(req.url).searchParams;
    const from = str(u.get("from"), 10);
    const to = str(u.get("to"), 10);
    if (!DAY.test(from) || !DAY.test(to) || from > to) throw bad("period", "Невалиден период.");
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw bad("period", "Най-много 400 дни.");
    const shop = str(u.get("shop"), 40);
    if (shop) await ownShop(shop);
    return json(await journeyReport(from, to, shop));
  }
  if (what === "clarity") {
    if (req.method === "GET") {
      await requireUser(req);
      return json({ shops: await clarityStatus() });
    }
    // Connecting and pulling: the owner of the company.
    await requireUser(req, ["admin"]);
    const b = await body<any>(req, 8000);
    const shop = str(b.shop, 40);
    await ownShop(shop);
    if (req.method === "DELETE" || b.remove === true) {
      await disconnectClarity(shop);
      return json({ ok: true, shops: await clarityStatus() });
    }
    if (req.method !== "POST") throw notFound();
    let result: unknown;
    if (b.token !== undefined) {
      const token = str(b.token, 4000).replace(/^Bearer\s+/i, "").trim();
      if (!/^[A-Za-z0-9._\-]{20,4000}$/.test(token)) throw bad("token", "Това не прилича на ключ от Clarity (Settings → Data Export → Generate new API token).");
      result = await connectClarity(shop, token);
    } else result = await pullShop(shop);
    return json({ ok: true, result, shops: await clarityStatus() });
  }
  throw notFound();
});

export const config: Config = { path: ["/api/pat", "/api/pat/*"] };
