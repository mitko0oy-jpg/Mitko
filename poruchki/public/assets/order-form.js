// New order by hand, and changing the customer's name, phone and delivery of an existing order.
import { api, esc, eur } from "./app.js";

const TYPE = { office: "До офис", automat: "До автомат", address: "До адрес" };
const COURIER = { speedy: "Спиди", econt: "Еконт" };

function dialog() {
  let d = document.getElementById("orderDialog");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "orderDialog";
    d.className = "modal";
    document.body.append(d);
  }
  return d;
}

/**
 * mode "new": shops required, resolves to {id, order_no} of the new order.
 * mode "contact": order required, resolves to true when saved.
 */
export function openOrderForm({ mode, order, shops = [] }) {
  const d = dialog();
  const del = order?.delivery || {};
  const st = {
    shop: order?.shop || shops[0]?.id || "",
    name: order?.customer_name || "",
    phone: order?.phone || "",
    city: order?.city || "",
    zip: order?.zip || "",
    address: [order?.address, order?.address2].filter((x) => x && !/^\s*До офис/i.test(x)).join(", "),
    courier: del.courier === "econt" ? "econt" : "speedy",
    type: ["office", "automat", "address"].includes(del.type) ? del.type : "office",
    officeId: del.officeId || "",
    officeName: del.officeName || "",
    items: [],
    shipping: 4.5,
    note: "",
    confirmed: true,
  };
  d.showModal();
  return new Promise((resolve) => {
    let result = null;
    d.onclose = () => resolve(result);
    const read = () => {
      const f = d.querySelector("form");
      for (const k of ["name", "phone", "city", "zip", "address", "note"]) if (f[k]) st[k] = f[k].value.trim();
      if (f.shop) st.shop = f.shop.value;
      if (f.shipping) st.shipping = Number(f.shipping.value) || 0;
      if (f.confirmed) st.confirmed = f.confirmed.checked;
      d.querySelectorAll("[data-row]").forEach((tr) => {
        const i = st.items[Number(tr.dataset.row)];
        i.qty = Number(tr.querySelector("[data-f=qty]").value) || 1;
        i.price = Number(tr.querySelector("[data-f=price]").value) || 0;
        const nm = tr.querySelector("[data-f=name]");
        if (nm) i.name = nm.value.trim();
      });
    };
    const total = () => st.items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.price) || 0), 0) + (Number(st.shipping) || 0);

    function render() {
      const office = st.type !== "address";
      d.innerHTML = `
        <div class="mh"><h2>${mode === "new" ? "Нова поръчка" : `Клиент и доставка – № ${esc(order.order_no)}`}</h2><button class="iconbtn" data-close aria-label="Затвори">✕</button></div>
        <form class="mb" autocomplete="off">
          ${mode === "new" ? `<label>Магазин<select name="shop">${shops.map((s) => `<option value="${esc(s.id)}" ${s.id === st.shop ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></label>` : ""}
          <div class="grid2">
            <label>Име<input type="text" name="name" value="${esc(st.name)}" required></label>
            <label>Телефон<input type="tel" name="phone" value="${esc(st.phone)}" required></label>
          </div>
          <div class="row">
            <div class="seg">${["speedy", "econt"].map((c) => `<button type="button" data-courier="${c}" class="${st.courier === c ? "on" : ""}">${COURIER[c]}</button>`).join("")}</div>
            <div class="seg">${Object.entries(TYPE).map(([t, l]) => `<button type="button" data-type="${t}" class="${st.type === t ? "on" : ""}">${l}</button>`).join("")}</div>
          </div>
          ${
            office
              ? `<div class="office"><div>${st.officeId ? `<b>№ ${esc(st.officeId)}</b> ${esc(st.officeName)}` : `<span class="err">Избери ${st.type === "automat" ? "автомат" : "офис"}</span>`}</div><button type="button" class="btn sm" data-find>Избери</button></div>
                 <div id="ofFinder" hidden><input type="search" id="ofQ" placeholder="Град или име на офиса"><div class="results" id="ofList"></div></div>`
              : `<div class="grid2"><label>Град<input type="text" name="city" value="${esc(st.city)}"></label><label>Пощенски код<input type="text" name="zip" value="${esc(st.zip)}"></label></div>
                 <label>Адрес<input type="text" name="address" value="${esc(st.address)}"></label>`
          }
          ${
            mode === "new"
              ? `<b>Продукти</b>
                 <div class="scroll"><table class="tbl"><tbody>${st.items
                   .map(
                     (i, n) => `<tr data-row="${n}"><td>${i.custom ? `<input type="text" data-f="name" value="${esc(i.name)}" placeholder="Продукт">` : esc(i.name)}</td>
                       <td class="r"><input type="number" data-f="qty" min="1" value="${i.qty}" style="width:64px"></td>
                       <td class="r"><input type="number" data-f="price" min="0" step="0.01" value="${i.price}" style="width:84px"></td>
                       <td><button type="button" class="iconbtn" data-del="${n}" aria-label="Премахни">✕</button></td></tr>`,
                   )
                   .join("") || `<tr><td class="muted small">Още няма продукти.</td></tr>`}</tbody></table></div>
                 <div class="row"><input type="search" id="prQ" placeholder="Добави продукт" style="flex:1"><button type="button" class="btn sm" id="prCustom">Свой продукт</button></div>
                 <div class="results" id="prList"></div>
                 <div class="grid2"><label>Доставка (€)<input type="number" name="shipping" min="0" step="0.01" value="${st.shipping}"></label>
                   <div class="price" style="align-self:end">Общо: <b id="ofTotal">${eur(total(), true)}</b></div></div>
                 <label>Бележка<input type="text" name="note" value="${esc(st.note)}"></label>
                 <label class="chk"><input type="checkbox" name="confirmed" ${st.confirmed ? "checked" : ""}> Потвърдена (клиентът е потвърдил)</label>`
              : ""
          }
          <div class="err small" id="ofErr"></div>
        </form>
        <div class="mf"><button class="btn" data-close>Откажи</button><button class="btn primary" id="ofSave">${mode === "new" ? "Създай поръчката" : "Запази"}</button></div>`;
      bind();
    }

    function bind() {
      d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
      d.querySelectorAll("[data-courier]").forEach((b) => (b.onclick = () => (read(), st.courier !== b.dataset.courier && Object.assign(st, { courier: b.dataset.courier, officeId: "", officeName: "" }), render())));
      d.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => (read(), (st.type = b.dataset.type), render())));
      d.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => (read(), st.items.splice(Number(b.dataset.del), 1), render())));
      d.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => {
        if (!d.querySelector("#ofTotal")) return;
        read();
        d.querySelector("#ofTotal").textContent = eur(total(), true);
      }));
      const find = d.querySelector("[data-find]");
      if (find) {
        find.onclick = () => {
          read();
          const box = d.querySelector("#ofFinder");
          box.hidden = false;
          const q = d.querySelector("#ofQ");
          q.value = st.city || "";
          q.focus();
          offices(q.value);
        };
        let t;
        d.querySelector("#ofQ").oninput = (e) => (clearTimeout(t), (t = setTimeout(() => offices(e.target.value), 300)));
      }
      const pq = d.querySelector("#prQ");
      if (pq) {
        let t;
        pq.oninput = (e) => (clearTimeout(t), (t = setTimeout(() => products(e.target.value), 250)));
        pq.onfocus = (e) => products(e.target.value);
        d.querySelector("#prCustom").onclick = () => (read(), st.items.push({ name: "", qty: 1, price: 0, custom: true }), render());
      }
      d.querySelector("form").onsubmit = (e) => e.preventDefault();
      d.querySelector("#ofSave").onclick = save;
    }

    async function offices(text) {
      const list = d.querySelector("#ofList");
      if (text.trim().length < 2) return (list.innerHTML = "");
      try {
        const r = await api(`/api/waybills/offices?courier=${st.courier}&q=${encodeURIComponent(text)}`);
        const shown = r.offices.filter((x) => (st.type === "automat" ? x.automat : !x.automat));
        list.innerHTML = (shown.length ? shown : r.offices).map((x) => `<button type="button" data-id="${esc(x.id)}" data-name="${esc(x.name)}"><b>№ ${esc(x.id)}</b> ${esc(x.name)}<div class="muted small">${esc(x.address)}</div></button>`).join("") || `<div class="muted small">Няма намерени.</div>`;
        list.querySelectorAll("button").forEach((b) => (b.onclick = () => (read(), Object.assign(st, { officeId: b.dataset.id, officeName: b.dataset.name }), render())));
      } catch (e) {
        list.innerHTML = `<div class="err small">${esc(e.message)}</div>`;
      }
    }

    async function products(text) {
      read();
      const list = d.querySelector("#prList");
      try {
        const r = await api(`/api/products?shop=${encodeURIComponent(st.shop)}&q=${encodeURIComponent(text.trim())}`);
        list.innerHTML = r.products.slice(0, 30).map((p, n) => `<button type="button" data-n="${n}">${esc(p.name)} <b>${eur(p.price, true)}</b></button>`).join("") || `<div class="muted small">Няма такъв продукт – ползвай „Свой продукт“.</div>`;
        list.querySelectorAll("button").forEach((b) => (b.onclick = () => {
          const p = r.products[Number(b.dataset.n)];
          st.items.push({ name: p.name, qty: 1, price: p.price, sku: p.sku || "" });
          render();
        }));
      } catch (e) {
        list.innerHTML = `<div class="err small">${esc(e.message)}</div>`;
      }
    }

    async function save() {
      read();
      const btn = d.querySelector("#ofSave");
      btn.disabled = true;
      const delivery = { courier: st.courier, type: st.type, ...(st.type !== "address" ? { officeId: st.officeId, officeName: st.officeName } : {}) };
      const contact = { name: st.name, phone: st.phone, city: st.city, zip: st.zip, address: st.address, delivery };
      try {
        if (mode === "new") {
          result = await api("/api/orders", { method: "POST", body: { shop: st.shop, ...contact, items: st.items, shipping: st.shipping, note: st.note, confirmed: st.confirmed } });
        } else {
          await api(`/api/orders/${order.id}/contact`, { method: "POST", body: contact });
          result = true;
        }
        d.close();
      } catch (e) {
        d.querySelector("#ofErr").textContent = e.message;
        btn.disabled = false;
      }
    }

    render();
  });
}
