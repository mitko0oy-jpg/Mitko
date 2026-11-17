import { ago, api, esc, num, shell } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("nastroiki");
const isAdmin = me.role === "admin";
const COURIERS = { speedy: "Спиди", econt: "Еконт" };

function say(text, ok = true) {
  $("msg").innerHTML = text ? `<div class="note ${ok ? "" : "err"}">${esc(text)}</div>` : "";
}

async function busy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    return await fn();
  } catch (e) {
    say(e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function jobText(j) {
  if (!j) return "още не е пускано";
  const i = j.info || {};
  const errs = Object.entries(i.errors || {}).map(([k, v]) => `${k}: ${v}`);
  if (j.job === "sync")
    return `${ago(j.at)} – ${num(i.inserted || 0)} нови, ${num(i.updated || 0)} обновени${i.mw?.enabled ? `, Middleware: ${num(i.mw.matched || 0)}` : ""}${errs.length ? ` · <span class="err">${esc(errs.join("; "))}</span>` : ""}`;
  return `${ago(j.at)} – проверени ${num(i.checked || 0)}, с промяна ${num(i.changed || 0)}${i.matched ? `, намерени по телефон ${num(i.matched)}` : ""}${errs.length ? ` · <span class="err">${esc(errs.join("; "))}</span>` : ""}`;
}

function render(s) {
  const job = (k) => s.jobs.find((j) => j.job === k);
  $("jobs").innerHTML = `<div>Поръчки: ${jobText(job("sync"))}</div><div>Пратки: ${jobText(job("track"))}</div>
    ${s.middleware.enabled ? `<div class="muted">Middleware е свързан – оттам идват товарителниците, докато не ги правим сами.</div>` : ""}
    ${s.fx?.rates?.HUF ? `<div class="muted">Курс: 1 € = ${String(s.fx.rates.HUF).replace(".", ",")} HUF (ЕЦБ${s.fx.date ? `, ${esc(s.fx.date)}` : ""})</div>` : ""}`;

  $("shops").innerHTML = s.shops.length
    ? `<table class="tbl"><thead><tr><th>Магазин</th><th>Пазар</th><th>Валута</th><th class="r">Поръчки</th><th>Последно</th><th>Включен</th></tr></thead><tbody>
      ${s.shops
        .map(
          (x) => `<tr data-id="${esc(x.id)}">
          <td><b>${esc(x.label)}</b><div class="muted small">${esc(x.domain)}</div>
            ${x.error ? `<div class="err small">${esc(x.error)}</div>` : ""}
            ${!x.hasKey ? `<div class="err small">Няма API ключ</div>` : ""}
            ${x.history ? `<div class="small">Изтегля историята… стигна до ${new Date(x.history.to * 1000).toLocaleDateString("bg-BG")}</div>` : ""}</td>
          <td><select data-f="region" ${isAdmin ? "" : "disabled"}><option value="bg" ${x.region === "bg" ? "selected" : ""}>България</option><option value="abroad" ${x.region === "abroad" ? "selected" : ""}>Чужбина</option></select></td>
          <td><input data-f="currency" value="${esc(x.currency)}" size="4" maxlength="3" ${isAdmin ? "" : "disabled"}></td>
          <td class="r">${num(x.orders)}${x.firstDay ? `<div class="muted small">от ${new Date(x.firstDay).toLocaleDateString("bg-BG")}</div>` : ""}</td>
          <td class="small">${ago(x.syncedAt)}${x.hook ? `<div class="ok">в реално време</div>` : ""}</td>
          <td><input type="checkbox" data-f="active" ${x.active ? "checked" : ""} ${isAdmin ? "" : "disabled"} aria-label="Включен"></td>
        </tr>`,
        )
        .join("")}
      </tbody></table>`
    : `<div class="note">Няма свързани магазини. Нужна е настройката CB_SITES в Netlify.</div>`;
  $("shops").querySelectorAll("[data-f]").forEach((el) => {
    el.onchange = async () => {
      const id = el.closest("tr").dataset.id;
      const f = el.dataset.f;
      const value = f === "active" ? el.checked : el.value;
      try {
        render(await api("/api/settings/shop", { method: "POST", body: { id, [f]: value } }));
        say("Записано.");
      } catch (e) {
        say(e.message, false);
      }
    };
  });

  $("couriers").innerHTML = Object.entries(COURIERS)
    .map(([id, label]) => {
      const c = s.couriers[id] || {};
      const status = !c.configured
        ? `<span class="err">не е свързан</span>`
        : c.ok === false
          ? `<span class="err">не приема данните: ${esc(c.error || "")}</span>`
          : `<span class="ok">свързан</span> <span class="muted">(${esc(c.user)}${c.source === "env" ? ", от Netlify" : ""})</span>`;
      return `<form class="form" data-c="${id}">
        <div><b>${label}</b> – ${status}</div>
        ${
          isAdmin
            ? `<label>Потребител за API<input name="user" autocomplete="off" required></label>
               <label>Парола за API<input name="pass" type="password" autocomplete="new-password" required></label>
               <div class="row"><button class="btn">${c.configured ? "Смени" : "Свържи"}</button>${c.source === "app" ? `<button type="button" class="btn link" data-remove>Премахни</button>` : ""}</div>`
            : ""
        }
      </form>`;
    })
    .join("");
  $("couriers").querySelectorAll("form").forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button");
      await busy(btn, "Проверявам…", async () => {
        render(await api("/api/settings/courier", { method: "POST", body: { courier: f.dataset.c, user: f.user.value, pass: f.pass.value } }));
        say(`${COURIERS[f.dataset.c]} е свързан.`);
      });
    };
    const rm = f.querySelector("[data-remove]");
    if (rm) rm.onclick = async () => render(await api("/api/settings/courier", { method: "POST", body: { courier: f.dataset.c, remove: true } }));
  });
  const t = s.tracked || {};
  $("tracked").textContent = `Последните 60 дни: ${num(t.with_no || 0)} поръчки с товарителница, ${num(t.tracked || 0)} проверени при куриера${t.matched ? `, ${num(t.matched)} намерени в Еконт по телефон` : ""}.`;

  $("usersCard").hidden = !isAdmin;
  if (isAdmin) {
    $("users").innerHTML = `<table class="tbl"><tbody>${s.users
      .map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === "admin" ? "собственик" : "служител"}</td><td class="r">${u.role === "admin" ? "" : `<button class="btn link" data-del="${u.id}">Премахни</button>`}</td></tr>`)
      .join("")}</tbody></table>`;
    $("users").querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => render(await api("/api/settings/users/delete", { method: "POST", body: { id: Number(b.dataset.del) } }))));
  }
  for (const b of ["hooks", "history"]) $(b).disabled = !isAdmin;
}

$("sync").onclick = () =>
  busy($("sync"), "Изтеглям…", async () => {
    const r = await api("/api/settings/sync", { method: "POST", body: {} });
    say(`Готово: ${num(r.inserted)} нови и ${num(r.updated)} обновени поръчки.`);
    render(await api("/api/settings"));
  });
$("track").onclick = () =>
  busy($("track"), "Проверявам…", async () => {
    const r = await api("/api/settings/track", { method: "POST", body: {} });
    say(r.couriers.length ? `Проверени ${num(r.checked)} пратки, ${num(r.changed)} с нов статус.` : "Първо свържи Спиди или Еконт.");
    render(await api("/api/settings"));
  });
$("hooks").onclick = () =>
  busy($("hooks"), "Свързвам…", async () => {
    const r = await api("/api/settings/hooks", { method: "POST", body: {} });
    const bad = Object.entries(r.result).filter(([, v]) => v !== "ok");
    say(bad.length ? `Не стана за: ${bad.map(([k, v]) => `${k} (${v})`).join(", ")}` : "Магазините вече пращат поръчките веднага.", !bad.length);
    render(r);
  });
$("history").onclick = () =>
  busy($("history"), "Започвам…", async () => {
    await api("/api/settings/history", { method: "POST", body: { months: Number($("months").value) } });
    say("Историята се изтегля на части, от най-новото назад. Може да отнеме няколко часа – таблото се попълва постепенно.");
    render(await api("/api/settings"));
  });
$("addUser").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    render(await api("/api/settings/users", { method: "POST", body: { name: f.name.value, email: f.email.value, password: f.password.value } }));
    f.reset();
    say("Добавен.");
  } catch (err) {
    say(err.message, false);
  }
};

try {
  render(await api("/api/settings"));
} catch (e) {
  say(e.message, false);
}

