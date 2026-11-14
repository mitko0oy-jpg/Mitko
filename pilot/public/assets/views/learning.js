import { html, icon, eur, shortDate, meter, toast } from "../ui.js";

const COLS = [["adopt", "Ползваме", "good"], ["trial", "Тестваме", "honey"], ["assess", "Следим", "info"], ["hold", "Не ползваме", "muted"]];

export default {
  range: false,
  async render({ call }) {
    const d = await call("learning");
    const good = d.evaluated.filter((e) => e.outcome?.good).length;
    return html`
      <div class="grid g3">
        <div class="card kpi"><div class="k">Оценени решения</div><div class="v">${d.evaluated.length}</div><div class="d small muted">след 2–4 дни се сравняват с останалата част от акаунта</div></div>
        <div class="card kpi"><div class="k">Правилни</div><div class="v">${d.evaluated.length ? Math.round((good / d.evaluated.length) * 100) : "—"}%</div><div class="d small muted">${good} от ${d.evaluated.length}</div></div>
        <div class="card kpi"><div class="k">Какво учи</div><div class="v" style="font-size:16px;line-height:1.4">Стъпки на бюджета, кои ъгли и формати печелят, кога пазарът се обръща</div></div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <section class="card">
          <div class="card-h"><h2>${icon("pilot")} Доверие в правилата</h2></div>
          ${d.trust.length ? html`<div class="stack" style="gap:10px">${d.trust.map((t) => html`<div><div class="row between small"><span class="strong">${t.title}</span><span>${t.good}/${t.n} · <b>${Math.round(t.trust * 100)}%</b></span></div>${meter(t.trust * 100)}</div>`)}</div>
          <p class="tiny faint">При високо доверие стъпките на скалиране стават малко по-смели (до границите), при ниско – по-предпазливи.</p>` : html`<div class="empty">Още няма оценени решения.</div>`}
        </section>
        <section class="card">
          <div class="card-h"><h2>${icon("image")} Какво печели по държави</h2></div>
          ${Object.entries(d.insights).map(([c, i]) => html`<div style="margin-bottom:10px"><b class="strong">${c}</b>${i.top.length ? html`<div class="small up">▲ ${i.top.join(" · ")}</div>` : html`<div class="small faint">още малко данни</div>`}${i.bottom.length ? html`<div class="small down">▼ ${i.bottom.join(" · ")}</div>` : ""}</div>`)}
        </section>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Решения и резултати</h2></div>
        ${d.evaluated.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Дата</th><th>Решение</th><th>Марж преди</th><th>Марж след</th><th>Спрямо акаунта</th><th>Оценка</th></tr></thead><tbody>
          ${d.evaluated.map((e) => html`<tr><td>${shortDate(e.executedAt.slice(0, 10))}</td><td class="l"><b class="strong">${e.title}</b> <span class="faint small">· ${e.by === "auto" ? "пилот" : "ти"}</span></td><td>${eur(e.outcome.cmBefore)}</td><td>${eur(e.outcome.cmAfter)}</td><td>${Number.isFinite(e.outcome.did) ? `${e.outcome.did > 0 ? "+" : ""}${e.outcome.did.toFixed(2).replace(".", ",")} €/€` : "—"}</td><td><span class="pill ${e.outcome.good ? "good" : "bad"}">${e.outcome.good ? "✓ добре" : "✗ зле"}</span></td></tr>`)}
        </tbody></table></div>` : html`<div class="empty">Още няма.</div>`}
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>${icon("sparkles")} Технологичен радар</h2><span class="hint">Новите модели и функции на Мета – проверявани всяка седмица</span></div>
        <div class="radar">${COLS.map(([k, label, tone]) => html`<div class="col"><h3><span class="pill ${tone}">${label}</span></h3>${d.radar.filter((r) => r.status === k).map((r) => html`<div class="ri"><div class="row between"><b>${r.name}</b><span class="tiny faint">${r.area}</span></div><p>${r.note}</p>
          <div class="row" style="gap:4px;margin-top:6px">${COLS.filter(([s]) => s !== k).map(([s, l]) => html`<button class="btn xs ghost" data-act="radar" data-id="${r.id}" data-v="${s}">→ ${l}</button>`)}</div></div>`)}</div>`)}</div>
        <p class="tiny faint">Правило: нов инструмент първо работи 2–4 седмици „в сянка“ (само предлага), сравнява се с реалния резултат и чак тогава получава право да действа.</p>
      </section>`;
  },
  mount(page, ctx) {
    page.addEventListener("click", async (e) => {
      const b = e.target.closest('[data-act="radar"]');
      if (!b) return;
      await ctx.call("saveRadar", { id: b.dataset.id, status: b.dataset.v });
      toast("Записано");
      ctx.refresh();
    });
  },
};
