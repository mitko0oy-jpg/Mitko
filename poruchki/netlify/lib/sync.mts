// Pulling orders from the shops.
// Every run: the last 3 days of every shop. Then, with the time left, a deeper pass:
// the daily re-read of the last 60 days (statuses change on older orders) or the history import.
// Webhooks (order_created / order_updated) bring changes in between runs.
import { allSites, listOrders, PAGE, type Site } from "./cb.mts";
import { q, logJob } from "./db.mts";
import { companyId, withCompany, ENV_COMPANY } from "./tenant.mts";
import { getRates, refreshRates, type Rates } from "./fx.mts";
import { pullMiddleware } from "./mw.mts";
import { syncAllProducts } from "./products.mts";
import { purgeLeads } from "./leads.mts";
import { runNekChecks } from "./nekorekten.mts";
import { upsertOrders } from "./orders.mts";
import { ensureShops, shopError, type Shop } from "./shops.mts";

const DAY = 86400;
const WINDOW = 7 * DAY;

type Counts = { pages: number; inserted: number; updated: number };

/** Reads orders created in [from, to] page by page. Returns how far it got. */
async function pullRange(shop: Shop, site: Site, from: number, to: number, skip: number, deadline: number, rates: Rates, c: Counts) {
  for (;;) {
    if (Date.now() > deadline) return { done: false, skip };
    const page = await listOrders(site, from, to, skip);
    c.pages++;
    const r = await upsertOrders(shop, page.items, rates);
    c.inserted += r.inserted;
    c.updated += r.updated;
    skip += PAGE;
    if (!page.items.length || skip >= page.totalCount) return { done: true, skip };
  }
}

/** One step of a long pass, newest week first, so the dashboard fills from today backwards. */
async function deepStep(shop: Shop, site: Site, deadline: number, rates: Rates, c: Counts) {
  let b = shop.backfill;
  while (b && Date.now() < deadline) {
    const wFrom = Math.max(b.from, b.to - WINDOW + 1);
    const r = await pullRange(shop, site, wFrom, b.to, b.skip, deadline, rates, c);
    if (!r.done) {
      b = { ...b, skip: r.skip };
      break;
    }
    b = wFrom <= b.from ? null : { ...b, to: wFrom - 1, skip: 0 };
  }
  if (b) await q("UPDATE shops SET backfill = $2 WHERE id = $1", [shop.id, JSON.stringify(b)]);
  else await q("UPDATE shops SET backfill = NULL, full_sync_at = now() WHERE id = $1", [shop.id]);
  shop.backfill = b;
}

export async function runSync(opts: { deadline: number; job?: string; onlyShop?: string }) {
  const { deadline } = opts;
  const shops = (await ensureShops()).filter((s) => s.active && (!opts.onlyShop || s.id === opts.onlyShop));
  const sites = new Map((await allSites()).map((s) => [s.id, s]));
  const rates = (await refreshRates()) || (await getRates());
  const now = Math.floor(Date.now() / 1000);
  const c: Counts = { pages: 0, inserted: 0, updated: 0 };
  const errors: Record<string, string> = {};

  // 1) Recent orders of every shop.
  for (const shop of shops) {
    const site = sites.get(shop.id);
    if (!site) {
      errors[shop.id] = "няма API ключ";
      await shopError(shop.id, "Липсва API ключ за този магазин.");
      continue;
    }
    try {
      const r = await pullRange(shop, site, now - 3 * DAY, now + 60, 0, deadline, rates, c);
      if (r.done) await q("UPDATE shops SET synced_at = now(), last_error = NULL, error_at = NULL WHERE id = $1", [shop.id]);
    } catch (e: any) {
      errors[shop.id] = e.message;
      await shopError(shop.id, e.message);
    }
  }

  // 2) Deeper pass with the time left: running history imports first, then the daily 60-day re-read.
  const order = [...shops].sort((a, b) => Number(!!b.backfill) - Number(!!a.backfill) || String(a.full_sync_at || "").localeCompare(String(b.full_sync_at || "")));
  for (const shop of order) {
    if (Date.now() > deadline - 3000) break;
    const site = sites.get(shop.id);
    if (!site || errors[shop.id]) continue;
    const stale = !shop.full_sync_at || Date.now() - Date.parse(shop.full_sync_at) > 20 * 3600 * 1000;
    if (!shop.backfill && stale) shop.backfill = { from: now - 60 * DAY, to: now, skip: 0 };
    if (!shop.backfill) continue;
    try {
      await deepStep(shop, site, deadline - 2000, rates, c);
    } catch (e: any) {
      errors[shop.id] = e.message;
      await shopError(shop.id, e.message);
    }
  }

  // 3) Products of the shops, once a day (to add to orders).
  let products: Record<string, unknown> = {};
  if (!opts.onlyShop && Date.now() < deadline - 5000) products = await syncAllProducts(deadline - 3000).catch((e) => ({ error: e.message }));

  // Unfinished orders are kept 30 days.
  await purgeLeads().catch((e) => console.error("purge leads", e.message));

  const companies = [...new Set(shops.map((s) => Number(s.company_id)))];

  // 4) Middleware (company 1's), while it still makes the waybills.
  const mw =
    companies.includes(ENV_COMPANY) && Date.now() < deadline - 2000 ? await withCompany(ENV_COMPANY, () => pullMiddleware(deadline - 1000)) : { enabled: true, skipped: true };

  // 5) nekorekten.com for the new Bulgarian phones (a few per run), with each company's own key.
  const nekorekten: Record<number, unknown> = {};
  for (const company of companies) {
    if (Date.now() > deadline - 2000) break;
    nekorekten[company] = await withCompany(company, () => runNekChecks(deadline - 1000)).catch((e) => ({ error: e.message }));
  }

  const info = { ...c, shops: shops.length, errors, mw, products, nekorekten };
  await logJob(opts.job || "sync", Object.keys(errors).length === 0 && !(mw as any).error, info);
  return info;
}

/** Starts (or restarts) the import of older orders for the given months. */
export async function startHistory(months: number) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - Math.max(1, Math.min(36, months)) * 30 * DAY;
  await q("UPDATE shops SET backfill = $1 WHERE active AND company_id = $2", [JSON.stringify({ from, to: now, skip: 0 }), companyId()]);
}
