import { html, icon, eur, eur0, int, pct, x2, delta, profitChart, marginBand, TONE, STATE_LABEL, shortDate, ago } from "../ui.js";
import { proposalItem, bindDecisions, regimeTone } from "./common.js";

const KIND_TONE = { holiday: "muted", shopping: "honey", gifting: "violet", payday: "good", auction: "warn", deadline: "info" };

export default {
  async render({ state, call }) {
    const d = await call("dashboard", state.range);
    state.pending = d.pendingCount;
    state.mode = d.mode;
    const k = d.kpi, p = d.prev;
    const econ = d.econ;
    const tone = TONE[d.state];
    const urgent = d.alerts;
    if (!d.demo && !d.byAccount.length) return html`
      <section class="card hero" style="max-width:760px">
        <div class="card-h"><h2>${icon("bolt")} Първи стъпки</h2><span class="pill info">няма свързани акаунти</span></div>
        <p class="muted" style="margin-top:-4px">Кошерът е готов. Остава да го свържем с рекламните акаунти и с поръчките. Докато чакаш, разгледай всичко с <a href="?demo=1">примерни данни</a>.</p>
        <ol class="stack" style="gap:10px;padding-left:20px;margin:6px 0 0">
          <li><b class="strong">Мета:</b> токен на системен потребител (ads_read, ads_management) – въвежда се в Netlify като скрита настройка META_TOKEN. До 15 минути след това акаунтите, кампаниите и рекламите се появяват тук.</li>
          <li><b class="strong">Поръчки:</b> адрес за продажбите от ConvertBuilder (SALES_URL) или уебхук към /api/hook/orders.</li>
          <li><b class="strong">Себестойност:</b> Настройки → „От Табло Печалба“ зарежда продуктите и месечните разходи.</li>
          <li><b class="strong">Режим:</b> първите 2 седмици – „Наблюдение“: само препоръки, нищо не се променя само.</li>
        </ol>
        <div class="row" style="margin-top:14px"><a class="btn primary" href="#nastroyki">${icon("gear")} Настройки и връзки</a><a class="btn" href="?demo=1">${icon("eye")} Демо с примерни данни</a></div>
      </section>`;
    return html`
      ${d.paused ? html`<div class="banner bad">${icon("stop")} Автопилотът е спрян. Нищо не се променя само. <a href="#avtopilot">Пусни го</a></div>` : ""}
      <div class="grid g-hero">
        <section class="card hero">
          <div class="row between">
            <div class="kpi"><div class="k">${icon("target")} Марж след реклама · ${d.rangeLabel}</div></div>
            <span class="pill ${tone}">${STATE_LABEL[d.state]}</span>
          </div>
          <div class="row" style="align-items:flex-end;gap:18px;margin-top:6px">
            <div class="big">${pct(k.cmPct)}</div>
            <div class="stack" style="gap:2px;padding-bottom:6px">
              <div class="strong">${eur0(k.cm)} марж</div>
              <div class="small">${delta(k.cmPct, p.cmPct)}</div>
            </div>
          </div>
          ${marginBand(k.cmPct, econ)}
          <div class="sep"></div>
          <div class="grid g3" style="gap:10px">
            <div class="kpi"><div class="k">Печалба след фиксирани</div><div class="v" style="font-size:20px">${eur0(k.profit)}</div><div class="d small">${delta(k.profit, p.profit)}</div></div>
            <div class="kpi"><div class="k">От началото на месеца</div><div class="v" style="font-size:20px">${pct(d.mtd.cmPct)}</div><div class="d small muted">${eur0(d.mtd.cm)} марж</div></div>
            <div class="kpi"><div class="k">MER (нето / реклама)</div><div class="v" style="font-size:20px">${x2(k.mer)}</div><div class="d small">${delta(k.mer, p.mer)}</div></div>
          </div>
        </section>
        <section class="card">
          <div class="card-h"><h2>Иска внимание</h2><a class="small" href="#avtopilot">Всички (${d.pendingCount}) →</a></div>
          ${urgent.length ? html`<div class="list">${urgent.map((x) => proposalItem(x, { compact: false }))}</div>` : html`<div class="empty">${icon("check")}<p>Всичко е под контрол.</p></div>`}
        </section>
      </div>

      <div class="grid g4" style="margin-top:16px">
        <div class="card kpi"><div class="k">Разход за реклама</div><div class="v">${eur0(k.spend)}</div><div class="d">${delta(k.spend, p.spend)}</div></div>
        <div class="card kpi"><div class="k">Поръчки (реални)</div><div class="v">${int(k.orders)}</div><div class="d">${delta(k.orders, p.orders)}</div></div>
        <div class="card kpi"><div class="k">Нетен оборот <span class="faint">(без ДДС, очаквано платени)</span></div><div class="v">${eur0(k.net)}</div><div class="d">${delta(k.net, p.net)}</div></div>
        <div class="card kpi"><div class="k">Цена на поръчка</div><div class="v">${eur(k.cpo)}</div><div class="d">${delta(k.cpo, p.cpo, false)}</div></div>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Пари по дни</h2>
          <div class="legend"><span><i style="background:var(--chart-2)"></i>Нетен оборот</span><span><i style="background:var(--chart-1)"></i>Реклама</span><span><i style="background:var(--chart-3);height:3px"></i>Марж %</span><span><i style="background:var(--good);opacity:.25"></i>Коридор ${Math.round(econ.floor * 100)}–${Math.round(econ.target * 100)}%</span></div>
        </div>
        ${profitChart(d.series, econ)}
      </section>

      <div class="grid g2" style="margin-top:16px">
        <section class="card">
          <div class="card-h"><h2>Пазарът сега</h2><a class="small" href="#pazar">Подробно →</a></div>
          <div class="regimes">${d.regimes.map((r) => html`<div class="regime"><div class="c">${r.flag} ${r.name}</div><div class="l"><span class="pill ${regimeTone(r.tone)}">${r.label}</span></div><div class="p">Позиция: <b>${r.posture}</b>${r.reasons?.length ? html` · ${r.reasons[0]}` : ""}</div></div>`)}</div>
          ${d.diagnosis.length ? html`<div class="sep"></div><div class="stack" style="gap:8px">${d.diagnosis.map((x) => html`<div class="issue warn">${icon("alert")}<div><b>${x.title}:</b> ${x.text}</div></div>`)}</div>` : ""}
        </section>
        <section class="card">
          <div class="card-h"><h2>Креативи</h2><a class="small" href="#kreativi">Към креативите →</a></div>
          <div class="grid g3" style="gap:10px">
            <div class="kpi"><div class="k">${icon("flame")} Изгорели</div><div class="v" style="font-size:22px;color:var(--bad)">${d.bench.burning}</div><div class="d small muted">+${d.bench.soon} до 7 дни</div></div>
            <div class="kpi"><div class="k">Готови резерви</div><div class="v" style="font-size:22px">${d.bench.bench}<span class="faint" style="font-size:15px"> / ${d.bench.needed}</span></div><div class="d small ${d.bench.bench < d.bench.needed ? "down" : "up"}">${d.bench.bench < d.bench.needed ? `липсват ${d.bench.needed - d.bench.bench}` : "достатъчно"}</div></div>
            <div class="kpi"><div class="k">Разнообразие</div><div class="v" style="font-size:22px">${d.diversityAvg ?? "—"}<span class="faint" style="font-size:15px">/100</span></div><div class="d small muted">средно за адсетите</div></div>
          </div>
          <div class="sep"></div>
          <div class="row"><a class="btn honey sm" href="#studio">${icon("wand")} Нови реклами</a><span class="small muted">Андромеда награждава различни идеи, не варианти на една.</span></div>
        </section>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Акаунти</h2><span class="hint">Реални поръчки от магазина, не данните на Мета</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Акаунт</th><th>Разход</th><th>Поръчки</th><th>Нетен оборот</th><th>Марж</th><th>Марж %</th><th title="Реални поръчки ÷ покупки в Мета">Мета ↔ магазин</th><th title="Максимална цена на поръчка за целевия марж">Макс. цена/поръчка</th><th title="ROAS в Мета (с ДДС), под който губиш">ROAS на нула</th></tr></thead>
          <tbody>${d.byAccount.map((a) => html`<tr>
            <td>${a.flag} <b class="strong">${a.name}</b></td>
            <td>${eur0(a.spend)}</td><td>${int(a.orders)}</td><td>${eur0(a.net)}</td><td>${eur0(a.cm)}</td>
            <td><span class="pill ${TONE[a.state]}">${pct(a.cmPct)}</span></td>
            <td>×${x2(a.q)}</td><td>${eur(a.thresholds.maxCpaTarget)}</td><td>${x2(a.thresholds.beRoasGross)}</td>
          </tr>`)}</tbody>
        </table></div>
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Следващите дни</h2><span class="hint">Празници, пенсии, пазаруване – подготви бюджети и креативи</span></div>
        ${d.nextEvents.length ? html`<div class="chip-row">${d.nextEvents.map((e) => html`<span class="pill ${KIND_TONE[e.kind] || ""}">${icon("calendar")} ${shortDate(e.date)} · ${e.country} · ${e.name}</span>`)}</div>` : html`<div class="muted small">Нищо специално в следващите 10 дни.</div>`}
        ${d.lastRun ? html`<p class="tiny faint" style="margin:12px 0 0">Последна проверка на автопилота: ${ago(d.lastRun.at)} · изпълнени ${d.lastRun.ran}</p>` : ""}
      </section>`;
  },
  mount(page, ctx) {
    bindDecisions(page, ctx);
  },
};
