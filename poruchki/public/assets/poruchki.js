import { ago, api, COURIER, esc, eur, money, num, ONE, qs, setQs, shell, STAGE_ORDER, STAGES } from "./app.js";
import { bulkCreate, cancelWaybill, openLabels, openLabelsFor, openWaybill } from "./waybill.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["q", "shop", "region", "courier", "from", "to"];
const state = {
  tab: qs().has("tab") ? qs().get("tab") : qs().get("stage") ? "" : "active",
  stages: new Set((qs().get("stage") || "").split(",").filter(Boolean)),
  page: Number(qs().get("page")) || 1,
  per: Number(qs().get("per")) === 100 ? 100 : 50,
};
let rows = [];
const selected = new Set();

await shell("poruchki");

try {
  const s = await api("/api/settings");
  $("shop").innerHTML += s.shops.filter((x) => x.active).map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
} catch {
  /* optional */
}
for (const f of FIELDS) $(f).value = qs().get(f) || "";
$("nowaybill").checked = qs().get("nowaybill") === "1";

const ICON = {
  print: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>`,
  cancel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>`,
};

function params() {
  const p = {};
  for (const f of FIELDS) p[f] = $(f).value.trim();
  p.tab = state.tab;
  p.stage = [...state.stages].join(",");
  p.nowaybill = $("nowaybill").checked ? "1" : "";
  p.page = state.page > 1 ? String(state.page) : "";
  p.per = state.per === 100 ? "100" : "";
  return p;
}

const canShip = (o) => !o.tracking_no && o.region === "bg" && (o.currency || "EUR") === "EUR" && !["canceled", "delivered", "returned"].includes(o.stage);
const courierOf = (o) => o.courier || o.delivery?.courier || "";

function deliveryCell(o) {
  const d = o.delivery || {};
  const c = courierOf(o);
  const where = d.type === "office" ? "До офис" : d.type === "automat" ? "До автомат" : d.type === "address" ? "До адрес" : "";
  return `<b>${esc(COURIER[c] || c || "–")}</b><div class="sub">${esc(where)}${d.officeName ? ` „${esc(d.officeName)}“` : ""}</div>`;
}

function courierCell(o) {
  if (!o.tracking_no) return `<span class="sub">${o.region === "bg" ? "няма товарителница" : ""}</span>`;
  const src = o.tracking_source === "own" ? "" : o.tracking_source === "speedy_ref" || o.tracking_source === "econt_match" || o.tracking_source === "middleware" ? " · Middleware" : "";
  const no = o.tracking_link ? `<a href="${esc(o.tracking_link)}" target="_blank" rel="noopener">${esc(o.tracking_no)}</a>` : esc(o.tracking_no);
  return `<div class="cour">${esc(o.parcel_text || "")}</div><div class="wb">${no}<span class="sub">${src}</span></div>`;
}

function actions(o) {
  const c = courierOf(o);
  const out = [];
  if (canShip(o)) out.push(`<button class="btn primary sm" data-act="ship" data-id="${o.id}">Товарителница</button>`);
  if (o.tracking_no && (c === "speedy" || c === "econt")) out.push(`<button class="iconbtn" title="Печат на етикета" aria-label="Печат на етикета" data-act="print" data-id="${o.id}">${ICON.print}</button>`);
  if (o.tracking_source === "own" && ["shipped", "new"].includes(o.stage)) out.push(`<button class="iconbtn" title="Анулирай товарителницата" aria-label="Анулирай товарителницата" data-act="cancel" data-id="${o.id}">${ICON.cancel}</button>`);
  out.push(`<a class="iconbtn" title="Подробности" aria-label="Подробности" href="/poruchka/?id=${o.id}">${ICON.info}</a>`);
  return out.join(" ");
}

function renderSide(f) {
  const total = Object.values(f.stages).reduce((a, b) => a + b, 0);
  const active = (f.stages.new || 0) + (f.stages.shipped || 0) + (f.stages.at_office || 0);
  $("nActive").textContent = num(active);
  $("nDone").textContent = num(total - active);
  $("nAll").textContent = num(total);
  for (const b of $("tabs").querySelectorAll("button")) b.classList.toggle("on", !state.stages.size && b.dataset.tab === state.tab);
  $("stages").innerHTML = STAGE_ORDER.filter((k) => k !== "archived" || f.stages[k])
    .map((k) => `<button data-stage="${k}" class="${state.stages.has(k) ? "on" : ""}"><span class="badge ${k}">${STAGES[k].label}</span><span class="n">${num(f.stages[k] || 0)}</span></button>`)
    .join("");
  $("stages").querySelectorAll("button").forEach(
    (b) =>
      (b.onclick = () => {
        state.stages.has(b.dataset.stage) ? state.stages.delete(b.dataset.stage) : state.stages.add(b.dataset.stage);
        state.tab = "";
        state.page = 1;
        load();
      }),
  );
}

function renderTable(d) {
  rows = d.orders;
  if (!rows.length) {
    $("table").innerHTML = `<tbody><tr><td class="empty">Няма поръчки по тези условия.</td></tr></tbody>`;
    return;
  }
  const allOn = rows.every((o) => selected.has(o.id));
  $("table").innerHTML = `<thead><tr>
      <th><input type="checkbox" id="selAll" aria-label="Избери всички" ${allOn ? "checked" : ""}></th>
      <th>№</th><th>Статус</th><th>Магазин</th><th>Клиент</th><th>Доставка</th><th>Куриер</th><th class="money">Сума</th><th>Поръчана</th><th></th>
    </tr></thead><tbody>
    ${rows
      .map(
        (o) => `<tr class="${selected.has(o.id) ? "sel" : ""}" data-id="${o.id}">
        <td class="c-check"><input type="checkbox" data-sel="${o.id}" aria-label="Избери № ${esc(o.order_no)}" ${selected.has(o.id) ? "checked" : ""}></td>
        <td class="no"><a href="/poruchka/?id=${o.id}">${esc(o.order_no)}</a></td>
        <td class="c-badge"><span class="badge ${o.stage}">${o.parcel_status === "refused" ? "Отказана на място" : ONE[o.stage] || o.stage}</span></td>
        <td class="c-shop">${esc(o.shop_label)}</td>
        <td class="c-client">${esc(o.customer_name || "–")}<div class="sub">${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ""}${o.city ? ` · ${esc(o.city)}` : ""}</div></td>
        <td class="c-deliv">${deliveryCell(o)}</td>
        <td class="c-cour">${courierCell(o)}</td>
        <td class="money">${money(o.total, o.currency)}${o.currency !== "EUR" ? `<div class="sub">${eur(o.total_eur)}</div>` : o.shipping ? `<div class="sub">${money(o.sub_total, o.currency)} + доставка</div>` : ""}</td>
        <td class="c-when">${ago(o.ordered_at)}<div class="sub">${new Date(o.ordered_at).toLocaleString("bg-BG", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></td>
        <td class="acts">${actions(o)}</td>
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
  $("table").querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => act(b.dataset.act, Number(b.dataset.id))));
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

async function act(what, id) {
  const o = rows.find((x) => x.id === id);
  try {
    if (what === "ship") {
      if (await openWaybill(id)) load(true);
    } else if (what === "print") openLabels([id]);
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
for (const f of ["shop", "region", "courier", "from", "to", "nowaybill"]) $(f).onchange = () => ((state.page = 1), load());
$("clear").onclick = () => {
  for (const f of FIELDS) $(f).value = "";
  $("nowaybill").checked = false;
  state.stages.clear();
  state.tab = "active";
  state.page = 1;
  load();
};
$("filtersBtn").onclick = () => $("side").classList.toggle("open");
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
