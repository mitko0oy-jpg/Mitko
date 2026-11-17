import { api, COURIER, esc, eur, money, ONE, qs, shell, when } from "./app.js";
import { cancelWaybill, openLabels, openWaybill } from "./waybill.js";

const $ = (id) => document.getElementById(id);
const id = Number(qs().get("id"));
const SINGULAR = ONE;
const SOURCE = { cb: "от магазина", middleware: "от Middleware", own: "създадена от платформата", econt_match: "от Middleware (намерена в Еконт по телефона)", speedy_ref: "от Middleware (намерена в Спиди по номера на поръчката)" };
const CB_STATUS = { pending: "нова", shipped: "изпратена", completed: "завършена", canceled: "отказана", archived: "архивирана" };

await shell("poruchki");
if (document.referrer.includes("/poruchki/")) $("back").href = document.referrer;

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
        <button class="btn" id="refresh">Провери пак</button></div>
    </div>
    <div class="grid2">
      <section class="card">
        <h2>Клиент и доставка</h2>
        <dl class="kv">
          <dt>Име</dt><dd>${esc(o.customer_name || "–")}</dd>
          <dt>Телефон</dt><dd>${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : "–"}</dd>
          ${o.email ? `<dt>Имейл</dt><dd>${esc(o.email)}</dd>` : ""}
          <dt>Доставка</dt><dd>${esc(deliveryText || o.shipping_name || "–")}</dd>
          <dt>Адрес</dt><dd>${esc([o.city, o.address, o.address2].filter(Boolean).join(", ") || "–")}</dd>
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
    <section class="card">
      <h2>Продукти</h2>
      <div class="scroll"><table class="tbl"><thead><tr><th>Продукт</th><th class="r">Брой</th><th class="r">Сума</th></tr></thead><tbody>
        ${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${i.qty}</td><td class="r">${money(i.total, o.currency)}</td></tr>`).join("")}
        <tr><td class="muted">Доставка</td><td></td><td class="r">${money(o.shipping, o.currency)}</td></tr>
        ${o.discount ? `<tr><td class="muted">Отстъпка${o.discount_code ? ` (${esc(o.discount_code)})` : ""}</td><td></td><td class="r">−${money(o.discount, o.currency)}</td></tr>` : ""}
        <tr><td><b>Общо</b></td><td></td><td class="r"><b>${money(o.total, o.currency)}</b>${o.currency !== "EUR" ? `<div class="muted small">${eur(o.total_eur)}</div>` : ""}</td></tr>
      </tbody></table></div>
      <p class="muted small">Плащане: ${esc(o.payment_method || "–")}${o.paid ? " · платена" : ""}</p>
    </section>
    ${
      o.shop_notes.length
        ? `<section class="card"><h2>Бележки от магазина</h2><ul class="timeline">${o.shop_notes.map((n) => `<li>${esc(n.text)}${n.at ? `<div class="muted small">${when(n.at)}</div>` : ""}</li>`).join("")}</ul></section>`
        : ""
    }
  </div>`;
  const courier = o.courier || o.delivery?.courier;
  const canShip = !o.tracking_no && o.region === "bg" && (o.currency || "EUR") === "EUR" && !["canceled", "delivered", "returned"].includes(o.stage);
  $("wbActs").innerHTML = [
    canShip ? `<button class="btn primary sm" id="wbNew">Създай товарителница</button>` : "",
    o.tracking_no && (courier === "speedy" || courier === "econt") ? `<button class="btn sm" id="wbPrint">Етикет</button>` : "",
    o.tracking_source === "own" && ["shipped", "new"].includes(o.stage) ? `<button class="btn sm danger" id="wbCancel">Анулирай</button>` : "",
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
