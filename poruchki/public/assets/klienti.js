// Клиенти: всички, които са поръчвали (по телефон), колко са похарчили, колко са взели и върнали, риск, VIP и повторни.
import { api, esc, eur, num, ONE, qs, setQs, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
await shell("klienti");

const RISK = { high: ["Висок", "returned"], medium: ["Среден", "at_office"], low: ["Нисък", "delivered"] };
const st = { q: qs().get("q") || "", seg: qs().get("seg") || "", risk: qs().get("risk") || "", sort: qs().get("sort") || "last", page: Number(qs().get("page")) || 1 };
let data = null;
const open = new Set();

function tiles(s) {
  const share = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  $("tiles").innerHTML = [
    [num(s.customers), "Клиенти", `${num(s.once)} с една поръчка`],
    [num(s.repeat), "Повторни", `${share(s.repeat, s.customers)} от клиентите · ${share(s.spentRepeat, s.spent)} от парите`],
    [eur(s.perBuyer, true), "Средно на клиент", `от взетите пратки · ${String(s.ordersPerBuyer).replace(".", ",")} взети на клиент`],
    [num(s.vip), "VIP", `взели ≥ 2 и похарчили ≥ ${eur(data.vipFrom, true)} (най-добрите 10%)`],
    [num(s.high), "Висок риск", `${num(s.medium)} със среден риск`],
  ]
    .map(([big, lbl, sub], i) => `<button type="button" class="tile" data-t="${i}"><div class="lbl">${lbl}</div><div class="big">${big}</div><div class="sub">${esc(sub)}</div></button>`)
    .join("");
  const go = [null, ["seg", "repeat"], null, ["seg", "vip"], ["risk", "high"]];
  $("tiles").querySelectorAll(".tile").forEach((t) => {
    const g = go[Number(t.dataset.t)];
    if (!g) return t.removeAttribute("type");
    t.onclick = () => {
      st[g[0]] = g[1];
      st.page = 1;
      load();
    };
  });
}

function row(c) {
  const [rl, rc] = RISK[c.risk] || RISK.low;
  const marks = [c.vip ? `<span class="pill delivered" title="Най-добрите 10% по похарчено">VIP</span>` : "", c.n >= 2 ? `<span class="pill shipped">повторен</span>` : "", c.nek ? `<span class="pill returned" title="Сигнали в nekorekten.com">nekorekten ${num(c.nek)}</span>` : "", c.open ? `<span class="pill new">${num(c.open)} в момента</span>` : ""].filter(Boolean).join(" ");
  const main = `<tr class="click" data-k="${esc(c.k)}">
    <td><b>${esc(c.name || "–")}</b>${marks ? `<div>${marks}</div>` : ""}<div class="sub muted small">${esc([c.city, c.email].filter(Boolean).join(" · "))}</div></td>
    <td><a href="tel:${esc(c.phone)}" onclick="event.stopPropagation()">${esc(c.phone)}</a></td>
    <td class="r">${num(c.n)}${c.canceled ? `<div class="muted small">+${num(c.canceled)} отказани</div>` : ""}</td>
    <td class="r">${num(c.got)} / <span class="${c.ret ? "err" : ""}">${num(c.ret)}</span></td>
    <td class="r"><b>${eur(c.spent, true)}</b>${c.lost ? `<div class="muted small">върнати ${eur(c.lost, true)}</div>` : ""}</td>
    <td>${when(c.last_at)}${c.n > 1 ? `<div class="muted small">първа ${when(c.first_at)}</div>` : ""}</td>
    <td class="small">${(c.shops || []).map(esc).join(", ")}</td>
    <td>${c.risk === "low" ? `<span class="muted small">нисък</span>` : `<span class="pill ${rc}">${rl}</span>`}</td></tr>`;
  return main + (open.has(c.k) ? `<tr class="sub-row"><td colspan="8" id="d-${esc(c.k)}"><span class="muted small">Зареждам поръчките…</span></td></tr>` : "");
}

async function details(k) {
  const cell = $(`d-${k}`);
  if (!cell) return;
  try {
    const d = await api(`/api/klienti/${encodeURIComponent(k)}`);
    const items = (o) => (o.items || []).map((i) => `${esc(i.name)}${i.qty > 1 ? ` × ${num(i.qty)}` : ""}`).join(", ");
    cell.innerHTML = `<div class="small muted" style="margin-bottom:6px">${num(d.messages)} SMS · ${num(d.calls)} обаждания${d.lastContact ? ` · последно ${when(d.lastContact)}` : ""} · <a href="/poruchki/?tab=&q=${encodeURIComponent(k)}">виж в Поръчки</a></div>
      <table class="tbl"><tbody>${d.orders
        .map(
          (o) => `<tr><td><a href="/poruchka/?id=${o.id}">№ ${esc(o.order_no)}</a><div class="muted small">${when(o.ordered_at)} · ${esc(o.shop_label)}</div></td>
            <td class="small">${items(o)}</td>
            <td><span class="pill ${esc(o.stage)}">${esc(ONE[o.stage] || o.stage)}</span>${o.parcel_text ? `<div class="muted small">${esc(o.parcel_text)}</div>` : ""}</td>
            <td class="r">${eur(o.total_eur, true)}</td></tr>`,
        )
        .join("")}</tbody></table>`;
  } catch (e) {
    cell.innerHTML = `<span class="err small">${esc(e.message)}</span>`;
  }
}

function render() {
  tiles(data.summary);
  $("rows").innerHTML = data.customers.length ? data.customers.map(row).join("") : `<tr><td colspan="8" class="muted">Няма клиенти по тези филтри.</td></tr>`;
  $("rows").querySelectorAll("tr.click").forEach((tr) => {
    tr.onclick = () => {
      const k = tr.dataset.k;
      if (open.has(k)) open.delete(k);
      else open.add(k);
      render();
    };
  });
  open.forEach(details);
  const from = (data.page - 1) * data.per;
  $("count").textContent = data.total ? `${num(from + 1)}–${num(Math.min(from + data.per, data.total))} от ${num(data.total)}` : "";
  $("prev").disabled = data.page <= 1;
  $("next").disabled = from + data.per >= data.total;
  $("how").textContent = `Клиентите са събрани по телефон. „Похарчено“ е само от взетите пратки. Риск: висок – върнал 2 или повече пратки, върнал без да е взел нито една, или има сигнали в nekorekten.com; среден – върнал една.`;
  $("q").value = st.q;
  $("risk").value = st.risk;
  $("sort").value = st.sort;
  $("seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === st.seg));
}

async function load() {
  setQs({ q: st.q, seg: st.seg, risk: st.risk, sort: st.sort === "last" ? "" : st.sort, page: st.page > 1 ? st.page : "" });
  const p = new URLSearchParams({ q: st.q, seg: st.seg, risk: st.risk, sort: st.sort, page: String(st.page) });
  try {
    data = await api(`/api/klienti?${p}`);
    render();
  } catch (e) {
    $("rows").innerHTML = `<tr><td colspan="8" class="err">${esc(e.message)}</td></tr>`;
  }
}

let timer;
$("q").oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    st.q = $("q").value.trim();
    st.page = 1;
    load();
  }, 350);
};
$("seg").querySelectorAll("button").forEach((b) => (b.onclick = () => ((st.seg = b.dataset.v), (st.page = 1), load())));
$("risk").onchange = () => ((st.risk = $("risk").value), (st.page = 1), load());
$("sort").onchange = () => ((st.sort = $("sort").value), (st.page = 1), load());
$("prev").onclick = () => ((st.page = Math.max(1, st.page - 1)), load());
$("next").onclick = () => ((st.page += 1), load());
$("reload").onclick = load;
load();
