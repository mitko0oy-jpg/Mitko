import { html, icon, eur, eur0, int, pct, x2, dec, toast, ask } from "../ui.js";
import { cmCell, STAGE_TONE, STAGE_LABEL } from "./common.js";

const open = new Set((() => {
  try {
    return JSON.parse(localStorage.getItem("pilot.open") || "[]");
  } catch {
    return [];
  }
})());
const saveOpen = () => {
  try {
    localStorage.setItem("pilot.open", JSON.stringify([...open]));
  } catch {}
};
let filter = "all";
let showIdle = false;
let more = false;

function metricCells(m, econ) {
  const base = html`<td>${eur0(m.spend)}</td><td>${int(Math.round(m.orders || 0))}</td><td>${eur(m.cpo)}</td><td>${cmCell(m.cmPct, econ)}</td>`;
  return more ? html`${base}<td>${int(m.metaPurchases)}</td><td>${x2(m.roasMeta)}</td><td>${pct(m.ctr, 2)}</td><td>${eur(m.cpm)}</td><td>${x2(m.freq)}</td>` : base;
}
const idle = (c) => c.status !== "ACTIVE" && !(c.m?.spend > 0);
function statusBtn(e) {
  const on = e.status === "ACTIVE";
  return html`<button class="btn xs ${on ? "" : "ghost"}" data-act="toggle" data-id="${e.id}" data-level="${e.level}" data-status="${e.status}" title="${on ? "Пауза" : "Пусни"}">${icon(on ? "pause" : "play")}</button>`;
}
function budgetCell(e) {
  if (e.budget == null) return html`<span class="faint">—</span>`;
  return html`<button class="linkish" data-act="budget" data-id="${e.id}" data-level="${e.level}" data-budget="${e.budget}" title="Промени дневния бюджет">${eur0(e.budget)}</button>${e.holder?.sStar ? html`<div class="tiny faint" title="Над тази сума маржът пада под целта (крива на насищане)">таван ~${eur0(e.holder.sStar)}</div>` : ""}`;
}
const props = (e) => (e.proposals?.some((p) => p.status === "proposed" && p.kind !== "generate" && p.kind !== "alert") ? html`<a href="#avtopilot" class="pill honey" title="Автопилотът предлага промяна">чака решение</a>` : "");

export default {
  async render({ state, call }) {
    const d = await call("campaigns", state.range);
    const econ = d.econ;
    const accounts = d.accounts.filter((a) => filter === "all" || a.id === filter);
    const rows = [];
    let hidden = 0;
    for (const a of accounts) {
      const max = a.thresholds.maxCpaTarget;
      rows.push(html`<tr class="lvl-account"><td>${a.flag} ${a.name} <span class="tiny muted" style="font-weight:400" title="Колко реклама можеш да платиш за една поръчка и пак да остане целевият марж">· ${Number.isFinite(max) && max > 0 ? `до ${eur(max)} реклама на поръчка` : "губи при всяка поръчка – провери цените"}</span></td><td></td><td></td>${metricCells(a.m, econ)}<td></td></tr>`);
      for (const c of a.campaigns) {
        if (!showIdle && idle(c)) {
          hidden++;
          continue;
        }
        const oc = open.has(c.id);
        rows.push(html`<tr class="lvl-campaign ${c.status !== "ACTIVE" ? "off" : ""}">
          <td class="l"><button class="caret" data-act="open" data-id="${c.id}" aria-label="Разгъни">${icon(oc ? "chevd" : "chev")}</button><span class="name" title="${c.name}">${c.name}</span> ${c.holder?.isTest ? html`<span class="pill violet">тест</span>` : ""}</td>
          <td>${statusBtn(c)}</td><td>${budgetCell(c)}</td>${metricCells(c.m, econ)}<td class="l">${props(c)}</td></tr>`);
        if (!oc) continue;
        for (const s of c.adsets) {
          const os = open.has(s.id);
          rows.push(html`<tr class="${s.status !== "ACTIVE" ? "off" : ""}">
            <td class="l ind1"><button class="caret" data-act="open" data-id="${s.id}">${icon(os ? "chevd" : "chev")}</button><span class="name" title="${s.name}">${s.name}</span>
              ${s.learning === "learning" ? html`<span class="pill info" title="Мета още учи – без големи промени">учи се</span>` : ""}</td>
            <td>${statusBtn(s)}</td><td>${budgetCell(s)}</td>${metricCells(s.m, econ)}<td class="l">${props(s)}</td></tr>`);
          if (!os) continue;
          for (const ad of s.ads) {
            rows.push(html`<tr class="${ad.status !== "ACTIVE" ? "off" : ""}">
              <td class="l ind2"><span class="name" title="${ad.hookText || ad.name}">${ad.name}</span> <span class="pill ${STAGE_TONE[ad.fatigue.stage]}" title="${ad.fatigue.text}">${STAGE_LABEL[ad.fatigue.stage]}${ad.fatigue.daysLeft != null && ["peak", "tiring", "rising"].includes(ad.fatigue.stage) ? ` · ~${ad.fatigue.daysLeft} д.` : ""}</span></td>
              <td>${statusBtn(ad)}</td><td class="tiny faint">${ad.age} дни</td>${metricCells(ad.m, econ)}<td class="l">${props(ad)}</td></tr>`);
          }
        }
      }
    }
    return html`
      <div class="row" style="margin-bottom:14px">
        <div class="chip-row">
          <button class="chip ${filter === "all" ? "on" : ""}" data-act="filter" data-v="all">Всички</button>
          ${d.accounts.map((a) => html`<button class="chip ${filter === a.id ? "on" : ""}" data-act="filter" data-v="${a.id}">${a.flag} ${a.name}</button>`)}
        </div>
        <span class="grow"></span>
        <button class="btn sm ghost" data-act="more">${more ? "По-малко колони" : "Повече колони"}</button>
        <button class="btn sm ghost" data-act="expand">Разгъни всичко</button>
      </div>
      <div class="card pad0" style="padding:8px"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Име</th><th></th><th>Бюджет на ден</th><th>Реклама</th><th title="Реалните поръчки от магазина, разпределени по кампании">Поръчки</th><th>Реклама на поръчка</th><th>Марж</th>${more ? html`<th>Покупки по Мета</th><th>ROAS по Мета</th><th>CTR</th><th>CPM</th><th>Честота</th>` : ""}<th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
      ${hidden ? html`<div class="row" style="justify-content:center;margin-top:14px"><button class="btn sm" data-act="idle">Покажи и спрените без разход (${hidden})</button></div>` : showIdle ? html`<div class="row" style="justify-content:center;margin-top:14px"><button class="btn sm" data-act="idle">Скрий спрените</button></div>` : ""}
      <p class="small muted" style="margin:18px 4px 0">Маржът е с реалните поръчки от магазина, без ДДС и с вероятността пратката да бъде платена. Мета препоръчва промени на бюджета до 20% на 2–3 дни.</p>`;
  },
  mount(page, ctx) {
    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "open") {
        open.has(b.dataset.id) ? open.delete(b.dataset.id) : open.add(b.dataset.id);
        saveOpen();
        ctx.refresh();
      } else if (act === "filter") {
        filter = b.dataset.v;
        ctx.refresh();
      } else if (act === "idle") {
        showIdle = !showIdle;
        ctx.refresh();
      } else if (act === "more") {
        more = !more;
        ctx.refresh();
      } else if (act === "expand") {
        page.querySelectorAll('[data-act="open"]').forEach((x) => open.add(x.dataset.id));
        saveOpen();
        ctx.refresh();
      } else if (act === "toggle") {
        const to = b.dataset.status === "ACTIVE" ? "pause" : "activate";
        if (!(await ask(to === "pause" ? "Да спра ли?" : "Да пусна ли отново?", { ok: to === "pause" ? "Спри" : "Пусни" }))) return;
        try {
          await ctx.call("act", { id: b.dataset.id, level: b.dataset.level, kind: to });
          toast(to === "pause" ? "Спряно" : "Пуснато");
          ctx.refresh();
        } catch (err) {
          toast(err.message);
        }
      } else if (act === "budget") {
        const cur = Number(b.dataset.budget);
        const cell = b.parentElement;
        cell.innerHTML = `<span class="budget-edit"><input class="input" type="number" min="1" step="1" value="${cur}" aria-label="Нов дневен бюджет"><button class="btn xs good" data-act="saveBudget" data-id="${b.dataset.id}" data-level="${b.dataset.level}" data-from="${cur}">ОК</button></span>`;
        cell.querySelector("input").focus();
      } else if (act === "saveBudget") {
        const v = Number(b.parentElement.querySelector("input").value);
        const from = Number(b.dataset.from);
        if (from && v / from - 1 > 0.2 && !(await ask(`Увеличение с ${Math.round((v / from - 1) * 100)}%. Мета препоръчва до 20% наведнъж, за да не рестартира обучението. Продължаваш ли?`, { ok: "Смени" }))) return;
        try {
          await ctx.call("act", { id: b.dataset.id, level: b.dataset.level, kind: "budget", value: v });
          toast("Бюджетът е сменен");
          ctx.refresh();
        } catch (err) {
          toast(err.message);
        }
      }
    });
  },
};
