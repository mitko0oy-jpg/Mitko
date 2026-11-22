// Реклами и страници: откъде идват поръчките (канал, кампания, ад сет, реклама, лендинг) и колко от тях са взети.
import { api, esc, eur, num, periods, qs, rangeLabel, setQs, shell } from "./app.js";

const $ = (id) => document.getElementById(id);
await shell("reklami");

const P = periods();
const PERIODS = { d7: { label: "7 дни", from: addDaysISO(-6), to: P.today.to }, d30: P.d30, month: P.month, lastMonth: P.lastMonth, d90: { label: "90 дни", from: addDaysISO(-89), to: P.today.to } };
function addDaysISO(n) {
  const d = new Date(P.today.to + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const st = { period: PERIODS[qs().get("p")] ? qs().get("p") : "d30", shop: qs().get("shop") || "" };
const UTM = "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{ad.id}}";

const pctOf = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const retCls = (r) => (r.delivered + r.returned >= 3 && r.returned / (r.delivered + r.returned) >= 0.3 ? "err" : "");

/** orders · taken · sent back · on the way · money taken */
function cells(r) {
  const done = r.delivered + r.returned;
  return `<td class="r">${num(r.orders)}</td><td class="r">${num(r.delivered)}</td>
    <td class="r ${retCls(r)}">${num(r.returned)}${done ? ` <span class="muted small">(${pctOf(r.returned, done)})</span>` : ""}</td>
    <td class="r">${num(r.open)}</td><td class="r"><b>${eur(r.taken, true)}</b><div class="muted small">от ${eur(r.sum, true)}</div></td>`;
}
const HEAD = `<th class="r">Поръчки</th><th class="r">Взети</th><th class="r">Върнати</th><th class="r">На път</th><th class="r">Взети пари</th>`;

function render(d) {
  const L = d.labels;
  const name = (ch) => L[ch] || ch;
  const meta = d.channels.find((c) => c.channel === "meta");
  $("tiles").innerHTML = [
    [num(d.coverage.total), "Поръчки", rangeLabel(d.from, d.to)],
    [d.coverage.pct == null ? "–" : `${String(d.coverage.pct).replace(".", ",")}%`, "С известен източник", d.coverage.tracked ? `${num(d.coverage.known)} от ${num(d.coverage.tracked)} проследени поръчки · RevOrder смята ≥ 70% за добре` : "проследяването започва от 23.11.2026"],
    [num(d.coverage.withAd), "С известна реклама", d.coverage.withAd ? "кампания / реклама от utm параметрите" : "сложи параметрите долу в Meta"],
    [meta ? eur(meta.taken, true) : "–", "Взети пари от Meta", meta ? `${num(meta.delivered)} взети · ${num(meta.returned)} върнати` : "няма поръчки от Meta"],
  ]
    .map(([big, lbl, sub]) => `<div class="tile"><div class="lbl">${lbl}</div><div class="big">${big}</div><div class="sub">${esc(sub)}</div></div>`)
    .join("");

  $("channels").innerHTML = d.channels.length
    ? `<table class="tbl"><thead><tr><th>Канал</th>${HEAD}</tr></thead><tbody>${d.channels.map((r) => `<tr><td>${esc(name(r.channel))}</td>${cells(r)}</tr>`).join("")}</tbody></table>`
    : `<div class="muted">Няма поръчки за този период.</div>`;

  if (!d.ads.length) $("ads").innerHTML = `<div class="muted">Още няма поръчки с известна реклама за този период. Сложи параметрите от долното каре в рекламите в Meta.</div>`;
  else {
    // Campaign › ad set › ad, with the sums of each campaign.
    const camps = new Map();
    for (const r of d.ads) {
      const k = `${r.channel}\u0001${r.campaign}`;
      if (!camps.has(k)) camps.set(k, { channel: r.channel, campaign: r.campaign, rows: [], orders: 0, delivered: 0, returned: 0, open: 0, canceled: 0, sum: 0, taken: 0 });
      const c = camps.get(k);
      c.rows.push(r);
      for (const f of ["orders", "delivered", "returned", "open", "canceled", "sum", "taken"]) c[f] += r[f];
    }
    $("ads").innerHTML = `<table class="tbl"><thead><tr><th>Кампания › ад сет › реклама</th>${HEAD}</tr></thead><tbody>${[...camps.values()]
      .sort((a, b) => b.taken - a.taken || b.orders - a.orders)
      .map(
        (c) =>
          `<tr><td><b>${esc(c.campaign || "(без кампания)")}</b> <span class="muted small">${esc(name(c.channel))}</span></td>${cells(c)}</tr>` +
          c.rows
            .map((r) => `<tr><td style="padding-left:22px" class="small">${esc(r.adset || "–")} › <b>${esc(r.ad || "–")}</b>${r.ad_id ? ` <span class="muted">#${esc(r.ad_id)}</span>` : ""}</td>${cells(r)}</tr>`)
            .join(""),
      )
      .join("")}</tbody></table>`;
  }

  const rows = d.pages.map((p) => {
    const o = p.orders;
    const ch = Object.entries(p.by_channel || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${esc(name(k))} ${num(n)}`)
      .join(" · ");
    return `<tr><td><b>${esc(p.landing)}</b><div class="muted small">${esc(p.shop)}${ch ? ` · ${ch}` : ""}</div></td>
      <td class="r">${num(p.people)}</td><td class="r">${num(p.checkout)} <span class="muted small">${pctOf(p.checkout, p.visits)}</span></td>
      <td class="r">${num(p.filling)}</td><td class="r">${num(p.ordered)} <span class="muted small">${pctOf(p.ordered, p.visits)}</span></td>
      ${o ? `<td class="r">${num(o.orders)}</td><td class="r">${num(o.delivered)} / <span class="${retCls(o)}">${num(o.returned)}</span></td><td class="r">${eur(o.taken, true)}</td>` : `<td class="r muted">–</td><td class="r muted">–</td><td class="r muted">–</td>`}</tr>`;
  });
  $("pages").innerHTML = rows.length
    ? `<table class="tbl"><thead><tr><th>Страница</th><th class="r">Хора</th><th class="r">До формата</th><th class="r">Писали</th><th class="r">Поръчали</th><th class="r">Поръчки</th><th class="r">Взети / върнати</th><th class="r">Взети пари</th></tr></thead><tbody>${rows.join("")}</tbody></table>
       <p class="muted small" style="margin:6px 0 0">„Поръчали“ е по страницата „Благодарим“; „Поръчки“ са поръчките, вързани с формата на тази страница. Посещенията се събират от 23.11.2026 нататък.</p>`
    : `<div class="muted">Още няма събрани посещения за този период (започват от 23.11.2026).</div>`;
}

async function load() {
  const p = PERIODS[st.period];
  setQs({ p: st.period === "d30" ? "" : st.period, shop: st.shop });
  $("period").innerHTML = Object.entries(PERIODS)
    .map(([k, v]) => `<button type="button" data-k="${k}" class="${k === st.period ? "on" : ""}">${esc(v.label)}</button>`)
    .join("");
  $("period").querySelectorAll("button").forEach((b) => (b.onclick = () => ((st.period = b.dataset.k), load())));
  try {
    render(await api(`/api/reklami?from=${p.from}&to=${p.to}${st.shop ? `&shop=${encodeURIComponent(st.shop)}` : ""}`));
  } catch (e) {
    $("channels").innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

$("utmLine").value = UTM;
$("copyUtm").onclick = async () => {
  try {
    await navigator.clipboard.writeText(UTM);
    $("copyUtm").textContent = "Копирано ✓";
  } catch {
    $("utmLine").select();
  }
};
$("shop").onchange = () => ((st.shop = $("shop").value), load());
api("/api/settings")
  .then((s) => {
    $("shop").innerHTML = `<option value="">Всички магазини</option>` + s.shops.filter((x) => x.active).map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
    $("shop").value = st.shop;
  })
  .catch(() => {});
load();
