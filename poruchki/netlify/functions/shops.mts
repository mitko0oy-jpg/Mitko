// Shops of the company (Магазини), like Middleware: list, add a ConvertBuilder shop with its API key,
// change it, switch it off, pull its orders now.
//   GET  /api/shops            – list
//   POST /api/shops            – add { label, domain, key, region?, currency? }
//   POST /api/shops/:id        – change { label?, region?, currency?, active?, key?, note? }
//   POST /api/shops/:id/sync   – pull the last days now
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { cb, cbSite, type Site } from "../lib/cb.mts";
import { one, q } from "../lib/db.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { seal } from "../lib/secret.mts";
import { ensureShops } from "../lib/shops.mts";
import { runSync } from "../lib/sync.mts";
import { courierInfo } from "../lib/track.mts";
import { companyId } from "../lib/tenant.mts";

const cleanDomain = (d: unknown) =>
  String(d ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;
const LOCAL = /^(localhost|127\.0\.0\.1):\d+$/; // the test shop

async function list() {
  const shops = await ensureShops();
  const counts = await q<any>(
    "SELECT o.shop, count(*)::int AS n, max(o.ordered_at) AS last FROM orders o JOIN shops s ON s.id = o.shop WHERE s.company_id = $1 GROUP BY o.shop",
    [companyId()],
  );
  const by = new Map(counts.map((c) => [c.shop, c]));
  const couriers = await courierInfo();
  const connected = Object.entries(couriers)
    .filter(([, c]) => c.configured)
    .map(([id]) => id);
  return shops.map((s: any) => ({
    id: s.id,
    label: s.label,
    domain: s.domain,
    platform: s.platform || "convertbuilder",
    active: s.active,
    region: s.region,
    currency: s.currency,
    note: s.note || "",
    createdAt: s.created_at,
    syncedAt: s.synced_at,
    error: s.last_error,
    hook: Boolean(s.hook_id),
    source: cbSite(s.id) ? "netlify" : s.api_key_sealed ? "app" : "none",
    orders: by.get(s.id)?.n || 0,
    lastOrder: by.get(s.id)?.last || null,
    couriers: connected,
  }));
}

/** The key works: ConvertBuilder answers with its orders. */
async function checkKey(domain: string, key: string) {
  const site: Site = { id: "check", label: "", domain, key };
  try {
    await cb(site, "/orders", { query: { limit: 1 }, timeoutMs: 12000 });
  } catch (e: any) {
    throw bad("key", `ConvertBuilder не прие ключа за ${domain}: ${e.message}. Ключът е в сайта → Website Settings → Applications → API Key.`);
  }
}

async function newId(domain: string) {
  const base = (domain.replace(/^www\./, "").split(".")[0] || "shop").replace(/[^a-z0-9]/g, "").slice(0, 12) || "shop";
  const pre = companyId() === 1 ? base : `c${companyId()}-${base}`.slice(0, 17);
  for (let i = 1; i < 50; i++) {
    const id = i === 1 ? pre : `${pre}-${i}`;
    if (!(await one("SELECT 1 FROM shops WHERE id = $1", [id]))) return id;
  }
  throw bad("id", "Не успях да дам име на магазина. Опитай пак.");
}

async function ownShop(id: string) {
  const s = await one<any>("SELECT * FROM shops WHERE id = $1 AND company_id = $2", [id, companyId()]);
  if (!s) throw notFound("Няма такъв магазин.");
  return s;
}

export default handle(async (req) => {
  const user = await requireUser(req);
  const [id, action] = sub(req, "/api/shops/");
  if (req.method === "GET" && !id) return json({ shops: await list() });
  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  if (id && action === "sync") {
    await ownShop(id);
    const r = await runSync({ deadline: Date.now() + 20000, job: "sync-manual", onlyShop: id });
    return json({ result: r, shops: await list() });
  }
  if (user.role !== "admin") throw bad("admin", "Само собственикът на фирмата добавя и променя магазини.");

  if (!id) {
    const label = str(b.label, 80);
    const domain = cleanDomain(b.domain);
    const key = typeof b.key === "string" ? b.key.trim() : "";
    if (label.length < 2) throw bad("label", "Напиши името на магазина.");
    if (!DOMAIN.test(domain) && !LOCAL.test(domain)) throw bad("domain", "Напиши адреса на сайта, напр. mojmagazin.bg.");
    if (key.length < 8 || key.length > 300) throw bad("key", "Постави API ключа от ConvertBuilder.");
    if (await one("SELECT 1 FROM shops WHERE lower(domain) = $1", [domain])) throw bad("taken", "Този сайт вече е добавен.");
    await checkKey(domain, key);
    const region = b.region === "abroad" ? "abroad" : "bg";
    const currency = /^[A-Z]{3}$/.test(str(b.currency, 3).toUpperCase()) ? str(b.currency, 3).toUpperCase() : "EUR";
    const shopId = await newId(domain);
    const pos = await one<any>("SELECT coalesce(max(position), 0) + 1 AS p FROM shops WHERE company_id = $1", [companyId()]);
    await q(
      `INSERT INTO shops (id, label, domain, region, currency, position, company_id, api_key_sealed, platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'convertbuilder')`,
      [shopId, label, domain, region, currency, pos?.p || 1, companyId(), seal(key)],
    );
    // The first orders right away (older ones: Настройки → история).
    await runSync({ deadline: Date.now() + 15000, job: "sync-manual", onlyShop: shopId }).catch(() => null);
    return json({ id: shopId, shops: await list() });
  }

  const s = await ownShop(id);
  if (b.key !== undefined) {
    if (cbSite(id)) throw bad("netlify", "Ключът на този магазин е в настройките на Netlify.");
    const key = typeof b.key === "string" ? b.key.trim() : "";
    if (key.length < 8) throw bad("key", "Постави API ключа от ConvertBuilder.");
    await checkKey(s.domain, key);
    await q("UPDATE shops SET api_key_sealed = $2, last_error = NULL WHERE id = $1", [id, seal(key)]);
  }
  if (b.region !== undefined && !["bg", "abroad"].includes(b.region)) throw bad("region", "Невалиден пазар.");
  const currency = b.currency !== undefined ? str(b.currency, 3).toUpperCase() : null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw bad("currency", "Валутата е три букви, напр. EUR.");
  const label = b.label !== undefined ? str(b.label, 80) : null;
  if (label !== null && label.length < 2) throw bad("label", "Напиши името на магазина.");
  await q(
    `UPDATE shops SET label = COALESCE($2, label), region = COALESCE($3, region), currency = COALESCE($4, currency),
            active = COALESCE($5, active), note = COALESCE($6, note) WHERE id = $1`,
    [id, label, b.region ?? null, currency, typeof b.active === "boolean" ? b.active : null, b.note !== undefined ? str(b.note, 300) : null],
  );
  return json({ shops: await list() });
});

export const config: Config = { path: ["/api/shops", "/api/shops/*"] };
