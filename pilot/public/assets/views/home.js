// Начало: how am I doing, what should I do now, and where the money goes – nothing more.
import { html, icon, eur, eur0, int, pct, delta, profitChart, marginBand, shortDate } from "../ui.js";
import { bindDecisions } from "./common.js";

const VERDICT = {
  good: (e) => html`<b>Над целта от ${e.t}%.</b> Рекламите печелят добре – има място за увеличение.`,
  ok: (e) => html`<b>В коридора ${e.f}–${e.t}%.</b> Добре е – пази бюджетите такива.`,
  low: (e) => html`<b>Под минимума от ${e.f}%.</b> Рекламите носят малко печалба – режи губещото.`,
  loss: () => html`<b>На загуба.</b> Рекламите струват повече, отколкото носят.`,
  none: () => html`Още няма достатъчно данни за този период.`,
};
const toneOf = (v, econ) => (!Number.isFinite(v) ? "" : v >= econ.floor ? "good" : v >= 0 ? "warn" : "bad");
const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;

export default {
  async render({ state, call }) {
    const d = await call("dashboard", state.range);
    state.pending = d.pendingCount;
    state.mode = d.mode;
    const k = d.kpi, p = d.prev, econ = d.econ;
    const e = { f: Math.round(econ.floor * 100), t: Math.round(econ.target * 100) };
    if (!d.demo && !d.byAccount.length) return html`
      <section class="card hero" style="max-width:640px">
        <h2>Добре дошъл в Кошер</h2>
        <p class="verdict">Остава да свържем рекламните акаунти и поръчките. Дотогава можеш да разгледаш всичко с примерни данни.</p>
        <div class="row" style="margin-top:20px"><a class="btn primary" href="#nastroyki">Настройки</a><a class="btn" href="?demo=1">Примерни данни</a></div>
      </section>`;

    const lines = d.byAccount.filter((a) => a.spend > 0 || a.orders > 0).sort((a, b) => b.spend - a.spend);
    const worst = lines.filter((a) => a.spend > 20 && Number.isFinite(a.cmPct)).sort((a, b) => a.cmPct - b.cmPct)[0];
    const best = lines.filter((a) => a.spend > 20 && a.orders >= 5 && Number.isFinite(a.cmPct)).sort((a, b) => b.cmPct - a.cmPct)[0];
    const narrow = typeof window !== "undefined" && window.innerWidth < 600;
    const events = [];
    for (const ev of d.nextEvents) {
      const same = events.find((x) => x.name === ev.name && x.date === ev.date);
      if (same) same.countries.push(ev.country);
      else events.push({ ...ev, countries: [ev.country] });
    }

    return html`
      ${d.paused ? html`<div class="banner bad">${icon("stop")} Автопилотът е спрян – нищо не се променя само. <a href="#avtopilot">Пусни го</a></div>` : ""}
      <div class="today">
        <section class="card hero">
          <div class="muted small">Марж след реклама · ${d.rangeLabel}</div>
          <div class="row" style="align-items:baseline;gap:16px;margin-top:10px">
            <div class="big">${pct(k.cmPct)}</div>
            <div class="stack" style="gap:2px">
              <div class="strong" style="font-size:17px">${eur0(k.cm)}</div>
              <div class="small">${delta(k.cmPct, p.cmPct)}</div>
            </div>
          </div>
          <p class="verdict">${(VERDICT[d.state] || VERDICT.none)(e)}
            ${worst && worst.cmPct < econ.floor ? html` Най-слабо: <b>${worst.name}</b> (${pct(worst.cmPct)}).` : ""}
            ${best && best !== worst && best.cmPct >= econ.floor ? html` Най-добре: <b>${best.name}</b> (${pct(best.cmPct)}).` : ""}</p>
          ${marginBand(k.cmPct, econ)}
          <div class="figs">
            <div><div class="k">Реклама</div><div class="v">${eur0(k.spend)}</div><div class="d">${delta(k.spend, p.spend)}</div></div>
            <div><div class="k">Поръчки</div><div class="v">${int(k.orders)}</div><div class="d">${delta(k.orders, p.orders)}</div></div>
            <div><div class="k">Реклама на поръчка</div><div class="v">${eur(k.cpo)}</div><div class="d">${delta(k.cpo, p.cpo, false)}</div></div>
          </div>
        </section>

        <section class="card todo">
          <div class="card-h"><h2>Какво да направиш</h2></div>
          ${d.todo.length
            ? html`<div class="list">${d.todo.map((t) => html`<div class="item">
                <div class="ic ${t.tone}">${icon(t.icon)}</div>
                <div class="body"><div class="t">${t.text}</div><div class="r">${t.sub}</div></div>
                <div class="acts"><a class="btn sm ${t.tone === "violet" ? "honey" : ""}" href="${t.href}">${t.cta}</a></div>
              </div>`)}</div>`
            : html`<div class="empty">${icon("check")}<p>Всичко е наред.<br>Днес няма нужда да правиш нищо.</p></div>`}
        </section>
      </div>

      <div class="section-t">Направления</div>
      <section class="card" style="padding-top:8px;padding-bottom:8px">
        <div class="lines">${lines.length
          ? lines.map((a) => html`<a class="line" href="#kampanii">
              <div class="n">${a.flag} ${a.name}</div>
              <div class="s">${eur0(a.spend)} реклама · ${plural(Math.round(a.orders), "поръчка", "поръчки")} · ${eur0(a.net)} оборот</div>
              <div class="m"><b class="${toneOf(a.cmPct, econ)}">${pct(a.cmPct)}</b><span>${eur0(a.cm)}</span></div>
            </a>`)
          : html`<div class="empty small">Няма разход и поръчки за този период.</div>`}</div>
      </section>

      <div class="section-t">Пари по дни</div>
      <section class="card">
        <div class="legend" style="margin-bottom:10px"><span><i style="background:var(--chart-2)"></i>Оборот</span><span><i style="background:var(--chart-1)"></i>Реклама</span><span><i style="background:var(--chart-3)"></i>Марж %</span></div>
        ${narrow ? profitChart(d.series.slice(-14), econ, { width: 360, height: 220, font: 11 }) : profitChart(d.series, econ)}
      </section>

      ${events.length ? html`<p class="small muted" style="margin:18px 4px 0">${icon("calendar")} Предстои: ${events.slice(0, 2).map((ev, i) => html`${i ? " · " : ""}<b class="strong">${shortDate(ev.date)}</b> ${ev.name} (${ev.countries.join(", ")})`)}. <a href="#pazar">Пазар →</a></p>` : ""}`;
  },
  mount(page, ctx) {
    bindDecisions(page, ctx);
  },
};
