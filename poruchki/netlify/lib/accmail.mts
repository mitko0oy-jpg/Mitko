// Месечното писмо до счетоводителката: продажбите за предходния месец по държави и по магазини
// (физически / дигитални / доставка – всяка група със своето ДДС), Excel с всички взети поръчки
// и одиторските файлове за НАП на регистрираните магазини. Тръгва само на избрания ден (по подразбиране 5-о);
// ако до 15-о нещо в данните се промени (късен статус от куриера, върната сума), тръгва поправка.
import { createHash } from "node:crypto";
import { getSetting, one, q, setSetting, tx } from "./db.mts";
import { sofiaDay } from "./dates.mts";
import { emailSettings, sendEmail } from "./email.mts";
import { cKey, companyId } from "./tenant.mts";
import { accSettings, KIND_LABEL, monthSales, prevMonth, r2 } from "./sales.mts";
import { napMonth, NapFile, PAYM_LABEL } from "./nap.mts";

const MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const eur = (n: number) => `${r2(n).toFixed(2).replace(".", ",")} €`;
const csvNum = (n: number) => r2(n).toFixed(2).replace(".", ",");
const csvCell = (v: unknown) => {
  const t = String(v ?? "");
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const PAY: Record<string, string> = { cod_econt: "Наложен платеж – Еконт", cod_speedy: "Наложен платеж – Спиди", cod_other: "Наложен платеж", bank: "Банков превод", card: "Карта", other: "Друго" };
const COUNTRY_NAME: Record<string, string> = { BG: "България", SK: "Словакия", SI: "Словения", HU: "Унгария", RO: "Румъния", GR: "Гърция", CZ: "Чехия", HR: "Хърватия", PL: "Полша", DE: "Германия", AT: "Австрия" };
export const countryName = (c: string) => COUNTRY_NAME[c] || c || "неизвестна";

type Sales = Awaited<ReturnType<typeof monthSales>>;

/** Every delivered order of the month, one row each – for Excel (semicolons, comma decimals, BOM). */
export function salesCsv(sales: Sales, labels: Map<string, string>): string {
  const head = ["Магазин", "Държава", "Поръчка №", "Поръчана на", "Доставена на", "Плащане", "Физически с ДДС", "ДДС % физ.", "Дигитални с ДДС", "ДДС % диг.", "Доставка с ДДС", "Отстъпка", "Общо с ДДС", "ДДС", "Без ДДС"];
  const rows = [head.join(";")];
  for (const o of sales.orders) {
    const part = (k: string) => o.lines.filter((l) => l.kind === k);
    const sum = (k: string) => part(k).reduce((a, l) => a + l.gross, 0);
    const rates = (k: string) => [...new Set(part(k).map((l) => l.rate))].join("/");
    rows.push(
      [labels.get(o.shop) || o.shop, o.country, o.order_no, o.ordered, o.delivered, PAY[o.payKind] || o.payKind, csvNum(sum("physical")), rates("physical"), csvNum(sum("digital")), rates("digital"), csvNum(sum("shipping")), csvNum(o.discount), csvNum(o.gross), csvNum(o.vat), csvNum(o.net)]
        .map(csvCell)
        .join(";"),
    );
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}

const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TD = 'style="padding:4px 10px;border-bottom:1px solid #e5e7eb"';
const TDR = 'style="padding:4px 10px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap"';
const TH = 'style="padding:4px 10px;border-bottom:2px solid #d1d5db;text-align:left;font-size:13px;color:#4b5563"';
const table = (head: string[], rows: string[][], right: number[]) =>
  `<table style="border-collapse:collapse;font-size:14px;margin:6px 0 14px">` +
  `<tr>${head.map((x, i) => `<th ${right.includes(i) ? TH.replace("text-align:left", "text-align:right") : TH}>${h(x)}</th>`).join("")}</tr>` +
  rows.map((r) => `<tr>${r.map((x, i) => `<td ${right.includes(i) ? TDR : TD}>${x}</td>`).join("")}</tr>`).join("") +
  `</table>`;

export type Pack = { month: string; sales: Sales; files: NapFile[]; csv: string; sha: string; labels: Map<string, string> };

export async function monthPack(month: string): Promise<Pack> {
  const sales = await monthSales(month);
  const files = await napMonth(month);
  const labels = new Map((await q<any>("SELECT id, label FROM shops WHERE company_id = $1", [companyId()])).map((s) => [s.id, s.label]));
  const csv = salesCsv(sales, labels);
  const refunds = await q<any>(
    "SELECT order_no, shop, total_eur::float AS t, day::text AS day FROM acc_entries WHERE company_id = $1 AND kind = 'refund' AND to_char(day, 'YYYY-MM') = $2 ORDER BY id",
    [companyId(), month],
  );
  const sha = createHash("sha256")
    .update(JSON.stringify({ csv, refunds, files: files.map((f) => [f.shop, f.sha, f.errors]) }))
    .digest("hex");
  return { month, sales, files, csv, sha, labels };
}

/** The letter: what was sold, where, at which VAT – and what is attached. */
export function packLetter(p: Pack, opts: { correction?: string | null; company: string; greeting: string }) {
  const s = p.sales;
  const title = `${opts.correction ? "Поправка: " : ""}Продажби за ${monthName(p.month)}${opts.company ? ` – ${opts.company}` : ""}`;
  const html: string[] = [];
  const text: string[] = [];
  html.push(`<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2933">`);
  html.push(`<p>${h(opts.greeting)}</p>`);
  text.push(opts.greeting, "");
  if (opts.correction) {
    html.push(`<p><b>Това е поправка</b> на писмото от ${h(opts.correction)} – заменя го (данните за месеца са се променили).</p>`);
    text.push(`Това е поправка на писмото от ${opts.correction} – заменя го.`, "");
  }
  html.push(`<p>Продажбите за <b>${monthName(p.month)}</b> – взетите поръчки (по датата на доставка): <b>${s.total.orders}</b> поръчки за <b>${eur(s.total.gross)}</b> с ДДС (ДДС ${eur(s.total.vat)}, без ДДС ${eur(s.total.net)}).</p>`);
  text.push(`Продажбите за ${monthName(p.month)} (взети поръчки, по датата на доставка): ${s.total.orders} поръчки, ${eur(s.total.gross)} с ДДС, ДДС ${eur(s.total.vat)}, без ДДС ${eur(s.total.net)}.`, "");

  html.push(`<h3 style="margin:16px 0 4px;font-size:16px">По държави</h3>`);
  const cRows = s.countries.flatMap((c) => {
    const main = [`<b>${h(countryName(c.country))}</b>`, String(c.orders), eur(c.gross), eur(c.vat), eur(c.net)];
    const rates = c.rates.length > 1 ? c.rates.map((r) => [`&nbsp;&nbsp;в т.ч. ДДС ${r.rate}%`, "", eur(r.gross), eur(r.vat), eur(r.net)]) : [];
    return [main, ...rates];
  });
  html.push(table(["Държава", "Поръчки", "С ДДС", "ДДС", "Без ДДС"], cRows.length ? cRows : [["няма", "", "", "", ""]], [1, 2, 3, 4]));
  text.push("По държави:");
  for (const c of s.countries) text.push(`- ${countryName(c.country)}: ${c.orders} поръчки, ${eur(c.gross)} с ДДС, ДДС ${eur(c.vat)}, без ДДС ${eur(c.net)}${c.rates.length > 1 ? ` (${c.rates.map((r) => `${r.rate}%: ${eur(r.gross)}`).join(", ")})` : ""}`);
  text.push("");

  html.push(`<h3 style="margin:16px 0 4px;font-size:16px">По магазини – физически и дигитални продукти</h3>`);
  text.push("По магазини:");
  for (const sh of s.shops) {
    html.push(`<p style="margin:10px 0 0"><b>${h(sh.label)}</b> (${h(countryName(sh.country))}) – ${sh.orders} поръчки, ${eur(sh.gross)} с ДДС</p>`);
    html.push(table(["", "ДДС", "С ДДС", "ДДС", "Без ДДС"], sh.parts.map((pt) => [h(KIND_LABEL[pt.kind]), `${pt.rate}%`, eur(pt.gross), eur(pt.vat), eur(pt.net)]), [1, 2, 3, 4]));
    text.push(`${sh.label} (${countryName(sh.country)}): ${sh.orders} поръчки, ${eur(sh.gross)}`);
    for (const pt of sh.parts) text.push(`  ${KIND_LABEL[pt.kind]} – ДДС ${pt.rate}%: ${eur(pt.gross)} с ДДС, ДДС ${eur(pt.vat)}, без ДДС ${eur(pt.net)}`);
  }
  if (!s.shops.length) {
    html.push(`<p>Няма взети поръчки през месеца.</p>`);
    text.push("Няма взети поръчки през месеца.");
  }
  text.push("");

  const ready = p.files.filter((f) => f.bytes);
  if (p.files.length) {
    html.push(`<h3 style="margin:16px 0 4px;font-size:16px">Одиторски файл по Наредба Н-18</h3>`);
    text.push("Одиторски файл по Наредба Н-18:");
    const fRows = p.files.map((f) => [
      `${h(f.label)}<br><span style="color:#6b7280;font-size:13px">№ ${h(f.eShopN || "–")} · ${h(f.url)}</span>`,
      String(f.orders),
      eur(f.gross),
      f.bytes ? `приложен: ${h(f.fileName)}` : `<span style="color:#b91c1c">няма файл: ${h([...f.errors, ...f.warnings.filter((w) => /Няма доставени/.test(w))].join(" ") || "–")}</span>`,
    ]);
    html.push(table(["Магазин", "Поръчки", "С ДДС", "Файл"], fRows, [1, 2]));
    for (const f of p.files) text.push(`- ${f.label} (№ ${f.eShopN || "–"}): ${f.orders} поръчки, ${eur(f.gross)} – ${f.bytes ? `приложен ${f.fileName}` : `няма файл (${f.errors.join(" ") || "няма доставени поръчки"})`}`);
    if (ready.length) {
      const codes = [...new Set(ready.flatMap((f) => Object.keys(f.byPaym)))].sort();
      html.push(`<p style="font-size:13px;color:#4b5563">Кодове за плащане във файла: ${codes.map((c) => h(PAYM_LABEL[Number(c)] || c)).join("; ")}. Файлът е проверен по схемата на НАП; подава се през портала на НАП с КЕП до 15-о число.</p>`);
      text.push(`Кодове за плащане: ${codes.map((c) => PAYM_LABEL[Number(c)] || c).join("; ")}. Подава се с КЕП до 15-о число.`);
    }
    text.push("");
  }
  const warn = [...s.warnings, ...p.files.flatMap((f) => f.warnings.filter((w) => !/Няма доставени/.test(w)).map((w) => `${f.label}: ${w}`))];
  if (warn.length) {
    html.push(`<p style="font-size:13px;color:#92400e"><b>За сведение:</b><br>${warn.map(h).join("<br>")}</p>`);
    text.push("За сведение:", ...warn.map((w) => `- ${w}`), "");
  }
  html.push(`<p style="font-size:13px;color:#4b5563">Приложен е и Excel файл с всички взети поръчки за месеца (по поръчка: държава, плащане, физически / дигитални / доставка, ДДС).</p>`);
  html.push(`<p style="font-size:12px;color:#9ca3af">Писмото е изпратено автоматично от OrderDesk.</p></div>`);
  text.push("Приложен е Excel файл с всички взети поръчки за месеца.", "", "Писмото е изпратено автоматично от OrderDesk.");
  return { subject: title, html: html.join(""), text: text.join("\n") };
}

async function ownerEmail(): Promise<string> {
  const r = await one<any>("SELECT email FROM users WHERE company_id = $1 AND role = 'admin' ORDER BY id LIMIT 1", [companyId()]);
  return r?.email || "";
}

async function lastSent(month: string) {
  return one<any>("SELECT sha, at, sent_to FROM nap_sent WHERE company_id = $1 AND month = $2 AND shop = '*' AND ok ORDER BY at DESC LIMIT 1", [companyId(), month]);
}

/** Sends the month's letter now (by hand or from the schedule). */
export async function sendPack(month: string, opts: { auto: boolean; pack?: Pack; correctionOf?: string | null; cc?: string }) {
  const set = await accSettings();
  const to = set.accountant.email;
  if (!to) throw new Error("Няма имейл на счетоводителя (Счетоводство → Настройки).");
  const p = opts.pack || (await monthPack(month));
  const letter = packLetter(p, {
    correction: opts.correctionOf || null,
    company: set.companyName,
    greeting: set.accountant.name ? `Здравейте, ${set.accountant.name},` : "Здравейте,",
  });
  const attachments = [
    { name: `prodazhbi_${month}.csv`, content: Buffer.from(p.csv, "utf8").toString("base64") },
    ...p.files.filter((f) => f.bytes).map((f) => ({ name: f.fileName, content: f.bytes!.toString("base64") })),
  ];
  const cc = [opts.cc || "", set.accountant.copyMe ? await ownerEmail() : ""].filter(Boolean);
  try {
    await sendEmail({ to, name: set.accountant.name || undefined, subject: letter.subject, text: letter.text, html: letter.html, cc, attachments });
  } catch (e: any) {
    await q("INSERT INTO nap_sent (company_id, shop, month, sha, sent_to, auto, ok, error) VALUES ($1, '*', $2, $3, $4, $5, false, $6)", [companyId(), month, p.sha, to, opts.auto, String(e.message).slice(0, 300)]);
    throw e;
  }
  await q(
    "INSERT INTO nap_sent (company_id, shop, month, sha, orders, total, sent_to, auto) VALUES ($1, '*', $2, $3, $4, $5, $6, $7)",
    [companyId(), month, p.sha, p.sales.total.orders, p.sales.total.gross, to, opts.auto],
  );
  for (const f of p.files.filter((x) => x.bytes))
    await q("INSERT INTO nap_sent (company_id, shop, month, sha, orders, total, sent_to, auto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [companyId(), f.shop, month, f.sha, f.orders, f.gross, to, opts.auto]);
  return { to, cc, subject: letter.subject, files: attachments.map((a) => a.name) };
}

/**
 * From the sync (every 30 minutes): on the chosen day the letter for last month goes once; until the 15th a
 * changed month goes again as a correction (at most once a day). Sent late (set up after the day) – still once.
 */
export async function runMonthlyMail(now = new Date()) {
  const set = await accSettings();
  if (!set.accountant.auto || !set.accountant.email) return { skip: "off" };
  if (!(await emailSettings()).configured) return { skip: "no email" };
  const today = sofiaDay(now);
  const dom = Number(today.slice(8, 10));
  if (dom < set.accountant.day) return { skip: "not yet" };
  const month = prevMonth(today);
  return tx(async (t) => {
    const lock = await t<any>("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok", [`accmail:${companyId()}`]);
    if (!lock[0]?.ok) return { skip: "busy" };
    const last = await lastSent(month);
    if (last && (dom > 15 || Date.now() - new Date(last.at).getTime() < 20 * 3600 * 1000)) return { skip: "sent" };
    // After the letter has gone, a change is looked for once a day (the month is not rebuilt every 30 minutes).
    const checkedKey = cKey("accmail_checked");
    if (last && (await getSetting<string>(checkedKey)) === `${month}:${today}`) return { skip: "checked today" };
    const pack = await monthPack(month);
    if (last && last.sha === pack.sha) {
      await setSetting(checkedKey, `${month}:${today}`);
      return { skip: "same" };
    }
    const r = await sendPack(month, { auto: true, pack, correctionOf: last ? sofiaDay(new Date(last.at)) : null });
    return { sent: month, correction: Boolean(last), ...r };
  });
}

/** What was sent for the month (for the page). */
export async function sentLog(month: string) {
  return q<any>(
    "SELECT shop, sha, orders, total::float AS total, sent_to, auto, ok, error, at FROM nap_sent WHERE company_id = $1 AND month = $2 ORDER BY at DESC LIMIT 50",
    [companyId(), month],
  );
}
