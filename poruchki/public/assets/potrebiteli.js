// People of the company, like Middleware: list, add, change role or password, remove.
import { api, esc, num, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("potrebiteli");
let users = [];

const ROLE = { admin: "Собственик", staff: "Служител" };
const ICON = {
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>`,
  del: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
};
const initials = (n) => String(n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
function say(text, ok = true) {
  $("msg").innerHTML = text ? `<div class="note ${ok ? "" : "err"}">${esc(text)}</div>` : "";
}

function render() {
  const q = $("q").value.trim().toLowerCase();
  $("count").textContent = `${num(users.length)} ${users.length === 1 ? "човек" : "души"}`;
  const list = users.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q));
  $("table").innerHTML = `<thead><tr><th>Име</th><th>Имейл</th><th>Роля</th><th>Последно влизане</th><th>Добавен</th><th></th></tr></thead><tbody>${list
    .map(
      (u) => `<tr>
      <td><div class="shopcell"><span class="avatar">${esc(initials(u.name))}</span><b>${esc(u.name || "–")}</b>${u.email === me.email ? `<span class="sub">(ти)</span>` : ""}</div></td>
      <td>${esc(u.email)}</td>
      <td><span class="rolepill ${u.role}">${ROLE[u.role] || u.role}</span>${u.owner ? `<div class="sub">основател</div>` : ""}</td>
      <td>${u.last_login ? esc(when(u.last_login)) : `<span class="sub">още не е влизал</span>`}</td>
      <td>${esc(when(u.created_at))}</td>
      <td class="acts"><div class="actsin">
        <button class="iconbtn" title="Промени" aria-label="Промени ${esc(u.name)}" data-edit="${u.id}">${ICON.edit}</button>
        ${u.owner || u.email === me.email ? "" : `<button class="iconbtn warnbtn" title="Махни достъпа" aria-label="Махни достъпа на ${esc(u.name)}" data-del="${u.id}">${ICON.del}</button>`}
      </div></td>
    </tr>`,
    )
    .join("")}</tbody>`;
}

async function load() {
  const s = await api("/api/settings");
  users = s.users;
  render();
}

function dialog(u) {
  const d = $("dlg");
  const edit = Boolean(u);
  const self = edit && (u.email === me.email || u.owner);
  d.innerHTML = `<form method="dialog" class="mh"><h2>${edit ? esc(u.name || u.email) : "Нов човек"}</h2><button class="iconbtn" value="close" aria-label="Затвори">✕</button></form>
    <form class="mb" id="uForm" autocomplete="off">
      <label>Име<input name="name" required maxlength="80" value="${esc(u?.name || "")}"></label>
      <label>Имейл (с него влиза)<input name="email" type="email" ${edit ? `disabled value="${esc(u.email)}"` : "required"}></label>
      <label>Роля<select name="role" ${self ? "disabled" : ""}><option value="staff">Служител – поръчки, товарителници, SMS</option><option value="admin" ${u?.role === "admin" ? "selected" : ""}>Собственик – и настройките, магазините, хората</option></select></label>
      <label>${edit ? "Нова парола (само ако я сменяш)" : "Парола (поне 10 знака)"}<input name="password" type="password" autocomplete="new-password" minlength="10" ${edit ? "" : "required"}></label>
      ${edit && !self ? `<p class="muted small">С нова парола човекът излиза от всички устройства.</p>` : ""}
      <p class="err small" id="uErr"></p>
    </form>
    <div class="mf"><button class="btn" id="uClose">Затвори</button><button class="btn primary" id="uSave">${edit ? "Запази" : "Добави"}</button></div>`;
  d.showModal();
  $("uClose").onclick = () => d.close();
  $("uSave").onclick = async () => {
    const f = $("uForm");
    if (!f.reportValidity()) return;
    $("uSave").disabled = true;
    try {
      const r = edit
        ? await api("/api/settings/users/change", { method: "POST", body: { id: Number(u.id), name: f.name.value, ...(self ? {} : { role: f.role.value }), password: f.password.value } })
        : await api("/api/settings/users", { method: "POST", body: { name: f.name.value, email: f.email.value, password: f.password.value, role: f.role.value } });
      users = r.users;
      render();
      d.close();
      say(edit ? "Записано." : `${f.name.value} може да влиза с ${f.email.value}.`);
    } catch (e) {
      $("uErr").textContent = e.message;
      $("uSave").disabled = false;
    }
  };
}

if (me.role !== "admin") {
  $("addUser").hidden = true;
  $("table").innerHTML = `<tbody><tr><td class="empty">Хората с достъп вижда само собственикът.</td></tr></tbody>`;
} else {
  $("addUser").onclick = () => dialog(null);
  $("q").oninput = render;
  $("table").onclick = async (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (edit) dialog(users.find((u) => Number(u.id) === Number(edit.dataset.edit)));
    if (del) {
      const u = users.find((x) => Number(x.id) === Number(del.dataset.del));
      if (!confirm(`Да махна ли достъпа на ${u.name || u.email}?`)) return;
      try {
        users = (await api("/api/settings/users/delete", { method: "POST", body: { id: Number(u.id) } })).users;
        render();
      } catch (err) {
        say(err.message, false);
      }
    }
  };
  load().catch((e) => say(e.message, false));
}
