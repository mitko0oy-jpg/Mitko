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

// ---- the fish and the shark, drawn here (SVG): gradients, scales, fin rays, real eyes ----
// One kind of fish per zone, in the zone's colour: Пресни – an orange damselfish, Топли – a yellow butterflyfish,
// Изстиващи – a blue mackerel, На ръба – a violet anthias. All face the deadline on the right.
const DEFS = `<svg class="sea-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <pattern id="od-scales" width="6" height="5" patternUnits="userSpaceOnUse"><path d="M-3 5 Q0 0 3 5 M3 5 Q6 0 9 5" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width=".6"/><path d="M0 2.5 Q3 -2.5 6 2.5" fill="none" stroke="#000" stroke-opacity=".08" stroke-width=".7"/></pattern>
  <linearGradient id="od-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
  <radialGradient id="od-iris" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#0b0f14"/><stop offset=".5" stop-color="#6b4a14"/><stop offset=".85" stop-color="#d6a73a"/><stop offset="1" stop-color="#3a2a0e"/></radialGradient>
  <symbol id="od-eye" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="url(#od-iris)"/><circle cx="5.2" cy="5" r="2.5" fill="#05080b"/><circle cx="3.6" cy="3.5" r="1.2" fill="#fff" opacity=".9"/><circle cx="6.6" cy="6.4" r=".5" fill="#fff" opacity=".5"/></symbol>
  <radialGradient id="od-gari" cx=".62" cy=".32" r=".75"><stop offset="0" stop-color="#ffd59a"/><stop offset=".3" stop-color="#ff9a3c"/><stop offset=".7" stop-color="#f06a14"/><stop offset="1" stop-color="#c24a07"/></radialGradient>
  <linearGradient id="od-garifin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8580c" stop-opacity=".75"/><stop offset="1" stop-color="#ff8a2a"/></linearGradient>
  <radialGradient id="od-bfly" cx=".55" cy=".35" r=".7"><stop offset="0" stop-color="#fffbd6"/><stop offset=".35" stop-color="#ffe45c"/><stop offset=".75" stop-color="#f6c21a"/><stop offset="1" stop-color="#cf960a"/></radialGradient>
  <linearGradient id="od-bflyfin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3bd16"/><stop offset="1" stop-color="#d79a08"/></linearGradient>
  <linearGradient id="od-mack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173f66"/><stop offset=".3" stop-color="#2a73a8"/><stop offset=".5" stop-color="#8fc0dc"/><stop offset=".62" stop-color="#e4f0f6"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
  <linearGradient id="od-mackfin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4f7c"/><stop offset="1" stop-color="#5d93bb"/></linearGradient>
  <linearGradient id="od-anth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e63e6"/><stop offset=".45" stop-color="#b48af7"/><stop offset=".8" stop-color="#e693d9"/><stop offset="1" stop-color="#f9c3ea"/></linearGradient>
  <linearGradient id="od-anthfin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4fd6" stop-opacity=".8"/><stop offset="1" stop-color="#c39bff"/></linearGradient>
  <linearGradient id="od-fin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
  <linearGradient id="od-shark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4852"/><stop offset=".42" stop-color="#63727d"/><stop offset=".56" stop-color="#8e9ca6"/><stop offset=".63" stop-color="#d9e0e5"/><stop offset="1" stop-color="#f3f6f8"/></linearGradient>
  <linearGradient id="od-sfin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d4a54"/><stop offset="1" stop-color="#6a7a85"/></linearGradient>
  <linearGradient id="od-sback" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".5" stop-color="#000" stop-opacity="0"/></linearGradient>
</defs></svg>`;

const rays = (pts, col = "#000", op = 0.18) => `<path d="${pts}" stroke="${col}" stroke-opacity="${op}" stroke-width=".7" fill="none"/>`;
const SPECIES = {
  // Пресни: an orange damselfish – deep oval body, round tail, long soft dorsal fin.
  fresh: {
    ratio: 0.72,
    svg: `<svg viewBox="0 -6 120 86" aria-hidden="true">
      <g class="tl"><path d="M27 38 C20 28 12 19 3 15 C7 25 7 32 6 38 C7 44 7 51 3 61 C12 57 20 48 27 38 Z" fill="url(#od-garifin)"/>${rays("M25 38 L5 19 M25 38 L6 28 M25 38 L7 38 M25 38 L6 48 M25 38 L5 57")}</g>
      <path d="M36 20 C42 5 64 -5 88 -1 C97 1 101 7 99 12 C90 12 82 11 76 11 C62 10 49 13 36 20 Z" fill="url(#od-garifin)" fill-opacity=".92"/>${rays("M44 15 L47 4 M54 12 L57 0 M64 11 L67 -3 M74 11 L78 -3 M84 11 L89 -1 M92 11 L97 5")}
      <path d="M48 62 C54 78 74 82 88 62 C76 66 62 66 48 62 Z" fill="url(#od-garifin)" fill-opacity=".92"/>${rays("M56 66 L58 76 M66 67 L68 78 M76 66 L80 75")}
      <path d="M22 38 C26 18 52 8 78 10 C98 12 112 24 115 36 C116 40 114 44 110 48 C100 62 78 68 56 66 C38 64 26 54 22 38 Z" fill="url(#od-gari)"/>
      <path d="M22 38 C26 18 52 8 78 10 C98 12 112 24 115 36 C116 40 114 44 110 48 C100 62 78 68 56 66 C38 64 26 54 22 38 Z" fill="url(#od-scales)"/>
      <path d="M22 38 C26 18 52 8 78 10 C98 12 112 24 115 36 C116 40 114 44 110 48 C100 62 78 68 56 66 C38 64 26 54 22 38 Z" fill="url(#od-shade)"/>
      <path d="M93 17 C86 28 86 46 95 56" stroke="#a63c04" stroke-opacity=".45" stroke-width="1.4" fill="none"/>
      <path d="M30 37 C52 33 78 30 96 31" stroke="#fff" stroke-opacity=".25" stroke-width=".8" fill="none"/>
      <path d="M84 40 C74 42 67 48 67 54 C74 52 82 47 87 43 Z" fill="url(#od-fin)"/>
      <use href="#od-eye" x="96" y="21" width="11" height="11"/>
      <path d="M114 37 Q118 40 114 43" stroke="#8a3200" stroke-width="1.2" fill="none"/>
    </svg>`,
  },
  // Топли: a yellow butterflyfish – tall disc, black band over the eye, a false eye-spot near the tail.
  warm: {
    ratio: 0.89,
    svg: `<svg viewBox="0 -8 112 100" aria-hidden="true">
      <g class="tl"><path d="M23 44 C17 35 11 31 4 30 C7 38 7 50 4 58 C11 57 17 53 23 44 Z" fill="#f7d34a" fill-opacity=".7" stroke="#d99a08" stroke-opacity=".6" stroke-width=".8"/>${rays("M21 44 L6 33 M21 44 L6 44 M21 44 L6 55", "#b07a00", 0.35)}</g>
      <path d="M22 30 C26 8 52 -7 82 4 C88 7 89 11 87 14 C76 12 60 12 46 17 C36 21 28 26 22 30 Z" fill="url(#od-bflyfin)"/>
      <path d="M22 58 C26 80 54 94 80 78 C62 78 42 72 22 58 Z" fill="url(#od-bflyfin)"/>
      <path d="M24 28 C29 9 53 -4 80 6" stroke="#1d1d1d" stroke-opacity=".6" stroke-width="2" fill="none"/>
      <path d="M24 60 C29 78 54 89 76 79" stroke="#1d1d1d" stroke-opacity=".55" stroke-width="2" fill="none"/>
      ${rays("M34 18 L33 6 M44 14 L45 1 M54 12 L57 -2 M64 11 L68 -2 M74 11 L78 2 M34 70 L33 80 M46 74 L46 86 M58 76 L60 88", "#9a6a00", 0.3)}
      <path d="M20 44 C22 18 46 6 66 8 C82 10 92 22 98 34 L107 40 C108 42 108 44 107 45 L98 50 C92 64 80 78 62 80 C42 82 22 70 20 44 Z" fill="url(#od-bfly)"/>
      <path d="M20 44 C22 18 46 6 66 8 C82 10 92 22 98 34 L107 40 C108 42 108 44 107 45 L98 50 C92 64 80 78 62 80 C42 82 22 70 20 44 Z" fill="url(#od-scales)"/>
      <g stroke="#c98d00" stroke-opacity=".35" stroke-width="1.1" fill="none"><path d="M34 22 L72 66"/><path d="M44 16 L82 60"/><path d="M28 34 L60 72"/><path d="M56 12 L88 48"/></g>
      <path d="M20 44 C22 18 46 6 66 8 C82 10 92 22 98 34 L107 40 C108 42 108 44 107 45 L98 50 C92 64 80 78 62 80 C42 82 22 70 20 44 Z" fill="url(#od-shade)"/>
      <path d="M85 12 C80 26 80 60 87 76 L94 72 C89 58 89 30 93 16 Z" fill="#141414" opacity=".9"/>
      <path d="M74 50 C68 52 64 56 64 60 C70 58 74 55 77 52 Z" fill="url(#od-fin)"/>
      <use href="#od-eye" x="85.5" y="31" width="9" height="9"/>
      <path d="M106 41.5 L109 43" stroke="#6b4a00" stroke-width="1" fill="none"/>
    </svg>`,
  },
  // Изстиващи: a blue mackerel – long and streamlined, dark wavy bars on the back, silver belly, forked tail.
  cool: {
    ratio: 0.38,
    svg: `<svg viewBox="0 0 140 54" aria-hidden="true">
      <g class="tl"><path d="M21 27 C15 20 9 12 1 3 C6 14 8 21 8 27 C8 33 6 40 1 51 C9 42 15 34 21 27 Z" fill="url(#od-mackfin)"/></g>
      <path d="M68 11 L79 1 L88 10 Z" fill="url(#od-mackfin)"/>
      <path d="M48 12 L55 6 L60 13 Z" fill="url(#od-mackfin)"/>
      <g fill="#24608f"><path d="M28 17 l3 -3 l1 4 Z"/><path d="M34 15 l3 -3 l1 4 Z"/><path d="M40 14 l3 -3 l1 4 Z"/><path d="M28 37 l3 3 l1 -4 Z"/><path d="M34 39 l3 3 l1 -4 Z"/></g>
      <path d="M18 27 C30 14 60 8 92 9 C114 10 130 16 137 24 C138 26 137 29 134 31 C126 39 108 44 88 44 C60 45 32 39 18 27 Z" fill="url(#od-mack)"/>
      <path d="M18 27 C30 14 60 8 92 9 C114 10 130 16 137 24 C138 26 137 29 134 31 C126 39 108 44 88 44 C60 45 32 39 18 27 Z" fill="url(#od-scales)" opacity=".6"/>
      <g stroke="#0f2f4f" stroke-opacity=".7" stroke-width="1.6" fill="none" stroke-linecap="round">
        <path d="M34 17 q3 4 -1 8"/><path d="M42 14 q4 5 -1 10"/><path d="M51 12 q4 5 -1 11"/><path d="M60 11 q4 5 -1 11"/><path d="M69 11 q4 5 0 10"/><path d="M78 11 q4 5 0 10"/><path d="M87 11 q4 4 0 9"/><path d="M96 11 q3 4 0 8"/><path d="M105 12 q3 4 0 7"/>
      </g>
      <path d="M24 27 C52 23 92 23 128 25" stroke="#fff" stroke-opacity=".45" stroke-width=".8" fill="none"/>
      <path d="M18 27 C30 14 60 8 92 9 C114 10 130 16 137 24 C138 26 137 29 134 31 C126 39 108 44 88 44 C60 45 32 39 18 27 Z" fill="url(#od-shade)"/>
      <path d="M118 15 C113 22 113 32 119 38" stroke="#1d4f7c" stroke-opacity=".5" stroke-width="1.1" fill="none"/>
      <path d="M108 29 L94 34 L108 32 Z" fill="url(#od-fin)"/>
      <use href="#od-eye" x="121" y="18" width="8" height="8"/>
      <path d="M136 26 L131 28" stroke="#123" stroke-opacity=".6" stroke-width="1" fill="none"/>
    </svg>`,
  },
  // На ръба: a violet anthias – slender, lyre tail with long tips, an orange streak under the eye.
  edge: {
    ratio: 0.54,
    svg: `<svg viewBox="0 0 120 64" aria-hidden="true">
      <g class="tl"><path d="M27 32 C19 24 10 13 0 3 C7 15 10 24 10 32 C10 40 7 49 0 61 C10 51 19 40 27 32 Z" fill="url(#od-anthfin)"/>${rays("M25 32 L2 6 M25 32 L9 32 M25 32 L2 58", "#fff", 0.25)}</g>
      <path d="M42 15 L60 1 L64 10 C76 7 90 9 97 14 C80 12 60 12 42 15 Z" fill="url(#od-anthfin)"/>
      <path d="M58 50 C64 58 74 58 82 50 Z" fill="url(#od-anthfin)"/>
      <path d="M78 47 L70 63 L84 49 Z" fill="#c085f0"/>
      <path d="M24 32 C30 18 54 10 76 11 C96 12 110 22 114 30 C115 32 114 34 112 36 C104 46 86 52 66 52 C46 52 30 46 24 32 Z" fill="url(#od-anth)"/>
      <path d="M24 32 C30 18 54 10 76 11 C96 12 110 22 114 30 C115 32 114 34 112 36 C104 46 86 52 66 52 C46 52 30 46 24 32 Z" fill="url(#od-scales)"/>
      <path d="M24 32 C30 18 54 10 76 11 C96 12 110 22 114 30 C115 32 114 34 112 36 C104 46 86 52 66 52 C46 52 30 46 24 32 Z" fill="url(#od-shade)"/>
      <path d="M100 29 C96 31 92 33 86 35" stroke="#ffae3d" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path d="M95 16 C89 24 89 38 96 45" stroke="#6a3fbf" stroke-opacity=".45" stroke-width="1.1" fill="none"/>
      <path d="M86 34 C78 36 73 41 73 45 C79 43 85 39 89 37 Z" fill="url(#od-fin)"/>
      <use href="#od-eye" x="99" y="19" width="9" height="9"/>
      <path d="M113 31 Q116 33 113 35" stroke="#5a2a9a" stroke-width="1.1" fill="none"/>
    </svg>`,
  },
};
const fishSvg = (z) => SPECIES[z.id].svg;

// The shark, facing left at the fish: countershaded body, gill slits, fins, a tail that sways.
const SHARK = `<svg class="shark" viewBox="0 0 300 130" aria-hidden="true">
  <g class="stl"><path d="M252 62 C262 54 274 36 293 9 C291 29 289 46 283 62 C289 72 293 83 297 100 C283 89 268 77 252 70 Z" fill="url(#od-sfin)"/></g>
  <path d="M118 44 C126 31 137 14 149 3 C151 18 152 32 160 43 Z" fill="url(#od-sfin)"/>
  <path d="M214 49 L223 39 L229 51 Z" fill="url(#od-sfin)"/>
  <path d="M226 80 L235 91 L239 78 Z" fill="url(#od-sfin)"/>
  <path d="M190 86 L203 99 L209 86 Z" fill="url(#od-sfin)"/>
  <path d="M4 72 C10 62 30 52 62 47 C104 41 160 40 206 46 C228 49 246 54 258 60 C262 63 262 67 258 70 C244 76 222 82 196 85 C150 90 98 92 60 88 C34 85 14 80 4 72 Z" fill="url(#od-shark)"/>
  <path d="M4 72 C10 62 30 52 62 47 C104 41 160 40 206 46 C228 49 246 54 258 60 C262 63 262 67 258 70 C244 76 222 82 196 85 C150 90 98 92 60 88 C34 85 14 80 4 72 Z" fill="url(#od-sback)"/>
  <path d="M14 76 C40 74 70 70 96 72 C130 74 170 74 214 70 C190 79 150 84 104 85 C66 86 34 83 14 76 Z" fill="#9aa8b2" opacity=".35"/>
  <path d="M96 82 C108 96 124 110 147 122 C140 108 132 94 129 83 Z" fill="url(#od-sfin)"/>
  <g stroke="#2f3a42" stroke-opacity=".55" stroke-width="1.4" fill="none" stroke-linecap="round"><path d="M72 56 q-3 9 0 18"/><path d="M77 55 q-3 10 0 20"/><path d="M82 55 q-3 10 0 20"/><path d="M87 55 q-3 10 0 19"/><path d="M92 56 q-3 9 0 17"/></g>
  <path d="M40 54 C60 50 90 48 120 47" stroke="#fff" stroke-opacity=".12" stroke-width="2" fill="none"/>
  <ellipse cx="30" cy="61" rx="3.4" ry="3" fill="#0a0d10"/><circle cx="29" cy="60" r="1" fill="#fff" opacity=".75"/>
  <path d="M12 63 q3 -1 5 0" stroke="#2a333a" stroke-width="1.2" fill="none"/>
  <path d="M12 75 C22 78 34 80 47 81" stroke="#2a333a" stroke-opacity=".8" stroke-width="1.4" fill="none"/>
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
  return `<div class="sea-back" aria-hidden="true">${DEFS}
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
        // The long mackerel gets a bit more length, so all kinds look about the same size for the same money.
        const w = Math.round((30 + Math.sqrt(c.value.eur / max) * 48) * k * (z.id === "cool" ? 1.25 : 1));
        const x = Math.min(100 * WATER - 1, Math.max(1.5, xOf(c.hours) * WATER));
        const top = 15 + hash(c.id) * 50;
        const late = stream.window - c.hours < 12;
        const sp = 5 + hash(c.id + 3) * 4;
        return `<button class="fishbtn ${z.id} ${late ? "late" : ""} ${c.reminders ? "rem" : ""}" data-cart="${c.id}" aria-label="${esc(c.name || "Без име")}, ${esc(fmtValue(c.value))}, ${z.label}"
          style="left:calc(${x.toFixed(2)}% - ${w / 2}px);top:${top.toFixed(1)}%;width:${w}px;height:${Math.round(w * SPECIES[z.id].ratio)}px;z-index:${200 - w};--sy:${(0.86 + hash(c.id + 5) * 0.3).toFixed(2)};animation-duration:${sp.toFixed(1)}s;animation-delay:-${((t + hash(c.id + 7) * sp) % sp).toFixed(2)}s">${fishSvg(z)}</button>`;
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
