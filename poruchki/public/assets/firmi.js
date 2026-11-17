// Companies (platform owner only): create one with its first user, rename, switch off.
import { api, esc, num, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("firmi");
if (!me.owner) {
  $("app").innerHTML = `<p class="err">Тази страница е само за собственика на платформата.</p>`;
  throw new Error("not owner");
}

function render(list) {
  $("count").textContent = `${num(list.length)} фирми`;
  $("list").innerHTML = `<thead><tr><th>Фирма</th><th>Собственик</th><th class="r">Хора</th><th class="r">Магазини</th><th>Създадена</th><th></th></tr></thead><tbody>${list
    .map(
      (c) => `<tr${c.archived_at ? ' class="muted"' : ""}>
        <td><b>${esc(c.name)}</b>${c.id === 1 ? ' <span class="muted small">(твоята)</span>' : ""}${c.archived_at ? ' <span class="badge archived">спряна</span>' : ""}</td>
        <td>${esc(c.owners || "–")}</td>
        <td class="r">${num(c.users)}</td>
        <td class="r">${num(c.shops)}</td>
        <td>${when(c.created_at)}</td>
        <td class="r"><button class="btn sm" data-rename="${c.id}" data-name="${esc(c.name)}">Преименувай</button>${
          c.id === 1 ? "" : ` <button class="btn sm" data-archive="${c.id}" data-on="${c.archived_at ? "0" : "1"}">${c.archived_at ? "Пусни" : "Спри"}</button>`
        }</td>
      </tr>`,
    )
    .join("")}</tbody>`;
}

async function load() {
  try {
    render((await api("/api/companies")).companies);
  } catch (e) {
    $("list").innerHTML = `<tbody><tr><td class="err">${esc(e.message)}</td></tr></tbody>`;
  }
}

$("newCompany").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  $("create").disabled = true;
  $("msg").textContent = "";
  try {
    const r = await api("/api/companies", { method: "POST", body: { name: f.name.value, userName: f.userName.value, email: f.email.value, password: f.password.value } });
    render(r.companies);
    $("msg").innerHTML = `<span class="ok">Готово. ${esc(f.email.value)} може да влезе с паролата.</span>`;
    f.reset();
  } catch (err) {
    $("msg").innerHTML = `<span class="err">${esc(err.message)}</span>`;
  } finally {
    $("create").disabled = false;
  }
};

$("list").onclick = async (e) => {
  const r = e.target.closest("[data-rename]");
  const a = e.target.closest("[data-archive]");
  try {
    if (r) {
      const name = prompt("Ново име на фирмата:", r.dataset.name);
      if (name && name.trim()) render((await api(`/api/companies/${r.dataset.rename}`, { method: "POST", body: { name } })).companies);
    } else if (a) {
      const off = a.dataset.on === "1";
      if (off && !confirm("Да спра ли фирмата? Хората ѝ няма да могат да влизат, докато не я пуснеш пак. Данните остават.")) return;
      render((await api(`/api/companies/${a.dataset.archive}`, { method: "POST", body: { archived: off } })).companies);
    }
  } catch (err) {
    alert(err.message);
  }
};

load();
