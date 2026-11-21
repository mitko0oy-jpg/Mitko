// „Чекаут настройки“ (като в Middleware) – падащото меню с офисите на Еконт и Спиди в касата на магазина.
//   GET  /api/kasa/:shop            – публично: настройките за скрипта /k.js (от сайта на магазина)
//   GET  /api/kasa/:shop/settings   – настройките, линкът за връзка и кога скриптът е видян (вход)
//   POST /api/kasa/:shop/settings   – запис (собственикът на фирмата)
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { one } from "../lib/db.mts";
import { bad, body, handle, json, notFound, sub } from "../lib/http.mts";
import { cleanSettings, kasaSeen, kasaSettings, markSeen, publicKasa, saveKasa } from "../lib/kasa.mts";
import { companyId } from "../lib/tenant.mts";

const host = (u: string | null) => {
  try {
    return u ? new URL(u).host.toLowerCase().replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

export default handle(async (req) => {
  const [shopId, action] = sub(req, "/api/kasa/");
  if (!shopId || !/^[a-z0-9-]{1,40}$/i.test(shopId)) throw notFound();

  if (!action) {
    // Публично: само за скрипта на сайта на магазина (нищо тайно в отговора).
    if (req.method !== "GET") throw notFound();
    const shop = await one<any>("SELECT id, domain, active FROM shops WHERE id = $1", [shopId]);
    if (!shop) throw notFound();
    const origin = req.headers.get("origin");
    const fromShop = host(origin) && host(origin) === String(shop.domain).toLowerCase().replace(/^www\./, "");
    if (fromShop) await markSeen(shop.id, new URL(req.url).searchParams.get("p") || "").catch(() => null);
    const s = await kasaSettings(shop.id);
    return json(shop.active ? publicKasa(s) : { active: false, couriers: [], note: "" }, 200, {
      "access-control-allow-origin": origin || "*",
      vary: "origin",
      "cache-control": "public, max-age=60",
    });
  }

  if (action !== "settings") throw notFound();
  const user = await requireUser(req);
  const shop = await one<any>("SELECT id, label, domain FROM shops WHERE id = $1 AND company_id = $2", [shopId, companyId()]);
  if (!shop) throw notFound("Няма такъв магазин.");
  const reply = async () => ({
    shop: { id: shop.id, label: shop.label, domain: shop.domain },
    settings: await kasaSettings(shop.id),
    seen: await kasaSeen(shop.id),
  });
  if (req.method === "GET") return json(await reply());
  if (req.method !== "POST") throw notFound();
  if (user.role !== "admin") throw bad("admin", "Само собственикът на фирмата променя чекаута.");
  await saveKasa(shop.id, cleanSettings(await body(req)));
  return json(await reply());
});

export const config: Config = { path: "/api/kasa/*" };
