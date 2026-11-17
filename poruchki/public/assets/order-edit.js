// Products of an order, with "Редактирай": quantities, prices, adding products from the shop,
// shipping price and discount. Saved in the platform (the shop's API cannot change amounts).
import { api, esc, eur, money, when } from "./app.js";

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

export function mountProducts(el, o, onSaved) {
  let editing = false;
  let items = [];
  let shipping = 0;
  let discount = 0;

  const start = () => {
    items = o.items.map((i) => ({ name: i.name, qty: i.qty, price: round2(i.total / (i.qty || 1)), sku: i.sku || "" }));
    shipping = Number(o.shipping) || 0;
    discount = Number(o.discount) || 0;
  };
  const sub = () => round2(items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.price) || 0), 0));
  const total = () => round2(sub() + (Number(shipping) || 0) - (Number(discount) || 0));
  const canEdit = (o.currency || "EUR") === "EUR";

  function view() {
    el.innerHTML = `
      <div class="row spread"><h2>Продукти</h2>
        <div class="row">${o.edit ? `<button class="btn sm" id="peReset">Върни сумите от магазина</button>` : ""}${canEdit ? `<button class="btn sm" id="peEdit">Редактирай</button>` : ""}</div></div>
      ${o.edit ? `<div class="note small">Коригирана в платформата${o.edit.at ? ` на ${when(o.edit.at)}` : ""}. В магазина сумата е ${money(o.cb_total, o.currency)}.</div>` : ""}
      <div class="scroll"><table class="tbl"><thead><tr><th>Продукт</th><th class="r">Брой</th><th class="r">Ед. цена</th><th class="r">Сума</th></tr></thead><tbody>
        ${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${i.qty}</td><td class="r">${money(i.total / (i.qty || 1), o.currency)}</td><td class="r">${money(i.total, o.currency)}</td></tr>`).join("")}
        <tr><td class="muted">Доставка</td><td></td><td></td><td class="r">${money(o.shipping, o.currency)}</td></tr>
        ${Number(o.discount) ? `<tr><td class="muted">Отстъпка${o.discount_code ? ` (${esc(o.discount_code)})` : ""}</td><td></td><td></td><td class="r">−${money(o.discount, o.currency)}</td></tr>` : ""}
        <tr><td><b>Общо</b></td><td></td><td></td><td class="r"><b>${money(o.total, o.currency)}</b>${o.currency !== "EUR" ? `<div class="muted small">${eur(o.total_eur)}</div>` : ""}</td></tr>
      </tbody></table></div>
      <p class="muted small">Плащане: ${esc(o.payment_method || "–")}${o.paid ? " · платена" : ""}</p>`;
    const e = el.querySelector("#peEdit");
    if (e) e.onclick = () => (start(), (editing = true), edit());
    const r = el.querySelector("#peReset");
    if (r)
      r.onclick = async () => {
        if (!confirm("Да върна ли продуктите и сумите, както са в магазина?")) return;
        try {
          const res = await api(`/api/orders/${o.id}/reset`, { method: "POST", body: {} });
          if (res.warning) alert(res.warning);
          onSaved(res.order);
        } catch (err) {
          alert(err.message);
        }
      };
  }

  function edit() {
    el.innerHTML = `
      <div class="row spread"><h2>Продукти – корекция</h2></div>
      <div class="scroll"><table class="tbl"><thead><tr><th>Продукт</th><th class="r">Брой</th><th class="r">Ед. цена (€)</th><th class="r">Сума</th><th></th></tr></thead><tbody id="peRows"></tbody></table></div>
      <div class="row" style="margin:10px 0">
        <input type="search" id="peQ" placeholder="Добави продукт: търси по име" style="flex:1;min-width:200px" aria-label="Търси продукт">
        <button class="btn sm" id="peCustom">Свой продукт</button>
      </div>
      <div class="results" id="peResults" style="display:grid;gap:2px;max-height:240px;overflow:auto"></div>
      <div class="grid2" style="margin-top:10px">
        <label class="small muted">Цена за доставка (€)<input type="number" id="peShip" min="0" step="0.01" value="${shipping}"></label>
        <label class="small muted">Отстъпка (€)<input type="number" id="peDisc" min="0" step="0.01" value="${discount}"></label>
      </div>
      <div class="row spread" style="margin-top:12px">
        <div id="peTotal" class="price"></div>
        <div class="row"><span class="err small" id="peErr"></span><button class="btn" id="peCancel">Откажи</button><button class="btn primary" id="peSave">Запази</button></div>
      </div>`;
    rows();
    el.querySelector("#peShip").oninput = (e) => ((shipping = Number(e.target.value)), totals());
    el.querySelector("#peDisc").oninput = (e) => ((discount = Number(e.target.value)), totals());
    el.querySelector("#peCancel").onclick = () => ((editing = false), view());
    el.querySelector("#peCustom").onclick = () => {
      items.push({ name: "", qty: 1, price: 0, custom: true });
      rows();
      el.querySelector("#peRows tr:last-child input[data-f=name]")?.focus();
    };
    let t;
    el.querySelector("#peQ").oninput = (e) => {
      clearTimeout(t);
      t = setTimeout(() => search(e.target.value), 250);
    };
    el.querySelector("#peQ").onfocus = (e) => search(e.target.value);
    el.querySelector("#peSave").onclick = save;
  }

  function rows() {
    const body = el.querySelector("#peRows");
    body.innerHTML = items
      .map(
        (i, n) => `<tr data-n="${n}">
        <td>${i.custom ? `<input type="text" data-f="name" value="${esc(i.name)}" placeholder="Име на продукта" style="width:100%">` : esc(i.name)}</td>
        <td class="r"><input type="number" data-f="qty" min="1" step="1" value="${i.qty}" style="width:70px;text-align:right"></td>
        <td class="r"><input type="number" data-f="price" min="0" step="0.01" value="${i.price}" style="width:90px;text-align:right"></td>
        <td class="r" data-line>${eur((Number(i.qty) || 0) * (Number(i.price) || 0), true)}</td>
        <td class="r"><button class="iconbtn" data-del title="Премахни" aria-label="Премахни">✕</button></td>
      </tr>`,
      )
      .join("");
    body.querySelectorAll("input").forEach((inp) => {
      inp.oninput = () => {
        const n = Number(inp.closest("tr").dataset.n);
        const f = inp.dataset.f;
        items[n][f] = f === "name" ? inp.value : Number(inp.value);
        inp.closest("tr").querySelector("[data-line]").textContent = eur((Number(items[n].qty) || 0) * (Number(items[n].price) || 0), true);
        totals();
      };
    });
    body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => (items.splice(Number(b.closest("tr").dataset.n), 1), rows())));
    totals();
  }

  function totals() {
    const was = Number(o.total);
    const now = total();
    el.querySelector("#peTotal").innerHTML = `Общо: <b>${eur(now, true)}</b>${now !== was ? ` <span class="muted small">(беше ${eur(was, true)})</span>` : ""}`;
  }

  async function search(text) {
    const box = el.querySelector("#peResults");
    try {
      const r = await api(`/api/products?shop=${encodeURIComponent(o.shop)}&q=${encodeURIComponent(text.trim())}`);
      box.innerHTML = r.products.length
        ? r.products
            .slice(0, 40)
            .map((p, n) => `<button type="button" class="btn link" data-n="${n}" style="text-align:left;padding:6px 8px;border-radius:8px">${esc(p.name)} <b>${eur(p.price, true)}</b>${p.source === "sold" ? ` <span class="muted small">(от поръчки)</span>` : ""}</button>`)
            .join("")
        : `<div class="muted small">Няма такъв продукт. Натисни „Свой продукт“, за да го добавиш с име и цена.</div>`;
      box.querySelectorAll("button").forEach(
        (b) =>
          (b.onclick = () => {
            const p = r.products[Number(b.dataset.n)];
            const same = items.find((i) => i.name.toLowerCase() === p.name.toLowerCase() && Number(i.price) === Number(p.price));
            if (same) same.qty = (Number(same.qty) || 0) + 1;
            else items.push({ name: p.name, qty: 1, price: p.price, sku: p.sku || "" });
            el.querySelector("#peQ").value = "";
            box.innerHTML = "";
            rows();
          }),
      );
    } catch (e) {
      box.innerHTML = `<div class="err small">${esc(e.message)}</div>`;
    }
  }

  async function save() {
    const btn = el.querySelector("#peSave");
    btn.disabled = true;
    el.querySelector("#peErr").textContent = "";
    try {
      const res = await api(`/api/orders/${o.id}/edit`, {
        method: "POST",
        body: { items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, sku: i.sku })), shipping: Number(shipping) || 0, discount: Number(discount) || 0 },
      });
      editing = false;
      if (res.warning) alert(res.warning);
      onSaved(res.order);
    } catch (e) {
      el.querySelector("#peErr").textContent = e.message;
      btn.disabled = false;
    }
  }

  editing ? edit() : view();
}

/** History of the order, newest first. */
export function renderHistory(el, o) {
  const list = [...(o.events || []).map((e) => ({ at: e.at, text: e.text, who: e.who })), { at: o.ordered_at, text: "Поръчката е създадена в магазина" }];
  list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  el.innerHTML = `<h2>Хронология</h2><ul class="timeline">${list
    .map((e) => `<li>${esc(e.text)}<div class="muted small">${when(e.at)}${e.who ? ` · ${esc(e.who)}` : ""}</div></li>`)
    .join("")}</ul>`;
}
