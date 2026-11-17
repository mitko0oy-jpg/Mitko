import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { daysBetween, isDay } from "../lib/dates.mts";
import { bad, handle, json, notFound, str, sub } from "../lib/http.mts";
import { dashboard, summary } from "../lib/stats.mts";

export default handle(async (req) => {
  await requireUser(req);
  if (req.method !== "GET") throw notFound();
  const [what] = sub(req, "/api/stats");
  const u = new URL(req.url).searchParams;
  const region = (["bg", "abroad"].includes(u.get("region") || "") ? u.get("region") : "") as "bg" | "abroad" | "";

  if (what === "summary") return json(await summary(region));

  const from = u.get("from") || "";
  const to = u.get("to") || "";
  if (!isDay(from) || !isDay(to) || from > to) throw bad("period", "Избери период.");
  if (daysBetween(from, to) > 400) throw bad("period", "Периодът е твърде дълъг (до 400 дни).");
  return json(await dashboard({ from, to, region, shop: str(u.get("shop"), 20) }));
});

export const config: Config = { path: ["/api/stats", "/api/stats/*"] };
