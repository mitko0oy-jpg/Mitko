// Счетоводство: печалба по месеци, продажбите за счетоводителката, разходи, банка, файлът за НАП, настройки.
import { api, esc, eur, num, shell } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("schetovodstvo");
const view = $("view");
const dlg = $("dlg");

if (me.role !== "admin") {
  view.innerHTML = `<section class="card empty">Счетоводството е само за собственика.</section>`;
  throw new Error("owner only");
}

// ---- month and tab (in the address, so a reload stays on the same place) ----
const today = new Date();
const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const params = new URLSearchParams(location.search);
let month = /^\d{4}-\d{2}$/.test(params.get("m") || "") ? params.get("m") : ym(lastMonth);
let tab = location.hash.slice(1) || "otchet";
$("month").value = month;
$("month").max = ym(today);

const MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
const mName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mShort = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(2, 4)}`;
const addM = (m, n) => {
  const [y, mm] = m.split("-").map(Number);
  return ym(new Date(y, mm - 1 + n, 1));
};
const COUNTRY = { BG: "България", SK: "Словакия", SI: "Словения", HU: "Унгария", RO: "Румъния", GR: "Гърция", CZ: "Чехия", HR: "Хърватия", PL: "Полша", DE: "Германия", AT: "Австрия" };
const cname = (c) => COUNTRY[c] || c || "неизвестна";
const KIND = { physical: "Физически продукти", digital: "Дигитални продукти", shipping: "Доставка" };
const PAY = { cod_econt: "Наложен платеж – Еконт", cod_speedy: "Наложен платеж – Спиди", cod_other: "Наложен платеж – друг куриер", bank: "Банков превод", card: "Карта", other: "Друго (платено)" };
const PAYM = { 1: "1 – без ППП (напр. банков превод)", 2: "2 – виртуален ПОС", 3: "3 – наложен платеж с ППП", 4: "4 – доставчик на платежни услуги", 5: "5 – друг", 6: "6 – отразено с фискален бон" };
const day = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");
const signed = (n) => `<span class="${n < 0 ? "err" : n > 0 ? "ok" : ""}">${eur(n, true)}</span>`;

let meta = null; // categories and settings
async function getMeta(force) {
  if (!meta || force) meta = await api("/api/acc/settings");
  return meta;
}

function setTab(t) {
  tab = t;
  history.replaceState(null, "", `?m=${month}#${t}`);
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  render();
}
$("tabs").onclick = (e) => {
  const b = e.target.closest("button[data-t]");
  if (b) setTab(b.dataset.t);
};
$("month").onchange = () => {
  if (/^\d{4}-\d{2}$/.test($("month").value)) {
    month = $("month").value;
    setTab(tab);
  }
};
$("reload").onclick = () => render(true);

async function render(force) {
  view.innerHTML = `<section class="card empty">Зареждам…</section>`;
  try {
    await getMeta(force);
    await (TABS[tab] || TABS.otchet)();
  } catch (e) {
    view.innerHTML = `<section class="card err">${esc(e.message)}</section>`;
  }
}

// ---- dialogs ----
function open(title, bodyHtml, footHtml) {
  dlg.innerHTML = `<form method="dialog" class="mh"><h2>${title}</h2><button class="iconbtn" value="close" aria-label="Затвори">✕</button></form>
    <form class="mb" id="f">${bodyHtml}<p class="err small" id="ferr"></p></form>
    <div class="mf">${footHtml}</div>`;
  if (!dlg.open) dlg.showModal();
  $("f").onsubmit = (e) => e.preventDefault();
  dlg.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => dlg.close()));
  return $("f");
}
async function busy(btn, fn, label = "Запазвам…") {
  const t = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = t;
  }
}
const formData = (f) => Object.fromEntries(new FormData(f).entries());

// ================= Печалба =================
async function otchet() {
  const from = addM(month, -11);
  const r = await api(`/api/acc/report?from=${from}&to=${month}`);
  const cur = r.months[r.months.length - 1];
  const cats = r.categories || meta.categories.expense;
  const tile = (lbl, val, sub, cls = "") => `<div class="tile"><div class="lbl">${lbl}</div><div class="big ${cls}">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  const exp = Object.entries(cur.expenses).sort((a, b) => b[1] - a[1]);
  const fromBank = cur.source === "bank";
  const goodsCost = (x) => x.source === "bank" || !x.orders;
  view.innerHTML = `
    ${r.vatMissing.length ? `<p class="note">Няма зададено ДДС за ${esc(r.vatMissing.join(", "))} – приходите там са без приспаднато ДДС. Задай го в <a href="#nastroiki" data-go="nastroiki">Настройки</a>.</p>` : ""}
    ${fromBank ? `<p class="note">${mName(month)} е преди поръчките в OrderDesk – приходите са постъпленията по банката (наложени платежи, карти, клиенти), а стоката е по фактурите за покупка.</p>` : ""}
    ${cur.vatRegistered ? "" : `<p class="note">Преди регистрацията по ДДС: продажбите са без ДДС, разходите са с ДДС, а ДДС върху Meta (чл. 97а) е разход.</p>`}
    <section class="tiles acctiles">
      ${tile(`${fromBank ? "Постъпления от продажби" : "Взети пари"} · ${mName(month)}`, eur(cur.revenue, true), (fromBank ? `по банката · ${num(cur.orders)} поръчки в OrderDesk` : `${num(cur.orders + (cur.otherOrders || 0))} поръчки · ДДС ${eur(cur.revenueVat, true)}`) + (cur.otherSales && !fromBank ? ` · в т.ч. ${eur(cur.otherSales, true)} от други страници (${num(cur.otherOrders || 0)} поръчки)` : ""))}
      ${tile(cur.vatRegistered ? "Приходи без ДДС" : "Приходи", eur(cur.revenueNet - cur.refunds + cur.otherIncome, true), cur.refunds ? `след върнати ${eur(cur.refunds, true)}` : "")}
      ${tile("Себестойност на стоката", eur(goodsCost(cur) ? cur.expenses.goods || 0 : cur.cogs, true), goodsCost(cur) ? "купената стока през месеца" : cur.cogsMissing ? `${num(cur.cogsMissing)} реда без връзка със склада` : `по доставните цени в склада${cur.goodsBought ? ` · купено ${eur(cur.goodsBought, true)}` : ""}`)}
      ${tile("Куриери", eur(cur.courier, true), cur.courierInvoices > 0 ? "от фактурите" : "по товарителниците (приблизително)")}
      ${tile("Реклама Meta", eur(cur.adsMeta, true), cur.adsMeta ? `${cur.revenueNet ? `${((cur.adsMeta / cur.revenueNet) * 100).toFixed(1).replace(".", ",")}% от приходите` : ""}` : "няма данни за месеца")}
      ${tile("Други разходи", eur(cur.expensesTotal - (cur.expenses.ads_meta || 0) - (goodsCost(cur) ? cur.expenses.goods || 0 : 0), true), cur.vatRegistered ? "без ДДС, от фактурите и банката" : "с ДДС, от фактурите и банката")}
      ${tile("Печалба", eur(cur.profit, true), cur.vatActual !== null && cur.vatActual !== undefined ? `ДДС за внасяне ${eur(cur.vatActual, true)} (по счетоводителя; оценка ${eur(cur.vatDue, true)})` : `ДДС за внасяне ≈ ${eur(cur.vatDue, true)}`, cur.profit < 0 ? "err" : "ok")}
      ${tile(`Разход ${esc(r.owner)}`, eur(cur.ownerOut, true), `преведено на ${esc(r.owner)} · внесени ${eur(cur.ownerIn, true)} · не е в печалбата`)}
    </section>
    <section class="card">
      <div class="row spread"><h2>Разходи за ${mName(month)}</h2><a href="#razhodi" data-go="razhodi" class="small">Всички разходи →</a></div>
      ${
        exp.length
          ? `<div class="scroll"><table class="tbl"><tbody>${exp.map(([k, v]) => `<tr><td>${esc(cats[k] || k)}</td><td class="r">${eur(v, true)}</td><td class="r muted small">${cur.revenueNet ? `${((v / cur.revenueNet) * 100).toFixed(1).replace(".", ",")}% от приходите` : ""}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="muted small">Няма въведени разходи за месеца. В края на месеца ми дай извлечението и фактурите – ще ги въведа.</p>`
      }
    </section>
    <section class="card">
      <h2>По месеци</h2>
      <div class="scroll"><table class="tbl acctbl">
        <thead><tr><th>Месец</th><th class="r">Поръчки</th><th class="r">Взети с ДДС</th><th class="r">Без ДДС</th><th class="r">Себестойност</th><th class="r">Куриери</th><th class="r">Meta</th><th class="r">Други разходи</th><th class="r" title="Преведено от фирмата на ${esc(r.owner)} (връщане на средства, наем, възстановени разходи) – не е в печалбата; под него – внесеното от ${esc(r.owner)}">Разход ${esc(r.owner)}</th><th class="r">Печалба</th><th class="r" title="Реалният ДДС от счетоводителя, ако е въведен в Настройки; иначе ≈ оценка: ДДС в продажбите в България минус ДДС от фактурите">ДДС</th><th class="r">Върнати пратки</th></tr></thead>
        <tbody>${r.months
          .slice(Math.max(0, r.months.findIndex((x) => x.orders || x.expensesTotal || x.otherIncome || x.revenue)))
          .reverse()
          .map(
            (x) => `<tr class="click${x.month === month ? " on" : ""}" data-m="${x.month}"><td>${mShort(x.month)}${x.source === "bank" ? ` <span class="muted small" title="Приходите са от банката – преди поръчките в OrderDesk">банка</span>` : ""}</td><td class="r">${num(x.orders + (x.otherOrders || 0))}</td><td class="r">${eur(x.revenue)}</td><td class="r">${eur(x.revenueNet - x.refunds + x.otherIncome)}</td>
            <td class="r">${eur(goodsCost(x) ? x.expenses.goods || 0 : x.cogs)}</td><td class="r">${eur(x.courier)}</td><td class="r">${eur(x.adsMeta)}</td><td class="r">${eur(x.expensesTotal - (x.expenses.ads_meta || 0) - (goodsCost(x) ? x.expenses.goods || 0 : 0))}</td><td class="r">${eur(x.ownerOut)}${x.ownerIn ? `<div class="sub muted small">внесени ${eur(x.ownerIn)}</div>` : ""}</td><td class="r"><b>${signed(x.profit)}</b></td><td class="r">${x.vatActual !== null && x.vatActual !== undefined ? `<span title="По счетоводителя; оценка ${eur(x.vatDue)}">${eur(x.vatActual)}</span>` : `≈ ${eur(x.vatDue)}`}</td><td class="r">${num(x.returned)}</td></tr>`,
          )
          .join("")}</tbody>
        <tfoot><tr><th>Общо</th><th class="r">${num(r.total.orders + (r.total.otherOrders || 0))}</th><th class="r">${eur(r.total.revenue)}</th><th class="r">${eur(r.total.revenueNet - r.total.refunds + r.total.otherIncome)}</th><th class="r">${eur(r.months.reduce((a, x) => a + (goodsCost(x) ? x.expenses.goods || 0 : x.cogs), 0))}</th><th class="r">${eur(r.total.courier)}</th><th class="r">${eur(r.total.adsMeta)}</th><th class="r">${eur(r.months.reduce((a, x) => a + x.expensesTotal - (x.expenses.ads_meta || 0) - (goodsCost(x) ? x.expenses.goods || 0 : 0), 0))}</th><th class="r">${eur(r.total.ownerOut)}${r.total.ownerIn ? `<div class="sub muted small">внесени ${eur(r.total.ownerIn)}</div>` : ""}</th><th class="r">${signed(r.total.profit)}</th><th></th><th></th></tr></tfoot>
      </table></div>
      <p class="muted small" style="margin:8px 0 0">Приходите са взетите поръчки по датата на доставка (наложеният платеж е платен, когато клиентът вземе пратката). Себестойността е по доставните цени от Склад (купената стока отива в склада). Продажбите от страниците, които не са свързани с OrderDesk (телефонни поръчки, стари страници в ConvertBuilder), са въведени по месеци като „Продажби от други страници“ и са в приходите. Месеците преди OrderDesk („банка“) са по постъпленията в банката и купената стока. Куриерите – по фактурите им, ако са въведени за месеца, иначе по товарителниците. Meta – по разходите на рекламните профили (фактурите от Meta не се въвеждат отделно). Това е наше управленско счетоводство – официалното е при счетоводителката.</p>
    </section>`;
  view.querySelectorAll("tr[data-m]").forEach((tr) =>
    tr.addEventListener("click", () => {
      month = tr.dataset.m;
      $("month").value = month;
      setTab("otchet");
    }),
  );
}

// ================= Продажби (както отиват при счетоводителката) =================
async function prodazhbi() {
  const s = await api(`/api/acc/sales?month=${month}`);
  view.innerHTML = `
    <section class="card">
      <div class="row spread"><h2>Продажби за ${mName(month)}</h2><a class="btn sm" href="/api/acc/nap/csv?month=${month}">Excel с поръчките</a></div>
      <p style="margin:0">Взети поръчки (по датата на доставка): <b>${num(s.total.orders)}</b> за <b>${eur(s.total.gross, true)}</b> с ДДС · ДДС ${eur(s.total.vat, true)} · без ДДС ${eur(s.total.net, true)}</p>
      ${s.warnings.map((w) => `<p class="note small">${esc(w)}</p>`).join("")}
    </section>
    <section class="card"><h2>По държави</h2>
      <div class="scroll"><table class="tbl"><thead><tr><th>Държава</th><th class="r">Поръчки</th><th class="r">С ДДС</th><th class="r">ДДС</th><th class="r">Без ДДС</th></tr></thead><tbody>
      ${
        s.countries
          .map(
            (c) =>
              `<tr><td><b>${esc(cname(c.country))}</b></td><td class="r">${num(c.orders)}</td><td class="r">${eur(c.gross, true)}</td><td class="r">${eur(c.vat, true)}</td><td class="r">${eur(c.net, true)}</td></tr>` +
              (c.rates.length > 1 ? c.rates.map((r) => `<tr class="muted small"><td>&nbsp;&nbsp;в т.ч. ДДС ${r.rate}%</td><td></td><td class="r">${eur(r.gross, true)}</td><td class="r">${eur(r.vat, true)}</td><td class="r">${eur(r.net, true)}</td></tr>`).join("") : ""),
          )
          .join("") || `<tr><td colspan="5" class="muted">Няма взети поръчки.</td></tr>`
      }</tbody></table></div></section>
    <section class="card"><h2>По магазини – физически и дигитални</h2>
      <div class="scroll"><table class="tbl"><thead><tr><th>Магазин</th><th></th><th class="r">ДДС</th><th class="r">Поръчки</th><th class="r">С ДДС</th><th class="r">ДДС</th><th class="r">Без ДДС</th></tr></thead><tbody>
      ${s.shops
        .map((sh) =>
          sh.parts
            .map(
              (p, i) =>
                `<tr><td>${i === 0 ? `<b>${esc(sh.label)}</b><div class="sub muted small">${esc(cname(sh.country))} · ${eur(sh.gross, true)}</div>` : ""}</td><td>${KIND[p.kind]}</td><td class="r">${p.rate}%</td><td class="r">${num(p.orders)}</td><td class="r">${eur(p.gross, true)}</td><td class="r">${eur(p.vat, true)}</td><td class="r">${eur(p.net, true)}</td></tr>`,
            )
            .join(""),
        )
        .join("")}</tbody></table></div>
      <p class="muted small" style="margin:8px 0 0">Дигитални са продуктите, които ConvertBuilder отбелязва като без доставка (PDF, достъп). Ставките на ДДС за всеки магазин (физически, дигитални, доставка) се сменят в Настройки.</p>
    </section>`;
}

// ================= Разходи =================
async function razhodi() {
  const { entries } = await api(`/api/acc/entries?month=${month}`);
  const cats = { ...meta.categories.expense, ...meta.categories.income, refund: "Върната сума на клиент" };
  const sum = (k) => entries.filter((e) => e.kind === k).reduce((a, e) => a + e.total_eur, 0);
  view.innerHTML = `
    <section class="card">
      <div class="row spread"><h2>Разходи и приходи за ${mName(month)}</h2>
        <div class="row"><button class="btn sm" id="addRefund">+ Върната сума</button><button class="btn sm" id="addIncome">+ Приход</button><button class="btn primary sm" id="addExp">+ Разход</button></div></div>
      <p class="muted small" style="margin:0">Разходи: ${eur(sum("expense"), true)} с ДДС · приходи извън поръчките: ${eur(sum("income"), true)} · върнати на клиенти: ${eur(sum("refund"), true)}</p>
      <div class="scroll"><table class="tbl acctbl">
        <thead><tr><th>Дата</th><th>Категория</th><th>Контрагент / описание</th><th>Документ</th><th class="r">Без ДДС</th><th class="r">ДДС</th><th class="r">Общо</th><th>Платено</th></tr></thead>
        <tbody>${
          entries
            .map(
              (e) => `<tr class="click" data-id="${e.id}"><td>${day(e.day)}</td><td>${e.kind === "income" ? "＋ " : e.kind === "refund" ? "↩ " : ""}${esc(cats[e.category] || e.category)}</td>
              <td><b>${esc(e.party)}</b>${e.description ? `<div class="sub muted small">${esc(e.description)}</div>` : ""}${e.order_no ? `<div class="sub muted small">поръчка № ${esc(e.order_no)}</div>` : ""}</td>
              <td class="small">${esc(e.doc_no)}</td><td class="r">${eur(e.net, true)}</td><td class="r">${eur(e.vat, true)}</td><td class="r"><b>${e.currency === "EUR" ? eur(e.total, true) : `${e.total} ${esc(e.currency)}<div class="sub muted small">${eur(e.total_eur, true)}</div>`}</b></td>
              <td class="small muted">${esc(PAID[e.paid_by] || e.paid_by)}${e.source === "import" ? " · внесено" : ""}</td></tr>`,
            )
            .join("") || `<tr><td colspan="8" class="empty">Няма записи за месеца.</td></tr>`
        }</tbody></table></div>
    </section>`;
  $("addExp").onclick = () => entryDialog({ kind: "expense", day: defaultDay() });
  $("addIncome").onclick = () => entryDialog({ kind: "income", day: defaultDay() });
  $("addRefund").onclick = () => entryDialog({ kind: "refund", day: defaultDay() });
  view.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => entryDialog(entries.find((e) => e.id === Number(tr.dataset.id)))));
}
const PAID = { bank: "банка", card: "карта", cash: "в брой", courier: "от куриера", unpaid: "неплатен", other: "друго" };
const defaultDay = () => (month === ym(today) ? today.toISOString().slice(0, 10) : `${month}-01`);

function entryDialog(e) {
  const isNew = !e.id;
  const cats = e.kind === "income" ? meta.categories.income : meta.categories.expense;
  const title = { expense: "Разход", income: "Приход извън поръчките", refund: "Върната сума на клиент" }[e.kind];
  const shops = meta.shops;
  const f = open(
    `${isNew ? "Нов " : ""}${title.toLowerCase()}`,
    `<div class="grid2">
      <label>Дата на документа<input type="date" name="day" value="${esc(e.day || "")}" required></label>
      ${
        e.kind === "refund"
          ? `<label>Магазин<select name="shop">${shops.map((s) => `<option value="${esc(s.id)}" ${s.id === e.shop ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></label>`
          : `<label>Категория<select name="category">${Object.entries(cats).map(([k, v]) => `<option value="${k}" ${k === e.category ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`
      }
    </div>
    ${
      e.kind === "refund"
        ? `<div class="grid2"><label>Поръчка №<input type="text" name="order_no" maxlength="60" value="${esc(e.order_no || "")}" required></label>
           <label>Как е върната<select name="refund_paym">${[["1", "по сметка"], ["2", "по карта"], ["3", "в брой"], ["4", "друго"]].map(([k, v]) => `<option value="${k}" ${String(e.refund_paym || 1) === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>`
        : ""
    }
    <label>${e.kind === "refund" ? "Клиент" : "Доставчик / контрагент"}<input type="text" name="party" maxlength="200" value="${esc(e.party || "")}"></label>
    <label>Описание<input type="text" name="description" maxlength="500" value="${esc(e.description || "")}"></label>
    <div class="grid2">
      <label>№ на фактура / документ<input type="text" name="doc_no" maxlength="60" value="${esc(e.doc_no || "")}"></label>
      <label>Платено<select name="paid_by">${Object.entries(PAID).map(([k, v]) => `<option value="${k}" ${k === (e.paid_by || "bank") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    </div>
    <div class="grid2 acc3">
      <label>Без ДДС<input type="number" step="0.01" name="net" value="${e.net ?? ""}"></label>
      <label>ДДС<input type="number" step="0.01" name="vat" value="${e.vat ?? ""}"></label>
      <label>Общо<input type="number" step="0.01" name="total" value="${e.total ?? ""}" required></label>
    </div>
    <div class="grid2">
      <label>Валута<input type="text" name="currency" maxlength="3" value="${esc(e.currency || "EUR")}"></label>
      <label>Общо в евро (за друга валута)<input type="number" step="0.01" name="total_eur" value="${e.currency && e.currency !== "EUR" ? e.total_eur : ""}"></label>
    </div>
    <p class="muted small" style="margin:0">Попълни „Общо“ и „ДДС“ (или „Без ДДС“) – третото се смята само. Без право на данъчен кредит – ДДС 0.</p>
    <label>Бележка<input type="text" name="note" maxlength="500" value="${esc(e.note || "")}"></label>`,
    `${isNew ? "" : `<button class="btn danger" id="del">Изтрий</button>`}<span style="flex:1"></span><button class="btn" data-close>Отказ</button><button class="btn primary" id="save">Запази</button>`,
  );
  // Two of the three amounts give the third.
  const [net, vat, total] = ["net", "vat", "total"].map((n) => f.elements[n]);
  const r2 = (x) => Math.round(x * 100) / 100;
  vat.addEventListener("input", () => total.value !== "" && vat.value !== "" && (net.value = r2(total.value - vat.value)));
  net.addEventListener("input", () => total.value !== "" && net.value !== "" && (vat.value = r2(total.value - net.value)));
  total.addEventListener("input", () => vat.value !== "" && total.value !== "" && (net.value = r2(total.value - vat.value)));
  $("save").onclick = (ev) =>
    busy(ev.target, async () => {
      const d = formData(f);
      d.kind = e.kind;
      if (d.currency.toUpperCase() === "EUR") delete d.total_eur;
      try {
        await api(isNew ? "/api/acc/entries" : `/api/acc/entries/${e.id}`, { method: "POST", body: d });
        dlg.close();
        render();
      } catch (err) {
        $("ferr").textContent = err.message;
      }
    });
  if (!isNew)
    $("del").onclick = (ev) =>
      confirm("Да изтрия ли записа?") &&
      busy(ev.target, async () => {
        await api(`/api/acc/entries/${e.id}/delete`, { method: "POST", body: {} });
        dlg.close();
        render();
      }, "Трия…");
}

// ================= Банка =================
async function banka() {
  const { lines, cash } = await api(`/api/acc/bank?month=${month}`);
  const bankCats = meta.categories.bank;
  const catSelect = (l) =>
    `<select data-cat="${l.id}" class="acccat"><option value="">— неразпределено —</option>${Object.entries(bankCats)
      .filter(([k]) => (l.amount > 0 ? !meta.categories.expense[k] || k === "other" : true))
      .map(([k, v]) => `<option value="${k}" ${k === l.category ? "selected" : ""}>${esc(v)}</option>`)
      .join("")}</select>`;
  view.innerHTML = `
    <section class="tiles acctiles">
      <div class="tile"><div class="lbl">Постъпления</div><div class="big ok">${eur(cash.in, true)}</div></div>
      <div class="tile"><div class="lbl">Плащания</div><div class="big err">${eur(cash.out, true)}</div></div>
      <div class="tile"><div class="lbl">Салдо в края на месеца</div><div class="big">${cash.balances.length ? cash.balances.map((b) => eur(b.balance, true)).join(" · ") : "–"}</div><div class="sub">${cash.balances.map((b) => `${esc(b.account || "сметка")} към ${day(b.day)}`).join(" · ")}</div></div>
    </section>
    <section class="card">
      <h2>Наложени платежи: доставени през месеца и получени по сметката</h2>
      <div class="scroll"><table class="tbl"><thead><tr><th>Куриер</th><th class="r">Доставени (поръчки)</th><th class="r">За получаване</th><th class="r">Получени в банката</th><th class="r">Разлика</th></tr></thead><tbody>
        ${cash.cod.map((c) => `<tr><td>${esc(c.label)}</td><td class="r">${num(c.expected.orders)}</td><td class="r">${eur(c.expected.sum, true)}</td><td class="r">${eur(c.received, true)}</td><td class="r">${signed(c.received - c.expected.sum)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small" style="margin:8px 0 0">Куриерите превеждат с няколко дни закъснение и удържат таксите си, затова малка разлика в края на месеца е нормална.</p>
    </section>
    <section class="card">
      <div class="row spread"><h2>Движения по сметката</h2>
        <div class="row"><span class="muted small">${cash.unsorted ? `<span class="warnb">${num(cash.unsorted)} неразпределени</span>` : ""}</span>
        <label class="btn sm" for="importFile">Внеси файл (JSON)</label><input type="file" id="importFile" accept=".json,application/json" hidden></div></div>
      <div class="scroll"><table class="tbl acctbl">
        <thead><tr><th>Дата</th><th>Контрагент / основание</th><th class="r">Сума</th><th>Категория</th><th>Разход</th></tr></thead>
        <tbody>${
          lines
            .map(
              (l) => `<tr><td>${day(l.day)}</td><td><b>${esc(l.party)}</b>${l.description ? `<div class="sub muted small">${esc(l.description)}</div>` : ""}</td>
              <td class="r"><b>${signed(l.amount)}</b>${l.balance != null ? `<div class="sub muted small">салдо ${eur(l.balance, true)}</div>` : ""}</td>
              <td>${catSelect(l)}</td>
              <td class="small">${l.entry_id ? `<a href="#razhodi" data-go="razhodi">${esc(l.entry_doc || "свързан")}</a>` : l.amount < 0 ? `<button class="btn link small" data-exp="${l.id}">+ като разход</button>` : ""}</td></tr>`,
            )
            .join("") || `<tr><td colspan="5" class="empty">Няма движения за месеца. В края на месеца ми дай извлечението – ще го внеса.</td></tr>`
        }</tbody></table></div>
    </section>`;
  view.querySelectorAll("select[data-cat]").forEach(
    (s) =>
      (s.onchange = async () => {
        s.disabled = true;
        try {
          await api(`/api/acc/bank/${s.dataset.cat}`, { method: "POST", body: { category: s.value } });
        } catch (e) {
          alert(e.message);
        }
        s.disabled = false;
      }),
  );
  view.querySelectorAll("[data-exp]").forEach(
    (b) =>
      (b.onclick = () => {
        const l = lines.find((x) => x.id === Number(b.dataset.exp));
        const f = open(
          "Разход от плащане по сметката",
          `<p style="margin:0"><b>${esc(l.party)}</b> · ${eur(Math.abs(l.amount), true)} · ${day(l.day)}</p>
           <label>Категория<select name="category">${Object.entries(meta.categories.expense).map(([k, v]) => `<option value="${k}" ${k === l.category ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
           <div class="grid2"><label>ДДС в сумата<input type="number" step="0.01" name="vat" value="0"></label><label>№ на фактура<input type="text" name="doc_no" maxlength="60"></label></div>`,
          `<button class="btn" data-close>Отказ</button><button class="btn primary" id="save">Запиши разход</button>`,
        );
        $("save").onclick = (ev) =>
          busy(ev.target, async () => {
            try {
              await api(`/api/acc/bank/${l.id}/expense`, { method: "POST", body: formData(f) });
              dlg.close();
              render();
            } catch (err) {
              $("ferr").textContent = err.message;
            }
          });
      }),
  );
  $("importFile").onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const r = await api("/api/acc/import", { method: "POST", body: data });
      alert(`Внесено: ${r.entries.added} нови и ${r.entries.changed} променени разхода, ${r.bank.added} нови и ${r.bank.changed} променени движения.${r.missingEntryKeys.length ? `\nБез намерен разход: ${r.missingEntryKeys.join(", ")}` : ""}`);
      render();
    } catch (e) {
      alert(e.message);
    }
  };
}

// ================= НАП и счетоводител =================
async function nap() {
  const d = await api(`/api/acc/nap?month=${month}`);
  const a = d.accountant;
  const sent = d.log.filter((x) => x.shop === "*");
  view.innerHTML = `
    <section class="card">
      <div class="row spread"><h2>Писмо до счетоводителя за ${mName(month)}</h2>
        <div class="row"><button class="btn sm" id="preview">Виж писмото</button><button class="btn primary sm" id="send" ${a.email ? "" : "disabled"}>Изпрати сега</button></div></div>
      <p style="margin:0">${
        a.email
          ? `До <b>${esc(a.name || a.email)}</b> (${esc(a.email)})${a.auto ? ` – тръгва само на <b>${a.day}-о число</b> за предходния месец; ако до 15-о нещо се промени, отива поправка.` : " – автоматичното изпращане е изключено."}`
          : `<span class="err">Няма имейл на счетоводителя.</span> Добави го в <a href="#nastroiki" data-go="nastroiki">Настройки</a>.`
      }</p>
      <p class="muted small" style="margin:6px 0 0">В писмото: продажбите по държави, по магазини – физически и дигитални продукти с тяхното ДДС, Excel с всички взети поръчки и одиторският XML за магазините, регистрирани в НАП.</p>
      ${
        sent.length
          ? `<div class="scroll"><table class="tbl" style="margin-top:8px"><thead><tr><th>Изпратено</th><th>До</th><th class="r">Поръчки</th><th class="r">Сума</th><th></th></tr></thead><tbody>${sent
              .map((x) => `<tr><td>${new Date(x.at).toLocaleString("bg-BG")}</td><td>${esc(x.sent_to)}</td><td class="r">${num(x.orders)}</td><td class="r">${eur(x.total, true)}</td><td class="small ${x.ok ? "muted" : "err"}">${x.ok ? (x.auto ? "автоматично" : "ръчно") : esc(x.error || "грешка")}</td></tr>`)
              .join("")}</tbody></table></div>`
          : `<p class="muted small">За този месец още не е изпращано.</p>`
      }
      <div id="letter"></div>
    </section>
    <section class="card">
      <h2>Одиторски файл (Наредба Н-18) за ${mName(month)}</h2>
      ${
        d.files.length
          ? `<div class="scroll"><table class="tbl acctbl"><thead><tr><th>Магазин</th><th class="r">Поръчки</th><th class="r">С ДДС</th><th>Плащане (код НАП)</th><th>Файл</th></tr></thead><tbody>${d.files
              .map(
                (f) => `<tr><td><b>${esc(f.label)}</b><div class="sub muted small">№ ${esc(f.eShopN || "–")} · ${esc(f.url)}</div></td><td class="r">${num(f.orders)}</td><td class="r">${eur(f.gross, true)}</td>
                <td class="small">${Object.entries(f.byPaym).map(([k, v]) => `${esc(PAYM[k] || k)}: ${num(v.orders)}`).join("<br>") || "–"}</td>
                <td>${f.ready ? `<a class="btn sm" href="/api/acc/nap/xml?shop=${encodeURIComponent(f.shop)}&month=${month}">Свали XML</a>` : ""}
                  ${[...f.errors.map((e) => `<div class="err small">${esc(e)}</div>`), ...f.warnings.map((w) => `<div class="muted small">${esc(w)}</div>`)].join("")}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : `<p class="muted small" style="margin:0">Нито един магазин не е отбелязан за одиторския файл. Ако магазините са регистрирани в НАП (уникален номер на е-магазина), включи ги в <a href="#nastroiki" data-go="nastroiki">Настройки</a>.</p>`
      }
      <p class="muted small" style="margin:8px 0 0">Във файла влизат всички поръчки, доставени през месеца, с код за начина на плащане, и върнатите на клиенти суми (въвеждат се в Разходи → „Върната сума“). Подава се през портала на НАП с КЕП до 15-о число.</p>
    </section>`;
  $("preview").onclick = async (ev) => {
    await busy(ev.target, async () => {
      const l = await api(`/api/acc/nap/letter?month=${month}`);
      $("letter").innerHTML = `<div class="accletter"><div class="muted small">Тема: <b>${esc(l.subject)}</b> · до ${esc(l.to || "–")} · прикачени: ${l.files.map(esc).join(", ")}</div>${l.html}</div>`;
    }, "Подготвям…");
  };
  $("send").onclick = (ev) =>
    confirm(`Да изпратя ли писмото за ${mName(month)} на ${a.email}?`) &&
    busy(ev.target, async () => {
      try {
        const r = await api("/api/acc/nap/send", { method: "POST", body: { month } });
        alert(`Изпратено до ${r.to}${r.cc.length ? ` (копие: ${r.cc.join(", ")})` : ""}.\nПрикачени: ${r.files.join(", ")}`);
        render();
      } catch (e) {
        alert(e.message);
      }
    }, "Изпращам…");
}

// ================= Настройки =================
async function nastroiki() {
  const { settings: s, shops } = await getMeta(true);
  const v = (x) => (x === null || x === undefined ? "" : esc(String(x)));
  const products = Object.entries(s.vat.products).map(([k, r]) => `${k} = ${r}`).join("\n");
  view.innerHTML = `
    <form class="stack" id="sf">
    <section class="card"><h2>Фирма и счетоводител</h2>
      <div class="grid2">
        <label>Фирма (както в писмото)<input type="text" name="companyName" maxlength="120" value="${v(s.companyName)}"></label>
        <label>ЕИК (за одиторския файл)<input type="text" name="eik" inputmode="numeric" maxlength="13" value="${v(s.eik)}"></label>
        <label>Име на счетоводителя<input type="text" name="a_name" maxlength="80" value="${v(s.accountant.name)}"></label>
        <label>Имейл на счетоводителя<input type="email" name="a_email" maxlength="200" value="${v(s.accountant.email)}"></label>
        <label>Регистрация по ДДС от месец (ГГГГ-ММ; празно = винаги)<input type="text" name="vatFrom" maxlength="7" placeholder="2026-09" value="${v(s.vatFrom)}"></label>
        <label>Поръчките в OrderDesk са пълни от месец (по-рано – приходи от банката)<input type="text" name="ordersFrom" maxlength="7" placeholder="2026-10" value="${v(s.ordersFrom)}"></label>
        <label>Собственикът – име за колоната (напр. Митко)<input type="text" name="ownerLabel" maxlength="30" value="${v(s.owner.label)}"></label>
        <label>Имената му в банката (през запетая)<input type="text" name="ownerNames" maxlength="300" value="${v(s.owner.names)}"></label>
        <label>Реалният ДДС за внасяне по месеци (от счетоводителя; по ред: 2026-10 = 2133.44)<textarea name="vatActual" rows="3">${esc(Object.entries(s.vatActual || {}).map(([m, n]) => `${m} = ${n}`).join("\n"))}</textarea></label>
        <label>Изпращай писмото на (число от месеца)<input type="number" name="a_day" min="1" max="15" value="${v(s.accountant.day)}"></label>
        <div class="stack small" style="align-self:end">
          <label class="chk"><input type="checkbox" name="a_auto" ${s.accountant.auto ? "checked" : ""}> Изпращай автоматично</label>
          <label class="chk"><input type="checkbox" name="a_copy" ${s.accountant.copyMe ? "checked" : ""}> Копие до мен</label>
        </div>
      </div>
      <p class="muted small" style="margin:0">Писмото тръгва през Brevo (ключът и подателят са в Незавършени → Напомняния).</p>
    </section>
    <section class="card"><h2>ДДС и магазини</h2>
      <div class="grid2 acc3">
        <label>Физически продукти, %<input type="number" name="vat_physical" min="0" max="50" value="${v(s.vat.physical)}"></label>
        <label>Дигитални продукти, %<input type="number" name="vat_digital" min="0" max="50" value="${v(s.vat.digital)}"></label>
        <label>Доставка, %<input type="number" name="vat_shipping" min="0" max="50" value="${v(s.vat.shipping)}"></label>
      </div>
      <p class="muted small" style="margin:0">Това са ставките за магазините в България. За всеки магазин (и за тези в чужбина – тяхната ставка) може да се зададе своя долу; празно = общата.</p>
      <div class="scroll"><table class="tbl acctbl accshops">
        <thead><tr><th>Магазин</th><th>Държава</th><th>ДДС физ. %</th><th>ДДС диг. %</th><th>ДДС дост. %</th><th>Одиторски файл (НАП)</th><th>Уникален № от НАП</th><th>Уеб адрес</th></tr></thead>
        <tbody>${shops
          .map(
            (sh) => `<tr data-shop="${esc(sh.id)}"><td><b>${esc(sh.label)}</b><div class="sub muted small">${esc(sh.domain)}${sh.active ? "" : " · спрян"}</div></td>
            <td><input type="text" data-k="country" maxlength="2" size="3" value="${v(sh.acc.country)}" placeholder="${esc(sh.eff.country || "?")}"></td>
            <td><input type="number" data-k="vat" min="0" max="50" value="${v(sh.acc.vat)}" placeholder="${v(sh.eff.physical ?? "?")}"></td>
            <td><input type="number" data-k="vatDigital" min="0" max="50" value="${v(sh.acc.vatDigital)}" placeholder="${v(sh.eff.digital ?? "?")}"></td>
            <td><input type="number" data-k="vatShipping" min="0" max="50" value="${v(sh.acc.vatShipping)}" placeholder="${v(sh.eff.shipping ?? "?")}"></td>
            <td><label class="chk"><input type="checkbox" data-k="nap" ${sh.acc.nap ? "checked" : ""}> включен</label></td>
            <td><input type="text" data-k="eShopN" maxlength="10" size="11" value="${v(sh.acc.eShopN)}"></td>
            <td><input type="text" data-k="url" maxlength="200" value="${v(sh.acc.url)}" placeholder="https://${esc(sh.domain)}"></td></tr>`,
          )
          .join("")}</tbody></table></div>
      <label>Своя ставка за отделни продукти (по ред: точното име от поръчката = ставка)<textarea name="vat_products" rows="3" placeholder="Карти за НВО 7 клас = 9">${esc(products)}</textarea></label>
    </section>
    <section class="card"><h2>Плащания – кодове за НАП</h2>
      <div class="grid2">${Object.entries(PAY)
        .map(([k, l]) => `<label>${esc(l)}<select name="p_${k}">${Object.entries(PAYM).map(([c, t]) => `<option value="${c}" ${Number(c) === Number(s.paym[k]) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`)
        .join("")}
        <label>Доставчик на платежни услуги (за карти), напр. Stripe<input type="text" name="procId" maxlength="200" value="${v(s.procId)}"></label>
        <label>Номер на виртуален ПОС (ако е на фирмата)<input type="text" name="posN" maxlength="200" value="${v(s.posN)}"></label>
      </div>
      <p class="muted small" style="margin:0">Еконт по договор с пощенски паричен превод = 3; Спиди с касова бележка от куриера = 6. Провери ги със счетоводителката.</p>
    </section>
    <div class="row"><button class="btn primary" id="saveSet" type="button">Запази настройките</button><span class="small" id="setMsg"></span></div>
    </form>`;
  $("saveSet").onclick = (ev) =>
    busy(ev.target, async () => {
      const f = $("sf");
      const d = formData(f);
      const shopsIn = {};
      f.querySelectorAll("tr[data-shop]").forEach((tr) => {
        const x = {};
        tr.querySelectorAll("[data-k]").forEach((i) => (x[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value.trim()));
        shopsIn[tr.dataset.shop] = x;
      });
      const prods = {};
      for (const line of String(d.vat_products || "").split("\n")) {
        const m = /^(.+?)\s*=\s*(\d{1,2})\s*$/.exec(line.trim());
        if (m) prods[m[1]] = Number(m[2]);
      }
      try {
        await api("/api/acc/settings", {
          method: "POST",
          body: {
            companyName: d.companyName,
            eik: d.eik,
            vatFrom: d.vatFrom,
            ordersFrom: d.ordersFrom,
            owner: { label: d.ownerLabel, names: d.ownerNames },
            vatActual: Object.fromEntries(
              String(d.vatActual || "")
                .split("\n")
                .map((l) => /^\s*(\d{4}-\d{2})\s*[=:]\s*(-?[\d\s]+(?:[.,]\d+)?)\s*$/.exec(l))
                .filter(Boolean)
                .map((m) => [m[1], Number(m[2].replace(/\s/g, "").replace(",", "."))]),
            ),
            accountant: { name: d.a_name, email: d.a_email, day: Number(d.a_day), auto: Boolean(d.a_auto), copyMe: Boolean(d.a_copy) },
            vat: { physical: d.vat_physical, digital: d.vat_digital, shipping: d.vat_shipping, products: prods },
            paym: Object.fromEntries(Object.keys(PAY).map((k) => [k, Number(d[`p_${k}`])])),
            procId: d.procId,
            posN: d.posN,
            shops: shopsIn,
          },
        });
        $("setMsg").innerHTML = `<span class="ok">Запазено.</span>`;
        meta = null;
      } catch (e) {
        $("setMsg").innerHTML = `<span class="err">${esc(e.message)}</span>`;
      }
    });
}

const TABS = { otchet, prodazhbi, razhodi, banka, nap, nastroiki };
view.addEventListener("click", (e) => {
  const a = e.target.closest("[data-go]");
  if (a) {
    e.preventDefault();
    setTab(a.dataset.go);
  }
});
addEventListener("hashchange", () => {
  const t = location.hash.slice(1);
  if (TABS[t] && t !== tab) setTab(t);
});
setTab(TABS[tab] ? tab : "otchet");
