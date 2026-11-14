// App shell: navigation, top bar, routing, delegated actions.
import { init, call, isDemo, resetDemo } from "./api.js";
import { html, raw, icon, logo, toast, esc, ask } from "./ui.js";
import home from "./views/home.js";
import campaigns from "./views/campaigns.js";
import creatives from "./views/creatives.js";
import studio from "./views/studio.js";
import autopilot from "./views/autopilot.js";
import market from "./views/market.js";
import learning from "./views/learning.js";
import settings from "./views/settings.js";

const ROUTES = [
  { id: "tablo", title: "Табло", icon: "home", view: home, tab: true },
  { id: "kampanii", title: "Кампании", icon: "layers", view: campaigns, tab: true },
  { id: "kreativi", title: "Креативи", icon: "image", view: creatives, tab: true },
  { id: "studio", title: "Нови реклами", short: "Нови", icon: "sparkles", view: studio, tab: true },
  { id: "avtopilot", title: "Автопилот", icon: "pilot", view: autopilot, tab: true, badge: true },
  { id: "pazar", title: "Пазар", icon: "globe", view: market },
  { id: "obuchenie", title: "Обучение", icon: "brain", view: learning },
  { id: "nastroyki", title: "Настройки", icon: "gear", view: settings },
];

const ls = {
  get: (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export const state = { range: ls.get("pilot.range", "d7"), pending: 0, mode: null, sub: {} };
const root = document.getElementById("app");
let current = null;
let seq = 0;

function routeFromHash() {
  const id = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return { r: ROUTES.find((x) => x.id === id) || ROUTES[0], arg: state.focus || "" };
}

function shell() {
  root.innerHTML = String(html`
    <div class="shell">
      <aside class="side">
        <div class="brand">${logo()}<div><b>Кошер</b><small>всичко за рекламите на едно място</small></div></div>
        <nav class="nav" id="nav"></nav>
        <div class="side-foot" id="sideFoot"></div>
      </aside>
      <main class="main">
        <header class="top" id="top"></header>
        <div class="page" id="page"></div>
      </main>
      <nav class="tabbar" id="tabbar"></nav>
    </div>`);
}

function renderNav(active) {
  const badge = (r) => (r.badge && state.pending ? html`<span class="cnt">${state.pending}</span>` : "");
  document.getElementById("nav").innerHTML = String(html`${ROUTES.map((r) => html`<a href="#${r.id}" class="${r.id === active ? "on" : ""}">${icon(r.icon)}<span>${r.title}</span>${badge(r)}</a>`)}`);
  document.getElementById("tabbar").innerHTML = String(html`${ROUTES.filter((r) => r.tab).map((r) => html`<a href="#${r.id}" class="${r.id === active ? "on" : ""}">${icon(r.icon)}<span>${r.short || r.title}</span>${badge(r)}</a>`)}<a href="#nastroyki" class="${["nastroyki", "pazar", "obuchenie"].includes(active) ? "on" : ""}">${icon("gear")}<span>Още</span></a>`);
  const modeLabel = { observe: "Наблюдение", copilot: "Втори пилот", autopilot: "Автопилот" }[state.mode] || "";
  document.getElementById("sideFoot").innerHTML = String(html`
    <div class="row between"><span>Режим</span><a href="#avtopilot" class="pill ${state.mode === "autopilot" ? "good" : state.mode === "copilot" ? "honey" : "info"}">${modeLabel}</a></div>
    ${isDemo() ? html`<div class="sep"></div><div class="tiny">Демо данни – нищо не се променя в Мета. <button class="linkish tiny" data-global="reset">Започни отначало</button></div>` : html`<div class="sep"></div><button class="btn ghost sm" data-global="logout">${icon("logout")} Изход</button>`}`);
}

function renderTop(r) {
  const showRange = r.view.range !== false;
  const ranges = [["today", "Днес"], ["yesterday", "Вчера"], ["d3", "3 дни"], ["d7", "7 дни"], ["d14", "14 дни"], ["d30", "30 дни"]];
  document.getElementById("top").innerHTML = String(html`
    <h1>${r.title}</h1>
    ${isDemo() ? html`<span class="pill honey" title="Приложението работи с примерни данни">Демо</span>` : ""}
    ${showRange ? html`<div class="seg" role="group" aria-label="Период">${ranges.map(([k, l]) => html`<button data-global="range" data-v="${k}" class="${state.range === k ? "on" : ""}">${l}</button>`)}</div>` : ""}
    <button class="btn sm" data-global="run" title="Провери всичко и изпълни разрешените действия">${icon("refresh")} Провери сега</button>`);
}

export async function go(force = false) {
  const { r, arg } = routeFromHash();
  const my = ++seq;
  renderNav(r.id);
  renderTop(r);
  const page = document.getElementById("page");
  if (current !== r.id || force === "full") page.innerHTML = '<div class="grid g4"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div><div class="skel" style="height:280px;margin-top:16px"></div>';
  else page.classList.add("loading");
  current = r.id;
  try {
    const ctx = { state, call, arg, refresh: () => go(true), toast, go };
    const out = await r.view.render(ctx);
    if (my !== seq) return;
    page.classList.remove("loading");
    page.innerHTML = String(out);
    r.view.mount?.(page, ctx);
    document.title = `${r.title} · Кошер`;
  } catch (e) {
    if (my !== seq) return;
    page.classList.remove("loading");
    if (e.status === 401) return;
    page.innerHTML = String(html`<div class="card"><div class="empty">${icon("alert")}<p>${e.message || "Грешка"}</p><button class="btn" data-global="reload">Опитай пак</button></div></div>`);
    console.error(e);
  }
}

async function refreshBadge() {
  try {
    const d = await call("dashboard", state.range);
    state.pending = d.pendingCount;
    state.mode = d.mode;
    renderNav(routeFromHash().r.id);
  } catch {}
}

function loginScreen(msg = "") {
  root.innerHTML = String(html`
    <div class="login"><form class="card stack" id="loginForm">
      <div class="brand">${logo()}<div><b>Кошер</b><small>всичко за рекламите на едно място</small></div></div>
      <div class="field"><label for="pw">Парола</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
      ${msg ? html`<div class="issue block">${msg}</div>` : ""}
      <button class="btn primary">Влез</button>
      <a class="small" href="?demo=1">Разгледай с примерни данни</a>
    </form></div>`);
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await call("login", { password: document.getElementById("pw").value });
      start();
    } catch (err) {
      loginScreen(err.message || "Грешна парола");
    }
  });
}

async function start() {
  shell();
  await refreshBadge();
  await go("full");
}

document.addEventListener("click", async (e) => {
  const g = e.target.closest("[data-global]");
  if (!g) return;
  const what = g.dataset.global;
  if (what === "range") {
    state.range = g.dataset.v;
    ls.set("pilot.range", state.range);
    go();
  } else if (what === "run") {
    g.disabled = true;
    try {
      const r = await call("run");
      toast(r.skipped === "paused" ? "Автопилотът е на пауза" : r.ran ? `Изпълнени действия: ${r.ran}` : "Проверено – няма какво да се прави само");
      await refreshBadge();
      go();
    } catch (err) {
      toast(err.message);
    } finally {
      g.disabled = false;
    }
  } else if (what === "reset") {
    if (await ask("Да изтрия ли всички демо промени?", { ok: "Изчисти", tone: "bad" })) resetDemo();
  } else if (what === "logout") {
    await call("logout");
    loginScreen();
  } else if (what === "reload") go("full");
});

window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#studio")) state.focus = null;
  go();
});
window.addEventListener("pilot:auth", () => loginScreen());
window.addEventListener("pilot:changed", () => refreshBadge());

(async () => {
  const info = await init();
  if (info.mode === "live" && !info.auth) return loginScreen();
  start();
})();

export { esc, raw };
