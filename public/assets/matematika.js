// „200 задачи по математика“: parts → part intro → task (answer, hint, step-by-step solution) → title.
// The screen is chosen by the address after #, so "back" in the browser works and a reload keeps the place:
//   #                     the parts
//   #p=<slug>             a part
//   #p=<slug>&z=<n>       task n of the part (1-based)
//   #p=<slug>&z=<n>&greshki  the same, while fixing mistakes
//   #p=<slug>&kraj        the end of the part and the title
import { $, api, esc, guard, renderUnlock, toast, topbar } from "./app.js";
import { LETTERS, LEVELS, level, mathHtml, optionOrder, pointsWord, solutionHtml, titleFor, titleRows } from "./math-view.js";

const SUBJECT = "mat";
const COLORS = { 5: "--l1", 6: "--l0", 7: "--l2" };
const colorOf = (grade) => `var(${COLORS[grade] || "--gold"})`;
const pad = (n, w = 2) => String(n).padStart(w, "0");
// About how many minutes a task of each level takes, for the part intro.
const MINUTES = [1, 1.5, 2.5];

let me = null;
let home = null;
const parts = new Map(); // slug → part data from the API, with progress kept up to date locally
let view = null; // the task on screen

const state = () => {
  const h = new URLSearchParams(location.hash.slice(1));
  return { p: h.get("p"), z: h.has("z") ? Number(h.get("z")) : null, end: h.has("kraj"), fix: h.has("greshki") };
};
const partHash = (slug, extra = "") => `#p=${encodeURIComponent(slug)}${extra}`;
const taskHash = (slug, k, fix) => partHash(slug, `&z=${k + 1}${fix ? "&greshki" : ""}`);

async function loadPart(slug) {
  if (!parts.has(slug)) parts.set(slug, await api(`quiz/${SUBJECT}/part/${encodeURIComponent(slug)}`));
  return parts.get(slug);
}

function stats(d) {
  let answered = 0, points = 0, wrong = 0;
  for (const it of d.items) {
    const p = d.progress[it.id];
    if (!p) continue;
    answered++;
    points += Number(p.score || 0);
    if (p.lastOk === false) wrong++;
  }
  const firstOpen = d.items.findIndex((it) => !d.progress[it.id]);
  const firstWrong = d.items.findIndex((it) => d.progress[it.id]?.lastOk === false);
  return { answered, points, wrong, firstOpen, firstWrong };
}

const partNo = (slug) => Math.max(1, home.parts.findIndex((p) => p.slug === slug) + 1);
const partLabel = (p) => `${p.grade}. клас · ${p.title}`;
const dots = (n) => `<span class="dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
const levelLegend = () =>
  `<ul class="legend">${LEVELS.map((l) => `<li>${dots(l.dots)}<span>${l.name}</span><span>${l.pts} ${pointsWord(l.pts)}</span></li>`).join("")}</ul>`;

function bar(done, locked, total) {
  const w = (x) => (total ? Math.round((x / total) * 100) : 0);
  return `<span class="bar" aria-hidden="true"><i style="width:${w(done)}%"></i><i class="lock" style="width:${w(locked)}%;margin-left:auto"></i></span>`;
}

// ---------- the parts ----------
async function renderParts() {
  home = await api(`quiz/${SUBJECT}/home`);
  let h = `<section class="mhero">
    <p class="eyebrow">Интерактивен преговор · 5.–7. клас</p>
    <p class="big" aria-hidden="true">200</p>
    <h1><span class="sr">200 </span>задачи по математика</h1>
    <p class="tag">Избери. Реши. Разбери защо.</p>
    ${home.answered ? `<p class="mstat">Твоите точки: <b>${home.points}</b> от ${home.max} · решени ${home.answered} от ${home.total}</p>` : ""}
  </section>`;
  if (!home.parts.length) {
    $("main").innerHTML = h + `<p class="lead">Задачите се подготвят. Скоро ще са тук!</p>`;
    return;
  }
  h += `<p class="eyebrow">${home.parts.length} части · една стъпка напред</p><h2 style="margin-top:0">Избери част</h2>
    <p class="muted">Започни със своя клас. Можеш да преговаряш и по-малките класове.</p>
    <div class="mparts">${home.parts
      .map(
        (p, i) => `<a class="mpart" href="${partHash(p.slug)}" style="--c:${colorOf(p.grade)}">
        <span class="no">${pad(i + 1)}</span>
        <span class="tx"><b>${esc(partLabel(p))}</b><small>${p.total} задачи · до ${p.max} точки</small></span>
        <span class="go" aria-hidden="true">→</span>
        <span class="st">${p.answered ? `${p.points} т. · решени ${p.answered} от ${p.accessible}` : "Още не си започнал"}${p.locked ? ` · 🔒 ${p.locked}` : ""}${
          p.grade === home.child.grade ? ` <span class="pill">твоят клас</span>` : ""
        }</span>
        ${bar(p.answered, p.locked, p.total)}</a>`,
      )
      .join("")}</div>
    <div class="lvchips">${LEVELS.map((l) => `<span>${l.name} · ${l.pts} т.</span>`).join("")}</div>
    <details class="panel"><summary><b>Как се играе</b></summary>
      <ol class="howto">
        <li><b>Избери част.</b> Задачите вървят от лесни към трудни: Знам, Разбирам, Мисля.</li>
        <li><b>Реши на лист</b> и докосни отговора, който смяташ за верен.</li>
        <li><b>Грешка?</b> Ще видиш подсказка и ще опиташ пак. После прочети решението стъпка по стъпка.</li>
        <li><b>Точки само при първи опит:</b> 1, 2 или 3 според нивото. Повторните опити са упражнение.</li>
        <li><b>В края на частта</b> откриваш своята титла. „Поправи грешките“ те връща към сгрешените задачи.</li>
      </ol>
    </details>
    <details class="panel"><summary><b>За родителя</b></summary>
      <p>200 задачи по математика за 5., 6. и 7. клас, от лесни към трудни, с подробно решение. Всяка задача сочи към карта от комплекта „Еду БЕЛ – Математика“.</p>
      <p>Около 10 задачи на ден са достатъчни. След грешен отговор прочетете заедно решението и се върнете към посочената карта. Питайте „Кое правило ще използваш?“ вместо да подсказвате.</p>
    </details>`;
  $("main").innerHTML = h;
}

// ---------- a part ----------
function renderIntro(d) {
  const s = stats(d);
  const no = partNo(d.part.slug);
  const first = d.items[0]?.data.n;
  const levels = [0, 1, 2].map((lv) => d.items.filter((i) => (Number(i.data.lv) || 0) === lv).length + d.lockedLevels[lv]);
  const minutes = Math.max(5, Math.round(levels.reduce((sum, n, lv) => sum + n * MINUTES[lv], 0) / 5) * 5);
  const allDone = s.firstOpen < 0 && d.items.length > 0;
  let main;
  if (!s.answered) main = `<a class="btn gold main" href="${taskHash(d.part.slug, 0)}">Започни →</a>`;
  else if (!allDone) main = `<a class="btn gold main" href="${taskHash(d.part.slug, s.firstOpen)}">Продължи от задача ${pad(d.items[s.firstOpen].data.n, 3)} →</a>`;
  else main = `<a class="btn gold main" href="${partHash(d.part.slug, "&kraj")}">Виж резултата →</a>`;
  $("main").innerHTML = `<section class="mhero" style="--c:${colorOf(d.part.grade)}">
      <span class="ghostno" aria-hidden="true">${no}</span>
      <p class="eyebrow">Част ${pad(no)} / ${pad(home.parts.length)}</p>
      <h1 tabindex="-1" id="head">${d.part.grade}. клас</h1>
      <p class="ptitle">${esc(d.part.title)}</p>
      <p class="gold">${d.total} задачи · до ${d.max} точки</p>
      <p class="sub">${first ? `Задачи ${first}–${first + d.total - 1} · ` : ""}около ${minutes} минути</p>
      ${levelLegend()}
      <p class="sub" style="margin-top:14px">Записват се точки само за верен отговор от първия опит. В края ще откриеш своята титла.</p>
    </section>
    ${s.answered ? `<p class="notice info">Досега: <b>${s.points}</b> ${pointsWord(s.points)} · решени ${s.answered} от ${d.items.length}${s.wrong ? ` · за поправка: ${s.wrong}` : ""}</p>` : ""}
    ${d.locked ? `<div class="lockline"><span aria-hidden="true">🔒</span><span>Безплатни са първите <b>${d.items.length}</b> задачи. Още <b>${d.locked}</b> са в пълния достъп.</span></div>` : ""}
    <div class="row">
      ${main}
      ${s.wrong ? `<a class="btn ghost" href="${taskHash(d.part.slug, s.firstWrong, true)}">Поправи грешките (${s.wrong})</a>` : ""}
      ${allDone ? `<a class="btn ghost" href="${taskHash(d.part.slug, 0)}">Реши пак от началото</a>` : ""}
      <a class="btn ghost" href="#">Части</a>
    </div>`;
}

// ---------- a task ----------
function nextIndex(d, k, fix) {
  if (!fix) return k + 1;
  for (let j = k + 1; j < d.items.length; j++) if (d.progress[d.items[j].id]?.lastOk === false) return j;
  return -1;
}

function renderTask(d, k, fix) {
  if (k < 0 || k >= d.items.length) {
    if (d.locked) return renderLocked(d);
    location.replace(partHash(d.part.slug, "&kraj"));
    return;
  }
  const it = d.items[k];
  const t = it.data;
  const lv = level(t.lv);
  const order = optionOrder(t.o.length, it.ext);
  const prev = d.progress[it.id];
  view = { d, k, fix, it, order, tries: 0, done: false };
  const status = prev
    ? prev.score > 0
      ? `Вече решена: +${prev.score} ${pointsWord(prev.score)} от първия опит. Сега е за упражнение.`
      : "Вече опитвана. Сега е за упражнение – точки има само при първия опит."
    : "";
  $("main").innerHTML = `<div style="--c:${colorOf(d.part.grade)}">
      <div class="qtop"><span>${esc(partLabel(d.part))}${fix ? " · поправка" : ""}</span><span>${pad(k + 1)} / ${pad(d.total)}</span></div>
      <div class="qprog" aria-hidden="true"><i style="width:${Math.round(((k + 1) / d.total) * 100)}%"></i></div>
      <div class="qhead"><h1 tabindex="-1" id="head">Задача ${pad(t.n, 3)}</h1><span class="lvpill">${lv.name} · ${lv.pts} т.</span></div>
      ${status ? `<p class="qnote">${status}</p>` : ""}
      <p class="qtext">${mathHtml(t.q)}</p>
      <div class="opts" role="group" aria-label="Отговори">${order
        .map((orig, pos) => `<button class="opt" data-o="${orig}"><span class="let" aria-hidden="true">${LETTERS[pos]}</span><span><span class="sr">${LETTERS[pos]}) </span>${mathHtml(t.o[orig])}</span></button>`)
        .join("")}</div>
      <div id="fb" aria-live="polite"></div>
      <div class="qact" id="act"></div>
    </div>`;
  actions([
    { label: "Части", href: "#", ghost: true },
    { label: "Пропусни →", main: true, onClick: () => goNext() },
  ]);
  document.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => choose(Number(b.dataset.o), b)));
  $("head").focus({ preventScroll: true });
}

function actions(list) {
  const el = $("act");
  el.innerHTML = list
    .map((a, i) =>
      a.href
        ? `<a class="btn ${a.ghost ? "ghost" : ""} ${a.main ? "main" : ""}" href="${a.href}">${esc(a.label)}</a>`
        : `<button class="btn ${a.ghost ? "ghost" : ""} ${a.main ? "main" : ""}" data-a="${i}">${esc(a.label)}</button>`,
    )
    .join("");
  el.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => list[Number(b.dataset.a)].onClick()));
}

function goNext() {
  const v = view;
  const j = nextIndex(v.d, v.k, v.fix);
  if (v.fix && j < 0) {
    toast(stats(v.d).wrong ? "Това бяха грешките в тази част." : "Поправи всички грешки в тази част. Браво!");
    location.hash = partHash(v.d.part.slug);
    return;
  }
  location.hash = taskHash(v.d.part.slug, j, v.fix);
}

function choose(orig, btn) {
  const v = view;
  if (v.done || btn.disabled) return;
  const t = v.it.data;
  const ok = orig === 0;
  const prev = v.d.progress[v.it.id];
  const first = !prev;
  const pts = first && ok ? level(t.lv).pts : 0;
  v.tries++;
  v.d.progress[v.it.id] = { attempts: (prev?.attempts || 0) + 1, lastOk: ok, score: first ? pts : prev.score };
  api(`quiz/${SUBJECT}/answer`, { part: v.d.part.slug, itemId: v.it.id, choice: orig })
    .then((r) => {
      // The server decides the points; keep its number if it differs (e.g. answered on another device).
      if (v.d.progress[v.it.id]) v.d.progress[v.it.id].score = r.score;
    })
    .catch((e) => toast(e.code === "offline" ? "Няма връзка – отговорът не е записан." : e.message, 4000));

  if (ok) {
    btn.classList.add("right");
    reveal(true, first ? `+${pts} ${pointsWord(pts)} при първи опит` : "Този път без точки – те се дават само при първия опит.");
    return;
  }
  btn.classList.add("wrong");
  btn.disabled = true;
  if (v.tries >= 2) {
    reveal(false, "Виж решението стъпка по стъпка.");
    return;
  }
  document.querySelectorAll(".opt").forEach((b) => (b.disabled = true));
  $("fb").innerHTML = `<div class="fb bad" tabindex="-1" id="fbh"><span class="ic" aria-hidden="true">✕</span><div><p class="fbt">Не е вярно</p><p class="fbs">Прочети подсказката и опитай пак.</p></div></div>
    ${t.h ? `<div class="hint"><p class="slbl">Подсказка</p><p>${mathHtml(t.h)}</p></div>` : ""}`;
  actions([
    { label: "Покажи решението", ghost: true, onClick: () => reveal(false, "Виж решението стъпка по стъпка.") },
    {
      label: "Опитай пак",
      main: true,
      onClick: () => {
        $("fb").innerHTML = "";
        document.querySelectorAll(".opt").forEach((b) => (b.disabled = b.classList.contains("wrong")));
        actions([
          { label: "Части", href: "#", ghost: true },
          { label: "Пропусни →", main: true, onClick: () => goNext() },
        ]);
        document.querySelector(".opt:not(:disabled)")?.focus();
      },
    },
  ]);
  $("fbh").focus({ preventScroll: true });
  $("fbh").scrollIntoView({ behavior: "smooth", block: "center" });
}

function reveal(ok, sub) {
  const v = view;
  v.done = true;
  document.querySelectorAll(".opt").forEach((b) => {
    b.disabled = true;
    if (Number(b.dataset.o) === 0) b.classList.add("right");
    else if (!b.classList.contains("wrong")) b.classList.add("dim");
  });
  $("fb").innerHTML = `<div class="fb ${ok ? "ok" : "bad"}" tabindex="-1" id="fbh"><span class="ic" aria-hidden="true">${ok ? "✓" : "✕"}</span>
      <div><p class="fbt">${ok ? "Вярно!" : "Не е вярно"}</p><p class="fbs">${esc(sub)}</p></div></div>
    ${solutionHtml(v.it.data, v.order).replace('class="sol"', `class="sol ${ok ? "" : "bad"}"`)}`;
  const j = nextIndex(v.d, v.k, v.fix);
  const last = v.fix ? j < 0 : j >= v.d.items.length;
  const label = v.fix ? (last ? "Готово →" : "Следваща грешка →") : last ? (v.d.locked ? "Напред →" : "Към края на частта →") : "Следваща задача →";
  actions([
    { label: "Части", href: "#", ghost: true },
    { label, main: true, onClick: () => goNext() },
  ]);
  $("fbh").focus({ preventScroll: true });
  $("fbh").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Keys 1–4 (or А–Г / A–D) choose an answer.
document.addEventListener("keydown", (e) => {
  if (!view || view.done || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector(".opt")) return;
  const keys = ["1234", "абвг", "abcd"];
  const k = e.key.toLowerCase();
  const pos = keys.map((s) => s.indexOf(k)).find((i) => i >= 0);
  if (pos === undefined || k.length !== 1) return;
  const b = document.querySelectorAll(".opt")[pos];
  if (b && !b.disabled) b.click();
});

// ---------- end of a part ----------
function renderLocked(d) {
  const s = stats(d);
  $("main").innerHTML = `<div class="qtop"><span>${esc(partLabel(d.part))}</span><span>${s.points} ${pointsWord(s.points)}</span></div><div id="ul"></div>
    <div class="row" style="justify-content:center"><a class="btn ghost" href="${partHash(d.part.slug)}">Към частта</a><a class="btn ghost" href="#">Части</a></div>`;
  renderUnlock($("ul"), {
    module: d.part.slug,
    title: `${d.part.grade}. клас · ${d.part.title}`,
    done: s.answered,
    total: d.total,
    unit: "задачи",
    locked: s.answered < d.items.length,
    send: () => api(`quiz/${SUBJECT}/unlock`, { part: d.part.slug }),
  });
}

function renderEnd(d) {
  if (d.locked) return renderLocked(d);
  const s = stats(d);
  const mine = titleFor(s.points, d.max);
  const no = partNo(d.part.slug);
  const next = home.parts[no];
  const left = d.items.length - s.answered;
  $("main").innerHTML = `<div class="endc">
      <div class="medal" aria-hidden="true">π</div>
      <h1 tabindex="-1" id="head">Браво!</h1>
      <p class="sub">Завърши част ${no} · ${d.part.grade}. клас</p>
      <p class="sub">${esc(d.part.title)}</p>
      <p style="margin-top:16px"><b>Събра ${s.points} от ${d.max} точки. Твоята титла: „${esc(mine.name)}“</b></p>
      <div class="titles">${titleRows(d.max)
        .map((r) => `<div class="${r.name === mine.name ? "me" : ""}"><span>${esc(r.name)}</span><span>${r.lo}–${r.hi} т.</span></div>`)
        .join("")}</div>
      <p class="small muted">Броят се само верните отговори от първия опит.</p>
      ${left ? `<p class="notice info">Пропуснал си ${left} ${left === 1 ? "задача" : "задачи"}. Можеш да се върнеш към ${left === 1 ? "нея" : "тях"}.</p>` : ""}
    </div>
    <div class="row">
      ${s.wrong ? `<a class="btn gold" href="${taskHash(d.part.slug, s.firstWrong, true)}">Поправи грешките (${s.wrong})</a>` : ""}
      ${left ? `<a class="btn ${s.wrong ? "ghost" : "gold"}" href="${taskHash(d.part.slug, s.firstOpen)}">Към пропуснатите</a>` : ""}
      ${next ? `<a class="btn ${s.wrong || left ? "ghost" : "gold"}" href="${partHash(next.slug)}">Следваща част →</a>` : ""}
      <a class="btn ghost" href="#">Части</a>
    </div>`;
  $("head").focus({ preventScroll: true });
}

// ---------- router ----------
async function render() {
  const st = state();
  view = null;
  try {
    if (!st.p) await renderParts();
    else {
      if (!home) home = await api(`quiz/${SUBJECT}/home`);
      const d = await loadPart(st.p);
      if (st.end) renderEnd(d);
      else if (st.z !== null) renderTask(d, st.z - 1, st.fix);
      else renderIntro(d);
    }
  } catch (e) {
    $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p><p><a class="btn ghost" href="#">Към частите</a></p>`;
  }
  window.scrollTo(0, 0);
}

async function start() {
  me = await guard("child");
  topbar(me, { back: { href: "/uchenik/", label: "Начало" } });
  window.addEventListener("hashchange", render);
  await render();
}
start().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
