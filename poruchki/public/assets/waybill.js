// The waybill window: filled in from the order, the price is checked first, then one click creates it.
import { api, esc, eur } from "./app.js";

const COURIER_NAME = { speedy: "Спиди", econt: "Еконт" };
const TYPE_NAME = { office: "До офис", automat: "До автомат", address: "До адрес" };

function dialog() {
  let d = document.getElementById("wbDialog");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "wbDialog";
    d.className = "modal";
    document.body.append(d);
  }
  return d;
}

/** Opens the label PDF of one or more orders in a new tab. */
export function openLabels(ids) {
  window.open(`/api/waybills/label?ids=${ids.join(",")}`, "_blank", "noopener");
}

/** Speedy labels go into one PDF; Econt gives one PDF per waybill. list = [{id, courier}] */
export function openLabelsFor(list) {
  const speedy = list.filter((o) => o.courier === "speedy").map((o) => o.id);
  if (speedy.length) openLabels(speedy);
  for (const o of list.filter((x) => x.courier === "econt")) openLabels([o.id]);
}

/** Opens the window for one order. Resolves to the created waybill, or null when closed. */
export async function openWaybill(orderId) {
  const d = dialog();
  d.innerHTML = `<div class="mb"><div class="empty">Зареждам…</div></div>`;
  d.showModal();
  let data;
  try {
    data = await api(`/api/waybills/draft?order=${orderId}`);
  } catch (e) {
    d.innerHTML = `<div class="mb"><p class="err">${esc(e.message)}</p></div><div class="mf"><button class="btn" data-close>Затвори</button></div>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    return null;
  }
  const o = data.order;
  const draft = { ...data.draft };
  const ready = { speedy: !!data.couriers.speedy?.configured, econt: !!data.couriers.econt?.configured };

  return new Promise((resolve) => {
    let result = null;
    d.onclose = () => resolve(result);

    function render() {
      const office = draft.type !== "address";
      d.innerHTML = `
        <div class="mh">
          <div><h2>Товарителница за № ${esc(o.order_no)}</h2>
            <div class="muted small">${esc(o.shop)} · ${eur(o.total, true)} · ${esc(o.shipping_name || "")}</div></div>
          <button class="iconbtn" data-close aria-label="Затвори">✕</button>
        </div>
        <form class="mb" id="wbForm" autocomplete="off">
          ${o.tracking_no ? `<div class="note err">Поръчката вече има товарителница № ${esc(o.tracking_no)}.</div>` : ""}
          <div class="row">
            <div class="seg" role="group" aria-label="Куриер">${["speedy", "econt"]
              .map((c) => `<button type="button" data-courier="${c}" class="${draft.courier === c ? "on" : ""}" ${ready[c] ? "" : "disabled title='Не е свързан'"}>${COURIER_NAME[c]}</button>`)
              .join("")}</div>
            <div class="seg" role="group" aria-label="Доставка">${["office", "automat", "address"]
              .map((t) => `<button type="button" data-type="${t}" class="${draft.type === t ? "on" : ""}">${TYPE_NAME[t]}</button>`)
              .join("")}</div>
          </div>
          ${
            office
              ? `<div class="office"><div>${draft.officeId ? `<b>№ ${esc(draft.officeId)}</b> ${esc(draft.officeName)}${draft.guessed ? `<div class="warn small">Намерен по името от поръчката – провери дали е верният.</div>` : ""}` : `<span class="err">Избери ${draft.type === "automat" ? "автомат" : "офис"}</span>`}</div>
                   <button type="button" class="btn sm" data-find>Смени</button></div>
                 <div id="finder" hidden><input type="search" id="officeQ" placeholder="Град или име на офиса"><div class="results" id="officeList"></div></div>`
              : `<div class="grid2"><label>Град<input type="text" name="city" value="${esc(draft.city)}" required></label>
                   <label>Пощенски код<input type="text" name="zip" value="${esc(draft.zip)}" inputmode="numeric"></label></div>
                 <label>Адрес (улица, номер, блок, вход, етаж, апартамент)<input type="text" name="address" value="${esc(draft.address)}" required></label>`
          }
          <div class="grid2">
            <label>Получател<input type="text" name="name" value="${esc(draft.name)}" required></label>
            <label>Телефон<input type="tel" name="phone" value="${esc(draft.phone)}" required></label>
          </div>
          <div class="grid2">
            <label>Наложен платеж (€)<input type="number" name="cod" value="${draft.cod}" min="0" step="0.01"></label>
            <label>Тегло (кг)<input type="number" name="weight" value="${draft.weight}" min="0.05" step="0.05"></label>
          </div>
          <label>Съдържание<input type="text" name="contents" value="${esc(draft.contents)}" maxlength="100"></label>
          ${
            draft.courier === "speedy" && draft.type !== "automat"
              ? `<div class="row small"><span class="muted">Преди плащане клиентът може:</span>
                 <div class="seg">${[["TEST", "да прегледа и тества"], ["OPEN", "да прегледа"], ["", "нищо"]]
                   .map(([v, t]) => `<button type="button" data-obpd="${v}" class="${draft.obpd === v ? "on" : ""}">${t}</button>`)
                   .join("")}</div></div>`
              : ""
          }
          <div class="price" id="price"><span class="muted">Цена: проверявам…</span></div>
          <div class="err small" id="wbErr"></div>
        </form>
        <div class="mf">
          <button class="btn" data-close>Откажи</button>
          <button class="btn primary" id="wbCreate" ${o.tracking_no ? "disabled" : ""}>Създай товарителница</button>
        </div>`;
      bind();
      checkPrice();
    }

    function readForm() {
      const f = d.querySelector("#wbForm");
      for (const k of ["city", "zip", "address", "name", "phone", "contents"]) if (f[k]) draft[k] = f[k].value.trim();
      for (const k of ["cod", "weight"]) if (f[k]) draft[k] = Number(f[k].value) || 0;
    }

    let priceTimer;
    async function checkPrice() {
      const box = d.querySelector("#price");
      if (!box) return;
      if (draft.type !== "address" && !draft.officeId) {
        box.innerHTML = `<span class="muted">Цена: избери офис</span>`;
        return;
      }
      box.innerHTML = `<span class="muted">Цена: проверявам…</span>`;
      try {
        const p = await api("/api/waybills/price", { method: "POST", body: { orderId: o.id, draft } });
        box.innerHTML = `Цена: <b>${eur(p.price, true)}</b> <span class="muted small">(плаща подателят)</span>`;
        d.querySelector("#wbErr").textContent = "";
      } catch (e) {
        box.innerHTML = `<span class="muted">Цена: –</span>`;
        d.querySelector("#wbErr").textContent = e.message;
      }
    }
    const later = () => {
      clearTimeout(priceTimer);
      priceTimer = setTimeout(() => (readForm(), checkPrice()), 600);
    };

    function bind() {
      d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
      d.querySelectorAll("[data-courier]").forEach((b) =>
        (b.onclick = () => {
          readForm();
          if (draft.courier !== b.dataset.courier) {
            draft.courier = b.dataset.courier;
            // Office numbers differ between couriers.
            if (draft.type !== "address") Object.assign(draft, { officeId: "", officeName: "" });
            draft.weight = data.defaults[draft.courier].weight;
          }
          render();
        }),
      );
      d.querySelectorAll("[data-type]").forEach((b) =>
        (b.onclick = () => {
          readForm();
          if (draft.type !== b.dataset.type) {
            const wasOffice = draft.type !== "address";
            draft.type = b.dataset.type;
            if (wasOffice && draft.type !== "address" && b.dataset.type !== data.draft.type) Object.assign(draft, { officeId: "", officeName: "" });
          }
          render();
        }),
      );
      d.querySelectorAll("[data-obpd]").forEach((b) => (b.onclick = () => (readForm(), (draft.obpd = b.dataset.obpd), render())));
      d.querySelectorAll("#wbForm input").forEach((i) => i.addEventListener("input", later));
      const find = d.querySelector("[data-find]");
      if (find) {
        find.onclick = () => {
          const box = d.querySelector("#finder");
          box.hidden = !box.hidden;
          const qi = d.querySelector("#officeQ");
          qi.value = draft.city || "";
          qi.focus();
          search(qi.value);
        };
        let t;
        d.querySelector("#officeQ").oninput = (e) => {
          clearTimeout(t);
          t = setTimeout(() => search(e.target.value), 300);
        };
      }
      d.querySelector("#wbForm").onsubmit = (e) => e.preventDefault();
      d.querySelector("#wbCreate").onclick = create;
    }

    async function search(text) {
      const list = d.querySelector("#officeList");
      if (text.trim().length < 2) {
        list.innerHTML = "";
        return;
      }
      list.innerHTML = `<div class="muted small">Търся…</div>`;
      try {
        const r = await api(`/api/waybills/offices?courier=${draft.courier}&q=${encodeURIComponent(text)}`);
        const wanted = r.offices.filter((x) => (draft.type === "automat" ? x.automat : !x.automat));
        const shown = wanted.length ? wanted : r.offices;
        list.innerHTML = shown.length
          ? shown.map((x) => `<button type="button" data-id="${esc(x.id)}" data-name="${esc(x.name)}"><b>№ ${esc(x.id)}</b> ${esc(x.name)}${x.automat ? " (автомат)" : ""}<div class="muted small">${esc(x.address)}</div></button>`).join("")
          : `<div class="muted small">Няма намерени.</div>`;
        list.querySelectorAll("button").forEach((b) =>
          (b.onclick = () => {
            readForm();
            draft.officeId = b.dataset.id;
            draft.officeName = b.dataset.name;
            delete draft.guessed;
            render();
          }),
        );
      } catch (e) {
        list.innerHTML = `<div class="err small">${esc(e.message)}</div>`;
      }
    }

    async function create() {
      readForm();
      const btn = d.querySelector("#wbCreate");
      btn.disabled = true;
      btn.textContent = "Създавам…";
      d.querySelector("#wbErr").textContent = "";
      try {
        const r = await api("/api/waybills/create", { method: "POST", body: { orderId: o.id, draft } });
        result = r;
        d.innerHTML = `
          <div class="mh"><h2>Готово</h2><button class="iconbtn" data-close aria-label="Затвори">✕</button></div>
          <div class="mb"><p>Товарителница <b>№ ${esc(r.number)}</b> (${COURIER_NAME[r.courier]}) за поръчка № ${esc(o.order_no)}${r.price ? ` · цена ${eur(r.price, true)}` : ""}.</p></div>
          <div class="mf"><button class="btn" data-close>Затвори</button><button class="btn primary" id="wbPrint">Печат на етикета</button></div>`;
        d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
        d.querySelector("#wbPrint").onclick = () => openLabels([o.id]);
      } catch (e) {
        d.querySelector("#wbErr").textContent = e.message;
        btn.disabled = false;
        btn.textContent = "Създай товарителница";
      }
    }

    render();
  });
}

/** Cancels a waybill made from the platform. */
export async function cancelWaybill(orderId, number) {
  if (!confirm(`Да анулирам ли товарителница № ${number}?`)) return false;
  await api("/api/waybills/cancel", { method: "POST", body: { orderId } });
  return true;
}

/** Waybills for many orders with the data from each order, one after another. */
export async function bulkCreate(orders, onDone) {
  const d = dialog();
  const todo = orders.filter((o) => !o.tracking_no);
  const skipped = orders.length - todo.length;
  const by = todo.reduce((a, o) => ((a[o.courier || o.delivery?.courier || "?"] = (a[o.courier || o.delivery?.courier || "?"] || 0) + 1), a), {});
  d.innerHTML = `
    <div class="mh"><h2>Товарителници за ${todo.length} поръчки</h2><button class="iconbtn" data-close aria-label="Затвори">✕</button></div>
    <div class="mb">
      <p>Ще създам товарителници с данните от поръчките: ${Object.entries(by).map(([c, n]) => `${COURIER_NAME[c] || c} – ${n}`).join(", ")}. Наложеният платеж е сумата на поръчката.${skipped ? ` ${skipped} вече имат товарителница и ги пропускам.` : ""}</p>
      <div class="progress" id="bulkLog"></div>
    </div>
    <div class="mf"><button class="btn" data-close>Затвори</button><button class="btn primary" id="bulkGo" ${todo.length ? "" : "disabled"}>Създай ${todo.length}</button></div>`;
  d.showModal();
  d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
  const made = [];
  d.querySelector("#bulkGo").onclick = async (e) => {
    e.target.disabled = true;
    const log = d.querySelector("#bulkLog");
    for (const o of todo) {
      const line = document.createElement("div");
      line.textContent = `№ ${o.order_no} – създавам…`;
      log.append(line);
      try {
        const r = await api("/api/waybills/create", { method: "POST", body: { orderId: o.id } });
        line.innerHTML = `№ ${esc(o.order_no)} – <span class="ok">${COURIER_NAME[r.courier]} № ${esc(r.number)}</span>`;
        made.push({ id: o.id, courier: r.courier });
      } catch (err) {
        line.innerHTML = `№ ${esc(o.order_no)} – <span class="err">${esc(err.message)}</span>`;
      }
    }
    e.target.textContent = "Готово";
    if (made.length) {
      const p = document.createElement("button");
      p.className = "btn";
      p.textContent = `Печат на етикетите (${made.length})`;
      p.onclick = () => openLabelsFor(made);
      d.querySelector(".mf").prepend(p);
    }
    onDone?.();
  };
}
