// Склад: стойност на стоката по доставна цена и за колко дни стига всяка.
import { addDays, api, dayLabel, esc, eur, num, shell, today, when } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("sklad");
const isOwner = me.role === "admin";
let data = null;
let names = null;

const dec = (n, p = 2) => new Intl.NumberFormat("bg-BG", { minimumFractionDigits: p, maximumFractionDigits: p }).format(Number(n) || 0);
const cost = (n) => `${dec(n, n < 1 && Math.round(n * 1000) % 10 ? 3 : 2)} €`;
const plural = (n, one, many) => `${num(n)} ${Math.abs(n) === 1 ? one : many}`;

function daysCell(r) {
  if (r.status === "nolink") return `<span class="pill" title="Нито един продукт от поръчките не е свързан с него">няма връзка</span>`;
  if (r.qty <= 0) return `<span class="pill returned">свърши</span>`;
  if (r.days == null) return `<span class="pill canceled">без продажби</span>`;
  const cls = r.status === "out" ? "returned" : r.status === "low" ? "at_office" : "delivered";
  const sub = [r.status === "ok" ? "" : "поръчай скоро", r.days > 999 ? "" : `до ${dayLabel(addDays(today(), r.days))}`].filter(Boolean).join(" · ");
  return `<span class="pill ${cls}">${r.days > 999 ? "над 999 дни" : plural(r.days, "ден", "дни")}</span><div class="sub">${sub}</div>`;
}

function render() {
  const d = data;
  const g = Object.entries(d.groups);
  $("tiles").innerHTML =
    `<div class="tile"><div class="lbl">Стойност на склада</div><div class="big">${eur(d.total.value, true)}</div><div class="sub">по доставна цена · ${plural(d.total.items, "продукт", "продукта")}</div></div>` +
    g.map(([name, x]) => `<a class="tile" href="#g-${encodeURIComponent(name)}"><div class="lbl">${esc(name)}</div><div class="big">${eur(x.value, true)}</div><div class="sub">${num(x.qty)} бр. в ${plural(x.items, "продукт", "продукта")}</div></a>`).join("") +
    `<div class="tile"><div class="lbl">Свършват скоро</div><div class="big ${d.total.low ? "err" : "ok"}">${d.total.low ? plural(d.total.low, "продукт", "продукта") : "няма"}</div><div class="sub">стигат за по-малко от зададените дни</div></div>`;
  $("how").textContent = `„Стига за“ е по продажбите от последните ${d.speedDays} дни (без отказаните и върнатите). Наличността сама намалява, когато поръчка получи товарителница, и се връща, когато пратката се върне.`;

  const groups = new Map();
  for (const r of d.items.filter((x) => !x.archived)) {
    const k = r.grp || "Други";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const archived = d.items.filter((x) => x.archived);
  $("groups").innerHTML =
    [...groups.entries()]
      .map(
        ([name, rows]) => `<section class="card" id="g-${esc(encodeURIComponent(name))}">
      <div class="row spread"><h2>${esc(name)}</h2><span class="muted small">${eur(d.groups[name]?.value || 0, true)}</span></div>
      <div class="scroll"><table class="tbl sktbl">
        <thead><tr><th>Продукт</th><th class="r">Наличност</th><th class="r">Доставна цена</th><th class="r">Стойност</th><th class="r">Продадени за ${d.speedDays} дни</th><th>Стига за</th><th class="r" title="В нови поръчки, които още нямат товарителница">Чакат изпращане</th><th></th></tr></thead>
        <tbody>${rows.map(row).join("")}</tbody>
      </table></div></section>`,
      )
      .join("") +
    (archived.length
      ? `<details class="card"><summary class="small muted">Архивирани (${archived.length})</summary><div class="scroll"><table class="tbl sktbl"><tbody>${archived.map(row).join("")}</tbody></table></div></details>`
      : "") ||
    `<section class="card empty">Складът е празен. ${isOwner ? "Добави първия продукт с бутона +." : ""}</section>`;

  const ul = d.unlinked.filter((u) => !u.abroad);
  const ab = d.unlinked.filter((u) => u.abroad);
  $("unlinkedCard").hidden = !d.unlinked.length && !d.ignored.length;
  $("unlinkedHint").textContent = ul.length ? `${ul.length} в България` : "";
  const utbl = (list) =>
    list.length
      ? `<table class="tbl skul"><thead><tr><th>Продукт в поръчките</th><th>Магазин</th><th class="r">Бройки за ${d.speedDays} дни</th><th></th></tr></thead><tbody>${list
          .map(
            (u) => `<tr><td class="c-name">${esc(u.name)}</td><td class="muted small c-shop">${esc(u.shops)}</td><td class="r c-qty" data-l="Бройки">${num(u.qty)}</td>
            <td class="r c-act">${isOwner ? `<button class="btn sm primary" data-link="${esc(u.name)}">Свържи</button> <button class="btn sm" data-hide="${esc(u.name)}">Скрий</button>` : ""}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<p class="muted small">Всички продадени продукти са свързани със склада.</p>`;
  $("unlinked").innerHTML = utbl(ul);
  $("abroadBox").hidden = !ab.length;
  $("abroadN").textContent = `(${ab.length})`;
  $("abroad").innerHTML = ab.length ? utbl(ab) : "";
  $("ignoredBox").hidden = !d.ignored.length;
  $("ignoredN").textContent = `(${d.ignored.length})`;
  $("ignored").innerHTML = d.ignored.map((n) => `<div class="row spread"><span>${esc(n)}</span>${isOwner ? `<button class="btn sm" data-unhide="${esc(n)}">Покажи</button>` : ""}</div>`).join("");
}

function row(r) {
  return `<tr class="${r.archived ? "muted" : ""}">
    <td class="c-name"><button class="skname" data-open="${r.id}">${esc(r.name)}</button>${r.note ? `<div class="sub">${esc(r.note)}</div>` : ""}</td>
    <td class="r c-qty" data-l="Наличност"><b>${num(r.qty)}</b> бр.${r.qty !== r.counted_qty ? `<div class="sub" title="Преброени на ${esc(when(r.counted_at))}">броени ${num(r.counted_qty)}</div>` : ""}</td>
    <td class="r c-cost" data-l="Доставна цена">${cost(r.unit_cost)}</td>
    <td class="r c-val" data-l="Стойност"><b>${eur(r.value, true)}</b></td>
    <td class="r c-sold" data-l="Продадени за ${data.speedDays} дни">${r.sold ? `${num(r.sold)} бр.<div class="sub">${dec(r.perDay, 1)} на ден</div>` : `<span class="muted">–</span>`}</td>
    <td class="c-days" data-l="Стига за">${daysCell(r)}</td>
    <td class="r c-wait" data-l="Чакат изпращане">${r.waiting ? num(r.waiting) : `<span class="muted">–</span>`}</td>
    <td class="r nowrap c-act"><button class="btn sm" data-move="receipt" data-id="${r.id}">Заприходи</button> <button class="btn sm" data-move="count" data-id="${r.id}" title="Въведи колко броя има реално">Преброй</button></td>
  </tr>`;
}

async function load() {
  $("app").classList.add("loading");
  try {
    data = await api("/api/stock");
    render();
  } catch (e) {
    $("groups").innerHTML = `<section class="card err">${esc(e.message)}</section>`;
  } finally {
    $("app").classList.remove("loading");
  }
}

async function productNames() {
  if (!names) {
    names = (await api("/api/stock/products")).products;
    $("productNames").innerHTML = names.map((p) => `<option value="${esc(p.name)}">${p.abroad ? "чужбина · " : ""}${p.n} пъти</option>`).join("");
  }
  return names;
}

// ---- dialogs ----
const dlg = $("dlg");
function open(title, bodyHtml, footHtml) {
  dlg.innerHTML = `<form method="dialog" class="mh"><h2>${title}</h2><button class="iconbtn" value="close" aria-label="Затвори">✕</button></form>
    <form class="mb" id="f">${bodyHtml}<p class="err small" id="ferr"></p></form>
    <div class="mf">${footHtml}</div>`;
  if (!dlg.open) dlg.showModal();
  $("f").onsubmit = (e) => e.preventDefault();
  const close = dlg.querySelector("[data-close]");
  if (close) close.onclick = () => dlg.close();
  return $("f");
}
async function busy(btn, fn) {
  const t = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Запазвам…";
  $("ferr").textContent = "";
  try {
    await fn();
  } catch (e) {
    $("ferr").textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = t;
  }
}

const KIND = {
  receipt: { title: "Заприходи доставка", qty: "Колко броя дойдоха", btn: "Заприходи", hint: "Добавя се към наличността. Ако цената е различна, доставната цена става средната от старата и новата стока." },
  count: { title: "Преброяване", qty: "Колко броя има реално на рафта", btn: "Запиши броя", hint: "Наличността става точно толкова от този момент. Продажбите оттук нататък се вадят от нея." },
  writeoff: { title: "Брак, мостри, лично", qty: "Колко броя изваждаш", btn: "Извади", hint: "Вади се от наличността, без да е продажба." },
};

function moveDialog(item, kind = "receipt") {
  const k = KIND[kind];
  const f = open(
    `${esc(item.name)}`,
    `<div class="seg" role="group" id="kinds">${Object.entries(KIND).map(([v, x]) => `<button type="button" data-k="${v}" class="${v === kind ? "on" : ""}">${x.title}</button>`).join("")}</div>
     <div class="muted small">Сега: <b>${num(item.qty)} бр.</b> · доставна цена ${cost(item.unit_cost)}</div>
     <div class="grid2">
       <label>${k.qty}<input type="number" name="qty" min="0" step="1" inputmode="numeric" required autofocus></label>
       ${kind === "writeoff" ? "" : `<label>Доставна цена за брой, €${kind === "count" ? " (само ако се е променила)" : ""}<input type="number" name="unit_cost" min="0" step="0.01" inputmode="decimal" value="${kind === "receipt" ? item.unit_cost : ""}"></label>`}
     </div>
     <label>Бележка<input type="text" name="note" maxlength="300" placeholder="${kind === "receipt" ? "напр. доставчик, фактура №" : kind === "writeoff" ? "напр. счупени при доставка" : ""}"></label>
     <p class="muted small" style="margin:0">${k.hint}</p>`,
    `<button class="btn" data-close>Отказ</button><button class="btn primary" id="save">${k.btn}</button>`,
  );
  $("kinds").onclick = (e) => {
    const b = e.target.closest("button[data-k]");
    if (b) moveDialog(item, b.dataset.k);
  };
  $("save").onclick = () =>
    f.reportValidity() &&
    busy($("save"), async () => {
      await api(`/api/stock/${item.id}/move`, { method: "POST", body: { kind, qty: f.qty.value, unit_cost: f.unit_cost?.value ?? "", note: f.note.value } });
      dlg.close();
      await load();
    });
}

const MOVE = { count: "Преброяване", receipt: "Доставка", writeoff: "Изваден" };
async function itemDialog(id) {
  const [{ item, moves }] = await Promise.all([api(`/api/stock/${id}`), isOwner ? productNames() : null]);
  const s = item.since;
  const links = item.links.length ? item.links : [];
  const f = open(
    esc(item.name),
    `<div class="skcalc">
      <div><span>Преброени на ${esc(when(item.counted_at))}</span><b>${num(item.counted_qty)}</b></div>
      ${s.received ? `<div><span>+ доставени след това</span><b>${num(s.received)}</b></div>` : ""}
      ${s.out ? `<div><span>− изпратени (с товарителница)</span><b>${num(s.out)}</b></div>` : ""}
      ${s.back ? `<div><span>+ върнати пратки</span><b>${num(s.back)}</b></div>` : ""}
      ${s.written ? `<div><span>− брак / мостри</span><b>${num(s.written)}</b></div>` : ""}
      <div class="tot"><span>Наличност сега</span><b>${num(item.qty)} бр. = ${eur(item.value, true)}</b></div>
    </div>
    <div class="row"><button type="button" class="btn sm" data-mv="receipt">Заприходи</button><button type="button" class="btn sm" data-mv="count">Преброй</button><button type="button" class="btn sm" data-mv="writeoff">Брак / мостри</button></div>
    <h3 class="skh">Кои продукти от поръчките взимат от него</h3>
    <p class="muted small" style="margin:0">Името е точно както е в поръчката. „Бройки“ = колко от този продукт излизат при 1 брой от поръчката (напр. „Пакет 3+2“ → 5).</p>
    <div id="links" class="sklinks">${links.map(linkRow).join("")}</div>
    ${isOwner ? `<button type="button" class="btn sm" id="addLink">+ Добави продукт</button>` : ""}
    ${
      isOwner
        ? `<h3 class="skh">Данни</h3>
    <div class="grid2">
      <label>Име<input type="text" name="name" maxlength="120" value="${esc(item.name)}" required></label>
      <label>Група<input type="text" name="grp" maxlength="60" value="${esc(item.grp)}" list="groupNames"></label>
      <label>Доставна цена за брой, €<input type="number" name="unit_cost" min="0" step="0.0001" value="${item.unit_cost}"></label>
      <label>Предупреди, когато стига за по-малко от (дни)<input type="number" name="min_days" min="0" max="365" step="1" value="${item.min_days}"></label>
    </div>
    <label>Бележка<input type="text" name="note" maxlength="300" value="${esc(item.note)}"></label>
    <label class="row small"><input type="checkbox" name="archived" ${item.archived ? "checked" : ""}> Архивиран (не се показва и не влиза в стойността)</label>
    <datalist id="groupNames">${Object.keys(data.groups).map((g) => `<option value="${esc(g)}">`).join("")}</datalist>`
        : ""
    }
    <h3 class="skh">История</h3>
    <div class="skhist">${moves.map((m) => `<div><span class="muted">${esc(when(m.at))}</span> <b>${MOVE[m.kind]}</b> ${m.kind === "count" ? `${num(m.qty)} бр.` : `${m.kind === "receipt" ? "+" : "−"}${num(m.qty)} бр.`}${m.unit_cost != null ? ` по ${cost(m.unit_cost)}` : ""}${m.before != null ? ` <span class="muted">(преди: ${num(m.before)})</span>` : ""}${m.note ? ` – ${esc(m.note)}` : ""}${m.who ? ` <span class="muted">· ${esc(m.who)}</span>` : ""}</div>`).join("") || `<span class="muted">Няма записи.</span>`}</div>`,
    isOwner ? `<button class="btn" data-close>Затвори</button><button class="btn primary" id="save">Запази</button>` : `<button class="btn" data-close>Затвори</button>`,
  );
  dlg.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => moveDialog(item, b.dataset.mv)));
  $("links").onclick = (e) => {
    const x = e.target.closest("[data-unlink]");
    if (x) x.closest(".sklink").remove();
  };
  if (!isOwner) return;
  $("addLink").onclick = () => {
    $("links").insertAdjacentHTML("beforeend", linkRow({ product: "", units: 1 }));
    $("links").lastElementChild.querySelector("input").focus();
  };
  $("save").onclick = () =>
    f.reportValidity() &&
    busy($("save"), async () => {
      const ls = [...$("links").querySelectorAll(".sklink")].map((el) => ({ product: el.querySelector("[name=product]").value.trim(), units: el.querySelector("[name=units]").value })).filter((l) => l.product);
      await api(`/api/stock/${item.id}`, {
        method: "POST",
        body: { name: f.name.value, grp: f.grp.value, unit_cost: f.unit_cost.value, min_days: f.min_days.value, note: f.note.value, archived: f.archived.checked, links: ls },
      });
      dlg.close();
      await load();
    });
}
function linkRow(l) {
  return `<div class="sklink">
    <input type="text" name="product" list="productNames" value="${esc(l.product)}" placeholder="име на продукта в поръчката" aria-label="Продукт в поръчките" ${isOwner ? "" : "disabled"}>
    <span class="muted">×</span><input type="number" name="units" min="0.01" step="1" value="${l.units}" aria-label="Бройки" title="Колко броя от склада излизат при 1 поръчан" ${isOwner ? "" : "disabled"}>
    ${isOwner ? `<button type="button" class="iconbtn" data-unlink aria-label="Махни">✕</button>` : ""}
  </div>`;
}

function newItemDialog() {
  const f = open(
    "Нов продукт в склада",
    `<label>Име<input type="text" name="name" maxlength="120" required autofocus></label>
     <div class="grid2">
       <label>Група<input type="text" name="grp" maxlength="60" list="groupNames2" value="${esc(Object.keys(data.groups)[0] || "")}"></label>
       <label>Колко броя има сега<input type="number" name="qty" min="0" step="1" required></label>
       <label>Доставна цена за брой, €<input type="number" name="unit_cost" min="0" step="0.01" required></label>
     </div>
     <label>Бележка<input type="text" name="note" maxlength="300"></label>
     <p class="muted small" style="margin:0">После го отвори и добави кои продукти от поръчките взимат от него, за да се смята за колко дни стига.</p>
     <datalist id="groupNames2">${Object.keys(data.groups).map((g) => `<option value="${esc(g)}">`).join("")}</datalist>`,
    `<button class="btn" data-close>Отказ</button><button class="btn primary" id="save">Добави</button>`,
  );
  $("save").onclick = () =>
    f.reportValidity() &&
    busy($("save"), async () => {
      const r = await api("/api/stock", { method: "POST", body: { name: f.name.value, grp: f.grp.value, qty: f.qty.value, unit_cost: f.unit_cost.value, note: f.note.value } });
      data = r;
      render();
      dlg.close();
      itemDialog(r.id);
    });
}

function linkDialog(product) {
  const items = data.items.filter((i) => !i.archived);
  const guess = /(\d+)\s*\+\s*(\d+)/.exec(product);
  const f = open(
    "Свържи със склада",
    `<div class="note">${esc(product)}</div>
     <div class="grid2">
       <label>От кой продукт в склада е<select name="item" required>${items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></label>
       <label>Колко броя излизат при 1 поръчан<input type="number" name="units" min="0.01" step="1" value="${guess ? Number(guess[1]) + Number(guess[2]) : 1}" required></label>
     </div>
     <p class="muted small" style="margin:0">Ако продуктът е комплект от два различни (напр. „Литература + Български език“), свържи го и с двата – после отвори втория продукт в склада и го добави и там.</p>`,
    `<button class="btn" data-close>Отказ</button><button class="btn primary" id="save">Свържи</button>`,
  );
  $("save").onclick = () =>
    f.reportValidity() &&
    busy($("save"), async () => {
      data = await api("/api/stock/link", { method: "POST", body: { product, item_id: Number(f.item.value), units: f.units.value } });
      render();
      dlg.close();
    });
}

// ---- events ----
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-open],[data-move],[data-link],[data-hide],[data-unhide]");
  if (!t || dlg.contains(t)) return;
  try {
    if (t.dataset.open) await itemDialog(Number(t.dataset.open));
    else if (t.dataset.move) moveDialog(data.items.find((i) => i.id === Number(t.dataset.id)), t.dataset.move);
    else if (t.dataset.link) linkDialog(t.dataset.link);
    else if (t.dataset.hide || t.dataset.unhide) {
      t.disabled = true;
      data = await api("/api/stock/ignore", { method: "POST", body: { product: t.dataset.hide || t.dataset.unhide, ignore: Boolean(t.dataset.hide) } });
      render();
    }
  } catch (err) {
    alert(err.message);
  }
});
$("reload").onclick = load;
$("addItem").hidden = !isOwner;
$("addItem").onclick = newItemDialog;

await load();
