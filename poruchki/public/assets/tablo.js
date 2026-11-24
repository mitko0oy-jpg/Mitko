import { ago, api, eur0, dayLabel, dayLong, esc, eur, num, pct, periods, qs, rangeLabel, setQs, shell, STAGE_ORDER, STAGES } from "./app.js";

const $ = (id) => document.getElementById(id);
const P = periods();
const state = {
  region: qs().get("region") || "",
  from: qs().get("from") || P.month.from,
  to: qs().get("to") || P.month.to,
  shop: qs().get("shop") || "",
};
let last = null;

await shell("tablo");

// ---------- controls ----------
function markRegion() {
  for (const b of $("region").querySelectorAll("button")) b.classList.toggle("on", b.dataset.v === state.region);
}
$("region").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.region = b.dataset.v;
  markRegion();
  loadAll();
};

const PRESETS = ["today", "yesterday", "week", "lastWeek", "month", "lastMonth", "d30"];
$("presets").innerHTML = PRESETS.map((k) => `<button data-k="${k}">${P[k].label}</button>`).join("");
$("presets").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  setPeriod(P[b.dataset.k].from, P[b.dataset.k].to);
};
function setPeriod(from, to) {
  state.from = from;
  state.to = to;
  loadPeriod();
}
$("from").onchange = () => $("from").value && setPeriod($("from").value, $("to").value < $("from").value ? $("from").value : $("to").value);
$("to").onchange = () => $("to").value && setPeriod($("from").value > $("to").value ? $("to").value : $("from").value, $("to").value);
$("shop").onchange = () => {
  state.shop = $("shop").value;
  loadPeriod();
};
$("daysToggle").onclick = () => {
  const t = $("daysTable");
  t.hidden = !t.hidden;
  $("chart").hidden = !t.hidden;
  $("daysToggle").textContent = t.hidden ? "Покажи като таблица" : "Покажи като графика";
};
$("refresh").onclick = async () => {
  const b = $("refresh");
  b.disabled = true;
  b.textContent = "Обновявам…";
  try {
    await api("/api/settings/sync", { method: "POST", body: {} });
    await api("/api/settings/track", { method: "POST", body: {} }).catch(() => null);
  } catch (e) {
    alert(e.message);
  }
  b.disabled = false;
  b.textContent = "Обнови сега";
  loadAll();
};

// ---------- quick tiles ----------
async function loadTiles() {
  const s = await api(`/api/stats/summary?region=${state.region}`);
  $("synced").textContent = `Обновено ${ago(s.syncedAt)}`;
  // New orders of the period, and what happened in it: parcels the customers took (whenever ordered), sent, sent back.
  const tile = (k, label) => {
    const p = s.periods[k];
    const h = p.happened || { got: { n: 0, sum: 0 }, back: { n: 0, sum: 0 }, sent: 0 };
    return `<button class="tile" data-from="${p.from}" data-to="${p.to}">
      <div class="lbl">${label}</div>
      <div class="big">${num(p.orders)} ${p.orders === 1 ? "поръчка" : "поръчки"}</div>
      <div class="sub">за <b>${eur(p.sum)}</b>${p.canceled ? ` · отказани ${num(p.canceled)}` : ""}</div>
      <div class="sub got" title="Пратки, които клиентите са взели (платили) в този период – без значение кога е направена поръчката">получени <b>${num(h.got.n)}</b> за <b>${eur(h.got.sum)}</b></div>
      <div class="sub">изпратени ${num(h.sent)}${h.back.n ? ` · <span class="back">върнати ${num(h.back.n)} (${eur(h.back.sum)})</span>` : " · върнати 0"}</div>
    </button>`;
  };
  $("tiles").innerHTML = tile("today", "Днес") + tile("yesterday", "Вчера") + tile("week", "Тази седмица") + tile("month", "Този месец");
  $("tiles").onclick = (e) => {
    const t = e.target.closest(".tile");
    if (t) setPeriod(t.dataset.from, t.dataset.to);
  };
}

// ---------- the chosen period ----------
async function loadPeriod() {
  setQs({ region: state.region, from: state.from, to: state.to, shop: state.shop });
  $("from").value = state.from;
  $("to").value = state.to;
  for (const b of $("presets").querySelectorAll("button")) b.classList.toggle("on", P[b.dataset.k].from === state.from && P[b.dataset.k].to === state.to);
  $("rangeText").textContent = rangeLabel(state.from, state.to);
  document.getElementById("app").classList.add("loading");
  try {
    const d = await api(`/api/stats?from=${state.from}&to=${state.to}&region=${state.region}&shop=${encodeURIComponent(state.shop)}`);
    last = d;
    renderHeads(d);
    renderStages(d);
    renderDays(d);
    renderShops(d);
    renderProducts(d);
  } catch (e) {
    $("heads").innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally {
    document.getElementById("app").classList.remove("loading");
  }
}

function renderHeads(d) {
  const st = d.stages;
  const open = st.new.n + st.prepared.n + st.shipped.n + st.at_office.n;
  $("heads").innerHTML = `
    <div class="head"><div class="lbl">Поръчки</div><div class="big">${num(d.orders)}</div><div class="sub">за ${eur(d.sum)}</div></div>
    <div class="head"><div class="lbl">Взети (оборот)</div><div class="big">${eur(st.delivered.sum)}</div><div class="sub">${num(st.delivered.n)} поръчки</div></div>
    <div class="head"><div class="lbl">Още не са приключили</div><div class="big">${eur(st.new.sum + st.prepared.sum + st.shipped.sum + st.at_office.sum)}</div><div class="sub">${num(open)} поръчки</div></div>
    <div class="head"><div class="lbl">Взети от приключилите</div><div class="big">${pct(d.takenRate)}</div><div class="sub">върнати ${num(st.returned.n)}${d.refused ? `, от тях отказани на място ${num(d.refused)}` : ""}</div></div>
    ${d.happened ? `<div class="happened" title="Горе са поръчките, направени в периода. Тук е какво се случи в самия период, без значение кога е поръчано.">
      <span><b>В периода:</b></span>
      <span class="got">получени <b>${num(d.happened.got.n)}</b> пратки за <b>${eur(d.happened.got.sum)}</b></span>
      <span>изпратени <b>${num(d.happened.sent)}</b></span>
      <span class="back">върнати <b>${num(d.happened.back.n)}</b> за ${eur(d.happened.back.sum)}</span></div>` : ""}`;
}

function renderStages(d) {
  // Abandoned carts are not orders: not on the dashboard.
  const ORDER = STAGE_ORDER.filter((k) => d.stages[k]);
  const max = Math.max(1, ...ORDER.map((k) => d.stages[k].n));
  const link = (k) => `/poruchki/?stage=${k}&from=${state.from}&to=${state.to}${state.region ? `&region=${state.region}` : ""}${state.shop ? `&shop=${encodeURIComponent(state.shop)}` : ""}`;
  $("stages").innerHTML = ORDER.filter((k) => k !== "archived" || d.stages[k].n)
    .map((k) => {
      const c = d.stages[k];
      const share = d.orders ? Math.round((c.n / d.orders) * 100) : 0;
      return `<a class="stage" href="${link(k)}">
        <span class="name">${STAGES[k].label}<small>${STAGES[k].hint}</small></span>
        <span class="track" aria-hidden="true"><span class="fill" style="width:${c.n ? Math.max(1, (c.n / max) * 100) : 0}%"></span></span>
        <span class="n" title="${share}% от поръчките">${num(c.n)}</span>
        <span class="s">${eur(c.sum)}</span>
      </a>`;
    })
    .join("");
}

// ---------- chart: one series, sum of orders per day ----------
function niceMax(v) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function renderDays(d) {
  const days = d.days;
  $("daysCard").hidden = days.length < 2;
  if (days.length < 2) return;
  // table view
  // Left: the orders made that day and what became of them. Right: what happened on the day itself.
  $("daysTable").innerHTML = `<table class="tbl"><thead><tr><th>Ден</th><th class="r">Поръчки</th><th class="r">Сума</th><th class="r" title="от поръчките на този ден">Взети</th><th class="r" title="от поръчките на този ден">Върнати</th><th class="r">Отказани</th>
      <th class="r got" title="пратки, взети от клиентите в този ден">Получени в деня</th><th class="r" title="пратки, предадени на куриер в този ден">Изпратени</th><th class="r" title="пратки, върнати в този ден">Върнати в деня</th></tr></thead><tbody>
    ${[...days]
      .reverse()
      .map((x) => {
        const h = x.happened || { got: { n: 0, sum: 0 }, back: { n: 0, sum: 0 }, sent: 0 };
        return `<tr><td>${dayLong(x.day)}</td><td class="r">${num(x.orders)}</td><td class="r">${eur(x.sum)}</td><td class="r">${num(x.stages.delivered.n)}</td><td class="r">${num(x.stages.returned.n)}</td><td class="r">${num(x.stages.canceled.n)}</td>
          <td class="r got"><b>${eur(h.got.sum)}</b><div class="muted small">${num(h.got.n)}</div></td><td class="r">${num(h.sent)}</td><td class="r">${num(h.back.n)}</td></tr>`;
      })
      .join("")}
  </tbody></table>`;
  drawChart(days);
}

function drawChart(days) {
  const box = $("chart");
  const W = Math.max(300, box.clientWidth || 600);
  const H = 220;
  const m = { l: 52, r: 4, t: 10, b: 26 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const top = niceMax(Math.max(...days.map((x) => x.sum)));
  const step = iw / days.length;
  const gap = Math.max(2, Math.min(8, step * 0.25));
  const bw = Math.max(2, step - gap);
  const y = (v) => m.t + ih - (v / top) * ih;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(46 / step);
  const today = days[days.length - 1].day;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Сума на поръчките по дни">`;
  svg += `<g class="grid">${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>`;
  svg += `<g class="axis">${ticks.map((t) => `<text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${eur0(t)}</text>`).join("")}`;
  days.forEach((x, i) => {
    if ((days.length - 1 - i) % labelEvery === 0) svg += `<text x="${m.l + i * step + step / 2}" y="${H - 8}" text-anchor="middle">${dayLabel(x.day)}</text>`;
  });
  svg += `</g><g>`;
  days.forEach((x, i) => {
    const bx = m.l + i * step + gap / 2;
    const h = Math.max(0, (x.sum / top) * ih);
    const r = Math.min(4, bw / 2, h);
    const by = m.t + ih - h;
    // rounded data end, square at the baseline
    const path = h > 0 ? `M${bx},${m.t + ih}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${m.t + ih}Z` : "";
    svg += `<rect class="hit" data-i="${i}" x="${m.l + i * step}" y="${m.t}" width="${step}" height="${ih}"/>`;
    svg += path ? `<path class="bar${x.day === today && state.to === today ? " dim" : ""}" data-i="${i}" d="${path}"/>` : "";
  });
  svg += `</g></svg><div class="tip" hidden></div>`;
  box.innerHTML = svg;
  const tip = box.querySelector(".tip");
  const bars = box.querySelectorAll(".bar");
  const show = (i, ev) => {
    const x = days[i];
    const st = x.stages;
    tip.innerHTML = `<div class="t">${dayLong(x.day)}${x.day === today && state.to === today ? " · денят не е свършил" : ""}</div>
      ${num(x.orders)} поръчки за <b>${eur(x.sum)}</b><br>
      взети ${num(st.delivered.n)} · върнати ${num(st.returned.n)} · отказани ${num(st.canceled.n)}<br>
      <span class="muted">още в процес ${num(st.new.n + st.prepared.n + st.shipped.n + st.at_office.n)}</span>`;
    tip.hidden = false;
    const rect = box.getBoundingClientRect();
    const cx = m.l + i * step + step / 2;
    const left = Math.min(Math.max(0, cx - tip.offsetWidth / 2), rect.width - tip.offsetWidth);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, y(x.sum) - tip.offsetHeight - 10)}px`;
    bars.forEach((b) => b.classList.toggle("hl", Number(b.dataset.i) === i));
  };
  box.querySelectorAll(".hit").forEach((h) => {
    h.addEventListener("pointerenter", (e) => show(Number(h.dataset.i), e));
    h.addEventListener("click", () => {
      const x = days[Number(h.dataset.i)];
      setPeriod(x.day, x.day);
    });
  });
  box.querySelector("svg").addEventListener("pointerleave", () => {
    tip.hidden = true;
    bars.forEach((b) => b.classList.remove("hl"));
  });
}
let resizeT;
addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => last && last.days.length > 1 && drawChart(last.days), 150);
});

function renderShops(d) {
  if (!d.shops.length) {
    $("shops").innerHTML = `<div class="empty">Няма поръчки за този период.</div>`;
    return;
  }
  $("shops").innerHTML = `<table class="tbl"><thead><tr>
      <th>Магазин</th><th class="r">Поръчки</th><th class="r">Сума</th><th class="r">Взети</th><th class="r hide-sm">В процес</th><th class="r">Върнати</th><th class="r hide-sm">Отказани</th><th class="r">% взети</th>
    </tr></thead><tbody>
    ${d.shops
      .map((s) => {
        const st = s.stages;
        return `<tr class="click" data-shop="${esc(s.id)}">
          <td>${esc(s.label)}${s.region === "abroad" ? ` <span class="muted small">чужбина</span>` : ""}</td>
          <td class="r">${num(s.orders)}</td><td class="r">${eur(s.sum)}</td>
          <td class="r">${eur(st.delivered.sum)}<div class="muted small">${num(st.delivered.n)}</div></td>
          <td class="r hide-sm">${num(st.new.n + st.prepared.n + st.shipped.n + st.at_office.n)}</td>
          <td class="r">${num(st.returned.n)}</td><td class="r hide-sm">${num(st.canceled.n)}</td>
          <td class="r">${pct(s.takenRate)}</td></tr>`;
      })
      .join("")}
    </tbody></table>`;
  $("shops").querySelectorAll("tr.click").forEach((tr) => {
    tr.onclick = () => {
      state.shop = tr.dataset.shop;
      $("shop").value = state.shop;
      loadPeriod();
      scrollTo({ top: 0, behavior: "smooth" });
    };
  });
}

function renderProducts(d) {
  if (!d.products.length) {
    $("products").innerHTML = `<div class="empty">Няма продадени продукти за този период.</div>`;
    return;
  }
  $("products").innerHTML = `<table class="tbl"><thead><tr><th>Продукт</th><th class="r">Бройки</th><th class="r">Сума</th></tr></thead><tbody>
    ${d.products.map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${num(p.qty)}</td><td class="r">${eur(p.sum)}</td></tr>`).join("")}
  </tbody></table><p class="muted small">Без отказаните поръчки. Подаръците са с нулева сума.</p>`;
}

async function loadShopsList() {
  try {
    const s = await api("/api/settings");
    $("shop").innerHTML = `<option value="">Всички магазини</option>` + s.shops.filter((x) => x.active).map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
    $("shop").value = state.shop;
  } catch {
    /* the list is optional */
  }
}

function loadAll() {
  setQs({ region: state.region });
  loadTiles().catch((e) => ($("tiles").innerHTML = `<div class="err">${esc(e.message)}</div>`));
  loadPeriod();
}

markRegion();
await loadShopsList();
loadAll();
