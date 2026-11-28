// The panel that opens under an order row, like Middleware: Поръчка / Получател / Продукти.
import { CMARK, COURIER, esc, money } from "./app.js";

const COUNTRY = { BG: "България", SK: "Словакия", SI: "Словения", HU: "Унгария", RO: "Румъния", GR: "Гърция", CZ: "Чехия", PL: "Полша", HR: "Хърватия" };
const PRINT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>`;
const BOX = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>`;

const row = (label, value) => `<div class="pr"><span class="pl">${label}</span><span class="pv">${value || `<span class="muted">–</span>`}</span></div>`;
const nicePhone = (p) => {
  const d = String(p || "").replace(/[^\d+]/g, "");
  const m = /^(?:\+?359|0)(\d{3})(\d{3})(\d{3})$/.exec(d);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : String(p || "");
};
// ConvertBuilder keeps the weight as typed in the product: small numbers are kilograms, big ones grams.
const kg = (w) => (w >= 50 ? w / 1000 : w);
const weightText = (w) => `${String(Math.round(w * 1000) / 1000).replace(".", ",")} кг`;

const PAY = { cod: "Наложен платеж", cash_on_delivery: "Наложен платеж", card: "С карта", stripe: "С карта", paypal: "PayPal", bank: "Банков превод", bank_transfer: "Банков превод" };
const payText = (o) => PAY[String(o.payment_method || "").toLowerCase()] || o.payment_method || (o.paid ? "Платена" : "Наложен платеж");

export function courierOfDetail(o) {
  const d = o.delivery || {};
  if (o.courier === "speedy" || o.courier === "econt") return o.courier;
  if (d.courier) return d.courier;
  return /еконт|econt/i.test(o.shipping_name || "") ? "econt" : /спиди|speedy/i.test(o.shipping_name || "") ? "speedy" : "";
}

// „PETAK20 (−20%, −10,94 €)“ – the code with what it took off, like in Middleware.
function promo(o, cur) {
  if (!o.discount_code && !(o.discount > 0)) return "";
  const p = o.discount > 0 && o.sub_total > 0 ? (o.discount / o.sub_total) * 100 : 0;
  const parts = [p > 0 && Math.abs(p - Math.round(p)) < 0.1 ? `−${Math.round(p)}%` : "", o.discount > 0 ? `−${money(o.discount, cur)}` : ""].filter(Boolean);
  return `${o.discount_code ? `<span class="code">${esc(o.discount_code)}</span>` : `<span class="muted">без код</span>`}${parts.length ? ` <span class="muted">(${parts.join(", ")})</span>` : ""}`;
}

// Where the order is: Създадена → Потвърдена → Изготвена → Изпратена → В офис → Взета (as on the order page).
const STEPS = [
  ["new", "Създадена"],
  ["confirmed", "Потвърдена"],
  ["prepared", "Изготвена"],
  ["shipped", "Изпратена"],
  ["at_office", "В офис"],
  ["delivered", "Взета"],
];
export function progress(o) {
  if (["returned", "canceled"].includes(o.stage)) return "";
  const reached = new Set(["new"]);
  if (o.confirmed_at) reached.add("confirmed");
  const order = ["prepared", "shipped", "at_office", "delivered"];
  const at = order.indexOf(o.stage);
  for (let i = 0; i <= at; i++) reached.add(order[i]);
  if (at >= 0) reached.add("confirmed");
  if (o.stage === "delivered") reached.add("at_office");
  const cur = [...STEPS].reverse().find(([k]) => reached.has(k))?.[0];
  return `<ol class="steps">${STEPS.map(([k, l]) => `<li class="${reached.has(k) ? "on" : ""}${k === cur ? " cur" : ""}">${l}</li>`).join("")}</ol>`;
}

export function panelHtml(o) {
  const d = o.delivery || {};
  const c = courierOfDetail(o);
  const cur = o.currency || "EUR";
  const where = d.type === "office" ? "До офис" : d.type === "automat" ? "До автомат" : d.type === "address" ? "До адрес" : "";
  const office = d.officeName || d.officeId ? `${d.officeId ? `№ ${esc(d.officeId)} ` : ""}${esc(d.officeName || "")}` : "";
  const address = [o.address, o.address2].filter((x) => x && !/^\s*До офис/i.test(x)).join(", ");

  // The delivery price the client paid, and in brackets what the courier really takes.
  const cost = o.courier_cost;
  const shipCell = `${money(o.shipping, cur)}${cost != null ? ` <span class="realcost" title="Колко взема куриерът за тази пратка">(${money(cost, "EUR")})</span>` : o.tracking_no ? ` <span class="muted small" title="Още не сме питали куриера">(…)</span>` : ""}`;
  const left = cost != null && cur === "EUR" ? Math.round((o.total - cost) * 100) / 100 : null;

  const wb = o.tracking_no
    ? `<span class="wbno">${CMARK[c] || ""}${o.tracking_link ? `<a href="${esc(o.tracking_link)}" target="_blank" rel="noopener">${esc(o.tracking_no)}</a>` : esc(o.tracking_no)}</span>${
        c === "speedy" || c === "econt" ? ` <button class="linkbtn" data-act="print" data-id="${o.id}" title="Печат на етикета" aria-label="Печат на етикета">${PRINT}</button>` : ""
      }`
    : `<span class="muted">няма</span>`;

  const order = `<section class="pcard"><h3>Поръчка</h3>
    ${row("Товарителница", wb)}
    ${row("Начин на плащане", `${esc(payText(o))}${o.paid ? ` <span class="okc small">платена</span>` : ""}`)}
    ${row("Промо код", promo(o, cur))}
    ${row("Метод на доставка", `${c ? `${CMARK[c] || ""} ${esc(COURIER[c] || c)} · ` : ""}${esc(where || o.shipping_name || "")}`)}
    ${row("Цена на доставката", shipCell)}
    ${row("Държава", esc(COUNTRY[String(o.country).toUpperCase()] || o.country || (o.region === "bg" ? "България" : "")))}
    ${row("Град", esc(o.city))}
    ${row("Пощенски код", esc(o.zip))}
    ${d.type === "address" ? row("Адрес", esc(address)) : row(d.type === "automat" ? "Автомат" : "Офис", office)}
    <div class="psum">
      ${row("Продукти", money(o.sub_total, cur))}
      ${o.discount ? row("Отстъпка", `−${money(o.discount, cur)}`) : ""}
      ${row("Доставка", money(o.shipping, cur))}
      ${row("<b>Общо</b>", `<b>${money(o.total, cur)}</b>${cur !== "EUR" ? ` <span class="muted small">(${money(o.total_eur, "EUR")})</span>` : ""}`)}
      ${left != null ? row("След куриера", `<b class="${left >= 0 ? "okc" : "badc"}">${money(left, "EUR")}</b>`) : ""}
    </div>
  </section>`;

  const client = `<section class="pcard"><h3>Получател</h3>
    ${row("Име", `<b>${esc(o.customer_name || "")}</b>`)}
    ${row("Телефон", o.phone ? `<a href="tel:${esc(o.phone)}">${esc(nicePhone(o.phone))}</a>` : "")}
    ${row("Имейл", o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : "")}
    ${row("Град", esc([o.city, o.zip].filter(Boolean).join(", ")))}
    ${row(d.type === "address" ? "Адрес" : where || "Адрес", d.type === "address" || !office ? esc(address) : office)}
    ${o.nekorekten?.count ? row("nekorekten.com", `<a class="badc" href="/poruchka/?id=${o.id}#nek">${o.nekorekten.count} сигнала</a>`) : ""}
    ${(o.extra_fields || []).filter((f) => f.value).map((f) => row(esc(f.field), esc(f.value))).join("")}
  </section>`;

  const lines = o.lines || [];
  const physical = lines.filter((l) => !l.digital);
  const known = physical.filter((l) => l.weight);
  const total = known.reduce((n, l) => n + kg(l.weight) * l.qty, 0);
  const contents = (physical.some((l) => l.total > 0) ? physical : lines).filter((l) => l.total > 0).map((l) => l.name).join(", ");
  const products = `<section class="pcard wide"><h3>Продукти</h3>
    <div class="plines">${lines
      .map(
        (l) => `<div class="pline">
        <span class="pimg">${l.image ? `<img src="${esc(l.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : BOX}</span>
        <span class="pname"><b>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>` : esc(l.name)}</b>
          ${l.variant ? `<span class="sub">${esc(l.variant)}</span>` : ""}
          ${l.digital ? `<span class="dig">дигитален – не се изпраща</span>` : ""}
          <span class="sub">${l.sku ? `SKU: ${esc(l.sku)}` : ""}${l.weight ? `${l.sku ? " · " : ""}${weightText(kg(l.weight))}` : ""}</span></span>
        <span class="pq">${l.qty} × ${money(l.price, cur)}</span>
        <span class="pt">${l.total ? money(l.total, cur) : `<span class="gift">подарък</span>`}</span>
      </div>`,
      )
      .join("")}</div>
    <div class="pfoot">
      ${row("Общо тегло", known.length ? `${weightText(total)}${known.length < physical.length ? ` <span class="muted small">(${physical.length - known.length} без тегло)</span>` : ""}` : `<span class="muted">не е въведено в магазина</span>`)}
      ${row("Описание на пратката", esc(contents.slice(0, 100)))}
    </div>
    <div class="popen"><a href="/poruchka/?id=${o.id}">Отвори поръчката →</a></div>
  </section>`;

  const steps = progress(o);
  return `${steps ? `<div class="psteps">${steps}</div>` : ""}<div class="panel3">${order}${client}${products}</div>`;
}
