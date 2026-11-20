// Unfinished orders: who typed a phone in a shop's order form and did not send it.
import { api, esc, shell, when } from "./app.js";
import { openOrderForm } from "./order-form.js";

const $ = (id) => document.getElementById(id);
await shell("nezavarsheni");

const state = { tab: "open", shop: "", leads: [] };
let shops = [];

const line = `<script src="${location.origin}/c.js" defer></script>`;
$("line").textContent = line;
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(line);
    $("copy").textContent = "Копирано ✓";
  } catch {
    $("copy").textContent = "Маркирай реда и копирай";
  }
};

function since(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return m < 1 ? "току-що" : `преди ${m} мин`;
  const h = Math.floor(m / 60);
  return h < 24 ? `преди ${h} ч` : `преди ${Math.floor(h / 24)} д`;
}

function card(l) {
  const status = l.order_id
    ? `<a class="badge delivered" href="/poruchka/?id=${l.order_id}">поръча № ${esc(l.order_no || "")}</a>`
    : l.typing
      ? `<span class="badge new">попълва сега</span>`
      : l.status === "dismissed"
        ? `<span class="badge archived">скрита</span>`
        : `<span class="badge returned">не завърши</span>`;
  const acts = [];
  if (!l.order_id) {
    acts.push(`<a class="btn sm" href="tel:${esc(l.phone)}">Обади се</a>`);
    acts.push(`<button class="btn primary sm" data-act="order" data-id="${l.id}">Създай поръчка</button>`);
    acts.push(l.status === "dismissed" ? `<button class="btn sm" data-act="restore" data-id="${l.id}">Върни</button>` : `<button class="btn sm" data-act="dismiss" data-id="${l.id}">Скрий</button>`);
  }
  return `<article class="lead">
    <div class="lead-main">
      <div class="row spread"><b>${esc(l.name || "Без име")}${l.known ? ` <span class="pill known" title="Този път не е писал нищо: данните са запомнени от предишното му посещение на сайта">върна се</span>` : ""}</b>${status}</div>
      <div><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>${l.city ? ` · ${esc(l.city)}` : ""}${l.address ? ` · ${esc(l.address)}` : ""}</div>
      ${l.cart?.length ? `<ul class="lead-cart">${l.cart.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : `<div class="muted small">количката не се вижда</div>`}
      <div class="muted small">${esc(l.shop_label)} · ${since(l.last_at)} (${when(l.last_at)})${l.total ? ` · общо ${esc(l.total)}` : ""}${l.orders_before && !l.order_id ? ` · поръчвал ${l.orders_before} път${l.orders_before > 1 ? "и" : ""} преди` : ""}</div>
    </div>
    <div class="lead-acts">${acts.join("")}</div>
  </article>`;
}

async function load() {
  $("list").innerHTML = `<p class="muted">Зареждам…</p>`;
  try {
    const d = await api(`/api/leads?tab=${state.tab}${state.shop ? `&shop=${encodeURIComponent(state.shop)}` : ""}`);
    state.leads = d.leads;
    if (!d.counts?.all) $("setup").open = true; // nothing yet: show how to switch it on
    for (const b of $("tabs").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.tab === state.tab);
      b.querySelector(".n").textContent = d.counts?.[b.dataset.tab] ?? "";
    }
    $("list").innerHTML = d.leads.length
      ? d.leads.map(card).join("")
      : `<p class="muted">${state.tab === "open" ? "Няма незавършени поръчки. Ако сайтът още няма реда от „Как се включва на сайта“ по-долу, сложи го." : "Няма."}</p>`;
  } catch (e) {
    $("list").innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}

$("tabs").onclick = (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  state.tab = b.dataset.tab;
  load();
};
$("shop").onchange = () => ((state.shop = $("shop").value), load());
$("reload").onclick = load;

$("list").onclick = async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const id = Number(b.dataset.id);
  const l = state.leads.find((x) => Number(x.id) === id);
  if (!l) return;
  b.disabled = true;
  try {
    if (b.dataset.act === "order") {
      const r = await openOrderForm({ mode: "new", shops, order: { shop: l.shop, customer_name: l.name, phone: l.phone, city: l.city, address: l.address } });
      if (r?.id) {
        await api(`/api/leads/${id}`, { method: "POST", body: { action: "ordered", orderId: r.id } });
        location.href = `/poruchka/?id=${r.id}`;
        return;
      }
    } else {
      await api(`/api/leads/${id}`, { method: "POST", body: { action: b.dataset.act } });
      await load();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    b.disabled = false;
  }
};

try {
  const s = await api("/api/settings");
  shops = s.shops.filter((x) => x.active);
  $("shop").innerHTML += shops.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
} catch {
  /* the list works without the shop filter */
}
load();
