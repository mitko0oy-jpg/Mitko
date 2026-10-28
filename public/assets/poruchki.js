// Shop orders for the admin: new orders first, one tap to move an order to the next status.
import { $, api, esc, go, me, toast, topbar } from "./app.js";
import { PACKAGES, SHIPPING, euro } from "./shop-catalog.js";

const STATUS = { new: "Нови", confirmed: "Потвърдени", sent: "Изпратени", done: "Завършени", canceled: "Отказани" };
const NEXT = { new: ["confirmed", "sent", "canceled"], confirmed: ["sent", "canceled"], sent: ["done", "canceled"], done: [], canceled: ["new"] };
const ACTION = { confirmed: "Потвърдена", sent: "Изпратена", done: "Платена и получена", canceled: "Отказ", new: "Върни като нова" };
let filter = "new";

const when = (s) => new Date(s).toLocaleString("bg-BG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const phone = (p) => p.replace(/^0(\d{3})(\d{3})(\d+)$/, "0$1 $2 $3");

function card(o) {
  const pkg = PACKAGES[o.package]?.title || o.package;
  const ship = SHIPPING[o.shipping]?.title || o.shipping;
  const label = `${o.name}\n${phone(o.phone)}\n${ship}: ${o.city}, ${o.place}\n${pkg} – ${euro(o.total)} наложен платеж`;
  return `<article class="ritem" id="o-${o.id}">
    <header><b>№ ${o.id}</b><span class="small muted">${esc(when(o.created_at))}</span><span class="pill ${o.status === "canceled" ? "bad" : o.status === "done" ? "ok" : ""}">${esc(STATUS[o.status])}</span></header>
    <p class="rq">${esc(pkg)} · ${esc(euro(o.total))}</p>
    <p><b>${esc(o.name)}</b> · <a href="tel:${esc(o.phone)}">${esc(phone(o.phone))}</a></p>
    <p>${esc(ship)}: ${esc(o.city)}, ${esc(o.place)}</p>
    ${o.note ? `<p class="notice info">${esc(o.note)}</p>` : ""}
    <p class="small muted">Карти ${esc(euro(o.price))} + доставка ${esc(euro(o.ship_price))} · от ${esc(o.source || "сайта")}</p>
    <div class="row">
      ${NEXT[o.status].map((s, i) => `<button class="btn ${i ? "ghost" : ""}" data-id="${o.id}" data-status="${s}">${esc(ACTION[s])}</button>`).join("")}
      <button class="btn ghost" data-copy="${esc(label)}">Копирай данните</button>
    </div>
  </article>`;
}

async function list() {
  const d = await api(`orders${filter === "all" ? "" : `?status=${filter}`}`);
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  $("main").innerHTML = `<h1>Поръчки</h1>
    <p class="lead">Поръчките от страниците с картите (<a href="/karti-nvo/">/karti-nvo/</a>). Плащането е с наложен платеж.</p>
    <div class="tabs" role="tablist">
      ${Object.entries(STATUS).map(([k, v]) => `<button role="tab" data-f="${k}" aria-selected="${filter === k}">${v} (${d.counts[k] || 0})</button>`).join("")}
      <button role="tab" data-f="all" aria-selected="${filter === "all"}">Всички (${total})</button>
    </div>
    <div class="row" style="margin-top:6px"><button class="btn ghost" id="reload">Обнови</button></div>
    ${d.orders.length ? d.orders.map(card).join("") : '<p class="notice ok">Няма поръчки тук.</p>'}`;
  $("reload").addEventListener("click", list);
  document.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => ((filter = b.dataset.f), list())));
  document.querySelectorAll("[data-status]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api(`orders/${b.dataset.id}`, { status: b.dataset.status });
      toast(`№ ${b.dataset.id}: ${ACTION[b.dataset.status]}`);
      list();
    }),
  );
  document.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        toast("Копирано");
      } catch {
        toast("Не успях да копирам");
      }
    }),
  );
}

async function load() {
  const m = await me();
  if (!m.user) return go(`/vhod/?kak=roditel&next=${encodeURIComponent(location.pathname)}`);
  topbar(m);
  if (m.user.role !== "admin") {
    $("main").innerHTML = `<h1>Поръчки</h1><p class="notice err">Тази страница е само за администратор.</p>`;
    return;
  }
  await list();
}
load().catch((e) => ($("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`));
