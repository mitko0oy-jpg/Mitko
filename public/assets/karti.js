// Literature cards and the diagnostic test (adapted from the 90-cards prototype).
import { $, api, esc, gradeOf, guard, lockLine, params, renderUnlock, saveProgress, shuffle, topbar } from "./app.js";

const COLORS = ["--l0", "--l1", "--l2"];
const LET = "АБВГ";
let MOD, CARDS = [], LEVELS = [], WORKS = [], LOCKED = 0, PROG = {};
let deck = [], idx = 0, right = 0, missed = [], mode = null, order = [], answered = false;
let queue = [], freeFinished = false;

const show = (id) => {
  ["home", "quiz", "end"].forEach((s) => ($(s).hidden = s !== id));
  window.scrollTo(0, 0);
};
const isDiag = () => MOD.module.kind === "diagnostic";
const last = (c) => (PROG[c.id] ? (PROG[c.id].last_ok ? 1 : 0) : undefined);

function skeleton() {
  $("main").innerHTML = `
<section id="home"></section>
<section id="quiz" hidden>
  <div class="top"><button class="back" id="backBtn">← Назад</button><div class="count" id="count"></div></div>
  <div class="prog"><i id="prog"></i></div>
  <div class="stage"><div class="card" id="card"><div class="side front" id="front"></div><div class="side backside" id="backside" aria-hidden="true"></div></div></div>
  <p class="hint">Можеш да отговаряш и с клавишите 1–4.</p>
</section>
<section id="end" class="end" hidden></section>`;
  $("backBtn").addEventListener("click", async () => {
    await flush();
    renderHome();
    show("home");
  });
}

function renderHome() {
  const box = $("home");
  if (isDiag()) {
    const done = CARDS.filter((c) => last(c) !== undefined).length;
    box.innerHTML = `<h1>${esc(MOD.module.title)}</h1><p class="lead">${esc(MOD.module.subtitle)}</p>
      <p>${CARDS.length} въпроса от трите нива. Отговаряй честно – тестът показва какво да упражниш, а не те оценява в училище.</p>
      ${done ? `<p class="notice info">Вече си решил теста (${CARDS.filter((c) => last(c) === 1).length} от ${done} верни). Можеш да го решиш пак.</p>` : ""}
      <div class="row"><button class="btn gold" id="diagStart">${done ? "Реши отново" : "Започни теста"}</button></div>`;
    $("diagStart").addEventListener("click", () => start("all"));
    return;
  }
  const wrong = CARDS.filter((c) => last(c) === 0);
  const due = CARDS.filter((c) => PROG[c.id]?.due_at && new Date(PROG[c.id].due_at) <= new Date());
  const allDone = CARDS.length && CARDS.every((c) => last(c) !== undefined);
  let h = `<h1>${esc(MOD.module.title)}</h1><p class="lead">${esc(MOD.module.subtitle)}. Докосни отговора – веднага ще разбереш дали си прав и защо.</p>`;
  if (allDone && LOCKED > 0) h += `<div id="unlockBox"></div>`;
  h += `<div class="decks">`;
  LEVELS.forEach((L, i) => {
    const cs = CARDS.filter((c) => c.l === i);
    const lockedN = (MOD.lockedLevels || {})[i] || 0;
    if (!cs.length && !lockedN) return;
    if (!cs.length) {
      h += `<button class="deck locked" data-locked="1" style="--c:var(${COLORS[i]})"><div class="sheet s2"></div><div class="sheet s1"></div>
        <div class="face"><p class="t">${esc(L.name)}</p><p class="d">${esc(L.desc)}</p>
        <div class="meta"><span>🔒 ${lockedN} карти</span><span>в пълния достъп</span></div></div></button>`;
      return;
    }
    const done = cs.filter((c) => last(c) !== undefined).length;
    const ok = cs.filter((c) => last(c) === 1).length;
    h += `<button class="deck" data-l="${i}" style="--c:var(${COLORS[i]})"><div class="sheet s2"></div><div class="sheet s1"></div>
      <div class="face"><p class="t">${esc(L.name)}</p><p class="d">${esc(L.desc)}</p>
      <div class="meta"><span>${cs.length} карти${lockedN ? ` · 🔒 ${lockedN}` : ""}</span><span>${done ? `${ok} верни от ${done}` : "Още не си започнал"}</span></div>
      <div class="bar"><i style="width:${(done / cs.length) * 100}%"></i></div></div></button>`;
  });
  h += `</div>${lockLine(LOCKED)}<div class="row">
      <button class="btn" id="allBtn">Всички ${CARDS.length} карти</button>
      ${due.length ? `<button class="btn gold" id="dueBtn">Преговор за днес (${due.length})</button>` : ""}
      ${wrong.length ? `<button class="btn ghost" id="wrongBtn">Повтори грешните (${wrong.length})</button>` : ""}
    </div>`;
  if (WORKS.length) {
    h += `<div class="mapsec"><h2>Карта на знанията</h2><p class="sub">Цветът показва как се справяш с всяка творба. Докосни творба, за да упражниш само нея.</p>
      <div class="legend"><span style="--dot:var(--ok)">знаеш добре</span><span style="--dot:var(--gold)">почти</span><span style="--dot:var(--bad)">за преговор</span><span style="--dot:var(--line)">не е проверена</span></div>
      <div class="map" id="map"></div></div>`;
  }
  h += `<p class="note">По 10 карти на ден са достатъчни. Напредъкът ти се пази в профила.</p>`;
  box.innerHTML = h;
  if ($("unlockBox")) renderUnlock($("unlockBox"), { module: MOD.module.slug, title: MOD.module.title, done: CARDS.length, total: CARDS.length + LOCKED });
  box.querySelectorAll(".deck:not(.locked)").forEach((b) => b.addEventListener("click", () => start("level", +b.dataset.l)));
  box.querySelectorAll(".deck.locked").forEach((b) =>
    b.addEventListener("click", () => {
      if (!$("unlockBox")) b.insertAdjacentHTML("afterend", `<div id="unlockBox"></div>`);
      renderUnlock($("unlockBox"), { module: MOD.module.slug, title: MOD.module.title, locked: true });
      $("unlockBox").scrollIntoView({ block: "center" });
    }),
  );
  $("allBtn").addEventListener("click", () => start("all"));
  $("dueBtn")?.addEventListener("click", () => start("due"));
  $("wrongBtn")?.addEventListener("click", () => start("wrong"));
  renderMap();
}

function workStats(name) {
  const cs = CARDS.filter((c) => (c.ws || []).includes(name));
  const done = cs.filter((c) => last(c) !== undefined);
  return { total: cs.length, done: done.length, ok: done.filter((c) => last(c) === 1).length };
}
function renderMap() {
  if (!$("map")) return;
  const works = WORKS.filter((w) => workStats(w).total > 0);
  $("map").innerHTML = works
    .map((w, i) => {
      const st = workStats(w);
      const lv = !st.done ? "" : st.ok / st.done >= 0.8 ? "strong" : st.ok / st.done >= 0.5 ? "mid" : "weak";
      const sc = st.done ? `${st.ok} от ${st.done} верни` : `${st.total} ${st.total === 1 ? "карта" : "карти"}`;
      return `<button class="tile ${lv}" data-w="${i}" aria-label="${esc(w)}: ${sc}"><span class="nm">${esc(w)}</span><span class="sc">${sc}</span></button>`;
    })
    .join("");
  $("map").querySelectorAll(".tile").forEach((b) => b.addEventListener("click", () => start("work", works[+b.dataset.w])));
}

function start(m, arg) {
  mode = { m, arg };
  if (m === "level") deck = CARDS.filter((c) => c.l === arg);
  else if (m === "all") deck = isDiag() ? CARDS.slice() : CARDS.slice();
  else if (m === "wrong") deck = CARDS.filter((c) => last(c) === 0);
  else if (m === "due") deck = CARDS.filter((c) => PROG[c.id]?.due_at && new Date(PROG[c.id].due_at) <= new Date());
  else if (m === "retry") deck = CARDS.filter((c) => arg.includes(c.id));
  else if (m === "work") deck = CARDS.filter((c) => (c.ws || []).includes(arg));
  else if (m === "works") deck = CARDS.filter((c) => (c.ws || []).some((w) => arg.includes(w)));
  if (!deck.length) {
    renderHome();
    show("home");
    return;
  }
  idx = 0;
  right = 0;
  missed = [];
  show("quiz");
  renderCard();
}

function renderCard() {
  answered = false;
  const c = deck[idx];
  const color = `var(${COLORS[c.l] || "--gold"})`;
  const cardEl = $("card");
  cardEl.style.transition = "none";
  cardEl.classList.remove("flipped");
  void cardEl.offsetWidth;
  cardEl.style.transition = "";
  cardEl.style.setProperty("--c", color);
  document.querySelector(".prog").style.setProperty("--c", color);
  $("prog").style.width = (idx / deck.length) * 100 + "%";
  $("count").innerHTML = `${idx + 1} / ${deck.length} · <b>✓ ${right}</b>`;
  order = shuffle([0, 1, 2, 3]);
  const levelName = LEVELS[c.l]?.name || "";
  $("front").innerHTML = `<div class="band"><small>${esc(levelName)}</small><strong>${isDiag() ? `Въпрос ${idx + 1}` : `Карта ${c.n}`}</strong></div>
    <p class="q">${esc(c.q)}</p>${c.qt ? `<blockquote class="quote">${esc(c.qt)}</blockquote>` : ""}
    <ul class="opts">${order.map((oi, k) => `<li><button class="opt" data-k="${k}"><span class="k">${LET[k]}</span><span>${esc(c.o[oi])}</span></button></li>`).join("")}</ul>`;
  $("front").removeAttribute("aria-hidden");
  $("backside").setAttribute("aria-hidden", "true");
  $("backside").innerHTML = "";
  $("front").querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => answer(+b.dataset.k)));
}

function answer(k) {
  if (answered) return;
  answered = true;
  const c = deck[idx];
  const correctK = order.indexOf(0);
  const ok = k === correctK;
  const btns = $("front").querySelectorAll(".opt");
  btns.forEach((b) => (b.disabled = true));
  btns[correctK].classList.add("right");
  if (!ok) btns[k].classList.add("wrong");
  PROG[c.id] = { ...(PROG[c.id] || {}), last_ok: ok };
  queue.push({ itemId: c.id, ok });
  if (queue.length >= 5) flush();
  if (ok) right++;
  else missed.push(c.id);
  $("count").innerHTML = `${idx + 1} / ${deck.length} · <b>✓ ${right}</b>`;
  const isLast = idx === deck.length - 1;
  $("backside").innerHTML = `<div class="band"><small>${esc(LEVELS[c.l]?.name || "")}</small><strong>${isDiag() ? `Въпрос ${idx + 1}` : `Карта ${c.n}`}</strong></div>
    <div class="res ${ok ? "ok" : "bad"}"><div class="mark" aria-hidden="true">${ok ? "✓" : "✗"}</div><h2>${ok ? "Вярно!" : "Не е вярно"}</h2></div>
    <p class="lbl">Верният отговор</p><p class="ans">${LET[correctK]}) ${esc(c.o[0])}</p>
    <p class="lbl">Защо</p><p class="exp">${esc(c.e)}</p>
    <p class="work">Преговори: <b>${esc(c.w)}</b></p>
    <div class="spacer"></div>
    <div class="next"><button class="btn" id="nextBtn">${isLast ? "Виж резултата" : "Следваща"}</button></div>`;
  $("nextBtn").addEventListener("click", next);
  setTimeout(() => {
    $("card").classList.add("flipped");
    $("front").setAttribute("aria-hidden", "true");
    $("backside").removeAttribute("aria-hidden");
    setTimeout(() => $("nextBtn").focus({ preventScroll: true }), 350);
  }, ok ? 500 : 900);
}

function next() {
  idx++;
  if (idx >= deck.length) return finish();
  renderCard();
  window.scrollTo({ top: 0 });
}

async function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0);
  const r = await saveProgress(MOD.module.slug, batch);
  if (r?.freeFinished) freeFinished = true;
}
window.addEventListener("pagehide", () => {
  if (!queue.length) return;
  const blob = new Blob([JSON.stringify({ module: MOD.module.slug, results: queue.splice(0) })], { type: "application/json" });
  navigator.sendBeacon?.("/api/learn/progress", blob);
});

async function finish() {
  $("prog").style.width = "100%";
  await flush();
  const n = deck.length;
  const name = isDiag()
    ? "Входен тест"
    : mode.m === "level" ? LEVELS[mode.arg].name : mode.m === "all" ? `Всички ${n} карти` : mode.m === "work" ? mode.arg : mode.m === "due" ? "Преговор за днес" : "Повторение";
  const pct = right / n, grade = gradeOf(right, n);
  const per = {};
  deck.forEach((c) => (c.ws || []).forEach((w) => {
    per[w] = per[w] || { t: 0, bad: 0 };
    per[w].t++;
    if (missed.includes(c.id)) per[w].bad++;
  }));
  const weak = Object.keys(per).filter((w) => per[w].bad > 0).sort((a, b) => per[b].bad / per[b].t - per[a].bad / per[a].t || per[b].bad - per[a].bad);
  const strong = Object.keys(per).filter((w) => per[w].bad === 0);

  const lines = [`Еду БЕЛ · ${MOD.module.title}`, `${name}: ${right} от ${n} верни – ${grade} (ориентировъчно)`];
  if (weak.length) lines.push("За преговор: " + weak.slice(0, 4).map((w) => w.replace(/[„“]/g, "")).join(", "));
  if (strong.length) lines.push("Знае добре: " + strong.slice(0, 5).map((w) => w.replace(/[„“]/g, "")).join(", "));
  lines.push("", `Подробният отчет е в родителския профил: ${location.origin}`);
  const msg = lines.join("\n");

  $("end").innerHTML = `<h2>${pct === 1 ? "Без нито една грешка!" : pct >= 0.8 ? "Много добре!" : pct >= 0.5 ? "Добра основа" : "Има какво да преговориш"}</h2>
    <p class="score">Верни: <b>${right}</b> от ${n} · грешни: ${n - right}</p><span class="grade">${grade}</span>
    <p class="small muted" style="margin-top:6px">Оценката е ориентировъчна.</p>
    <div id="endUnlock"></div>
    <div class="row" style="margin-top:18px">
      ${missed.length ? `<button class="btn gold" id="retryBtn">Повтори грешните (${missed.length})</button>` : ""}
      <button class="btn ghost" id="homeBtn">${isDiag() ? "Към теста" : "Към нивата"}</button>
      <a class="btn ghost" href="/uchenik/">Начало</a>
    </div>
    ${Object.keys(per).length > 1 || weak.length ? `<div class="block"><h3>Карта на пропуските</h3>
      <p class="sub">${weak.length ? "Тези творби имат нужда от преговор – най-слабите са най-отгоре." : "Нямаш слаби творби в този тест."}</p>
      <ul class="gaps">${weak.slice(0, 6).map((w) => `<li><span class="gn">${esc(w)}</span><span class="gc">${per[w].bad} от ${per[w].t} грешни</span><span class="gb"><i style="width:${(per[w].bad / per[w].t) * 100}%"></i></span></li>`).join("")}</ul>
      ${strong.length ? `<p class="strongs"><b>Знаеш добре:</b> ${strong.map(esc).join(", ")}</p>` : ""}</div>` : ""}
    <div class="block"><h3>Изпрати резултата на родител</h3><p class="sub">Едно докосване – и мама или татко виждат как се справяш.</p>
      <div class="sharebtns"><a class="sh-viber" href="viber://forward?text=${encodeURIComponent(msg)}">Viber</a><a class="sh-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a><button class="sh-copy" id="shCopy">Копирай текста</button></div>
      <div class="copied" id="copied"></div><div class="preview">${esc(msg)}</div></div>
    ${missed.length ? `<div class="block"><h3>Сгрешени</h3><ul class="missed">${missed.map((id) => { const c = CARDS.find((x) => x.id === id); return `<li><span>${c.n}.</span>${esc(c.q)}<em>${esc(c.w)}</em></li>`; }).join("")}</ul></div>` : ""}`;
  if (freeFinished && LOCKED > 0) renderUnlock($("endUnlock"), { module: MOD.module.slug, title: MOD.module.title, done: CARDS.length, total: CARDS.length + LOCKED });
  const ids = missed.slice();
  $("retryBtn")?.addEventListener("click", () => start("retry", ids));
  $("homeBtn").addEventListener("click", () => {
    renderHome();
    show("home");
  });
  $("shCopy").addEventListener("click", async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(msg);
      ok = true;
    } catch {}
    $("copied").textContent = ok ? "Копирано – постави го в съобщение." : "Маркирай текста отдолу и го копирай ръчно.";
  });
  show("end");
}

document.addEventListener("keydown", (e) => {
  if (!$("quiz") || $("quiz").hidden || answered) return;
  const k = { 1: 0, 2: 1, 3: 2, 4: 3, а: 0, б: 1, в: 2, г: 3 }[e.key.toLowerCase()];
  if (k !== undefined) {
    e.preventDefault();
    answer(k);
  }
});

async function load() {
  const m = await guard("child");
  topbar(m, { back: { href: "/uchenik/", label: "Начало" } });
  const slug = params().get("m");
  if (!slug) return (location.href = "/uchenik/");
  MOD = await api(`learn/module/${encodeURIComponent(slug)}`);
  document.title = `${MOD.module.title} – Еду БЕЛ`;
  CARDS = MOD.items.map((i) => ({ ...i.data, id: i.id }));
  LEVELS = MOD.module.meta.levels || [];
  WORKS = MOD.module.meta.works || [];
  LOCKED = MOD.locked;
  PROG = MOD.progress;
  skeleton();
  renderHome();
  show("home");
  if (params().get("rezhim") === "pregovor") start("due");
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
