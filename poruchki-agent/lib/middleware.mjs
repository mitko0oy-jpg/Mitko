// Middleware (api.middleware.bg) – read-only public API.
// Used to (1) skip calls for orders the team already confirmed or shipped,
// and (2) tell callers the real courier status of their parcel.
// The shop's order number is `label` in Middleware; `external_id` is ConvertBuilder's API id.
// Env: MW_TOKEN, MW_TENANT, MW_STORES = {"bg":"<Middleware store id>"}

const BASE = "https://api.middleware.bg/v1";

export const MW_STATUS_BG = {
  pending: "приета е и още не е изпратена",
  shipped: "изпратена е",
  completed: "доставена е",
  returned: "върната е",
  cancelled: "отказана е",
  redirected: "пренасочена е",
  abounded: "не е завършена",
};

export function middleware({ env, fetchImpl = fetch }) {
  const token = env("MW_TOKEN");
  const tenant = env("MW_TENANT");
  const stores = JSON.parse(env("MW_STORES") || "{}");
  const enabled = Boolean(token && tenant);

  async function get(path) {
    const res = await fetchImpl(BASE + path, {
      headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenant, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Middleware ${path.split("?")[0]}: HTTP ${res.status}`);
    return res.json();
  }

  /** The Middleware order for a shop order number, or null. */
  async function lookup(site, orderNo) {
    const storeId = stores[site];
    if (!enabled || !storeId || orderNo == null) return null;
    const q = new URLSearchParams({
      "filter[store_id]": storeId,
      "filter[label]": String(orderNo),
      include: "fulfillment",
      per_page: "1",
    });
    const d = await get(`/orders?${q}`);
    const o = (d.data || [])[0];
    if (!o) return null;
    const f = o.fulfillment || {};
    return {
      id: o.id,
      confirmed: o.is_confirmed === "yes",
      status: o.status_key,
      statusText: MW_STATUS_BG[o.status_key] || o.status_key,
      carrier: f.shipping?.name || "",
      waybillStatus: f.waybill_status_label || "",
      trackingUrl: f.tracking_url || "",
    };
  }

  return {
    enabled,
    lookup,
    /** False when the team already confirmed the order in Middleware or it is no longer waiting. */
    async stillOpen(rec) {
      try {
        const o = await lookup(rec.site, rec.orderNo);
        if (!o) return true; // not synced yet – ConvertBuilder decides
        return !o.confirmed && o.status === "pending";
      } catch (err) {
        console.error("middleware check failed", err.message);
        return true; // never block calls because Middleware is down
      }
    },
  };
}
