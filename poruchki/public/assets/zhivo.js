// Сега в сайтовете: who is on the shop pages right now (from the c.js signs of life), refreshed every 10 s.
import { api, esc, num, shell } from "./app.js";
import { sonar, CH_COLOR } from "./sonar.js";

const $ = (id) => document.getElementById(id);
await shell("zhivo");

const STAGE = {
  browsing: ["Разглежда", "browsing"],
  checkout: ["Във формата", "checkout"],
  filling: ["Попълва", "filling"],
  ordered: ["Поръча", "ordered"],
};
const COUNTRY = { BG: "България", HU: "Унгария", SK: "Словакия", SI: "Словения", RO: "Румъния", GR: "Гърция", CZ: "Чехия", PL: "Полша", HR: "Хърватия", RS: "Сърбия", MK: "Сев. Македония", TR: "Турция", DE: "Германия", AT: "Австрия", IT: "Италия", ES: "Испания", FR: "Франция", NL: "Нидерландия", BE: "Белгия", GB: "Великобритания", IE: "Ирландия", US: "САЩ", CH: "Швейцария", SE: "Швеция", NO: "Норвегия", DK: "Дания", CY: "Кипър", UA: "Украйна" };
const DEV = {
  mobile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="телефон"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>`,
  tablet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="таблет"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M11 18h2"/></svg>`,
  desktop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="компютър"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>`,
};
const KIND = { came: "влезе", checkout: "стигна до формата", filling: "попълва формата", ordered: "поръча" };
const hhmm = (iso) => new Date(iso).toLocaleTimeString("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit" });
const place = (x) => x.city || COUNTRY[x.country] || x.country || "Някой";
const eur2 = (n) => `${(Number(n) || 0).toFixed(2).replace(".", ",")} €`;

/** The circle (drawn as a sonar in sonar.js): one slice per channel, each person online is a blip –
 * outer ring browsing, then the form, then typing. */
function radar(channels, sessions) {
  const list = sonar($("radar"), channels, sessions, place, (st) => STAGE[st]?.[0] || "");
  // A slice under the mouse shows its numbers.
  $("radar").querySelectorAll(".slice").forEach((g) => {
    g.onmouseenter = (e) => {
      const c = list.find((x) => x.id === g.dataset.ch);
      $("rtip").innerHTML = `<b style="color:${CH_COLOR[c.id]}">${esc(c.label)}</b><div>${c.now} на сайта · ${c.form} във формата</div><div class="muted">Днес: ${c.orders} поръчки · ${eur2(c.sum)}</div>`;
      $("rtip").hidden = false;
    };
    g.onmousemove = (e) => {
      const box = $("radar").parentElement.getBoundingClientRect();
      $("rtip").style.left = `${e.clientX - box.left + 14}px`;
      $("rtip").style.top = `${e.clientY - box.top + 14}px`;
    };
    g.onmouseleave = () => ($("rtip").hidden = true);
  });
}

function channelTable(channels) {
  $("channels").innerHTML = `<thead><tr><th>Канал</th><th class="r">Сега</th><th class="r">Във формата</th><th class="r">Поръчки днес</th><th class="r">Днес</th></tr></thead><tbody>${channels
    .map(
      (c) => `<tr class="${c.now || c.orders ? "" : "zero"}"><td><i class="cdot" style="background:${CH_COLOR[c.id] || "#888"}"></i>${esc(c.label)}</td><td class="r">${c.now}</td><td class="r">${c.form}</td><td class="r">${c.orders}</td><td class="r sum">${eur2(c.sum)}</td></tr>`,
    )
    .join("")}</tbody>`;
}

function feed(list) {
  $("feed").innerHTML = list.length
    ? list
        .map((e) => {
          const ch = `<span class="chip" style="--c:${CH_COLOR[e.channel] || "#888"}">${esc((data.channels.find((c) => c.id === e.channel) || {}).label || "Неизвестен")}</span>`;
          const what =
            e.kind === "order"
              ? `<b>Поръчка № ${esc(e.order_no)}</b> · ${eur2(e.total)}${e.city ? ` · ${esc(e.city)}` : ""}`
              : `<b>${esc(place(e))}</b> ${KIND[e.kind] || ""}`;
          return `<li class="${e.kind}"><time>${hhmm(e.at)}</time><span class="what">${what} ${ch}<span class="sub">${esc(e.shop_label)}</span></span></li>`;
        })
        .join("")
    : `<li class="muted small">Още нищо. Щом някой отвори сайт, ще се появи тук.</li>`;
}

let data = null;
let fetchedAt = 0;

const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} с` : s < 3600 ? `${Math.floor(s / 60)} мин` : `${Math.floor(s / 3600)} ч`;
};
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");

function render() {
  if (!data) return;
  const shopSel = $("shop").value;
  const stageSel = $("stage").value;
  const shops = data.shops.filter((s) => !shopSel || s.id === shopSel);
  const sum = (k, part = "now") => shops.reduce((n, s) => n + (s[part][k] || 0), 0);
  const online = sum("online");
  $("kpis").innerHTML = [
    ["Онлайн сега", online, `${pct(sum("mobile"), online)} от телефон`, "on"],
    ["Разглеждат", sum("browsing"), "продуктовите страници", ""],
    ["Във формата", sum("checkout"), "формата за поръчка е на екрана", "co"],
    ["Попълват", sum("filling"), "пишат данните си", "fi"],
  ]
    .map(([t, n, sub, cls]) => `<div class="kpi ${cls}"><div class="kt">${cls === "on" ? `<span class="pulse" aria-hidden="true"></span>` : ""}${t}</div><div class="kn">${num(n)}</div><div class="ks">${esc(sub)}</div></div>`)
    .join("");

  const sessShop = data.sessions.filter((x) => !shopSel || x.shop === shopSel);
  // Channels for the chosen shop come from its sessions (orders by channel are for all shops).
  const chans = shopSel
    ? data.channels.map((c) => {
        const mine = sessShop.filter((x) => x.online && x.channel === c.id);
        return { ...c, now: mine.length, form: mine.filter((x) => x.stage === "checkout" || x.stage === "filling").length };
      })
    : data.channels;
  radar(chans, sessShop);
  channelTable(chans);
  feed(data.feed.filter((e) => !shopSel || e.shop === shopSel));

  $("shops").innerHTML = shops
    .map((s) => {
      const n = s.now;
      const t = s.today;
      const w = (x) => (n.online ? (x / n.online) * 100 : 0);
      return `<article class="lcard ${n.online ? "" : "quiet"}">
        <div class="row spread"><b>${esc(s.label)}</b><span class="lnum">${n.online ? `<span class="pulse" aria-hidden="true"></span>` : ""}${num(n.online)}</span></div>
        <div class="lbar" aria-hidden="true"><span class="b" style="width:${w(n.browsing)}%"></span><span class="c" style="width:${w(n.checkout)}%"></span><span class="f" style="width:${w(n.filling)}%"></span></div>
        <div class="lnow"><span><i class="d b"></i>${num(n.browsing)} разглеждат</span><span><i class="d c"></i>${num(n.checkout)} във формата</span><span><i class="d f"></i>${num(n.filling)} попълват</span></div>
        <div class="ltoday">Днес: <b>${num(t.people)}</b> души · ${num(t.checkout)} до формата · ${num(t.filling)} попълниха · <b>${num(t.orders)}</b> поръчки</div>
      </article>`;
    })
    .join("");

  const list = data.sessions.filter((x) => (!shopSel || x.shop === shopSel) && (!stageSel || x.stage === stageSel));
  $("sessCount").textContent = `${num(list.filter((x) => x.online).length)} онлайн · ${num(list.length)} общо`;
  $("table").innerHTML = list.length
    ? `<thead><tr><th>Посетител</th><th>Магазин</th><th>Локация</th><th>Устройство</th><th>Статус</th><th class="r">Продукти</th><th>Стойност</th><th>Страница</th><th>Последна активност</th></tr></thead><tbody>${list
        .map((x) => {
          const [label, cls] = STAGE[x.stage] || STAGE.browsing;
          return `<tr class="${x.online ? "" : "away"}">
          <td><span class="ldot ${x.online ? "on" : ""}" title="${x.online ? "онлайн" : "излезе"}"></span><code>${esc(x.visitor)}</code>${x.lead_name ? `<div class="sub">${esc(x.lead_name)}</div>` : ""}</td>
          <td>${esc(x.shop_label)}</td>
          <td>${x.country ? `<span class="cc">${esc(x.country)}</span> ${esc(COUNTRY[x.country] || x.country)}` : "–"}${x.city ? `<span class="muted">, ${esc(x.city)}</span>` : ""}<div class="sub">${esc(x.source || "")}</div></td>
          <td class="dev">${DEV[x.device] || "–"}</td>
          <td><span class="stagepill ${cls}">${label}</span>${x.reached !== x.stage && x.reached !== "browsing" ? `<div class="sub">стигна до: ${esc(STAGE[x.reached]?.[0] || "")}</div>` : ""}</td>
          <td class="r">${x.cart_lines || "–"}</td>
          <td>${esc(x.value || "–")}</td>
          <td class="pg" title="${esc(x.page)}">${esc(x.page || "/")}${x.pages > 1 ? `<div class="sub">${x.pages} страници</div>` : ""}</td>
          <td>${ago(x.last_at)}<div class="sub">на сайта ${ago(x.first_at)}</div></td>
        </tr>`;
        })
        .join("")}</tbody>`
    : `<tbody><tr><td class="empty">Няма посетители в последните ${$("minutes").value} минути.</td></tr></tbody>`;
}

async function load() {
  try {
    data = await api(`/api/live?min=${$("minutes").value}`);
    fetchedAt = Date.now();
    if ($("shop").options.length === 1) $("shop").insertAdjacentHTML("beforeend", data.shops.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join(""));
    render();
    $("liveBadge").classList.remove("stale");
  } catch (e) {
    $("liveBadge").classList.add("stale");
    $("updated").textContent = e.message;
  }
}
// Every 10 s while this tab is in front.
setInterval(() => document.visibilityState === "visible" && load(), 10000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
setInterval(() => {
  if (fetchedAt) $("updated").textContent = `на живо · преди ${Math.round((Date.now() - fetchedAt) / 1000)} с`;
}, 1000);
for (const id of ["shop", "stage"]) $(id).onchange = render;
$("minutes").onchange = load;
load();
