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
  shipped: { label: "На път", hint: "предадени на куриера" },
  at_office: { label: "Чакат в офис", hint: "или в автомат" },
  delivered: { label: "Взети", hint: "клиентът е платил" },
  returned: { label: "Върнати", hint: "непотърсени и отказани" },
  canceled: { label: "Отказани", hint: "преди изпращане" },
  archived: { label: "Архивирани", hint: "без друга информация" },
};
export const STAGE_ORDER = ["new", "shipped", "at_office", "delivered", "returned", "canceled", "archived"];
export const COURIER = { speedy: "Спиди", econt: "Еконт", gls: "GLS", boxnow: "BOX NOW", sameday: "Sameday" };

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
export async function shell(active) {
  const me = await api("/api/auth/me");
  if (!me.user) {
    location.href = "/vhod/?next=" + encodeURIComponent(location.pathname + location.search);
    throw new Error("login");
  }
  const links = [
    ["/", "Табло", "tablo"],
    ["/poruchki/", "Поръчки", "poruchki"],
    ["/nastroiki/", "Настройки", "nastroiki"],
  ];
  const top = document.createElement("header");
  top.className = "top";
  top.innerHTML = `<div class="in">
    <a class="brand" href="/">Поръчки</a>
    <nav class="nav">${links.map(([h, t, k]) => `<a href="${h}" class="${k === active ? "on" : ""}">${t}</a>`).join("")}</nav>
    <span class="who"><span class="nm">${esc(me.user.name || me.user.email)}</span> <button class="btn link" id="logout">Изход</button></span>
  </div>`;
  document.body.prepend(top);
  top.querySelector("#logout").onclick = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} });
    location.href = "/vhod/";
  };
  return me.user;
}

export const qs = () => new URLSearchParams(location.search);
export function setQs(params) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(params)) v === "" || v == null ? u.searchParams.delete(k) : u.searchParams.set(k, v);
  history.replaceState(null, "", u);
}
