// Продажбите за счетоводството: взетите поръчки за месец (по датата на доставка), разделени на редове
// с ДДС – физически продукти, дигитални продукти и доставка, всеки със своята ставка.
// От тук четат отчетът за печалбата, писмото до счетоводителката и одиторският файл за НАП.
import { getSetting, q } from "./db.mts";
import { cKey, companyId } from "./tenant.mts";

export const PAY_KINDS = ["cod_econt", "cod_speedy", "cod_other", "bank", "card", "other"] as const;
export type PayKind = (typeof PAY_KINDS)[number];

export type ShopAcc = {
  country?: string; // BG, SK, SI, HU…
  vat?: number | null; // ДДС за физическите продукти
  vatDigital?: number | null; // ДДС за дигиталните
  vatShipping?: number | null; // ДДС за доставката
  nap?: boolean; // влиза в одиторския файл
  eShopN?: string; // уникалният номер от НАП
  url?: string; // уеб адресът, както е регистриран
  type?: 1 | 2; // 1 собствен/нает домейн, 2 онлайн платформа
};

export type AccSettings = {
  eik: string;
  companyName: string;
  accountant: { email: string; name: string; day: number; auto: boolean; copyMe: boolean };
  vat: { physical: number; digital: number; shipping: number; products: Record<string, number> };
  paym: Record<PayKind, number>;
  procId: string; // доставчик на платежни услуги (напр. Stripe) – при плащане с карта
  posN: string; // номер на виртуалния ПОС, ако е на името на фирмата
  shops: Record<string, ShopAcc>;
  // Регистрация по ДДС от месец (ГГГГ-ММ); преди нея – без ДДС в продажбите, ДДС само върху Meta (чл. 97а).
  vatFrom: string;
  // Поръчките в OrderDesk са пълни от месец (ГГГГ-ММ); за по-ранните месеци приходите се вземат от банката.
  ordersFrom: string;
  // Собственикът: как да се казва колоната („Разход Митко“) и имената му в банката (през запетая).
  owner: { label: string; names: string };
  // Реалният ДДС за внасяне по месеци (ГГГГ-ММ → евро), от справката на счетоводителя; иначе отчетът показва оценка.
  vatActual: Record<string, number>;
};

export const DEFAULTS: AccSettings = {
  eik: "",
  companyName: "",
  accountant: { email: "", name: "", day: 5, auto: true, copyMe: true },
  vat: { physical: 20, digital: 20, shipping: 20, products: {} },
  // Кодовете на НАП (приложение № 38): 1 освободено по чл. 3 без ППП (банков превод), 2 виртуален ПОС,
  // 3 наложен платеж с ППП, 4 доставчик на платежни услуги, 5 друг, 6 отразено с фискален бон.
  // Спиди: товарителниците излизат с редове за касова бележка → 6; Еконт по договор → 3. Да се провери със счетоводителката.
  paym: { cod_econt: 3, cod_speedy: 6, cod_other: 3, bank: 1, card: 4, other: 5 },
  procId: "",
  posN: "",
  shops: {},
  vatFrom: "",
  ordersFrom: "",
  owner: { label: "собственик", names: "" },
  vatActual: {},
};

const rate = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0 || n > 50 ? null : Math.round(n);
};

export async function accSettings(): Promise<AccSettings> {
  const s = ((await getSetting<any>(cKey("acc"))) || {}) as Partial<AccSettings>;
  return {
    ...DEFAULTS,
    ...s,
    accountant: { ...DEFAULTS.accountant, ...(s.accountant || {}) },
    vat: { ...DEFAULTS.vat, ...(s.vat || {}), products: { ...((s.vat && s.vat.products) || {}) } },
    paym: { ...DEFAULTS.paym, ...(s.paym || {}) },
    owner: { ...DEFAULTS.owner, ...(s.owner || {}) },
    vatActual: { ...(s.vatActual || {}) },
    shops: { ...(s.shops || {}) },
  };
}

export type ShopRow = { id: string; label: string; domain: string; region: string; currency: string; active: boolean };

export async function companyShops(): Promise<ShopRow[]> {
  return q<ShopRow>(
    "SELECT id, label, domain, region, currency, active FROM shops WHERE company_id = $1 ORDER BY region, position, label",
    [companyId()],
  );
}

/** A shop abroad without its country set: from its currency, name or domain („BeeVenom SK“, „….hu“). */
function guessCountry(shop: ShopRow): string {
  const cur: Record<string, string> = { HUF: "HU", CZK: "CZ", RON: "RO", PLN: "PL" };
  if (cur[shop.currency]) return cur[shop.currency];
  const codes = "SK|SI|HU|RO|CZ|PL|GR|HR|AT|DE";
  const word = new RegExp(`(?:^|[\\s(\\-])(${codes})(?:$|[\\s)\\-])`, "i").exec(shop.label || "");
  if (word) return word[1].toUpperCase();
  const tld = new RegExp(`\\.(${codes.toLowerCase()})$`).exec((shop.domain || "").toLowerCase().replace(/\/.*$/, ""));
  return tld ? tld[1].toUpperCase() : "";
}

/** What the shop counts as: its country and VAT rates (null = not set for a shop abroad). */
export function shopAcc(set: AccSettings, shop: ShopRow) {
  const s = set.shops[shop.id] || {};
  const bg = shop.region === "bg";
  const physical = rate(s.vat) ?? (bg ? set.vat.physical : null);
  return {
    country: (s.country || (bg ? "BG" : guessCountry(shop))).toUpperCase(),
    physical,
    digital: rate(s.vatDigital) ?? (bg ? set.vat.digital : physical),
    shipping: rate(s.vatShipping) ?? (bg ? set.vat.shipping : physical),
    vatSet: physical !== null,
  };
}

const COUNTRY: Record<string, string> = {
  bulgaria: "BG", българия: "BG", bg: "BG",
  slovakia: "SK", slovensko: "SK", словакия: "SK", sk: "SK",
  slovenia: "SI", slovenija: "SI", словения: "SI", si: "SI",
  hungary: "HU", magyarország: "HU", magyarorszag: "HU", унгария: "HU", hu: "HU",
  romania: "RO", românia: "RO", румъния: "RO", ro: "RO",
  greece: "GR", гърция: "GR", gr: "GR", el: "GR",
  czechia: "CZ", "czech republic": "CZ", česko: "CZ", чехия: "CZ", cz: "CZ",
  croatia: "HR", hrvatska: "HR", hr: "HR",
  poland: "PL", polska: "PL", pl: "PL",
  germany: "DE", deutschland: "DE", de: "DE",
  austria: "AT", österreich: "AT", at: "AT",
};
export const countryCode = (v: unknown) => COUNTRY[String(v || "").trim().toLowerCase()] || "";

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type Kind = "physical" | "digital" | "shipping";
export type Line = {
  name: string;
  qty: number;
  kind: Kind;
  rate: number;
  netBefore: number; // без ДДС, преди отстъпката
  gross: number; // с ДДС, след отстъпката
  vat: number;
  net: number; // без ДДС, след отстъпката
};

export type SaleOrder = {
  id: number;
  shop: string;
  order_no: string;
  ordered: string; // ден на поръчката
  delivered: string; // ден на доставката
  dateGuess: boolean; // няма дата от куриера – взета е друга
  country: string;
  payKind: PayKind;
  courier: string;
  lines: Line[];
  gross: number;
  vat: number;
  net: number;
  discount: number; // с ДДС
  fixed: string | null; // сумите на поръчката не се връзваха – какво е поправено
  vatMissing: boolean;
};

/** Courier of an order (its own field, the office it goes to, or the words of the shipping name). */
export function courierOf(o: any): string {
  if (o.courier === "speedy" || o.courier === "econt") return o.courier;
  const d = o.delivery || {};
  if (d.courier === "speedy" || d.courier === "econt") return d.courier;
  const t = `${o.shipping_name || ""} ${o.courier || ""}`;
  return /еконт|econt/i.test(t) ? "econt" : /спиди|speedy|dpd/i.test(t) ? "speedy" : String(o.courier || "");
}

export function payKind(o: any): PayKind {
  const pm = String(o.payment_method || "").toLowerCase();
  if (/card|stripe|карт|paypal|mypos|borica|epay/.test(pm)) return "card";
  if (/bank|банк|превод|transfer|iban/.test(pm)) return "bank";
  if (pm && !/cod|cash|налож|delivery/.test(pm) && o.paid) return "other";
  const c = courierOf(o);
  return c === "econt" ? "cod_econt" : c === "speedy" ? "cod_speedy" : "cod_other";
}

/** One order split into lines with VAT. The sum of the lines is exactly the order total (in EUR). */
export function splitOrder(o: any, set: AccSettings, shop: ShopRow): SaleOrder {
  const acc = shopAcc(set, shop);
  const fx = Number(o.fx) > 0 ? Number(o.fx) : 1;
  const prodRate = (name: string, digital: boolean) => {
    const own = set.vat.products[String(name || "").trim().toLowerCase()];
    if (own !== undefined && rate(own) !== null) return rate(own) as number;
    return (digital ? acc.digital : acc.physical) ?? 0;
  };
  const raw = (Array.isArray(o.items) ? o.items : []).map((it: any) => {
    const digital = it.digital === true;
    return { name: String(it.name || "Продукт").slice(0, 200), qty: Number(it.qty) > 0 ? Number(it.qty) : 1, gross: Number(it.total) / fx || 0, kind: (digital ? "digital" : "physical") as Kind, rate: prodRate(it.name, digital) };
  });
  const ship = Number(o.shipping) / fx || 0;
  if (ship > 0.004) raw.push({ name: "Доставка", qty: 1, gross: ship, kind: "shipping", rate: acc.shipping ?? 0 });

  let discount = Math.max(0, Number(o.discount) / fx || 0);
  const target = r2(Number(o.total_eur) || Number(o.total) / fx || 0);
  let fixed: string | null = null;
  const before = raw.reduce((a: number, l: any) => a + l.gross, 0);
  const diff = r2(target - (before - discount));
  if (Math.abs(diff) >= 0.01) {
    if (diff > 0) {
      raw.push({ name: "Други", qty: 1, gross: diff, kind: "physical", rate: acc.physical ?? 0 });
      fixed = `добавен ред „Други“ ${diff.toFixed(2)} €`;
    } else {
      discount = r2(discount - diff);
      fixed = `отстъпката е ${discount.toFixed(2)} €, за да излезе сумата`;
    }
  }
  // The discount is spread over the products (not the delivery), by their value.
  const base = raw.filter((l: any) => l.kind !== "shipping").reduce((a: number, l: any) => a + l.gross, 0);
  const spread = base > 0 ? raw.filter((l: any) => l.kind !== "shipping") : raw;
  const spreadBase = base > 0 ? base : raw.reduce((a: number, l: any) => a + l.gross, 0);
  const lines: Line[] = raw.map((l: any) => {
    const d = spread.includes(l) && spreadBase > 0 ? (discount * l.gross) / spreadBase : 0;
    const grossAfter = l.gross - d;
    const f = 1 + l.rate / 100;
    return { name: l.name, qty: l.qty, kind: l.kind, rate: l.rate, netBefore: l.gross / f, gross: grossAfter, net: grossAfter / f, vat: grossAfter - grossAfter / f };
  });
  // Rounded to cents, the lines add up to the order total: the rest goes to the biggest line.
  for (const l of lines) {
    l.gross = r2(l.gross);
    l.vat = r2(l.vat);
    l.net = r2(l.gross - l.vat);
    l.netBefore = r2(l.netBefore);
  }
  const sum = r2(lines.reduce((a, l) => a + l.gross, 0));
  if (lines.length && Math.abs(target - sum) >= 0.005) {
    const big = lines.reduce((a, l) => (l.gross > a.gross ? l : a), lines[0]);
    big.gross = r2(big.gross + (target - sum));
    const f = 1 + big.rate / 100;
    big.vat = r2(big.gross - big.gross / f);
    big.net = r2(big.gross - big.vat);
  }
  const deliv = o.delivered_day || o.day;
  return {
    id: Number(o.id),
    shop: o.shop,
    order_no: String(o.order_no),
    ordered: o.day instanceof Date ? o.day.toISOString().slice(0, 10) : String(o.day).slice(0, 10),
    delivered: deliv instanceof Date ? deliv.toISOString().slice(0, 10) : String(deliv).slice(0, 10),
    dateGuess: !o.delivered_at,
    country: countryCode(o.country) || acc.country || "",
    payKind: payKind(o),
    courier: courierOf(o),
    lines,
    gross: r2(lines.reduce((a, l) => a + l.gross, 0)),
    vat: r2(lines.reduce((a, l) => a + l.vat, 0)),
    net: r2(lines.reduce((a, l) => a + l.net, 0)),
    discount: r2(discount),
    fixed,
    vatMissing: !acc.vatSet,
  };
}

/** "2026-11" → the first day of it and of the next month. */
export function monthRange(month: string): [string, string] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("bad month");
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${month}-01`, `${next}-01`];
}

export const prevMonth = (day: string) => {
  const [y, m] = day.slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** When the money was taken: the courier's delivery, else the last parcel status, else the order day. */
export const DELIVERED_AT = "coalesce(o.delivered_at, CASE WHEN o.parcel_status = 'delivered' THEN o.parcel_at END, o.ordered_at)";

/** Every order of the company delivered in [from, to) (days in Sofia), split into lines. */
export async function deliveredBetween(from: string, to: string, opts: { shop?: string } = {}) {
  const [set, shops] = await Promise.all([accSettings(), companyShops()]);
  const byId = new Map(shops.map((s) => [s.id, s]));
  const params: unknown[] = [companyId(), from, to];
  let shopSql = "";
  if (opts.shop) {
    params.push(opts.shop);
    shopSql = ` AND o.shop = $${params.length}`;
  }
  const rows = await q<any>(
    `SELECT o.id, o.shop, o.order_no, o.day::text AS day, o.ordered_at, o.delivered_at, o.country, o.items, o.shipping, o.discount, o.total, o.total_eur, o.fx,
            o.currency, o.payment_method, o.paid, o.courier, o.delivery, o.shipping_name,
            to_char(${DELIVERED_AT} AT TIME ZONE 'Europe/Sofia', 'YYYY-MM-DD') AS delivered_day
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE s.company_id = $1 AND o.stage = 'delivered'
        AND ${DELIVERED_AT} >= ($2::date::timestamp AT TIME ZONE 'Europe/Sofia')
        AND ${DELIVERED_AT} < ($3::date::timestamp AT TIME ZONE 'Europe/Sofia')${shopSql}
      ORDER BY ${DELIVERED_AT}, o.id`,
    params,
  );
  return { set, shops, orders: rows.filter((r) => byId.has(r.shop)).map((r) => splitOrder(r, set, byId.get(r.shop)!)) };
}

type Bucket = { orders: number; gross: number; vat: number; net: number };
const add = (b: Bucket, g: number, v: number, n: number) => {
  b.gross = r2(b.gross + g);
  b.vat = r2(b.vat + v);
  b.net = r2(b.net + n);
};
const bucket = (): Bucket => ({ orders: 0, gross: 0, vat: 0, net: 0 });

/** The month for the accountant: by country, and per shop physical / digital / delivery by VAT rate. */
export async function monthSales(month: string) {
  const [from, to] = monthRange(month);
  const { set, shops, orders } = await deliveredBetween(from, to);
  const countries = new Map<string, Bucket & { rates: Record<string, Bucket> }>();
  const perShop = new Map<string, { total: Bucket; parts: Map<string, Bucket & { kind: Kind; rate: number }> }>();
  const warnings: string[] = [];
  const total = bucket();
  for (const o of orders) {
    const c = o.country || "??";
    const cb = countries.get(c) || { ...bucket(), rates: {} };
    countries.set(c, cb);
    cb.orders++;
    add(cb, o.gross, o.vat, o.net);
    total.orders++;
    add(total, o.gross, o.vat, o.net);
    const sb = perShop.get(o.shop) || { total: bucket(), parts: new Map() };
    perShop.set(o.shop, sb);
    sb.total.orders++;
    add(sb.total, o.gross, o.vat, o.net);
    const seen = new Set<string>();
    for (const l of o.lines) {
      const rk = `${l.rate}`;
      const rb = (cb.rates[rk] ||= bucket());
      add(rb, l.gross, l.vat, l.net);
      const k = `${l.kind}:${l.rate}`;
      const p = sb.parts.get(k) || { ...bucket(), kind: l.kind, rate: l.rate };
      sb.parts.set(k, p);
      if (!seen.has(k)) p.orders++;
      seen.add(k);
      add(p, l.gross, l.vat, l.net);
    }
  }
  const noVat = shops.filter((s) => perShop.has(s.id) && !shopAcc(set, s).vatSet);
  if (noVat.length) warnings.push(`За ${noVat.map((s) => s.label).join(", ")} още няма зададена ставка на ДДС – сумите там са без отделено ДДС.`);
  const guess = orders.filter((o) => o.dateGuess).length;
  if (guess) warnings.push(`${guess} поръчки нямат дата на доставка от куриера – взета е датата на поръчката или на последния статус.`);
  const fixed = orders.filter((o) => o.fixed).length;
  if (fixed) warnings.push(`${fixed} поръчки, при които редовете не дават сумата на поръчката – разликата е отделен ред или отстъпка.`);
  const ORDER: Record<Kind, number> = { physical: 0, digital: 1, shipping: 2 };
  return {
    month,
    total,
    countries: [...countries.entries()]
      .map(([country, b]) => ({ country, ...b, rates: Object.entries(b.rates).map(([r, x]) => ({ rate: Number(r), ...x })).sort((a, b) => b.rate - a.rate) }))
      .sort((a, b) => b.gross - a.gross),
    shops: shops
      .filter((s) => perShop.has(s.id))
      .map((s) => {
        const x = perShop.get(s.id)!;
        return {
          id: s.id,
          label: s.label,
          country: shopAcc(set, s).country,
          ...x.total,
          // Free gifts (a PDF at 0 €) are not a part of their own.
          parts: [...x.parts.values()].filter((p) => Math.abs(p.gross) >= 0.005).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.rate - a.rate),
        };
      }),
    orders,
    warnings,
    set,
  };
}

export const KIND_LABEL: Record<Kind, string> = { physical: "Физически продукти", digital: "Дигитални продукти", shipping: "Доставка" };
