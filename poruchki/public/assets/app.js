// Shared helpers for every page.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    location.href = "/vhod/?next=" + encodeURIComponent(location.pathname + location.search);
    throw new Error("Влез в профила си.");
  }
  if (!res.ok) throw new Error((data && data.message) || "Нещо се обърка. Опитай пак.");
  return data;
}

const money0 = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 1 234 € for big sums, 23,40 € for small ones. */
export const eur = (n, exact = false) => (exact || Math.abs(n) < 1000 ? money2 : money0).format(Number(n) || 0);
export const eur0 = (n) => money0.format(Number(n) || 0);
export const money = (n, cur) => {
  if (!cur || cur === "EUR") return money2.format(Number(n) || 0);
  return new Intl.NumberFormat("bg-BG", { style: "currency", currency: cur, maximumFractionDigits: cur === "HUF" ? 0 : 2 }).format(Number(n) || 0);
};
export const num = (n) => new Intl.NumberFormat("bg-BG").format(Number(n) || 0);
export const pct = (x) => (x == null ? "–" : `${String(x).replace(".", ",")}%`);

export const STAGES = {
  new: { label: "Нови", hint: "още не са изпратени" },
  prepared: { label: "Изготвени", hint: "товарителница, куриерът още не я е взел" },
  shipped: { label: "Изпратени", hint: "на път към клиента" },
  at_office: { label: "В офис", hint: "чакат клиента в офис или автомат" },
  delivered: { label: "Взети", hint: "клиентът е платил" },
  returned: { label: "Върнати", hint: "непотърсени и отказани" },
  canceled: { label: "Отказани", hint: "преди изпращане" },
  archived: { label: "Архивирани", hint: "без друга информация" },
};
export const ONE = { new: "Нова", prepared: "Изготвена", shipped: "Изпратена", at_office: "В офис", delivered: "Взета", returned: "Върната", canceled: "Отказана", archived: "Архивирана" };
export const STAGE_ORDER = ["new", "prepared", "shipped", "at_office", "delivered", "returned", "canceled", "archived"];
export const COURIER = { speedy: "Спиди", econt: "Еконт", gls: "GLS", boxnow: "BOX NOW", sameday: "Sameday" };
// Courier marks (drawn here): Speedy – a red parcel cube, Econt – a blue E.
export const CMARK = {
  speedy: `<svg class="clogo" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8.5 4.8L12 12 3.5 7.3z" fill="#f04a3e"/><path d="M3.5 7.3L12 12v9.5l-8.5-4.8z" fill="#d42a20"/><path d="M20.5 7.3L12 12v9.5l8.5-4.8z" fill="#a8180f"/><path d="M7.6 4.9l8.6 4.8" stroke="#fff" stroke-width="1.3" opacity=".85"/></svg>`,
  econt: `<svg class="clogo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1f3c88"/><path d="M8 6.5h8.2v2.6H11v1.7h4.4v2.5H11v1.8h5.3v2.6H8z" fill="#fff"/></svg>`,
};

// ---- dates (Sofia) ----
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" });
export const today = () => dayFmt.format(new Date());
export function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function periods() {
  const t = today();
  const dow = (new Date(t + "T12:00:00Z").getUTCDay() + 6) % 7;
  const week = addDays(t, -dow);
  const month = t.slice(0, 8) + "01";
  const lmEnd = addDays(month, -1);
  return {
    today: { label: "Днес", from: t, to: t },
    yesterday: { label: "Вчера", from: addDays(t, -1), to: addDays(t, -1) },
    week: { label: "Тази седмица", from: week, to: t },
    lastWeek: { label: "Миналата седмица", from: addDays(week, -7), to: addDays(week, -1) },
    month: { label: "Този месец", from: month, to: t },
    lastMonth: { label: "Миналия месец", from: lmEnd.slice(0, 8) + "01", to: lmEnd },
    d30: { label: "30 дни", from: addDays(t, -29), to: t },
  };
}
const shortDate = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("bg-BG", { weekday: "short", timeZone: "UTC" });
export const dayLabel = (day) => shortDate.format(new Date(day + "T12:00:00Z"));
export const dayLong = (day) => `${weekday.format(new Date(day + "T12:00:00Z"))}, ${dayLabel(day)}`;
export const rangeLabel = (from, to) => (from === to ? dayLong(from) : `${dayLabel(from)} – ${dayLabel(to)}`);
const dt = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const when = (iso) => (iso ? dt.format(new Date(iso)) : "–");
export function ago(iso) {
  if (!iso) return "никога";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "току-що";
  if (m < 60) return `преди ${m} мин`;
  const h = Math.round(m / 60);
  if (h < 24) return `преди ${h} ч`;
  return when(iso);
}

// ---- top bar ----
const THEMES = [
  ["auto", "Тема: като на устройството", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>`],
  ["light", "Тема: светла", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`],
  ["dark", "Тема: тъмна", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`],
];

function savedTheme() {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

/** Light → dark → like the device: one button, remembered on this device. */
function themeButton(btn) {
  const draw = () => {
    const [, label, icon] = THEMES.find(([k]) => k === savedTheme());
    btn.innerHTML = icon;
    btn.title = `${label} (смени)`;
    btn.setAttribute("aria-label", `${label}. Смени темата`);
  };
  btn.onclick = () => {
    const i = THEMES.findIndex(([k]) => k === savedTheme());
    const next = THEMES[(i + 1) % THEMES.length][0];
    try {
      if (next === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {
      /* private mode: only for this page */
    }
    if (next === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    draw();
  };
  draw();
}

const I = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICONS = {
  home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  cart: I('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.2"/>'),
  hourglass: I('<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>'),
  print: I('<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z"/>'),
  store: I('<path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v1a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 13v8h14v-8"/>'),
  truck: I('<path d="M2 6h11v10H2zM13 10h4l4 4v2h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  chat: I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  bell: I('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  logo: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="odg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#odg)"/><path d="M15 23.5l16-8 16 8v18.5l-16 8-16-8z" fill="none" stroke="#fff" stroke-width="3.8" stroke-linejoin="round"/><path d="M15 23.5l16 8 16-8M31 31.5v18.5" fill="none" stroke="#fff" stroke-width="3.8" stroke-linejoin="round" opacity=".6"/><circle cx="46" cy="45" r="10" fill="#fff"/><path d="M41.5 45.2l3.2 3.2 6-6.6" fill="none" stroke="#6d28d9" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const ROLE = { admin: "Собственик", staff: "Служител" };
const initials = (n) =>
  String(n || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

/** One small menu open at a time; closes on a click outside or Esc. */
function popup(btn, menu) {
  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  btn.onclick = (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    document.querySelectorAll(".pop").forEach((m) => (m.hidden = true));
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) btn.dispatchEvent(new CustomEvent("popopen"));
  };
  document.addEventListener("click", (e) => !menu.contains(e.target) && close());
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
}

export async function shell(active) {
  const me = await api("/api/auth/me");
  if (!me.user) {
    location.href = "/vhod/?next=" + encodeURIComponent(location.pathname + location.search);
    throw new Error("login");
  }
  const here = active === "nastroiki" && location.hash ? location.hash.slice(1) : active;
  const links = [
    ["/", "Табло", "tablo", ICONS.home],
    ["/poruchki/", "Поръчки", "poruchki", ICONS.cart],
    ["/nezavarsheni/", "Незавършени", "nezavarsheni", ICONS.hourglass],
    ["/pechat/", "Печат", "pechat", ICONS.print],
    ["/magazini/", "Магазини", "magazini", ICONS.store],
    ["/kurieri/", "Куриери", "kurieri", ICONS.truck],
    ["/nastroiki/#sms", "SMS", "sms", ICONS.chat],
    ["/potrebiteli/", "Потребители", "potrebiteli", ICONS.users],
    ["/nastroiki/", "Настройки", "nastroiki", ICONS.gear],
  ];
  // Only the platform owner manages companies.
  if (me.user.owner) links.push(["/firmi/", "Фирми", "firmi", ICONS.users]);
  const u = me.user;
  const top = document.createElement("header");
  top.className = "top";
  top.innerHTML = `<div class="bar">
      <a class="brand" href="/" aria-label="OrderDesk – начало">${ICONS.logo}<span>Order<span class="b2">Desk</span></span></a>
      <div class="tools">
        <div class="popwrap"><button class="topbtn" id="bellBtn" type="button" aria-label="Известия" aria-expanded="false">${ICONS.bell}<span class="dot" id="bellN" hidden></span></button>
          <div class="pop" id="bellMenu" hidden></div></div>
        <button class="topbtn" id="themeBtn" type="button"></button>
        <div class="popwrap"><button class="userchip" id="userBtn" type="button" aria-expanded="false" aria-label="Профил">
            <span class="avatar">${esc(initials(u.name || u.email))}</span>
            <span class="uname"><b>${esc(u.name || u.email)}</b><small>${esc(u.company || ROLE[u.role] || "")}</small></span></button>
          <div class="pop" id="userMenu" hidden>
            <div class="muted small">${esc(u.email)}<br>${esc(ROLE[u.role] || "")}${u.company ? ` · ${esc(u.company)}` : ""}</div>
            <a href="/nastroiki/">Настройки</a>
            <button type="button" id="logout">Изход</button>
          </div></div>
      </div>
    </div>
    <nav class="nav" aria-label="Меню">${links.map(([h, t, k, ic]) => `<a href="${h}" class="${k === here ? "on" : ""}">${ic}<span>${t}</span></a>`).join("")}</nav>`;
  document.body.prepend(top);
  themeButton(top.querySelector("#themeBtn"));
  popup(top.querySelector("#userBtn"), top.querySelector("#userMenu"));
  popup(top.querySelector("#bellBtn"), top.querySelector("#bellMenu"));
  top.querySelector("#logout").onclick = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} });
    location.href = "/vhod/";
  };
  // On the settings page the menu items jump to their section.
  if (active === "nastroiki")
    addEventListener("hashchange", () => {
      const h = location.hash.slice(1) || "nastroiki";
      top.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", (a.getAttribute("href").split("#")[1] || (a.getAttribute("href") === "/nastroiki/" ? "nastroiki" : "")) === h));
    });
  bell(top);
  return u;
}

/** What is waiting: unconfirmed orders, AI calls that need a person, unfinished orders, labels to print. */
async function bell(top) {
  let a;
  try {
    a = await api("/api/stats/alerts");
  } catch {
    return;
  }
  const lines = [
    [a.ai, "AI агентът иска човек", "/poruchki/?tab=active&confirmed=no"],
    [a.unconfirmed, "непотвърдени нови поръчки", "/poruchki/?tab=active&stage=new&confirmed=no"],
    [a.toShip, "потвърдени без товарителница", "/poruchki/?tab=active&stage=new&nowaybill=1"],
    [a.toPrint, "етикета чакат печат", "/pechat/"],
    [a.leads, "незавършени поръчки", "/nezavarsheni/"],
  ];
  const n = (a.ai || 0) + (a.unconfirmed || 0) + (a.toPrint || 0) + (a.leads || 0);
  const dot = top.querySelector("#bellN");
  dot.hidden = !n;
  dot.textContent = n > 99 ? "99+" : String(n);
  top.querySelector("#bellMenu").innerHTML =
    lines.filter(([k]) => k).map(([k, t, h]) => `<a href="${h}"><b>${num(k)}</b> ${t}</a>`).join("") || `<div class="muted small">Няма нищо, което да чака.</div>`;
}

export const qs = () => new URLSearchParams(location.search);
export function setQs(params) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(params)) v === "" || v == null ? u.searchParams.delete(k) : u.searchParams.set(k, v);
  history.replaceState(null, "", u);
}
