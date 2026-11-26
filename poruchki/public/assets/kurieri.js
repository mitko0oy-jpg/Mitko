// Couriers of the company, like Middleware: the connected accounts, "+" → choose a courier → login and sender settings.
import { api, CMARK, esc, num, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("kurieri");
const isAdmin = me.role === "admin";
let info = {}; // courierInfo(): { speedy: { configured, source, user, at, ok, error }, econt: … }
let defaults = null;
let automation = {};

// Couriers we work with now; the rest come later.
const LIST = [
  { id: "speedy", name: "Спиди", ready: true, hint: "Потребител и парола за API от Спиди (myspeedy.bg → Профил → API достъп, или от търговеца)." },
  { id: "econt", name: "Еконт", ready: true, hint: "Потребител и парола от e-Econt (същите, с които влизаш в ee.econt.com)." },
  { id: "boxnow", name: "BOX NOW", ready: false },
  { id: "sameday", name: "Sameday", ready: false },
  { id: "gls", name: "GLS", ready: false },
  { id: "evropat", name: "Европът", ready: false },
];
const nameOf = (id) => LIST.find((c) => c.id === id)?.name || id;
const mark = (id) => CMARK[id] || `<span class="cmark big" aria-hidden="true">${esc(nameOf(id).slice(0, 1))}</span>`;
const ICON = {
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>`,
  del: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
};
const OBPD = { TEST: "Преглед и тест преди плащане", OPEN: "Преглед преди плащане", "": "Без преглед" };

function say(text, ok = true) {
  $("msg").innerHTML = text ? `<div class="note ${ok ? "" : "err"}">${esc(text)}</div>` : "";
}

const officeNames = {};
async function officeName(courier, id) {
  if (!id) return "";
  const k = `${courier}:${id}`;
  if (!(k in officeNames)) {
    officeNames[k] = api(`/api/waybills/offices?courier=${courier}&q=${encodeURIComponent(id)}`)
      .then((r) => r.offices.find((o) => String(o.id) === String(id))?.name || `№ ${id}`)
      .catch(() => `№ ${id}`);
  }
  return officeNames[k];
}

function summary(id) {
  if (!defaults) return "";
  if (id === "speedy") {
    const d = defaults.speedy;
    return [OBPD[d.obpd] ?? "", d.package === "BOX" ? "кутия" : "плик", `${String(d.weight).replace(".", ",")} кг`, `етикет ${d.paper}`].filter(Boolean).join(" · ");
  }
  if (id === "econt") {
    const d = defaults.econt;
    return [d.payAfterTest ? "Преглед и тест" : d.payAfterAccept ? "Преглед" : "Без преглед", d.sms ? "SMS до клиента" : "", `${String(d.weight).replace(".", ",")} кг`, d.agreement ? "наложен платеж по договор" : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

async function render() {
  const rows = Object.entries(info).filter(([, c]) => c.configured);
  if (!rows.length) {
    $("table").innerHTML = `<tbody><tr><td class="empty">Няма свързан куриер. ${isAdmin ? "Натисни „+“ и избери Спиди или Еконт." : ""}</td></tr></tbody>`;
    return;
  }
  $("table").innerHTML = `<thead><tr><th>Куриер</th><th>Статус</th><th>Акаунт</th><th>Предаваш в</th><th>Настройки</th><th>Свързан</th><th></th></tr></thead><tbody>${rows
    .map(
      ([id, c]) => `<tr>
      <td><div class="shopcell"><span class="courierlogo">${mark(id)}</span><b>${esc(nameOf(id))}</b></div></td>
      <td>${c.ok === false ? `<span class="statepill bad" title="${esc(c.error || "")}">Грешка</span><div class="sub err">${esc(c.error || "")}</div>` : `<span class="statepill ok">Активен</span>`}</td>
      <td>${esc(c.user || "")}${c.source === "env" ? `<div class="sub">от настройките на Netlify</div>` : ""}</td>
      <td data-office="${id}"><span class="sub">…</span></td>
      <td class="sub">${esc(summary(id))}</td>
      <td>${c.at ? esc(when(c.at)) : "–"}</td>
      <td class="acts"><div class="actsin">${
        isAdmin
          ? `<button class="iconbtn" title="Настройки" aria-label="Настройки на ${esc(nameOf(id))}" data-edit="${id}">${ICON.edit}</button>
             ${c.source === "app" ? `<button class="iconbtn warnbtn" title="Изключи" aria-label="Изключи ${esc(nameOf(id))}" data-del="${id}">${ICON.del}</button>` : ""}`
          : ""
      }</div></td>
    </tr>`,
    )
    .join("")}</tbody>`;
  for (const td of $("table").querySelectorAll("[data-office]")) {
    const id = td.dataset.office;
    const office = id === "speedy" ? defaults?.speedy.dropoffOfficeId : defaults?.econt.senderOfficeCode;
    td.innerHTML = office ? esc(await officeName(id, office)) : `<span class="sub">${id === "speedy" ? "вземат от адреса" : "не е избран"}</span>`;
  }
}

async function load() {
  const [s, w] = await Promise.all([api("/api/settings"), api("/api/waybills/settings")]);
  info = s.couriers;
  defaults = w.defaults;
  automation = w.automation || {};
  $("autoWaybill").checked = !!automation.autoWaybill;
  $("autoWaybill").disabled = !isAdmin;
  const t = s.tracked || {};
  $("tracked").textContent = `Последните 60 дни: ${num(t.with_no || 0)} поръчки с товарителница, ${num(t.tracked || 0)} проверени при куриера${t.matched ? `, ${num(t.matched)} намерени в Еконт по телефон` : ""}.`;
  await render();
}

// ---- "Избери куриер" ----
function choose() {
  const d = $("dlg");
  d.innerHTML = `<form method="dialog" class="mh"><h2>Избери куриер</h2><button class="iconbtn" value="close" aria-label="Затвори">✕</button></form>
    <div class="mb"><div class="ctiles">${LIST.map(
      (c) => `<button type="button" class="ctile" data-pick="${c.id}" ${c.ready ? "" : "disabled"}>
        <span class="courierlogo big">${mark(c.id)}</span><b>${esc(c.name)}</b>
        <span class="sub">${!c.ready ? "скоро" : info[c.id]?.configured ? "свързан – настройки" : "свържи"}</span></button>`,
    ).join("")}</div></div>`;
  d.showModal();
  d.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => setup(b.dataset.pick)));
}

/** Office search with a dropdown of the courier's offices. */
function officePicker(root, courier, current) {
  const input = root.querySelector("input[type=search]");
  const hidden = root.querySelector("input[type=hidden]");
  const list = root.querySelector(".odrop");
  hidden.value = current || "";
  if (current) officeName(courier, current).then((n) => (input.value = n));
  let timer = 0;
  input.oninput = () => {
    clearTimeout(timer);
    hidden.value = "";
    const text = input.value.trim();
    if (text.length < 2) return (list.hidden = true);
    timer = setTimeout(async () => {
      try {
        const r = await api(`/api/waybills/offices?courier=${courier}&q=${encodeURIComponent(text)}`);
        const offices = r.offices.filter((o) => !o.automat);
        list.innerHTML = offices.length
          ? offices.map((o) => `<button type="button" data-id="${esc(o.id)}" data-name="${esc(o.name)}"><b>${esc(o.name)}</b><span class="sub">${esc(o.address || "")}</span></button>`).join("")
          : `<div class="sub" style="padding:8px">Няма такъв офис.</div>`;
      } catch (e) {
        list.innerHTML = `<div class="err small" style="padding:8px">${esc(e.message)}</div>`;
      }
      list.hidden = false;
    }, 250);
  };
  list.onclick = (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    hidden.value = b.dataset.id;
    input.value = b.dataset.name;
    officeNames[`${courier}:${b.dataset.id}`] = Promise.resolve(b.dataset.name);
    list.hidden = true;
  };
}

function setup(id) {
  const c = info[id] || {};
  const meta = LIST.find((x) => x.id === id);
  const connected = c.configured;
  const sp = defaults?.speedy || {};
  const ec = defaults?.econt || {};
  const d = $("dlg");
  const settings =
    id === "speedy"
      ? `<label id="clientBox">Подател (номер на клиента в Спиди)<input type="text" name="clientId" inputmode="numeric" value="${esc(sp.clientId ?? "")}" placeholder="зарежда се от Спиди…"></label>
         <div class="opick"><label>Офис, в който предаваш пратките<input type="search" placeholder="град или име на офис, напр. Пловдив Тракия" autocomplete="off"></label><input type="hidden" name="office"><div class="odrop" hidden></div><span class="sub">Празно = куриерът ги взема от адреса ти.</span></div>
         <div class="grid2">
           <label>Преди плащане клиентът може<select name="obpd">${Object.entries(OBPD).map(([k, v]) => `<option value="${k}" ${sp.obpd === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
           <label>Услуга<input type="text" name="serviceId" inputmode="numeric" value="${esc(sp.serviceId ?? "")}"></label>
           <label>Опаковка<select name="package"><option value="ENVELOPE">плик</option><option value="BOX" ${sp.package === "BOX" ? "selected" : ""}>кутия</option></select></label>
           <label>Тегло по подразбиране (кг)<input name="weight" type="number" step="0.05" min="0.05" value="${esc(sp.weight ?? "")}"></label>
           <label>ДДС група за касовата бележка<select name="vatGroup">${["А", "Б", "В", "Г"].map((g) => `<option ${sp.vatGroup === g ? "selected" : ""}>${g}</option>`).join("")}</select></label>
           <label>Етикет<select name="paper"><option value="A6">A6 (етикетен принтер)</option><option value="A4" ${sp.paper === "A4" ? "selected" : ""}>A4</option></select></label>
         </div>`
      : `<div class="opick"><label>Офис, в който предаваш пратките<input type="search" placeholder="град или име на офис, напр. Пловдив Осогово" autocomplete="off"></label><input type="hidden" name="office"><div class="odrop" hidden></div></div>
         <label>Тегло по подразбиране (кг)<input name="weight" type="number" step="0.05" min="0.05" value="${esc(ec.weight ?? "")}"></label>
         <label class="chk"><input type="checkbox" name="sms" ${ec.sms ? "checked" : ""}> SMS до получателя</label>
         <label class="chk"><input type="checkbox" name="agreement" ${ec.agreement ? "checked" : ""}> Наложен платеж по договора (по-евтино)</label>
         <label class="chk"><input type="checkbox" name="payAfterTest" ${ec.payAfterTest ? "checked" : ""}> Плащане след преглед и тест</label>
         <label class="chk"><input type="checkbox" name="payAfterAccept" ${ec.payAfterAccept ? "checked" : ""}> Плащане след преглед</label>
         <div class="grid2">
           <label>Упълномощено лице (задължително за фирма)<input type="text" name="agentName" maxlength="80" value="${esc(ec.agentName || "")}" placeholder="име и фамилия"></label>
           <label>Телефон на упълномощеното лице<input type="tel" name="agentPhone" maxlength="20" value="${esc(ec.agentPhone || "")}" placeholder="празно = телефонът на фирмата в Еконт"></label>
         </div>`;
  d.innerHTML = `<form method="dialog" class="mh"><h2><span class="courierlogo">${mark(id)}</span> ${esc(meta.name)}</h2><button class="iconbtn" value="close" aria-label="Затвори">✕</button></form>
    <form class="mb" id="cForm" autocomplete="off">
      <div class="steps"><span class="${connected ? "done" : "on"}">1. Достъп</span><span class="${connected ? "on" : ""}">2. Изпращане</span></div>
      <fieldset class="form" ${c.source === "env" ? "disabled" : ""}>
        <legend>Достъп до API ${connected ? `<span class="ok small">свързан като ${esc(c.user || "")}</span>` : ""}</legend>
        ${c.source === "env" ? `<p class="muted small">Данните са в настройките на Netlify.</p>` : `<p class="muted small">${esc(meta.hint)} Пазят се криптирани.</p>`}
        <div class="grid2">
          <label>Потребител<input type="text" name="user" autocomplete="off" value="${esc(connected && c.source === "app" ? c.user || "" : "")}" ${connected ? "" : "required"}></label>
          <label>Парола<input name="pass" type="password" autocomplete="new-password" ${connected ? `placeholder="само ако я сменяш"` : "required"}></label>
        </div>
      </fieldset>
      <fieldset class="form" id="sendSet" ${connected ? "" : "disabled"}>
        <legend>Изпращане</legend>
        ${connected ? "" : `<p class="muted small">Първо свържи акаунта – после избираш офиса от списъка на ${esc(meta.name)}.</p>`}
        ${settings}
      </fieldset>
      <p class="err small" id="cErr"></p>
    </form>
    <div class="mf"><button class="btn" id="cClose">Затвори</button><button class="btn primary" id="cSave">${connected ? "Запази" : "Свържи"}</button></div>`;
  if (!d.open) d.showModal();
  const f = $("cForm");
  officePicker(f.querySelector(".opick"), id, id === "speedy" ? sp.dropoffOfficeId : ec.senderOfficeCode);
  if (connected && id === "speedy") {
    api("/api/waybills/clients?courier=speedy")
      .then((r) => {
        if (!r.clients.length) return;
        // The sender objects of the account as a dropdown (the first one when none is chosen yet).
        const cur = String(sp.clientId || "");
        const known = r.clients.some((x) => x.id === cur);
        $("clientBox").innerHTML = `Подател (обект в Спиди)<select name="clientId">${known || !cur ? "" : `<option value="${esc(cur)}" selected>№ ${esc(cur)}</option>`}${r.clients
          .map((x) => `<option value="${esc(x.id)}" ${cur === x.id ? "selected" : ""}>${esc(x.name)} (${esc(x.id)})${x.address ? ` – ${esc(x.address)}` : ""}</option>`)
          .join("")}</select>`;
      })
      .catch(() => null);
  }
  $("cClose").onclick = () => d.close();
  $("cSave").onclick = async () => {
    const btn = $("cSave");
    $("cErr").textContent = "";
    btn.disabled = true;
    try {
      const user = f.user.value.trim();
      const pass = f.pass.value;
      if (!connected || pass) {
        if (!user || !pass) throw new Error("Попълни потребител и парола.");
        btn.textContent = "Проверявам при куриера…";
        info = (await api("/api/settings/courier", { method: "POST", body: { courier: id, user, pass } })).couriers;
        if (!connected) {
          // Connected now: step 2, with the offices of this courier.
          await render();
          return setup(id);
        }
      }
      if (f.querySelector(".opick input[type=search]").value.trim() && !f.office.value) throw new Error("Избери офиса от падащия списък.");
      btn.textContent = "Записвам…";
      const body =
        id === "speedy"
          ? { speedy: { clientId: f.clientId.value, dropoffOfficeId: f.office.value, obpd: f.obpd.value, serviceId: f.serviceId.value, package: f.package.value, weight: f.weight.value, vatGroup: f.vatGroup.value, paper: f.paper.value } }
          : { econt: { senderOfficeCode: f.office.value, weight: f.weight.value, sms: f.sms.checked, agreement: f.agreement.checked, payAfterTest: f.payAfterTest.checked, payAfterAccept: f.payAfterAccept.checked, agentName: f.agentName.value, agentPhone: f.agentPhone.value } };
      defaults = (await api("/api/waybills/settings", { method: "POST", body })).defaults;
      await render();
      d.close();
      say(`${meta.name} е настроен.`);
    } catch (e) {
      $("cErr").textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = info[id]?.configured ? "Запази" : "Свържи";
    }
  };
}

$("addCourier").hidden = !isAdmin;
$("addCourier").onclick = choose;
$("table").onclick = async (e) => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  if (edit) setup(edit.dataset.edit);
  if (del) {
    if (!confirm(`Да изключа ли ${nameOf(del.dataset.del)}? Новите товарителници и проследяването с него спират.`)) return;
    try {
      info = (await api("/api/settings/courier", { method: "POST", body: { courier: del.dataset.del, remove: true } })).couriers;
      await render();
    } catch (err) {
      say(err.message, false);
    }
  }
};
$("autoWaybill").onchange = async (e) => {
  try {
    await api("/api/waybills/settings", { method: "POST", body: { automation: { autoWaybill: e.target.checked } } });
    say(e.target.checked ? "Товарителницата ще се създава сама след AI потвърждение." : "Автоматичното създаване е спряно.");
  } catch (err) {
    say(err.message, false);
  }
};
load().catch((e) => say(e.message, false));
