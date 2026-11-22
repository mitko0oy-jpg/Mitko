// Счетоводство: настройки, разходи и приходи извън поръчките, банкови движения, импорт в края на месеца
// и отчет за печалбата по месеци. Само за собственика на фирмата.
import { one, q, setSetting, tx } from "./db.mts";
import { bad, notFound } from "./http.mts";
import { isDay } from "./dates.mts";
import { cKey, companyId } from "./tenant.mts";
import { validEmail } from "./email.mts";
import {
  accSettings, AccSettings, companyShops, deliveredBetween, DELIVERED_AT, monthRange, PAY_KINDS, r2, shopAcc,
} from "./sales.mts";

// ---- categories ----
export const EXPENSE_CATS: Record<string, string> = {
  ads: "Реклама (Google, TikTok, други)",
  goods: "Стока и производство",
  packaging: "Опаковки и консумативи",
  courier: "Куриери (фактури)",
  fulfillment: "Фулфилмънт и склад",
  software: "Софтуер и абонаменти",
  training: "Обучения",
  accounting: "Счетоводство и юристи",
  salaries: "Заплати и осигуровки",
  rent: "Наем и офис",
  car: "Автомобил и гориво",
  phone: "Телефон и интернет",
  fees: "Банкови такси",
  taxes: "Данъци и такси",
  vat97a: "ДДС по чл. 97а (преди регистрацията)",
  other: "Други разходи",
};
// Lines in the profit report that come by themselves (not from invoices).
export const AUTO_CATS: Record<string, string> = {
  ads_meta: "Реклама Meta (по рекламните профили)",
  meta_vat: "ДДС върху Meta (чл. 97а, преди регистрацията)",
};
export const INCOME_CATS: Record<string, string> = {
  other_income: "Друг приход",
  // Продажби от страници в ConvertBuilder, които не са свързани с OrderDesk (телефонни поръчки, стари страници) –
  // влизат в приходите като поръчките, по месеца на плащането.
  sales_cb: "Продажби от други страници (ConvertBuilder)",
};
// Bank lines: money in from the couriers and others, or out (the expense categories above, or these).
// The sales ones (SALES_IN) are the income of a month that is before the orders in OrderDesk.
export const SALES_IN = ["cod_econt", "cod_speedy", "cod_abroad", "card_in", "customer"];
export const BANK_CATS: Record<string, string> = {
  cod_econt: "Наложени платежи – Еконт",
  cod_speedy: "Наложени платежи – Спиди",
  cod_abroad: "Наложени платежи – чужбина",
  card_in: "Плащания с карта",
  customer: "Плащане от клиент",
  vat: "ДДС към НАП",
  owner: "Собственик (внасяне / теглене)",
  transfer: "Между мои сметки",
  loan: "Заем",
  other_in: "Друг приход",
  ...EXPENSE_CATS,
};
const PAID_BY = ["bank", "card", "cash", "courier", "unpaid", "other"];

const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const money = (v: unknown, what: string) => {
  const n = typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > 10_000_000) throw bad("amount", `Провери сумата (${what}).`);
  return r2(n);
};
const day = (v: unknown) => {
  const d = s(v, 10);
  if (!isDay(d)) throw bad("day", "Провери датата (ГГГГ-ММ-ДД).");
  return d;
};
export const isMonth = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

// ---- settings ----
export async function settingsView() {
  const [set, shops] = await Promise.all([accSettings(), companyShops()]);
  return {
    settings: set,
    shops: shops.map((sh) => ({ ...sh, acc: { ...(set.shops[sh.id] || {}) }, eff: shopAcc(set, sh) })),
    categories: { expense: EXPENSE_CATS, income: INCOME_CATS, bank: BANK_CATS },
    payKinds: PAY_KINDS,
  };
}

const vatIn = (v: unknown) => {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 50) throw bad("vat", "ДДС ставката трябва да е между 0 и 50.");
  return Math.round(n);
};

export async function saveSettings(input: any) {
  const cur = await accSettings();
  const shops = await companyShops();
  const next: AccSettings = JSON.parse(JSON.stringify(cur));
  if (input?.eik !== undefined) {
    const e = s(input.eik, 13).replace(/\D/g, "");
    if (e && !/^\d{9,13}$/.test(e)) throw bad("eik", "ЕИК е 9 или 13 цифри.");
    next.eik = e;
  }
  if (input?.companyName !== undefined) next.companyName = s(input.companyName, 120);
  if (input?.accountant) {
    const a = input.accountant;
    if (a.email !== undefined) {
      const e = s(a.email, 200).toLowerCase();
      if (e && !validEmail(e)) throw bad("email", "Провери имейла на счетоводителя.");
      next.accountant.email = e;
    }
    if (a.name !== undefined) next.accountant.name = s(a.name, 80);
    if (a.day !== undefined) {
      const d = Number(a.day);
      if (!Number.isInteger(d) || d < 1 || d > 15) throw bad("day", "Денят за изпращане е между 1 и 15.");
      next.accountant.day = d;
    }
    if (a.auto !== undefined) next.accountant.auto = a.auto === true;
    if (a.copyMe !== undefined) next.accountant.copyMe = a.copyMe === true;
  }
  if (input?.vat) {
    for (const k of ["physical", "digital", "shipping"] as const) if (input.vat[k] !== undefined) next.vat[k] = vatIn(input.vat[k]) ?? DEFAULT_VAT;
    if (input.vat.products && typeof input.vat.products === "object") {
      const p: Record<string, number> = {};
      for (const [name, r] of Object.entries(input.vat.products).slice(0, 300)) {
        const v = vatIn(r);
        const n = s(name, 200).toLowerCase();
        if (n && v !== null) p[n] = v;
      }
      next.vat.products = p;
    }
  }
  if (input?.paym && typeof input.paym === "object") {
    for (const k of PAY_KINDS)
      if (input.paym[k] !== undefined) {
        const c = Number(input.paym[k]);
        if (![1, 2, 3, 4, 5, 6].includes(c)) throw bad("paym", "Кодът за плащане е от 1 до 6.");
        next.paym[k] = c;
      }
  }
  if (input?.owner && typeof input.owner === "object") {
    if (input.owner.label !== undefined) next.owner.label = s(input.owner.label, 30) || "собственик";
    if (input.owner.names !== undefined) next.owner.names = s(input.owner.names, 300);
  }
  if (input?.vatActual && typeof input.vatActual === "object") {
    const va: Record<string, number> = {};
    for (const [m, v] of Object.entries<any>(input.vatActual)) {
      if (v === "" || v === null || v === undefined) continue;
      if (!isMonth(m)) throw bad("vatActual", "Реалният ДДС: месецът е във вида ГГГГ-ММ.");
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw bad("vatActual", `Реалният ДДС за ${m} не е число.`);
      va[m] = Math.round(n * 100) / 100;
    }
    next.vatActual = va;
  }
  for (const k of ["vatFrom", "ordersFrom"] as const)
    if (input?.[k] !== undefined) {
      const m = s(input[k], 7);
      if (m && !isMonth(m)) throw bad(k, "Месецът е във вида ГГГГ-ММ (напр. 2026-09).");
      next[k] = m;
    }
  if (input?.procId !== undefined) next.procId = s(input.procId, 200);
  if (input?.posN !== undefined) next.posN = s(input.posN, 200);
  if (input?.shops && typeof input.shops === "object") {
    const own = new Set(shops.map((x) => x.id));
    for (const [id, v] of Object.entries<any>(input.shops)) {
      if (!own.has(id) || !v || typeof v !== "object") continue;
      const sh = { ...(next.shops[id] || {}) };
      if (v.country !== undefined) {
        const c = s(v.country, 2).toUpperCase();
        if (c && !/^[A-Z]{2}$/.test(c)) throw bad("country", "Държавата е с 2 латински букви (BG, SK…).");
        sh.country = c;
      }
      if (v.vat !== undefined) sh.vat = vatIn(v.vat);
      if (v.vatDigital !== undefined) sh.vatDigital = vatIn(v.vatDigital);
      if (v.vatShipping !== undefined) sh.vatShipping = vatIn(v.vatShipping);
      if (v.nap !== undefined) sh.nap = v.nap === true;
      if (v.eShopN !== undefined) {
        const n = s(v.eShopN, 20);
        if (n.length > 10) throw bad("eshop", "Уникалният номер от НАП е до 10 знака.");
        sh.eShopN = n;
      }
      if (v.url !== undefined) {
        const u = s(v.url, 200);
        if (u && !/^https?:\/\/\S+$/i.test(u)) throw bad("url", "Уеб адресът започва с https://");
        sh.url = u;
      }
      if (v.type !== undefined) sh.type = Number(v.type) === 2 ? 2 : 1;
      next.shops[id] = sh;
    }
  }
  await setSetting(cKey("acc"), next);
  return settingsView();
}
const DEFAULT_VAT = 20;

// ---- entries (expenses, other income, refunds) ----
const ENTRY_COLS = `id::int AS id, day::text AS day, kind, category, party, description, doc_no, net::float AS net, vat::float AS vat,
  total::float AS total, currency, total_eur::float AS total_eur, paid_by, order_no, refund_paym, shop, source, note, who, updated_at, orders::int AS orders`;

function cleanEntry(b: any) {
  const kind = ["expense", "income", "refund"].includes(b?.kind) ? b.kind : "expense";
  const category = kind === "refund" ? "refund" : s(b?.category, 30) || (kind === "income" ? "other_income" : "other");
  if (kind === "expense" && !EXPENSE_CATS[category]) throw bad("category", "Непозната категория разход.");
  if (kind === "income" && !INCOME_CATS[category]) throw bad("category", "Непозната категория приход.");
  let total = b?.total !== undefined && b.total !== "" ? money(b.total, "общо") : null;
  let vat = b?.vat !== undefined && b.vat !== "" ? money(b.vat, "ДДС") : null;
  let net = b?.net !== undefined && b.net !== "" ? money(b.net, "без ДДС") : null;
  // Two of the three are enough.
  if (total === null && net !== null) total = r2(net + (vat ?? 0));
  if (total === null) throw bad("total", "Въведи сумата.");
  if (vat === null) vat = net !== null ? r2(total - net) : 0;
  if (net === null) net = r2(total - vat);
  if (Math.abs(r2(net + vat) - total) > 0.011) throw bad("sum", "Без ДДС + ДДС трябва да дават общата сума.");
  const currency = (s(b?.currency, 3) || "EUR").toUpperCase();
  const totalEur = currency === "EUR" ? total : b?.total_eur !== undefined ? money(b.total_eur, "в евро") : null;
  if (totalEur === null) throw bad("currency", "За сума в друга валута дай и сумата в евро.");
  const paid = PAID_BY.includes(b?.paid_by) ? b.paid_by : kind === "refund" ? "bank" : "bank";
  const rp = Number(b?.refund_paym);
  const n = Number(b?.orders);
  return {
    day: day(b?.day),
    kind,
    category,
    party: s(b?.party, 200),
    description: s(b?.description, 500),
    doc_no: s(b?.doc_no, 60),
    net,
    vat,
    total,
    currency,
    total_eur: totalEur,
    paid_by: paid,
    order_no: kind === "refund" ? s(b?.order_no, 60) : "",
    refund_paym: kind === "refund" ? ([1, 2, 3, 4].includes(rp) ? rp : 1) : null,
    shop: kind === "refund" ? s(b?.shop, 20) || null : null,
    note: s(b?.note, 500),
    // Колко поръчки са продажбите от другите страници.
    orders: category === "sales_cb" && Number.isInteger(n) && n >= 0 && n < 1e6 ? n : null,
  };
}

export async function listEntries(month: string) {
  const [from, to] = monthRange(month);
  return q<any>(`SELECT ${ENTRY_COLS} FROM acc_entries WHERE company_id = $1 AND day >= $2::date AND day < $3::date ORDER BY day DESC, id DESC`, [companyId(), from, to]);
}

async function checkRefundShop(e: ReturnType<typeof cleanEntry>) {
  if (e.kind !== "refund") return;
  if (!e.order_no) throw bad("order", "За върната сума въведи номера на поръчката.");
  if (!e.shop || !(await one("SELECT 1 FROM shops WHERE id = $1 AND company_id = $2", [e.shop, companyId()]))) throw bad("shop", "Избери магазина на поръчката.");
}

export async function createEntry(b: any, who: string, opts: { source?: string; extKey?: string | null } = {}) {
  const e = cleanEntry(b);
  await checkRefundShop(e);
  const row = await one<any>(
    `INSERT INTO acc_entries (company_id, day, kind, category, party, description, doc_no, net, vat, total, currency, total_eur, paid_by, order_no, refund_paym, shop, note, who, source, ext_key, orders)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id::int AS id`,
    [companyId(), e.day, e.kind, e.category, e.party, e.description, e.doc_no, e.net, e.vat, e.total, e.currency, e.total_eur, e.paid_by, e.order_no, e.refund_paym, e.shop, e.note, who, opts.source || "manual", opts.extKey || null, e.orders],
  );
  return Number(row.id);
}

export async function updateEntry(id: number, b: any, who: string) {
  const cur = await one<any>(`SELECT ${ENTRY_COLS} FROM acc_entries WHERE id = $1 AND company_id = $2`, [id, companyId()]);
  if (!cur) throw notFound("Няма такъв запис.");
  // Amounts: the ones sent (the rest is worked out from them), or all as they were.
  const amt = ["net", "vat", "total"].some((k) => b?.[k] !== undefined) ? { net: b.net, vat: b.vat, total: b.total } : { net: cur.net, vat: cur.vat, total: cur.total };
  const e = cleanEntry({ ...cur, ...b, ...amt });
  await checkRefundShop(e);
  await q(
    `UPDATE acc_entries SET day = $3, kind = $4, category = $5, party = $6, description = $7, doc_no = $8, net = $9, vat = $10, total = $11, currency = $12,
            total_eur = $13, paid_by = $14, order_no = $15, refund_paym = $16, shop = $17, note = $18, who = $19, orders = $20, updated_at = now()
      WHERE id = $1 AND company_id = $2`,
    [id, companyId(), e.day, e.kind, e.category, e.party, e.description, e.doc_no, e.net, e.vat, e.total, e.currency, e.total_eur, e.paid_by, e.order_no, e.refund_paym, e.shop, e.note, who, e.orders],
  );
}

export async function deleteEntry(id: number) {
  const r = await q("DELETE FROM acc_entries WHERE id = $1 AND company_id = $2 RETURNING id", [id, companyId()]);
  if (!r.length) throw notFound("Няма такъв запис.");
}

// ---- bank ----
const BANK_COLS = `b.id::int AS id, b.account, b.day::text AS day, b.amount::float AS amount, b.currency, b.party, b.description, b.ref,
  b.balance::float AS balance, b.category, b.entry_id::int AS entry_id, b.note, e.category AS entry_category, e.doc_no AS entry_doc`;

function cleanBank(b: any) {
  const category = s(b?.category, 30);
  if (category && !BANK_CATS[category]) throw bad("category", "Непозната категория.");
  return {
    account: s(b?.account, 60),
    day: day(b?.day),
    amount: money(b?.amount, "движение"),
    currency: (s(b?.currency, 3) || "EUR").toUpperCase(),
    party: s(b?.party, 200),
    description: s(b?.description, 500),
    ref: s(b?.ref, 100),
    balance: b?.balance === undefined || b?.balance === null || b?.balance === "" ? null : money(b.balance, "салдо"),
    category,
    note: s(b?.note, 500),
  };
}

export async function listBank(month: string) {
  const [from, to] = monthRange(month);
  return q<any>(
    `SELECT ${BANK_COLS} FROM acc_bank b LEFT JOIN acc_entries e ON e.id = b.entry_id
      WHERE b.company_id = $1 AND b.day >= $2::date AND b.day < $3::date ORDER BY b.day DESC, b.id DESC`,
    [companyId(), from, to],
  );
}

export async function updateBank(id: number, b: any) {
  const cur = await one<any>("SELECT id FROM acc_bank WHERE id = $1 AND company_id = $2", [id, companyId()]);
  if (!cur) throw notFound("Няма такова движение.");
  if (b?.category !== undefined) {
    const c = s(b.category, 30);
    if (c && !BANK_CATS[c]) throw bad("category", "Непозната категория.");
    await q("UPDATE acc_bank SET category = $3 WHERE id = $1 AND company_id = $2", [id, companyId(), c]);
  }
  if (b?.note !== undefined) await q("UPDATE acc_bank SET note = $3 WHERE id = $1 AND company_id = $2", [id, companyId(), s(b.note, 500)]);
  if (b?.entry_id !== undefined) {
    const eid = b.entry_id === null ? null : Number(b.entry_id);
    if (eid !== null && !(await one("SELECT 1 FROM acc_entries WHERE id = $1 AND company_id = $2", [eid, companyId()]))) throw bad("entry", "Няма такъв разход.");
    await q("UPDATE acc_bank SET entry_id = $3 WHERE id = $1 AND company_id = $2", [id, companyId(), eid]);
  }
}

export async function deleteBank(id: number) {
  const r = await q("DELETE FROM acc_bank WHERE id = $1 AND company_id = $2 RETURNING id", [id, companyId()]);
  if (!r.length) throw notFound("Няма такова движение.");
}

/** An expense made from a bank payment (no invoice, e.g. a card charge from Meta): no VAT unless given. */
export async function expenseFromBank(id: number, b: any, who: string) {
  const line = await one<any>("SELECT id, day::text AS day, amount::float AS amount, currency, party, description, ref FROM acc_bank WHERE id = $1 AND company_id = $2", [id, companyId()]);
  if (!line) throw notFound("Няма такова движение.");
  if (line.amount >= 0) throw bad("in", "Това е постъпление, не плащане.");
  const category = s(b?.category, 30) || "other";
  const entry = await createEntry(
    { day: line.day, kind: "expense", category, party: line.party, description: line.description || line.ref, total: Math.abs(line.amount), vat: b?.vat ?? 0, currency: line.currency, total_eur: line.currency === "EUR" ? undefined : b?.total_eur, paid_by: "bank", doc_no: s(b?.doc_no, 60) },
    who,
  );
  await q("UPDATE acc_bank SET entry_id = $3, category = $4 WHERE id = $1 AND company_id = $2", [id, companyId(), entry, category]);
  return entry;
}

// ---- import (the end of the month: the bank statement and the invoices, already read) ----
// { entries: [{ key, day, kind, category, party, description, doc_no, net, vat, total, currency, total_eur, paid_by, … }],
//   bank: [{ key, account, day, amount, currency, party, description, ref, balance, category, entry_key }] }
// The same key again changes the row instead of adding another.
export async function importAll(b: any, who: string) {
  const entries = Array.isArray(b?.entries) ? b.entries : [];
  const bank = Array.isArray(b?.bank) ? b.bank : [];
  const ads = Array.isArray(b?.ads) ? b.ads : [];
  if (entries.length > 2000 || bank.length > 5000 || ads.length > 5000) throw bad("too_many", "Твърде много редове наведнъж.");
  const company = companyId();
  const A = ads.map((x: any, i: number) => {
    const account = s(x?.account, 60);
    if (!account) throw bad("ads", `Реклама №${i + 1}: липсва рекламният профил.`);
    const currency = (s(x?.currency, 3) || "EUR").toUpperCase();
    const spend = money(x?.spend, "реклама");
    const spendEur = currency === "EUR" ? spend : x?.spend_eur !== undefined ? money(x.spend_eur, "реклама в евро") : null;
    if (spendEur === null) throw bad("ads", `Реклама №${i + 1}: дай и сумата в евро.`);
    return { source: s(x?.source, 20) || "meta", account, name: s(x?.name, 120), day: day(x?.day), spend, currency, spendEur };
  });
  // Everything is checked before anything is written.
  const E = entries.map((e: any, i: number) => {
    const key = s(e?.key, 120);
    if (!key) throw bad("key", `Разход №${i + 1}: липсва key.`);
    try {
      return { key, v: cleanEntry(e) };
    } catch (err: any) {
      throw bad("entry", `Разход №${i + 1} (${key}): ${err.message}`);
    }
  });
  const B = bank.map((x: any, i: number) => {
    const key = s(x?.key, 120);
    if (!key) throw bad("key", `Движение №${i + 1}: липсва key.`);
    try {
      return { key, entryKey: s(x?.entry_key, 120), v: cleanBank(x) };
    } catch (err: any) {
      throw bad("bank", `Движение №${i + 1} (${key}): ${err.message}`);
    }
  });
  for (const e of E) if (e.v.kind === "refund") await checkRefundShop(e.v);
  return tx(async (t) => {
    let added = 0;
    let changed = 0;
    const ids = new Map<string, number>();
    for (const { key, v } of E) {
      const r = await t<any>(
        `INSERT INTO acc_entries (company_id, day, kind, category, party, description, doc_no, net, vat, total, currency, total_eur, paid_by, order_no, refund_paym, shop, note, who, source, ext_key, orders)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'import', $19, $20)
         ON CONFLICT (company_id, ext_key) DO UPDATE SET day = EXCLUDED.day, kind = EXCLUDED.kind, category = EXCLUDED.category, party = EXCLUDED.party,
           description = EXCLUDED.description, doc_no = EXCLUDED.doc_no, net = EXCLUDED.net, vat = EXCLUDED.vat, total = EXCLUDED.total,
           currency = EXCLUDED.currency, total_eur = EXCLUDED.total_eur, paid_by = EXCLUDED.paid_by, order_no = EXCLUDED.order_no,
           refund_paym = EXCLUDED.refund_paym, shop = EXCLUDED.shop, note = EXCLUDED.note, who = EXCLUDED.who, orders = EXCLUDED.orders, updated_at = now()
         RETURNING id::int AS id, (xmax = 0) AS inserted`,
        [company, v.day, v.kind, v.category, v.party, v.description, v.doc_no, v.net, v.vat, v.total, v.currency, v.total_eur, v.paid_by, v.order_no, v.refund_paym, v.shop, v.note, who, key, v.orders],
      );
      ids.set(key, r[0].id);
      r[0].inserted ? added++ : changed++;
    }
    let bankAdded = 0;
    let bankChanged = 0;
    const missing: string[] = [];
    for (const { key, entryKey, v } of B) {
      let entryId: number | null = null;
      if (entryKey) {
        entryId = ids.get(entryKey) ?? (await t<any>("SELECT id::int AS id FROM acc_entries WHERE company_id = $1 AND ext_key = $2", [company, entryKey]))[0]?.id ?? null;
        if (entryId === null) missing.push(entryKey);
      }
      const r = await t<any>(
        `INSERT INTO acc_bank (company_id, account, day, amount, currency, party, description, ref, balance, category, entry_id, note, ext_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (company_id, ext_key) DO UPDATE SET account = EXCLUDED.account, day = EXCLUDED.day, amount = EXCLUDED.amount,
           currency = EXCLUDED.currency, party = EXCLUDED.party, description = EXCLUDED.description, ref = EXCLUDED.ref, balance = EXCLUDED.balance,
           category = EXCLUDED.category, entry_id = coalesce(EXCLUDED.entry_id, acc_bank.entry_id), note = EXCLUDED.note
         RETURNING (xmax = 0) AS inserted`,
        [company, v.account, v.day, v.amount, v.currency, v.party, v.description, v.ref, v.balance, v.category, entryId, v.note, key],
      );
      r[0].inserted ? bankAdded++ : bankChanged++;
    }
    for (const a of A)
      await t(
        `INSERT INTO acc_ads (company_id, source, account, name, day, spend, currency, spend_eur) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (company_id, source, account, day) DO UPDATE SET name = EXCLUDED.name, spend = EXCLUDED.spend, currency = EXCLUDED.currency,
           spend_eur = EXCLUDED.spend_eur, updated_at = now()`,
        [company, a.source, a.account, a.name, a.day, a.spend, a.currency, a.spendEur],
      );
    return { entries: { added, changed }, bank: { added: bankAdded, changed: bankChanged }, ads: A.length, missingEntryKeys: missing };
  });
}

// ---- the month in money: profit, VAT, cash ----
type Month = {
  month: string;
  source: "orders" | "bank"; // откъде са приходите: поръчките в OrderDesk или постъпленията по банката (преди OrderDesk)
  vatRegistered: boolean; // регистрирана по ДДС през месеца (иначе – само ДДС върху Meta по чл. 97а)
  orders: number;
  revenue: number; // взети пари с ДДС
  revenueVat: number;
  revenueNet: number;
  revenueVatBg: number; // ДДС в продажбите в България (за справката към НАП)
  bankSales: number; // постъпленията от продажби по банката (наложени, карти, клиенти)
  refunds: number; // върнати суми на клиенти, без ДДС
  cogs: number; // себестойност на продадената стока
  cogsMissing: number; // редове без връзка със склада
  goodsBought: number; // купена стока през месеца (при поръчки от OrderDesk тя е в склада, не в печалбата)
  courierAuto: number; // по товарителниците
  courierInvoices: number; // от фактурите на куриерите
  courier: number; // това, което влиза в печалбата
  adsMeta: number; // Meta по рекламните профили
  expenses: Record<string, number>; // без ДДС, по категории (без куриерите); преди регистрацията – с ДДС
  expensesTotal: number;
  otherIncome: number;
  otherSales: number; // продажби от несвързани страници (в приходите)
  otherOrders: number; // броят им (не влиза в orders – за тях няма себестойност от склада)
  purchaseVat: number;
  profit: number;
  vatDue: number; // ориентировъчно
  vatActual: number | null; // реалният, от счетоводителя (ако е въведен)
  returned: number; // върнати пратки (брой)
  ownerOut: number; // преведено от фирмата на собственика (не е в печалбата)
  ownerIn: number; // внесено от собственика във фирмата
};

const addMonth = (m: string, n: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const META_VAT = 0.2;

export async function report(fromMonth: string, toMonth: string) {
  if (!isMonth(fromMonth) || !isMonth(toMonth) || fromMonth > toMonth) throw bad("month", "Провери месеците.");
  const months: string[] = [];
  for (let m = fromMonth; m <= toMonth && months.length < 24; m = addMonth(m, 1)) months.push(m);
  const [from] = monthRange(months[0]);
  const [, to] = monthRange(months[months.length - 1]);
  const company = companyId();
  const set0 = await accSettings();
  const reg = (m: string) => !set0.vatFrom || m >= set0.vatFrom;
  const fromBank = (m: string) => Boolean(set0.ordersFrom) && m < set0.ordersFrom;
  const M = new Map<string, Month>(
    months.map((m) => [
      m,
      {
        month: m, source: fromBank(m) ? "bank" : "orders", vatRegistered: reg(m), orders: 0, revenue: 0, revenueVat: 0, revenueNet: 0, revenueVatBg: 0, bankSales: 0,
        refunds: 0, cogs: 0, cogsMissing: 0, goodsBought: 0, courierAuto: 0, courierInvoices: 0, courier: 0, adsMeta: 0, expenses: {}, expensesTotal: 0,
        otherIncome: 0, otherSales: 0, otherOrders: 0, purchaseVat: 0, profit: 0, vatDue: 0, vatActual: null, returned: 0, ownerOut: 0, ownerIn: 0,
      },
    ]),
  );

  const ownerNames = set0.owner.names.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).map((x) => `%${x}%`);
  const [{ orders, set, shops }, links, courier, entries, returned, ads, sales, owner] = await Promise.all([
    deliveredBetween(from, to),
    q<any>(
      `SELECT lower(btrim(l.product)) AS p, l.units::float AS units, i.unit_cost::float AS cost
         FROM stock_links l JOIN stock_items i ON i.id = l.item_id WHERE i.company_id = $1`,
      [company],
    ),
    q<any>(
      `SELECT to_char(o.sent_at AT TIME ZONE 'Europe/Sofia', 'YYYY-MM') AS m, coalesce(sum(o.courier_cost), 0)::float AS cost
         FROM orders o JOIN shops s ON s.id = o.shop
        WHERE s.company_id = $1 AND o.sent_at >= ($2::date::timestamp AT TIME ZONE 'Europe/Sofia') AND o.sent_at < ($3::date::timestamp AT TIME ZONE 'Europe/Sofia')
          AND o.courier_cost IS NOT NULL GROUP BY 1`,
      [company, from, to],
    ),
    q<any>(
      `SELECT to_char(day, 'YYYY-MM') AS m, kind, category, coalesce(sum(net * total_eur / nullif(total, 0)), 0)::float AS net,
              coalesce(sum(vat * total_eur / nullif(total, 0)), 0)::float AS vat, coalesce(sum(total_eur), 0)::float AS total,
              coalesce(sum(orders), 0)::int AS n
         FROM acc_entries WHERE company_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1, 2, 3`,
      [company, from, to],
    ),
    q<any>(
      `SELECT to_char(coalesce(o.parcel_at, o.ordered_at) AT TIME ZONE 'Europe/Sofia', 'YYYY-MM') AS m, count(*)::int AS n
         FROM orders o JOIN shops s ON s.id = o.shop
        WHERE s.company_id = $1 AND o.stage = 'returned' AND coalesce(o.parcel_at, o.ordered_at) >= ($2::date::timestamp AT TIME ZONE 'Europe/Sofia')
          AND coalesce(o.parcel_at, o.ordered_at) < ($3::date::timestamp AT TIME ZONE 'Europe/Sofia') GROUP BY 1`,
      [company, from, to],
    ),
    q<any>(
      `SELECT to_char(day, 'YYYY-MM') AS m, coalesce(sum(spend_eur), 0)::float AS eur FROM acc_ads
        WHERE company_id = $1 AND source = 'meta' AND day >= $2::date AND day < $3::date GROUP BY 1`,
      [company, from, to],
    ),
    q<any>(
      `SELECT to_char(day, 'YYYY-MM') AS m, coalesce(sum(amount), 0)::float AS sum FROM acc_bank
        WHERE company_id = $1 AND amount > 0 AND category = ANY($4) AND day >= $2::date AND day < $3::date GROUP BY 1`,
      [company, from, to, SALES_IN],
    ),
    q<any>(
      `SELECT to_char(day, 'YYYY-MM') AS m, coalesce(sum(CASE WHEN amount < 0 THEN -amount END), 0)::float AS out,
              coalesce(sum(CASE WHEN amount > 0 THEN amount END), 0)::float AS inn
         FROM acc_bank WHERE company_id = $1 AND day >= $2::date AND day < $3::date
          AND (category IN ('owner', 'loan') OR upper(party) LIKE ANY($4::text[])) GROUP BY 1`,
      [company, from, to, ownerNames],
    ),
  ]);
  const cost = new Map<string, number>();
  for (const l of links) cost.set(l.p, (cost.get(l.p) || 0) + l.units * l.cost);
  const region = new Map(shops.map((x) => [x.id, x.region]));

  for (const o of orders) {
    const x = M.get(o.delivered.slice(0, 7));
    if (!x) continue;
    x.orders++;
    if (x.source === "bank") continue; // приходите на месеца са от банката
    x.revenue = r2(x.revenue + o.gross);
    if (x.vatRegistered) {
      x.revenueVat = r2(x.revenueVat + o.vat);
      x.revenueNet = r2(x.revenueNet + o.net);
      if (region.get(o.shop) === "bg") x.revenueVatBg = r2(x.revenueVatBg + o.vat);
    } else x.revenueNet = r2(x.revenueNet + o.gross);
    for (const l of o.lines) {
      if (l.kind !== "physical" || l.name === "Други") continue;
      const c = cost.get(l.name.trim().toLowerCase());
      if (c === undefined) x.cogsMissing++;
      else x.cogs = r2(x.cogs + c * l.qty);
    }
  }
  for (const s of sales) {
    const x = M.get(s.m);
    if (!x) continue;
    x.bankSales = r2(s.sum);
    if (x.source !== "bank") continue;
    // Преди OrderDesk: приходите са постъпленията по банката; ДДС 20% вътре, ако фирмата е регистрирана.
    x.revenue = r2(s.sum);
    x.revenueNet = x.vatRegistered ? r2(s.sum / 1.2) : r2(s.sum);
    x.revenueVat = r2(x.revenue - x.revenueNet);
    x.revenueVatBg = x.revenueVat;
  }
  for (const c of courier) {
    const x = M.get(c.m);
    if (x) x.courierAuto = r2(c.cost);
  }
  for (const r of returned) {
    const x = M.get(r.m);
    if (x) x.returned = r.n;
  }
  for (const o of owner) {
    const x = M.get(o.m);
    if (!x) continue;
    x.ownerOut = r2(o.out);
    x.ownerIn = r2(o.inn);
  }
  for (const a of ads) {
    const x = M.get(a.m);
    if (!x) continue;
    x.adsMeta = r2(a.eur);
    if (x.adsMeta) x.expenses.ads_meta = x.adsMeta;
  }
  for (const e of entries) {
    const x = M.get(e.m);
    if (!x) continue;
    // Без регистрация ДДС от фактурите не се приспада – разходът е с ДДС.
    const net = x.vatRegistered ? e.net : e.total;
    const vat = x.vatRegistered ? e.vat : 0;
    if (e.kind === "refund") x.refunds = r2(x.refunds + net);
    else if (e.kind === "income" && e.category === "sales_cb") {
      // Продажби от несвързаните страници: приход като поръчките (в месец „банка“ вече са в постъпленията).
      x.otherSales = r2(x.otherSales + e.total);
      x.otherOrders += Number(e.n) || 0;
      if (x.source === "bank") continue;
      x.revenue = r2(x.revenue + e.total);
      x.revenueNet = r2(x.revenueNet + net);
      x.revenueVat = r2(x.revenueVat + vat);
      x.revenueVatBg = r2(x.revenueVatBg + vat);
    } else if (e.kind === "income") x.otherIncome = r2(x.otherIncome + net);
    else if (e.category === "courier") {
      x.courierInvoices = r2(x.courierInvoices + net);
      x.purchaseVat = r2(x.purchaseVat + vat);
    } else if (e.category === "goods" && x.source === "orders" && x.orders > 0) {
      // Стоката отива в склада; в печалбата е себестойността на продаденото (месец без поръчки в OrderDesk – купеното е разход).
      x.goodsBought = r2(x.goodsBought + net);
      x.purchaseVat = r2(x.purchaseVat + vat);
    } else {
      x.expenses[e.category] = r2((x.expenses[e.category] || 0) + net);
      x.purchaseVat = r2(x.purchaseVat + vat);
    }
  }
  for (const x of M.values()) {
    // Преди регистрацията ДДС върху Meta (и другите услуги от чужбина) се плаща по чл. 97а и не се приспада – разход.
    // Ако платеното е въведено (vat97a), е то; иначе – 20% от Meta, ориентировъчно.
    if (!x.vatRegistered && x.adsMeta && !x.expenses.vat97a) x.expenses.meta_vat = r2(x.adsMeta * META_VAT);
    x.courier = x.courierInvoices > 0 ? x.courierInvoices : x.courierAuto;
    x.expensesTotal = r2(Object.values(x.expenses).reduce((a, b) => a + b, 0));
    x.profit = r2(x.revenueNet - x.refunds + x.otherIncome - x.cogs - x.courier - x.expensesTotal);
    x.vatDue = x.vatRegistered ? r2(x.revenueVatBg - x.purchaseVat) : r2((x.expenses.vat97a || 0) + (x.expenses.meta_vat || 0));
    x.vatActual = set0.vatActual[x.month] ?? null;
  }
  const list = months.map((m) => M.get(m)!);
  const sum = (k: keyof Month) => r2(list.reduce((a, x) => a + (Number(x[k]) || 0), 0));
  const expenses: Record<string, number> = {};
  for (const x of list) for (const [k, v] of Object.entries(x.expenses)) expenses[k] = r2((expenses[k] || 0) + v);
  return {
    months: list,
    total: {
      orders: sum("orders"), revenue: sum("revenue"), revenueNet: sum("revenueNet"), refunds: sum("refunds"), cogs: sum("cogs"),
      courier: sum("courier"), expenses, expensesTotal: sum("expensesTotal"), otherIncome: sum("otherIncome"), profit: sum("profit"),
      goodsBought: sum("goodsBought"), adsMeta: sum("adsMeta"), otherSales: sum("otherSales"), otherOrders: sum("otherOrders"), ownerOut: sum("ownerOut"), ownerIn: sum("ownerIn"),
    },
    vatMissing: shops.filter((x) => !shopAcc(set, x).vatSet).map((x) => x.label),
    categories: { ...EXPENSE_CATS, ...AUTO_CATS },
    vatFrom: set0.vatFrom,
    ordersFrom: set0.ordersFrom,
    owner: set0.owner.label,
  };
}

/** The month in the bank: in and out by category, the last balance, and what the couriers should have paid. */
export async function cashMonth(month: string) {
  const [from, to] = monthRange(month);
  const company = companyId();
  const [lines, accounts, cod] = await Promise.all([
    q<any>(
      `SELECT category, (amount > 0) AS incoming, count(*)::int AS n, sum(amount)::float AS sum
         FROM acc_bank WHERE company_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1, 2`,
      [company, from, to],
    ),
    q<any>(
      `SELECT DISTINCT ON (account) account, day::text AS day, balance::float AS balance FROM acc_bank
        WHERE company_id = $1 AND day < $2::date AND balance IS NOT NULL ORDER BY account, day DESC, id DESC`,
      [company, to],
    ),
    q<any>(
      `SELECT CASE WHEN ${COURIER_SQL} = 'econt' THEN 'cod_econt' WHEN ${COURIER_SQL} = 'speedy' THEN 'cod_speedy' END AS cat,
              count(*)::int AS n, coalesce(sum(o.total_eur), 0)::float AS sum
         FROM orders o JOIN shops s ON s.id = o.shop
        WHERE s.company_id = $1 AND s.region = 'bg' AND o.stage = 'delivered' AND NOT o.paid
          AND ${DELIVERED_AT} >= ($2::date::timestamp AT TIME ZONE 'Europe/Sofia') AND ${DELIVERED_AT} < ($3::date::timestamp AT TIME ZONE 'Europe/Sofia')
        GROUP BY 1`,
      [company, from, to],
    ),
  ]);
  const byCat: Record<string, { in: number; out: number; n: number }> = {};
  let inSum = 0;
  let outSum = 0;
  let unsorted = 0;
  for (const l of lines) {
    const k = l.category || "";
    const b = (byCat[k] ||= { in: 0, out: 0, n: 0 });
    b.n += l.n;
    if (l.incoming) {
      b.in = r2(b.in + l.sum);
      inSum = r2(inSum + l.sum);
    } else {
      b.out = r2(b.out + l.sum);
      outSum = r2(outSum + l.sum);
    }
    if (!k) unsorted += l.n;
  }
  const expected = Object.fromEntries(cod.filter((c) => c.cat).map((c) => [c.cat, { orders: c.n, sum: r2(c.sum) }]));
  return {
    month,
    in: inSum,
    out: outSum,
    byCat,
    unsorted,
    balances: accounts,
    cod: ["cod_econt", "cod_speedy"].map((k) => ({ cat: k, label: BANK_CATS[k], expected: expected[k] || { orders: 0, sum: 0 }, received: byCat[k]?.in || 0 })),
  };
}
const COURIER_SQL = `(CASE WHEN o.courier IN ('econt', 'speedy') THEN o.courier WHEN o.delivery->>'courier' IN ('econt', 'speedy') THEN o.delivery->>'courier'
  WHEN o.shipping_name ~* '(еконт|econt)' THEN 'econt' WHEN o.shipping_name ~* '(спиди|speedy|dpd)' THEN 'speedy' END)`;

/** Last month that has something, for opening the page on it. */
export async function months() {
  const r = await q<any>(
    `SELECT DISTINCT to_char(day, 'YYYY-MM') AS m FROM (SELECT day FROM acc_entries WHERE company_id = $1 UNION ALL SELECT day FROM acc_bank WHERE company_id = $1
       UNION ALL SELECT day FROM acc_ads WHERE company_id = $1) x ORDER BY 1 DESC LIMIT 36`,
    [companyId()],
  );
  return r.map((x) => x.m);
}

