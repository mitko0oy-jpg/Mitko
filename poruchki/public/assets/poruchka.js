import { api, COURIER, esc, eur, money, officeBadge, ONE, qs, shell, when } from "./app.js";
import { cancelWaybill, openLabels, openRedirect, openWaybill } from "./waybill.js";
import { mountProducts, renderHistory } from "./order-edit.js";
import { openSms } from "./sms.js";
import { openOrderForm } from "./order-form.js";
import { openStageMenu } from "./stage-menu.js";
import { progress } from "./order-panel.js";

const $ = (id) => document.getElementById(id);
const id = Number(qs().get("id"));
const SINGULAR = ONE;
const SOURCE = { cb: "от магазина", middleware: "от Middleware", own: "създадена от платформата", econt_match: "от Middleware (намерена в Еконт по телефона)", speedy_ref: "от Middleware (намерена в Спиди по номера на поръчката)" };
const AI = "AI агент";
// „📞 Обади се“: what happened when it was pressed (shown until the call is over), and the page refreshes itself meanwhile.
let callMsg = "";
let callPoll = null;
let callPolls = 0;
// „Откъде дойде“: the channel, campaign and ad (orders.src), the pages, and the device and city of the visit.
const CHANNEL = { meta: "Meta реклама", paid: "Платена реклама", tiktok: "TikTok", organic: "Органично", own: "Свои (имейл, SMS, директно)", calls: "Обаждане", manual: "Ръчна поръчка", unknown: "Не се знае" };
const DEVICE = { mobile: "📱 Телефон", tablet: "📱 Таблет", desktop: "💻 Компютър" };
function journeyCard(o) {
  const s = o.src || {};
  const v = o.visit;
  if (!o.src && !v) return "";
  const path = (s.path || []).filter((p, i, a) => p !== a[i - 1]);
  const row = (k, val) => (val ? `<div class="kv"><span class="muted">${k}</span><span>${val}</span></div>` : "");
  return `<section class="card"><h2>Откъде дойде</h2>
    ${row("Канал", esc([CHANNEL[s.channel] || s.channel, s.source].filter(Boolean).join(" · ")))}
    ${row("Позиция", esc(s.medium || ""))}
    ${row("Кампания", esc(s.campaign || ""))}
    ${row("Реклама", esc(s.ad || ""))}
    ${row("Входна страница", esc(s.page || v?.landing || ""))}
    ${row("Страници", path.length ? esc(path.join(" → ")) : "")}
    ${row("Първо посещение", s.first?.at ? `${when(s.first.at)}${s.touches > 1 ? ` · ${s.touches} посещения` : ""}${s.days >= 1 ? ` · ${String(s.days).replace(".", ",")} дни до поръчката` : ""}` : "")}
    ${row("Устройство", v?.device ? DEVICE[v.device] || esc(v.device) : "")}
    ${row("Град по IP", v?.city ? esc([v.city, v.country].filter(Boolean).join(", ")) : "")}
    ${row("Посещения от този браузър", v?.browser_visits > 1 ? String(v.browser_visits) : "")}
    ${!v ? `<p class="muted small">Устройството и градът не се знаят: формата за поръчка не е стигнала до нас.</p>` : ""}
  </section>`;
}

// „✕ Откажи“: an order not sent yet (no waybill); „Върни“ undoes a refusal made here.
const canRefuse = (o) => !o.canceled_at && !o.tracking_no && !o.cb_shipped && !o.parcel_status && ["abandoned", "new", "duplicate"].includes(o.stage);
const CALL_WAIT = { requested: "☎ чака обаждане от Александра", calling: "📞 Александра звъни…" };
// Held as a duplicate: what the same customer already ordered, and the two ways out.
function dupBox(o) {
  if (o.stage !== "duplicate" || !o.dup) return "";
  const d = o.dup;
  const items = (Array.isArray(d.items) ? d.items : []).map((it) => `${esc(it.name)} × ${Number(it.qty) || 1}`).join(", ");
  return `<div class="dupbox stack" style="gap:8px">
    <div><b>Дублирана поръчка – задържана за преглед.</b> Същият клиент вече поръча
      <a href="/poruchka/?id=${d.id}">№ ${esc(d.order_no)}</a> (${esc(d.shop_label)}, ${when(d.ordered_at)}, ${esc(ONE[d.stage] || d.stage)}, ${money(d.total, d.currency)})${items ? `: ${items}` : ""}.</div>
    <div class="muted small">Докато е задържана, няма товарителница и AI обаждане. Ако е истинска втора поръчка – „Не е дубликат“ (или „Потвърди“); ако е същата – „Архивирай“.</div>
    <div class="row"><button class="btn primary" id="notDupBtn">✓ Не е дубликат</button></div>
  </div>`;
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
  if (!n) return `<section class="card" id="nek">${head}<p class="muted small">Телефонът още не е проверен. Новите поръчки от България се проверяват сами, щом в Настройки има ключ за nekorekten.com.</p></section>`;
  const list = (n.reports || [])
    .map((r) => `<li>${esc(r.text || "–")}<div class="muted small">${r.date ? when(r.date) : ""}${r.name ? ` · ${esc(r.name)}` : ""}${r.city ? ` · ${esc(r.city)}` : ""}</div></li>`)
    .join("");
  return `<section class="card${n.count ? " nekcard" : ""}" id="nek">${head}
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
  const stage = o.parcel_status === "refused" && o.stage === "returned" ? "Отказана на място" : SINGULAR[o.stage] || o.stage;
  $("order").innerHTML = `
  <div class="stack">
    <div class="row spread">
      <div><h1>Поръчка № ${esc(o.order_no)}</h1><div class="muted small">${esc(o.shop_label)} · ${when(o.ordered_at)}</div></div>
      <div class="row"><button type="button" class="badge ${o.stage} stbtn" id="stageBtn" data-act="stage" aria-haspopup="menu" aria-expanded="false" title="Смени статуса" style="font-size:14px">${stage}</button>${o.manual_stage ? `<span class="arch manual" title="Сменен ръчно ${when(o.manual_stage_at)} – важи, докато куриерът не съобщи нов статус">ръчно</span>` : ""}
        ${
          o.confirmed_at
            ? `<span class="conf ${o.confirmed_by === AI ? "ai" : "us"}" style="margin:0" title="${when(o.confirmed_at)}">${o.confirmed_by === AI ? "🤖 AI потвърдена" : `✓ Потвърдена (${esc(o.confirmed_by || "")})`}</span>`
            : `<button class="btn primary" id="confirmBtn">✓ Потвърди</button>${o.phone && !CALL_WAIT[o.call?.state] ? `<button class="btn" id="aiBtn" title="Александра звъни на клиента за потвърждение на поръчката">📞 Обади се</button>` : CALL_WAIT[o.call?.state] ? `<span class="conf no">${CALL_WAIT[o.call.state]}</span>` : ""}`
        }
        <button class="btn" id="smsBtn">SMS</button>
        <button class="btn" id="noteBtn">Бележка</button>
        <button class="btn" id="dupBtn">Дублирай</button>
        ${o.canceled_at ? `<button class="btn" id="uncancelBtn" title="Поръчката не е отказана">Махни отказа</button>` : canRefuse(o) ? `<button class="btn danger" id="cancelOrderBtn" title="Клиентът не иска поръчката">✕ Откажи</button>` : ""}
        <button class="btn" id="archBtn">${o.archived_at ? "Върни от архива" : "Архивирай"}</button>
        <button class="btn" id="refresh">Провери пак</button></div>
    </div>
    ${progress(o)}
    ${dupBox(o)}
    ${callMsg ? `<div class="note">${esc(callMsg)}</div>` : ""}
    ${o.canceled_at ? `<div class="note">✕ Отказана ${when(o.canceled_at)}${o.cancel_reason ? ` – ${esc(o.cancel_reason)}` : ""}</div>` : ""}
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
          <dt>Статус</dt><dd>${esc(o.parcel_text || "–")}${o.parcel_at ? `<div class="muted small">${when(o.parcel_at)}</div>` : ""}${officeBadge(o)}</dd>
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
    ${journeyCard(o)}
    ${nekCard(o)}
    <section class="card" id="historyCard"></section>
  </div>`;
  mountProducts($("productsCard"), o, (fresh) => render(fresh));
  // From ✎ in the orders list → „Продукти и цени“: open the products editor once.
  if (location.hash === "#produkti") {
    history.replaceState(null, "", location.pathname + location.search);
    $("productsCard").querySelector("#peEdit")?.click();
    $("productsCard").scrollIntoView({ block: "start" });
  }
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
  if ($("aiBtn"))
    $("aiBtn").onclick = async () => {
      const b = $("aiBtn");
      b.disabled = true;
      b.textContent = "Свързвам…";
      try {
        const r = await api(`/api/orders/${id}/ai-call`, { method: "POST", body: {} });
        callMsg = r.call_now?.message || "";
        callPolls = 0;
        render(r);
      } catch (e) {
        alert(e.message);
        b.disabled = false;
        b.textContent = "📞 Обади се";
      }
    };
  // While Александра is to call or calling, look again every 15 seconds (up to 15 minutes) to show the result.
  clearTimeout(callPoll);
  if (CALL_WAIT[o.call?.state] && callPolls < 60) {
    callPoll = setTimeout(async () => {
      callPolls++;
      try {
        render(await api(`/api/orders/${id}`));
      } catch {}
    }, 15000);
  } else if (!CALL_WAIT[o.call?.state]) callMsg = "";
  $("noteBtn").onclick = () => {
    const text = prompt("Бележка към поръчката:", o.note || "");
    if (text && text.trim()) post("note", { text });
  };
  $("archBtn").onclick = () => post(o.archived_at ? "unarchive" : "archive");
  $("stageBtn").onclick = () => openStageMenu(o, $("stageBtn"), render);
  if ($("cancelOrderBtn"))
    $("cancelOrderBtn").onclick = () => {
      const reason = prompt("Защо е отказана? (може и празно)", "");
      if (reason !== null) post("cancel-order", { reason });
    };
  if ($("uncancelBtn")) $("uncancelBtn").onclick = () => post("uncancel-order");
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
  const canShip = o.stage !== "duplicate" && !o.tracking_no && o.region === "bg" && (o.currency || "EUR") === "EUR" && !["canceled", "delivered", "returned"].includes(o.stage);
  $("wbActs").innerHTML = [
    canShip ? `<button class="btn primary sm" id="wbNew">Създай товарителница</button>` : "",
    o.tracking_no && (courier === "speedy" || courier === "econt") ? `<button class="btn sm" id="wbPrint">Етикет</button>` : "",
    o.tracking_source === "own" && ["prepared", "shipped", "new"].includes(o.stage) ? `<button class="btn sm danger" id="wbCancel">Анулирай</button>` : "",
    o.tracking_no && ["shipped", "at_office"].includes(o.stage) && o.courier === "econt" ? `<button class="btn sm" id="wbRedirect">Пренасочи</button>` : "",
  ].join("");
  const reload = async () => render(await api(`/api/orders/${id}`));
  if ($("wbNew")) $("wbNew").onclick = async () => (await openWaybill(id)) && reload();
  if ($("wbPrint")) $("wbPrint").onclick = () => openLabels([id]);
  if ($("notDupBtn"))
    $("notDupBtn").onclick = async () => {
      $("notDupBtn").disabled = true;
      try {
        await api(`/api/orders/${id}/not-duplicate`, { method: "POST", body: {} });
        reload();
      } catch (e) {
        alert(e.message);
        $("notDupBtn").disabled = false;
      }
    };
  if ($("wbRedirect")) $("wbRedirect").onclick = async () => (await openRedirect(id)) && reload();
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
