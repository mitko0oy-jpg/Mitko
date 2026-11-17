// Econt can list every waybill we sent (ShipmentService.getMyAWB). For orders where neither the shop
// nor Middleware gave us the waybill number, we find it by the receiver's phone and the COD amount.
import { addDays, sofiaDay } from "./dates.mts";
import { getSetting, q, setSetting } from "./db.mts";
import type { Creds } from "./couriers.mts";
import { env } from "./http.mts";

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setMatchFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}

/** Last 9 digits: 0888123456, +359888123456 and 359 888 123 456 are the same phone. */
export const phoneKey = (p: unknown) => String(p || "").replace(/\D/g, "").slice(-9);

export type Awb = { number: string; phone: string; cod: number; created: number };

export async function econtWaybills(creds: Creds, fromDay: string, toDay: string, deadline: number): Promise<Awb[]> {
  const base = env("ECONT_API_URL") || (env("ECONT_DEMO") === "1" ? "https://demo.econt.com/ee/services" : "https://ee.econt.com/services");
  const out: Awb[] = [];
  for (let page = 1; page <= 20 && Date.now() < deadline; page++) {
    const res = await fetchImpl(`${base}/Shipments/ShipmentService.getMyAWB.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${creds.user}:${creds.pass}`).toString("base64") },
      body: JSON.stringify({ dateFrom: fromDay, dateTo: toDay, page, side: "sender" }),
      signal: AbortSignal.timeout(Math.max(1000, Math.min(40000, deadline - Date.now()))),
    });
    if (!res.ok) throw new Error(`Еконт (списък пратки): HTTP ${res.status}`);
    const d: any = await res.json();
    for (const r of Array.isArray(d?.results) ? d.results : []) {
      const created = Date.parse(String(r.createdDate || r.acceptedDate || ""));
      if (r.shipmentNumber) out.push({ number: String(r.shipmentNumber), phone: phoneKey(r.receiverPhone), cod: Number(r.cdAmount) || 0, created: Number.isFinite(created) ? created : Date.now() });
    }
    if (page >= (Number(d?.totalPages) || 1)) break;
  }
  return out;
}

type Candidate = { id: number; phone: string; total: number; at: number };

/** Pure matching: for each waybill the order with the same phone, made before it, best by amount and time. */
export function pickMatches(awbs: Awb[], orders: Candidate[]): { orderId: number; number: string }[] {
  const byPhone = new Map<string, Candidate[]>();
  for (const o of orders) {
    if (!o.phone) continue;
    if (!byPhone.has(o.phone)) byPhone.set(o.phone, []);
    byPhone.get(o.phone)!.push(o);
  }
  const used = new Set<number>();
  const out: { orderId: number; number: string }[] = [];
  for (const a of [...awbs].sort((x, y) => x.created - y.created)) {
    const list = (byPhone.get(a.phone) || []).filter((o) => !used.has(o.id) && o.at <= a.created + 3600000 && o.at >= a.created - 14 * 86400000);
    if (!list.length) continue;
    const amountOk = (o: Candidate) => !a.cod || Math.abs(o.total - a.cod) < 0.6;
    const good = list.filter(amountOk);
    const pool = good.length ? good : list.length === 1 ? list : [];
    if (!pool.length) continue;
    const best = pool.sort((x, y) => y.at - x.at)[0]; // the latest order before the waybill
    used.add(best.id);
    out.push({ orderId: best.id, number: a.number });
  }
  return out;
}

// Econt orders without a waybill number (the shops do not get Middleware's numbers back).
const CANDIDATES = `
  FROM orders o JOIN shops s ON s.id = o.shop
 WHERE o.tracking_no IS NULL AND s.region = 'bg' AND s.active AND o.delivery->>'courier' = 'econt'
   AND o.ordered_at > now() - interval '20 days' AND o.ordered_at < now() - interval '15 minutes'`;

export async function matchEcont(creds: Creds | undefined, deadline: number, force = false) {
  if (!creds) return { matched: 0 };
  // The waybill list is slow to fetch (~15 s for two weeks): at most every 2 hours, and only when something is missing.
  const last = await getSetting<{ at: number }>("econt_match");
  if (!force && last && Date.now() - last.at < 2 * 3600000) return { matched: 0, skipped: true };
  await setSetting("econt_match", { at: Date.now() });
  const rows = await q<any>(`SELECT o.id, o.phone, o.total_eur::float AS total, extract(epoch FROM o.ordered_at) * 1000 AS at ${CANDIDATES}`);
  if (!rows.length) return { matched: 0, candidates: 0 };
  const today = sofiaDay(new Date());
  const awbs = await econtWaybills(creds, addDays(today, -21), today, deadline);
  if (!awbs.length) return { matched: 0, waybills: 0 };
  const known = new Set((await q<any>("SELECT tracking_no FROM orders WHERE tracking_no = ANY($1)", [awbs.map((a) => a.number)])).map((r) => r.tracking_no));
  const matches = pickMatches(
    awbs.filter((a) => !known.has(a.number)),
    rows.map((r) => ({ id: Number(r.id), phone: phoneKey(r.phone), total: Number(r.total), at: Number(r.at) })),
  );
  let matched = 0;
  for (const m of matches) {
    const r = await q("UPDATE orders SET tracking_no = $2, courier = 'econt', tracking_source = 'econt_match' WHERE id = $1 AND tracking_no IS NULL RETURNING id", [m.orderId, m.number]);
    matched += r.length;
  }
  return { matched, waybills: awbs.length, candidates: rows.length };
}
