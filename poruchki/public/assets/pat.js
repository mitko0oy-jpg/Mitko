// Път на клиента: откъде идват поръчките – платени реклами или не, първото и последното посещение, пътищата,
// по сайтове, кога идват поръчките, страниците (с Microsoft Clarity, ако сайтът е свързан) и кратки изводи.
import { api, dayLabel, esc, eur, num, periods, qs, rangeLabel, setQs, shell } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("pat");

const P = periods();
const addDaysISO = (n) => {
  const d = new Date(P.today.to + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const PERIODS = { d7: { label: "7 дни", from: addDaysISO(-6), to: P.today.to }, d30: P.d30, month: P.month, lastMonth: P.lastMonth, d90: { label: "90 дни", from: addDaysISO(-89), to: P.today.to } };
const st = { period: PERIODS[qs().get("p")] ? qs().get("p") : "d30", shop: qs().get("shop") || "" };

const COLOR = {
  meta_ads: "#e8457c", meta_org: "#f3a0bf", google_ads: "#2fb35a", search: "#8fd19e", tiktok_ads: "#18c7c1", tiktok_org: "#93e4e1",
  email: "#5b7cfa", sms: "#22b8d6", viber: "#8b5cf6", calls: "#f2b233", other: "#c9824f", direct: "#6b7280",
  unknown: "#c3c8d0", manual: "#c3c8d0", pending: "#dde1e6", before: "#e7e9ec",
};
const GCOLOR = { paid: "#e8457c", organic: "#2fb35a", own: "#5b7cfa", calls: "#f2b233", unknown: "#c3c8d0" };
const DOW = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"];

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const pctS = (a, b) => (b ? `${pct(a, b)}%` : "–");
const retPct = (m) => (m.delivered + m.returned ? Math.round((m.returned / (m.delivered + m.returned)) * 100) : null);
const dec = (n, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ",");
const dur = (days) => (days == null ? "–" : days < 1 / 24 ? `${Math.max(1, Math.round(days * 1440))} мин` : days < 1 ? `${dec(days * 24)} ч` : `${dec(days)} дни`);

let D = null;
const label = (id) => (D.fine.find((f) => f.id === id) || {}).label || id;
const glabel = (id) => (D.groups.find((g) => g.id === id) || {}).label || id;
const chip = (id) => `<span class="pt-chip" style="--c:${COLOR[id] || "#999"}">${esc(label(id))}</span>`;
const dot = (c) => `<i class="pt-dot" style="background:${c}"></i>`;

/** A horizontal stacked bar: [[key, value, colour, title]] */
const stack = (parts) => {
  const all = parts.reduce((a, p) => a + p[1], 0);
  if (!all) return `<div class="pt-stack empty"></div>`;
  return `<div class="pt-stack">${parts
    .filter((p) => p[1] > 0)
    .map(([k, v, c, t]) => `<span style="width:${(v / all) * 100}%;background:${c}" title="${esc(`${t}: ${num(v)} (${pctS(v, all)})`)}"></span>`)
    .join("")}</div>`;
};
/** Bars in a column: [[label, value, sub]] */
const bars = (rows, color = "var(--accent)") => {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return `<div class="pt-bars">${rows
    .map(([l, v, sub]) => `<div class="pt-bar"><span class="l">${esc(l)}</span><span class="t"><span class="f" style="width:${(v / max) * 100}%;background:${color}"></span></span><span class="n">${num(v)}${sub ? ` <span class="muted small">${esc(sub)}</span>` : ""}</span></div>`)
    .join("")}</div>`;
};

function insights(d) {
  const out = [];
  const tot = d.total.orders;
  if (!tot) return out;
  const g = Object.fromEntries(d.byGroup.map((r) => [r.group, r]));
  const paid = g.paid?.orders || 0;
  const organic = g.organic?.orders || 0;
  const known = tot - (g.unknown?.orders || 0);
  if (known >= 5) {
    const metaAds = d.channels.find((c) => c.id === "meta_ads")?.last.orders || 0;
    out.push(`<b>${pctS(paid, known)}</b> от поръчките с известен източник идват от платени реклами${metaAds ? ` (Meta: ${num(metaAds)})` : ""}, а <b>${pctS(organic, known)}</b> – без реклама.`);
  }
  const rp = g.paid && retPct(g.paid);
  const ro = g.organic && retPct(g.organic);
  if (rp != null && ro != null && g.paid.delivered + g.paid.returned >= 8 && g.organic.delivered + g.organic.returned >= 8 && Math.abs(rp - ro) >= 8)
    out.push(
      rp > ro
        ? `Поръчките от реклама се връщат по-често (<b>${rp}%</b> срещу ${ro}% без реклама). Струва си да провериш дали рекламата не обещава повече от продукта и да потвърждаваш тези поръчки по телефона.`
        : `Поръчките без реклама се връщат по-често (<b>${ro}%</b> срещу ${rp}% от реклама).`,
    );
  // The biggest channel without an ad.
  const org = d.channels.filter((c) => ["meta_org", "search", "other", "tiktok_org"].includes(c.id) && c.last.orders > 0).sort((a, b) => b.last.orders - a.last.orders)[0];
  if (org && org.last.orders >= 3) {
    const why = {
      meta_org: "постове, групи, Messenger или реклами без UTM параметри – ако са постове, най-добрите може да се пуснат като реклама",
      search: "хората търсят марката или продукта в Google – струва си да се пробва и реклама в Google по тези думи",
      other: "линкове от други сайтове – виж в таблицата с пътищата кои",
      tiktok_org: "видеа в TikTok без реклама",
    }[org.id];
    out.push(`Без реклама най-много поръчки идват от <b>${esc(label(org.id))}</b> (${num(org.last.orders)}) – ${why}.`);
  }
  const direct = d.channels.find((c) => c.id === "direct");
  if (direct && direct.last.orders >= 3 && pct(direct.last.orders, tot) >= 15)
    out.push(`<b>${pctS(direct.last.orders, tot)}</b> са „Директно“ – най-често хора, които се връщат сами, след като са видели продукта по-рано. Пътят на клиента показва откъде са дошли първия път.`);
  // Channels that bring people first more than they close.
  if (d.coverage.withTrail >= 8) {
    for (const c of d.channels) {
      if (c.first.orders >= 3 && c.first.orders >= c.last.orders * 1.3 + 1)
        out.push(`<b>${esc(label(c.id))}</b> води хора за пръв път (${num(c.first.orders)} поръчки), но поръчват по-късно през друг канал (последно оттук: ${num(c.last.orders)}). Отчетът в рекламния профил показва по-малко, отколкото каналът реално носи.`);
    }
    if (d.medianDays != null)
      out.push(
        d.medianDays < 1
          ? `Половината поръчват до <b>${dur(d.medianDays)}</b> от първото влизане – решават бързо, затова първото впечатление (рекламата и страницата) е най-важно.`
          : `Половината поръчват до <b>${dur(d.medianDays)}</b> от първото влизане – напомнящи реклами (ретаргетинг) към посетилите сайта през последните ${Math.max(3, Math.ceil(d.medianDays * 2))} дни имат смисъл.`,
      );
    const many = d.touches.filter((t) => t.n !== "1").reduce((a, t) => a + t.orders, 0);
    if (many >= 3) out.push(`<b>${pctS(many, d.coverage.withTrail)}</b> от проследените поръчки са след повече от едно посещение.`);
  }
  // Hours and days.
  if (tot >= 20) {
    const top = d.hours.map((h, i) => [i, h.orders]).sort((a, b) => b[1] - a[1]).slice(0, 3).sort((a, b) => a[0] - b[0]);
    out.push(`Най-много поръчки идват около <b>${top.map(([h]) => `${h}–${h + 1} ч`).join(", ")}</b> – тогава хората са най-склонни да поръчат.`);
    const wd = d.weekdays.map((x, i) => [i, x.orders]).sort((a, b) => b[1] - a[1]);
    if (wd[0][1] >= wd[6][1] * 1.4) out.push(`Най-силен ден е <b>${DOW[wd[0][0]]}</b> (${num(wd[0][1])}), най-слаб – ${DOW[wd[6][0]]} (${num(wd[6][1])}).`);
  }
  // Shops: orders per 100 people.
  const conv = d.shops.filter((s) => s.people && s.people.people >= 100).map((s) => [s, (s.orders / s.people.people) * 100]);
  if (conv.length >= 2) {
    conv.sort((a, b) => b[1] - a[1]);
    const [best, worst] = [conv[0], conv[conv.length - 1]];
    if (best[1] >= worst[1] * 1.5) out.push(`Най-добре превръща посетителите в поръчки <b>${esc(best[0].label)}</b> (${dec(best[1])} на 100 души), най-слабо – ${esc(worst[0].label)} (${dec(worst[1])}).`);
  }
  // Pages with Clarity: many sessions, people do not get far down.
  const weak = d.landings.filter((l) => l.clarity && l.clarity.sessions >= 100 && l.clarity.scroll != null && l.clarity.scroll < 45);
  for (const l of weak.slice(0, 2)) out.push(`На <b>${esc(l.page)}</b> хората превъртат средно до ${dec(l.clarity.scroll, 0)}% от страницата – формата и цената може да са твърде ниско.`);
  return out;
}

function render(d) {
  D = d;
  const t = d.total;
  const g = Object.fromEntries(d.byGroup.map((r) => [r.group, r]));
  const known = t.orders - (g.unknown?.orders || 0);
  $("note").innerHTML = d.coverage.withTrail
    ? `${rangeLabel(d.from, d.to)} · пътят е известен за ${num(d.coverage.withTrail)} от ${num(t.orders)} поръчки (събира се от 24.11.2026; по-старите показват само последното посещение)`
    : `${rangeLabel(d.from, d.to)} · пътят на клиента се събира от 24.11.2026 – засега се вижда последното посещение преди поръчката`;
  $("tiles").innerHTML = [
    [num(t.orders), "Поръчки", `взети ${num(t.delivered)} · върнати ${num(t.returned)} · ${eur(t.taken, true)}`],
    [pctS(g.paid?.orders || 0, known), "От платени реклами", g.paid ? `${num(g.paid.orders)} поръчки · ${eur(g.paid.taken, true)} взети` : "няма"],
    [pctS(g.organic?.orders || 0, known), "Без реклама", g.organic ? `${num(g.organic.orders)} · постове, търсачки, директно` : "няма"],
    [d.avgTouches == null ? "–" : dec(d.avgTouches), "Посещения до поръчка", d.medianDays == null ? "още се събира" : `половината поръчват до ${dur(d.medianDays)}`],
  ]
    .map(([big, lbl, sub]) => `<div class="tile"><div class="lbl">${lbl}</div><div class="big">${big}</div><div class="sub">${esc(sub)}</div></div>`)
    .join("");

  const ins = insights(d);
  $("insights").innerHTML = ins.length ? ins.map((x) => `<li>${x}</li>`).join("") : `<li class="muted">Още малко данни за изводи – след няколко дни ще се появят тук.</li>`;

  // Paid / not paid.
  $("groups").innerHTML = d.byGroup.length
    ? stack(d.byGroup.map((r) => [r.group, r.orders, GCOLOR[r.group], glabel(r.group)])) +
      `<table class="tbl pt-tbl"><thead><tr><th></th><th class="r">Поръчки</th><th class="r">Дял</th><th class="r">Взети</th><th class="r">Върнати</th><th class="r">Взети пари</th></tr></thead><tbody>${d.groups
        .map((gr) => g[gr.id] && [gr, g[gr.id]])
        .filter(Boolean)
        .map(([gr, m]) => {
          const inner = d.channels.filter((c) => d.fine.find((f) => f.id === c.id)?.group === gr.id && c.last.orders).map((c) => `${esc(label(c.id))} ${num(c.last.orders)}`).join(" · ");
          return `<tr><td>${dot(GCOLOR[gr.id])}<b>${esc(gr.label)}</b>${inner ? `<div class="muted small">${inner}</div>` : ""}</td><td class="r">${num(m.orders)}</td><td class="r">${pctS(m.orders, t.orders)}</td><td class="r">${num(m.delivered)}</td><td class="r">${num(m.returned)}${retPct(m) != null ? ` <span class="muted small">(${retPct(m)}%)</span>` : ""}</td><td class="r"><b>${eur(m.taken, true)}</b></td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<div class="muted">Няма поръчки за този период.</div>`;

  // By shop.
  $("shops").innerHTML = d.shops.length
    ? `<table class="tbl pt-tbl"><thead><tr><th>Сайт</th><th class="r">Поръчки</th><th style="min-width:160px">Откъде</th><th class="r">Платени</th><th class="r">Без реклама</th><th class="r">Други</th><th class="r">Хора</th><th class="r">На 100 души</th><th class="r">Взети пари</th></tr></thead><tbody>${d.shops
        .map((s) => {
          const gg = (k) => s.groups[k]?.orders || 0;
          const other = gg("own") + gg("calls") + gg("unknown");
          const top = Object.entries(s.fine).sort((a, b) => b[1].orders - a[1].orders).slice(0, 3).map(([f, m]) => `${esc(label(f))} ${num(m.orders)}`).join(" · ");
          return `<tr data-shop="${esc(s.shop)}" class="pt-click"><td><b>${esc(s.label)}</b><div class="muted small">${top}</div></td><td class="r">${num(s.orders)}</td>
            <td>${stack(d.fine.filter((f) => s.fine[f.id]).map((f) => [f.id, s.fine[f.id].orders, COLOR[f.id] || "#999", f.label]))}</td>
            <td class="r">${num(gg("paid"))}</td><td class="r">${num(gg("organic"))}</td><td class="r">${num(other)}</td>
            <td class="r">${s.people ? num(s.people.people) : "–"}</td><td class="r">${s.people && s.people.people ? dec((s.orders / s.people.people) * 100) : "–"}</td>
            <td class="r"><b>${eur(s.taken, true)}</b></td></tr>`;
        })
        .join("")}</tbody></table><p class="muted small" style="margin:6px 0 0">„Хора“ = различни посетители на сайта за периода (от 23.11.2026). Клик върху сайт показва само него.</p>`
    : `<div class="muted">Няма поръчки за този период.</div>`;
  $("shops").querySelectorAll("tr[data-shop]").forEach((tr) => (tr.onclick = () => (($("shop").value = st.shop = tr.dataset.shop), load())));

  // Channels: first, last, assists.
  $("channels").innerHTML = d.channels.length
    ? `<table class="tbl pt-tbl"><thead><tr><th>Канал</th><th class="r">Първо посещение</th><th class="r">Поръчал от</th><th class="r">Помогнал</th><th class="r">Взети</th><th class="r">Върнати</th><th class="r">Взети пари</th></tr></thead><tbody>${d.channels
        .map((c) => {
          const m = c.last;
          const r = retPct(m);
          return `<tr><td>${dot(COLOR[c.id] || "#999")}${esc(label(c.id))}</td><td class="r">${num(c.first.orders)}</td><td class="r"><b>${num(m.orders)}</b></td><td class="r">${c.assists ? num(c.assists) : "–"}</td>
            <td class="r">${num(m.delivered)}</td><td class="r ${r != null && r >= 30 && m.delivered + m.returned >= 3 ? "err" : ""}">${num(m.returned)}${r != null ? ` <span class="muted small">(${r}%)</span>` : ""}</td><td class="r">${eur(m.taken, true)}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<div class="muted">Няма поръчки за този период.</div>`;

  // Paths.
  $("paths").innerHTML = d.paths.length
    ? `<div class="pt-paths">${d.paths
        .map((p) => {
          const parts = String(p.path).split(">");
          return `<div class="pt-path"><div class="pt-steps">${parts.map(chip).join(`<span class="pt-arr" aria-hidden="true">→</span>`)}<span class="pt-arr" aria-hidden="true">→</span><span class="pt-chip end">поръчка</span></div>
            <div class="pt-pn"><b>${num(p.orders)}</b> <span class="muted small">поръчки · ${num(p.delivered)} взети · ${eur(p.taken, true)}</span></div></div>`;
        })
        .join("")}</div>`
    : `<div class="muted">Пътищата започват да се събират от 24.11.2026 – щом има поръчки с проследен път, ще се появят тук.</div>`;

  $("touches").innerHTML = d.coverage.withTrail
    ? bars(d.touches.map((x) => [x.n === "1" ? "1 посещение" : `${x.n} посещения`, x.orders, x.orders ? pctS(x.orders, d.coverage.withTrail) : ""]))
    : `<div class="muted small">Още се събира.</div>`;
  $("speed").innerHTML = d.coverage.withTrail ? bars(d.speed.map((x) => [x.label, x.orders, x.orders ? pctS(x.orders, d.coverage.withTrail) : ""]), "#2fb35a") : `<div class="muted small">Още се събира.</div>`;

  // Hours and weekdays.
  const hmax = Math.max(1, ...d.hours.map((h) => h.orders));
  $("hours").innerHTML = `<div class="pt-hours">${d.hours
    .map((h, i) => `<div class="pt-h" title="${i}–${i + 1} ч: ${num(h.orders)} поръчки"><span style="height:${(h.orders / hmax) * 100}%"></span><i>${i % 3 === 0 ? i : ""}</i></div>`)
    .join("")}</div>`;
  $("weekdays").innerHTML = bars(d.weekdays.map((w, i) => [DOW[i], w.orders, w.orders ? eur(w.taken, true) : ""]), "#8b5cf6");

  // Pages.
  $("pagePaths").innerHTML = d.pagePaths.length
    ? `<div class="muted small" style="margin-bottom:4px">Най-чести поредици от страници преди поръчка</div>${bars(d.pagePaths.map((p) => [`${p.path}`, p.orders, p.shop_label]), "#5b7cfa")}`
    : "";
  const hasClarity = d.landings.some((l) => l.clarity);
  $("landings").innerHTML = d.landings.length
    ? `<table class="tbl pt-tbl"><thead><tr><th>Страница, от която поръчват</th><th class="r">Поръчки</th><th class="r">Взети / върнати</th><th class="r">Взети пари</th>${
        hasClarity ? `<th class="r" title="Сесии в Clarity за периода">Сесии</th><th class="r" title="Колко надолу превъртат средно">Превъртане</th><th class="r" title="Активно време на страницата">Време</th><th class="r" title="Сесии с ядосани кликове">Ядосани кл.</th><th class="r" title="Сесии с кликове, които не правят нищо">Мъртви кл.</th><th class="r" title="Сесии, в които се връщат веднага назад">Бързо назад</th>` : ""
      }</tr></thead><tbody>${d.landings
        .map((l) => {
          const c = l.clarity;
          const pc = (v) => (v == null ? "–" : `${dec(v, 0)}%`);
          return `<tr><td><b>${esc(l.page)}</b><div class="muted small">${esc(l.shop_label)}</div></td><td class="r">${num(l.orders)}</td><td class="r">${num(l.delivered)} / ${num(l.returned)}</td><td class="r">${eur(l.taken, true)}</td>${
            hasClarity ? (c ? `<td class="r">${num(c.sessions)}</td><td class="r">${pc(c.scroll)}</td><td class="r">${c.active == null ? "–" : `${dec(c.active, 0)} с`}</td><td class="r">${pc(c.rage)}</td><td class="r">${pc(c.dead)}</td><td class="r">${pc(c.quickback)}</td>` : `<td class="r muted" colspan="6">няма данни от Clarity</td>`) : ""
          }</tr>`;
        })
        .join("")}</tbody></table>`
    : `<div class="muted">Няма поръчки с известна страница за този период.</div>`;
}

async function clarity(list) {
  const admin = me?.role === "admin";
  if (!list) list = (await api("/api/pat/clarity")).shops;
  const n = list.filter((s) => s.connected).length;
  $("clarityHint").textContent = n ? `свързани: ${n} от ${list.length}` : "още няма свързани сайтове";
  $("clarity").innerHTML = `<table class="tbl pt-tbl"><thead><tr><th>Сайт</th><th>Състояние</th><th></th></tr></thead><tbody>${list
    .map((s) => {
      const state = s.connected
        ? s.last_error
          ? `<span class="err small">${esc(s.last_error)}</span>`
          : `<span class="ok small">свързан</span> <span class="muted small">· ${s.days ? `${num(s.days)} дни данни, последно за ${esc(dayLabel(s.last))}` : "чака първото теглене"}</span>`
        : `<span class="muted small">не е свързан</span>`;
      const tools = !admin
        ? ""
        : s.connected
          ? `<button class="btn sm" data-pull="${esc(s.id)}" type="button">Изтегли сега</button> <button class="btn sm" data-off="${esc(s.id)}" type="button">Махни</button>`
          : `<span class="row" style="gap:6px;flex-wrap:nowrap"><input type="password" autocomplete="off" placeholder="API ключ от Clarity" data-tok="${esc(s.id)}" style="min-width:220px"><button class="btn sm primary" data-on="${esc(s.id)}" type="button">Свържи</button></span>`;
      return `<tr><td><b>${esc(s.label)}</b></td><td>${state}</td><td class="r">${tools}</td></tr>`;
    })
    .join("")}</tbody></table>${admin ? "" : `<p class="muted small">Свързването е за собственика на фирмата.</p>`}`;
  const send = async (b, btn) => {
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const r = await api("/api/pat/clarity", { method: "POST", body: b });
      if (r.result?.error) alert(r.result.error);
      clarity(r.shops);
      load();
    } catch (e) {
      alert(e.message);
      clarity();
    }
  };
  $("clarity").querySelectorAll("[data-on]").forEach((b) => (b.onclick = () => send({ shop: b.dataset.on, token: $("clarity").querySelector(`[data-tok="${b.dataset.on}"]`).value }, b)));
  $("clarity").querySelectorAll("[data-pull]").forEach((b) => (b.onclick = () => send({ shop: b.dataset.pull }, b)));
  $("clarity").querySelectorAll("[data-off]").forEach((b) => (b.onclick = () => confirm("Да махна връзката с Clarity за този сайт? Събраните данни остават.") && send({ shop: b.dataset.off, remove: true }, b)));
}

async function load() {
  const p = PERIODS[st.period];
  setQs({ p: st.period === "d30" ? "" : st.period, shop: st.shop });
  $("period").innerHTML = Object.entries(PERIODS)
    .map(([k, v]) => `<button type="button" data-k="${k}" class="${k === st.period ? "on" : ""}">${esc(v.label)}</button>`)
    .join("");
  $("period").querySelectorAll("button").forEach((b) => (b.onclick = () => ((st.period = b.dataset.k), load())));
  try {
    render(await api(`/api/pat?from=${p.from}&to=${p.to}${st.shop ? `&shop=${encodeURIComponent(st.shop)}` : ""}`));
  } catch (e) {
    $("insights").innerHTML = `<li class="err">${esc(e.message)}</li>`;
  }
}

$("shop").onchange = () => ((st.shop = $("shop").value), load());
api("/api/settings")
  .then((s) => {
    $("shop").innerHTML = `<option value="">Всички магазини</option>` + s.shops.filter((x) => x.active).map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
    $("shop").value = st.shop;
  })
  .catch(() => {});
load();
clarity().catch(() => ($("clarityCard").hidden = true));
