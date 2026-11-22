// Незавършени: the cart stream (0–72 h), SMS / e-mail to a cart, and the reminder settings.
import { api, esc, num } from "./app.js";

const $ = (id) => document.getElementById(id);
const ZONES = [
  { id: "fresh", label: "Пресни", from: 0, to: 1, color: "#ff7a45", fish: ["#ff9350", "#e8652a", "#ffd9bd"] },
  { id: "warm", label: "Топли", from: 1, to: 6, color: "#f5b041", fish: ["#ffc94d", "#e09a1c", "#fff1c4"] },
  { id: "cool", label: "Изстиващи", from: 6, to: 24, color: "#4aa3ff", fish: ["#62b8ff", "#2f83d4", "#dcf0ff"] },
  { id: "edge", label: "На ръба", from: 24, to: 72, color: "#a68bff", fish: ["#b59dff", "#8466e6", "#eee7ff"] },
];
// The water takes the first 88% of the width (0 → 72 h); after the red line waits the shark.
const WATER = 0.88;
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

/** A cart as a fish (facing the deadline on the right); the colours come from its zone. */
function fishSvg(z) {
  const [a, b, c] = z.fish;
  return `<svg viewBox="0 0 64 40" aria-hidden="true" style="--f1:${a};--f2:${b};--f3:${c}">
    <g class="tl"><path d="M16 20 L2 6 Q7 20 2 34 Z" fill="var(--f2)"/></g>
    <path d="M25 10 Q33 -1 47 9 Z" fill="var(--f2)"/>
    <path d="M30 30 Q35 39 42 31 Z" fill="var(--f2)"/>
    <path d="M14 20 C18 7 40 3 52 9 C60 13 63 18 63 20.5 C63 23 60 27 52 31 C40 37 18 33 14 20 Z" fill="var(--f1)"/>
    <path d="M16 22 C26 33 46 35 61 23 C57 30 47 35 35 34.5 C25 34 19 29 16 22 Z" fill="var(--f3)" opacity=".75"/>
    <path d="M44 9.5 C40 16 40 25 45 31.5" stroke="var(--f3)" stroke-width="2.4" fill="none" opacity=".85"/>
    <ellipse cx="37" cy="12.5" rx="8" ry="2" fill="#fff" opacity=".28"/>
    <path d="M37 21 Q31 26 34 30 Q39 27 37 21 Z" fill="var(--f2)" opacity=".85"/>
    <circle cx="53.5" cy="16.5" r="3.7" fill="#fff"/><circle cx="54.6" cy="16.6" r="1.9" fill="#13202e"/>
    <path d="M62 22.5 Q59.5 24 57 23.4" stroke="#0004" stroke-width="1" fill="none"/>
  </svg>`;
}

const SHARK = `<svg class="shark" viewBox="0 0 240 112" aria-hidden="true">
  <defs><linearGradient id="shk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55697a"/><stop offset="1" stop-color="#8ea2b1"/></linearGradient></defs>
  <path d="M120 41 L141 6 L153 42 Z" fill="#4c6070"/>
  <path d="M206 50 L236 24 L228 58 L238 90 L206 66 Z" fill="#4c6070"/>
  <path d="M4 63 C28 42 88 34 148 39 C182 42 205 47 214 54 C216 58 216 62 213 66 C198 72 170 77 140 79 C92 83 38 82 4 63 Z" fill="url(#shk)"/>
  <path d="M8 66 C40 77 100 80 156 73 C124 84 62 87 8 66 Z" fill="#e8eef2"/>
  <path d="M90 74 L112 104 L121 76 Z" fill="#4c6070"/>
  <path d="M52 52 q3 8 0 15 M58 51 q3 8 0 16 M64 51 q3 8 0 16" stroke="#3b4c5a" stroke-width="1.6" fill="none" opacity=".7"/>
  <circle cx="29" cy="54" r="3.2" fill="#18222d"/><circle cx="28.2" cy="53.2" r="1" fill="#fff" opacity=".7"/>
  <path d="M9 66 Q21 71 35 66" stroke="#2c3a46" stroke-width="1.6" fill="none"/>
</svg>`;

/** The bottom of the sea: hills, sand, rocks, kelp and corals (drawn here). */
function seabed() {
  // Kelp: a swaying stem with leaves on both sides.
  const kelp = (x, h, col, d = 0) => {
    const leaves = Array.from({ length: Math.floor(h / 16) }, (_, i) => {
      const y = 128 - 12 - i * 16;
      const side = i % 2 ? 1 : -1;
      return `<ellipse cx="${x + side * 7}" cy="${y}" rx="8" ry="3.2" transform="rotate(${side * -35} ${x + side * 7} ${y})" fill="${col}"/>`;
    }).join("");
    return `<g class="kelp" style="animation-delay:-${d}s"><path d="M${x} 130 C${x - 8} ${128 - h * 0.3} ${x + 8} ${128 - h * 0.6} ${x} ${128 - h}" stroke="${col}" stroke-width="3.5" fill="none" stroke-linecap="round"/>${leaves}</g>`;
  };
  const grass = (x, col) => `<g class="kelp" fill="${col}">${[-14, -7, 0, 7, 14].map((dx, i) => `<path d="M${x + dx * 0.4} 130 Q${x + dx} ${110 - (i % 2) * 10} ${x + dx * 1.6} ${96 + (i % 3) * 6} Q${x + dx * 0.9} ${112} ${x + dx * 0.4 + 3} 130 Z"/>`).join("")}</g>`;
  const coral = (x, col, s = 1) => `<g transform="translate(${x} 128) scale(${s})" stroke="${col}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M0 0 V-26 M0 -12 L-12 -24 V-34 M0 -18 L11 -30 V-40 M-12 -28 L-20 -34 M11 -34 L18 -42"/></g>`;
  const tubes = (x, col, s = 1) => `<g transform="translate(${x} 128) scale(${s})" fill="${col}"><rect x="-14" y="-30" width="8" height="30" rx="4"/><rect x="-4" y="-40" width="9" height="40" rx="4.5"/><rect x="7" y="-24" width="8" height="24" rx="4"/><g fill="#0003"><ellipse cx="-10" cy="-29" rx="3" ry="1.5"/><ellipse cx="0.5" cy="-39" rx="3.2" ry="1.6"/><ellipse cx="11" cy="-23" rx="3" ry="1.5"/></g></g>`;
  const anemone = (x, col) => `<g transform="translate(${x} 128)" stroke="${col}" stroke-width="3" stroke-linecap="round">${[-50, -32, -16, 0, 16, 32, 50].map((a) => `<path d="M0 0 L${(Math.sin((a * Math.PI) / 180) * 20).toFixed(1)} ${(-Math.cos((a * Math.PI) / 180) * 22).toFixed(1)}"/>`).join("")}<circle r="4" fill="${col}"/></g>`;
  const star = (x, y, col) => `<path transform="translate(${x} ${y}) scale(.9)" d="M0 -7 L2 -2 L7 -2 L3 1.5 L5 7 L0 3.5 L-5 7 L-3 1.5 L-7 -2 L-2 -2 Z" fill="${col}"/>`;
  return `<svg class="seabed" viewBox="0 0 1200 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c9f97"/><stop offset="1" stop-color="#6c716f"/></linearGradient></defs>
    <path d="M0 62 Q110 28 230 56 T470 50 T700 44 T930 58 T1200 40 V150 H0 Z" fill="#0c2c50" opacity=".75"/>
    <path d="M0 92 Q160 70 330 88 T660 84 T980 92 T1200 80 V150 H0 Z" fill="#0b2443" opacity=".8"/>
    ${kelp(38, 118, "#86a83f", 0)}${kelp(330, 78, "#6f9636", 2)}${kelp(612, 124, "#86a83f", 0.7)}${kelp(988, 108, "#86a83f", 1.4)}${kelp(1150, 100, "#86a83f", 0.4)}
    ${grass(70, "#4f8a3a")}${grass(300, "#5d9a44")}${grass(655, "#4f8a3a")}${grass(870, "#5d9a44")}${grass(1185, "#4f8a3a")}
    ${coral(205, "#e2589a", 1.3)}${coral(452, "#9a55d6", 1.5)}${coral(735, "#f0793d", 1.35)}${coral(1060, "#e2589a", 1.15)}
    ${tubes(560, "#c9a62d", 1.25)}${tubes(905, "#8a5bd4", 1.35)}
    ${anemone(262, "#ef4f8a")}${anemone(806, "#f39a3b")}${anemone(1112, "#b763e8")}${anemone(500, "#43b3c9")}
    <path d="M0 128 Q150 118 300 126 T600 124 T900 128 T1200 120 V150 H0 Z" fill="url(#sand)"/>
    <ellipse cx="150" cy="128" rx="46" ry="14" fill="#566270"/><ellipse cx="140" cy="124" rx="20" ry="5" fill="#6b7886" opacity=".7"/>
    <ellipse cx="520" cy="131" rx="34" ry="10" fill="#4e5a68"/><ellipse cx="850" cy="129" rx="40" ry="12" fill="#56636f"/>
    <ellipse cx="1010" cy="131" rx="26" ry="8" fill="#4e5a68"/>
    ${star(372, 140, "#e2654a")}${star(760, 143, "#e98a4a")}${star(1180, 141, "#e2654a")}
    <g fill="#d8cdb8" opacity=".8"><circle cx="90" cy="142" r="2.5"/><circle cx="420" cy="138" r="2"/><circle cx="690" cy="144" r="2.5"/><circle cx="940" cy="140" r="2"/><circle cx="1090" cy="145" r="2.2"/></g>
  </svg>`;
}

const AXIS = [["0", 0], ["1 ч", 1], ["6 ч", 2], ["24 ч", 3], ["72 ч", 4]];
/** The water, the light, the bubbles, the bottom and the shark – drawn once; the fish come and go on top. */
function scene() {
  const bubbles = Array.from({ length: 14 }, (_, i) => {
    const x = (hash(i + 11) * 96 + 2).toFixed(1);
    const sz = (3 + hash(i + 3) * 6).toFixed(1);
    return `<i class="bb" style="left:${x}%;width:${sz}px;height:${sz}px;animation-duration:${(7 + hash(i + 5) * 9).toFixed(1)}s;animation-delay:-${(hash(i + 9) * 16).toFixed(1)}s"></i>`;
  }).join("");
  return `<div class="sea-back" aria-hidden="true">
      <div class="rays"></div>${bubbles}
      ${[1, 2, 3].map((k) => `<div class="zline" style="left:${k * 25 * WATER}%"></div>`).join("")}
      <div class="zline end" style="left:${100 * WATER}%"></div><div class="danger" style="left:${100 * WATER}%"></div>
      ${seabed()}${SHARK}
      <div class="axis">${AXIS.map(([t, k]) => `<span class="${k === 4 ? "end" : ""}" style="left:${k * 25 * WATER}%">${t}</span>`).join("")}</div>
    </div>
    <div id="seaLayer"></div>
    <button type="button" class="legendbtn" id="seaLegendBtn" aria-expanded="false" aria-controls="seaLegend">Легенда</button>
    <div class="sea-legend" id="seaLegend" hidden>
      <b>Как се чете</b>
      <div>Рибката е незавършена количка. По-голяма = по-скъпа.</div>
      <div>Отляво надясно – колко време е минало: пресни → топли → изстиващи → на ръба.</div>
      <div><span class="lg-glow"></span> Червено сияние – изтича до 12 ч.</div>
      <div><span class="lg-mail">✉</span> Пратено е напомняне.</div>
      <div>Акулата чака след 72 ч – тогава количката се губи.</div>
      <div class="muted">Клик на рибка – обаждане, SMS, имейл или поръчка.</div>
    </div>`;
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
  const lane = $("lane");
  if (!lane.querySelector(".sea-back")) {
    lane.classList.add("sea");
    lane.innerHTML = scene();
    const lb = $("seaLegendBtn");
    lb.onclick = () => {
      const open = $("seaLegend").hidden;
      $("seaLegend").hidden = !open;
      lb.setAttribute("aria-expanded", String(open));
    };
  }
  const zoneTop = ZONES.map((z, i) => {
    const mine = carts.filter((c) => zoneOf(c.hours) === z);
    return `<span class="ztag" style="left:calc(${i * 25 * WATER}% + 8px);--z:${z.color}" title="${z.label}"><span class="zl">${z.label} · </span>${mine.length}<span class="zm"> · ${eur(mine.reduce((n, c) => n + c.value.eur, 0))}</span></span>`;
  }).join("");
  // Smaller fish on a phone; the swimming keeps its rhythm when the list is refreshed.
  const k = lane.clientWidth && lane.clientWidth < 600 ? 0.7 : 1;
  const t = Date.now() / 1000;
  $("seaLayer").innerHTML =
    zoneTop +
    carts
      .map((c) => {
        const z = zoneOf(c.hours);
        const w = Math.round((28 + Math.sqrt(c.value.eur / max) * 44) * k);
        const x = Math.min(100 * WATER - 1, Math.max(1.5, xOf(c.hours) * WATER));
        const top = 15 + hash(c.id) * 50;
        const late = stream.window - c.hours < 12;
        const sp = 5 + hash(c.id + 3) * 4;
        return `<button class="fishbtn ${z.id} ${late ? "late" : ""} ${c.reminders ? "rem" : ""}" data-cart="${c.id}" aria-label="${esc(c.name || "Без име")}, ${esc(fmtValue(c.value))}, ${z.label}"
          style="left:calc(${x.toFixed(2)}% - ${w / 2}px);top:${top.toFixed(1)}%;width:${w}px;height:${Math.round(w * 0.64)}px;z-index:${200 - w};--sy:${(0.86 + hash(c.id + 5) * 0.3).toFixed(2)};animation-duration:${sp.toFixed(1)}s;animation-delay:-${((t + hash(c.id + 7) * sp) % sp).toFixed(2)}s">${fishSvg(z)}</button>`;
      })
      .join("") +
    (carts.length ? "" : `<div class="lane-empty">Аквариумът е празен – няма незавършени колички в последните ${stream.window} часа.</div>`);
  // The shark comes closer when carts are about to be lost.
  lane.classList.toggle("hungry", carts.some((c) => stream.window - c.hours < 12));
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
    const b = e.target.closest(".fishbtn");
    if (!b || pinned) return;
    popEl.innerHTML = pop(stream.carts.find((c) => c.id === Number(b.dataset.cart)), false);
    popEl.classList.remove("pinned");
    place(popEl, b);
  });
  lane.addEventListener("mouseout", (e) => {
    if (!pinned && !e.relatedTarget?.closest?.(".fishbtn")) popEl.hidden = true;
  });
  lane.addEventListener("click", (e) => {
    const b = e.target.closest(".fishbtn");
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
