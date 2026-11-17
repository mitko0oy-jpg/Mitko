import { api, COURIER, esc, eur, money, num, ONE, qs, setQs, shell, STAGE_ORDER, STAGES } from "./app.js";
import { bulkCreate, cancelWaybill, openLabels, openLabelsFor, openWaybill } from "./waybill.js";
import { openSms } from "./sms.js";
import { openOrderForm } from "./order-form.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["q", "shop", "region", "courier", "from", "to", "confirmed", "sort", "product"];
const state = {
  tab: qs().has("tab") ? qs().get("tab") : qs().get("stage") ? "" : "active",
  stages: new Set((qs().get("stage") || "").split(",").filter(Boolean)),
  page: Number(qs().get("page")) || 1,
  per: Number(qs().get("per")) === 100 ? 100 : 50,
};
let rows = [];
let shopList = [];
const selected = new Set();

await shell("poruchki");

try {
  const s = await api("/api/settings");
  shopList = s.shops.filter((x) => x.active);
  $("shop").innerHTML += s.shops.filter((x) => x.active).map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
} catch {
  /* optional */
}
// The product filter's options come with each list; keep the chosen one until they arrive.
if (qs().get("product")) $("product").innerHTML += `<option>${esc(qs().get("product"))}</option>`;
for (const f of FIELDS) $(f).value = qs().get(f) || "";
$("nowaybill").checked = qs().get("nowaybill") === "1";
$("sentToday").checked = qs().get("sent") === "today";

const ICON = {
  more: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`,
  ship: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z"/></svg>`,
  print: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>`,
  sms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z"/></svg>`,
  robot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>`,
  cancel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>`,
};

function params() {
  const p = {};
  for (const f of FIELDS) p[f] = $(f).value.trim();
  p.tab = state.tab;
  p.stage = [...state.stages].join(",");
  p.nowaybill = $("nowaybill").checked ? "1" : "";
  p.sent = $("sentToday").checked ? "today" : "";
  p.page = state.page > 1 ? String(state.page) : "";
  p.per = state.per === 100 ? "100" : "";
  p.archived = state.tab === "archived" ? "1" : "";
  if (p.tab === "archived") p.tab = "";
  return p;
}

const AI = "AI агент";
const CALL = { requested: "чака AI обаждане", calling: "AI звъни…", no_conversation: "не вдига", voicemail: "не вдига", gave_up: "не вдига (3 опита)", canceled: "отказа по телефона", change_requested: "иска промяна", needs_human: "иска човек", callback_later: "да се обадим пак", wrong_person: "друг човек", wrong_number: "грешен номер" };
function confirmCell(o) {
  if (o.confirmed_at) return o.confirmed_by === AI ? `<div class="conf ai" title="Потвърдена от AI агента">🤖 AI потвърдена</div>` : `<div class="conf us" title="${esc(o.confirmed_by || "")}">✓ Потвърдена</div>`;
  const c = o.call && CALL[o.call.state] ? `☎ ${CALL[o.call.state]}${o.call.attempts > 1 && !["gave_up"].includes(o.call.state) ? ` (${o.call.attempts})` : ""}` : "";
  if (o.stage !== "new") return c ? `<div class="conf no">${c}</div>` : "";
  // Quick confirm by hand or by the AI agent, right under the status.
  const ai = o.phone && !["requested", "calling"].includes(o.call?.state) ? `<button class="mini ai" data-act="ai" data-id="${o.id}" title="AI потвърждение – агентът да звънне">🤖 AI</button>` : "";
  return `${c ? `<div class="conf no">${c}</div>` : ""}<div class="minis"><button class="mini" data-act="confirm" data-id="${o.id}" title="Потвърди поръчката" aria-label="Потвърди поръчката">✓</button>${ai}</div>`;
}

const canShip = (o) => !o.tracking_no && o.region === "bg" && (o.currency || "EUR") === "EUR" && !["canceled", "delivered", "returned"].includes(o.stage);
const courierOf = (o) => o.courier || o.delivery?.courier || "";
const canCancel = (o) => o.tracking_source === "own" && ["prepared", "shipped", "new"].includes(o.stage);
// A Bulgarian mobile or landline number: +359 / 0 and 8–9 digits.
const badPhone = (o) => o.region === "bg" && o.phone && !/^(?:\+?359|0)?[2-9]\d{7,8}$/.test(String(o.phone).replace(/[\s\-()/.]/g, ""));

/** "преди 45 мин", "преди 5 ч", "преди 3 д 17 ч" – like Middleware; the exact time is on the line below. */
function since(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return m < 1 ? "току-що" : `преди ${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `преди ${h} ч ${m % 60} мин`;
  const d = Math.floor(h / 24);
  return d < 30 ? `преди ${d} д${h % 24 ? ` ${h % 24} ч` : ""}` : `преди ${d} д`;
}
const fullDate = (iso) => new Date(iso).toLocaleString("bg-BG", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(" г.", "");

const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;
function courierCell(o) {
  const d = o.delivery || {};
  const c = courierOf(o);
  const where = d.type === "office" ? "До офис" : d.type === "automat" ? "До автомат" : d.type === "address" ? "До адрес" : "";
  const place = [where, d.officeName, d.type === "address" ? o.city : ""].filter(Boolean).join(" – ");
  return `<div class="cname"><span class="cmark ${esc(c)}" aria-hidden="true">${esc((c || "?").slice(0, 1).toUpperCase())}</span>${esc(COURIER[c] || c || "–")}</div>${where ? `<div class="where" title="${esc(place)}">${PIN}${esc(where)}</div>` : ""}`;
}

function parcelCell(o) {
  if (!o.tracking_no) return "";
  const mw = ["speedy_ref", "econt_match", "middleware"].includes(o.tracking_source) ? `<span class="sub" title="Товарителницата е от Middleware"> · MW</span>` : "";
  const no = o.tracking_link ? `<a href="${esc(o.tracking_link)}" target="_blank" rel="noopener">${esc(o.tracking_no)}</a>` : esc(o.tracking_no);
  const pr = ["speedy", "econt"].includes(courierOf(o)) ? `<button class="linkbtn" data-act="print" data-id="${o.id}" title="Печат на етикета" aria-label="Печат на етикета">${ICON.print}</button>` : "";
  return `${o.parcel_text ? `<div class="cour">${esc(o.parcel_text)}</div>` : ""}<div class="wb">${no}${pr}${mw}</div>`;
}

function actions(o) {
  const out = [`<a class="iconbtn" title="Подробности" aria-label="Подробности" href="/poruchka/?id=${o.id}">${ICON.info}</a>`];
  out.push(o.phone ? `<button class="iconbtn" title="Изпрати SMS" aria-label="Изпрати SMS" data-act="sms" data-id="${o.id}">${ICON.sms}</button>` : `<span class="iconbtn ghost"></span>`);
  if (canShip(o)) out.push(`<button class="iconbtn primary" title="Създай товарителница" aria-label="Създай товарителница" data-act="ship" data-id="${o.id}">${ICON.ship}</button>`);
  else if (canCancel(o)) out.push(`<button class="iconbtn danger" title="Анулирай товарителницата" aria-label="Анулирай товарителницата" data-act="cancel" data-id="${o.id}">${ICON.cancel}</button>`);
  else out.push(`<span class="iconbtn ghost"></span>`);
  out.push(`<button class="iconbtn" title="Още" aria-label="Още действия" aria-haspopup="menu" data-act="more" data-id="${o.id}">${ICON.more}</button>`);
  return out.join("");
}

/** ⋮ – everything else for one order. */
function moreMenu(o) {
  const c = courierOf(o);
  const items = [];
  if (!o.confirmed_at) items.push(["confirm", "✓ Потвърди"]);
  else items.push(["unconfirm", "Махни потвърждението"]);
  if (!o.confirmed_at && o.phone && !["requested", "calling"].includes(o.call?.state)) items.push(["ai", "🤖 AI потвърждение"]);
  items.push(["note", "Бележка"]);
  if (canShip(o)) items.push(["ship", "Създай товарителница"]);
  if (o.tracking_no && (c === "speedy" || c === "econt")) items.push(["print", "Печат на етикета"]);
  if (canCancel(o)) items.push(["cancel", "Анулирай товарителницата"]);
  items.push(["duplicate", "Дублирай"]);
  items.push(o.archived_at ? ["unarchive", "Върни от архива"] : ["archive", "Архивирай"]);
  return items.map(([a, t]) => `<button type="button" data-act="${a}" data-id="${o.id}" role="menuitem">${t}</button>`).join("") + `<a href="/poruchka/?id=${o.id}">Отвори поръчката</a>`;
}

function renderSide(f) {
  const total = Object.values(f.stages).reduce((a, b) => a + b, 0);
  const active = (f.stages.new || 0) + (f.stages.prepared || 0) + (f.stages.shipped || 0) + (f.stages.at_office || 0);
  $("nActive").textContent = num(active);
  $("nDone").textContent = num(total - active);
  $("nAll").textContent = num(total);
  for (const b of $("tabs").querySelectorAll("button")) b.classList.toggle("on", !state.stages.size && b.dataset.tab === state.tab);
  $("stages").innerHTML =
    STAGE_ORDER.filter((k) => k !== "archived" || f.stages[k])
      .map(
        (k) => `<label class="tgl"><input type="checkbox" data-stage="${k}" ${state.stages.has(k) ? "checked" : ""}><span class="sw" aria-hidden="true"></span><span class="badge ${k}">${STAGES[k].label}</span><span class="n">${num(f.stages[k] || 0)}</span></label>`,
      )
      .join("") +
    `<a class="tgl" href="/nezavarsheni/" title="Написали са телефона си, но не са поръчали"><span class="sw go" aria-hidden="true">→</span><span class="badge abandoned">Незавършени</span><span class="n">${num(f.abandoned || 0)}</span></a>`;
  $("stages").querySelectorAll("input[data-stage]").forEach(
    (c) =>
      (c.onchange = () => {
        c.checked ? state.stages.add(c.dataset.stage) : state.stages.delete(c.dataset.stage);
        state.tab = "";
        state.page = 1;
        load();
      }),
  );
  $("nSent").textContent = num(f.sentToday || 0);
  const chosen = $("product").value;
  const names = (f.products || []).map((p) => p.name);
  $("product").innerHTML =
    `<option value="">Всички продукти</option>` +
    (chosen && !names.includes(chosen) ? `<option>${esc(chosen)}</option>` : "") +
    (f.products || []).map((p) => `<option value="${esc(p.name)}">${esc(p.name)} (${num(p.n)})</option>`).join("");
  $("product").value = chosen;
}

// Column headers: [key, label, sort when first clicked, sort when clicked again]
const COLS = [
  ["no", "#", "new", "old"],
  ["badge", "Статус", "stage_asc", "stage_desc"],
  ["shop", "Магазин", "shop_asc", "shop_desc"],
  ["client", "Клиент"],
  ["cour", "Куриер", "cour_asc", "cour_desc"],
  ["cstat", "Куриер статус", "courier", "parcel_asc"],
  ["money", "Цена", "sum_desc", "sum_asc"],
  ["when", "Поръчано на", "new", "old"],
  ["note", "Бележка", "note_desc", "note_asc"],
];
const HIDEABLE = ["shop", "client", "cour", "cstat", "money", "when", "note"];
let hidden = new Set();
try {
  hidden = new Set(JSON.parse(localStorage.getItem("cols-off") || "[]"));
} catch {
  /* private window */
}

function head() {
  const cur = $("sort").value || "new";
  return COLS.map(([k, label, a, b]) => {
    const cls = k === "money" ? "money" : `c-${k}`;
    if (!a) return `<th class="${cls}">${label}</th>`;
    const on = cur === a || cur === b;
    const arrow = !on ? "↑↓" : cur === a ? (a.endsWith("asc") || a === "old" ? "↑" : "↓") : b.endsWith("asc") || b === "old" ? "↑" : "↓";
    return `<th class="${cls} sortable${on ? " on" : ""}" data-sort="${k}" aria-sort="${on ? (arrow === "↑" ? "ascending" : "descending") : "none"}"><button type="button">${label} <span class="arr">${arrow}</span></button></th>`;
  }).join("");
}

function renderTable(d) {
  rows = d.orders;
  $("table").className = `otbl ${[...hidden].map((k) => `off-${k}`).join(" ")}`;
  if (!rows.length) {
    $("table").innerHTML = `<tbody><tr><td class="empty">Няма поръчки по тези условия.</td></tr></tbody>`;
    return;
  }
  const allOn = rows.every((o) => selected.has(o.id));
  $("table").innerHTML = `<thead><tr>
      <th class="c-check"><input type="checkbox" id="selAll" aria-label="Избери всички" ${allOn ? "checked" : ""}></th>
      ${head()}<th class="acts"></th>
    </tr></thead><tbody>
    ${rows
      .map(
        (o) => `<tr class="${selected.has(o.id) ? "sel" : ""}" data-id="${o.id}">
        <td class="c-check"><input type="checkbox" data-sel="${o.id}" aria-label="Избери № ${esc(o.order_no)}" ${selected.has(o.id) ? "checked" : ""}></td>
        <td class="c-no"><a class="ono" href="/poruchka/?id=${o.id}">${esc(o.order_no)}</a><div class="pills">${o.paid ? `<span class="pill pay" title="Платена">$</span>` : `<span class="pill cod" title="Наложен платеж">$</span>`}<span class="pill n" title="${o.other_orders ? `Още ${o.other_orders} поръчки от този телефон` : "Първа поръчка от този телефон"}">${(o.other_orders || 0) + 1}</span>${o.source === "phone" ? `<span class="pill" title="Поръчка по телефона">☎</span>` : o.source === "manual" ? `<span class="pill" title="Въведена ръчно">✎</span>` : ""}</div></td>
        <td class="c-badge"><span class="badge ${o.stage}">${o.parcel_status === "refused" ? "Отказана на място" : ONE[o.stage] || o.stage}</span>${confirmCell(o)}</td>
        <td class="c-shop"><span class="shopname">${esc(o.shop_label)}</span></td>
        <td class="c-client"><div class="cl">${o.returned_before ? `<span class="warn" title="Върнал е ${o.returned_before} пратки">!</span>` : ""}<a class="cname2" href="/poruchka/?id=${o.id}">${esc(o.customer_name || "–")}</a></div><div class="ph">${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ""}${badPhone(o) ? `<span class="bad" title="Телефонът не прилича на български номер">✕</span>` : ""}</div></td>
        <td class="c-cour">${courierCell(o)}</td>
        <td class="c-cstat">${parcelCell(o)}</td>
        <td class="money">${o.edit ? `<span title="Коригирана в платформата">✎ </span>` : ""}${money(o.total, o.currency)}<div class="sub">${o.currency !== "EUR" ? eur(o.total_eur) : money(o.sub_total, o.currency)}</div></td>
        <td class="c-when">${since(o.ordered_at)}<div class="sub">${fullDate(o.ordered_at)}</div></td>
        <td class="c-note"><button class="notebtn${o.note ? " clamp" : ""}" data-act="note" data-id="${o.id}" title="${o.note ? esc(o.note) : "Бележка"}">${o.note ? esc(o.note) : `<span class="muted">${ICON.note}</span>`}</button></td>
        <td class="acts"><div class="actsin">${actions(o)}</div></td>
      </tr>`,
      )
      .join("")}
    </tbody>`;
  $("selAll").onchange = (e) => {
    for (const o of rows) e.target.checked ? selected.add(o.id) : selected.delete(o.id);
    renderTable(d);
    renderBulk();
  };
  $("table").querySelectorAll("[data-sel]").forEach(
    (c) =>
      (c.onchange = () => {
        const id = Number(c.dataset.sel);
        c.checked ? selected.add(id) : selected.delete(id);
        c.closest("tr").classList.toggle("sel", c.checked);
        renderBulk();
      }),
  );
  $("table").querySelectorAll("th.sortable button").forEach(
    (b) =>
      (b.onclick = () => {
        const [, , a, z] = COLS.find(([k]) => k === b.parentElement.dataset.sort);
        $("sort").value = $("sort").value === a || (!$("sort").value && a === "new") ? z : a;
        state.page = 1;
        load();
      }),
  );
  $("table").querySelectorAll("[data-act]").forEach((b) => (b.onclick = (e) => act(b.dataset.act, Number(b.dataset.id), e.currentTarget)));
}

function renderBulk() {
  const list = rows.filter((o) => selected.has(o.id));
  const bar = $("bulk");
  bar.hidden = !selected.size;
  if (!selected.size) return;
  const shippable = list.filter(canShip);
  const printable = list.filter((o) => o.tracking_no && ["speedy", "econt"].includes(courierOf(o)));
  bar.innerHTML = `<b>Избрани: ${selected.size}</b>
    <button class="btn sm" id="bShip" ${shippable.length ? "" : "disabled"}>Създай товарителници (${shippable.length})</button>
    <button class="btn sm" id="bPrint" ${printable.length ? "" : "disabled"}>Печат на етикети (${printable.length})</button>
    <button class="btn link sm" id="bClear">Изчисти</button>`;
  $("bShip").onclick = () => bulkCreate(shippable.map((o) => ({ ...o, courier: courierOf(o) })), () => load(true));
  $("bPrint").onclick = () => openLabelsFor(printable.map((o) => ({ id: o.id, courier: courierOf(o) })));
  $("bClear").onclick = () => {
    selected.clear();
    renderTable({ orders: rows });
    renderBulk();
  };
}

const rowMenu = document.createElement("div");
rowMenu.className = "pop rowmenu";
rowMenu.setAttribute("role", "menu");
rowMenu.hidden = true;
document.body.append(rowMenu);
document.addEventListener("click", (e) => !rowMenu.contains(e.target) && !e.target.closest("[data-act=more]") && (rowMenu.hidden = true));
document.addEventListener("keydown", (e) => e.key === "Escape" && (rowMenu.hidden = true));
addEventListener("scroll", () => (rowMenu.hidden = true), { passive: true });

function openMore(o, btn) {
  rowMenu.innerHTML = moreMenu(o);
  rowMenu.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = rowMenu.offsetWidth;
  const h = rowMenu.offsetHeight;
  rowMenu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
  rowMenu.style.top = `${r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  rowMenu.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => ((rowMenu.hidden = true), act(b.dataset.act, Number(b.dataset.id)))));
  rowMenu.querySelector("button, a")?.focus();
}

async function act(what, id, btn) {
  const o = rows.find((x) => x.id === id);
  try {
    if (what === "more") return openMore(o, btn);
    if (["unconfirm", "archive", "unarchive"].includes(what)) {
      if (what === "archive" && !confirm(`Да архивирам ли поръчка № ${o?.order_no}?`)) return;
      await api(`/api/orders/${id}/${what}`, { method: "POST", body: {} });
      return load(true);
    }
    if (what === "duplicate") {
      if (!confirm(`Да направя ли копие на поръчка № ${o?.order_no}?`)) return;
      const r = await api(`/api/orders/${id}/duplicate`, { method: "POST", body: {} });
      if (r?.id) location.href = `/poruchka/?id=${r.id}`;
      return;
    }
    if (what === "ship") {
      if (await openWaybill(id)) load(true);
    } else if (what === "print") openLabels([id]);
    else if (what === "sms") await openSms(id);
    else if (what === "confirm") {
      await api(`/api/orders/${id}/confirm`, { method: "POST", body: {} });
      load(true);
    } else if (what === "ai") {
      await api(`/api/orders/${id}/ai-call`, { method: "POST", body: {} });
      load(true);
    } else if (what === "note") {
      const text = prompt("Бележка към поръчката:", o?.note || "");
      if (text && text.trim()) {
        await api(`/api/orders/${id}/note`, { method: "POST", body: { text } });
        load(true);
      }
    }
    else if (what === "cancel" && (await cancelWaybill(id, o?.tracking_no))) load(true);
  } catch (e) {
    alert(e.message);
  }
}

async function load(keepScroll = false) {
  const p = params();
  setQs(p);
  $("app").classList.add("loading");
  try {
    const d = await api(`/api/orders?${new URLSearchParams(p)}`);
    $("count").textContent = `${num(d.total)} за ${eur(d.sum)}`;
    renderSide(d.facets);
    renderTable(d);
    renderBulk();
    const pages = Math.max(1, Math.ceil(d.total / d.perPage));
    $("pager").innerHTML = `<button class="btn sm" id="prev" ${state.page <= 1 ? "disabled" : ""}>←</button>
      <span class="muted small">${state.page} от ${pages}</span>
      <button class="btn sm" id="next" ${state.page >= pages ? "disabled" : ""}>→</button>
      <select id="per" aria-label="На страница"><option value="50">50</option><option value="100" ${state.per === 100 ? "selected" : ""}>100</option></select>`;
    $("prev").onclick = () => (state.page--, load());
    $("next").onclick = () => (state.page++, load());
    $("per").onchange = (e) => ((state.per = Number(e.target.value)), (state.page = 1), load());
    if (!keepScroll) scrollTo({ top: 0 });
  } catch (e) {
    $("table").innerHTML = `<tbody><tr><td class="err">${esc(e.message)}</td></tr></tbody>`;
  } finally {
    $("app").classList.remove("loading");
  }
}

$("tabs").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.tab = b.dataset.tab;
  state.stages.clear();
  state.page = 1;
  load();
};
let t;
$("q").oninput = () => {
  clearTimeout(t);
  t = setTimeout(() => ((state.page = 1), load()), 300);
};
$("newOrder").onclick = async () => {
  const r = await openOrderForm({ mode: "new", shops: shopList });
  if (r?.id) location.href = `/poruchka/?id=${r.id}`;
};
for (const f of ["shop", "region", "courier", "from", "to", "nowaybill", "confirmed", "sort", "product"]) $(f).onchange = () => ((state.page = 1), load());
$("sentToday").onchange = () => {
  // Sent today can be on its way or already at the office: look in every tab.
  if ($("sentToday").checked) state.tab = "";
  state.page = 1;
  load();
};
$("clear").onclick = () => {
  for (const f of FIELDS) $(f).value = "";
  $("nowaybill").checked = false;
  $("sentToday").checked = false;
  state.stages.clear();
  state.tab = "active";
  state.page = 1;
  load();
};
$("filtersBtn").onclick = () => $("side").classList.toggle("open");

// The filter column folds into a thin "Филтри" tab on big screens (remembered on this device).
const store = (k, v) => {
  try {
    v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  } catch {
    /* private window */
  }
};
function filtersOpen(open) {
  $("work").classList.toggle("folded", !open);
  $("vtab").setAttribute("aria-expanded", String(open));
  store("filters-folded", open ? undefined : "1");
}
try {
  if (localStorage.getItem("filters-folded") === "1") filtersOpen(false);
} catch {
  /* ignore */
}
$("vtab").onclick = () => filtersOpen($("work").classList.contains("folded"));

// Columns: hide the ones not needed (remembered on this device).
const COL_NAMES = { shop: "Магазин", client: "Клиент", cour: "Куриер", cstat: "Куриер статус", money: "Цена", when: "Поръчано на", note: "Бележка" };
$("colsBtn").onclick = (e) => {
  e.stopPropagation();
  const m = $("colsMenu");
  m.hidden = !m.hidden;
  $("colsBtn").setAttribute("aria-expanded", String(!m.hidden));
  m.innerHTML = `<div class="muted small">Кои колони да се виждат</div>` + HIDEABLE.map((k) => `<label class="chk"><input type="checkbox" data-col="${k}" ${hidden.has(k) ? "" : "checked"}> ${COL_NAMES[k]}</label>`).join("");
  m.querySelectorAll("[data-col]").forEach(
    (c) =>
      (c.onchange = () => {
        c.checked ? hidden.delete(c.dataset.col) : hidden.add(c.dataset.col);
        store("cols-off", hidden.size ? JSON.stringify([...hidden]) : undefined);
        $("table").className = `otbl ${[...hidden].map((k) => `off-${k}`).join(" ")}`;
      }),
  );
};
document.addEventListener("click", (e) => !$("colsMenu").contains(e.target) && ($("colsMenu").hidden = true));

// Excel: the same filters and order as on the screen.
$("exportBtn").onclick = () => {
  const p = params();
  delete p.page;
  delete p.per;
  location.href = `/api/orders/export?${new URLSearchParams(p)}`;
};

// Full screen: only the orders, without the menu and the filters.
$("fullBtn").onclick = async () => {
  const on = !document.body.classList.contains("focus");
  document.body.classList.toggle("focus", on);
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* not allowed here: the page still hides the menu */
  }
};
document.addEventListener("fullscreenchange", () => !document.fullscreenElement && document.body.classList.remove("focus"));
$("closeSide").onclick = () => (matchMedia("(max-width: 1299px)").matches ? $("side").classList.remove("open") : filtersOpen(false));

// ☆ Saved filters: the current filters under a name, for this user on every device.
async function starMenu(open) {
  const m = $("starMenu");
  m.hidden = !open;
  $("starBtn").setAttribute("aria-expanded", String(open));
  if (!open) return;
  m.innerHTML = `<p class="muted small">Зареждам…</p>`;
  try {
    const { saved } = await api("/api/orders/saved");
    m.innerHTML =
      (saved.length
        ? saved.map((x) => `<div class="star"><a href="/poruchki/?${esc(x.query)}">${esc(x.name)}</a><button class="btn link sm" data-del="${esc(x.name)}" aria-label="Изтрий ${esc(x.name)}">✕</button></div>`).join("")
        : `<p class="muted small">Още няма запазени филтри.</p>`) + `<button class="btn sm" id="starSave">☆ Запази текущите филтри</button>`;
    $("starSave").onclick = async () => {
      const name = prompt("Име на филтъра (например „Спиди без товарителница“):");
      if (!name || !name.trim()) return;
      const query = new URLSearchParams(location.search);
      query.delete("page");
      await api("/api/orders/saved", { method: "POST", body: { name: name.trim(), query: query.toString() } });
      starMenu(true);
    };
    m.querySelectorAll("[data-del]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm(`Да изтрия ли „${b.dataset.del}“?`)) return;
          await api("/api/orders/saved", { method: "POST", body: { name: b.dataset.del, delete: true } });
          starMenu(true);
        }),
    );
  } catch (e) {
    m.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}
$("starBtn").onclick = () => starMenu($("starMenu").hidden);
$("refresh").onclick = async () => {
  const b = $("refresh");
  b.disabled = true;
  b.textContent = "Обновявам…";
  try {
    await api("/api/settings/sync", { method: "POST", body: {} });
  } catch (e) {
    alert(e.message);
  }
  b.disabled = false;
  b.textContent = "Обнови";
  load(true);
};
load();
