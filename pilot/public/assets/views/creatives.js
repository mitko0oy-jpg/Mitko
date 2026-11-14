import { html, icon, eur, eur0, int, pct, thumbStyle, meter, toast, modal, esc } from "../ui.js";
import { STAGE_TONE, STAGE_LABEL } from "./common.js";

let tab = "live";
let acct = "all";
const STATUS_LABEL = { live: "В реклама", bench: "Резерва", draft: "Идея", review: "За преглед", generating: "Генерира се", retired: "Спряна" };
const STATUS_TONE = { live: "good", bench: "honey", draft: "info", review: "violet", generating: "info", retired: "muted" };

export function tagChips(tags, dims) {
  const lab = (k, v) => dims.find((d) => d.key === k)?.values?.[v] || v;
  return html`<div class="tags">${["angle", "persona", "format", "visual", "talent"].filter((k) => tags?.[k]).map((k) => html`<span title="${dims.find((d) => d.key === k)?.label}">${lab(k, tags[k])}</span>`)}</div>`;
}

export function creativeCard(c, dims, { actions = "" } = {}) {
  const f = c.fatigue;
  const s = c.stats;
  return html`<article class="cr">
    <div class="thumb" style="${thumbStyle(c.id)}">
      <div class="badges"><span class="pill">${STATUS_LABEL[c.status] || c.status}</span>${f ? html`<span class="pill">${STAGE_LABEL[f.stage]}</span>` : ""}${c.kind === "video" ? html`<span class="pill">видео</span>` : html`<span class="pill">изображение</span>`}</div>
      <span>„${c.hookText || c.name}“</span>
    </div>
    <div class="b">
      <div class="strong" style="font-size:14px">${c.name}</div>
      ${tagChips(c.tags, dims)}
      ${f && f.stage !== "learning" ? html`<div><div class="row between tiny"><span class="muted">Умора</span><span class="strong">${f.score}/100${f.stage === "burned" ? " · смени я" : f.daysLeft != null ? html` · ~${f.daysLeft} дни живот` : ""}</span></div>${meter(f.score, true)}<div class="tiny muted" style="margin-top:4px">${f.text}</div></div>` : ""}
      ${s ? html`<div class="stats"><div>Разход<b>${eur0(s.spend)}</b></div><div>Цена/поръчка<b>${eur(s.cpo)}</b></div><div>Марж<b>${pct(s.cmPct)}</b></div><div>CTR<b>${pct(s.ctr, 2)}</b></div><div title="3-сек. гледания ÷ показвания">Кука<b>${c.kind === "video" ? pct(s.hook) : "—"}</b></div><div title="Гледания до край ÷ 3-сек.">Задържане<b>${c.kind === "video" ? pct(s.hold) : "—"}</b></div></div>` : ""}
      ${c.compliance && !c.compliance.ok ? html`<div class="issue block">${icon("shield")} ${c.compliance.issues.find((i) => i.level === "block")?.text}</div>` : ""}
      ${c.novelty ? html`<div class="tiny"><span class="pill ${c.novelty.level === "new" ? "good" : c.novelty.level === "related" ? "info" : "warn"}">${c.novelty.label} · сходство ${c.novelty.score}%</span></div>` : ""}
    </div>
    ${actions ? html`<div class="foot">${actions}</div>` : ""}
  </article>`;
}

export default {
  range: false,
  async render({ call }) {
    const d = await call("creatives");
    const items = d.items.filter((c) => acct === "all" || c.account === acct);
    const live = items.filter((c) => c.status === "live").sort((a, b) => (b.fatigue?.score || 0) - (a.fatigue?.score || 0));
    const pipeline = items.filter((c) => ["bench", "draft", "review", "generating"].includes(c.status));
    const tabs = [["live", `Живи (${live.length})`], ["bench", `Резерви и идеи (${pipeline.length})`], ["andromeda", "Андромеда"], ["works", "Какво работи"], ["map", "Карта на идеите"]];
    let body;
    if (tab === "live") {
      body = live.length ? html`<div class="cards">${live.map((c) => creativeCard(c, d.dims))}</div>` : html`<div class="card empty">Няма активни реклами.</div>`;
    } else if (tab === "bench") {
      const adsets = d.adsets;
      body = pipeline.length
        ? html`<div class="cards">${pipeline.map((c) =>
            creativeCard(c, d.dims, {
              actions: html`${c.status === "draft" ? html`<button class="btn sm honey" data-act="focus" data-id="${c.id}">${icon("video")} Генерирай</button>` : ""}${c.status === "review" ? html`<button class="btn sm good" data-act="approveCr" data-id="${c.id}">${icon("check")} Одобри</button>` : ""}${c.status === "bench" ? html`<button class="btn sm good" data-act="launch" data-id="${c.id}" data-account="${c.account || ""}">${icon("upload")} Пусни</button>` : ""}<button class="btn sm ghost" data-act="show" data-id="${c.id}">${icon("eye")} Виж</button>`,
            }),
          )}</div>`
        : html`<div class="card empty">${icon("wand")}<p>Няма готови резерви. <a href="#studio">Направи нови концепции</a>.</p></div>`;
      this._adsets = adsets;
    } else if (tab === "andromeda") {
      body = html`
        <div class="banner info">${icon("brain")}<div>Андромеда (системата на Мета, която избира кои реклами да влязат в търга) групира сходните реклами. За нея 10 варианта на една идея са <b>една</b> реклама. Различна концепция = различни поне 3 от 5: ъгъл, човек, кука/първи кадър, формат, лице или обстановка. Колоната „Разнообразие на креативите“ в Мета сравнява първите кадри.</div></div>
        <div class="grid g2">${d.perAccount.filter((a) => acct === "all" || a.id === acct).map((a) => html`<section class="card">
          <div class="card-h"><h2>${a.flag} ${a.name}</h2><span class="pill ${a.diversity.score >= 70 ? "good" : a.diversity.score >= 50 ? "honey" : "warn"}">${a.diversity.score}/100</span></div>
          <dl class="kv"><dt>Активни реклами</dt><dd>${a.diversity.ads}</dd><dt>Различни концепции (както ги вижда Мета)</dt><dd>${a.diversity.concepts}</dd><dt>Резерви / нужни</dt><dd>${a.bench.bench} / ${a.bench.needed}</dd></dl>
          ${a.diversity.issues.length ? html`<div class="stack" style="gap:6px;margin-top:10px">${a.diversity.issues.map((i) => html`<div class="issue warn">${icon("alert")} ${i}</div>`)}</div>` : ""}
          <div class="sep"></div>
          <h3 style="margin-bottom:8px">Групи, които Мета вижда като една реклама</h3>
          <div class="stack" style="gap:6px">${a.diversity.groups.filter((g) => g.length > 1).map((g) => html`<div class="issue">${icon("copy")} <div><b>${g.length} реклами:</b> ${g.join(" · ")}</div></div>`)}${a.diversity.groups.every((g) => g.length < 2) ? html`<div class="muted small">Няма повторения 👍</div>` : ""}</div>
          <div class="sep"></div>
          <h3 style="margin-bottom:8px">Неизползвани посоки</h3>
          <div class="chip-row">${a.diversity.missing.map((m) => html`<span class="pill">${m.label}</span>`)}</div>
        </section>`)}</div>
        <section class="card" style="margin-top:16px"><div class="card-h"><h2>По адсети</h2></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Адсет</th><th>Реклами</th><th>Концепции</th><th>Резултат</th><th>Какво липсва</th></tr></thead><tbody>
          ${d.adsets.filter((s) => acct === "all" || s.account === acct).map((s) => html`<tr><td>${s.name}</td><td>${s.activeAds}</td><td>${s.diversity.concepts}</td><td><span class="pill ${s.diversity.score >= 70 ? "good" : s.diversity.score >= 50 ? "honey" : "warn"}">${s.diversity.score}</span></td><td class="l small muted" style="white-space:normal">${s.diversity.issues.join(" ")}</td></tr>`)}
          </tbody></table></div></section>`;
    } else if (tab === "works") {
      const byCountry = {};
      for (const t of d.tags) (byCountry[t.country] ||= []).push(t);
      body = html`<div class="grid g2">${Object.entries(byCountry).map(([c, list]) => html`<section class="card">
        <div class="card-h"><h2>${c}</h2><span class="hint">Дял „победи“ (марж на евро над средното)</span></div>
        ${d.insights[c]?.top?.length ? html`<div class="issue" style="margin-bottom:10px">${icon("up")}<div><b>Печели:</b> ${d.insights[c].top.join("; ")}</div></div>` : ""}
        <div class="stack" style="gap:7px">${list.sort((a, b) => b.rate - a.rate).slice(0, 14).map((t) => html`<div><div class="row between small"><span>${t.label} <span class="faint">· ${d.dims.find((x) => x.key === t.dim)?.label} · ${t.n} рекл.</span></span><b class="strong">${Math.round(t.rate * 100)}%</b></div>${meter(t.rate * 100)}</div>`)}</div>
      </section>`)}</div>
      <p class="tiny faint">Бета-разпределения: всяка нова реклама обновява вероятността даден ъгъл, човек или формат да печели. Генераторът използва това, за да повтаря печелившото и да тества неизпитаното (Thompson sampling).</p>`;
    } else {
      const angles = d.dims.find((x) => x.key === "angle").values, formats = d.dims.find((x) => x.key === "format").values;
      const cols = Object.keys(formats).length + 1;
      body = html`<section class="card"><div class="card-h"><h2>Ъгъл × формат – какво сме правили</h2><span class="hint">Празните клетки са идеи, които още не сме тествали</span></div>
        <div class="tbl-wrap"><div class="heat" style="grid-template-columns:150px repeat(${cols - 1},minmax(64px,1fr));min-width:780px">
          <div class="h"></div>${Object.values(formats).map((f) => html`<div class="h" style="text-align:center">${f}</div>`)}
          ${Object.entries(angles).map(([ak, al]) => html`<div class="h">${al}</div>${Object.keys(formats).map((fk) => {
            const n = d.matrix[`${ak}|${fk}`] || 0;
            return html`<div class="v${Math.min(3, n)}" title="${al} × ${formats[fk]}: ${n}">${n || "·"}</div>`;
          })}`)}
        </div></div></section>`;
    }
    return html`
      <div class="row" style="margin-bottom:14px">
        <div class="seg">${tabs.map(([k, l]) => html`<button data-act="tab" data-v="${k}" class="${tab === k ? "on" : ""}">${l}</button>`)}</div>
        <span class="grow"></span>
        <select class="select" style="width:auto" data-act="acct" aria-label="Акаунт"><option value="all">Всички акаунти</option>${d.perAccount.map((a) => html`<option value="${a.id}" ${acct === a.id ? "selected" : ""}>${a.flag} ${a.name}</option>`)}</select>
        <a class="btn honey sm" href="#studio">${icon("wand")} Нови концепции</a>
      </div>
      ${body}`;
  },
  mount(page, ctx) {
    const self = this;
    page.addEventListener("change", (e) => {
      if (e.target.dataset.act === "acct") {
        acct = e.target.value;
        ctx.refresh();
      }
    });
    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "SELECT") return;
      const act = b.dataset.act;
      if (act === "focus") {
        ctx.state.focus = b.dataset.id;
        location.hash = "#studio";
      } else if (act === "tab") {
        tab = b.dataset.v;
        ctx.refresh();
      } else if (act === "approveCr") {
        await ctx.call("approveCreative", b.dataset.id);
        toast("Одобрено – вече е в резервите");
        ctx.refresh();
      } else if (act === "launch") {
        const adsets = (self._adsets || []).filter((s) => !b.dataset.account || s.account === b.dataset.account);
        modal(`<h2>Пусни в адсет</h2><p class="muted small">Рекламата се качва в Мета. Новите реклами винаги се пускат само от теб.</p>
          <div class="field"><label>Адсет</label><select class="select" id="asSel">${adsets.map((s) => `<option value="${s.id}">${esc(s.name)} (${s.activeAds} реклами, разнообразие ${s.diversity.score})</option>`).join("")}</select></div>
          <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-close>Откажи</button><button class="btn good" id="goLaunch">Пусни</button></div>`, (m, close) => {
          m.querySelector("#goLaunch").addEventListener("click", async () => {
            try {
              await ctx.call("launch", { id: b.dataset.id, adset: m.querySelector("#asSel").value });
              close();
              toast("Пусната – влиза в обучение");
              ctx.refresh();
            } catch (err) {
              toast(err.message);
            }
          });
        });
      } else if (act === "show") {
        const d = await ctx.call("creatives");
        const c = d.items.find((x) => x.id === b.dataset.id);
        if (!c) return;
        modal(`<div class="row between"><h2>${esc(c.name)}</h2><button class="btn ghost sm" data-close>✕</button></div>
          <p class="strong">„${esc(c.hookText || "")}“</p>
          ${c.script ? `<pre class="script">${esc(c.script)}</pre>` : ""}
          ${c.firstFrame ? `<p class="small muted">${esc(c.firstFrame)}</p>` : ""}
          ${c.compliance ? `<div class="stack" style="gap:6px;margin-top:10px">${c.compliance.issues.map((i) => `<div class="issue ${i.level}">${esc(i.text)}</div>`).join("") || '<div class="issue">✓ Текстът минава проверката</div>'}</div>` : ""}
          ${c.translations ? `<div class="stack small" style="margin-top:10px">${Object.entries(c.translations).map(([k, v]) => `<div><b>${k.toUpperCase()}:</b> ${esc(v)}</div>`).join("")}</div>` : ""}`);
      }
    });
  },
};
