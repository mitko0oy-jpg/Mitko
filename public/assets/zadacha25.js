// Task 25 trainer with self-check and the AI coach (adapted from the prototypes).
import { $, api, esc, guard, lockLine, params, renderUnlock, saveProgress, topbar } from "./app.js";

let MOD, T = [], PROG = {}, LOCKED = 0, cur = 0, round = 0, busy = false, dirty = false;

const CHECK = (t) => [
  ["Текстът е от 3 – 4 изречения.", "Не по-малко, не повече."],
  ["Тълкувам цитата, а не преразказвам творбата.", "Обяснявам какво означават думите, не какво се случва."],
  ["Свързах цитата с творбата.", "Споменах героя, ситуацията или лирическия говорител."],
  ["Обясних смисъла на ключовите думи.", "Например: " + (t.keys[1] || t.keys[0])],
  ["Назовах внушението – идеята на автора.", "Например: " + t.keys[t.keys.length - 1]],
  ["Проверих правописа и запетаите.", "Особено пред „че“, „който“, „защото“, „но“."],
];
function sentences(txt) {
  const s = txt.replace(/\b(г|в|др|пр|Хр|напр|т\.е|т\.нар|ок)\./gi, "$1").replace(/[…]/g, ".");
  return s.split(/[.!?]+(?:[\s"“”»]|$)/).map((x) => x.trim()).filter((x) => /[А-Яа-яA-Za-z]/.test(x)).length;
}
const words = (txt) => (txt.trim().match(/[А-Яа-яЁёA-Za-z0-9-]+/g) || []).length;
const show = (id) => {
  ["home", "task"].forEach((s) => ($(s).hidden = s !== id));
  window.scrollTo(0, 0);
};
const draftKey = (i) => `edubel-t25-draft-${T[i].id}`;
const getDraft = (i) => {
  try {
    return localStorage.getItem(draftKey(i)) || "";
  } catch {
    return "";
  }
};
const setDraft = (i, v) => {
  try {
    localStorage.setItem(draftKey(i), v);
  } catch {}
};

function skeleton() {
  $("main").innerHTML = `
<section id="home">
  <h1><span class="big">25</span>${esc(MOD.module.title)}</h1>
  <p class="lead">${esc(MOD.module.subtitle)}. Пишеш своя текст, коучът ти задава въпроси, после сравняваш с примерен отговор.</p>
  <div class="progress"><span id="progTxt"></span><span class="bar"><i id="progBar"></i></span></div>
  <div id="unlockBox"></div>
  <div class="row" style="margin-top:14px"><button class="btn gold" id="startBtn"></button></div>
  <h2>Формулата в 4 изречения</h2>
  <ol class="steps">
    <li><div><b>Назови какво виждаш</b><span>Какъв е цитатът – обръщение, сравнение, противопоставяне, повторение?</span></div></li>
    <li><div><b>Свържи с творбата</b><span>Кой говори, за кого, в каква ситуация?</span></div></li>
    <li><div><b>Обясни смисъла</b><span>Какво означават ключовите думи? Защо авторът ги е избрал?</span></div></li>
    <li><div><b>Изведи внушението</b><span>Каква е идеята – какво иска авторът да разберем или почувстваме?</span></div></li>
  </ol>
  <div class="phr"><p>Фрази, които помагат</p><ul><li>Цитатът съчетава…</li><li>Чрез образа на… авторът показва, че…</li><li>Думата „…“ подчертава…</li><li>Така творбата внушава, че…</li></ul></div>
  <h2>Къде се губят точки</h2>
  <div class="err"><ul><li>Преразказваш творбата, вместо да тълкуваш цитата.</li><li>Пишеш 1–2 или повече от 4 изречения.</li><li>Използваш общи фрази, които пасват на всяка творба.</li><li>Обясняваш смисъла, но не назоваваш внушението.</li><li>Не проверяваш запетаите пред „че“, „който“, „защото“.</li></ul></div>
  <h2>Задачите</h2>
  <div class="list" id="list"></div>
  <div id="lockBox"></div>
</section>
<section id="task" hidden>
  <div class="top"><button class="back" id="backBtn">← Всички задачи</button><span class="pos" id="pos"></span></div>
  <div class="sheet">
    <div class="head"><div class="work" id="tWork"></div><p class="task" id="tTask"></p></div>
    <blockquote class="quote" id="tQuote"></blockquote>
    <div class="write">
      <label for="ans" class="pos" style="display:block;margin-bottom:6px">Твоят отговор</label>
      <textarea id="ans" placeholder="Напиши своя текст от 3 – 4 изречения…" maxlength="1500"></textarea>
      <div class="meter"><span class="s" id="sCount"></span><span class="wd" id="wCount"></span></div>
      <div class="hint" id="hint" hidden><p>Опорни идеи</p><ul id="hintList"></ul></div>
      <div class="acts">
        <button class="btn" id="coachBtn" disabled>Покажи на коуча</button>
        <button class="btn ghost" id="checkBtn" disabled>Провери сам</button>
        <button class="btn ghost" id="hintBtn">Опорни идеи</button>
      </div>
      <div class="coachfb" id="coachFb" aria-live="polite"></div>
    </div>
  </div>
  <div class="rev" id="rev" hidden>
    <div class="panel"><p class="lbl">Твоят отговор</p><p class="mine" id="mine"></p></div>
    <div class="panel model"><p class="lbl">Примерен отговор</p><p class="txt" id="model"></p></div>
    <div class="panel"><h3>Провери се сам</h3><p style="margin:0 0 8px;color:var(--muted);font-size:15px">Сравни двата текста и отметни всичко, което ти е успяло.</p>
      <ul class="check" id="check"></ul>
      <div class="score"><b id="self">0 / 6</b><span>самооценка – на изпита оценява учител</span></div>
      <div class="saved" id="saved"></div></div>
    <div class="row"><button class="btn gold" id="nextBtn">Следваща задача</button><button class="btn ghost" id="againBtn">Пиши отново</button></div>
  </div>
</section>`;
  $("ans").addEventListener("input", meter);
  $("hintBtn").addEventListener("click", () => {
    $("hint").hidden = false;
    $("hintBtn").hidden = true;
  });
  $("checkBtn").addEventListener("click", () => review(false));
  $("coachBtn").addEventListener("click", coach);
  $("againBtn").addEventListener("click", () => {
    $("rev").hidden = true;
    $("ans").readOnly = false;
    $("ans").focus();
    window.scrollTo({ top: 0 });
  });
  $("nextBtn").addEventListener("click", async () => {
    await commit();
    if (cur + 1 < T.length) openTask(cur + 1);
    else {
      renderHome();
      show("home");
    }
  });
  $("backBtn").addEventListener("click", async () => {
    await commit();
    renderHome();
    show("home");
  });
}

function renderHome() {
  const done = T.filter((t) => PROG[t.id]).length;
  $("progTxt").textContent = `Готови: ${done} от ${T.length}${LOCKED ? ` · още ${LOCKED} в пълния достъп` : ""}`;
  $("progBar").style.width = (done / (T.length + LOCKED)) * 100 + "%";
  const firstOpen = T.findIndex((t) => !PROG[t.id]);
  $("startBtn").textContent = done === 0 ? "Започни с първата задача" : firstOpen >= 0 ? "Продължи със следващата" : "Започни отначало";
  $("startBtn").onclick = () => openTask(firstOpen >= 0 ? firstOpen : 0);
  $("list").innerHTML = T.map((t, i) => {
    const p = PROG[t.id];
    const st = p ? `<span class="st done">✓ ${p.score ?? 0} / 6</span>` : `<span class="st">${getDraft(i) ? "започната" : ""}</span>`;
    return `<button class="item" data-i="${i}"><span><span class="w">${i + 1}. ${esc(t.w)}</span><span class="k">${esc(t.a)} · ${t.q ? "цитат" : esc(t.task.replace(/^В текст от 3 – 4 изречения запишете какво внушава /, "").replace(/\.$/, ""))}</span></span>${st}</button>`;
  }).join("");
  $("list").querySelectorAll(".item").forEach((b) => b.addEventListener("click", () => openTask(+b.dataset.i)));
  $("lockBox").innerHTML = lockLine(LOCKED);
  if (LOCKED && done >= T.length) renderUnlock($("unlockBox"), { module: MOD.module.slug, title: MOD.module.title, done, total: T.length + LOCKED });
}

function meter() {
  const v = $("ans").value, n = sentences(v);
  const el = $("sCount");
  el.className = "s" + (n >= 3 && n <= 4 ? " good" : n > 4 ? " warn" : "");
  el.textContent = n === 0 ? "Изречения: 0" : n < 3 ? `Изречения: ${n} – трябват поне 3` : n <= 4 ? `Изречения: ${n} ✓` : `Изречения: ${n} – съкрати до 4`;
  $("wCount").textContent = `${words(v)} думи`;
  $("checkBtn").disabled = n === 0;
  $("coachBtn").disabled = n === 0 || busy;
  setDraft(cur, v);
}

function openTask(i) {
  cur = i;
  round = 0;
  const t = T[i];
  $("pos").textContent = `Задача ${i + 1} / ${T.length}`;
  $("tWork").textContent = `${t.w} · ${t.a}`;
  $("tTask").textContent = t.task;
  $("tQuote").hidden = !t.q;
  $("tQuote").textContent = t.q || "";
  $("ans").value = getDraft(i) || PROG[t.id]?.answer || "";
  $("hint").hidden = true;
  $("hintBtn").hidden = false;
  $("hintList").innerHTML = t.keys.map((k) => `<li>${esc(k)}</li>`).join("");
  $("rev").hidden = true;
  $("saved").textContent = "";
  $("coachFb").innerHTML = "";
  $("ans").readOnly = false;
  meter();
  show("task");
}

async function coach() {
  const v = $("ans").value.trim();
  if (!v || busy) return;
  busy = true;
  round++;
  meter();
  $("coachFb").innerHTML = `<div class="item ask thinking">Коучът чете текста ти…</div>`;
  try {
    const r = await api("ai", { mode: "coach", itemId: T[cur].id, text: v, round });
    let html = "";
    if (r.good) html += `<div class="item good"><b>${r.level === "силен" ? "Силен текст!" : "Добре е, че:"}</b> ${esc(r.good)}</div>`;
    if (r.questions.length) html += `<div class="item ask"><b>Помисли и допиши:</b><ol>${r.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></div>`;
    if (r.language) html += `<div class="item lang"><b>Език:</b> ${esc(r.language)}</div>`;
    if (r.level === "силен") html += `<div class="item good">Сега натисни „Провери сам“ и сравни с примерния отговор.</div>`;
    $("coachFb").innerHTML = html || `<div class="item lang">Коучът не успя да прочете текста. Опитай пак.</div>`;
  } catch (e) {
    round--;
    $("coachFb").innerHTML = `<div class="item lang">${esc(e.message)}</div>`;
  }
  busy = false;
  meter();
}

function review(restore) {
  const t = T[cur], v = $("ans").value.trim();
  $("mine").textContent = v;
  const sents = t.model.match(/[^.!?]+[.!?]+(?:“)?/g) || [t.model];
  $("model").innerHTML = sents.map((s, k) => `<span>${k === sents.length - 1 ? "<i>Внушение</i>" : ""}${esc(s.trim())}</span>`).join("");
  const n = sentences(v);
  $("check").innerHTML = CHECK(t)
    .map(([a, b], k) => `<li><label><input type="checkbox" data-k="${k}" ${k === 0 && n >= 3 && n <= 4 ? "checked" : ""}><span>${esc(a)}<small>${esc(b)}</small></span></label></li>`)
    .join("");
  $("check").querySelectorAll("input").forEach((c) => c.addEventListener("change", scoreUpdate));
  $("rev").hidden = false;
  $("ans").readOnly = true;
  scoreUpdate();
  if (!restore) $("rev").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function scoreUpdate() {
  const sc = [...$("check").querySelectorAll("input")].filter((b) => b.checked).length;
  $("self").textContent = `${sc} / 6`;
  PROG[T[cur].id] = { ...(PROG[T[cur].id] || {}), score: sc, answer: $("ans").value };
  dirty = true;
  $("saved").textContent = "Ще се запази в профила ти.";
}

async function commit() {
  if (!dirty) return;
  dirty = false;
  const t = T[cur], p = PROG[t.id];
  const r = await saveProgress(MOD.module.slug, [{ itemId: t.id, ok: (p.score || 0) >= 4, score: p.score || 0, answer: p.answer || "" }]);
  if (r) $("saved").textContent = "Запазено";
}
window.addEventListener("pagehide", () => {
  if (!dirty) return;
  const t = T[cur], p = PROG[t.id];
  const blob = new Blob([JSON.stringify({ module: MOD.module.slug, results: [{ itemId: t.id, ok: (p.score || 0) >= 4, score: p.score || 0, answer: p.answer || "" }] })], { type: "application/json" });
  navigator.sendBeacon?.("/api/learn/progress", blob);
});

async function load() {
  const m = await guard("child");
  topbar(m, { back: { href: "/uchenik/", label: "Начало" } });
  const slug = params().get("m");
  if (!slug) return (location.href = "/uchenik/");
  MOD = await api(`learn/module/${encodeURIComponent(slug)}`);
  T = MOD.items.map((i) => ({ ...i.data, id: i.id }));
  PROG = MOD.progress;
  LOCKED = MOD.locked;
  skeleton();
  renderHome();
  show("home");
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
