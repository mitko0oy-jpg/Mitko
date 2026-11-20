// Сега в сайтовете: who is on the shop pages right now (from the c.js signs of life), refreshed every 10 s.
import { api, esc, num, shell } from "./app.js";

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
const CH_COLOR = { meta: "#e8457c", google_ads: "#2fb35a", tiktok: "#18c7c1", search: "#9aa3b2", email: "#5b7cfa", sms: "#22b8d6", viber: "#8b5cf6", calls: "#f2b233", other: "#c9824f", direct: "#6b7280", unknown: "#4b5563" };
const KIND = { came: "влезе", checkout: "стигна до формата", filling: "попълва формата", ordered: "поръча" };
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};
const hhmm = (iso) => new Date(iso).toLocaleTimeString("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit" });
const place = (x) => x.city || COUNTRY[x.country] || x.country || "Някой";
const eur2 = (n) => `${(Number(n) || 0).toFixed(2).replace(".", ",")} €`;

/** The circle: one slice per channel, each person online is a dot – outer ring browsing, then the form, then typing. */
function radar(channels, sessions) {
  const list = channels.filter((c) => c.id !== "unknown");
  const R = 200;
  const n = list.length;
  const span = (Math.PI * 2) / n;
  const pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  const arc = (a0, a1, r) => {
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const online = sessions.filter((x) => x.online);
  let out = `<defs><radialGradient id="rg" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(${R})"><stop offset="0" style="stop-color:var(--surface-2)"/><stop offset="1" style="stop-color:var(--surface)"/></radialGradient></defs>
    <circle r="${R}" fill="url(#rg)" style="stroke:var(--line)"/>`;
  list.forEach((c, i) => {
    const a0 = -Math.PI / 2 + i * span;
    const a1 = a0 + span;
    const col = CH_COLOR[c.id] || "#888";
    const heat = Math.min(0.42, (c.now ? 0.1 : 0.03) + c.now * 0.05);
    const [x0, y0] = pt(a0, R);
    out += `<g class="slice" data-ch="${c.id}">
      <path d="M 0 0 L ${x0.toFixed(1)} ${y0.toFixed(1)} ${arc(a0, a1, R).replace(/^M [^A]+/, "")} Z" fill="${col}" fill-opacity="${heat}" style="stroke:var(--line)" stroke-opacity=".6"/>
      <path d="${arc(a0 + 0.04, a1 - 0.04, R + 12)}" fill="none" stroke="${col}" stroke-width="${c.now ? 7 : 4}" stroke-linecap="round" stroke-opacity="${c.now || c.orders ? 1 : 0.45}"/>`;
    const am = a0 + span / 2;
    const [lx, ly] = pt(am, R + 40);
    const anchor = Math.abs(Math.cos(am)) < 0.25 ? "middle" : Math.cos(am) > 0 ? "start" : "end";
    out += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" class="rlab" fill="${col}">${esc(c.label)}${c.now ? ` · ${c.now}` : ""}</text></g>`;
  });
  for (const [r, cls] of [[0.8, "r1"], [0.56, "r2"], [0.34, "r3"]]) out += `<circle r="${R * r}" class="ring ${cls}" fill="none"/>`;
  // The people online.
  for (const x of online) {
    const i = Math.max(0, list.findIndex((c) => c.id === x.channel));
    const a = -Math.PI / 2 + i * span + span * (0.14 + 0.72 * hash(x.sid));
    const base = x.stage === "filling" || x.stage === "ordered" ? 0.34 : x.stage === "checkout" ? 0.56 : 0.8;
    const r = R * (base + (hash(x.sid + "r") - 0.5) * 0.12);
    const [cx, cy] = pt(a, r);
    out += `<circle class="pdot ${x.stage}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${x.stage === "browsing" ? 6 : 8}" fill="${CH_COLOR[x.channel] || "#888"}"><title>${esc(`${place(x)} · ${x.shop_label} · ${STAGE[x.stage]?.[0] || ""}`)}</title></circle>`;
  }
  out += `<circle r="${R * 0.25}" class="rcenter"/><text y="5" text-anchor="middle" class="rnum">${online.length}</text><text y="25" text-anchor="middle" class="rsub">на сайтовете</text>`;
  $("radar").innerHTML = out;
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
