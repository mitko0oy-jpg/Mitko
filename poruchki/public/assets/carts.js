// Незавършени: the cart stream (0–72 h), SMS / e-mail to a cart, and the reminder settings.
import { api, esc, num } from "./app.js";

const $ = (id) => document.getElementById(id);
const ZONES = [
  { id: "fresh", label: "Пресни", from: 0, to: 1, color: "#ff7a45" },
  { id: "warm", label: "Топли", from: 1, to: 6, color: "#f5b041" },
  { id: "cool", label: "Изстиващи", from: 6, to: 24, color: "#4aa3ff" },
  { id: "edge", label: "На ръба", from: 24, to: 72, color: "#a68bff" },
];
const zoneOf = (h) => ZONES.find((z) => h < z.to) || ZONES[3];
const xOf = (h) => {
  const i = ZONES.findIndex((z) => h < z.to);
  const z = ZONES[i < 0 ? 3 : i];
  const k = i < 0 ? 3 : i;
  return k * 25 + 25 * Math.min(1, (h - z.from) / (z.to - z.from));
};
const hash = (n) => ((Math.imul(Number(n) ^ 0x5bd1e995, 2654435761) >>> 0) % 1000) / 1000;
const dur = (h) => {
  const m = Math.max(0, Math.round(h * 60));
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
};
const eur = (n) => `${num(Math.round(n))} EUR`;
const fmtValue = (v) => (v.currency && v.currency !== "EUR" ? `${num(v.amount)} ${v.currency}` : `${(v.amount || 0).toFixed(2).replace(".", ",")} €`);
let stream = null;
let pinned = null;
let hooks = { onAction: () => {} };

/** The pop-up of one cart: what it is, how long it has left, how to reach the person. */
function pop(c, withActions) {
  const z = zoneOf(c.hours);
  const left = Math.max(0, stream.window - c.hours);
  const rem = c.reminders ? `${c.reminders} ${c.reminders === 1 ? "напомняне" : "напомняния"} · последно преди ${dur((Date.now() - Date.parse(c.last_reminder)) / 3600e3)}` : "Без напомняния";
  return `<div class="cp-head"><b>${esc(c.name || "Без име")}</b><span class="cp-val">${esc(fmtValue(c.value))}</span></div>
    <span class="cp-zone" style="--z:${z.color}">${z.label} · ${dur(c.hours)}</span>
    <div class="cp-win"><span>Прозорец ${stream.window} ч</span><span>изтича след ${dur(left)}</span></div>
    <div class="cp-bar"><span style="width:${Math.min(100, (c.hours / stream.window) * 100)}%"></span></div>
    <div class="cp-chips"><span class="${c.email ? "ok" : "no"}">Имейл ${c.email ? "✓" : "✗"}</span><span class="${c.phone ? "ok" : "no"}">Телефон ${c.phone ? "✓" : "✗"}</span><span class="shop">${esc(c.shop_label)}</span></div>
    <div class="cp-rem">${rem}</div>
    ${(c.cart || []).length ? `<ul class="cp-cart">${c.cart.slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${
      withActions
        ? `<div class="cp-acts">
            ${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone)}">Обади се</a><button class="btn sm" data-cact="sms" data-id="${c.id}">SMS</button>` : ""}
            ${c.email ? `<button class="btn sm" data-cact="email" data-id="${c.id}">Имейл</button>` : ""}
            <button class="btn primary sm" data-cact="order" data-id="${c.id}">Създай поръчка</button>
            <button class="btn sm" data-cact="dismiss" data-id="${c.id}">Скрий</button>
            <button class="iconbtn" data-cact="close" aria-label="Затвори">✕</button>
          </div>`
        : `<div class="cp-hint">Клик – бързи действия</div>`
    }`;
}

function place(el, target) {
  const box = $("lane").parentElement.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  el.hidden = false;
  const w = el.offsetWidth;
  let left = r.left - box.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(box.width - w - 8, left));
  let top = r.bottom - box.top + 10;
  if (top + el.offsetHeight > box.height + 120) top = r.top - box.top - el.offsetHeight - 10;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function renderStream() {
  if (!stream) return;
  const carts = stream.carts;
  const total = carts.reduce((n, c) => n + c.value.eur, 0);
  const reach = carts.filter((c) => c.phone || c.email).length;
  const risk = carts.filter((c) => stream.window - c.hours < 12);
  $("sstats").innerHTML = [
    `<span>${num(carts.length)} колички</span>`,
    `<span class="gold">${eur(total)}</span>`,
    `<span>Достижими: ${carts.length ? Math.round((reach / carts.length) * 100) : 0}%</span>`,
    `<span>Ср. стойност: ${carts.length ? num(Math.round(total / carts.length)) : 0}</span>`,
    `<span class="good" title="Колички от днес, които после станаха поръчка">Възстановени днес: ${num(stream.recovered.n)}${stream.recovered.n ? ` · ${eur(stream.recovered.sum)}` : ""}${stream.recovered.afterReminder ? ` (${stream.recovered.afterReminder} след напомняне)` : ""}</span>`,
    `<span class="bad">В риск &lt;12 ч: ${num(risk.length)} · ${eur(risk.reduce((n, c) => n + c.value.eur, 0))}</span>`,
  ].join("");
  const max = Math.max(1, ...carts.map((c) => c.value.eur));
  const zoneTop = ZONES.map((z, i) => {
    const mine = carts.filter((c) => zoneOf(c.hours) === z);
    return `<div class="zone" style="left:${i * 25}%"><span class="ztag" style="--z:${z.color}">${z.label} · ${mine.length} · ${eur(mine.reduce((n, c) => n + c.value.eur, 0))}</span></div>`;
  }).join("");
  $("lane").innerHTML =
    zoneTop +
    carts
      .map((c) => {
        const z = zoneOf(c.hours);
        const size = Math.round(18 + Math.sqrt(c.value.eur / max) * 34);
        const top = 18 + hash(c.id) * 64;
        const late = stream.window - c.hours < 12;
        return `<button class="bub ${z.id} ${late ? "late" : ""} ${c.reminders ? "rem" : ""}" data-cart="${c.id}" aria-label="${esc(c.name || "Без име")}, ${esc(fmtValue(c.value))}"
          style="left:calc(${xOf(c.hours)}% - ${size / 2}px);top:${top}%;width:${size}px;height:${size}px;--z:${z.color};animation-delay:-${(hash(c.id + 7) * 6).toFixed(1)}s"><span>${esc((c.name || "?").trim().charAt(0).toUpperCase())}</span></button>`;
      })
      .join("") +
    (carts.length ? "" : `<div class="lane-empty">Няма незавършени колички в последните ${stream.window} часа.</div>`);
  $("zones").innerHTML = ZONES.map((z) => `<span style="color:${z.color}">${carts.filter((c) => zoneOf(c.hours) === z).length} ${z.label}</span>`).join("");
  if (pinned && !carts.some((c) => c.id === pinned)) pinned = null;
}

export async function loadStream(shop) {
  try {
    stream = await api(`/api/leads/stream${shop ? `?shop=${encodeURIComponent(shop)}` : ""}`);
    renderStream();
  } catch (e) {
    $("sstats").innerHTML = `<span class="err">${esc(e.message)}</span>`;
  }
}

export function initStream(h) {
  hooks = h;
  const popEl = $("cartpop");
  const lane = $("lane");
  lane.addEventListener("mouseover", (e) => {
    const b = e.target.closest(".bub");
    if (!b || pinned) return;
    popEl.innerHTML = pop(stream.carts.find((c) => c.id === Number(b.dataset.cart)), false);
    popEl.classList.remove("pinned");
    place(popEl, b);
  });
  lane.addEventListener("mouseout", (e) => {
    if (!pinned && !e.relatedTarget?.closest?.(".bub")) popEl.hidden = true;
  });
  lane.addEventListener("click", (e) => {
    const b = e.target.closest(".bub");
    if (!b) return;
    pinned = Number(b.dataset.cart);
    popEl.innerHTML = pop(stream.carts.find((c) => c.id === pinned), true);
    popEl.classList.add("pinned");
    place(popEl, b);
  });
  popEl.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-cact]");
    if (!a) return;
    if (a.dataset.cact === "close") {
      pinned = null;
      popEl.hidden = true;
      return;
    }
    await hooks.onAction(a.dataset.cact, Number(a.dataset.id), stream.carts.find((c) => c.id === Number(a.dataset.id)));
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && ((pinned = null), (popEl.hidden = true)));
}

// ---- SMS / e-mail to one cart ----
let info = null;
export async function reminderInfo(force = false) {
  if (!info || force) info = await api("/api/leads/reminders");
  $("autoDot").classList.toggle("on", Boolean(info.settings.auto));
  return info;
}
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
function fill(text, l) {
  const v = {
    "{име}": first(l.name),
    "{магазин}": String(l.shop_label || "").replace(/\s+(BG|SK|SI|HU)$/i, ""),
    "{линк}": l.shop_domain ? `https://${l.shop_domain}${l.page && l.page.startsWith("/") ? l.page : "/"}` : "",
    "{количка}": (l.cart || []).map((c) => `• ${c}`).join("\n"),
    "{сума}": String(l.total || ""),
  };
  return Object.entries(v)
    .reduce((t, [k, x]) => t.split(k).join(x), text)
    .replace(/^Здравейте, !/, "Здравейте!")
    .replace(/[ \t]+([,.!])/g, "$1")
    .trim();
}

/** The SMS or e-mail window for a cart (l = the row from /api/leads with shop_domain and page). */
export async function openMessage(channel, l) {
  const r = await reminderInfo();
  const ready = channel === "sms" ? r.sms.configured : r.email.configured;
  const d = $("dlg");
  const s = r.settings;
  d.innerHTML = `<div class="mh"><h2>${channel === "sms" ? "SMS" : "Имейл"} до ${esc(l.name || "клиента")}</h2><button class="iconbtn" data-x aria-label="Затвори">✕</button></div>
    <form class="mb" id="msgForm">
      <div class="muted small">До: <b>${esc(channel === "sms" ? l.phone : l.email)}</b> · ${esc(l.shop_label)}</div>
      ${ready ? "" : `<div class="note err">${channel === "sms" ? "SMS не е свързан – добави токена от SMSAPI в Настройки → SMS." : "Имейлът не е свързан – добави ключ от Brevo в „Напомняния“."}</div>`}
      ${channel === "email" ? `<label>Тема<input type="text" name="subject" value="${esc(fill(s.emailSubject, l))}"></label>` : ""}
      <label>Текст<textarea name="text" rows="${channel === "sms" ? 4 : 9}" style="width:100%;font:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--surface)">${esc(fill(channel === "sms" ? s.sms : s.emailText, l))}</textarea></label>
      ${channel === "sms" ? `<div class="muted small" id="smsLen"></div>` : `<div class="muted small">Накрая се добавя линк за отписване.</div>`}
      <p class="err small" id="msgErr"></p>
    </form>
    <div class="mf"><button class="btn" data-x>Откажи</button><button class="btn primary" id="msgSend" ${ready ? "" : "disabled"}>Изпрати</button></div>`;
  d.showModal();
  d.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => d.close()));
  const f = $("msgForm");
  const len = () => {
    if (channel !== "sms") return;
    const t = f.text.value;
    const uni = /[^\x00-\x7f]/.test(t);
    const parts = t.length <= (uni ? 70 : 160) ? 1 : Math.ceil(t.length / (uni ? 67 : 153));
    $("smsLen").textContent = `${t.length} знака · ${parts} SMS${uni ? " (кирилица)" : ""}`;
  };
  if (channel === "sms") f.text.oninput = len;
  len();
  return new Promise((done) => {
    d.onclose = () => done(false);
    $("msgSend").onclick = async () => {
      $("msgSend").disabled = true;
      try {
        await api(`/api/leads/${l.id}`, { method: "POST", body: { action: channel, text: f.text.value, subject: f.subject?.value } });
        d.onclose = null;
        d.close();
        done(true);
      } catch (e) {
        $("msgErr").textContent = e.message;
        $("msgSend").disabled = false;
      }
    };
  });
}

// ---- the reminder settings (owner) ----
export async function openReminderSettings(isAdmin) {
  const r = await reminderInfo(true);
  const s = r.settings;
  const d = $("dlg");
  const dis = isAdmin ? "" : "disabled";
  d.innerHTML = `<div class="mh"><h2>Напомняния за незавършени поръчки</h2><button class="iconbtn" data-x aria-label="Затвори">✕</button></div>
    <form class="mb" id="remForm" autocomplete="off">
      <fieldset class="form">
        <legend>Канали</legend>
        <div>SMS: ${r.sms.configured ? `<span class="ok">свързан ✓</span>` : `<span class="err">не е свързан</span> – <a href="/nastroiki/#sms">Настройки → SMS</a>`}</div>
        <div>Имейл (Brevo): ${r.email.configured ? `<span class="ok">свързан ✓</span> · от ${esc(r.email.fromName ? `${r.email.fromName} <${r.email.fromEmail}>` : r.email.fromEmail)}${r.email.source === "env" ? " (от Netlify)" : ""}` : `<span class="err">не е свързан</span>`}</div>
        <details ${r.email.configured ? "" : "open"}><summary class="small">Свържи имейла</summary>
          <p class="muted small">Brevo праща до 300 имейла на ден безплатно: brevo.com → регистрация → SMTP &amp; API → API Keys → нов ключ. Подателят трябва да е потвърден в Brevo (Senders &amp; IP).</p>
          <div class="grid2">
            <label>Ключ (API key)<input type="password" name="key" placeholder="${r.email.source === "app" ? "сложен е – само за смяна" : "xkeysib-…"}" ${dis}></label>
            <label>Имейл на подателя<input type="text" name="fromEmail" value="${esc(r.email.fromEmail || "")}" placeholder="shop@beevenom.bg" ${dis}></label>
            <label>Име на подателя<input type="text" name="fromName" value="${esc(r.email.fromName || "")}" placeholder="BeeVenom" ${dis}></label>
          </div>
        </details>
      </fieldset>
      <fieldset class="form">
        <legend>Автоматично</legend>
        <label class="chk"><input type="checkbox" name="auto" ${s.auto ? "checked" : ""} ${dis}> <span><b>Пращай напомнянията сами</b> (между 9:00 и 21:00, до 72 ч след количката, всяко по веднъж)</span></label>
        <div class="remstep"><b>1.</b> след <input type="number" name="a1" min="10" max="1440" value="${s.step1.after}" ${dis}> минути
          <label class="chk"><input type="checkbox" name="s1" ${s.step1.sms ? "checked" : ""} ${dis}> SMS</label>
          <label class="chk"><input type="checkbox" name="e1" ${s.step1.email ? "checked" : ""} ${dis}> Имейл</label></div>
        <div class="remstep"><label class="chk"><input type="checkbox" name="on2" ${s.step2.on ? "checked" : ""} ${dis}> <b>2.</b></label> след <input type="number" name="a2" min="2" max="71" value="${s.step2.after}" ${dis}> часа
          <label class="chk"><input type="checkbox" name="s2" ${s.step2.sms ? "checked" : ""} ${dis}> SMS</label>
          <label class="chk"><input type="checkbox" name="e2" ${s.step2.email ? "checked" : ""} ${dis}> Имейл</label></div>
        <p class="muted small">Не се праща, ако клиентът вече е поръчал, ако количката е скрита или ако се е отписал. Проверката е на всеки 30 минути.</p>
      </fieldset>
      <fieldset class="form">
        <legend>Текстове</legend>
        <label>SMS<textarea name="sms" rows="3" ${dis}>${esc(s.sms)}</textarea></label>
        <label>Тема на имейла<input type="text" name="emailSubject" value="${esc(s.emailSubject)}" ${dis}></label>
        <label>Имейл<textarea name="emailText" rows="8" ${dis}>${esc(s.emailText)}</textarea></label>
        <p class="muted small">Може: {име}, {магазин}, {линк} (страницата, от която е поръчвал), {количка}, {сума}.</p>
      </fieldset>
      <p class="muted small">По закон (GDPR) рекламни SMS и имейли се пращат с основание: добре е във формата да има отметка за съгласие или поне изречението от „Как се включва на сайта“ в политиката за поверителност. Всеки имейл има линк за отписване.</p>
      <p class="err small" id="remErr"></p>
    </form>
    <div class="mf"><button class="btn" data-x>Затвори</button>${isAdmin ? `<button class="btn primary" id="remSave">Запази</button>` : ""}</div>`;
  d.showModal();
  d.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => d.close()));
  if (!isAdmin) return;
  $("remSave").onclick = async () => {
    const f = $("remForm");
    $("remSave").disabled = true;
    $("remErr").textContent = "";
    try {
      if (f.key.value.trim() || f.fromEmail.value.trim() !== (r.email.fromEmail || "") || f.fromName.value.trim() !== (r.email.fromName || ""))
        await api("/api/leads/email", { method: "POST", body: { key: f.key.value, fromEmail: f.fromEmail.value, fromName: f.fromName.value } });
      await api("/api/leads/reminders", {
        method: "POST",
        body: {
          auto: f.auto.checked,
          step1: { after: Number(f.a1.value), sms: f.s1.checked, email: f.e1.checked },
          step2: { on: f.on2.checked, after: Number(f.a2.value), sms: f.s2.checked, email: f.e2.checked },
          sms: f.sms.value,
          emailSubject: f.emailSubject.value,
          emailText: f.emailText.value,
        },
      });
      await reminderInfo(true);
      d.close();
    } catch (e) {
      $("remErr").textContent = e.message;
      $("remSave").disabled = false;
    }
  };
}
