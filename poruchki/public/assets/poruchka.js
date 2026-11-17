import { api, COURIER, esc, eur, money, ONE, qs, shell, when } from "./app.js";
import { cancelWaybill, openLabels, openWaybill } from "./waybill.js";
import { mountProducts, renderHistory } from "./order-edit.js";
import { openSms } from "./sms.js";
import { openOrderForm } from "./order-form.js";

const $ = (id) => document.getElementById(id);
const id = Number(qs().get("id"));
const SINGULAR = ONE;
const SOURCE = { cb: "от магазина", middleware: "от Middleware", own: "създадена от платформата", econt_match: "от Middleware (намерена в Еконт по телефона)", speedy_ref: "от Middleware (намерена в Спиди по номера на поръчката)" };
const AI = "AI агент";
const STEPS = [
  ["new", "Създадена"],
  ["confirmed", "Потвърдена"],
  ["prepared", "Изготвена"],
  ["shipped", "Изпратена"],
  ["at_office", "В офис"],
  ["delivered", "Взета"],
];
function progress(o) {
  if (["returned", "canceled"].includes(o.stage)) return "";
  const reached = new Set(["new"]);
  if (o.confirmed_at) reached.add("confirmed");
  const order = ["prepared", "shipped", "at_office", "delivered"];
  const at = order.indexOf(o.stage);
  for (let i = 0; i <= at; i++) reached.add(order[i]);
  if (at >= 0) reached.add("confirmed");
  if (o.stage === "delivered") reached.add("at_office");
  return `<ol class="steps">${STEPS.map(([k, l]) => `<li class="${reached.has(k) ? "on" : ""}">${l}</li>`).join("")}</ol>`;
}
const CB_STATUS = { pending: "нова", shipped: "изпратена", completed: "завършена", canceled: "отказана", archived: "архивирана" };

await shell("poruchki");
if (document.referrer.includes("/poruchki/")) $("back").href = document.referrer;

/** Reports from nekorekten.com for this phone (their terms: always say where they come from). */
function nekCard(o) {
  const n = o.nekorekten;
  const bad = ["returned", "canceled"].includes(o.stage) || o.parcel_status === "refused";
  const head = `<div class="row spread"><h2>Сигнали от <a href="https://nekorekten.com" target="_blank" rel="noopener">nekorekten.com</a></h2>
    <div class="row">${o.phone ? `<button class="btn sm" id="nekCheck">${n ? "Провери пак" : "Провери"}</button>` : ""}${o.phone && bad ? `<button class="btn sm danger" id="nekReport">Подай сигнал</button>` : ""}</div></div>`;
  if (!n) return `<section class="card">${head}<p class="muted small">Телефонът още не е проверен. Новите поръчки от България се проверяват сами, щом в Настройки има ключ за nekorekten.com.</p></section>`;
  const list = (n.reports || [])
    .map((r) => `<li>${esc(r.text || "–")}<div class="muted small">${r.date ? when(r.date) : ""}${r.name ? ` · ${esc(r.name)}` : ""}${r.city ? ` · ${esc(r.city)}` : ""}</div></li>`)
    .join("");
  return `<section class="card${n.count ? " nekcard" : ""}">${head}
    ${n.error ? `<p class="err small">${esc(n.error)}</p>` : n.count ? `<p><b>${n.count} сигнала</b> за този телефон.</p><ul class="timeline">${list}</ul>` : `<p class="ok small">Няма сигнали за този телефон.</p>`}
    <p class="muted small">Проверено ${when(n.checked_at)} · източник: nekorekten.com</p></section>`;
}

function render(o) {
  const d = o.delivery || {};
  const deliveryText = [
    d.type === "office" ? "До офис" : d.type === "automat" ? "До автомат" : d.type === "address" ? "До адрес" : "",
    COURIER[d.courier] || "",
    d.officeName ? `„${d.officeName}“` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const stage = o.parcel_status === "refused" ? "Отказана на място" : SINGULAR[o.stage] || o.stage;
  $("order").innerHTML = `
  <div class="stack">
    <div class="row spread">
      <div><h1>Поръчка № ${esc(o.order_no)}</h1><div class="muted small">${esc(o.shop_label)} · ${when(o.ordered_at)}</div></div>
      <div class="row"><span class="badge ${o.stage}" style="font-size:14px">${stage}</span>
        ${
          o.confirmed_at
            ? `<span class="conf ${o.confirmed_by === AI ? "ai" : "us"}" style="margin:0" title="${when(o.confirmed_at)}">${o.confirmed_by === AI ? "🤖 AI потвърдена" : `✓ Потвърдена (${esc(o.confirmed_by || "")})`}</span>`
            : `<button class="btn primary" id="confirmBtn">✓ Потвърди</button>${o.phone && !["requested", "calling"].includes(o.call?.state) ? `<button class="btn" id="aiBtn">🤖 AI потвърждение</button>` : o.call?.state ? `<span class="conf no">☎ ${o.call.state === "calling" ? "AI звъни…" : "чака AI обаждане"}</span>` : ""}`
        }
        <button class="btn" id="smsBtn">SMS</button>
        <button class="btn" id="noteBtn">Бележка</button>
        <button class="btn" id="dupBtn">Дублирай</button>
        <button class="btn" id="archBtn">${o.archived_at ? "Върни от архива" : "Архивирай"}</button>
        <button class="btn" id="refresh">Провери пак</button></div>
    </div>
    ${progress(o)}
    ${o.note ? `<div class="note">📝 ${esc(o.note)}</div>` : ""}
    <div class="grid2">
      <section class="card">
        <div class="row spread"><h2>Клиент и доставка</h2><button class="btn sm" id="contactBtn">Редактирай</button></div>
        <dl class="kv">
          <dt>Име</dt><dd>${esc(o.customer_name || "–")}</dd>
          <dt>Телефон</dt><dd>${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : "–"}</dd>
          ${o.email ? `<dt>Имейл</dt><dd>${esc(o.email)}</dd>` : ""}
          <dt>Доставка</dt><dd>${esc(deliveryText || o.shipping_name || "–")}</dd>
          <dt>Адрес</dt><dd>${esc([o.city, o.address, o.address2].filter((x) => x && !/^\s*До офис/i.test(x)).join(", ") || "–")}</dd>
          ${o.extra_fields.map((f) => `<dt>${esc(f.field)}</dt><dd>${esc(f.value)}</dd>`).join("")}
        </dl>
      </section>
      <section class="card">
        <div class="row spread"><h2>Пратка</h2><div class="row" id="wbActs"></div></div>
        <dl class="kv">
          <dt>Куриер</dt><dd>${esc(COURIER[o.courier] || o.courier || "–")}</dd>
          <dt>Товарителница</dt><dd>${o.tracking_no ? (o.tracking_link ? `<a href="${esc(o.tracking_link)}" target="_blank" rel="noopener">${esc(o.tracking_no)}</a>` : esc(o.tracking_no)) : "още няма"}
            ${o.tracking_source ? `<div class="muted small">${SOURCE[o.tracking_source] || ""}</div>` : ""}</dd>
          <dt>Статус</dt><dd>${esc(o.parcel_text || "–")}${o.parcel_at ? `<div class="muted small">${when(o.parcel_at)}</div>` : ""}</dd>
          <dt>В магазина</dt><dd>${esc(CB_STATUS[o.cb_status] || o.cb_status)}${o.mw_status ? ` <span class="muted small">· Middleware: ${esc(o.mw_status)}</span>` : ""}</dd>
          ${o.tracked_at ? `<dt>Проверена</dt><dd>${when(o.tracked_at)}</dd>` : ""}
          ${o.track_error ? `<dt>Проблем</dt><dd class="err">${esc(o.track_error)}</dd>` : ""}
        </dl>
        ${
          (o.parcel_events || []).length
            ? `<h2 style="margin-top:16px">Движение</h2><ul class="timeline">${[...o.parcel_events]
                .reverse()
                .map((e) => `<li>${esc(e.text)}${e.place ? ` <span class="muted">· ${esc(e.place)}</span>` : ""}${e.at ? `<div class="muted small">${when(e.at)}</div>` : ""}</li>`)
                .join("")}</ul>`
            : ""
        }
      </section>
    </div>
    <section class="card" id="productsCard"></section>
    ${
      o.shop_notes.length
        ? `<section class="card"><h2>Бележки от магазина</h2><ul class="timeline">${o.shop_notes.map((n) => `<li>${esc(n.text)}${n.at ? `<div class="muted small">${when(n.at)}</div>` : ""}</li>`).join("")}</ul></section>`
        : ""
    }
    ${nekCard(o)}
    <section class="card" id="historyCard"></section>
  </div>`;
  mountProducts($("productsCard"), o, (fresh) => render(fresh));
  if ($("nekCheck"))
    $("nekCheck").onclick = async () => {
      $("nekCheck").disabled = true;
      try {
        await api("/api/nekorekten/check", { method: "POST", body: { orderId: id } });
        render(await api(`/api/orders/${id}`));
      } catch (e) {
        alert(e.message);
        $("nekCheck").disabled = false;
      }
    };
  if ($("nekReport"))
    $("nekReport").onclick = async () => {
      const text = prompt(
        "Сигнал към nekorekten.com за този клиент.\nОпиши само фактите – например „Не взе пратката от офиса, поръчка № " + o.order_no + ", " + new Date(o.ordered_at).toLocaleDateString("bg-BG") + "“.\nСигналът е публичен в nekorekten.com.",
      );
      if (!text || !text.trim()) return;
      if (!confirm(`Да изпратя ли сигнала за ${o.customer_name || "клиента"} (${o.phone}) към nekorekten.com?`)) return;
      try {
        const r = await api("/api/nekorekten/report", { method: "POST", body: { orderId: id, text } });
        alert(r.message || "Сигналът е изпратен.");
        render(await api(`/api/orders/${id}`));
      } catch (e) {
        alert(e.message);
      }
    };
  renderHistory($("historyCard"), o);
  const reloadNow = async () => render(await api(`/api/orders/${id}`));
  const post = async (action, body = {}) => {
    try {
      render(await api(`/api/orders/${id}/${action}`, { method: "POST", body }));
    } catch (e) {
      alert(e.message);
    }
  };
  if ($("confirmBtn")) $("confirmBtn").onclick = () => post("confirm");
  if ($("aiBtn")) $("aiBtn").onclick = () => post("ai-call");
  $("noteBtn").onclick = () => {
    const text = prompt("Бележка към поръчката:", o.note || "");
    if (text && text.trim()) post("note", { text });
  };
  $("archBtn").onclick = () => post(o.archived_at ? "unarchive" : "archive");
  $("dupBtn").onclick = async () => {
    if (!confirm("Да направя ли нова поръчка със същия клиент, доставка и продукти?")) return;
    try {
      const r = await api(`/api/orders/${id}/duplicate`, { method: "POST", body: {} });
      location.href = `/poruchka/?id=${r.id}`;
    } catch (e) {
      alert(e.message);
    }
  };
  $("contactBtn").onclick = async () => {
    if (await openOrderForm({ mode: "contact", order: o })) reloadNow();
  };
  $("smsBtn").onclick = async () => {
    if (await openSms(id)) render(await api(`/api/orders/${id}`));
  };
  const courier = o.courier || o.delivery?.courier;
  const canShip = !o.tracking_no && o.region === "bg" && (o.currency || "EUR") === "EUR" && !["canceled", "delivered", "returned"].includes(o.stage);
  $("wbActs").innerHTML = [
    canShip ? `<button class="btn primary sm" id="wbNew">Създай товарителница</button>` : "",
    o.tracking_no && (courier === "speedy" || courier === "econt") ? `<button class="btn sm" id="wbPrint">Етикет</button>` : "",
    o.tracking_source === "own" && ["prepared", "shipped", "new"].includes(o.stage) ? `<button class="btn sm danger" id="wbCancel">Анулирай</button>` : "",
  ].join("");
  const reload = async () => render(await api(`/api/orders/${id}`));
  if ($("wbNew")) $("wbNew").onclick = async () => (await openWaybill(id)) && reload();
  if ($("wbPrint")) $("wbPrint").onclick = () => openLabels([id]);
  if ($("wbCancel"))
    $("wbCancel").onclick = async () => {
      try {
        if (await cancelWaybill(id, o.tracking_no)) reload();
      } catch (e) {
        alert(e.message);
      }
    };
  $("refresh").onclick = async () => {
    const b = $("refresh");
    b.disabled = true;
    b.textContent = "Проверявам…";
    try {
      render(await api(`/api/orders/${id}/refresh`, { method: "POST", body: {} }));
    } catch (e) {
      alert(e.message);
      b.disabled = false;
      b.textContent = "Провери пак";
    }
  };
}

try {
  render(await api(`/api/orders/${id}`));
} catch (e) {
  $("order").innerHTML = `<div class="card err">${esc(e.message)}</div>`;
}
