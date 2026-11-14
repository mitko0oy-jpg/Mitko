// New ads – one button. Кошер decides what needs replacing and with which NEW idea;
// "Направи" draws 4 banners (ChatGPT image model via Higgsfield); "Пусни" puts the
// chosen one into the right ad set and pauses the ad it replaces.
import { html, raw, icon, toast, esc, modal, thumbStyle, ask } from "../ui.js";

const isDemoUrl = (u) => String(u || "").startsWith("demo:");
function pic(url, hook, id, cls = "") {
  if (!url || isDemoUrl(url)) return html`<div class="mk-img ${cls}" style="${thumbStyle(id || url || hook)}"><span>${hook}</span></div>`;
  return html`<img class="mk-img ${cls}" src="${url}" alt="${hook}" loading="lazy">`;
}
const STATUS = { making: ["Рисува се…", "info"], ready: ["Готово – избери", "honey"], live: ["Пусната", "good"], failed: ["Не се получи", "bad"] };

export default {
  range: false,
  async render({ call }) {
    const d = await call("studio");
    const off = d.connected === "missing";
    return html`
      <section class="card">
        <div class="card-h"><h2>${icon("wand")} Нова реклама</h2>${d.connected === "demo" ? html`<span class="pill honey">демо</span>` : off ? html`<span class="pill warn">Higgsfield не е свързан</span>` : html`<span class="pill good">Higgsfield свързан</span>`}</div>
        <p class="small muted" style="margin-top:-6px">Кошер следи кои реклами не продават евтино и кои изгарят и предлага <b>нова идея</b> на тяхно място – различна от всичко в адсета. Банерите ги рисува ChatGPT (GPT Image 2.5) през Higgsfield: 4 варианта на идеята, ти избираш един и го пускаш.</p>
        <div class="row">
          <select class="select" id="mkLine" style="width:auto">${d.lines.map((l) => html`<option value="${l.id}">${l.flag || ""} ${l.name}</option>`)}</select>
          <button class="btn honey" data-act="make" ${off ? "disabled" : ""}>${icon("sparkles")} Направи нова реклама</button>
        </div>
        ${off ? html`<div class="issue warn" style="margin-top:12px">${icon("alert")}<div><b>За да рисува:</b> 1) console.higgsfield.ai → API Keys → създай ключ; 2) зареди баланс (от $5; банер ≈ $0,08); 3) в Netlify → kosher-reklami → Environment variables добави HIGGSFIELD_API_KEY със стойност „ID:SECRET“ (не го пращай в чата).</div></div>` : ""}
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>${icon("flame")} Трябват сега</h2><span class="pill info">${d.needs.length}</span></div>
        ${d.needs.length
          ? html`<div class="list">${d.needs.map((n) => html`<div class="item">
              <div class="ic ${n.kind === "replace" ? "bad" : "honey"}">${icon(n.kind === "replace" ? "refresh" : "plus")}</div>
              <div class="body">
                <div class="t">${n.kind === "replace" ? html`Замени „${n.replaces.name}“` : html`Резерва за ${n.lineName}`}</div>
                <div class="r">${n.lineName} · ${n.reason}</div>
                <div class="r"><b class="strong">Нова идея:</b> ${n.concept.summary}${n.concept.layout?.trend ? html` <span class="pill violet">актуален формат</span>` : ""}</div>
              </div>
              <div class="acts"><button class="btn sm honey" data-act="make" data-slot="${n.id}" ${off ? "disabled" : ""}>${icon("sparkles")} Направи</button></div>
            </div>`)}</div>`
          : html`<div class="empty">${icon("check")}<p>Всички реклами продават в рамките на допустимото. Когато някоя поскъпне или изгори, ще се появи тук.</p></div>`}
      </section>

      <details class="card" style="margin-top:16px">
        <summary class="strong" style="cursor:pointer">${icon("shield")} Правилата, по които се правят рекламите</summary>
        <ol class="rules">${d.rules.map((r) => html`<li><b>${r.t}.</b> <span class="muted">${r.d}</span></li>`)}</ol>
      </details>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Направени</h2><span class="hint">Последните 24</span></div>
        ${d.made.length
          ? html`<div class="mk-grid">${d.made.map((m) => html`<button class="mk-card" data-act="open" data-id="${m.id}">
              ${pic(m.images?.[0], m.hookText, m.id)}
              <div class="mk-cap"><span class="pill ${(STATUS[m.status] || [])[1]}">${(STATUS[m.status] || [m.status])[0]}</span><b>${m.hookText}</b><span class="tiny muted">${m.lineName}</span></div>
            </button>`)}</div>`
          : html`<div class="empty small">Още няма. Натисни „Направи“.</div>`}
      </section>`;
  },

  mount(page, ctx) {
    let timer = null;
    const stop = () => {
      clearTimeout(timer);
      timer = null;
    };

    function openDoc(doc) {
      let current = doc;
      const close = modal(`<div id="mkBody"></div>`, (m, closeFn) => {
        const body = m.querySelector("#mkBody");
        const draw = () => {
          const d = current;
          const st = STATUS[d.status] || [d.status, ""];
          body.innerHTML = String(html`
            <div class="row between"><h2>${d.hookText}</h2><button class="btn ghost sm" data-close>✕</button></div>
            <p class="small muted" style="margin:4px 0 10px">${d.lineName} · ${d.concept.summary}${d.replaces ? html` · заменя „${d.replaces.name}“` : ""}</p>
            <div class="row" style="margin-bottom:12px"><span class="pill ${st[1]}">${st[0]}</span>${d.adsetName ? html`<span class="pill">адсет: ${d.adsetName}</span>` : ""}</div>
            ${d.status === "making" ? html`<div class="mk-wait">${icon("refresh")} ChatGPT рисува 4 банера по идеята… обикновено до минута-две. Можеш да затвориш – ще ги намериш в „Направени“.</div>` : ""}
            ${d.status === "failed" ? html`<div class="issue block">${d.error || "Не се получи."}</div>` : ""}
            ${d.images?.length ? html`<div class="mk-pick">${d.images.map((u, i) => html`<div class="mk-opt">${pic(u, d.hookText, d.id + i)}
                ${d.status === "ready" ? html`<div class="row" style="gap:6px;margin-top:6px"><button class="btn sm good" data-do="launch" data-img="${u}">${icon("upload")} Пусни</button><button class="btn sm" data-do="video" data-img="${u}">${icon("video")} Видео</button></div>` : ""}
                ${d.launchedWith === u ? html`<span class="pill good" style="margin-top:6px">пусната</span>` : ""}</div>`)}</div>` : ""}
            ${d.concept.layout ? html`<div class="mk-struct" style="margin-top:12px"><b>Структура: ${d.concept.layout.name}</b>${d.concept.layout.trend ? html` <span class="pill violet">актуално 2026</span>` : ""}<ol>${d.concept.layout.steps.map((x) => html`<li>${x}</li>`)}</ol>${d.concept.why?.length ? html`<div class="tiny muted">Защо тази идея: ${d.concept.why.slice(0, 3).join(" · ")}</div>` : ""}</div>` : ""}
            ${d.videoJob ? html`<div class="sep"></div><h3 style="margin-bottom:8px">${icon("video")} Видео (5 сек.)</h3>
              ${d.videoUrl ? html`${isDemoUrl(d.videoUrl) ? pic(null, "демо видео", d.id + "v", "mk-video") : html`<video class="mk-video" src="${d.videoUrl}" controls playsinline muted loop></video>`}
                ${d.status !== "live" ? html`<div class="row" style="margin-top:8px"><button class="btn sm good" data-do="launchVideo">${icon("upload")} Пусни видеото</button></div>` : ""}`
              : d.videoError ? html`<div class="issue block">${d.videoError}</div>` : html`<div class="mk-wait">${icon("refresh")} Видеото се прави… 1–3 минути.</div>`}` : ""}
            <div class="sep"></div>
            <div class="row" style="justify-content:space-between"><span class="tiny muted">Ако не продава евтино, Кошер ще я предложи за смяна.</span>${d.status !== "live" ? html`<button class="btn sm" data-do="another">${icon("sparkles")} Друга идея</button>` : ""}</div>`);
        };
        const tick = async () => {
          try {
            current = await ctx.call("makeStatus", current.id);
            if (!document.body.contains(body)) return stop();
            draw();
            const waiting = current.status === "making" || (current.videoJob && !current.videoUrl && !current.videoError);
            if (waiting) timer = setTimeout(tick, 4000);
          } catch (e) {
            toast(e.message);
          }
        };
        draw();
        stop();
        timer = setTimeout(tick, current.status === "making" ? 2500 : 10);
        body.addEventListener("click", async (e) => {
          const b = e.target.closest("[data-do]");
          if (!b) return;
          b.disabled = true;
          try {
            if (b.dataset.do === "launch" || b.dataset.do === "launchVideo") {
              const video = b.dataset.do === "launchVideo";
              const msg = current.replaces ? `Пускам ${video ? "видеото" : "този банер"} в „${current.adsetName}“ и спирам „${current.replaces.name}“?` : `Пускам ${video ? "видеото" : "този банер"} в „${current.adsetName}“?`;
              if (!(await ask(msg, { ok: "Пусни", tone: "good" }))) return (b.disabled = false);
              current = await ctx.call("launchMade", { id: current.id, image: b.dataset.img, useVideo: video });
              toast(current.replaces ? "Пусната – старата е спряна" : "Пусната");
              stop();
              closeFn();
              ctx.refresh();
            } else if (b.dataset.do === "video") {
              current = await ctx.call("makeVideo", { id: current.id, image: b.dataset.img });
              draw();
              stop();
              timer = setTimeout(tick, 4000);
            } else if (b.dataset.do === "another") {
              stop();
              const next = await ctx.call("make", { slot: current.slot?.startsWith("adhoc") ? null : current.slot, line: current.line, shift: Date.now() % 997 });
              closeFn();
              ctx.refresh();
              openDoc(next);
            }
          } catch (err) {
            toast(err.message);
            b.disabled = false;
          }
        });
      });
      return close;
    }

    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "make") {
        b.disabled = true;
        try {
          const doc = await ctx.call("make", b.dataset.slot ? { slot: b.dataset.slot } : { line: page.querySelector("#mkLine").value });
          openDoc(doc);
          ctx.refresh();
        } catch (err) {
          toast(err.message);
        } finally {
          b.disabled = false;
        }
      } else if (b.dataset.act === "open") {
        try {
          openDoc(await ctx.call("makeStatus", b.dataset.id));
        } catch (err) {
          toast(err.message);
        }
      }
    });
  },
};

export { raw, esc };
