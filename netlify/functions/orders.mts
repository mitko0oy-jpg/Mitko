import type { Config } from "@netlify/functions";
import { PACKAGES, SHIPPING, shipPrice } from "../../public/assets/shop-catalog.js";
import { requireUser } from "../lib/auth.mts";
import { event, hit, one, q } from "../lib/db.mts";
import { bad, body, clientIp, handle, json, notFound, str, sub, tooMany } from "../lib/http.mts";

const STATUSES = ["new", "confirmed", "sent", "done", "canceled"];

// "+359 893 42 52 92", "0893-425-292" -> "0893425292"; null when it is not a Bulgarian number.
function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s\-().\/]/g, "");
  if (p.startsWith("00359")) p = "0" + p.slice(5);
  else if (p.startsWith("+359")) p = "0" + p.slice(4);
  else if (p.startsWith("359") && p.length === 12) p = "0" + p.slice(3);
  return /^0\d{8,9}$/.test(p) ? p : null;
}

// Shop orders: anyone can place one (cash on delivery); only admins can list and update them.
export default handle(async (req, ctx) => {
  const parts = sub(req, "/api/orders");

  if (req.method === "POST" && parts.length === 0) {
    const b = await body(req, 8_000);
    // Hidden field that people never see: a filled one means a bot. Answer as if it worked.
    if (str(b.company, 100)) return json({ ok: true, id: null });

    const pkg = (PACKAGES as Record<string, { price: number; freeShip?: boolean }>)[str(b.package, 20)];
    const ship = (SHIPPING as Record<string, { price: number; place: string }>)[str(b.shipping, 20)];
    if (!pkg) throw bad("package", "Избери комплект.");
    if (!ship) throw bad("shipping", "Избери начин на доставка.");
    const name = str(b.name, 80).replace(/\s+/g, " ");
    const phone = normalizePhone(str(b.phone, 30));
    const city = str(b.city, 60);
    const place = str(b.place, 160);
    if (name.length < 3) throw bad("name", "Напиши име и фамилия.");
    if (!phone) throw bad("phone", "Провери телефона – например 0888 123 456.");
    if (city.length < 2) throw bad("city", "Напиши населеното място.");
    if (place.length < 3) throw bad("place", ship.place === "office" ? "Напиши кой офис на куриера." : "Напиши адреса за доставка.");

    const shipCost = shipPrice(pkg, ship);

    if (!(await hit(`order:${clientIp(req, ctx)}`, 6, 3600))) throw tooMany();
    const row = await one<{ id: number }>(
      `INSERT INTO orders (package, shipping, name, phone, city, place, note, price, ship_price, total, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [str(b.package, 20), str(b.shipping, 20), name, phone, city, place, str(b.note, 500), pkg.price, shipCost, pkg.price + shipCost, str(b.source, 60)],
    );
    await event("order", { package: str(b.package, 20), shipping: str(b.shipping, 20) });
    return json({ ok: true, id: Number(row!.id), total: pkg.price + shipCost });
  }

  await requireUser(req, ["admin"]);

  if (req.method === "GET" && parts.length === 0) {
    const status = new URL(req.url).searchParams.get("status") || "";
    const rows = STATUSES.includes(status)
      ? await q("SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT 500", [status])
      : await q("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500");
    const counts = await q("SELECT status, count(*)::int AS n FROM orders GROUP BY status");
    return json({ orders: rows, counts: Object.fromEntries(counts.map((c: any) => [c.status, c.n])) });
  }

  if (req.method === "POST" && parts.length === 1) {
    const b = await body(req);
    if (!STATUSES.includes(b.status)) throw bad("status", "Непознат статус.");
    const r = await q("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING id", [Number(parts[0]), b.status]);
    if (!r.length) throw notFound();
    return json({ ok: true });
  }

  throw notFound();
});

export const config: Config = { path: ["/api/orders", "/api/orders/*"] };
