import { ago, api, esc, num, shell } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("nastroiki");
const isAdmin = me.role === "admin";

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

  const hist = s.shops.filter((x) => x.history);
  const errs = s.shops.filter((x) => x.error);
  const live = s.shops.filter((x) => x.hook).length;
  $("shopsInfo").innerHTML = `${num(s.shops.filter((x) => x.active).length)} включени магазина · в реално време: ${num(live)}
    ${hist.map((x) => `<div>${esc(x.label)}: изтегля историята… стигна до ${new Date(x.history.to * 1000).toLocaleDateString("bg-BG")}</div>`).join("")}
    ${errs.map((x) => `<div class="err">${esc(x.label)}: ${esc(x.error)}</div>`).join("")}`;
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
try {
  render(await api("/api/settings"));
} catch (e) {
  say(e.message, false);
}


// ---- SMS ----
function renderSms(d) {
  const acc = d.account;
  $("smsState").innerHTML = !d.configured
    ? `<span class="err">не е свързан</span>`
    : acc?.error
      ? `<span class="err">${esc(acc.error)}</span>`
      : `<span class="ok">свързан</span>${acc ? ` · остатък в SMSAPI: ${num(acc.points)}` : ""}${d.sender ? ` · подател: ${esc(d.sender)}` : ` · <span class="muted">без име на подател (ще е „Test“, докато SMSAPI не одобри име)</span>`}`;
  const f = $("smsForm");
  f.sender.value = d.sender || "";
  f.latin.checked = !!d.latin;
  f.officeOn.checked = !!d.office?.on;
  f.officeDay1.value = d.office?.day1 ?? 4;
  f.officeDay2.value = d.office?.day2 ?? 6;
  f.shippedOn.checked = !!d.shippedAuto?.on;
  f.reorderOn.checked = !!d.reorder?.on;
  $("reorderRules").innerHTML = "";
  for (const r of d.reorder?.rules?.length ? d.reorder.rules : [{ match: "", days: 45 }]) addReorderRule(r);
  $("smsTemplates").innerHTML = Object.entries(d.templates)
    .map(([k, t]) => `<label>${esc(t.label)}<textarea name="tpl_${k}" rows="3" style="width:100%;font:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--surface)">${esc(t.text)}</textarea></label>`)
    .join("");
  for (const el of f.elements) el.disabled = !isAdmin;
  $("smsTest").disabled = !isAdmin || !d.configured;
}
function addReorderRule(r = { match: "", days: 45 }) {
  const row = document.createElement("div");
  row.className = "row reorderRule";
  row.innerHTML = `<input type="number" min="7" max="365" style="width:72px" value="${esc(String(r.days ?? 45))}"> дни след доставката, продукт с думата <input type="text" maxlength="60" style="flex:1;min-width:120px" placeholder="празно = всички" value="${esc(r.match || "")}"> <button type="button" class="btn sm" title="Махни">✕</button>`;
  row.querySelector("button").onclick = () => row.remove();
  row.querySelectorAll("input").forEach((el) => (el.disabled = !isAdmin));
  $("reorderRules").append(row);
}
$("reorderAdd").onclick = () => addReorderRule({ match: "", days: 60 });
const reorderRules = () => [...document.querySelectorAll("#reorderRules .reorderRule")].map((row) => {
  const [days, match] = row.querySelectorAll("input");
  return { days: Number(days.value), match: match.value };
});
$("smsForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const templates = {};
  for (const el of f.elements) if (el.name?.startsWith("tpl_")) templates[el.name.slice(4)] = el.value;
  await busy($("smsSave"), "Записвам…", async () => {
    renderSms(await api("/api/sms/settings", { method: "POST", body: { token: f.token.value, sender: f.sender.value, latin: f.latin.checked, templates, office: { on: f.officeOn.checked, day1: Number(f.officeDay1.value), day2: Number(f.officeDay2.value) }, shippedAuto: { on: f.shippedOn.checked }, reorder: { on: f.reorderOn.checked, rules: reorderRules() } } }));
    f.token.value = "";
    say("SMS настройките са записани.");
  });
};
$("smsTest").onclick = () =>
  busy($("smsTest"), "Пращам…", async () => {
    const r = await api("/api/sms/test", { method: "POST", body: { phone: $("smsTestPhone").value } });
    say(`Пробният SMS е изпратен (${r.parts} SMS).`);
  });
api("/api/sms/settings?check=1").then(renderSms).catch((e) => say(e.message, false));

// ---- nekorekten.com ----
function renderNek(d) {
  const u = d.usage;
  $("nekState").innerHTML = !d.configured
    ? `<span class="err">не е свързан</span>`
    : u?.error
      ? `<span class="err">${esc(u.error)}</span>`
      : `<span class="ok">свързан</span>${u ? ` · план: ${esc(u.plan || "–")}${u.perDay ? ` · проверки днес: ${num(u.usedToday)} от ${num(u.perDay)}` : ""}` : ""}${d.source === "env" ? ` · <span class="muted">ключът е в настройките на Netlify</span>` : ""}`;
  const f = $("nekForm");
  f.auto.checked = !!d.auto;
  for (const el of f.elements) el.disabled = !isAdmin;
  $("nekRemove").hidden = d.source !== "app";
}
$("nekForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  await busy($("nekSave"), "Записвам…", async () => {
    renderNek(await api("/api/nekorekten/settings", { method: "POST", body: { key: f.key.value, auto: f.auto.checked } }));
    f.key.value = "";
    say("nekorekten.com е записан.");
  });
};
$("nekRemove").onclick = async () => {
  if (!confirm("Да махна ли ключа за nekorekten.com?")) return;
  renderNek(await api("/api/nekorekten/settings", { method: "POST", body: { removeKey: true } }));
  say("Ключът е махнат.");
};
api("/api/nekorekten/settings?check=1").then(renderNek).catch((e) => say(e.message, false));

// Duplicate orders: the rules.
function renderDup(r) {
  const f = $("dupForm");
  for (const k of ["on", "phone", "email", "products", "amount", "sameShop"]) f[k].checked = !!r[k];
  f.hours.value = r.hours;
  for (const el of f.elements) el.disabled = !isAdmin;
}
$("dupForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  await busy($("dupSave"), "Записвам…", async () => {
    const body = { hours: Number(f.hours.value) };
    for (const k of ["on", "phone", "email", "products", "amount", "sameShop"]) body[k] = f[k].checked;
    renderDup(await api("/api/settings/duplicates", { method: "POST", body }));
    say("Правилата за дублирани поръчки са записани.");
  });
};
api("/api/settings/duplicates").then(renderDup).catch((e) => say(e.message, false));

// ---- Връзка с Claude (MCP), only the owner ----
function renderMcp(d) {
  $("mcpCard").hidden = false;
  $("mcpUrl").value = d.url || "";
  $("mcpState").innerHTML = d.on ? `<span class="ok">включена</span>${d.at ? ` · линкът е от ${esc(new Date(d.at).toLocaleString("bg-BG"))}` : ""}` : `<span class="muted">изключена</span>`;
  $("mcpNew").textContent = d.on ? "Нов линк" : "Създай линк";
  $("mcpOff").disabled = !d.on;
  $("mcpCopy").disabled = !d.on;
}
if (isAdmin) {
  api("/api/mcp").then(renderMcp).catch(() => {});
  $("mcpNew").onclick = () => {
    if ($("mcpUrl").value && !confirm("Старият линк ще спре да работи. Да направя нов?")) return;
    busy($("mcpNew"), "Правя…", async () => renderMcp(await api("/api/mcp", { method: "POST", body: { action: "new" } })));
  };
  $("mcpOff").onclick = () => busy($("mcpOff"), "Изключвам…", async () => renderMcp(await api("/api/mcp", { method: "POST", body: { action: "off" } })));
  $("mcpCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("mcpUrl").value);
      say("Линкът е копиран.");
    } catch {
      $("mcpUrl").select();
    }
  };
}

