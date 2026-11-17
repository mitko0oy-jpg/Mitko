// Middleware (api.middleware.bg) – read-only, only while both systems run side by side.
// Gives us the waybill number and Middleware's own status for orders whose waybill was made there.
// The shop's order number is `label` in Middleware.
// Env: MW_TOKEN, MW_TENANT, MW_STORES = {"bg": "<Middleware store id>", ...}
import { getSetting, q, setSetting } from "./db.mts";
import { cKey, companyId, hasCompany, ENV_COMPANY } from "./tenant.mts";
import { env } from "./http.mts";
import { courierOf } from "./cb.mts";

const BASE = "https://api.middleware.bg/v1";
const PER_PAGE = 100;

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setMwFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}

export function mwConfig() {
  let stores: Record<string, string> = {};
  try {
    stores = JSON.parse(env("MW_STORES") || "{}");
  } catch {
    stores = {};
  }
  const token = env("MW_TOKEN") || "";
  const tenant = env("MW_TENANT") || "";
  // Middleware is Mitko's: only company 1 reads from it.
  const mine = !hasCompany() || companyId() === ENV_COMPANY;
  return { enabled: mine && Boolean(token && tenant && Object.keys(stores).length), token, tenant, stores };
}

export type MwOrder = { label: string; status: string; trackingNo: string | null; courier: string | null; trackingUrl: string | null; updatedAt: number | null };

export function mapMwOrder(o: any): MwOrder {
  const f = o?.fulfillment || {};
  const carrierName = String(f.shipping?.name || f.courier || o?.courier || "");
  const trackingNo = String(o?.tracking_number || f.tracking_number || f.waybill_number || "").trim() || null;
  const t = Date.parse(String(o?.updated_at || ""));
  return {
    label: String(o?.label ?? "").trim(),
    status: String(o?.status_key || o?.status || "").toLowerCase(),
    trackingNo,
    courier: trackingNo ? courierOf(carrierName) || carrierName.toLowerCase() || null : null,
    trackingUrl: String(f.tracking_url || "").trim() || null,
    updatedAt: Number.isFinite(t) ? t : null,
  };
}

async function page(cfg: ReturnType<typeof mwConfig>, storeId: string, n: number) {
  const qs = new URLSearchParams({ "filter[store_id]": storeId, include: "fulfillment", sort: "-updated_at", per_page: String(PER_PAGE), page: String(n) });
  const res = await fetchImpl(`${BASE}/orders?${qs}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, "X-Tenant-Id": cfg.tenant, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Middleware: HTTP ${res.status}`);
  return res.json();
}

const UPDATE = `
UPDATE orders SET
  mw_status = $3,
  parcel_status = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL OR $4::text = tracking_no THEN parcel_status ELSE NULL END,
  parcel_text   = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL OR $4::text = tracking_no THEN parcel_text ELSE NULL END,
  parcel_at     = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL OR $4::text = tracking_no THEN parcel_at ELSE NULL END,
  parcel_final  = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL OR $4::text = tracking_no THEN parcel_final ELSE false END,
  parcel_events = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL OR $4::text = tracking_no THEN parcel_events ELSE '[]'::jsonb END,
  tracked_at    = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL OR $4::text = tracking_no THEN tracked_at ELSE NULL END,
  courier       = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL THEN courier ELSE $5 END,
  tracking_url  = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL THEN tracking_url ELSE $6 END,
  tracking_source = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL THEN tracking_source ELSE 'middleware' END,
  tracking_no   = CASE WHEN tracking_source IN ('own', 'cb') OR $4::text IS NULL THEN tracking_no ELSE $4 END
WHERE shop = $1 AND order_no = $2`;

export async function applyMw(shopId: string, list: MwOrder[]): Promise<number> {
  let n = 0;
  for (const o of list) {
    if (!o.label) continue;
    const r = await q(UPDATE + " RETURNING id", [shopId, o.label, o.status || null, o.trackingNo, o.courier, o.trackingUrl]);
    n += r.length;
  }
  return n;
}

/** Orders changed in Middleware since the last run (first run: last 60 days). */
export async function pullMiddleware(deadline: number): Promise<{ enabled: boolean; seen: number; matched: number; error?: string }> {
  const cfg = mwConfig();
  if (!cfg.enabled) return { enabled: false, seen: 0, matched: 0 };
  const started = Date.now();
  const cursor = (await getSetting<{ since: number }>(cKey("mw_cursor")))?.since || started - 60 * 86400000;
  let seen = 0;
  let matched = 0;
  let complete = true;
  try {
    for (const [shopId, storeId] of Object.entries(cfg.stores)) {
      for (let n = 1; n <= 40; n++) {
        if (Date.now() > deadline) {
          complete = false;
          break;
        }
        const d = await page(cfg, String(storeId), n);
        const rows: any[] = Array.isArray(d?.data) ? d.data : [];
        const mapped = rows.map(mapMwOrder);
        const fresh = mapped.filter((o) => o.updatedAt == null || o.updatedAt >= cursor);
        seen += fresh.length;
        matched += await applyMw(shopId, fresh);
        const last = Number(d?.meta?.last_page) || 0;
        if (fresh.length < mapped.length || rows.length < PER_PAGE || (last && n >= last)) break;
      }
    }
  } catch (e: any) {
    return { enabled: true, seen, matched, error: e.message };
  }
  // Only move the cursor when every store was read to the end.
  if (complete) await setSetting(cKey("mw_cursor"), { since: started - 5 * 60000 });
  return { enabled: true, seen, matched };
}
