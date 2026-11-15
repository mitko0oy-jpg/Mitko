// Автопилот: one row per campaign with one clear decision; everything technical is folded away.
import { html, icon, eur, pct, toast, shortDate, ask } from "../ui.js";
import { STATUS } from "./common.js";

const LEVEL = { campaign: "кампания", adset: "рекламна група", ad: "реклама", account: "акаунт" };
const MONEY = ["pause", "budget", "activate", "swap"];
const RANK = { pause: 0, budget: 1, activate: 2, swap: 3 };
const open = (p) => p.status === "proposed" || p.status === "blocked";

function choiceLabel(p) {
  if (p.kind === "pause") return "Спри";
  if (p.kind === "activate") return "Пусни";
  if (p.kind === "swap") return "Смени";
  if (p.kind === "budget" && p.from != null) return p.to < p.from ? `Намали до ${eur(p.to)}` : `Увеличи до ${eur(p.to)}`;
  return "Да";
}

// Several rules can talk about the same campaign (e.g. "−30%" and "pause?") – show them as one row.
function groups(list) {
  const map = new Map();
  for (const p of list) {
    const k = p.entity?.id || p.id;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return [...map.values()].map((g) => g.sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9)));
}

function decisionRow(g) {
  const [main, ...alts] = g;
  const e = main.entity || {};
  const ids = g.map((p) => p.id).join(",");
  const blocked = g.every((p) => p.status === "blocked");
  return html`<div class="item">
    <div class="ic ${main.kind === "pause" ? "warn" : main.to > main.from ? "good" : "honey"}">${icon(main.kind === "pause" ? "pause" : main.kind === "activate" ? "play" : "bolt")}</div>
    <div class="body">
      <div class="t">${e.name || main.title}</div>
      <div class="r">${LEVEL[e.level] ? html`${LEVEL[e.level]} · ` : ""}${main.reason}</div>
      ${main.blockedBy ? html`<div class="r" style="color:var(--bad)">${main.blockedBy}</div>` : ""}
    </div>
    <div class="acts">
      ${blocked ? "" : html`<button class="btn sm ${main.kind === "pause" ? "primary" : "good"}" data-act="choose" data-id="${main.id}" data-group="${ids}">${choiceLabel(main)}</button>`}
      ${alts.filter(open).slice(0, 1).map((a) => html`<button class="btn sm" data-act="choose" data-id="${a.id}" data-group="${ids}">${choiceLabel(a)}</button>`)}
      <button class="btn sm ghost" data-act="dismiss" data-group="${ids}" title="Не, остави така" aria-label="Не, остави така">${icon("x")}</button>
    </div>
  </div>`;
}

export default {
  range: false,
  async render({ call, state }) {
    const d = await call("autopilot");
    state.mode = d.mode;
    const props = d.proposals.filter(open);
    // A budget "change" to the same amount (already at the minimum) is not a real choice.
    const money = props.filter((p) => MONEY.includes(p.kind) && !(p.kind === "budget" && p.from != null && Math.abs(p.to - p.from) < 0.01));
    const big = groups(money.filter((p) => p.entity?.level !== "ad"));
    const ads = money.filter((p) => p.entity?.level === "ad" && p.kind === "pause");
    const tasks = props.filter((p) => p.kind === "generate");
    const alerts = props.filter((p) => p.kind === "alert").slice(0, 4);
    const groupsOfRules = [...new Set(d.rules.map((r) => r.group))];
    const L = d.limits;
    state.pending = big.length + ads.length;
    return html`
      <section class="card">
        <div class="row between" style="margin-bottom:14px">
          <div><h2>${d.paused ? "Автопилотът е спрян" : "Как да работи"}</h2><div class="small muted" style="margin-top:4px">Марж за 7 дни: <b class="strong">${pct(d.blended7.cmPct)}</b> · цел ${Math.round(d.econ.marginFloor * 100)}–${Math.round(d.econ.marginTarget * 100)}%</div></div>
          <label class="row small" style="gap:10px"><span class="muted">${d.paused ? "Спрян" : "Включен"}</span><span class="switch"><input type="checkbox" data-act="pause" ${d.paused ? "" : "checked"} aria-label="Автопилотът е включен"><span></span></span></label>
        </div>
        <div class="modes">${Object.entries(d.modes).map(([k, m]) => html`<button class="mode ${d.mode === k ? "on" : ""}" data-act="mode" data-v="${k}" aria-pressed="${d.mode === k}"><h3>${icon(k === "observe" ? "eye" : k === "copilot" ? "users" : "pilot")} ${m.label}</h3><p>${m.text}</p></button>`)}</div>
        <p class="small muted mode-text">${d.modes[d.mode]?.text || ""}</p>
      </section>

      <div class="section-t">Чакат решение</div>
      <section class="card">
        ${big.length ? html`<div class="list">${big.map(decisionRow)}</div>` : html`<div class="empty">${icon("check")}<p>Няма кампании, които чакат решение.</p></div>`}
      </section>

      ${ads.length ? html`
        <div class="row" style="margin:26px 4px 10px"><div class="section-t grow" style="margin:0">Реклами, които губят – ${ads.length}</div><button class="btn sm primary" data-act="pauseAll" data-ids="${ads.map((p) => p.id).join(",")}">Спри всички</button></div>
        <section class="card">
          <div class="list">${ads.slice(0, 8).map((p) => decisionRow([p]))}</div>
          ${ads.length > 8 ? html`<details style="margin-top:6px"><summary class="small muted" style="cursor:pointer;padding:8px 0">Покажи още ${ads.length - 8}</summary><div class="list">${ads.slice(8).map((p) => decisionRow([p]))}</div></details>` : ""}
        </section>` : ""}

      ${tasks.length ? html`<a class="card row" href="#studio" style="margin-top:18px;color:inherit;gap:14px">
          <div class="ic violet" style="width:36px;height:36px;border-radius:50%;display:grid;place-items:center">${icon("sparkles")}</div>
          <div class="grow"><div class="strong">Нужни са нови реклами</div><div class="small muted">Кошер е подготвил идеите – направи ги с един бутон.</div></div>
          ${icon("chevron")}
        </a>` : ""}

      ${alerts.length ? html`<div class="section-t">За сведение</div>
        <section class="card"><div class="list">${alerts.map((p) => html`<div class="item">
          <div class="ic ${p.rule === "tracking_guard" || p.rule === "margin_floor" ? "bad" : "info"}">${icon("alert")}</div>
          <div class="body"><div class="t">${p.title}</div><div class="r">${p.reason}</div></div>
          <div class="acts"><button class="btn sm ghost" data-act="dismiss" data-group="${p.id}" title="Скрий" aria-label="Скрий">${icon("x")}</button></div>
        </div>`)}</div></section>` : ""}

      <details class="card" style="margin-top:26px">
        <summary>${icon("gear")} Още настройки – граници, правила, дневник</summary>
        <div class="row" style="margin-bottom:14px"><button class="btn sm" data-act="revert">${icon("undo")} Върни промените от последните 24 часа</button></div>
        <h3 style="margin:6px 0 10px">Граници</h3>
        <p class="small muted" style="margin:-4px 0 12px">Автопилотът никога не ги прекрачва сам.</p>
        <form class="grid g4" id="limits" style="gap:12px">
          <div class="field"><label>Таван на дневния разход (€)</label><input class="input" name="maxDailySpend" type="number" value="${L.maxDailySpend}"></div>
          <div class="field"><label>Сам до +% наведнъж</label><input class="input" name="autoUpPct" type="number" value="${L.autoUpPct}"></div>
          <div class="field"><label>Най-много увеличение %</label><input class="input" name="maxUpPct" type="number" value="${L.maxUpPct}"></div>
          <div class="field"><label>Най-много намаление %</label><input class="input" name="maxDownPct" type="number" value="${L.maxDownPct}"></div>
          <div class="field"><label>Изчакай след увеличение (ч)</label><input class="input" name="cooldownUpH" type="number" value="${L.cooldownUpH}"></div>
          <div class="field"><label>Изчакай след намаление (ч)</label><input class="input" name="cooldownDownH" type="number" value="${L.cooldownDownH}"></div>
          <div class="field"><label>Най-много ръст за седмица %</label><input class="input" name="maxWeeklyUpPct" type="number" value="${L.maxWeeklyUpPct}"></div>
          <div class="field"><label>Действия на една проверка</label><input class="input" name="maxActionsPerRun" type="number" value="${L.maxActionsPerRun}"></div>
        </form>
        <div class="row" style="margin-top:12px"><button class="btn primary sm" data-act="saveLimits">Запази</button></div>

        <h3 style="margin:28px 0 4px">Правила</h3>
        <p class="small muted" style="margin:0 0 6px">„Доверие“ – колко често правилото се е оказало право.</p>
        ${groupsOfRules.map((g) => html`<div class="small muted" style="margin:14px 0 2px;font-weight:600">${g}</div><div class="list">${d.rules.filter((r) => r.group === g).map((r) => html`<div class="item">
          <label class="switch" style="margin-top:2px"><input type="checkbox" data-act="rule" data-id="${r.id}" ${r.on ? "checked" : ""} aria-label="${r.title}"><span></span></label>
          <div class="body"><div class="t">${r.title}</div><div class="r">${r.text}</div></div>
          <div class="acts">${r.trust ? html`<span class="pill ${r.trust.trust >= 0.6 ? "good" : r.trust.trust >= 0.4 ? "honey" : "warn"}" title="${r.trust.good} от ${r.trust.n} решения се оказаха правилни">доверие ${Math.round(r.trust.trust * 100)}%</span>` : ""}</div>
        </div>`)}</div>`)}

        <h3 style="margin:28px 0 10px">Дневник</h3>
        ${d.history.length ? html`<div class="list">${d.history.slice(0, 30).map((h) => html`<div class="item">
          <div class="body"><div class="t">${h.title}</div><div class="r">${shortDate((h.executedAt || h.decidedAt || "").slice(0, 10))} · ${h.by === "auto" ? "автопилотът" : "ти"} · ${h.reason}</div></div>
          <div class="acts"><span class="pill ${(STATUS[h.status] || [])[1] || ""}">${(STATUS[h.status] || [h.status])[0]}</span>${h.outcome ? html`<span class="pill ${h.outcome.good ? "good" : "bad"}" title="Марж преди ${eur(h.outcome.cmBefore)} → след ${eur(h.outcome.cmAfter)}">${h.outcome.good ? "помогна" : "не помогна"}</span>` : ""}</div>
        </div>`)}</div>` : html`<div class="empty small">Още няма действия.</div>`}
      </details>`;
  },
  mount(page, ctx) {
    const changed = () => {
      window.dispatchEvent(new Event("pilot:changed"));
      ctx.refresh();
    };
    page.addEventListener("change", async (e) => {
      const t = e.target;
      try {
        if (t.dataset.act === "pause") {
          await ctx.call("saveSettings", { paused: !t.checked });
          toast(t.checked ? "Автопилотът е включен" : "Автопилотът е спрян – нищо не се променя само");
          changed();
        } else if (t.dataset.act === "rule") {
          await ctx.call("saveSettings", { rules: { [t.dataset.id]: { on: t.checked } } });
          toast(t.checked ? "Правилото е включено" : "Правилото е изключено");
          ctx.refresh();
        }
      } catch (err) {
        toast(err.message);
      }
    });
    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "INPUT") return;
      const act = b.dataset.act;
      try {
        if (act === "choose") {
          b.disabled = true;
          await ctx.call("approve", b.dataset.id);
          // The other options for the same campaign are no longer needed.
          for (const id of b.dataset.group.split(",")) if (id !== b.dataset.id) await ctx.call("reject", id).catch(() => {});
          toast("Готово");
          changed();
        } else if (act === "dismiss") {
          b.disabled = true;
          for (const id of b.dataset.group.split(",")) await ctx.call("reject", id).catch(() => {});
          toast("Оставено така");
          changed();
        } else if (act === "pauseAll") {
          const ids = b.dataset.ids.split(",");
          if (!(await ask(`Да спра ли всички ${ids.length} реклами, които губят?`, { ok: "Спри всички" }))) return;
          b.disabled = true;
          let done = 0;
          for (const id of ids) {
            try {
              await ctx.call("approve", id);
              done++;
            } catch {}
          }
          toast(`Спрени: ${done} от ${ids.length}`);
          changed();
        } else if (act === "mode") {
          await ctx.call("saveSettings", { mode: b.dataset.v });
          toast("Режимът е сменен");
          changed();
        } else if (act === "revert") {
          if (!(await ask("Да върна ли всички промени по бюджети и паузи от последните 24 часа?", { ok: "Върни" }))) return;
          const r = await ctx.call("revert24h");
          toast(`Върнати: ${r.reverted}`);
          ctx.refresh();
        } else if (act === "saveLimits") {
          const f = new FormData(page.querySelector("#limits"));
          const limits = {};
          for (const [k, v] of f.entries()) if (v !== "") limits[k] = Number(v);
          await ctx.call("saveSettings", { limits });
          toast("Запазено");
          ctx.refresh();
        }
      } catch (err) {
        toast(err.message);
        b.disabled = false;
      }
    });
  },
};
