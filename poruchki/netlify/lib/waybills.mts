// Making waybills with Speedy and Econt, set up the way Middleware made them:
// Speedy – sender's contract client, drop-off at the sender's office, service 505, cash on delivery with
//          fiscal receipt lines, "test before paying", the sender pays the courier, ref1 = order number.
// Econt  – sender's profile, sender's office, cash on delivery under the COD agreement, SMS to the receiver,
//          the sender pays.
import { courierOf } from "./cb.mts";
import type { Creds } from "./couriers.mts";
import { getSetting, one, q, setSetting } from "./db.mts";
import { cKey, companyId, ENV_COMPANY, inCompany } from "./tenant.mts";
import { env, HttpError } from "./http.mts";
import { loadCreds } from "./track.mts";
import { addEvent } from "./edit.mts";

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function setWaybillFetch(f: Fetch | null) {
  fetchImpl = f || ((...a) => fetch(...a));
}

const round2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const fail = (message: string) => new HttpError(400, "courier", message);

// ---------------- sender defaults ----------------

export type Defaults = {
  speedy: { clientId: number | null; dropoffOfficeId: number | null; serviceId: number; obpd: "TEST" | "OPEN" | ""; package: string; weight: number; vatGroup: string; paper: "A6" | "A4" };
  econt: { senderOfficeCode: string; sms: boolean; weight: number; agreement: boolean; payAfterTest: boolean; payAfterAccept: boolean };
};

const BUILT_IN: Defaults = {
  speedy: { clientId: null, dropoffOfficeId: null, serviceId: 505, obpd: "TEST", package: "ENVELOPE", weight: 1, vatGroup: "А", paper: "A6" },
  econt: { senderOfficeCode: "", sms: true, weight: 0.5, agreement: true, payAfterTest: false, payAfterAccept: false },
};

/** Built-in values, then SHIPPING_DEFAULTS from the Netlify env, then what was saved in Настройки. */
export async function getDefaults(): Promise<Defaults> {
  let fromEnv: any = {};
  try {
    fromEnv = companyId() === ENV_COMPANY ? JSON.parse(env("SHIPPING_DEFAULTS") || "{}") : {};
  } catch {
    fromEnv = {};
  }
  const saved: any = (await getSetting(cKey("shipping"))) || {};
  return {
    speedy: { ...BUILT_IN.speedy, ...fromEnv.speedy, ...saved.speedy },
    econt: { ...BUILT_IN.econt, ...fromEnv.econt, ...saved.econt },
  };
}

export async function saveDefaults(input: any): Promise<Defaults> {
  const cur = await getDefaults();
  const sp = input?.speedy || {};
  const ec = input?.econt || {};
  const int = (v: unknown, d: number | null) => (v === "" || v === null ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
  const num = (v: unknown, d: number) => (Number(v) > 0 && Number(v) <= 50 ? round2(Number(v)) : d);
  const next: Defaults = {
    speedy: {
      clientId: sp.clientId !== undefined ? int(sp.clientId, cur.speedy.clientId) : cur.speedy.clientId,
      dropoffOfficeId: sp.dropoffOfficeId !== undefined ? int(sp.dropoffOfficeId, cur.speedy.dropoffOfficeId) : cur.speedy.dropoffOfficeId,
      serviceId: int(sp.serviceId, cur.speedy.serviceId) || cur.speedy.serviceId,
      obpd: ["TEST", "OPEN", ""].includes(sp.obpd) ? sp.obpd : cur.speedy.obpd,
      package: typeof sp.package === "string" && /^[A-Z_]{2,20}$/.test(sp.package) ? sp.package : cur.speedy.package,
      weight: num(sp.weight, cur.speedy.weight),
      vatGroup: ["А", "Б", "В", "Г"].includes(sp.vatGroup) ? sp.vatGroup : cur.speedy.vatGroup,
      paper: sp.paper === "A4" ? "A4" : sp.paper === "A6" ? "A6" : cur.speedy.paper,
    },
    econt: {
      senderOfficeCode: typeof ec.senderOfficeCode === "string" ? ec.senderOfficeCode.trim().slice(0, 10) : cur.econt.senderOfficeCode,
      sms: typeof ec.sms === "boolean" ? ec.sms : cur.econt.sms,
      weight: num(ec.weight, cur.econt.weight),
      agreement: typeof ec.agreement === "boolean" ? ec.agreement : cur.econt.agreement,
      payAfterTest: typeof ec.payAfterTest === "boolean" ? ec.payAfterTest : cur.econt.payAfterTest,
      payAfterAccept: typeof ec.payAfterAccept === "boolean" ? ec.payAfterAccept : cur.econt.payAfterAccept,
    },
  };
  await setSetting(cKey("shipping"), next);
  return next;
}

// ---------------- the draft shown in the waybill window ----------------

export type Draft = {
  courier: "speedy" | "econt";
  type: "office" | "automat" | "address";
  officeId: string; // Speedy office id or Econt office code
  guessed?: boolean; // office found by its name, the person checks it
  officeName: string;
  city: string;
  zip: string;
  address: string;
  name: string;
  phone: string;
  cod: number; // 0 = no cash on delivery
  weight: number;
  contents: string;
  obpd: "TEST" | "OPEN" | ""; // Speedy: open / test before paying
};

export type OrderRow = Record<string, any>;

export function draftFor(o: OrderRow, def: Defaults): Draft {
  const d = o.delivery || {};
  const courier: "speedy" | "econt" = d.courier === "econt" || d.courier === "speedy" ? d.courier : courierOf(o.shipping_name) === "econt" ? "econt" : "speedy";
  // Office stays office even without its code: the dialog asks for the office (sending it to an address instead would be wrong).
  const type: Draft["type"] = d.type === "office" || d.type === "automat" ? d.type : "address";
  const isOfficeText = (s: string) => /^\s*До офис/i.test(s || "");
  const address = [o.address, o.address2].filter((s) => s && !isOfficeText(s)).join(", ");
  // What goes in the parcel: paid items, without digital products (PDFs are not sent).
  const paid = (o.items || []).filter((i: any) => Number(i.total) > 0);
  const products = (paid.some((i: any) => !i.digital) ? paid.filter((i: any) => !i.digital) : paid).map((i: any) => String(i.name));
  return {
    courier,
    type,
    officeId: d.officeId ? String(d.officeId) : "",
    officeName: d.officeName || "",
    city: o.city || "",
    zip: o.zip || "",
    address,
    name: o.customer_name || "",
    phone: o.phone || "",
    cod: o.paid ? 0 : round2(Number(o.total)),
    weight: def[courier].weight,
    contents: (products.join(", ") || `Поръчка ${o.order_no}`).slice(0, 100),
    obpd: def.speedy.obpd,
  };
}

/** What came from the browser, checked and cleaned. */
export function cleanDraft(input: any, fallback: Draft): Draft {
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const d = { ...fallback, ...(input && typeof input === "object" ? input : {}) };
  const out: Draft = {
    courier: d.courier === "econt" ? "econt" : "speedy",
    type: d.type === "address" ? "address" : d.type === "automat" ? "automat" : "office",
    officeId: s(d.officeId, 12),
    officeName: s(d.officeName, 120),
    city: s(d.city, 80),
    zip: s(d.zip, 10),
    address: s(d.address, 200),
    name: s(d.name, 100),
    phone: s(d.phone, 30),
    cod: Math.max(0, round2(Number(d.cod))),
    weight: Math.min(50, Math.max(0.05, round2(Number(d.weight) || fallback.weight))),
    contents: s(d.contents, 100) || fallback.contents,
    obpd: d.obpd === "OPEN" || d.obpd === "TEST" ? d.obpd : "",
  };
  if (!out.name) throw fail("Липсва името на получателя.");
  if (out.phone.replace(/\D/g, "").length < 9) throw fail("Провери телефона на получателя.");
  if (out.type !== "address" && !/^\d{1,8}$/.test(out.officeId)) throw fail("Избери офис или автомат.");
  if (out.type === "address" && (!out.city || out.address.length < 3)) throw fail("За доставка до адрес попълни град и адрес.");
  if (out.cod > 5000) throw fail("Наложеният платеж е твърде голям.");
  return out;
}

// ---------------- Speedy ----------------

// SPEEDY_API_URL / ECONT_API_URL only for the local tests (a fake courier).
const speedyBase = () => env("SPEEDY_API_URL") || "https://api.speedy.bg/v1";

async function speedy(path: string, creds: Creds, body: Record<string, unknown>, binary = false): Promise<any> {
  const res = await fetchImpl(speedyBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: binary ? "application/pdf, application/json" : "application/json" },
    body: JSON.stringify({ userName: creds.user, password: creds.pass, language: "BG", ...body }),
    signal: AbortSignal.timeout(25000),
  });
  const ct = res.headers.get("content-type") || "";
  if (binary && ct.includes("pdf")) return new Uint8Array(await res.arrayBuffer());
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw fail(`Спиди: ${data?.error?.message || `грешка ${res.status}`}`);
  return data;
}

/** Fiscal receipt lines must add up to the cash-on-delivery amount; otherwise one line for the whole order. */
export function fiscalItems(o: OrderRow, cod: number, vatGroup: string) {
  const line = (description: string, amount: number) => ({ description: description.slice(0, 50), vatGroup, amount: round2(amount), amountWithVat: round2(amount) });
  const items = (o.items || []).filter((i: any) => Number(i.total) > 0).map((i: any) => line(String(i.name), Number(i.total)));
  if (Number(o.shipping) > 0) items.push(line("Доставка", Number(o.shipping)));
  const sum = round2(items.reduce((a: number, b: any) => a + b.amount, 0));
  if (!items.length || Math.abs(sum - cod) > 0.009) return [line(`Поръчка ${o.order_no}`, cod)];
  return items;
}

async function speedySite(creds: Creds, city: string, zip: string): Promise<number | null> {
  const name = city.replace(/^(гр\.|с\.|град|село)\s*/i, "").trim().toUpperCase();
  if (!name) return null;
  const d = await speedy("/location/site", creds, { countryId: 100, name, ...(zip ? { postCode: zip } : {}) }).catch(() => null);
  const sites: any[] = d?.sites || [];
  const exact = sites.find((s) => String(s.name).toUpperCase() === name && (!zip || String(s.postCode) === zip)) || sites.find((s) => String(s.name).toUpperCase() === name);
  return exact ? Number(exact.id) : sites.length === 1 ? Number(sites[0].id) : null;
}

function speedyServices(d: Draft, o: OrderRow, def: Defaults["speedy"]) {
  const add: Record<string, unknown> = {};
  if (d.cod > 0) add.cod = { amount: d.cod, processingType: "CASH", currencyCode: "EUR", fiscalReceiptItems: fiscalItems(o, d.cod, def.vatGroup) };
  if (d.obpd && d.type !== "automat") add.obpd = { option: d.obpd, returnShipmentServiceId: def.serviceId, returnShipmentPayer: "SENDER" };
  return add;
}

function speedySender(def: Defaults["speedy"]) {
  if (!def.clientId) throw fail("Спиди: липсва подател. Избери го в Куриери → Спиди.");
  return { clientId: def.clientId, ...(def.dropoffOfficeId ? { dropoffOfficeId: def.dropoffOfficeId } : {}) };
}

export async function speedyPrice(creds: Creds, d: Draft, o: OrderRow, def: Defaults["speedy"]) {
  const siteId = d.type === "address" ? await speedySite(creds, d.city, d.zip) : null;
  const data = await speedy("/calculate", creds, {
    sender: speedySender(def),
    recipient: {
      privatePerson: true,
      ...(d.type !== "address" ? { pickupOfficeId: Number(d.officeId) } : { addressLocation: { countryId: 100, ...(siteId ? { siteId } : { siteName: d.city.toUpperCase(), postCode: d.zip }) } }),
    },
    service: { serviceIds: [def.serviceId], autoAdjustPickupDate: true, additionalServices: speedyServices(d, o, def) },
    content: { parcelsCount: 1, totalWeight: d.weight },
    payment: { courierServicePayer: "SENDER" },
  });
  const c = data?.calculations?.[0];
  if (!c || c.error) throw fail(`Спиди: ${c?.error?.message || "няма цена за тази пратка"}`);
  return { price: round2(c.price?.total), currency: c.price?.currency || "EUR", deadline: c.deliveryDeadline || null };
}

export async function speedyCreate(creds: Creds, d: Draft, o: OrderRow, def: Defaults["speedy"]) {
  const siteId = d.type === "address" ? await speedySite(creds, d.city, d.zip) : null;
  const data = await speedy("/shipment", creds, {
    sender: speedySender(def),
    recipient: {
      privatePerson: true,
      clientName: d.name,
      phone1: { number: d.phone },
      ...(d.type !== "address"
        ? { pickupOfficeId: Number(d.officeId) }
        : { address: { countryId: 100, ...(siteId ? { siteId } : { siteName: d.city.toUpperCase(), postCode: d.zip }), addressNote: d.address } }),
    },
    service: { serviceId: def.serviceId, autoAdjustPickupDate: true, additionalServices: speedyServices(d, o, def) },
    content: { parcelsCount: 1, totalWeight: d.weight, contents: d.contents, package: def.package },
    payment: { courierServicePayer: "SENDER" },
    ref1: String(o.order_no).slice(0, 30),
    ref2: String(o.shop).slice(0, 30),
  });
  const parcelId = String(data?.parcels?.[0]?.id || data?.id || "");
  if (!parcelId) throw fail("Спиди не върна номер на товарителница.");
  return { number: parcelId, shipmentId: String(data.id || parcelId), price: round2(data.price?.total), currency: data.price?.currency || "EUR", pdf: null as string | null };
}

export async function speedyLabels(creds: Creds, parcelIds: string[], paper: "A6" | "A4"): Promise<Uint8Array> {
  const pdf = await speedy("/print", creds, { paperSize: paper, parcels: parcelIds.map((id) => ({ parcel: { id } })) }, true);
  if (!(pdf instanceof Uint8Array)) throw fail("Спиди не върна етикет.");
  return pdf;
}

export async function speedyCancel(creds: Creds, shipmentId: string) {
  await speedy("/shipment/cancel", creds, { shipmentId, comment: "Анулирана от платформата Поръчки" });
}

/** The sender objects (clients) of the Speedy account, for the "Подател" dropdown. */
export async function speedyClients(creds: Creds) {
  const d = await speedy("/client/contract", creds, {});
  return (d?.clients || []).map((c: any) => ({
    id: String(c.clientId),
    name: [c.clientName, c.objectName].filter(Boolean).join(" – "),
    address: c.address?.fullAddressString || "",
  }));
}

export async function speedyOffices(creds: Creds, query: string, limit = 30) {
  const name = query.trim().toUpperCase();
  if (/^\d+$/.test(name)) {
    const d = await speedy(`/location/office/${name}`, creds, {}).catch(() => null);
    return d?.office ? [{ id: String(d.office.id), name: d.office.name, address: d.office.address?.fullAddressString || "", automat: d.office.type === "APT" }] : [];
  }
  const d = await speedy("/location/office", creds, { countryId: 100, name, limit });
  return (d?.offices || []).map((o: any) => ({ id: String(o.id), name: o.name, address: o.address?.fullAddressString || "", city: String(o.address?.siteName || ""), automat: o.type === "APT" }));
}

// ---------------- Econt ----------------

const econtBase = () => env("ECONT_API_URL") || (env("ECONT_DEMO") === "1" ? "https://demo.econt.com/ee/services" : "https://ee.econt.com/services");

function econtMessage(e: any): string {
  const all = (x: any): string[] => (x ? [String(x.message || "").trim(), ...(x.innerErrors || []).flatMap(all)].filter(Boolean) : []);
  return all(e).filter((m) => m.length > 1).join(" ") || "непозната грешка";
}

async function econt(path: string, creds: Creds, body: Record<string, unknown>) {
  const res = await fetchImpl(econtBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Basic " + Buffer.from(`${creds.user}:${creds.pass}`).toString("base64") },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) throw fail(`Еконт: ${econtMessage(data) || `грешка ${res.status}`}`);
  return data;
}

async function econtProfile(creds: Creds) {
  const cached = await getSetting<{ at: number; user: string; profile: any }>(cKey("econt_profile"));
  if (cached && cached.user === creds.user && Date.now() - cached.at < 12 * 3600000) return cached.profile;
  const d = await econt("/Profile/ProfileService.getClientProfiles.json", creds, {});
  const p = d?.profiles?.[0];
  if (!p?.client) throw fail("Еконт: не намерихме профила на подателя.");
  const profile = { client: p.client, agreement: p.cdPayOptions?.[0]?.num || null };
  await setSetting(cKey("econt_profile"), { at: Date.now(), user: creds.user, profile });
  return profile;
}

export function econtLabel(d: Draft, o: OrderRow, def: Defaults["econt"], profile: { client: any; agreement: string | null }) {
  if (!def.senderOfficeCode) throw fail("Еконт: липсва офис на подателя. Избери го в Куриери → Еконт.");
  return {
    senderClient: profile.client,
    senderOfficeCode: def.senderOfficeCode,
    receiverClient: { name: d.name, phones: [d.phone] },
    ...(d.type !== "address"
      ? { receiverOfficeCode: d.officeId }
      : { receiverAddress: { city: { country: { code3: "BGR" }, name: d.city, ...(d.zip ? { postCode: d.zip } : {}) }, other: d.address } }),
    packCount: 1,
    shipmentType: "pack",
    weight: d.weight,
    shipmentDescription: d.contents,
    orderNumber: String(o.order_no),
    services: {
      ...(d.cod > 0 ? { cdAmount: d.cod, cdType: "get", cdCurrency: "EUR", ...(def.agreement && profile.agreement ? { cdPayOptionsTemplate: profile.agreement } : {}) } : {}),
      smsNotification: def.sms,
    },
    ...(def.payAfterTest ? { payAfterTest: true } : {}),
    ...(def.payAfterAccept ? { payAfterAccept: true } : {}),
  };
}

export async function econtPrice(creds: Creds, d: Draft, o: OrderRow, def: Defaults["econt"]) {
  const data = await econt("/Shipments/LabelService.createLabel.json", creds, { label: econtLabel(d, o, def, await econtProfile(creds)), mode: "calculate" });
  return { price: round2(data?.label?.totalPrice), currency: data?.label?.currency || "EUR", deadline: data?.label?.expectedDeliveryDate || null };
}

export async function econtCreate(creds: Creds, d: Draft, o: OrderRow, def: Defaults["econt"]) {
  const data = await econt("/Shipments/LabelService.createLabel.json", creds, { label: econtLabel(d, o, def, await econtProfile(creds)), mode: "create" });
  const number = String(data?.label?.shipmentNumber || "");
  if (!number) throw fail("Еконт не върна номер на товарителница.");
  return { number, shipmentId: number, price: round2(data.label.totalPrice), currency: data.label.currency || "EUR", pdf: String(data.label.pdfURL || "") || null };
}

export async function econtCancel(creds: Creds, number: string) {
  const d = await econt("/Shipments/LabelService.deleteLabels.json", creds, { shipmentNumbers: [number] });
  const err = d?.results?.[0]?.error;
  if (err) throw fail(`Еконт: ${econtMessage(err)}`);
}

/** The label PDF link of any Econt waybill of ours (also ones made by Middleware). */
export async function econtPdfUrl(creds: Creds, number: string): Promise<string | null> {
  const d = await econt("/Shipments/ShipmentService.getShipmentStatuses.json", creds, { shipmentNumbers: [number] });
  return d?.shipmentStatuses?.[0]?.status?.pdfURL || null;
}

async function econtAll(creds: Creds) {
  let cached = await getSetting<{ at: number; list: any[]; v?: number }>("econt_offices");
  if (!cached || cached.v !== 2 || Date.now() - cached.at > 24 * 3600000) {
    const d = await econt("/Nomenclatures/NomenclaturesService.getOffices.json", creds, { countryCode: "BGR" });
    const list = (d?.offices || []).map((o: any) => ({
      id: String(o.code),
      name: String(o.name || ""),
      address: String(o.address?.fullAddress || [o.address?.city?.name, o.address?.street, o.address?.num].filter(Boolean).join(" ") || ""),
      automat: Boolean(o.isAPS),
      city: String(o.address?.city?.name || ""),
    }));
    cached = { at: Date.now(), list, v: 2 };
    await setSetting("econt_offices", cached);
  }
  return cached.list;
}

export async function econtOffices(creds: Creds, query: string, limit = 30) {
  const list = await econtAll(creds);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((o) => (/^\d+$/.test(query.trim()) ? o.id === query.trim() : words.every((w) => `${o.name} ${o.address}`.toLowerCase().includes(w)))).slice(0, limit);
}

/** Every office of one town (the courier's own town field, not just the word anywhere in the address). */
async function cityOffices(courier: "speedy" | "econt", creds: Creds, city: string) {
  const same = (x: string) => norm(x).replace(/^(гр|с)\s+/, "") === city;
  if (courier === "econt") return (await econtAll(creds)).filter((o) => same(o.city || ""));
  const list = await speedyOffices(creds, city, 500);
  const inTown = list.filter((o: any) => same(o.city || "") || norm(o.name).startsWith(`${city} `) || norm(o.name) === city);
  return inTown.length ? inTown : list;
}

// ---------------- what the API calls ----------------

export async function loadOrder(id: number): Promise<OrderRow> {
  const o = await one<OrderRow>("SELECT o.*, s.region, s.label AS shop_label FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1 AND s.company_id = $2", [id, companyId()]);
  if (!o) throw new HttpError(404, "not_found", "Няма такава поръчка.");
  for (const k of ["total", "sub_total", "shipping", "discount", "total_eur"]) o[k] = Number(o[k]);
  return o;
}

async function credsFor(courier: "speedy" | "econt"): Promise<Creds> {
  const c = (await loadCreds())[courier];
  if (!c) throw fail(`Няма достъп до ${courier === "speedy" ? "Спиди" : "Еконт"}. Свържи го в Куриери.`);
  return c;
}

export async function draftForOrder(id: number) {
  const o = await loadOrder(id);
  const def = await getDefaults();
  const draft = draftFor(o, def);
  // Only the office's name is known (an order taken by phone, an old shop form): try to find it, the person confirms.
  if (draft.type !== "address" && !draft.officeId && (draft.officeName || o.address)) {
    const m = await matchOffice(draft.courier, draft.city, draft.officeName || String(o.address || "")).catch(() => null);
    if (m) Object.assign(draft, { officeId: m.id, officeName: m.name, guessed: true });
  }
  return { order: o, draft, defaults: def };
}

export async function priceFor(id: number, input: any) {
  const o = await loadOrder(id);
  const def = await getDefaults();
  const d = cleanDraft(input, draftFor(o, def));
  const creds = await credsFor(d.courier);
  return d.courier === "speedy" ? speedyPrice(creds, d, o, def.speedy) : econtPrice(creds, d, o, def.econt);
}

async function log(orderId: number, courier: string, action: "create" | "cancel", ok: boolean, number: string | null, info: Record<string, unknown>, userId: number | null) {
  await q("INSERT INTO waybill_log (order_id, courier, action, ok, number, info, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [orderId, courier, action, ok, number, JSON.stringify(info), userId]);
}

export async function createFor(id: number, input: any, userId: number | null) {
  const o = await loadOrder(id);
  if (o.tracking_no) throw fail(`Поръчката вече има товарителница № ${o.tracking_no}${o.tracking_source === "own" ? "" : " (от Middleware или магазина)"}.`);
  if ((o.currency || "EUR") !== "EUR") throw fail("Товарителници правим само за поръчки в евро.");
  const def = await getDefaults();
  const d = cleanDraft(input, draftFor(o, def));
  const creds = await credsFor(d.courier);
  // One waybill at a time per order, even with two clicks or two people.
  const lock = await q(
    `UPDATE orders SET waybill = coalesce(waybill, '{}'::jsonb) || jsonb_build_object('pending', now())
      WHERE id = $1 AND tracking_no IS NULL
        AND (waybill IS NULL OR waybill->>'pending' IS NULL OR (waybill->>'pending')::timestamptz < now() - interval '2 minutes')
      RETURNING id`,
    [id],
  );
  if (!lock.length) throw fail("Товарителницата за тази поръчка вече се създава.");
  let made: Awaited<ReturnType<typeof speedyCreate>>;
  try {
    made = d.courier === "speedy" ? await speedyCreate(creds, d, o, def.speedy) : await econtCreate(creds, d, o, def.econt);
  } catch (e: any) {
    await q("UPDATE orders SET waybill = waybill - 'pending' WHERE id = $1", [id]);
    await log(id, d.courier, "create", false, null, { error: e.message, draft: { ...d, name: undefined, phone: undefined } }, userId);
    throw e;
  }
  const waybill = { courier: d.courier, number: made.number, shipmentId: made.shipmentId, price: made.price, currency: made.currency, cod: d.cod, pdf: made.pdf, type: d.type, officeId: d.officeId || null, at: new Date().toISOString(), by: userId };
  await q(
    `UPDATE orders SET tracking_no = $2, courier = $3, tracking_source = 'own', tracking_url = NULL, waybill = $4,
            parcel_status = 'prepared', parcel_text = 'Товарителницата е създадена', parcel_at = now(), parcel_final = false,
            parcel_events = $5, tracked_at = NULL, track_error = NULL, delivered_at = NULL,
            courier_cost = $6, courier_cost_at = CASE WHEN $6::numeric IS NULL THEN NULL ELSE now() END
      WHERE id = $1`,
    [id, made.number, d.courier, JSON.stringify(waybill), JSON.stringify([{ at: waybill.at, text: "Товарителницата е създадена" }]), Number.isFinite(made.price) ? made.price : null],
  );
  await log(id, d.courier, "create", true, made.number, { price: made.price, cod: d.cod, type: d.type, officeId: d.officeId }, userId);
  const where = d.type === "address" ? `до адрес ${d.city}` : `до ${d.type === "automat" ? "автомат" : "офис"} № ${d.officeId}${d.officeName ? ` ${d.officeName}` : ""}`;
  await addEvent(id, "waybill", `Създадена товарителница ${d.courier === "speedy" ? "Спиди" : "Еконт"} № ${made.number} ${where}, наложен платеж ${d.cod.toFixed(2).replace(".", ",")} €`, {}, userId);
  return { number: made.number, courier: d.courier, price: made.price, currency: made.currency };
}

export async function cancelFor(id: number, userId: number | null) {
  const o = await loadOrder(id);
  const w = o.waybill || {};
  if (o.tracking_source !== "own" || !w.number || w.number !== o.tracking_no) throw fail("Можем да анулираме само товарителници, създадени от платформата.");
  const creds = await credsFor(w.courier);
  try {
    if (w.courier === "speedy") await speedyCancel(creds, String(w.shipmentId || w.number));
    else await econtCancel(creds, String(w.number));
  } catch (e: any) {
    await log(id, w.courier, "cancel", false, w.number, { error: e.message }, userId);
    throw e;
  }
  await q(
    `UPDATE orders SET tracking_no = NULL, courier = NULL, tracking_source = NULL, tracking_url = NULL,
            waybill = waybill || jsonb_build_object('canceledAt', now(), 'canceledNumber', tracking_no),
            parcel_status = NULL, parcel_text = NULL, parcel_at = NULL, parcel_final = false, parcel_events = '[]'::jsonb,
            tracked_at = NULL, track_error = NULL, delivered_at = NULL, lookup_at = now()
      WHERE id = $1`,
    [id],
  );
  await log(id, w.courier, "cancel", true, w.number, {}, userId);
  await addEvent(id, "waybill_cancel", `Анулирана товарителница № ${w.number}`, {}, userId);
  return { canceled: w.number };
}

async function markPrinted(ids: number[]) {
  await q(`UPDATE orders SET waybill = waybill || jsonb_build_object('printedAt', now()) WHERE id = ANY($1) AND ${inCompany()} AND waybill IS NOT NULL AND waybill->>'number' = tracking_no`, [ids]);
}

/** Waybills made here that were not printed yet (the print page prints them). */
export async function printQueue() {
  const rows = await q<any>(
    `SELECT o.id, o.order_no, o.courier, o.tracking_no, o.customer_name, o.waybill->>'at' AS at, s.label AS shop_label
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE s.company_id = ${companyId()} AND o.tracking_source = 'own' AND o.waybill->>'number' = o.tracking_no AND o.waybill->>'printedAt' IS NULL
        AND (o.waybill->>'at')::timestamptz > now() - interval '3 days'
      ORDER BY (o.waybill->>'at')`,
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export async function markPrintedPublic(ids: number[]) {
  await markPrinted(ids);
}

/** One PDF: Speedy labels together; an Econt label one at a time. */
export async function labelsFor(ids: number[]): Promise<Uint8Array> {
  const rows = await q<any>(`SELECT id, courier, tracking_no, waybill FROM orders WHERE id = ANY($1) AND ${inCompany()} AND tracking_no IS NOT NULL`, [ids]);
  if (!rows.length) throw fail("Няма товарителници за печат.");
  const couriers = new Set(rows.map((r) => r.courier));
  if (couriers.size > 1) throw fail("Отпечатай етикетите на Спиди и Еконт поотделно.");
  const courier = rows[0].courier;
  if (courier === "speedy") {
    const def = await getDefaults();
    const pdf = await speedyLabels(await credsFor("speedy"), rows.map((r) => String(r.tracking_no)), def.speedy.paper);
    await markPrinted(rows.map((r) => Number(r.id)));
    return pdf;
  }
  if (courier === "econt") {
    if (rows.length > 1) throw fail("Етикетите на Еконт се печатат по един.");
    const r = rows[0];
    const url = r.waybill?.number === r.tracking_no && r.waybill?.pdf ? r.waybill.pdf : await econtPdfUrl(await credsFor("econt"), String(r.tracking_no));
    if (!url) throw fail("Еконт не даде етикет за тази пратка.");
    // Econt gives http links; ask over https (except the local test courier).
    const safe = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) ? url : url.replace(/^http:/, "https:");
    const res = await fetchImpl(safe, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw fail(`Еконт: етикетът не се отвори (грешка ${res.status}).`);
    const pdf = new Uint8Array(await res.arrayBuffer());
    await markPrinted([Number(r.id)]);
    return pdf;
  }
  throw fail("Етикет можем да отпечатаме само за Спиди и Еконт.");
}

const STOP = new Set(["офис", "офиса", "на", "до", "еконт", "econt", "спиди", "speedy", "ул", "бул", "гр", "град", "кв", "жк", "№", "и", "в", "с", "автомат", "офисът"]);
const norm = (t: string) => String(t || "").toLowerCase().replace(/[„“"'.,()]/g, " ").replace(/\s+/g, " ").trim();

/** Offices of a city, best match for the words first (score = how many of the words they contain). */
export async function searchOffices(courier: string, city: string, text: string) {
  if (courier !== "speedy" && courier !== "econt") throw fail("Непознат куриер.");
  const c = norm(city).replace(/^(гр|с)\s+/, "");
  if (c.length < 2) return { list: [], words: [] as string[] };
  const creds = await credsFor(courier);
  const list: any[] = await cityOffices(courier, creds, c);
  const words = norm(text).split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !c.split(" ").includes(w));
  const scored = list
    .map((o) => {
      const hay = norm(`${o.name} ${o.address}`);
      return { ...o, score: words.filter((w) => hay.includes(w) || (w.length > 5 && hay.includes(w.slice(0, -2)))).length };
    })
    .sort((a, b) => b.score - a.score);
  return { list: scored, words };
}

/**
 * The courier office a customer named in words ("София, офис на Еконт на ул. Осогово"): the offices of the city,
 * scored by the other words. Only a clear winner is returned – otherwise a person picks it.
 */
export async function matchOffice(courier: string, city: string, text: string): Promise<{ id: string; name: string; address: string } | null> {
  if (courier !== "speedy" && courier !== "econt") return null;
  if (/^\d{1,6}$/.test(String(text || "").trim())) {
    const creds = await credsFor(courier);
    const byId = courier === "speedy" ? await speedyOffices(creds, String(text).trim()) : await econtOffices(creds, String(text).trim());
    if (byId.length === 1) return byId[0];
  }
  const { list, words } = await searchOffices(courier, city, text);
  if (!list.length) return null;
  if (list[0].score > 0 && (list.length === 1 || list[0].score > list[1].score)) return list[0];
  return list.length === 1 && !words.length ? list[0] : null;
}

export async function clientsFor(courier: string) {
  if (courier !== "speedy") return [];
  return speedyClients(await credsFor("speedy"));
}

export async function officesFor(courier: string, query: string) {
  if (courier !== "speedy" && courier !== "econt") throw fail("Непознат куриер.");
  if (query.trim().length < 2) return [];
  const creds = await credsFor(courier);
  return courier === "speedy" ? speedyOffices(creds, query) : econtOffices(creds, query);
}
