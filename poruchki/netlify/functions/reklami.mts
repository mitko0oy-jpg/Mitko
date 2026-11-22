// Реклами: where the orders came from (channel, campaign, ad set, ad, landing page) and how many were really taken.
import type { Config } from "@netlify/functions";
import { report } from "../lib/attribution.mts";
import { requireUser } from "../lib/auth.mts";
import { bad, handle, json, notFound, str } from "../lib/http.mts";
import { inCompany } from "../lib/tenant.mts";
import { one } from "../lib/db.mts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default handle(async (req) => {
  await requireUser(req);
  if (req.method !== "GET") throw notFound();
  const u = new URL(req.url).searchParams;
  const from = str(u.get("from"), 10);
  const to = str(u.get("to"), 10);
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw bad("period", "Невалиден период.");
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw bad("period", "Най-много 400 дни.");
  const shop = str(u.get("shop"), 40);
  if (shop && !(await one(`SELECT 1 FROM shops WHERE id = $1 AND ${inCompany("id")}`, [shop]))) throw bad("shop", "Няма такъв магазин.");
  return json(await report(from, to, shop));
});

export const config: Config = { path: "/api/reklami" };
