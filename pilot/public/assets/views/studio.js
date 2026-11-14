import { html, icon, toast, esc, modal } from "../ui.js";
import { creativeCard } from "./creatives.js";

let last = null;
let checkResult = null;
let checkInput = { tags: {}, hookText: "", script: "", country: "BG" };

export default {
  range: false,
  async render({ call, arg }) {
    const d = await call("creatives");
    const accounts = d.perAccount;
    const drafts = d.items.filter((c) => ["draft", "review", "generating"].includes(c.status)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const focus = arg ? d.items.find((c) => c.id === arg) : null;
    const sel = (key) => {
      const dim = d.dims.find((x) => x.key === key);
      return html`<div class="field"><label>${dim.label}</label><select class="select" data-tag="${key}"><option value="">—</option>${Object.entries(dim.values).map(([k, v]) => html`<option value="${k}" ${checkInput.tags[key] === k ? "selected" : ""}>${v}</option>`)}</select></div>`;
    };
    return html`
      ${focus ? html`<section class="card" style="margin-bottom:16px;border-color:var(--honey)">
        <div class="card-h"><h2>${icon("video")} Генерирай: ${focus.name}</h2><button class="btn ghost sm" data-act="unfocus">Затвори</button></div>
        <div class="grid g2">
          <div class="stack">
            <p class="strong" style="margin:0">„${focus.hookText}“</p>
            ${focus.script ? html`<pre class="script">${focus.script}</pre>` : ""}
            ${focus.compliance ? html`<div class="stack" style="gap:6px">${focus.compliance.issues.length ? focus.compliance.issues.map((i) => html`<div class="issue ${i.level}">${i.text}</div>`) : html`<div class="issue">${icon("check")} Текстът минава проверката</div>`}</div>` : ""}
          </div>
          <div class="stack">
            <div class="field"><label>Модел</label><select class="select" id="prov">${d.providers.filter((p) => ["video", "avatar", "image"].includes(p.kind)).map((p) => html`<option value="${p.id}">${p.name} – ${p.use} (${p.price})</option>`)}</select></div>
            <div class="issue">${icon("shield")}<div>Видеото се прави <b>без говор и без текст</b>. Гласът (ElevenLabs v3 или истински човек) и надписите на ${esc(focus.country)} се добавят отделно – така диакритиката и твърденията са точни. Реалистичен AI човек получава етикет „Създадено с изкуствен интелект“.</div></div>
            <button class="btn honey" data-act="generate" data-id="${focus.id}" ${focus.compliance && !focus.compliance.ok ? "disabled" : ""}>${icon("wand")} Генерирай</button>
            <p class="tiny muted" style="margin:0">След генериране креативът отива „За преглед“. Ти го одобряваш и чак тогава става резерва.</p>
          </div>
        </div>
      </section>` : ""}
      <div class="grid g2">
        <section class="card">
          <div class="card-h"><h2>${icon("wand")} Нови концепции</h2></div>
          <p class="small muted" style="margin-top:-6px">Пилотът избира комбинации, които <b>още не сте правили</b> или които печелят, проверява ги срещу всичко досега и срещу правилата за твърдения.</p>
          <div class="grid g2" style="gap:10px">
            <div class="field"><label>Акаунт</label><select class="select" id="bAcct">${accounts.map((a) => html`<option value="${a.id}">${a.flag} ${a.name}</option>`)}</select></div>
            <div class="field"><label>Брой</label><select class="select" id="bCount">${[2, 3, 4, 6, 8].map((n) => html`<option ${n === 4 ? "selected" : ""}>${n}</option>`)}</select></div>
          </div>
          <div class="field" style="margin-top:10px"><label>Продукт</label><input class="input" id="bProduct" value="BeeVenom Care Gel"></div>
          <div class="row" style="margin-top:12px"><button class="btn primary" data-act="briefs">${icon("sparkles")} Направи концепции</button></div>
          ${last ? html`<div class="banner ${last.created ? "" : "bad"}" style="margin:14px 0 0">${last.created ? `Готови ${last.created} нови концепции${last.ai ? " (написани от Claude)" : " (по шаблон – AI не е свързан)"}.` : "Всички предложения се оказаха повторения – опитай пак."}</div>` : ""}
        </section>
        <section class="card">
          <div class="card-h"><h2>${icon("shield")} Провери идея, преди да я снимаш</h2></div>
          <div class="grid g3" style="gap:8px">${["angle", "persona", "format", "hook", "visual", "talent"].map(sel)}</div>
          <div class="field" style="margin-top:8px"><label>Първото изречение (кука)</label><input class="input" id="cHook" value="${checkInput.hookText}" placeholder="напр. Пак ли не можете да се наведете в градината?"></div>
          <div class="field" style="margin-top:8px"><label>Сценарий / текст (по желание)</label><textarea class="input" id="cScript" rows="3">${checkInput.script}</textarea></div>
          <div class="row" style="margin-top:10px"><button class="btn" data-act="check">${icon("eye")} Провери</button></div>
          ${checkResult ? html`<div class="stack" style="gap:8px;margin-top:12px">
            <div class="row"><span class="pill ${checkResult.verdict.level === "new" ? "good" : checkResult.verdict.level === "related" ? "info" : "warn"}">${checkResult.verdict.label} · сходство ${checkResult.score}%</span><span class="small muted">${checkResult.verdict.hint}</span></div>
            ${checkResult.nearest.length ? html`<div class="small"><b>Най-близко досега:</b> ${checkResult.nearest.map((n) => html`<div class="muted">• ${n.name} (${n.score}%) – „${n.hookText || ""}“</div>`)}</div>` : ""}
            ${checkResult.compliance.issues.length ? checkResult.compliance.issues.map((i) => html`<div class="issue ${i.level}">${i.text}</div>`) : html`<div class="issue">${icon("check")} Текстът минава проверката</div>`}
          </div>` : ""}
        </section>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Идеи и чакащи преглед (${drafts.length})</h2><a class="small" href="#kreativi">Всички креативи →</a></div>
        ${drafts.length ? html`<div class="cards">${drafts.slice(0, 24).map((c) => creativeCard(c, d.dims, { actions: html`${c.status === "draft" ? html`<button class="btn sm honey" data-act="focus" data-id="${c.id}">${icon("video")} Генерирай</button>` : ""}${c.status === "review" ? html`<button class="btn sm good" data-act="approveCr" data-id="${c.id}">${icon("check")} Одобри → резерва</button>` : ""}<button class="btn sm ghost" data-act="show" data-id="${c.id}">${icon("eye")} Сценарий</button>` }))}</div>` : html`<div class="empty">Още няма идеи. Натисни „Направи концепции“.</div>`}
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Инструменти (ноември 2026)</h2><span class="hint">Сменят се през седмици – в „Обучение → Радар“ следим новото</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Инструмент</th><th>За какво</th><th>Цена</th><th>Достъп</th></tr></thead><tbody>
        ${d.providers.map((p) => html`<tr><td><b class="strong">${p.name}</b></td><td class="l" style="white-space:normal">${p.use}</td><td>${p.price}</td><td>${p.route}</td></tr>`)}
        </tbody></table></div>
      </section>`;
  },
  mount(page, ctx) {
    page.addEventListener("change", (e) => {
      const t = e.target.dataset.tag;
      if (t) checkInput.tags[t] = e.target.value || undefined;
    });
    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      try {
        if (act === "focus" || act === "unfocus") {
          ctx.state.focus = act === "focus" ? b.dataset.id : null;
          ctx.refresh();
          window.scrollTo({ top: 0 });
        } else if (act === "briefs") {
          b.disabled = true;
          b.textContent = "Мисля…";
          last = await ctx.call("briefs", { account: page.querySelector("#bAcct").value, count: Number(page.querySelector("#bCount").value), product: page.querySelector("#bProduct").value });
          ctx.refresh();
        } else if (act === "check") {
          checkInput.hookText = page.querySelector("#cHook").value;
          checkInput.script = page.querySelector("#cScript").value;
          checkResult = await ctx.call("check", { ...checkInput });
          ctx.refresh();
        } else if (act === "generate") {
          b.disabled = true;
          await ctx.call("generate", { id: b.dataset.id, provider: page.querySelector("#prov").value });
          toast("Изпратено за генериране – ще го видиш „За преглед“");
          ctx.state.focus = null;
          ctx.refresh();
        } else if (act === "approveCr") {
          await ctx.call("approveCreative", b.dataset.id);
          toast("Одобрено – в резервите");
          ctx.refresh();
        } else if (act === "show") {
          const d = await ctx.call("creatives");
          const c = d.items.find((x) => x.id === b.dataset.id);
          modal(`<div class="row between"><h2>${esc(c.name)}</h2><button class="btn ghost sm" data-close>✕</button></div><p class="strong">„${esc(c.hookText)}“</p>${c.script ? `<pre class="script">${esc(c.script)}</pre>` : ""}${c.firstFrame ? `<p class="small muted">${esc(c.firstFrame)}</p>` : ""}<div class="stack" style="gap:6px;margin-top:10px">${(c.compliance?.issues || []).map((i) => `<div class="issue ${i.level}">${esc(i.text)}</div>`).join("")}</div>`);
        }
      } catch (err) {
        toast(err.message);
        b.disabled = false;
      }
    });
  },
};
