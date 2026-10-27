// Shared helpers for every page: API calls, session, top bar, unlock screen.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, data) {
  const opts = data === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
  let res;
  try {
    res = await fetch(`/api/${path}`, { credentials: "same-origin", ...opts });
  } catch {
    throw new ApiError(0, "offline", "Няма връзка. Провери интернета и опитай пак.");
  }
  let json = {};
  try {
    json = await res.json();
  } catch {}
  if (!res.ok) throw new ApiError(res.status, json.error || "error", json.message || "Нещо се обърка. Опитай пак.");
  return json;
}

export const me = () => api("auth/me");

export function go(path) {
  location.href = path;
}

// Where each kind of account starts.
export function homeFor(m) {
  if (m.child) return "/uchenik/";
  if (m.user?.role === "reviewer" || m.user?.role === "admin") return "/pregled/";
  if (m.user) return "/roditel/";
  return "/";
}

export async function guard(kind) {
  const m = await me();
  const ok = kind === "child" ? !!m.child : kind === "reviewer" ? ["reviewer", "admin"].includes(m.user?.role) : !!m.user;
  if (!ok) {
    if (m.child || m.user) go(homeFor(m));
    else go(`/vhod/?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error("redirect");
  }
  return m;
}

export async function logout() {
  try {
    await api("auth/logout", {});
  } catch {}
  go("/");
}

export function topbar(m, { back } = {}) {
  const el = $("topbar");
  if (!el) return;
  const home = back ? `<a class="home" href="${esc(back.href)}">← ${esc(back.label)}</a>` : `<a class="home" href="${homeFor(m)}"><img src="/assets/logo.png" alt="Еду БЕЛ" width="54" height="39"><span>Учебен център по<br>български език и литература</span></a>`;
  let who = "";
  if (m.child) {
    who = `<span><b>${esc(m.child.name)}</b> · ${m.child.grade}. клас</span>`;
    who += m.viaParent ? `<button class="linkbtn" id="tbParent">Към родителя</button>` : `<button class="linkbtn" id="tbOut">Изход</button>`;
  } else if (m.user) {
    who = `<span><b>${esc(m.user.name)}</b></span><button class="linkbtn" id="tbOut">Изход</button>`;
  }
  el.className = "topbar";
  el.innerHTML = `${home}<div class="who">${who}</div>`;
  $("tbOut")?.addEventListener("click", logout);
  $("tbParent")?.addEventListener("click", async () => {
    await api("auth/switch-back", {});
    go("/roditel/");
  });
  if (m.testMode) {
    const bar = document.createElement("div");
    bar.className = "testbar";
    bar.innerHTML = "<b>Тестова версия.</b> Съдържанието се преглежда от учител. Ако видиш грешка, кажи ни.";
    el.after(bar);
  }
}

export function toast(text, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function pct(a, b) {
  return b ? Math.round((a / b) * 100) : 0;
}

export function gradeOf(s, n) {
  const r = n ? s / n : 0;
  return r >= 0.9 ? "Отличен 6" : r >= 0.76 ? "Много добър 5" : r >= 0.63 ? "Добър 4" : r >= 0.5 ? "Среден 3" : "Слаб 2";
}

export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const params = () => new URLSearchParams(location.search);

// Shown when the child has used the free part of a module.
// The offer goes to the parent: the child is never asked to buy anything.
export function renderUnlock(container, { module, title, done, total, locked = false }) {
  const head = locked
    ? `<div class="medal" aria-hidden="true">🔒</div><h2>Това е в пълния достъп</h2>
       <p>Първо реши безплатната част на „${esc(title)}“. Ако ти харесва, покажи на мама или татко – те ще решат дали да отключат останалото.</p>`
    : `<div class="medal" aria-hidden="true">✓</div><h2>Браво! Мина безплатната част</h2>
       <p>Решил си ${done} от общо ${total} в „${esc(title)}“. Останалите са в пълния достъп.</p>
       <p>Покажи на мама или татко какво си научил. Те ще решат дали да отключат останалото.</p>`;
  container.innerHTML = `<div class="unlock">
    ${head}
    <div class="row"><button class="btn gold" id="unlockAsk">Покажи на родител</button></div>
    <p class="small muted" id="unlockMsg" style="margin-top:12px"></p>
  </div>`;
  $("unlockAsk").addEventListener("click", async () => {
    try {
      await api("learn/unlock", { module });
      $("unlockMsg").textContent = "Готово! Родителят ти ще види отчета, когато влезе в своя профил.";
      $("unlockAsk").disabled = true;
    } catch (e) {
      $("unlockMsg").textContent = e.message;
    }
  });
}

export function lockLine(locked) {
  if (!locked) return "";
  return `<div class="lockline"><span aria-hidden="true">🔒</span><span>Още <b>${locked}</b> в пълния достъп.</span></div>`;
}

export async function saveProgress(module, results) {
  try {
    return await api("learn/progress", { module, results });
  } catch (e) {
    toast(e.message);
    return null;
  }
}
