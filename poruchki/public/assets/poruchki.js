import { api, COURIER, esc, eur, money, num, qs, setQs, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["q", "stage", "region", "shop", "from", "to"];
let page = Number(qs().get("page")) || 1;

await shell("poruchki");

try {
  const s = await api("/api/settings");
  $("shop").innerHTML += s.shops.filter((x) => x.active).map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
} catch {
  /* optional */
}
for (const f of FIELDS) $(f).value = qs().get(f) || "";

function params() {
  const p = {};
  for (const f of FIELDS) p[f] = $(f).value.trim();
  return p;
}

const SINGULAR = { new: "Нова", shipped: "На път", at_office: "Чака в офис", delivered: "Взета", returned: "Върната", canceled: "Отказана", archived: "Архивирана" };

async function load() {
  const p = params();
  setQs({ ...p, page: page > 1 ? page : "" });
  const u = new URLSearchParams({ ...p, page: String(page) });
  $("app").classList.add("loading");
  try {
    const d = await api(`/api/orders?${u}`);
    $("count").textContent = `${num(d.total)} поръчки за ${eur(d.sum)}`;
    if (!d.orders.length) {
      $("list").innerHTML = `<div class="empty">Няма поръчки по тези условия.</div>`;
      $("pager").innerHTML = "";
      return;
    }
    $("list").innerHTML = `<table class="tbl cards"><thead><tr><th>Поръчка</th><th>Клиент</th><th>Продукти</th><th class="r">Сума</th><th>Етап</th></tr></thead><tbody>
      ${d.orders
        .map((o) => {
          const label = o.parcel_status === "refused" ? "Отказана на място" : SINGULAR[o.stage] || o.stage;
          const courier = o.courier ? COURIER[o.courier] || o.courier : o.delivery?.courier ? COURIER[o.delivery.courier] || "" : "";
          return `<tr class="click" data-id="${o.id}">
            <td><b>№ ${esc(o.order_no)}</b><div class="muted small">${esc(o.shop_label)}<br>${when(o.ordered_at)}</div></td>
            <td>${esc(o.customer_name || "–")}<div class="muted small">${esc(o.city)}</div></td>
            <td class="small items">${o.items.map(esc).join("<br>")}</td>
            <td class="r">${money(o.total, o.currency)}${o.currency !== "EUR" ? `<div class="muted small">${eur(o.total_eur)}</div>` : ""}</td>
            <td><span class="pill ${o.parcel_status === "refused" ? "returned" : o.stage}">${label}</span>
              <div class="muted small">${esc(courier)}${o.parcel_text && o.stage !== "delivered" ? `<br>${esc(o.parcel_text)}` : ""}</div></td>
          </tr>`;
        })
        .join("")}
      </tbody></table>`;
    $("list").querySelectorAll("tr.click").forEach((tr) => (tr.onclick = () => (location.href = `/poruchka/?id=${tr.dataset.id}`)));
    const pages = Math.ceil(d.total / d.perPage);
    $("pager").innerHTML =
      pages > 1
        ? `<button class="btn" id="prev" ${page <= 1 ? "disabled" : ""}>← По-нови</button><span class="muted small">${page} от ${pages}</span><button class="btn" id="next" ${page >= pages ? "disabled" : ""}>По-стари →</button>`
        : "";
    if (pages > 1) {
      $("prev").onclick = () => (page--, load());
      $("next").onclick = () => (page++, load());
    }
  } catch (e) {
    $("list").innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally {
    $("app").classList.remove("loading");
  }
}

let t;
$("q").oninput = () => {
  clearTimeout(t);
  t = setTimeout(() => ((page = 1), load()), 300);
};
for (const f of ["stage", "region", "shop", "from", "to"]) $(f).onchange = () => ((page = 1), load());
$("clear").onclick = () => {
  for (const f of FIELDS) $(f).value = "";
  page = 1;
  load();
};
load();
