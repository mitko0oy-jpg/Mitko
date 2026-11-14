import { html, icon, eur, eur0, pct, toast, ago, shortDate, ask } from "../ui.js";
import { proposalItem, bindDecisions, STATUS } from "./common.js";

let showAll = false;

export default {
  range: false,
  async render({ call, state }) {
    const d = await call("autopilot");
    state.mode = d.mode;
    const props = d.proposals;
    const money = props.filter((p) => ["budget", "pause", "activate", "swap"].includes(p.kind));
    const tasks = props.filter((p) => p.kind === "generate");
    const alerts = props.filter((p) => p.kind === "alert");
    const pend = (l) => l.filter((p) => p.status === "proposed" || p.status === "blocked");
    const list = (l, empty) => {
      const shown = showAll ? l : pend(l);
      return shown.length ? html`<div class="list">${shown.map((p) => proposalItem(p))}</div>` : html`<div class="empty small">${empty}</div>`;
    };
    const groups = [...new Set(d.rules.map((r) => r.group))];
    const L = d.limits;
    return html`
      <section class="card">
        <div class="card-h"><h2>Как работи пилотът</h2>
          <label class="row small" style="gap:8px"><span class="${d.paused ? "down" : "muted"}">${d.paused ? "СПРЯН" : "Работи"}</span><span class="switch"><input type="checkbox" data-act="pause" ${d.paused ? "" : "checked"} aria-label="Автопилотът работи"><span></span></span></label>
        </div>
        <div class="modes">${Object.entries(d.modes).map(([k, m]) => html`<button class="mode ${d.mode === k ? "on" : ""}" data-act="mode" data-v="${k}"><h3>${icon(k === "observe" ? "eye" : k === "copilot" ? "users" : "pilot")} ${m.label}</h3><p>${m.text}</p></button>`)}</div>
        <div class="row" style="margin-top:14px">
          <button class="btn sm" data-act="revert">${icon("undo")} Върни промените от последните 24 ч</button>
          <span class="small muted">Маржът за 7 дни: <b class="strong">${pct(d.blended7.cmPct)}</b> · от началото на месеца: <b class="strong">${pct(d.mtd.cmPct)}</b> · коридор ${Math.round(d.econ.marginFloor * 100)}–${Math.round(d.econ.marginTarget * 100)}%</span>
        </div>
      </section>

      <div class="row" style="margin:18px 0 10px"><h2 class="grow">Предложения днес</h2><label class="row small muted"><input type="checkbox" data-act="showAll" ${showAll ? "checked" : ""}> покажи и решените</label></div>
      <div class="grid g2">
        <section class="card"><div class="card-h"><h2>${icon("bolt")} Бюджети и реклами</h2><span class="pill info">${pend(money).length}</span></div>${list(money, "Няма промени по бюджетите.")}</section>
        <div class="stack" style="gap:16px">
          <section class="card"><div class="card-h"><h2>${icon("wand")} Креативи</h2><span class="pill info">${pend(tasks).length}</span></div>${list(tasks, "Резервите и разнообразието са наред.")}</section>
          <section class="card"><div class="card-h"><h2>${icon("alert")} Сигнали</h2><span class="pill info">${pend(alerts).length}</span></div>${list(alerts, "Няма сигнали.")}</section>
        </div>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Граници</h2><span class="hint">Автопилотът никога не ги прекрачва сам</span></div>
        <form class="grid g4" id="limits" style="gap:12px">
          <div class="field"><label>Таван на дневния разход (€)</label><input class="input" name="maxDailySpend" type="number" value="${L.maxDailySpend}"></div>
          <div class="field"><label>Сам до +% на стъпка</label><input class="input" name="autoUpPct" type="number" value="${L.autoUpPct}"></div>
          <div class="field"><label>Макс. увеличение %</label><input class="input" name="maxUpPct" type="number" value="${L.maxUpPct}"></div>
          <div class="field"><label>Макс. намаление %</label><input class="input" name="maxDownPct" type="number" value="${L.maxDownPct}"></div>
          <div class="field"><label>Пауза след увеличение (ч)</label><input class="input" name="cooldownUpH" type="number" value="${L.cooldownUpH}"></div>
          <div class="field"><label>Пауза след намаление (ч)</label><input class="input" name="cooldownDownH" type="number" value="${L.cooldownDownH}"></div>
          <div class="field"><label>Макс. ръст за седмица %</label><input class="input" name="maxWeeklyUpPct" type="number" value="${L.maxWeeklyUpPct}"></div>
          <div class="field"><label>Действия на проверка</label><input class="input" name="maxActionsPerRun" type="number" value="${L.maxActionsPerRun}"></div>
        </form>
        <div class="row" style="margin-top:12px"><button class="btn primary sm" data-act="saveLimits">Запази границите</button></div>
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Правила</h2><span class="hint">Доверие = колко често правилото е било право (самообучение)</span></div>
        ${groups.map((g) => html`<h3 style="margin:14px 0 4px" class="muted">${g}</h3><div class="list">${d.rules.filter((r) => r.group === g).map((r) => html`<div class="item">
          <label class="switch" style="margin-top:4px"><input type="checkbox" data-act="rule" data-id="${r.id}" ${r.on ? "checked" : ""} aria-label="${r.title}"><span></span></label>
          <div class="body"><div class="t">${r.title}</div><div class="r">${r.text}</div></div>
          <div class="acts">${r.trust ? html`<span class="pill ${r.trust.trust >= 0.6 ? "good" : r.trust.trust >= 0.4 ? "honey" : "warn"}" title="${r.trust.good} от ${r.trust.n} решения се оказаха правилни">доверие ${Math.round(r.trust.trust * 100)}%</span>` : html`<span class="pill muted">без история</span>`}</div>
        </div>`)}</div>`)}
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Дневник</h2><span class="hint">Всяко действие – кой, кога, защо и какъв беше резултатът</span></div>
        ${d.history.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Кога</th><th>Действие</th><th>Причина</th><th>Кой</th><th>Статус</th><th>Резултат</th></tr></thead><tbody>
        ${d.history.map((h) => html`<tr><td>${shortDate((h.executedAt || h.decidedAt || "").slice(0, 10))}</td><td class="l"><b class="strong">${h.title}</b></td><td class="l small muted" style="white-space:normal;min-width:240px">${h.reason}</td><td>${h.by === "auto" ? "пилот" : "ти"}</td><td><span class="pill ${(STATUS[h.status] || [])[1] || ""}">${(STATUS[h.status] || [h.status])[0]}</span></td>
          <td>${h.outcome ? html`<span class="pill ${h.outcome.good ? "good" : "bad"}" title="Марж преди ${eur(h.outcome.cmBefore)} → след ${eur(h.outcome.cmAfter)}">${h.outcome.good ? "✓ добре" : "✗ зле"}</span>` : html`<span class="faint small">чака данни</span>`}</td></tr>`)}
        </tbody></table></div>` : html`<div class="empty">Още няма действия.</div>`}
      </section>`;
  },
  mount(page, ctx) {
    bindDecisions(page, ctx);
    page.addEventListener("change", async (e) => {
      const t = e.target;
      try {
        if (t.dataset.act === "pause") {
          await ctx.call("saveSettings", { paused: !t.checked });
          toast(t.checked ? "Пилотът работи" : "Пилотът е спрян – нищо не се променя само");
          window.dispatchEvent(new Event("pilot:changed"));
          ctx.refresh();
        } else if (t.dataset.act === "rule") {
          await ctx.call("saveSettings", { rules: { [t.dataset.id]: { on: t.checked } } });
          toast(t.checked ? "Правилото е включено" : "Правилото е изключено");
          ctx.refresh();
        } else if (t.dataset.act === "showAll") {
          showAll = t.checked;
          ctx.refresh();
        }
      } catch (err) {
        toast(err.message);
      }
    });
    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "INPUT") return;
      try {
        if (b.dataset.act === "mode") {
          await ctx.call("saveSettings", { mode: b.dataset.v });
          toast("Режимът е сменен");
          window.dispatchEvent(new Event("pilot:changed"));
          ctx.refresh();
        } else if (b.dataset.act === "revert") {
          if (!(await ask("Да върна ли всички промени на бюджети и паузи от последните 24 часа?", { ok: "Върни" }))) return;
          const r = await ctx.call("revert24h");
          toast(`Върнати: ${r.reverted}`);
          ctx.refresh();
        } else if (b.dataset.act === "saveLimits") {
          const f = new FormData(page.querySelector("#limits"));
          const limits = {};
          for (const [k, v] of f.entries()) if (v !== "") limits[k] = Number(v);
          await ctx.call("saveSettings", { limits });
          toast("Границите са запазени");
          ctx.refresh();
        }
      } catch (err) {
        toast(err.message);
      }
    });
  },
};
