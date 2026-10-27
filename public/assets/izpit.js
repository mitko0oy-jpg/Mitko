// Online mock exam: four sections like the NVO, scored on the server with a full answer review.
import { $, api, esc, gradeOf, guard, params, renderUnlock, topbar, backFromParams } from "./app.js";

let MOD, SECTIONS = [], PROG = {};
const LET = "АБВГ";

// Exam texts carry a few formatting tags from the source; everything else is escaped.
function rich(s) {
  return esc(s)
    .replace(/&lt;(\/?)(i|u|b)&gt;/g, "<$1$2>")
    .replace(/&lt;br\s*\/?&gt;/g, "<br>")
    .replace(/&lt;\/?font[^&]*&gt;/g, "")
    .replace(/&amp;nbsp;/g, " ");
}
const draftKey = (id) => `edubel-izpit-${id}`;
function loadDraft(id) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) || "{}");
  } catch {
    return {};
  }
}
function saveDraft(id, d) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(d));
  } catch {}
}
const resultOf = (sec) => {
  const p = PROG[sec.id];
  if (!p?.answer) return null;
  try {
    return JSON.parse(p.answer);
  } catch {
    return null;
  }
};

function renderHome() {
  const done = SECTIONS.filter((s) => resultOf(s));
  const lockedTitles = MOD.lockedTitles || [];
  const allDone = done.length === SECTIONS.length && !lockedTitles.length;
  let h = `<h1>${esc(MOD.module.title)}</h1><p class="lead">${esc(MOD.module.subtitle)}.</p>
    <p class="small muted">На истинския изпит имаш ${MOD.module.meta.totalMinutes || 165} минути. Тук решаваш частите поред и без ограничение на времето. Оценката е ориентировъчна.</p>`;
  if (allDone) {
    const pts = done.reduce((s, x) => s + resultOf(x).points, 0);
    const max = done.reduce((s, x) => s + resultOf(x).max, 0);
    h += `<div class="xtotal"><span class="big">${pts}<small> / ${max}</small></span><span class="grade">${gradeOf(pts, max)}</span><p>Общ резултат от пробната матура (ориентировъчно).</p></div>`;
  }
  h += `<ol class="xsecs">`;
  SECTIONS.forEach((s, i) => {
    const r = resultOf(s);
    h += `<li><button class="xsec" data-i="${i}"><span class="num">${i + 1}</span><span class="t"><b>${esc(s.data.title)}</b><small>${s.data.kind === "retelling" ? "Втора част" : `Задачи ${s.data.tasks[0].n}–${s.data.tasks[s.data.tasks.length - 1].n}`} · около ${s.data.minutes} мин.</small></span>
      <span class="st">${r ? `${r.points} / ${r.max}` : "Започни"}</span></button></li>`;
  });
  lockedTitles.forEach((t, j) => {
    h += `<li><button class="xsec locked" data-locked="1"><span class="num">${SECTIONS.length + j + 1}</span><span class="t"><b>${esc(t)}</b><small>в пълния достъп</small></span><span class="st">🔒</span></button></li>`;
  });
  h += `</ol><div id="unlockBox"></div>`;
  if (done.length) h += diagnostics();
  $("main").innerHTML = h;
  document.querySelectorAll(".xsec:not(.locked)").forEach((b) =>
    b.addEventListener("click", () => {
      const s = SECTIONS[+b.dataset.i];
      resultOf(s) ? showResult(s, resultOf(s)) : openSection(s);
    }),
  );
  document.querySelectorAll(".xsec.locked").forEach((b) =>
    b.addEventListener("click", () => {
      renderUnlock($("unlockBox"), { module: MOD.module.slug, title: MOD.module.title, locked: true });
      $("unlockBox").scrollIntoView({ block: "center" });
    }),
  );
  if (lockedTitles.length && done.length === SECTIONS.length) {
    renderUnlock($("unlockBox"), { module: MOD.module.slug, title: MOD.module.title, done: done.length, total: SECTIONS.length + lockedTitles.length });
  }
  window.scrollTo(0, 0);
}

// Advice per area for the tasks that lost points.
function diagnostics() {
  const lost = new Set();
  for (const s of SECTIONS) {
    const r = resultOf(s);
    if (!r) continue;
    if (r.kind === "retelling" && r.points < r.max * 0.7) lost.add("Втора част");
    for (const t of r.results || []) if (t.points !== null && t.points < t.max) lost.add(String(t.n));
  }
  const tips = (MOD.module.meta.diagnostics || []).filter((d) => d.tasks.split(/[,\s–-]+/).some((n) => lost.has(n)) || (d.tasks.includes("18") && [...lost].some((n) => +n >= 18 && +n <= 25)));
  if (!tips.length) return "";
  return `<div class="panel"><h3>Какво да упражниш</h3><ul class="xtips">${tips.map((d) => `<li><b>${esc(d.area)}</b> (задачи ${esc(d.tasks)}): ${esc(d.advice)}</li>`).join("")}</ul></div>`;
}

function textsBlock(texts, open) {
  if (!texts) return "";
  return `<details class="xtext" ${open ? "open" : ""}><summary>Текст 1</summary>${texts.text1.map((p) => `<p>${rich(p)}</p>`).join("")}<p class="small muted">${esc(texts.text1_source || "")}</p></details>
    <details class="xtext" ${open ? "open" : ""}><summary>Текст 2</summary>${texts.text2.map((p) => `<p>${rich(p)}</p>`).join("")}</details>`;
}

function openSection(sec) {
  const d = sec.data;
  if (d.kind === "retelling") return openRetelling(sec);
  const draft = loadDraft(sec.id);
  let h = `<div class="top"><button class="back" id="xBack">← Пробната матура</button><span class="pos">${esc(d.title)}</span></div>
    <h2 style="margin-top:4px">${esc(d.title)}</h2>${textsBlock(d.texts, d.tasks[0].n === 1)}`;
  for (const t of d.tasks) {
    h += `<section class="xtask" id="t-${t.n}">${t.intro ? `<div class="xintro">${rich(t.intro)}</div>` : ""}
      <p class="xq"><span class="n">${t.n}.</span> ${rich(t.n === 17 ? t.question.split(/<br\s*\/?>\s*<br\s*\/?>/)[0] : t.question)}</p>`;
    if (t.options) {
      h += `<div class="xopts" role="radiogroup">${t.options
        .map((o, k) => `<label class="xopt"><input type="radio" name="q${t.n}" value="${LET[k]}" ${draft[t.n] === LET[k] ? "checked" : ""}><span>${rich(o)}</span></label>`)
        .join("")}</div>`;
    } else if (t.n === 17) {
      h += `<textarea class="xans big" data-n="17" rows="12" aria-label="Поправеният текст">${esc(draft[17] ?? d.editText ?? "")}</textarea><p class="small muted">Поправи грешките направо в текста.</p>`;
    } else {
      h += `<textarea class="xans" data-n="${t.n}" rows="${t.n === 25 ? 6 : 3}" aria-label="Отговор на задача ${t.n}">${esc(draft[t.n] ?? "")}</textarea>`;
    }
    h += `</section>`;
  }
  h += `<div class="xsubmit"><p class="small muted" id="xLeft"></p><button class="btn gold full" id="xSubmit">Предай частта</button><p class="formerr" id="xErr" role="alert"></p></div>`;
  $("main").innerHTML = h;
  window.scrollTo(0, 0);
  const collect = () => {
    const a = {};
    for (const t of d.tasks) {
      if (t.options) a[t.n] = document.querySelector(`input[name="q${t.n}"]:checked`)?.value || "";
      else a[t.n] = document.querySelector(`.xans[data-n="${t.n}"]`).value;
    }
    return a;
  };
  const left = () => {
    const a = collect();
    const n = d.tasks.filter((t) => !String(a[t.n] || "").trim() || (t.n === 17 && a[17] === d.editText)).length;
    $("xLeft").textContent = n ? `Без отговор: ${n} ${n === 1 ? "задача" : "задачи"}.` : "Всички задачи имат отговор.";
    saveDraft(sec.id, a);
  };
  $("main").addEventListener("input", left);
  $("main").addEventListener("change", left);
  left();
  $("xBack").addEventListener("click", renderHome);
  $("xSubmit").addEventListener("click", async () => {
    const b = $("xSubmit");
    if (b.dataset.confirm !== "1" && $("xLeft").textContent.startsWith("Без")) {
      b.dataset.confirm = "1";
      b.textContent = "Има задачи без отговор. Предай все пак";
      return;
    }
    b.disabled = true;
    b.textContent = "Проверявам… (до половин минута)";
    try {
      const r = await api("learn/exam", { module: MOD.module.slug, itemId: sec.id, answers: collect() });
      PROG[sec.id] = { answer: JSON.stringify(r.result), score: r.percent };
      saveDraft(sec.id, {});
      showResult(sec, r.result);
    } catch (e) {
      $("xErr").textContent = e.message;
      b.disabled = false;
      b.textContent = "Предай частта";
    }
  });
}

function openRetelling(sec) {
  const d = sec.data;
  const draft = loadDraft(sec.id);
  let vi = draft.variant === 1 ? 1 : 0;
  const render = () => {
    const v = d.variants[vi];
    $("main").innerHTML = `<div class="top"><button class="back" id="xBack">← Пробната матура</button><span class="pos">Втора част</span></div>
      <h2 style="margin-top:4px">Преразказ</h2>
      <div class="tabs" role="tablist">${d.variants.map((x, i) => `<button role="tab" data-v="${i}" aria-selected="${i === vi}">Вариант ${esc(x.variant)}</button>`).join("")}</div>
      <p class="xq">${esc(v.task)}</p>
      <details class="xtext" open><summary>„${esc(v.title)}“ – ${esc(v.author)}</summary>${v.text.split(/\n+/).map((p) => `<p>${rich(p)}</p>`).join("")}</details>
      <details class="xtext"><summary>Как да преразкажа</summary><p>${rich(d.guide.what)}</p>
        <ol>${d.guide.steps.map(([a, b]) => `<li><b>${esc(a)}.</b> ${rich(b)}</li>`).join("")}</ol>
        <p class="rlbl">Провери накрая</p><ul>${d.guide.checklist.map((c) => `<li>${rich(c)}</li>`).join("")}</ul></details>
      <textarea class="xans big" id="xRet" rows="16" aria-label="Твоят преразказ" placeholder="Пиши в първо лице, в минало време, с абзаци…">${esc(draft.text || "")}</textarea>
      <p class="small muted" id="xWords"></p>
      <div class="xsubmit"><button class="btn gold full" id="xSubmit">Предай преразказа</button><p class="formerr" id="xErr" role="alert"></p></div>`;
    const words = () => {
      const t = $("xRet").value;
      $("xWords").textContent = `${(t.trim().match(/[А-Яа-яЁёA-Za-z0-9-]+/g) || []).length} думи · ${t.split(/\n\s*\n|\n/).filter((x) => x.trim()).length} абзаца`;
      saveDraft(sec.id, { variant: vi, text: t });
    };
    $("xRet").addEventListener("input", words);
    words();
    document.querySelectorAll("[data-v]").forEach((b) =>
      b.addEventListener("click", () => {
        vi = +b.dataset.v;
        saveDraft(sec.id, { variant: vi, text: $("xRet").value });
        render();
      }),
    );
    $("xBack").addEventListener("click", renderHome);
    $("xSubmit").addEventListener("click", async () => {
      const b = $("xSubmit");
      b.disabled = true;
      b.textContent = "Учителят чете… (до минута)";
      try {
        const r = await api("learn/exam", { module: MOD.module.slug, itemId: sec.id, variant: vi, answers: { text: $("xRet").value } });
        PROG[sec.id] = { answer: JSON.stringify(r.result), score: r.percent };
        saveDraft(sec.id, {});
        showResult(sec, r.result);
      } catch (e) {
        $("xErr").textContent = e.message;
        b.disabled = false;
        b.textContent = "Предай преразказа";
      }
    });
  };
  render();
  window.scrollTo(0, 0);
}

function showResult(sec, r) {
  const d = sec.data;
  let h = `<div class="top"><button class="back" id="xBack">← Пробната матура</button><span class="pos">${esc(d.title)}</span></div>
    <div class="xtotal"><span class="big">${r.points}<small> / ${r.max}</small></span><span class="grade">${gradeOf(r.points, r.max)}</span>
    <p>${esc(d.title)} · ориентировъчно${r.unscored ? ` · ${r.unscored} задачи не бяха проверени автоматично – сравни сам` : ""}</p></div>`;
  if (r.kind === "retelling") {
    h += `<div class="panel"><h3>Оценка по критерии</h3><ul class="xcrit">${r.criteria.map((c) => `<li><span>${esc(c.name)}</span><b>${c.points} / ${c.max}</b><small>${esc(c.comment)}</small></li>`).join("")}</ul>
      ${r.summary ? `<p class="notice info">${esc(r.summary)}</p>` : ""}</div>
      <details class="xtext"><summary>План: епизодите в реда на текста</summary><ol>${(r.plan || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ol></details>
      <details class="xtext"><summary>Примерен преразказ</summary>${String(r.model || "").split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}</details>
      <details class="xtext"><summary>Твоят преразказ</summary>${String(r.yours || "").split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}</details>`;
  } else {
    for (const t of r.results) {
      const task = d.tasks.find((x) => x.n === t.n);
      const state = t.points === null ? "" : t.points === t.max ? "ok" : t.points > 0 ? "half" : "bad";
      h += `<section class="xres ${state}"><header><span class="n">${t.n}.</span><span>${rich(task?.question || "").replace(/<br>[\s\S]*/, "")}</span><b>${t.points === null ? "?" : t.points} / ${t.max}</b></header>`;
      if (t.errors) {
        h += `<ul class="xerrs">${t.errors.map((e) => `<li class="${e.fixed ? "ok" : "bad"}">${e.fixed ? "✓" : "✗"} <s>${esc(e.wrong)}</s> → <b>${esc(e.right)}</b><small>${rich(e.rule)}</small></li>`).join("")}</ul>`;
      } else {
        h += `<p class="small"><span class="muted">Твоят отговор:</span> ${t.yours ? rich(t.yours) : "<i>без отговор</i>"}</p>
          <p class="small"><span class="muted">Верният отговор:</span> <b>${rich(t.correct)}</b></p>`;
        if (t.feedback) h += `<p class="small xfb">${esc(t.feedback)}</p>`;
      }
      if (t.points !== t.max) {
        h += `<details><summary>Как се решава</summary><ul>${(t.how || []).map((x) => `<li>${rich(x)}</li>`).join("")}</ul>
          ${t.why ? `<p class="small"><b>Защо не другите:</b> ${rich(t.why)}</p>` : ""}${t.trap ? `<p class="small"><b>Капан:</b> ${rich(t.trap)}</p>` : ""}${t.rev ? `<p class="small muted">Преговори: ${rich(t.rev)}</p>` : ""}</details>`;
      }
      h += `</section>`;
    }
  }
  h += `<div class="row"><button class="btn gold" id="xNext">Към пробната матура</button><button class="btn ghost" id="xAgain">Реши отново</button></div>`;
  $("main").innerHTML = h;
  window.scrollTo(0, 0);
  $("xBack").addEventListener("click", renderHome);
  $("xNext").addEventListener("click", renderHome);
  $("xAgain").addEventListener("click", () => openSection(sec));
}

async function load() {
  const m = await guard("child");
  topbar(m, { back: backFromParams() });
  const slug = params().get("m");
  if (!slug) return (location.href = "/uchenik/");
  MOD = await api(`learn/module/${encodeURIComponent(slug)}`);
  SECTIONS = MOD.items.map((i) => ({ id: i.id, data: i.data }));
  PROG = MOD.progress;
  renderHome();
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
