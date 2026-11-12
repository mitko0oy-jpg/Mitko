// ConvertBuilder shop API (docs: https://websitebuilder.app-sources.com).
// Base: https://<shop domain>/api/site, header "Authorization: Bearer <key>".
// CB_SITES env var: JSON [{ "id": "bg", "label": "BeeVenom BG", "domain": "beevenombg.eu", "key": "…" }]

const PAGE = 50;

export function convertBuilder({ sites, env, fetchImpl = fetch }) {
  const all = JSON.parse(env("CB_SITES") || "[]");
  const active = all.filter((s) => sites.includes(s.id));

  async function cb(site, path, query) {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    const res = await fetchImpl(`https://${site.domain}/api/site${path}${qs}`, {
      headers: { Authorization: `Bearer ${site.key}`, "User-Agent": "MitkoCallAgent/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`${site.domain} ${path}: HTTP ${res.status}`);
    return res.json();
  }

  return {
    /** Pending orders created since `since` (ISO), normalised. */
    async fetchNewOrders({ since }) {
      const out = [];
      for (const site of active) {
        const q = { created_at_min: Math.floor(new Date(since).getTime() / 1000), created_at_max: Math.floor(Date.now() / 1000) + 60, limit: PAGE };
        let skip = 0;
        for (;;) {
          const page = await cb(site, "/orders", { ...q, skip });
          for (const o of page.items || []) if (o.status === "pending") out.push(normalizeOrder(site, o));
          skip += PAGE;
          if (skip >= (page.totalCount || 0) || !(page.items || []).length) break;
        }
      }
      return out;
    },
    /** False when Mitko already shipped, cancelled or archived the order. */
    async isStillPending(rec) {
      const site = active.find((s) => s.id === rec.site);
      if (!site || !rec.apiId) return true;
      const o = await cb(site, `/orders/${rec.apiId}`);
      return (o.status || o.item?.status) === "pending";
    },
  };
}

export function normalizeOrder(site, o) {
  const ship = o.shippingAddress || {};
  const bill = o.billingAddress || {};
  return {
    site: site.id,
    siteLabel: site.label,
    orderNo: o.invoiceNo ?? o.id,
    apiId: o.id,
    createdAt: new Date(Number(o.created) * 1000).toISOString(),
    name: o.customerName || ship.name || bill.name || "",
    phone: ship.phone || bill.phone || "",
    items: (o.items || []).map((it) => ({ name: String(it.name || "").trim(), qty: it.quantity || 1, price: Number(it.total) || 0 })),
    total: Number(o.total) || 0,
    deliveryText: deliveryText(o),
  };
}

/** "Доставка до офис на Еконт, Пловдив, офис Тракия" – read out by the agent. */
export function deliveryText(o) {
  const ship = o.shippingAddress || o.billingAddress || {};
  const method = String(o.shippingName || "")
    .replace(/^\s*безплатна\s+/i, "")
    .replace(/\s*-\s*безплатна доставка\s*$/i, "")
    .trim();
  const parts = [method && method[0].toUpperCase() + method.slice(1), ship.city, ship.address, ship.address2]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  return [...new Set(parts)].join(", ");
}
