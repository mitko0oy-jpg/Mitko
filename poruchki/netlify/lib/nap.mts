// Стандартизиран одиторски файл за НАП (Наредба Н-18, чл. 52т, приложение № 38) – по един за всеки
// регистриран електронен магазин и месец. Влизат поръчките, доставени през месеца (независимо как са
// платени, всяка със своя код за плащане), и върнатите на клиенти суми. Файлът е XML в windows-1251,
// като примера на НАП; схемата (XSD) е в test/fixtures/nap-audit.xsd и тестовете проверяват по нея.
import { createHash } from "node:crypto";
import { q, tx } from "./db.mts";
import { companyId } from "./tenant.mts";
import { accSettings, AccSettings, companyShops, deliveredBetween, monthRange, r2, SaleOrder, ShopRow } from "./sales.mts";

export const PAYM_LABEL: Record<number, string> = {
  1: "1 – без пощенски паричен превод (напр. банков превод)",
  2: "2 – виртуален ПОС терминал",
  3: "3 – наложен платеж с пощенски паричен превод",
  4: "4 – доставчик на платежни услуги",
  5: "5 – друг",
  6: "6 – отразено с фискален бон",
};

/** Is the shop ready for the file: switched on, with its NAP number and web address. */
export function napReady(set: AccSettings, shop: ShopRow) {
  const s = set.shops[shop.id] || {};
  const missing: string[] = [];
  if (!/^\d{9,13}$/.test(set.eik)) missing.push("ЕИК на фирмата");
  if (!s.eShopN) missing.push("уникален номер от НАП");
  if (!napUrl(set, shop)) missing.push("уеб адрес");
  return { on: Boolean(s.nap), missing };
}

export const napUrl = (set: AccSettings, shop: ShopRow) => {
  const s = set.shops[shop.id] || {};
  return (s.url || (shop.domain ? `https://${shop.domain.replace(/^https?:\/\//, "")}` : "")).slice(0, 200);
};

// ---- windows-1251 ----
const CP1251_HIGH = "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї";
const ENC = new Map<string, number>();
for (let i = 0; i < CP1251_HIGH.length; i++) if (CP1251_HIGH[i] !== "�") ENC.set(CP1251_HIGH[i], 0x80 + i);
for (let i = 0; i < 64; i++) ENC.set(String.fromCharCode(0x410 + i), 0xc0 + i); // А–я

/** Text → windows-1251 bytes; what the code page has no letter for becomes a close one or „?“. */
export function cp1251(text: string): Buffer {
  const out: number[] = [];
  for (const ch of text.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (ENC.has(ch)) out.push(ENC.get(ch)!);
    else {
      const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out.push(plain.length === 1 && plain.charCodeAt(0) < 0x80 ? plain.charCodeAt(0) : 0x3f);
    }
  }
  return Buffer.from(out);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const money = (n: number) => r2(n).toFixed(2);
const qty = (n: number) => String(r2(n));

/**
 * DOC_N: a whole number up to 10 digits, never twice in one shop. Every order gets its number the first time
 * it goes into a file (in the order of delivery) and keeps it for every later file and correction.
 */
async function docNumbers(shop: string, orderIds: number[]): Promise<Map<number, number>> {
  if (!orderIds.length) return new Map();
  return tx(async (t) => {
    await t("SELECT pg_advisory_xact_lock(hashtext($1))", [`nap_docs:${shop}`]);
    const have = await t<any>("SELECT order_id, doc_n FROM nap_docs WHERE order_id = ANY($1::bigint[])", [orderIds]);
    const map = new Map<number, number>(have.map((r: any) => [Number(r.order_id), Number(r.doc_n)]));
    const missing = orderIds.filter((id) => !map.has(id));
    if (missing.length) {
      const top = await t<any>("SELECT coalesce(max(doc_n), 0)::bigint AS n FROM nap_docs WHERE shop = $1", [shop]);
      let n = Number(top[0]?.n || 0);
      for (const id of missing) {
        n++;
        await t("INSERT INTO nap_docs (order_id, shop, doc_n) VALUES ($1, $2, $3)", [id, shop, n]);
        map.set(id, n);
      }
    }
    return map;
  });
}

export type NapFile = {
  shop: string;
  label: string;
  month: string;
  eShopN: string;
  url: string;
  orders: number;
  gross: number;
  vat: number;
  refunds: number;
  refundTotal: number;
  byPaym: Record<string, { orders: number; gross: number }>;
  warnings: string[];
  errors: string[];
  fileName: string;
  xml: string | null; // the text (for the screen and the tests)
  bytes: Buffer | null; // what goes to НАП (windows-1251)
  sha: string | null;
};

/** The file for one shop and month (null xml when there is nothing delivered or something required is missing). */
export async function napFile(shopId: string, month: string, opts: { created?: string } = {}): Promise<NapFile> {
  const [set, shops] = await Promise.all([accSettings(), companyShops()]);
  const shop = shops.find((s) => s.id === shopId);
  if (!shop) throw new Error("no such shop");
  const [from, to] = monthRange(month);
  const { orders } = await deliveredBetween(from, to, { shop: shopId });
  const s = set.shops[shopId] || {};
  const ready = napReady(set, shop);
  const url = napUrl(set, shop);
  const errors = ready.missing.map((m) => `Липсва ${m}.`);
  const warnings: string[] = [];

  const refunds = await q<any>(
    `SELECT order_no, total_eur::float AS amount, day::text AS day, coalesce(refund_paym, 1) AS paym
       FROM acc_entries WHERE company_id = $1 AND kind = 'refund' AND shop = $2 AND day >= $3::date AND day < $4::date ORDER BY day, id`,
    [companyId(), shopId, from, to],
  );

  const byPaym: NapFile["byPaym"] = {};
  const paymOf = (o: SaleOrder) => Number(set.paym[o.payKind]) || 5;
  for (const o of orders) {
    const p = String(paymOf(o));
    const b = (byPaym[p] ||= { orders: 0, gross: 0 });
    b.orders++;
    b.gross = r2(b.gross + o.gross);
  }
  if (orders.some((o) => o.vatMissing)) errors.push("Няма зададена ставка на ДДС за магазина.");
  const guess = orders.filter((o) => o.dateGuess).length;
  if (guess) warnings.push(`${guess} поръчки нямат дата на доставка от куриера.`);
  const cards = orders.filter((o) => [2, 4].includes(paymOf(o))).length;
  if (cards && !set.procId && !set.posN) warnings.push(`${cards} поръчки са платени с карта, а не е зададен доставчикът на платежни услуги / ПОС.`);
  const fixed = orders.filter((o) => o.fixed).length;
  if (fixed) warnings.push(`${fixed} поръчки, при които редовете не дават сумата – поправени (виж поръчките).`);

  const base = {
    shop: shopId,
    label: shop.label,
    month,
    eShopN: s.eShopN || "",
    url,
    orders: orders.length,
    gross: r2(orders.reduce((a, o) => a + o.gross, 0)),
    vat: r2(orders.reduce((a, o) => a + o.vat, 0)),
    refunds: refunds.length,
    refundTotal: r2(refunds.reduce((a, r) => a + Number(r.amount), 0)),
    byPaym,
    warnings,
    fileName: `NAP_${(s.eShopN || shopId).replace(/[^\w-]/g, "")}_${month.replace("-", "_")}.xml`,
  };
  if (!orders.length) {
    warnings.push("Няма доставени поръчки през месеца – НАП не приема файл без поръчки.");
    return { ...base, errors, xml: null, bytes: null, sha: null };
  }
  if (errors.length) return { ...base, errors, xml: null, bytes: null, sha: null };

  const docs = await docNumbers(shopId, orders.map((o) => o.id));
  const [y, m] = month.split("-");
  const created = opts.created || new Date().toISOString().slice(0, 10);
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="WINDOWS-1251"?>', "<audit>");
  out.push(`\t<eik>${esc(set.eik)}</eik>`, `\t<e_shop_n>${esc(String(s.eShopN).slice(0, 10))}</e_shop_n>`, `\t<domain_name>${esc(url)}</domain_name>`);
  out.push(`\t<e_shop_type>${s.type === 2 ? 2 : 1}</e_shop_type>`, `\t<creation_date>${created}</creation_date>`, `\t<mon>${m}</mon>`, `\t<god>${y}</god>`);
  out.push("\t<order>");
  for (const o of orders) {
    const total1 = r2(o.lines.reduce((a, l) => a + l.netBefore, 0));
    const disc = Math.max(0, r2(total1 + o.vat - o.gross));
    out.push("\t\t<orderenum>");
    out.push(`\t\t\t<ord_n>${esc(o.order_no.slice(0, 300))}</ord_n>`, `\t\t\t<ord_d>${o.ordered}</ord_d>`);
    out.push(`\t\t\t<doc_n>${docs.get(o.id)}</doc_n>`, `\t\t\t<doc_date>${o.delivered}</doc_date>`);
    out.push("\t\t\t<art>");
    for (const l of o.lines) {
      out.push(
        "\t\t\t\t<artenum>",
        `\t\t\t\t\t<art_name>${esc(l.name.slice(0, 200))}</art_name>`,
        `\t\t\t\t\t<art_quant>${qty(l.qty)}</art_quant>`,
        `\t\t\t\t\t<art_price>${money(l.netBefore / l.qty)}</art_price>`,
        `\t\t\t\t\t<art_vat_rate>${l.rate}</art_vat_rate>`,
        `\t\t\t\t\t<art_vat>${money(l.vat)}</art_vat>`,
        `\t\t\t\t\t<art_sum>${money(l.gross)}</art_sum>`,
        "\t\t\t\t</artenum>",
      );
    }
    out.push("\t\t\t</art>");
    out.push(`\t\t\t<ord_total1>${money(total1)}</ord_total1>`, `\t\t\t<ord_disc>${money(disc)}</ord_disc>`, `\t\t\t<ord_vat>${money(o.vat)}</ord_vat>`, `\t\t\t<ord_total2>${money(o.gross)}</ord_total2>`);
    const paym = paymOf(o);
    out.push(`\t\t\t<paym>${paym}</paym>`);
    if (paym === 2 && set.posN) out.push(`\t\t\t<pos_n>${esc(set.posN.slice(0, 200))}</pos_n>`);
    if (paym === 4 && set.procId) out.push(`\t\t\t<proc_id>${esc(set.procId.slice(0, 200))}</proc_id>`);
    out.push("\t\t</orderenum>");
  }
  out.push("\t</order>");
  out.push(`\t<r_ord>${new Set(refunds.map((r) => r.order_no)).size}</r_ord>`);
  if (refunds.length) {
    out.push("\t<rorder>");
    for (const r of refunds)
      out.push(
        "\t\t<rorderenum>",
        `\t\t\t<r_ord_n>${esc(String(r.order_no).slice(0, 300))}</r_ord_n>`,
        `\t\t\t<r_amount>${money(Number(r.amount))}</r_amount>`,
        `\t\t\t<r_date>${r.day}</r_date>`,
        `\t\t\t<r_paym>${[1, 2, 3, 4].includes(Number(r.paym)) ? Number(r.paym) : 4}</r_paym>`,
        "\t\t</rorderenum>",
      );
    out.push("\t</rorder>");
  }
  out.push(`\t<r_total>${money(base.refundTotal)}</r_total>`, "</audit>", "");
  const xml = out.join("\r\n");
  const bytes = cp1251(xml);
  // The date of creation is left out of the fingerprint: only a change in the data is a correction.
  const sha = createHash("sha256").update(xml.replace(/<creation_date>[^<]*<\/creation_date>/, "")).digest("hex");
  return { ...base, errors, xml, bytes, sha };
}

/** Every shop of the company that goes into the file (switched on), with its state for the month. */
export async function napMonth(month: string) {
  const [set, shops] = await Promise.all([accSettings(), companyShops()]);
  const list = shops.filter((s) => set.shops[s.id]?.nap);
  const files: NapFile[] = [];
  for (const s of list) files.push(await napFile(s.id, month));
  return files;
}
