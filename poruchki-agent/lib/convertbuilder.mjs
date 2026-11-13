// ConvertBuilder shop API (docs: https://websitebuilder.app-sources.com).
// Base: https://<shop domain>/api/site, header "Authorization: Bearer <key>".
// CB_SITES env var: JSON [{ "id": "bg", "label": "BeeVenom BG", "domain": "beevenombg.eu", "key": "…" }]
// The API can read and update orders, but it cannot create them.
import { normalizePhoneBG, itemsTextBG } from "./format.mjs";

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
    /** Orders of the last `days` days placed with this phone number (E.164), newest first. */
    async searchByPhone(phone, days = 45) {
      const out = [];
      for (const site of active) {
        const q = { created_at_min: Math.floor(Date.now() / 1000) - days * 86400, created_at_max: Math.floor(Date.now() / 1000) + 60, limit: PAGE };
        const first = await cb(site, "/orders", { ...q, skip: 0 });
        const rest = [];
        for (let skip = PAGE; skip < (first.totalCount || 0); skip += PAGE) rest.push(cb(site, "/orders", { ...q, skip }));
        const all = [first, ...(await Promise.all(rest))].flatMap((p) => p.items || []);
        for (const o of all) {
          const s = o.shippingAddress || {};
          const b = o.billingAddress || {};
          if (normalizePhoneBG(s.phone) !== phone && normalizePhoneBG(b.phone) !== phone) continue;
          out.push({
            orderNo: o.invoiceNo ?? o.id,
            created: Number(o.created) || 0,
            dateText: new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "long" }).format(new Date(Number(o.created) * 1000)),
            itemsText: itemsTextBG((o.items || []).map((it) => ({ name: String(it.name || "").trim(), qty: it.quantity || 1, price: Number(it.total) || 0 }))),
            total: Number(o.total) || 0,
            status: o.status,
            courier: o.fulfillment?.courier || "",
            trackingNo: o.fulfillment?.trackingNo || "",
          });
        }
      }
      return out.sort((a, b) => b.created - a.created);
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

/**
 * What the agent reads out, e.g. "до офис на Спиди „Ботевград – Склад“".
 * ConvertBuilder stores the office in the address line:
 *   "До офис speedy[141]: БОТЕВГРАД - СКЛАД жк Васил Левски ул. …"
 *   "До офис econt[6308]: Хасково -  Хасково Източна индустриална зона бул. …"
 */
export function deliveryText(o) {
  const ship = o.shippingAddress || o.billingAddress || {};
  const office = officeName(ship.address);
  if (office) return office;
  const method = String(o.shippingName || "")
    .replace(/^\s*безплатна\s+/i, "")
    .replace(/\s*-\s*безплатна доставка\s*$/i, "")
    .trim();
  const parts = [method && method[0].toUpperCase() + method.slice(1), ship.city, ship.address, ship.address2]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  return [...new Set(parts)].join(", ");
}

const STREET = /\s(?:жк|ж\.к\.|ул\.|бул\.|пл\.|кв\.|бл\.|No|№)(?=[\s\d.]|$)/i;

export function officeName(address) {
  const m = /^\s*До офис (econt|speedy)\[\d+\]:\s*(.+)$/i.exec(String(address || ""));
  if (!m) return "";
  const courier = m[1].toLowerCase() === "econt" ? "Еконт" : "Спиди";
  const rest = m[2].replace(/\s+/g, " ").trim();
  const dash = rest.indexOf(" - ");
  let left = dash >= 0 ? rest.slice(0, dash) : rest;
  let right = dash >= 0 ? rest.slice(dash + 3) : "";
  // Cut the street part off.
  if (!right) left = left.split(STREET)[0];
  let place = right.split(STREET)[0].trim();
  if (place.toLowerCase().startsWith(left.toLowerCase())) place = place.slice(left.length).trim();
  if (place && left.toLowerCase().includes(place.toLowerCase())) place = ""; // "Бургас Ветрен - Бургас кв. …"
  const automat = /\(?автомат\)?/i.test(place);
  place = place.replace(/\(?автомат\)?/i, "").trim();
  const name = [titleCase(left.trim()), titleCase(place)].filter(Boolean).join(" – ");
  return `до ${automat ? "автомат" : "офис"} на ${courier} „${name}“`;
}

/** "БОТЕВГРАД" → "Ботевград" (all-caps words are read letter by letter by some voices). */
function titleCase(text) {
  return String(text || "")
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ");
}
