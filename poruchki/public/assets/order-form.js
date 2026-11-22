// New order by hand, and changing the customer's name, phone and delivery of an existing order.
// A new order looks the customer up by phone (or name): someone who ordered before gets their data filled in.
import { api, esc, eur, money, ONE, when } from "./app.js";

const TYPE = { office: "До офис", automat: "До автомат", address: "До адрес" };
const COURIER = { speedy: "Спиди", econt: "Еконт" };
const digits = (p) => String(p || "").replace(/\D/g, "");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
    officeHint: "",
    email: order?.email || "",
    // The customer found by phone (earlier orders), and whether the delivery was chosen by hand.
    customer: null,
    deliveryTouched: false,
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
      const was = d.querySelector("form")?.contains(document.activeElement) ? document.activeElement.name : "";
      d.innerHTML = `
        <div class="mh"><h2>${mode === "new" ? "Нова поръчка" : `Клиент и доставка – № ${esc(order.order_no)}`}</h2><button class="iconbtn" data-close aria-label="Затвори">✕</button></div>
        <form class="mb" autocomplete="off">
          ${mode === "new" ? `<label>Магазин<select name="shop">${shops.map((s) => `<option value="${esc(s.id)}" ${s.id === st.shop ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></label>` : ""}
          <div class="grid2">
            <label>Име<input type="text" name="name" value="${esc(st.name)}" required></label>
            <label>Телефон<input type="tel" name="phone" value="${esc(st.phone)}" required></label>
          </div>
          ${mode === "new" ? `<div class="results" id="ofSug"></div><div id="ofCust">${custCard()}</div>` : ""}
          <div class="row">
            <div class="seg">${["speedy", "econt"].map((c) => `<button type="button" data-courier="${c}" class="${st.courier === c ? "on" : ""}">${COURIER[c]}</button>`).join("")}</div>
            <div class="seg">${Object.entries(TYPE).map(([t, l]) => `<button type="button" data-type="${t}" class="${st.type === t ? "on" : ""}">${l}</button>`).join("")}</div>
          </div>
          ${
            office
              ? `<div class="office"><div>${st.officeId ? `<b>№ ${esc(st.officeId)}</b> ${esc(st.officeName)}` : `<span class="err">Избери ${st.type === "automat" ? "автомат" : "офис"}</span>${st.officeHint ? ` <span class="muted small">(миналия път: ${esc(st.officeHint)})</span>` : ""}`}</div><button type="button" class="btn sm" data-find>Избери</button></div>
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
      // Typing on: the field keeps the cursor after the form is drawn again.
      const el = was && d.querySelector(`form [name="${was}"]`);
      if (el) {
        el.focus();
        try {
          el.setSelectionRange(el.value.length, el.value.length);
        } catch {
          /* number fields */
        }
      }
    }

    /** „Стар клиент – 2 поръчки · 1 взета“ and the last orders, under the phone. */
    function custCard() {
      const c = st.customer;
      if (!c) return "";
      const parts = [];
      if (c.delivered) parts.push(plural(c.delivered, "взета", "взети"));
      if (c.returned) parts.push(`<span class="err">${plural(c.returned, "върната", "върнати")}</span>`);
      if (c.canceled) parts.push(plural(c.canceled, "отказана", "отказани"));
      const head = c.count ? `Стар клиент – ${plural(c.count, "поръчка", "поръчки")}` : "Има незавършена количка";
      return `<div class="cust">
        <div><b>${head}</b>${parts.length ? ` · ${parts.join(" · ")}` : ""}</div>
        ${c.orders
          .slice(0, 3)
          .map((o) => `<div class="small"><a href="/poruchka/?id=${o.id}" target="_blank" rel="noopener">№ ${esc(o.order_no)}</a> · ${when(o.ordered_at)} · ${esc(ONE[o.stage] || o.stage)} · ${money(o.total, o.currency)} · ${esc(o.shop_label)}</div>`)
          .join("")}
        <div class="muted small">Данните са попълнени от последната ${c.count ? "поръчка" : "количка"} – провери ги.</div>
      </div>`;
    }

    /** People matching what is typed in the name or phone: a click fills everything in. */
    function suggest(list) {
      const box = d.querySelector("#ofSug");
      if (!box) return;
      box.innerHTML = list
        .map(
          (c, n) => `<button type="button" data-c="${n}"><b>${esc(c.name || "Без име")}</b> · ${esc(c.phone)}${c.city ? ` · ${esc(c.city)}` : ""}
            <span class="muted small">– ${c.count ? `${plural(c.count, "поръчка", "поръчки")}, последна ${when(c.orders[0]?.ordered_at)}` : "незавършена количка"}</span></button>`,
        )
        .join("");
      box.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => apply(list[Number(b.dataset.c)], true)));
    }

    /** Fill the form from the customer's last order. Found by phone: only the empty fields; picked from the list: everything. */
    function apply(c, all) {
      read();
      const fill = (k, v) => {
        if (all) st[k] = v || "";
        else if (v && !st[k]) st[k] = v;
      };
      fill("name", c.name);
      if (all) st.phone = c.phone;
      fill("email", c.email);
      fill("city", c.city);
      fill("zip", c.zip);
      fill("address", c.address);
      const dl = c.delivery || {};
      if (dl.type && (all || (!st.deliveryTouched && !st.officeId))) {
        if (dl.courier) st.courier = dl.courier;
        st.type = dl.type;
        st.officeId = dl.type !== "address" ? dl.officeId : "";
        st.officeName = dl.type !== "address" ? dl.officeName : "";
        st.officeHint = dl.type !== "address" && !dl.officeId ? dl.officeName : "";
      }
      st.customer = c;
      render();
    }

    let seq = 0;
    let lt;
    function lookup(kind, wait = 300) {
      clearTimeout(lt);
      lt = setTimeout(async () => {
        read();
        const my = ++seq;
        const ph = digits(st.phone);
        let url = "";
        if (kind === "phone" && ph.length >= 9) url = `/api/orders/customer?phone=${ph}`;
        else if (kind === "phone" && ph.length >= 5) url = `/api/orders/customer?q=${encodeURIComponent(st.phone)}`;
        else if (kind === "name" && st.name.length >= 3) url = `/api/orders/customer?q=${encodeURIComponent(st.name)}`;
        if (!url) return suggest([]);
        try {
          const r = await api(url);
          if (my !== seq) return;
          if (kind === "phone" && ph.length >= 9) {
            suggest([]);
            if (r.customers[0] && r.customers[0].key !== st.customer?.key) apply(r.customers[0], false);
          } else suggest(r.customers);
        } catch {
          if (my === seq) suggest([]);
        }
      }, wait);
    }

    function bind() {
      d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
      d.querySelectorAll("[data-courier]").forEach((b) => (b.onclick = () => (read(), (st.deliveryTouched = true), st.courier !== b.dataset.courier && Object.assign(st, { courier: b.dataset.courier, officeId: "", officeName: "", officeHint: "" }), render())));
      d.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => (read(), (st.deliveryTouched = true), (st.type = b.dataset.type), render())));
      if (mode === "new") {
        const f = d.querySelector("form");
        f.phone.addEventListener("input", () => {
          read();
          // Another number: not the same customer any more (what was filled in stays).
          if (st.customer && digits(st.phone).slice(-9) !== st.customer.key) {
            st.customer = null;
            d.querySelector("#ofCust").innerHTML = "";
          }
          lookup("phone");
        });
        f.name.addEventListener("input", () => !st.customer && lookup("name"));
      }
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
          q.value = st.city || st.officeHint || "";
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
        list.querySelectorAll("button").forEach((b) => (b.onclick = () => (read(), Object.assign(st, { officeId: b.dataset.id, officeName: b.dataset.name, officeHint: "", deliveryTouched: true }), render())));
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
          result = await api("/api/orders", { method: "POST", body: { shop: st.shop, ...contact, ...(st.email ? { email: st.email } : {}), items: st.items, shipping: st.shipping, note: st.note, confirmed: st.confirmed } });
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
    // Opened with a phone already in (from an unfinished cart): look the customer up straight away.
    if (mode === "new" && digits(st.phone).length >= 9) lookup("phone", 0);
  });
}
