// Finding the waybills Middleware made, while both systems run side by side.
// The shops do not get the waybill number back, so we ask the couriers:
//   Speedy – Middleware writes the order number in ref1, and Speedy can track by ref. We double-check the
//            receiver's phone with /shipment/info, because order numbers of different shops can repeat.
//   Econt  – by the receiver's phone and the COD amount (see match.mts).
import { speedyState, type Creds } from "./couriers.mts";
import { q } from "./db.mts";
import { phoneKey } from "./match.mts";
import { env } from "./http.mts";

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setLookupFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}

async function speedy(path: string, creds: Creds, body: Record<string, unknown>) {
  const res = await fetchImpl((env("SPEEDY_API_URL") || "https://api.speedy.bg/v1") + path, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify({ userName: creds.user, password: creds.pass, language: "BG", ...body }),
    signal: AbortSignal.timeout(20000),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok || (data?.error && !data?.parcels && !data?.shipments)) throw new Error(`Спиди: ${data?.error?.message || `HTTP ${res.status}`}`);
  return data;
}

type Order = { id: number; order_no: string; phone: string; ordered_at: string };

/** For each order: the Speedy parcel whose ref1 is the order number and whose receiver has the same phone. */
export async function speedyByRef(creds: Creds, orders: Order[], skip: Set<string>) {
  const found: { orderId: number; number: string; state: ReturnType<typeof speedyState> }[] = [];
  const track = await speedy("/track", creds, { parcels: orders.map((o) => ({ ref: o.order_no })), lastOperationOnly: false });
  const byRef = new Map<string, any[]>();
  for (const p of track?.parcels || []) {
    if (!p?.parcelId || p.error || skip.has(String(p.parcelId))) continue;
    const ref = String(p.ref ?? "");
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref)!.push(p);
  }
  const ids = [...new Set([...byRef.values()].flat().map((p) => String(p.parcelId)))];
  if (!ids.length) return found;
  const info = await speedy("/shipment/info", creds, { shipmentIds: ids });
  const phones = new Map<string, Set<string>>();
  for (const s of info?.shipments || []) {
    const keys = new Set<string>((s?.recipient?.phones || []).map((ph: any) => phoneKey(ph?.number)).filter(Boolean));
    phones.set(String(s.id), keys);
    for (const parcel of s?.content?.parcels || []) phones.set(String(parcel.id), keys);
  }
  for (const o of orders) {
    const mine = (byRef.get(String(o.order_no)) || []).filter((p) => phones.get(String(p.parcelId))?.has(phoneKey(o.phone)));
    if (!mine.length) continue;
    // Several waybills for one order (a resend): the newest one.
    const last = mine.sort((a, b) => String(a.operations?.[0]?.dateTime || "").localeCompare(String(b.operations?.[0]?.dateTime || ""))).pop();
    found.push({ orderId: o.id, number: String(last.parcelId), state: speedyState(last.operations || []) });
  }
  return found;
}

export async function lookupSpeedy(creds: Creds | undefined, deadline: number) {
  if (!creds) return { checked: 0, found: 0 };
  const rows = await q<any>(
    `SELECT o.id, o.order_no, o.phone, o.ordered_at FROM orders o JOIN shops s ON s.id = o.shop
      WHERE o.tracking_no IS NULL AND s.region = 'bg' AND s.active AND o.delivery->>'courier' = 'speedy'
        AND o.ordered_at > now() - interval '20 days' AND o.ordered_at < now() - interval '15 minutes'
        AND (o.lookup_at IS NULL OR o.lookup_at < now() - interval '2 hours')
      ORDER BY o.lookup_at NULLS FIRST, o.ordered_at DESC LIMIT 300`,
  );
  if (!rows.length) return { checked: 0, found: 0 };
  // Waybills we cancelled ourselves still carry the order number: never link them again.
  const skip = new Set((await q<any>("SELECT number FROM waybill_log WHERE action = 'cancel' AND ok AND number IS NOT NULL")).map((r) => String(r.number)));
  let checked = 0;
  let found = 0;
  for (let i = 0; i < rows.length && Date.now() < deadline; i += 10) {
    const part: Order[] = rows.slice(i, i + 10);
    const hits = await speedyByRef(creds, part, skip);
    for (const h of hits) {
      const r = await q(
        `UPDATE orders SET tracking_no = $2, courier = 'speedy', tracking_source = 'speedy_ref',
                parcel_status = $3, parcel_text = $4, parcel_at = $5, parcel_final = $6, parcel_events = $7,
                delivered_at = $8, tracked_at = now(), track_error = NULL, lookup_at = now()
          WHERE id = $1 AND tracking_no IS NULL RETURNING id`,
        [h.orderId, h.number, h.state.status, h.state.text.slice(0, 300), h.state.at, h.state.final, JSON.stringify(h.state.events), h.state.deliveredAt],
      );
      found += r.length;
    }
    await q("UPDATE orders SET lookup_at = now() WHERE id = ANY($1) AND tracking_no IS NULL", [part.map((o) => o.id)]);
    checked += part.length;
  }
  return { checked, found };
}
