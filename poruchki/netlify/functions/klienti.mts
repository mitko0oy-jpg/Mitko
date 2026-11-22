// Клиенти: GET /api/klienti (list, filters, summary) and GET /api/klienti/<last 9 digits of the phone> (their orders).
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { customerOrders, listCustomers } from "../lib/customers.mts";
import { handle, json, notFound, str, sub } from "../lib/http.mts";

export default handle(async (req) => {
  await requireUser(req);
  if (req.method !== "GET") throw notFound();
  const [key] = sub(req, "/api/klienti/");
  if (key) return json(await customerOrders(key));
  const u = new URL(req.url).searchParams;
  return json(
    await listCustomers({
      q: str(u.get("q"), 80),
      seg: str(u.get("seg"), 20),
      risk: str(u.get("risk"), 10),
      sort: str(u.get("sort"), 20),
      page: Number(u.get("page")) || 1,
      per: Number(u.get("per")) || 50,
    }),
  );
});

export const config: Config = { path: ["/api/klienti", "/api/klienti/*"] };
