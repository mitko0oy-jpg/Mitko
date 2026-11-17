// Parcel tracking with Speedy and Econt.
// Speedy: https://api.speedy.bg/web-api.html (POST JSON, userName/password in the body).
// Econt:  https://ee.econt.com/services/ (POST JSON, HTTP Basic auth).
import { env } from "./http.mts";

export type Creds = { user: string; pass: string };
export type ParcelStatus = "prepared" | "in_transit" | "at_office" | "delivered" | "returned" | "refused";
export type ParcelEvent = { at: string | null; text: string; place?: string };
export type ParcelState = {
  status: ParcelStatus;
  text: string; // what the courier says, in Bulgarian
  at: string | null; // time of the last event
  final: boolean; // nothing more to wait for
  deliveredAt: string | null;
  events: ParcelEvent[];
};

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setCourierFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}

export class CourierError extends Error {
  auth: boolean;
  constructor(message: string, auth = false) {
    super(message);
    this.auth = auth;
  }
}

const toIso = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

// ---------------- Speedy ----------------

const speedyBase = () => env("SPEEDY_API_URL") || "https://api.speedy.bg/v1";

async function speedy(path: string, creds: Creds, body: Record<string, unknown>) {
  const res = await fetchImpl(speedyBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify({ userName: creds.user, password: creds.pass, language: "BG", ...body }),
    signal: AbortSignal.timeout(20000),
  });
  const data: any = await res.json().catch(() => null);
  const err = data?.error;
  if (!res.ok || err) {
    const msg = err?.message || `HTTP ${res.status}`;
    // Speedy answers a wrong user/password with an error about the client (code 1 or 100).
    throw new CourierError(`Спиди: ${msg}`, res.status === 401 || res.status === 403 || /парол|password|user|потребител|достъп|access|authent/i.test(msg));
  }
  return data;
}

// Operation codes, Appendix 1 of the Speedy Web API.
const SP_DELIVERED = -14;
const SP_REFUSED = new Set([123]); // Refused by recipient
const SP_RETURNED = new Set([111, 124]); // Return to sender / delivered back to sender
const SP_AT_OFFICE = new Set([134, 1134]); // Prepared for self-collecting / notification for parcel in office or locker
const SP_PREPARED = new Set([148]); // Data about the parcel received (not handed over yet)

export function speedyState(opsIn: any[]): ParcelState {
  const ops = (Array.isArray(opsIn) ? opsIn : [])
    .map((o) => ({ code: Number(o.operationCode), at: toIso(o.dateTime), text: String(o.description || "").trim(), place: String(o.place?.name || o.place || "").trim(), ret: o.returnShipmentId }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const events: ParcelEvent[] = ops.map((o) => ({ at: o.at, text: o.text, ...(o.place && o.place !== "[object Object]" ? { place: o.place } : {}) }));
  const last = ops[ops.length - 1];
  const base = { text: last?.text || "Приета от куриера", at: last?.at || null, events: events.slice(-30) };
  const delivered = ops.find((o) => o.code === SP_DELIVERED);
  const returned = ops.some((o) => SP_RETURNED.has(o.code) || o.ret);
  if (ops.some((o) => SP_REFUSED.has(o.code))) return { ...base, status: "refused", final: true, deliveredAt: null };
  if (returned) return { ...base, status: "returned", final: true, deliveredAt: null };
  if (delivered) return { ...base, status: "delivered", final: true, deliveredAt: delivered.at };
  if (last && SP_AT_OFFICE.has(last.code)) return { ...base, status: "at_office", final: false, deliveredAt: null };
  // Only "Получена информация за пратка" (148): the waybill exists, the courier has not taken the parcel.
  if (ops.every((o) => SP_PREPARED.has(o.code))) return { ...base, status: "prepared", final: false, deliveredAt: null };
  return { ...base, status: "in_transit", final: false, deliveredAt: null };
}

export async function speedyTrack(creds: Creds, ids: string[]): Promise<Map<string, ParcelState | { error: string }>> {
  const out = new Map<string, ParcelState | { error: string }>();
  for (const part of chunks(ids, 10)) {
    const data = await speedy("/track", creds, { parcels: part.map((id) => ({ id })), lastOperationOnly: false });
    const parcels: any[] = Array.isArray(data?.parcels) ? data.parcels : [];
    part.forEach((id, i) => {
      const p = parcels.find((x) => String(x.parcelId) === id) || parcels[i];
      if (!p) return out.set(id, { error: "Спиди не върна данни" });
      if (p.error) return out.set(id, { error: String(p.error.message || "грешка") });
      out.set(id, speedyState(p.operations));
    });
  }
  return out;
}

export async function speedyCheck(creds: Creds) {
  await speedy("/location/office", creds, { countryId: 100, name: "СОФИЯ", limit: 1 });
}

// ---------------- Econt ----------------

const econtBase = () => env("ECONT_API_URL") || (env("ECONT_DEMO") === "1" ? "https://demo.econt.com/ee/services" : "https://ee.econt.com/services");

async function econt(path: string, creds: Creds, body: Record<string, unknown>) {
  const res = await fetchImpl(econtBase() + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Basic " + Buffer.from(`${creds.user}:${creds.pass}`).toString("base64"),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || `HTTP ${res.status}`;
    throw new CourierError(`Еконт: ${msg}`, res.status === 401 || res.status === 403 || /парол|password|потребител|user|access|достъп/i.test(msg));
  }
  return data;
}

// Seen on real parcels (shortDeliveryStatus / En, last trackingEvents.destinationType):
//   "Очаква предаване към Еконт" / "Awaiting delivery to Econt" / prepared   → not handed over yet
//   "Пристигнала в офис" / "In delivery office" / office                      → waiting at the office
//   "Доставена" / "Delivered" / client                                         → delivered (cdCollectedAmount > 0)
//   "Върната" / "Returned" / return, then client; nextShipments reason "return" → came back to us
// Careful: "Awaiting delivery…" and "In delivery office" both contain "deliver".
export function econtState(st: any): ParcelState {
  const bgRaw = String(st?.shortDeliveryStatus || "").trim();
  const bg = bgRaw.toLowerCase();
  const en = String(st?.shortDeliveryStatusEn || "").toLowerCase().trim();
  const raw: any[] = Array.isArray(st?.trackingEvents) ? st.trackingEvents : [];
  const events: ParcelEvent[] = raw
    .map((e: any) => ({ at: toIso(e.time), text: String(e.destinationDetails || e.destinationType || "").trim(), place: String(e.officeName || e.cityName || "").trim() }))
    .sort((a: ParcelEvent, b: ParcelEvent) => String(a.at).localeCompare(String(b.at)))
    .map((e: ParcelEvent) => (e.place && e.place !== e.text ? e : { at: e.at, text: e.text }));
  const types = raw.map((e) => String(e?.destinationType || ""));
  const lastType = types[types.length - 1] || "";
  const last = events[events.length - 1];
  const base = { text: bgRaw || last?.text || "Приета от куриера", at: last?.at || toIso(st?.deliveryTime) || toIso(st?.sendTime), events: events.slice(-30) };
  const next: any[] = Array.isArray(st?.nextShipments) ? st.nextShipments : [];
  if (/отказ|refus/.test(`${bg} ${en}`)) return { ...base, status: "refused", final: true, deliveredAt: null };
  const returned = en.startsWith("return") || bg.startsWith("върнат") || types.includes("return") || next.some((x) => /^return$|връщ|върн/i.test(String(x?.reason || "")));
  if (returned) return { ...base, status: "returned", final: true, deliveredAt: null };
  if (en === "delivered" || bg.startsWith("доставен") || bg.startsWith("получен") || lastType === "client") {
    return { ...base, status: "delivered", final: true, deliveredAt: toIso(st?.deliveryTime) || toIso(st?.cdCollectedTime) || base.at };
  }
  if (en === "in delivery office" || bg.startsWith("пристигнал") || /в автомат|очаква получаване/.test(bg) || (lastType === "office" && !en.startsWith("awaiting"))) {
    return { ...base, status: "at_office", final: false, deliveredAt: null };
  }
  if (en.startsWith("awaiting") || bg.startsWith("очаква предаване") || lastType === "prepared" || !types.length) return { ...base, status: "prepared", final: false, deliveredAt: null };
  return { ...base, status: "in_transit", final: false, deliveredAt: null };
}

export async function econtTrack(creds: Creds, numbers: string[]): Promise<Map<string, ParcelState | { error: string }>> {
  const out = new Map<string, ParcelState | { error: string }>();
  for (const part of chunks(numbers, 20)) {
    const data = await econt("/Shipments/ShipmentService.getShipmentStatuses.json", creds, { shipmentNumbers: part });
    const list: any[] = Array.isArray(data?.shipmentStatuses) ? data.shipmentStatuses : [];
    part.forEach((num, i) => {
      const r = list.find((x) => String(x?.status?.shipmentNumber) === num) || list[i];
      if (!r) return out.set(num, { error: "Еконт не върна данни" });
      if (r.error || !r.status) return out.set(num, { error: String(r.error?.message || "грешка") });
      out.set(num, econtState(r.status));
    });
  }
  return out;
}

export async function econtCheck(creds: Creds) {
  await econt("/Profile/ProfileService.getClientProfiles.json", creds, {});
}

export const COURIERS = {
  speedy: { label: "Спиди", track: speedyTrack, check: speedyCheck },
  econt: { label: "Еконт", track: econtTrack, check: econtCheck },
} as const;
export type CourierId = keyof typeof COURIERS;
export const isCourier = (c: unknown): c is CourierId => c === "speedy" || c === "econt";

/** Public tracking page for the customer/owner. */
export function trackingUrl(courier: string | null, no: string | null): string | null {
  if (!no) return null;
  if (courier === "speedy") return `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${encodeURIComponent(no)}`;
  if (courier === "econt") return `https://www.econt.com/services/track-shipment/${encodeURIComponent(no)}`;
  return null;
}
