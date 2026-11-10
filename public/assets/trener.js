// НВО тренажор по БЕЛ: 10 modules like the three NVO parts, a grade after each module, a gradebook with dates,
// an NVO forecast, a timed mock exam and a mistakes notebook.
// Two ways to run: on the site (/t/, opened with a personal code, grades kept on the server with the code)
// and as a standalone file with the questions built in (window.TRENER_BANK, grades kept in this browser).
const EMBED = window.TRENER_BANK || null;
const ONLINE = !EMBED;
const LOGO = window.TRENER_LOGO || "/assets/logo.png";

const AREAS = {
  read: { t: "Четене с разбиране", nvo: "задачи 1–7 на НВО", w: 7, c: "var(--read)" },
  lang: { t: "Български език", nvo: "задачи 8–17 на НВО", w: 10, c: "var(--lang)" },
  lit:  { t: "Литература", nvo: "задачи 18–25 на НВО", w: 8, c: "var(--lit)" },
};
// Practice decks (the literature and language cards): graded and in the gradebook, but outside the NVO forecast and the mock exam.
const EXTRA = { cards: { t: "Карти за преговор", nvo: "не влизат в прогнозата за НВО", c: "var(--gold)" } };
const ALL_AREAS = { ...AREAS, ...EXTRA };
const isNvo = (m) => !!AREAS[m.area];
let BANK = null, MODULES = [], MOD = {}, Q = {};
function setBank(b) {
  BANK = b;
  MODULES = b.modules || [];
  MOD = Object.fromEntries(MODULES.map((m) => [m.id, m]));
  Q = {};
  for (const q of b.questions) Q[q.id] = q;
}
const ofMod = (id) => BANK.questions.filter((q) => q.m === id);
const MOCK_MIN = 45;
const LET = "АБВГДЕ";
const KEY = "edubel-nvo-trener-v1";

/* ---------- saved progress ---------- */
// Standalone file: this browser only. On the site: a copy in this browser, synced to the server with the code.
let canSave = true;
const blank = () => ({ v: 1, name: "", hist: [], mist: {}, dos: {}, resetAt: 0, resets: {}, at: 0 });
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
function normState(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.hist)) return blank();
  return { ...blank(), ...o, v: 1, name: o.name || "", mist: o.mist || {}, dos: o.dos && typeof o.dos === "object" ? o.dos : {}, resets: o.resets || {} };
}
function loadLocal() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normState(JSON.parse(s)) : blank();
  } catch (e) { canSave = false; return blank(); }
}
let S = blank();
function save() {
  S.at = Date.now();
  if (ONLINE) return Online.changed();
  canSave = ls.set(KEY, JSON.stringify(S));
}

/* ---------- helpers ---------- */
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rich = (s) => esc(s).replace(/&lt;(\/?)(i|b|u|em|strong)&gt;/g, "<$1$2>").replace(/&lt;br\s*\/?&gt;/g, "<br>");
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (p, n) => (n ? p / n : 0);
const gradeOf = (r) => (r >= 0.9 ? 6 : r >= 0.76 ? 5 : r >= 0.63 ? 4 : r >= 0.5 ? 3 : 2);
const GW = { 6: "Отличен", 5: "Много добър", 4: "Добър", 3: "Среден", 2: "Слаб" };
const dec = (x) => x.toFixed(2).replace(".", ",");
const pc = (r) => Math.round(r * 100) + "%";
const two = (n) => String(n).padStart(2, "0");
function fmtDate(t, time) {
  const d = new Date(t);
  const s = `${d.getDate()}.${two(d.getMonth() + 1)}.${d.getFullYear()} г.`;
  return time ? `${s}, ${two(d.getHours())}:${two(d.getMinutes())}` : s;
}
const fmtShort = (t) => { const d = new Date(t); return `${d.getDate()}.${two(d.getMonth() + 1)}`; };
function fmtDur(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m} мин. ${s} сек.` : `${s} сек.`; }
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${two(sec % 60)}`;
const pl = (n, one, many) => (n === 1 ? one : many);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[„“"”«»'’`.!?;:]/g, "").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const modTitle = (m) => (m === "mock" ? "Пробна матура" : MOD[m] ? MOD[m].title : m);

const attemptsOf = (m) => S.hist.filter((h) => h.m === m);
const lastOf = (m) => { const a = attemptsOf(m); return a.length ? a[a.length - 1] : null; };
const bestOf = (m) => attemptsOf(m).reduce((b, h) => (!b || pct(h.p, h.n) > pct(b.p, b.n) ? h : b), null);
const mistIds = () => Object.keys(S.mist).filter((id) => Q[id]).sort((a, b) => S.mist[b].d - S.mist[a].d);

function forecast() {
  const areas = {};
  for (const k in AREAS) {
    const ms = MODULES.filter((m) => m.area === k);
    const done = ms.map((m) => lastOf(m.id)).filter(Boolean);
    areas[k] = { p: done.length ? done.reduce((s, h) => s + pct(h.p, h.n), 0) / done.length : null, done: done.length, total: ms.length };
  }
  let sw = 0, s = 0;
  for (const k in areas) if (areas[k].p !== null) { sw += AREAS[k].w; s += AREAS[k].w * areas[k].p; }
  return { areas, total: sw ? s / sw : null, done: MODULES.filter((m) => lastOf(m.id)).length };
}
// The modules that give the most NVO points for the work: weight of the module on the exam × share still to win.
function nextSteps() {
  return MODULES.filter(isNvo).map((m) => {
    const h = lastOf(m.id);
    const per = AREAS[m.area].w / MODULES.filter((x) => x.area === m.area).length;
    const p = h ? pct(h.p, h.n) : null;
    return { m, p, gain: per * (1 - (p === null ? 0.4 : p)) };
  }).filter((x) => x.p === null || x.p < 0.9).sort((a, b) => b.gain - a.gain).slice(0, 3);
}

/* ---------- home: forecast, modules, gradebook ---------- */
let sess = null, timer = null, histAll = false;

function home(scrollTo) {
  stopTimer();
  sess = null;
  Game.leave();
  const nvoCount = BANK.questions.filter((q) => MOD[q.m] && isNvo(MOD[q.m])).length;
  const cardCount = BANK.questions.length - nvoCount;
  const f = forecast();
  const mist = mistIds().length;
  let h = `<header class="hd">
      <div class="brand"><img src="${LOGO}" alt="Еду БЕЛ" width="60" height="60"><span class="eyebrow">НВО по БЕЛ · 7. клас</span></div>
      <h1>НВО тренажор <em>по БЕЛ</em></h1>
      <p class="lead">${nvoCount} задачи в ${MODULES.filter(isNvo).length} модула, подредени като трите части на националното външно оценяване${cardCount ? `, и ${cardCount} карти за преговор` : ""}. След всеки модул получаваш оценка, а тя се записва в бележника с датата.</p>
      <div class="facts"><span>${nvoCount} задачи</span>${cardCount ? `<span>${cardCount} карти</span>` : ""}<span>Оценки от 2 до 6</span><span>Пробна матура с таймер</span></div>
    </header>`;
  if (!canSave) h += `<p class="warnbox">Този браузър не позволява да се пазят данни (например в личен прозорец). Можеш да решаваш, но оценките ще изчезнат, когато затвориш страницата.</p>`;
  if (ONLINE && Online.flash) { h += `<p class="okbox" role="status">${esc(Online.flash)}</p>`; Online.flash = ""; }
  if (ONLINE && Online.offline) h += `<p class="warnbox">Няма връзка с интернет. Можеш да решаваш – оценките ще се запишат, когато връзката се върне.</p>`;
  h += forecastPanel(f, mist);
  h += Game.card();
  h += modulesSection();
  h += gradebook();
  if (ONLINE) h += Online.accessSection();
  h += `<section class="reset" id="reset"><h3>Започни отначало</h3>
      <p class="small muted">Изтрива всички оценки, датите, тетрадката с грешки и напредъка в играта. Задачите остават. Ако искаш да изчистиш само един модул, използвай „Нулирай“ до него.</p>
      <div id="resetZone"><button class="btn line danger sm" data-act="resetAllAsk">Нулирай целия прогрес</button></div></section>`;
  app.innerHTML = h;
  drawChart();
  if (scrollTo) document.getElementById(scrollTo)?.scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
}

function ring(r) {
  const R = 64, C = 2 * Math.PI * R;
  const v = r === null ? 0 : Math.max(0.004, r);
  return `<svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--band)" stroke-width="12"/>
    <circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--gold)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * v).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 75 75)"/></svg>`;
}

function forecastPanel(f, mist) {
  const r = f.total;
  let h = `<section class="fc" aria-labelledby="fcT"><div class="fc-top">
      <div class="meter">${ring(r)}<div class="in"><b>${r === null ? "–" : pc(r)}</b><span>готовност</span></div></div>
      <div class="fc-text"><span class="eyebrow">Прогноза за НВО</span>`;
  if (r === null) {
    h += `<h2 id="fcT">Реши първия модул и тук ще видиш с каква оценка би излязъл днес.</h2>
      <p class="muted small">Прогнозата претегля частите като на изпита: четенето е 7 задачи, езикът – 10, литературата – 8.</p>`;
  } else {
    const g = gradeOf(r);
    h += `<h2 id="fcT">Ако изпитът е днес: <span class="fc-grade">${GW[g]} ${g}</span></h2>
      <p class="muted small">По последната оценка от ${f.done} от ${MODULES.length} модула${f.done < MODULES.length ? ". С всеки следващ модул прогнозата става по-точна" : ""}.</p>`;
  }
  h += `</div></div><div class="areas">`;
  for (const k in AREAS) {
    const a = f.areas[k];
    h += `<div class="area"><span class="nm">${AREAS[k].t}<small>${AREAS[k].nvo}</small></span><span class="v">${a.p === null ? "–" : pc(a.p)}</span>
      <div class="bar" role="img" aria-label="${AREAS[k].t}: ${a.p === null ? "няма решени модули" : pc(a.p)}"><i style="width:${a.p === null ? 0 : Math.round(a.p * 100)}%;--c:${AREAS[k].c}"></i></div></div>`;
  }
  h += `</div>`;
  const nx = nextSteps();
  if (nx.length) {
    h += `<div class="next"><h3>Тук ще спечелиш най-много точки</h3><ol>`;
    for (const x of nx) {
      h += `<li><p><b>${esc(x.m.title)}</b><small>${x.p === null ? "Още не е решаван" : `Последно: ${pc(x.p)} – ${GW[gradeOf(x.p)].toLowerCase()} ${gradeOf(x.p)}`} · ${AREAS[x.m.area].t.toLowerCase()}</small></p>
        <button class="btn sm" data-act="start" data-m="${x.m.id}">${x.p === null ? "Започни" : "Упражни"}</button></li>`;
    }
    h += `</ol></div>`;
  }
  h += `<div class="fc-actions">
      <button class="tool" data-act="mock"><b>Пробна матура</b><span>25 задачи от всички модули, ${MOCK_MIN} минути, оценка накрая</span></button>
      <button class="tool alt" data-act="mist" ${mist ? "" : "disabled"}><b>Тетрадка с грешки${mist ? ` · ${mist}` : ""}</b><span>${mist ? "Задачите, в които си сгрешил. Изчезват, след като ги решиш вярно 2 пъти." : "Тук ще се събират задачите, в които сгрешиш."}</span></button>
    </div></section>`;
  return h;
}

function spark(m) {
  const a = attemptsOf(m).slice(-8);
  if (a.length < 2) return "";
  const W = 84, H = 22, pts = a.map((h, i) => [4 + (i * (W - 8)) / (a.length - 1), H - 3 - pct(h.p, h.n) * (H - 6)]);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Последни ${a.length} резултата: ${a.map((h) => pc(pct(h.p, h.n))).join(", ")}">
    <polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="var(--pen)"/></svg>`;
}

function modulesSection() {
  let h = `<section class="parts" id="modules" style="display:grid;gap:26px"><h2>Модули</h2>`;
  for (const k in ALL_AREAS) {
    if (!MODULES.some((x) => x.area === k)) continue;
    h += `<div class="part"><div class="part-hd"><h3>${ALL_AREAS[k].t}</h3><span>${AREAS[k] ? "като " : ""}${ALL_AREAS[k].nvo}</span></div><div class="mods">`;
    for (const m of MODULES.filter((x) => x.area === k)) {
      const n = ofMod(m.id).length, last = lastOf(m.id), best = bestOf(m.id), cnt = attemptsOf(m.id).length;
      const g = last ? gradeOf(pct(last.p, last.n)) : null;
      h += `<article class="mod" id="mod-${m.id}">
        <span class="no" style="--c:${ALL_AREAS[k].c}">${m.n}</span>
        <div class="body"><h3>${esc(m.title)}</h3><p>${esc(m.desc)}</p>
          <div class="meta"><span>${n} ${k === "cards" ? "карти" : "задачи"}</span>${last ? `<span>Последно: ${fmtDate(last.d)} · ${last.p}/${last.n}</span><span>Най-добро: ${best.p}/${best.n}</span><span>${cnt} ${pl(cnt, "опит", "опита")}</span>` : `<span>Още не е решаван</span>`}${spark(m.id)}</div>
          ${cnt ? `<div><button class="link" data-act="resetModAsk" data-m="${m.id}">Нулирай модула</button></div>` : ""}</div>
        <div class="side"><span class="gbox"><span class="g ${g ? "" : "none"}" aria-label="${g ? `Последна оценка: ${GW[g]} ${g}` : "Няма оценка"}">${g ?? "–"}</span><small>${g ? "оценка" : "без оценка"}</small></span>
          <button class="btn sm ${last ? "line" : ""}" data-act="start" data-m="${m.id}">${last ? "Реши пак" : "Започни"}</button></div>
        <div class="zone" id="zone-${m.id}" hidden></div>
      </article>`;
    }
    h += `</div></div>`;
  }
  return h + `</section>`;
}

function gradebook() {
  const hist = S.hist;
  const lasts = MODULES.map((m) => lastOf(m.id)).filter(Boolean);
  const avg = lasts.length ? lasts.reduce((s, h) => s + gradeOf(pct(h.p, h.n)), 0) / lasts.length : null;
  const sixes = hist.filter((h) => gradeOf(pct(h.p, h.n)) === 6).length;
  const solved = hist.reduce((s, h) => s + h.n, 0);
  let h = `<section class="book" id="book" aria-labelledby="bookT"><div class="book-hd"><h2 id="bookT">Бележник</h2>
      <label for="pupil">на <input id="pupil" maxlength="40" placeholder="твоето име" value="${esc(S.name)}" autocomplete="off"></label></div>
    <div class="stats">
      <div class="stat"><b class="hand">${avg === null ? "–" : dec(avg)}</b><span>среден успех по модулите</span></div>
      <div class="stat"><b>${hist.length}</b><span>${pl(hist.length, "решен тест", "решени теста")}</span></div>
      <div class="stat"><b>${solved}</b><span>решени задачи</span></div>
      <div class="stat"><b>${sixes}</b><span>${pl(sixes, "шестица", "шестици")}</span></div>
    </div>`;
  if (!hist.length) {
    return h + `<p class="empty">Още няма оценки. Реши който и да е модул – оценката и датата ще се запишат тук, а графиката ще показва как се движиш.</p></section>`;
  }
  h += `<div class="chart" id="chart"></div>
    <div class="legend"><span><i></i>модул</span><span><i class="mk"></i>пробна матура</span><span>Ивиците показват границите на оценките 2–6.</span></div>`;
  const rows = hist.slice().reverse();
  const shown = histAll ? rows : rows.slice(0, 8);
  h += `<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Тест</th><th class="num">Точки</th><th class="num">Оценка</th></tr></thead><tbody>`;
  for (const r of shown) {
    const g = gradeOf(pct(r.p, r.n));
    const dd = new Date(r.d);
    h += `<tr><td class="dt">${dd.getDate()}.${two(dd.getMonth() + 1)}.${dd.getFullYear()}<small>${two(dd.getHours())}:${two(dd.getMinutes())} ч.</small></td><td>${esc(modTitle(r.m))}</td><td class="num">${r.p}/${r.n}</td><td class="num"><span class="hand" title="${GW[g]}">${g}</span></td></tr>`;
  }
  h += `</tbody></table></div>`;
  if (rows.length > 8) h += `<div><button class="link" data-act="histToggle">${histAll ? "Покажи само последните 8" : `Покажи всички ${rows.length} оценки`}</button></div>`;
  h += shareBlock("book", "Изпрати бележника на родител", "Мама или татко ще видят оценките, датите и прогнозата за НВО.", bookMsg());
  return h + `</section>`;
}

function drawChart() {
  const box = document.getElementById("chart");
  if (!box) return;
  const hist = S.hist.slice(-40);
  const W = Math.max(280, Math.round(box.clientWidth || 600)), H = W < 480 ? 190 : 220, L = 38, R = 28, T = 10, B = 24;
  const x = (i) => (hist.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (hist.length - 1));
  const y = (r) => T + (1 - r) * (H - T - B);
  const bands = [[0, 0.5, 2], [0.5, 0.63, 3], [0.63, 0.76, 4], [0.76, 0.9, 5], [0.9, 1, 6]];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Графика на резултатите във времето, в проценти">`;
  bands.forEach(([a, b, g], i) => {
    if (i % 2 === 0) s += `<rect x="${L}" y="${y(b).toFixed(1)}" width="${W - L - R}" height="${(y(a) - y(b)).toFixed(1)}" fill="var(--band)"/>`;
    s += `<text x="${W - R + 10}" y="${((y(a) + y(b)) / 2 + 5).toFixed(1)}" font-family="Caveat, cursive" font-weight="700" font-size="17" fill="var(--pen)">${g}</text>`;
  });
  [0, 0.5, 1].forEach((r) => { s += `<text x="${L - 6}" y="${(y(r) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--muted)">${Math.round(r * 100)}%</text>`; });
  s += `<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="var(--line)" stroke-width="1"/>`;
  s += `<text x="${L}" y="${H - 6}" font-size="12" fill="var(--muted)">${fmtShort(hist[0].d)}</text>`;
  if (hist.length > 1) s += `<text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="12" fill="var(--muted)">${fmtShort(hist[hist.length - 1].d)}</text>`;
  if (hist.length > 1) s += `<polyline points="${hist.map((h, i) => `${x(i).toFixed(1)},${y(pct(h.p, h.n)).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--lang)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  hist.forEach((h, i) => {
    const cx = x(i).toFixed(1), cy = y(pct(h.p, h.n)).toFixed(1);
    s += h.m === "mock"
      ? `<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" transform="rotate(45 ${cx} ${cy})" fill="var(--gold)" stroke="var(--paper)" stroke-width="2"/>`
      : `<circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--lang)" stroke="var(--paper)" stroke-width="2"/>`;
    s += `<circle class="hit" data-i="${i}" cx="${cx}" cy="${cy}" r="14" fill="transparent"/>`;
  });
  s += `</svg><div class="tip" id="tip" hidden></div>`;
  box.innerHTML = s;
  const tip = document.getElementById("tip");
  const show = (el) => {
    const h = hist[+el.dataset.i], g = gradeOf(pct(h.p, h.n));
    const svg = box.querySelector("svg"), k = 1;
    tip.innerHTML = `<b>${esc(modTitle(h.m))}</b><br>${fmtDate(h.d, true)}<br>${h.p}/${h.n} · ${GW[g]} ${g}`;
    tip.style.left = `${Math.min(Math.max(+el.getAttribute("cx") * k, 80), svg.getBoundingClientRect().width - 80)}px`;
    tip.style.top = `${+el.getAttribute("cy") * k}px`;
    tip.hidden = false;
  };
  box.querySelectorAll(".hit").forEach((el) => {
    el.addEventListener("pointerenter", () => show(el));
    el.addEventListener("pointerdown", () => show(el));
    el.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
}

/* ---------- send to a parent ---------- */
function bookMsg() {
  const f = forecast();
  const lines = [`Бележник – НВО тренажор по БЕЛ${S.name.trim() ? ` – ${S.name.trim()}` : ""}`];
  const lasts = MODULES.map((m) => [m, lastOf(m.id)]).filter((x) => x[1]);
  if (lasts.length) {
    const avg = lasts.reduce((s, x) => s + gradeOf(pct(x[1].p, x[1].n)), 0) / lasts.length;
    lines.push(`Среден успех: ${dec(avg)} (решени ${lasts.length} от ${MODULES.length} модула)`);
  }
  if (f.total !== null) { const g = gradeOf(f.total); lines.push(`Прогноза за НВО: ${pc(f.total)} – ${GW[g]} ${g}`); }
  lines.push("", "Последни оценки:");
  for (const [m, h] of lasts) { const g = gradeOf(pct(h.p, h.n)); lines.push(`• ${m.title} – ${GW[g]} ${g} (${h.p}/${h.n}, ${fmtDate(h.d)})`); }
  const mk = lastOf("mock");
  if (mk) { const g = gradeOf(pct(mk.p, mk.n)); lines.push(`• Пробна матура – ${GW[g]} ${g} (${mk.p}/${mk.n}, ${fmtDate(mk.d)})`); }
  const nx = nextSteps().filter((x) => x.p !== null).slice(0, 2);
  if (nx.length) lines.push("", `За упражнение: ${nx.map((x) => x.m.title).join(", ")}`);
  const mist = mistIds().length;
  if (mist) lines.push(`В тетрадката с грешки: ${mist} ${pl(mist, "задача", "задачи")}`);
  lines.push("", "Подготовка за НВО по БЕЛ: edubel.site");
  return lines.join("\n");
}
function resultMsg(r) {
  const g = gradeOf(pct(r.p, r.n));
  const who = S.name.trim() || "Решен тест";
  const lines = [`${who}: „${r.s.title}“ – ${GW[g]} ${g}`, `${r.p} от ${r.n} точки (${pc(pct(r.p, r.n))}), ${fmtDate(r.rec ? r.rec.d : Date.now(), true)}`];
  if (r.rec && r.rec.a) for (const k in AREAS) lines.push(`• ${AREAS[k].t}: ${r.rec.a[k][0]}/${r.rec.a[k][1]}`);
  if (r.prev) { const d = r.p - r.prev.p; lines.push(d > 0 ? `С ${d} ${pl(d, "точка", "точки")} повече от миналия път.` : d < 0 ? `С ${-d} ${pl(-d, "точка", "точки")} по-малко от миналия път.` : "Колкото и миналия път."); }
  lines.push("", "Подготовка за НВО по БЕЛ: edubel.site");
  return lines.join("\n");
}
function shareBlock(id, title, sub, msg) {
  const t = encodeURIComponent(msg);
  return `<div class="share"><h3>${esc(title)}</h3><p class="small muted">${esc(sub)}</p>
    <pre class="preview" id="pv-${id}">${esc(msg)}</pre>
    <div class="sharebtns"><a class="sh-viber" href="viber://forward?text=${t}" target="_blank" rel="noopener">Viber</a><a class="sh-wa" href="https://wa.me/?text=${t}" target="_blank" rel="noopener">WhatsApp</a><button class="sh-copy" data-act="copy" data-id="${id}">Копирай</button></div>
    <p class="small muted" id="cp-${id}" role="status"></p></div>`;
}

/* ---------- sessions ---------- */
function prepView(q) {
  if (q.t === "mc") return { ord: q.fix ? q.o.map((_, i) => i) : shuffle(q.o.map((_, i) => i)) };
  if (q.t === "match") return { right: shuffle(q.pairs.map((_, i) => i)) };
  if (q.t === "order") {
    let o = shuffle(q.items.map((_, i) => i));
    if (o.length > 1 && o.every((v, i) => v === i)) o = [o[1], o[0], ...o.slice(2)];
    return { ord: o };
  }
  return {};
}
function initAns(q, v) {
  if (q.t === "order") return v.ord.slice();
  if (q.t === "match") return q.pairs.map(() => -1);
  return null;
}
function newSess(kind, m, title, qs) {
  const view = qs.map(prepView);
  sess = { kind, m, title, qs, view, i: 0, ans: qs.map((q, i) => initAns(q, view[i])), ok: qs.map(() => null), checked: qs.map(() => false), t0: Date.now(), touched: false };
  if (kind === "mock") startTimer();
  renderQ();
}
// Reading questions stay together with their text; passages come in random order.
function moduleQs(m) {
  const qs = ofMod(m);
  if (!qs.some((q) => q.p)) return shuffle(qs);
  const groups = {};
  for (const q of qs) (groups[q.p || "_"] = groups[q.p || "_"] || []).push(q);
  return shuffle(Object.values(groups)).flat();
}
function startModule(m) { newSess("module", m, MOD[m].title, moduleQs(m)); }
function startMistakes(ids) {
  const list = (ids && ids.length ? ids : mistIds()).filter((id) => Q[id]).slice(0, 20);
  if (!list.length) return home();
  newSess("mist", "mist", "Тетрадка с грешки", shuffle(list.map((id) => Q[id])));
}
function pick(arr, n) { return shuffle(arr).slice(0, n); }
function buildMock() {
  const read = ofMod(MODULES.find((m) => m.area === "read").id);
  const byP = {};
  for (const q of read) (byP[q.p || "_"] = byP[q.p || "_"] || []).push(q);
  const ps = shuffle(Object.keys(byP));
  let r = byP[ps[0]].slice(0, 7);
  for (const p of ps.slice(1)) { if (r.length >= 7) break; r = r.concat(pick(byP[p], 7 - r.length)); }
  const langMods = MODULES.filter((m) => m.area === "lang");
  let lang = langMods.map((m) => pick(ofMod(m.id), 1)[0]).filter(Boolean);
  const restL = shuffle(langMods.flatMap((m) => ofMod(m.id)).filter((q) => !lang.includes(q)));
  lang = lang.concat(restL.slice(0, Math.max(0, 10 - lang.length)));
  lang.sort((a, b) => MOD[a.m].n - MOD[b.m].n);
  const litMods = shuffle(MODULES.filter((m) => m.area === "lit"));
  const counts = litMods.map((_, i) => Math.floor(8 / litMods.length) + (i < 8 % litMods.length ? 1 : 0));
  let lit = litMods.flatMap((m, i) => pick(ofMod(m.id), counts[i]));
  lit.sort((a, b) => MOD[a.m].n - MOD[b.m].n);
  return r.concat(lang, lit);
}
function startMock() { newSess("mock", "mock", "Пробна матура", buildMock()); }

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    if (!sess || sess.kind !== "mock") return stopTimer();
    const left = MOCK_MIN * 60 - Math.round((Date.now() - sess.t0) / 1000);
    const el = document.getElementById("clock");
    if (el) { el.textContent = fmtClock(Math.max(0, left)); el.classList.toggle("low", left <= 300); }
    if (left <= 0) { stopTimer(); finish(true); }
  }, 1000);
}
function stopTimer() { if (timer) clearInterval(timer); timer = null; }

function isRight(q, a) {
  if (q.t === "mc") return a === q.a;
  if (q.t === "input") return a != null && q.a.some((x) => norm(x) === norm(a));
  if (q.t === "match" || q.t === "order") return Array.isArray(a) && a.every((v, i) => v === i);
  return false;
}
function answered(q, a) {
  if (q.t === "mc") return a !== null && a !== undefined;
  if (q.t === "input") return !!String(a || "").trim();
  if (q.t === "match") return Array.isArray(a) && a.every((v) => v >= 0);
  return true;
}
function answerText(q, a) {
  if (q.t === "mc") return a === null || a === undefined ? "без отговор" : q.o[a];
  if (q.t === "input") return String(a || "").trim() || "без отговор";
  if (q.t === "match") return q.pairs.map((p, i) => `${p[0]} – ${a && a[i] >= 0 ? q.pairs[a[i]][1] : "?"}`).join("; ");
  if (q.t === "order") return (a || []).map((k) => q.items[k]).join(" → ");
  return "";
}
function rightText(q) {
  if (q.t === "mc") return q.o[q.a];
  if (q.t === "input") return q.a[0];
  if (q.t === "match") return q.pairs.map((p) => `${p[0]} – ${p[1]}`).join("; ");
  if (q.t === "order") return q.items.join(" → ");
  return "";
}
function track(id, ok) {
  if (!ok) {
    const m = S.mist[id] || { n: 0, ok: 0 };
    m.n++; m.ok = 0; m.d = Date.now();
    S.mist[id] = m;
  } else if (S.mist[id]) {
    S.mist[id].ok++;
    if (S.mist[id].ok >= 2) delete S.mist[id];
  }
  save();
}

/* ---------- one task on screen ---------- */
function passageBlock(pid) {
  const p = BANK.passages[pid];
  return `<details class="passage" open><summary>${esc(p.title)}</summary><div class="ptext">${p.text.map((t) => `<p>${rich(t)}</p>`).join("")}${p.src ? `<p class="src">${esc(p.src)}</p>` : ""}</div></details>`;
}
function body(q, v, a, locked, showKey) {
  if (q.t === "mc") {
    return `<div class="opts" role="radiogroup" aria-label="Отговори">${v.ord.map((oi, k) => {
      let c = a === oi ? "sel" : "";
      if (showKey) c = oi === q.a ? "right" : a === oi ? "wrong" : "";
      return `<button class="opt ${c}" role="radio" aria-checked="${a === oi}" data-act="pick" data-v="${oi}" ${locked ? "disabled" : ""}><span class="key">${LET[k]}</span><span>${rich(q.o[oi])}</span></button>`;
    }).join("")}</div>`;
  }
  if (q.t === "input") {
    const c = showKey ? (isRight(q, a) ? "right" : "wrong") : "";
    return `<input class="field ${c}" id="ansIn" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Твоят отговор" placeholder="Напиши отговора" value="${esc(a || "")}" ${locked ? "readonly" : ""}>${q.hint ? `<p class="hint">${rich(q.hint)}</p>` : ""}`;
  }
  if (q.t === "match") {
    return `<div class="match">${q.pairs.map((p, i) => {
      const c = showKey ? (a[i] === i ? "right" : "wrong") : "";
      return `<div class="mrow ${c}"><span class="l">${rich(p[0])}</span><select data-i="${i}" aria-label="${esc(String(p[0]).replace(/<[^>]+>/g, ""))}" ${locked ? "disabled" : ""}><option value="-1">Избери…</option>${v.right.map((ri) => `<option value="${ri}" ${a[i] === ri ? "selected" : ""}>${esc(q.pairs[ri][1])}</option>`).join("")}</select>${showKey && a[i] !== i ? `<span class="fix">Вярно: ${esc(p[1])}</span>` : ""}</div>`;
    }).join("")}</div>`;
  }
  if (q.t === "order") {
    return `<ol class="ord">${a.map((k, pos) => {
      const c = showKey ? (k === pos ? "right" : "wrong") : "";
      return `<li class="${c}"><span>${rich(q.items[k])}</span><span class="mv">${locked ? "" : `<button data-act="mv" data-k="${pos}" data-d="-1" aria-label="Нагоре" ${pos === 0 ? "disabled" : ""}>↑</button><button data-act="mv" data-k="${pos}" data-d="1" aria-label="Надолу" ${pos === a.length - 1 ? "disabled" : ""}>↓</button>`}</span></li>`;
    }).join("")}</ol>`;
  }
  return "";
}

function renderQ() {
  const s = sess, q = s.qs[s.i], v = s.view[s.i], a = s.ans[s.i];
  const mock = s.kind === "mock", done = s.checked[s.i];
  const okN = s.ok.filter((x) => x === true).length;
  const left = MOCK_MIN * 60 - Math.round((Date.now() - s.t0) / 1000);
  let h = `<div class="qbar"><button class="back" data-act="quitAsk">← Табло</button><span class="qtitle">${esc(s.title)}</span>
      ${mock ? `<span class="pill ${left <= 300 ? "low" : ""}" id="clock" aria-label="Оставащо време">${fmtClock(Math.max(0, left))}</span>` : `<span class="pill" aria-label="Верни отговори">✓ ${okN}</span>`}
      <div class="prog"><i style="width:${((mock ? s.ans.filter((x, i) => answered(s.qs[i], x) && (s.qs[i].t !== "order" || s.touchedIdx?.[i])).length : s.i + (done ? 1 : 0)) / s.qs.length) * 100}%"></i></div></div>
    <div id="quitZone"></div>`;
  const nav = `<nav class="nav" aria-label="Задачи">${s.qs.map((qq, i) => `<button data-act="go" data-i="${i}" class="${i === s.i ? "cur" : ""} ${answered(qq, s.ans[i]) && (qq.t !== "order" || s.touchedIdx?.[i]) ? "done" : ""}" aria-label="Задача ${i + 1}">${i + 1}</button>`).join("")}</nav>`;
  h += `<article class="qcard"><p class="qnum">Задача ${s.i + 1} от ${s.qs.length} · ${esc(MOD[q.m].title)}${q.nvo ? ` · като задача ${esc(q.nvo)} на НВО` : ""}</p>`;
  if (q.p && BANK.passages[q.p]) h += passageBlock(q.p);
  if (q.text) h += `<blockquote class="qtext">${rich(q.text)}</blockquote>`;
  h += `<h2 class="qq">${rich(q.q)}</h2>`;
  h += body(q, v, a, done || false, done && !mock);
  if (done && !mock) {
    const ok = s.ok[s.i];
    h += `<div class="fb ${ok ? "ok" : "no"}" id="fb" tabindex="-1"><b class="t">${ok ? "Вярно!" : "Не е вярно."}</b>${ok ? "" : `<span>Верният отговор: <b>${rich(rightText(q))}</b></span>`}${q.why ? `<span class="why">${rich(q.why)}</span>` : ""}</div>`;
  }
  h += `<div class="qact">`;
  if (mock) {
    h += `<button class="btn line sm" data-act="prev" ${s.i === 0 ? "disabled" : ""}>← Предишна</button>
      ${s.i < s.qs.length - 1 ? `<button class="btn sm" data-act="mnext">Следваща →</button>` : `<button class="btn gold sm" data-act="submitAsk">Предай матурата</button>`}`;
  } else if (!done) {
    h += `<button class="link" data-act="restartAsk">Започни отначало</button><button class="btn" id="checkBtn" data-act="check" ${answered(q, a) ? "" : "disabled"}>Провери</button>`;
  } else {
    h += `<button class="link" data-act="restartAsk">Започни отначало</button><button class="btn gold" id="nextBtn" data-act="next">${s.i < s.qs.length - 1 ? "Следваща задача →" : "Виж оценката"}</button>`;
  }
  h += `</div>`;
  if (mock) h += `<div id="submitZone">${s.i < s.qs.length - 1 ? `<button class="link" data-act="submitAsk">Предай матурата сега</button>` : ""}</div>`;
  h += `</article>`;
  if (mock) h += `<section style="display:grid;gap:8px"><p class="small muted">Отиди на задача (тъмните са с отговор):</p>${nav}</section>`;
  app.innerHTML = h;
  window.scrollTo(0, 0);
  if (done && !mock) document.getElementById("nextBtn")?.focus({ preventScroll: true });
  const inp = document.getElementById("ansIn");
  if (inp && !done) {
    inp.addEventListener("input", () => {
      s.ans[s.i] = inp.value;
      const b = document.getElementById("checkBtn");
      if (b) b.disabled = !answered(q, inp.value);
      if (mock) updateNav();
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !mock && answered(q, inp.value)) { e.preventDefault(); check(); } });
    if (!mock) inp.focus({ preventScroll: true });
  }
  app.querySelectorAll(".match select").forEach((sel) => sel.addEventListener("change", () => {
    s.ans[s.i][+sel.dataset.i] = +sel.value;
    const b = document.getElementById("checkBtn");
    if (b) b.disabled = !answered(q, s.ans[s.i]);
    if (mock) updateNav();
  }));
}
function updateNav() {
  const s = sess;
  app.querySelectorAll(".nav button").forEach((b) => {
    const i = +b.dataset.i;
    b.classList.toggle("done", answered(s.qs[i], s.ans[i]) && (s.qs[i].t !== "order" || !!s.touchedIdx?.[i]));
  });
}
function check() {
  const s = sess, q = s.qs[s.i];
  if (!answered(q, s.ans[s.i]) || s.checked[s.i]) return;
  s.checked[s.i] = true;
  s.ok[s.i] = isRight(q, s.ans[s.i]);
  s.touched = true;
  track(q.id, s.ok[s.i]);
  renderQ();
}

/* ---------- result ---------- */
function finish(timeUp) {
  const s = sess;
  stopTimer();
  if (s.kind === "mock") s.qs.forEach((q, i) => { s.ok[i] = isRight(q, s.ans[i]); track(q.id, s.ok[i]); });
  const p = s.ok.filter(Boolean).length, n = s.qs.length;
  const sec = Math.min(Math.round((Date.now() - s.t0) / 1000), s.kind === "mock" ? MOCK_MIN * 60 : Infinity);
  const prev = s.kind === "mist" ? null : lastOf(s.m);
  let rec = null;
  if (s.kind !== "mist") {
    rec = { m: s.m, d: Date.now(), p, n, s: sec, w: s.qs.filter((q, i) => !s.ok[i]).map((q) => q.id) };
    if (s.kind === "mock") {
      rec.a = {};
      for (const k in AREAS) {
        const idx = s.qs.map((q, i) => i).filter((i) => MOD[s.qs[i].m].area === k);
        rec.a[k] = [idx.filter((i) => s.ok[i]).length, idx.length];
      }
    }
    S.hist.push(rec);
    save();
    if (ONLINE) Online.syncNow();
  }
  result({ s, p, n, sec, prev, rec, timeUp });
}

function result(r) {
  const { s, p, n } = r;
  const g = gradeOf(pct(p, n));
  const wrongIdx = s.qs.map((q, i) => i).filter((i) => !s.ok[i]);
  let delta = "";
  if (r.prev) {
    const d = p - r.prev.p;
    delta = d > 0 ? `<span class="delta up">С ${d} ${pl(d, "точка", "точки")} повече от миналия път (${fmtDate(r.prev.d)}).</span>`
      : d < 0 ? `<span class="delta down">С ${-d} ${pl(-d, "точка", "точки")} по-малко от миналия път (${fmtDate(r.prev.d)}).</span>`
      : `<span class="delta">Толкова точки, колкото и миналия път (${fmtDate(r.prev.d)}).</span>`;
  }
  const praise = g === 6 ? "Браво! Това е отлично представяне." : g === 5 ? "Много добре. Още малко и стигаш шестицата." : g === 4 ? "Добра основа. Прегледай грешките по-долу и реши пак." : g === 3 ? "Има какво да се упражни. Прочети обясненията към грешките и опитай отново." : "Не се отказвай. Прочети обясненията, упражни грешките и реши модула пак.";
  let h = `<div class="qbar"><button class="back" data-act="home">← Табло</button><span class="qtitle">${esc(s.title)}</span><span></span></div>
    <section class="res"><div class="stamp" role="img" aria-label="Оценка ${GW[g]} ${g}"><span class="gn">${g}</span><span class="gw">${GW[g]}</span></div>
      <div class="info"><span class="eyebrow">${s.kind === "mist" ? "Упражнение · не влиза в бележника" : `Записано в бележника · ${fmtDate(r.rec.d, true)}`}</span>
        <h1 style="font-size:clamp(28px,6vw,40px)">${esc(s.title)}</h1>
        <p class="score">${p} от ${n} ${pl(n, "точка", "точки")} · ${pc(pct(p, n))}</p>
        <p class="muted">${r.timeUp ? "Времето изтече и матурата се предаде сама. " : ""}Време: ${fmtDur(r.sec)}</p>
        ${delta}<p>${praise}</p></div></section>`;
  if (s.kind === "mock") {
    h += `<section class="fc"><h2>По части, като на НВО</h2><div class="areas">`;
    for (const k in AREAS) {
      const [ap, an] = r.rec.a[k];
      h += `<div class="area"><span class="nm">${AREAS[k].t}<small>${AREAS[k].nvo}</small></span><span class="v">${ap}/${an}</span><div class="bar"><i style="width:${an ? Math.round((ap / an) * 100) : 0}%;--c:${AREAS[k].c}"></i></div></div>`;
    }
    h += `</div></section>`;
  }
  h += `<div class="row">${s.kind === "module" ? `<button class="btn" data-act="start" data-m="${s.m}">Реши модула пак</button>` : s.kind === "mock" ? `<button class="btn" data-act="mock">Нова пробна матура</button>` : ""}
    ${wrongIdx.length ? `<button class="btn gold" data-act="mistThese">Упражни ${wrongIdx.length} ${pl(wrongIdx.length, "грешка", "грешки")}</button>` : ""}
    <button class="btn line" data-act="home">Към таблото</button></div>`;
  if (s.kind !== "mist") h += shareBlock("res", "Покажи на родител", "Изпрати резултата с едно докосване или копирай текста.", resultMsg(r));
  if (wrongIdx.length) {
    h += `<section class="review"><h2>Какво да запомниш</h2>`;
    for (const i of wrongIdx) {
      const q = s.qs[i];
      h += `<article class="rv"><span class="qnum">${esc(MOD[q.m].title)}</span>${q.text ? `<blockquote class="qtext">${rich(q.text)}</blockquote>` : ""}<p class="q">${rich(q.q)}</p>
        <dl><dt>Твоят отговор</dt><dd class="bad">${rich(answerText(q, s.ans[i]))}</dd><dt>Верният</dt><dd class="good">${rich(rightText(q))}</dd></dl>
        ${q.why ? `<p class="why">${rich(q.why)}</p>` : ""}</article>`;
    }
    h += `</section>`;
  } else {
    h += `<p class="empty">Нито една грешка. ${s.kind === "module" ? "Опитай пробната матура или следващия модул." : ""}</p>`;
  }
  app.innerHTML = h;
  window.scrollTo(0, 0);
  lastWrong = wrongIdx.map((i) => s.qs[i].id);
}
let lastWrong = [];

/* ---------- actions ---------- */
function confirmBox(zoneId, text, yesAct, yesLabel, extra) {
  const z = document.getElementById(zoneId);
  if (!z) return;
  z.hidden = false;
  z.innerHTML = `<div class="confirm" role="alertdialog" aria-label="${esc(text)}"><p>${esc(text)}</p><button class="btn solid-danger sm" data-act="${yesAct}" ${extra || ""}>${esc(yesLabel)}</button><button class="btn line sm" data-act="cancel" data-z="${zoneId}">Отказ</button></div>`;
  z.querySelector("[data-act='cancel']").focus();
}
const ACT = {
  home: () => home(),
  start: (b) => startModule(b.dataset.m),
  mock: () => startMock(),
  mist: () => startMistakes(),
  mistThese: () => startMistakes(lastWrong),
  histToggle: () => { histAll = !histAll; home("book"); },
  pick: (b) => {
    if (!sess) return;
    sess.ans[sess.i] = +b.dataset.v;
    app.querySelectorAll(".opt").forEach((o) => { const on = o === b; o.classList.toggle("sel", on); o.setAttribute("aria-checked", on); });
    const c = document.getElementById("checkBtn");
    if (c) c.disabled = false;
    if (sess.kind === "mock") updateNav();
  },
  mv: (b) => {
    const a = sess.ans[sess.i], k = +b.dataset.k, d = +b.dataset.d, j = k + d;
    if (j < 0 || j >= a.length) return;
    [a[k], a[j]] = [a[j], a[k]];
    sess.touchedIdx = sess.touchedIdx || {};
    sess.touchedIdx[sess.i] = true;
    renderQ();
    app.querySelector(`.ord li:nth-child(${j + 1}) [data-d="${d}"]`)?.focus({ preventScroll: true }) || app.querySelector(`.ord li:nth-child(${j + 1}) button:not(:disabled)`)?.focus({ preventScroll: true });
  },
  check: () => check(),
  next: () => { if (sess.i < sess.qs.length - 1) { sess.i++; renderQ(); } else finish(false); },
  prev: () => { if (sess.i > 0) { sess.i--; renderQ(); } },
  mnext: () => { if (sess.i < sess.qs.length - 1) { sess.i++; renderQ(); } },
  go: (b) => { sess.i = +b.dataset.i; renderQ(); },
  submitAsk: () => {
    const left = sess.qs.filter((q, i) => !answered(q, sess.ans[i]) || (q.t === "order" && !sess.touchedIdx?.[i])).length;
    confirmBox("submitZone", left ? `Има ${left} ${pl(left, "задача", "задачи")} без отговор. Да предам ли матурата?` : "Да предам ли матурата? След това отговорите не могат да се променят.", "submit", "Предай");
  },
  submit: () => finish(false),
  quitAsk: () => {
    if (!sess) return home();
    const started = sess.kind === "mock" ? sess.ans.some((x, i) => answered(sess.qs[i], x) && sess.qs[i].t !== "order") : sess.touched;
    if (!started) return home();
    confirmBox("quitZone", sess.kind === "mist" ? "Да прекъсна ли упражнението?" : "Да прекъсна ли? Този опит няма да се запише в бележника.", "home", "Прекъсни");
  },
  restartAsk: () => {
    if (!sess.touched) return restart();
    confirmBox("quitZone", "Да започна ли отначало? Този опит няма да се запише.", "restart", "Започни отначало");
  },
  restart: () => restart(),
  copy: async (b) => {
    const pre = document.getElementById(`pv-${b.dataset.id}`), out = document.getElementById(`cp-${b.dataset.id}`);
    let ok = false;
    try { await navigator.clipboard.writeText(pre.textContent); ok = true; } catch (e) {}
    if (!ok) {
      try { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); ok = document.execCommand("copy"); } catch (e) {}
    }
    out.textContent = ok ? "Копирано – постави го в съобщение до родителя." : "Текстът е маркиран – копирай го ръчно.";
  },
  cancel: (b) => { const z = document.getElementById(b.dataset.z); if (z) { z.innerHTML = z.id === "resetZone" ? `<button class="btn line danger sm" data-act="resetAllAsk">Нулирай целия прогрес</button>` : z.id === "submitZone" && sess && sess.i < sess.qs.length - 1 ? `<button class="link" data-act="submitAsk">Предай матурата сега</button>` : ""; if (z.classList.contains("zone")) z.hidden = true; } },
  resetModAsk: (b) => confirmBox(`zone-${b.dataset.m}`, `Да изтрия ли всички оценки по „${MOD[b.dataset.m].title}“ и грешките от този модул?`, "resetMod", "Изтрий", `data-m="${b.dataset.m}"`),
  resetMod: (b) => {
    const m = b.dataset.m;
    S.hist = S.hist.filter((h) => h.m !== m);
    S.resets = { ...(S.resets || {}), [m]: Date.now() };
    for (const id of Object.keys(S.mist)) if (!Q[id] || Q[id].m === m) delete S.mist[id];
    save();
    home(`mod-${m}`);
  },
  resetAllAsk: () => confirmBox("resetZone", "Всички оценки, дати и грешки ще бъдат изтрити. Това не може да се върне.", "resetAll", "Да, изтрий всичко"),
  resetAll: () => { const name = S.name; S = blank(); S.name = name; S.resetAt = Date.now(); save(); histAll = false; home(); },
};
function restart() {
  if (!sess) return home();
  if (sess.kind === "module") startModule(sess.m);
  else if (sess.kind === "mock") startMock();
  else startMistakes();
}
app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled || !app.contains(b)) return;
  const f = ACT[b.dataset.act];
  if (f) f(b, e);
  else if (Game.act(b, e)) return;
  else if (ONLINE) Online.act(b, e);
});
app.addEventListener("input", (e) => {
  if (e.target.id === "pupil") { S.name = e.target.value.slice(0, 40); save(); }
});
document.addEventListener("keydown", (e) => {
  if (!sess || e.target.closest("input,select,textarea")) return;
  if (e.key === "Enter") {
    const b = document.getElementById("checkBtn") || document.getElementById("nextBtn");
    if (b && !b.disabled && document.activeElement !== b) { e.preventDefault(); b.click(); }
  }
});

let rz = 0;
addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (!sess && document.getElementById("chart")) drawChart(); }, 150); });
/* ---------- on the site: personal code, up to N devices, grades synced with the code ---------- */
const Online = (() => {
  const K_CODE = "edubel-trener-code", K_DEV = "edubel-trener-device", K_BANK = "edubel-trener-bank";
  const K_STATE = "edubel-trener-state:", K_DIRTY = "edubel-trener-dirty:", K_RENEW = "edubel-trener-renew";
  // Browsers built into apps keep their own storage and may forget it: every visit could take a new device place.
  const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Viber|Line\/|MicroMessenger|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|Pinterest/i;
  let code = "", device = "", devices = [], maxDevices = 3, idleDays = 60, expiresAt = null, timer = 0, busy = false, stay = false;
  const o = { offline: false, flash: "" };
  let onExpired = false;

  const norm = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fmt = (c) => { c = norm(c); return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c; };
  const link = () => `${location.origin}/t/?k=${fmt(code)}`;

  async function call(path, data, keepalive) {
    let res;
    try {
      res = await fetch(`/api/trener/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data), keepalive: !!keepalive });
    } catch (e) {
      const err = new Error("Няма връзка с интернет.");
      err.status = 0;
      throw err;
    }
    let j = {};
    try { j = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error(j.message || "Нещо се обърка. Опитай пак след малко.");
      err.status = res.status; err.code = j.error; err.data = j;
      throw err;
    }
    return j;
  }

  // "iPhone · Safari": enough for the family to recognise its devices in the list.
  function label() {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad"
      : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android телефон" : "Android таблет") : /Windows/.test(ua) ? "Компютър с Windows"
      : /Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Компютър с Linux" : "Устройство";
    const br = /Viber/.test(ua) ? "Viber" : /FBAN|FBAV|FB_IAB|FBIOS/.test(ua) ? "Facebook" : /Instagram/.test(ua) ? "Instagram"
      : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera"
      : /Firefox|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "браузър";
    return `${os} · ${br}`;
  }
  function deviceKey() {
    let d = ls.get(K_DEV);
    if (d && /^[a-f0-9]{32,128}$/.test(d)) return d;
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    d = [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
    if (!ls.set(K_DEV, d) || ls.get(K_DEV) !== d) return "";
    return d;
  }
  function readJSON(k) { try { return JSON.parse(ls.get(k) || "null"); } catch (e) { return null; } }
  const readBank = () => { const b = readJSON(K_BANK); return b && b.id && b.data && Array.isArray(b.data.questions) ? b : null; };
  const readState = () => { const s = readJSON(K_STATE + code); return s ? normState(s) : null; };
  function saveLocal() { if (code) canSave = ls.set(K_STATE + code, JSON.stringify(S)); }

  /* screens before the trainer opens */
  function screen(html) {
    stopTimer();
    sess = null;
    app.innerHTML = `<header class="hd"><div class="brand"><img src="${LOGO}" alt="Еду БЕЛ" width="60" height="60"><span class="eyebrow">НВО по БЕЛ · 7. клас</span></div></header><section class="gate">${html}</section>`;
    window.scrollTo(0, 0);
  }
  const btns = (list) => `<div class="row">${list.map(([act, text], i) => `<button class="${i ? "link" : "btn"}" data-act="${act}">${esc(text)}</button>`).join("")}</div>`;
  const message = (title, text, list) => screen(`<h1>${esc(title)}</h1><p class="lead">${esc(text)}</p>${list ? btns(list) : ""}`);
  function codeScreen(err) {
    screen(`<h1>НВО тренажор <em>по БЕЛ</em></h1>
      <p class="lead">Сканирай QR кода с камерата на телефона или въведи кода от PDF-а или от стикера на кутията.</p>
      <form id="codeForm" class="codeform" novalidate><label for="codeIn">Код за достъп</label>
        <div class="row"><input id="codeIn" class="field code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" maxlength="14">
        <button class="btn gold">Отвори</button></div></form>
      ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
      <p class="small muted">Кодът е от 10 букви и цифри. Не е нужно да пишеш тирето и главните букви.</p>`);
    const f = document.getElementById("codeForm"), inp = document.getElementById("codeIn");
    inp.focus();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const c = norm(inp.value);
      if (c.length < 8) return codeScreen("Провери кода – той е от 10 букви и цифри.");
      code = c;
      ls.set(K_CODE, c);
      start();
    });
  }
  function inAppScreen(url) {
    screen(`<h1>Отвори тренажора в Chrome или Safari</h1>
      <p class="lead">Линкът е отворен вътре в приложение (Viber, Facebook, Instagram…). Там оценките не се пазят сигурно, а всяко отваряне може да заеме ново място от устройствата на кода.</p>
      <ol class="steps"><li>Натисни <b>⋮</b> или <b>···</b> горе вдясно.</li><li>Избери „Отвори в браузър“ (Open in browser, Open in Safari или Open in Chrome).</li></ol>
      <p>Или копирай линка и го постави в Chrome или Safari:</p>
      <div class="linkbox"><pre class="preview" id="pv-link">${esc(url)}</pre><button class="btn sm" data-act="copyLink">Копирай линка</button></div>
      <p class="small muted" id="cp-link" role="status"></p>
      <div><button class="link" data-act="stayInApp">Продължи тук въпреки това</button></div>`);
  }
  function fullScreen(d) {
    maxDevices = d.maxDevices || maxDevices;
    idleDays = d.idleDays || idleDays;
    screen(`<h1>Този код вече е отворен на ${maxDevices} устройства</h1>
      <p class="lead">Кодът работи на до ${maxDevices} устройства – телефон, таблет или компютър. Записани са:</p>
      <ul class="devlist">${(d.devices || []).map((x) => `<li><span><b>${esc(x.label)}</b><small>отворено за последно на ${fmtDate(x.lastSeen)}</small></span></li>`).join("")}</ul>
      <h3>Как да освободиш място</h3>
      <ol class="steps"><li>Отвори тренажора на едно от тези устройства.</li><li>Най-долу, в „Твоят достъп“, натисни „Премахни“ до устройството, което вече не ползваш.</li><li>Върни се тук и натисни „Опитай пак“.</li></ol>
      <p class="small muted">Устройство, което не е ползвано ${idleDays} дни, освобождава мястото си само. Ако не можеш да освободиш място, свържи се с Еду БЕЛ и ще го направим ние.</p>
      ${btns([["retryOpen", "Опитай пак"], ["otherCode", "Въведи друг код"]])}`);
  }

  const renewForm = (err) => `<form id="renewForm" class="codeform" novalidate><label for="renewIn">Код за удължаване</label>
      <div class="row"><input id="renewIn" class="field code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" maxlength="14">
      <button class="btn gold">Удължи</button></div><p class="${err ? "err" : "small muted"}" id="renewMsg" role="status">${esc(err || "")}</p></form>`;

  // The access ended: the grades stay, and a renewal code continues with the same gradebook.
  // No offer to the child here – the screen is meant to be shown to a parent.
  function expiredScreen(text, err) {
    onExpired = true;
    const local = readState();
    const n = local ? local.hist.length : 0;
    const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
    screen(`<h1>Достъпът до тренажора изтече</h1><p class="lead">${esc(sentence)}</p>
      ${n ? `<p>В бележника на това устройство има ${n} ${n === 1 ? "оценка" : "оценки"} – те остават.</p>` : ""}
      <p><b>Покажи този екран на родител.</b> С код за удължаване тренажорът продължава със същия бележник и оценки.</p>
      ${renewForm(err)}
      <div><button class="link" data-act="otherCode">Въведи друг код</button></div>`);
  }

  async function doRenew(rc) {
    const msgEl = document.getElementById("renewMsg");
    if (msgEl) { msgEl.className = "small muted"; msgEl.textContent = "Удължавам…"; }
    try {
      const r = await call("renew", { code, device, renew: rc });
      ls.del(K_RENEW);
      expiresAt = r.expiresAt;
      o.flash = `Достъпът е удължен с ${r.months} ${r.months === 1 ? "месец" : "месеца"} – до ${fmtDate(r.expiresAt)}`;
      if (onExpired) { onExpired = false; return open(); }
      home();
    } catch (e) {
      ls.del(K_RENEW);
      const text = e.status === 0 ? "Няма връзка с интернет. Опитай пак." : e.code === "device_removed" ? "Въведи кода за удължаване на устройство, на което тренажорът вече е отварян." : e.message;
      if (onExpired) return expiredScreen(lastExpired, text);
      if (sess) return;
      home("access");
      const m = document.getElementById("renewMsg");
      if (m) { m.className = "err"; m.textContent = text; }
    }
  }
  let lastExpired = "";

  async function open() {
    screen(`<p class="lead">Отварям тренажора…</p>`);
    const cached = readBank(), local = readState();
    const dirty = !!ls.get(K_DIRTY + code);
    try {
      const r = await call("open", { code, device, label: label(), have: cached ? cached.id : 0, state: dirty && local ? local : undefined });
      o.offline = false;
      const bank = r.bank ? { id: r.bankId, data: r.bank } : cached;
      if (r.bank && !ls.set(K_BANK, JSON.stringify(bank))) ls.del(K_BANK);
      code = norm(r.code);
      devices = r.devices || [];
      maxDevices = r.maxDevices;
      idleDays = r.idleDays;
      expiresAt = r.expiresAt || null;
      setBank(bank.data);
      S = normState(r.state);
      saveLocal();
      ls.del(K_DIRTY + code);
      onExpired = false;
      const pending = ls.get(K_RENEW);
      if (pending && expiresAt) return doRenew(pending);
      if (pending) ls.del(K_RENEW);
      home();
    } catch (e) {
      if (e.status === 0) {
        if (cached && local) { o.offline = true; setBank(cached.data); S = local; home(); schedule(); return; }
        return message("Няма връзка с интернет", "Свържи се с интернет и опитай пак. Първото отваряне на тренажора става с връзка.", [["retryOpen", "Опитай пак"]]);
      }
      if (e.code === "devices_full") return fullScreen(e.data);
      if (e.status === 404 || e.code === "code") { ls.del(K_CODE); code = ""; return codeScreen(e.message); }
      if (e.code === "disabled") return message("Този код е спрян", "Свържи се с Еду БЕЛ, за да го пуснем отново.", [["otherCode", "Въведи друг код"]]);
      if (e.code === "expired") {
        lastExpired = e.message;
        const pending = ls.get(K_RENEW);
        if (pending) { onExpired = true; expiredScreen(e.message); return doRenew(pending); }
        return expiredScreen(e.message);
      }
      if (e.code === "renew_code") {
        ls.set(K_RENEW, code);
        ls.del(K_CODE);
        code = "";
        return codeScreen("Това е код за удължаване. Въведи първо своя код за достъп (от PDF-а или стикера) – удължаването ще се добави след това.");
      }
      return message("Нещо се обърка", e.message, [["retryOpen", "Опитай пак"]]);
    }
  }

  function start() {
    device = deviceKey();
    if (!device) {
      return message("Отвори тренажора в обикновен прозорец", "Този прозорец не пази данни (например режим „инкогнито“ или частен прозорец). Отвори линка в обикновен прозорец на Chrome или Safari.", [["retryOpen", "Опитай пак"]]);
    }
    open();
  }

  /* saving: a copy here at once, the server a few seconds later */
  function changed() {
    saveLocal();
    if (code) ls.set(K_DIRTY + code, "1");
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), o.offline ? 30000 : 4000);
  }
  async function syncNow(keepalive) {
    clearTimeout(timer);
    if (!code || !device || busy || !ls.get(K_DIRTY + code)) return;
    busy = true;
    const sentAt = S.at;
    try {
      const r = await call("save", { code, device, state: S }, keepalive);
      const wasOffline = o.offline;
      o.offline = false;
      if (S.at === sentAt) {
        S = normState(r.state);
        saveLocal();
        ls.del(K_DIRTY + code);
      } else schedule();
      if (wasOffline && !sess) home();
    } catch (e) {
      if (e.status === 0) { o.offline = true; schedule(); }
      else if (e.code === "device_removed") message("Това устройство беше премахнато от кода", "Някой от семейството е освободил мястото му. Натисни „Отвори отново“ – ако има свободно място, устройството ще се запише пак и оценките ще се заредят.", [["retryOpen", "Отвори отново"]]);
      else if (e.code === "disabled") message("Този код е спрян", "Свържи се с Еду БЕЛ, за да го пуснем отново.", []);
      else if (e.code === "expired") { lastExpired = e.message; expiredScreen(e.message); }
      else schedule();
    } finally {
      busy = false;
    }
  }
  addEventListener("online", () => syncNow());
  app.addEventListener("submit", (e) => {
    if (e.target.id !== "renewForm") return;
    e.preventDefault();
    const v = norm(document.getElementById("renewIn").value);
    const m = document.getElementById("renewMsg");
    if (v.length < 8) { m.className = "err"; m.textContent = "Провери кода – той е от 10 букви и цифри."; return; }
    doRenew(v);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") syncNow(true); });

  function accessSection() {
    return `<section class="access" id="access"><h3>Твоят достъп</h3>
      <p class="small muted">Код <b class="num">${esc(fmt(code))}</b>.${expiresAt ? ` Достъпът е до <b>${fmtDate(expiresAt)}</b>` : ""} Работи на до ${maxDevices} устройства. Устройство, което не е ползвано ${idleDays} дни, освобождава мястото си само.</p>
      <ul class="devlist">${devices.map((d) => `<li><span><b>${esc(d.label)}</b>${d.me ? ` <i class="me">това устройство</i>` : ""}<small>отворено за последно на ${fmtDate(d.lastSeen)}</small></span>
        ${d.me ? "" : `<button class="link" data-act="devForgetAsk" data-id="${esc(d.id)}">Премахни</button>`}<div class="zone" id="dz-${esc(d.id)}" hidden></div></li>`).join("")}</ul>
      ${expiresAt ? `<div class="renewbox"><p class="small muted">Имаш код за удължаване? Въведи го тук – достъпът се удължава, а бележникът и оценките остават.</p>${renewForm("")}</div>` : ""}
      <div class="linkbox"><pre class="preview" id="pv-link">${esc(link())}</pre><button class="btn line sm" data-act="copyLink">Копирай линка</button></div>
      <p class="small muted" id="cp-link" role="status">С този линк отваряш тренажора на друго устройство с всички оценки.</p></section>`;
  }

  const ACTS = {
    copyLink: async () => {
      const pre = document.getElementById("pv-link"), out = document.getElementById("cp-link");
      let ok = false;
      try { await navigator.clipboard.writeText(pre.textContent); ok = true; } catch (e) {}
      if (!ok) { try { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand("copy"); } catch (e) {} }
      if (out) out.textContent = ok ? "Линкът е копиран." : "Линкът е маркиран – копирай го ръчно.";
    },
    stayInApp: () => { stay = true; try { sessionStorage.setItem("edubel-trener-stay", "1"); } catch (e) {} boot(); },
    retryOpen: () => { if (!code) return codeScreen(); start(); },
    otherCode: () => { ls.del(K_CODE); code = ""; codeScreen(); },
    devForgetAsk: (b) => confirmBox(`dz-${b.dataset.id}`, "Да премахна ли това устройство? На него тренажорът ще поиска кода отново.", "devForget", "Премахни", `data-id="${esc(b.dataset.id)}"`),
    devForget: async (b) => {
      try {
        const r = await call("forget", { code, device, target: b.dataset.id });
        devices = r.devices;
        home("access");
      } catch (e) {
        const z = document.getElementById(`dz-${b.dataset.id}`);
        if (z) z.innerHTML = `<p class="err" role="alert">${esc(e.message)}</p>`;
      }
    },
  };

  function boot() {
    const url = new URL(location.href);
    const fromUrl = norm(url.searchParams.get("k") || location.hash.slice(1));
    if (fromUrl.length >= 8) ls.set(K_CODE, fromUrl);
    const renew = norm(url.searchParams.get("r"));
    if (renew.length >= 8) ls.set(K_RENEW, renew);
    try { stay = stay || sessionStorage.getItem("edubel-trener-stay") === "1"; } catch (e) {}
    if (IN_APP.test(navigator.userAgent) && !stay) return inAppScreen(fromUrl ? `${location.origin}/t/?k=${fmt(fromUrl)}` : `${location.origin}/t/`);
    if (url.searchParams.has("k") || url.searchParams.has("r") || location.hash) history.replaceState(null, "", "/t/");
    code = norm(ls.get(K_CODE)) || fromUrl;
    if (code.length < 8) return codeScreen(ls.get(K_RENEW) ? "Въведи първо своя код за достъп (от PDF-а или стикера) – удължаването ще се добави след това." : "");
    start();
  }

  return Object.assign(o, {
    boot, changed, accessSection,
    syncNow: () => syncNow(),
    act: (b, e) => { const f = ACTS[b.dataset.act]; if (f) f(b, e); },
  });
})();

/* ---------- the game „Литературни досиета“ (bank.dossiers) ---------- */
// Each dossier: 1 find the three ★ words in the grid (tap the first and the last letter), 2 answer the clues with them,
// 3 five questions whose letters give the dossier's code; one letter of the code goes to the secret message.
// 4 and 5 are bonuses. Progress is kept in S.dos, so it syncs like the grades.
const Game = (() => {
  const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1]];
  let view = null; // {kind: "home"|"dossier"|"review"|"final", id}
  let sel = null; // first tapped cell [r, c] in the grid
  const D = () => BANK.dossiers;
  const st = (id) => {
    S.dos = S.dos || {};
    S.dos[id] = S.dos[id] || {};
    return S.dos[id];
  };
  const dossier = (id) => D().dossiers.find((x) => x.id === id);
  const solved = (id) => !!(S.dos && S.dos[id] && S.dos[id].done);
  const solvedCount = () => D().dossiers.filter((d) => solved(d.id)).length;
  function rank() {
    const n = solvedCount(), all = D().dossiers.length;
    if (n >= all && solved("final")) return { t: "Главен инспектор", next: "" };
    if (n >= 12) return { t: "Инспектор", next: `още ${all - n} ${all - n === 1 ? "досие" : "досиета"} и финалът до „Главен инспектор“` };
    if (n >= 5) return { t: "Детектив", next: `още ${12 - n} до „Инспектор“` };
    return { t: "Стажант", next: `още ${5 - n} до „Детектив“` };
  }
  // Letter for message field N, if the dossier that gives it is solved.
  function letters() {
    const out = {};
    for (const d of D().dossiers) if (solved(d.id)) out[d.field] = d.code[d.take - 1];
    const f = D().final;
    if (f && solved("final")) out[f.field] = f.code[f.take - 1];
    return out;
  }
  function board() {
    const L = letters(), m = D().message;
    return `<div class="dmsg" aria-label="Тайното послание">${m.groups.map((g) => `<span class="dword">${g.map((n) => `<span class="dbox ${L[n] ? "on" : ""}"><i>${n}</i><b>${L[n] || ""}</b></span>`).join("")}</span>`).join("")}</div>`;
  }

  function card() {
    if (!BANK.dossiers) return "";
    const n = solvedCount(), all = D().dossiers.length, r = rank();
    return `<section class="game" aria-labelledby="gameT"><div class="game-in">
      <span class="eyebrow">Игра · ${all} досиета · 1 таен код</span>
      <h2 id="gameT">Литературни досиета</h2>
      <p>Разследвай творбите като детектив: намери думите, събери уликите и разбий кода. Всяко разкрито досие дава буква от тайното послание.</p>
      <div class="game-row"><span class="rank">${esc(r.t)}</span><span class="small">Разкрити: <b>${n} от ${all}</b></span></div>
      <button class="btn gold" data-act="gameHome">${n ? "Продължи разследването" : "Започни разследването"}</button></div></section>`;
  }

  function top(back, title) {
    return `<div class="qbar"><button class="back" data-act="${back}">← ${back === "home" ? "Табло" : "Досиетата"}</button><span class="qtitle">${esc(title)}</span><span></span></div>`;
  }

  function home() {
    view = { kind: "home" };
    stopTimer();
    sess = null;
    const r = rank(), all = D().dossiers.length, n = solvedCount();
    let h = top("home", "Литературни досиета");
    h += `<section class="dhero"><h1>Литературни <em>досиета</em></h1>
      <p class="lead">${all} досиета. Един таен код. Разследването започва с теб.</p>
      <div class="game-row"><span class="rank">${esc(r.t)}</span><span class="small">Разкрити: <b>${n} от ${all}</b>${r.next ? ` · ${esc(r.next)}` : ""}</span></div></section>
      <section class="dpanel"><h3>Тайното послание</h3><p class="small muted">Всяко разкрито досие попълва едно поле. Последната буква е във финала.</p>${board()}</section>
      <details class="dpanel how"><summary>Как се играе</summary><ol>
        <li><b>Следата.</b> Намери трите думи със звездичка: докосни първата им буква (тя е отбелязана), после последната. Думите вървят → ↓ ↘ ↗.</li>
        <li><b>Уликите.</b> Отговори на трите въпроса с тези думи.</li>
        <li><b>Разпитът.</b> Избери верните отговори – буквите им дават кода на досието и буква за тайното послание.</li>
        <li><b>Бонуси.</b> Задачи 4 и 5 са по желание. Можеш да гледаш в текста и да поправяш – няма таймер и наказания.</li></ol></details>
      <section class="dlist" aria-label="Досиетата">`;
    for (const d of D().dossiers) {
      const s = (S.dos || {})[d.id] || {};
      const stars = (s.b4 ? "★" : "") + (s.b5 ? "★" : "");
      h += `<button class="dcase ${solved(d.id) ? "done" : ""}" data-act="gameOpen" data-id="${d.id}"><span class="dno">${String(d.no).padStart(2, "0")}</span>
        <span class="dt"><b>${esc(d.work)}</b><small>${esc(d.author)}</small></span>
        <span class="dst">${solved(d.id) ? `<i class="stamp-s">Разкрито</i>` : s.t1 || s.t3 ? "започнато" : ""}${stars ? `<em>${stars}</em>` : ""}</span></button>`;
    }
    h += `</section>`;
    for (const rv of D().reviews || []) {
      const s = (S.dos || {})[rv.id] || {};
      h += `<button class="dcase extra ${s.done ? "done" : ""}" data-act="gameOpen" data-id="${rv.id}"><span class="dno">★</span><span class="dt"><b>${esc(rv.title)}</b><small>по желание · не носи буква</small></span><span class="dst">${s.done ? `<i class="stamp-s">Готово</i>` : ""}</span></button>`;
    }
    if (D().final) h += `<button class="dcase final ${solved("final") ? "done" : ""}" data-act="gameOpen" data-id="final"><span class="dno">25</span><span class="dt"><b>${esc(D().final.title || "Финал")}</b><small>последната буква и посланието</small></span><span class="dst">${solved("final") ? `<i class="stamp-s">Разкрито</i>` : ""}</span></button>`;
    h += `<div class="row"><button class="link" data-act="gameResetAsk">Започни играта отначало</button></div><div id="gameZone"></div>`;
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }

  /* ----- one dossier ----- */
  const found = (d) => new Set(st(d.id).t1 || []);
  function gridHtml(d) {
    const f = found(d), on = new Map();
    d.words.forEach((w, wi) => { if (f.has(w.w)) w.cells.forEach(([r, c]) => on.set(`${r},${c}`, (wi % 5) + 1)); });
    const marks = new Set(d.words.filter((w) => w.star).map((w) => `${w.cells[0][0]},${w.cells[0][1]}`));
    let h = `<div class="dgrid" role="grid" aria-label="Решетка 10 на 10">`;
    d.grid.forEach((row, r) => [...row].forEach((ch, c) => {
      const k = `${r},${c}`;
      h += `<button class="dcell ${on.has(k) ? `f f${on.get(k)}` : ""} ${marks.has(k) ? "mk" : ""} ${sel && sel[0] === r && sel[1] === c ? "sel" : ""}" data-act="gameCell" data-r="${r}" data-c="${c}" aria-label="ред ${r + 1}, колона ${c + 1}: ${ch}">${ch}</button>`;
    }));
    return h + `</div>`;
  }
  function trailHtml(d) {
    if (!d.trail) return "";
    const f = found(d);
    if (!d.words.every((w) => f.has(w.w))) return `<p class="small muted">Бонус: намери и останалите думи – неоградените букви, прочетени ред по ред, дават скрита следа.</p>`;
    return `<p class="okbox">Скритата следа: <b>${esc(d.trail)}</b></p>`;
  }
  function task1(d) {
    const f = found(d), stars = d.words.filter((w) => w.star), ok = stars.every((w) => f.has(w.w));
    return `<section class="dtask" id="t1"><h3><span class="tn">1</span> Открий трите думи със звездичка ${ok ? `<i class="tick">✓</i>` : ""}</h3>
      <p class="small muted">Докосни отбелязаната първа буква, после последната буква на думата. Думите вървят → ↓ ↘ ↗.</p>
      ${gridHtml(d)}<p class="dhint" id="gridMsg" role="status">${sel ? "Сега докосни последната буква на думата." : ""}</p>
      <ul class="dwords">${d.words.map((w) => `<li class="${w.star ? "star" : ""} ${f.has(w.w) ? "got" : ""}">${w.star ? "★ " : ""}${esc(w.w)}</li>`).join("")}</ul>
      ${ok ? "" : `<button class="link" data-act="gameHint">Подсказка</button>`}${trailHtml(d)}</section>`;
  }
  function task2(d) {
    const s = st(d.id), a = s.t2 || {}, starWords = d.words.filter((w) => w.star).map((w) => w.w);
    const ok = d.clues.every((c, i) => a[i] === c.a);
    return `<section class="dtask" id="t2"><h3><span class="tn">2</span> Събери уликите ${ok ? `<i class="tick">✓</i>` : ""}</h3>
      <p class="small muted">Отговори с трите думи със звездичка. Всяка се използва веднъж.</p>
      <ol class="dclues">${d.clues.map((c, i) => `<li><p>${esc(c.q)}</p><div class="chips">${starWords.map((w) => {
        const picked = a[i] === w, right = picked && w === c.a, wrong = picked && w !== c.a;
        return `<button class="chip ${right ? "right" : wrong ? "wrong" : ""}" data-act="gameClue" data-i="${i}" data-w="${esc(w)}" ${a[i] === c.a ? "disabled" : ""}>${esc(w)}</button>`;
      }).join("")}</div></li>`).join("")}</ol></section>`;
  }
  function codeBoxes(code, take, letters_, marked) {
    return `<div class="dcode">${[0, 1, 2, 3, 4].map((i) => `<span class="dbox ${i === take - 1 ? "take" : ""} ${letters_[i] ? "on" : ""}"><i>${i + 1}</i><b>${letters_[i] || ""}</b></span>`).join("")}</div>`;
  }
  function quizHtml(id, quiz, code, take, field) {
    const s = st(id), a = s.t3 || [], checked = !!s.t3c;
    const lettersNow = quiz.map((q, i) => (a[i] != null ? q.o[a[i]].k : ""));
    const done = solved(id);
    let h = `<ol class="dquiz">${quiz.map((q, i) => `<li><p>${esc(q.q)}</p><div class="opts">${q.o.map((o, k) => {
      const picked = a[i] === k;
      const cls = picked ? (checked || done ? (k === q.a ? "right" : "wrong") : "sel") : "";
      return `<button class="opt ${cls}" data-act="gameAns" data-id="${id}" data-i="${i}" data-k="${k}" ${done ? "disabled" : ""}><span class="key">${esc(o.k)}</span><span>${esc(o.t)}</span></button>`;
    }).join("")}</div></li>`).join("")}</ol>
      <p class="small muted">Кодът на досието (буквите на верните отговори от 1 до 5):</p>${codeBoxes(code, take, lettersNow)}`;
    if (done) h += `<p class="okbox">Кодът е <b>${esc(code)}</b>. Буквата „${esc(code[take - 1])}“ отиде в поле ${field} на тайното послание.</p>`;
    else if (checked) h += `<p class="warnbox">Не се получава дума. Провери отговорите в червено – можеш да гледаш в текста.</p>`;
    if (!done) h += `<button class="btn" data-act="gameCheck" data-id="${id}" ${a.filter((x) => x != null).length === 5 ? "" : "disabled"}>Провери кода</button>`;
    return h;
  }
  function task3(d) {
    return `<section class="dtask" id="t3"><h3><span class="tn">3</span> Избери верния отговор ${solved(d.id) ? `<i class="tick">✓</i>` : ""}</h3>
      ${quizHtml(d.id, d.quiz, d.code, d.take, d.field)}</section>`;
  }

  // Bonus 4: order the events, split into two groups, complete a quote, or who says it.
  function bonus4(d) {
    const b = d.bonus4;
    if (!b) return "";
    const s = st(d.id), a = s.b4a || {}, ok = !!s.b4, checked = !!s.b4c;
    let body = "";
    // The paper prompts say "write 1–5 in the boxes"; on a screen the moves are different.
    const prompt = b.type === "order" ? "Подреди събитията от първото до последното със стрелките ↑ ↓."
      : b.type === "groups" ? "Към коя група е всяка дума? Докосни групата до нея." : b.prompt || "";
    if (b.type === "order") {
      // Start from the mixed order printed on paper (the same for every child), or a random one.
      const printed = (b.printed || []).map((t) => b.items.indexOf(t));
      const ord = s.b4o || (printed.length === b.items.length && !printed.includes(-1) ? printed : shuffle(b.items.map((_, i) => i)));
      if (!s.b4o) s.b4o = ord;
      body = `<ol class="ord">${ord.map((k, pos) => `<li class="${checked || ok ? (k === pos ? "right" : "wrong") : ""}"><span>${esc(b.items[k])}</span><span class="mv">${ok ? "" : `<button data-act="gameMove" data-id="${d.id}" data-k="${pos}" data-d="-1" ${pos === 0 ? "disabled" : ""} aria-label="Нагоре">↑</button><button data-act="gameMove" data-id="${d.id}" data-k="${pos}" data-d="1" ${pos === ord.length - 1 ? "disabled" : ""} aria-label="Надолу">↓</button>`}</span></li>`).join("")}</ol>`;
    } else if (b.type === "groups") {
      const all = b.groups.flatMap((g, gi) => g.items.map((w) => ({ w, gi })));
      const order = s.b4w || shuffle(all.map((x) => x.w));
      if (!s.b4w) s.b4w = order;
      body = `<div class="dgroups">${order.map((w) => {
        const right = all.find((x) => x.w === w).gi, pick = a[w];
        return `<div class="dgw ${checked || ok ? (pick === right ? "right" : "wrong") : ""}"><span>${esc(w)}</span><span class="seg">${b.groups.map((g, gi) => `<button class="${pick === gi ? "on" : ""}" data-act="gamePick" data-id="${d.id}" data-key="${esc(w)}" data-v="${gi}" ${ok ? "disabled" : ""}>${esc(g.title)}</button>`).join("")}</span></div>`;
      }).join("")}</div>`;
    } else if (b.type === "fill" || b.type === "who") {
      const choices = b.type === "fill" ? b.bank : b.names;
      body = `<div class="dfill">${b.lines.map((l, i) => {
        const pick = a[i], st_ = checked || ok ? (pick === l.a ? "right" : "wrong") : "";
        const sel_ = `<select data-act-change="gameSel" data-id="${d.id}" data-key="${i}" ${ok ? "disabled" : ""} aria-label="Избери"><option value="">…</option>${choices.map((c) => `<option ${pick === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
        return b.type === "fill"
          ? `<p class="dline ${st_}">${esc(l.before || "")} ${sel_} ${esc(l.after || "")}</p>`
          : `<div class="dline who ${st_}"><q>${esc(l.q)}</q>${sel_}</div>`;
      }).join("")}</div>`;
    }
    return `<section class="dtask bonus" id="t4"><h3><span class="tn">4</span> Бонус: още следи ${ok ? `<i class="tick">★</i>` : ""}</h3>
      <p class="small muted">${esc(prompt)}</p>${body}
      ${ok ? `<p class="okbox">Браво – бонусът е решен!</p>` : `<button class="btn line" data-act="gameBonus" data-id="${d.id}">Провери бонуса</button>${checked ? `<p class="small muted">Поправи червените и провери пак.</p>` : ""}`}</section>`;
  }
  function bonus5(d) {
    const b = d.bonus5;
    if (!b) return "";
    const s = st(d.id);
    return `<section class="dtask bonus" id="t5"><h3><span class="tn">5</span> Бонус: една мисъл ${s.b5 ? `<i class="tick">★</i>` : ""}</h3>
      <p><b>${esc(b.q)}</b></p>
      <textarea class="field dthink" id="b5in" rows="3" aria-label="Твоят отговор">${esc(s.b5t || b.start || "")}</textarea>
      ${s.b5 && b.sample ? `<div class="fb ok"><b class="t">Един добър отговор</b><span>${esc(b.sample)}</span><span class="small muted">Сравни смисъла, не точните думи. Искаш ли още? Добави кратък цитат от творбата.</span></div>`
        : `<button class="btn line" data-act="gameThink" data-id="${d.id}">${b.sample ? "Готово – покажи примерен отговор" : "Готово"}</button>`}</section>`;
  }

  function dossierView(id) {
    const d = dossier(id);
    view = { kind: "dossier", id };
    stopTimer();
    sess = null;
    const idx = D().dossiers.indexOf(d), next = D().dossiers[idx + 1];
    let h = top("gameHome", `Досие ${String(d.no).padStart(2, "0")}`);
    h += `<section class="dhero"><span class="eyebrow">Досие ${String(d.no).padStart(2, "0")} · ${esc(d.author)}</span><h1>${esc(d.work)}</h1>
      <div class="brief"><b>Накратко за творбата</b><p>${esc(d.brief)}</p>${(d.gloss || []).map((g) => `<p class="small">${esc(g)}</p>`).join("")}</div>
      ${solved(id) ? `<p class="okbox">Досието е разкрито! Буквата „${esc(d.code[d.take - 1])}“ е в поле ${d.field} на тайното послание.</p>` : ""}</section>`;
    h += task1(d) + task2(d) + task3(d) + bonus4(d) + bonus5(d);
    h += `<div class="row">${next ? `<button class="btn gold" data-act="gameOpen" data-id="${next.id}">Следващо досие →</button>` : ""}<button class="btn line" data-act="gameHome">Всички досиета</button></div>`;
    app.innerHTML = h;
  }

  // Review rows: a letter for each clue (some clues accept a second letter), or – for "who is the author" –
  // the author of each listed work (on paper the child writes letters next to the authors; one pick per work is easier on a phone).
  function reviewRows(rv, t, ti) {
    if (t.multi) {
      const author = {};
      for (const it of t.items) for (const k of it.a) author[k] = it.q;
      const choices = t.items.map((it) => ({ v: it.q, t: it.q }));
      return rv.list.filter((x) => author[x.k]).map((x) => ({ key: `${ti}.${x.k}`, q: x.t, ok: [author[x.k]], choices }));
    }
    const choices = rv.list.map((x) => ({ v: x.k, t: `${x.k} – ${x.t}` }));
    return t.items.map((it, i) => ({ key: `${ti}.${i}`, q: it.q, ok: [it.a, ...(it.alt || [])], choices }));
  }
  const sentence = (t) => (t ? t[0] + t.slice(1).toLowerCase() : "");
  function reviewView(id) {
    const rv = D().reviews.find((x) => x.id === id), s = st(id), a = s.a || {};
    view = { kind: "review", id };
    let h = top("gameHome", rv.title);
    h += `<section class="dhero"><h1>${esc(rv.title)}</h1><p class="lead">По желание. ${esc(rv.intro || "Използвай решените досиета – този преговор не носи буква.")}</p></section>`;
    h += `<section class="dtask"><h3>Досиетата в този преговор</h3><ul class="dlistk">${rv.list.map((x) => `<li><b>${esc(x.k)}</b> ${esc(x.t)}</li>`).join("")}</ul></section>`;
    rv.tasks.forEach((t, ti) => {
      h += `<section class="dtask"><h3><span class="tn">${ti + 1}</span> ${esc(sentence(t.title) || t.prompt)}</h3>
        <p class="small muted">${t.multi ? "Избери автора на всяка творба." : "Избери досието от списъка – можеш да надникнеш в решените досиета."}</p><div class="dfill">${reviewRows(rv, t, ti).map((r) => {
        const pick = a[r.key], st_ = s.c || s.done ? (r.ok.includes(pick) ? "right" : "wrong") : "";
        return `<div class="dline who ${st_}"><q>${esc(r.q)}</q><select data-act-change="gameSel" data-id="${id}" data-key="${esc(r.key)}" ${s.done ? "disabled" : ""} aria-label="${t.multi ? "Автор" : "Досие"}"><option value="">…</option>${r.choices.map((x) => `<option value="${esc(x.v)}" ${pick === x.v ? "selected" : ""}>${esc(x.t)}</option>`).join("")}</select></div>`;
      }).join("")}</div></section>`;
    });
    h += s.done ? `<p class="okbox">Всичко е вярно. Отличен преговор!</p>` : `<div class="row"><button class="btn" data-act="gameReview" data-id="${id}">Провери</button></div>${s.c ? `<p class="small muted">Поправи червените и провери пак.</p>` : ""}`;
    if (s.done && rv.more) {
      h += `<section class="dtask bonus"><p><b>${esc(rv.more.q)}</b></p><textarea class="field dthink" data-more="${id}" rows="3" aria-label="Твоят отговор">${esc(s.moreT || rv.more.start || "")}</textarea><p class="small muted">Тук няма грешен отговор – пиши със свои думи.</p></section>`;
    }
    app.innerHTML = h;
  }

  function finalView() {
    const f = D().final;
    view = { kind: "final", id: "final" };
    const all = D().dossiers.length, n = solvedCount(), L = letters();
    let h = top("gameHome", f.title || "Финал");
    h += `<section class="dhero"><h1>${esc(f.title || "Финал")}</h1><p class="lead">Пет въпроса за последния ключ. Буквите на верните отговори дават последната буква на посланието – можеш да проверяваш в досиетата.</p></section>`;
    h += `<section class="dtask">${quizHtml("final", f.quiz, f.code, f.take, f.field)}</section>`;
    const full = Object.keys(L).length === D().message.fields;
    h += `<section class="dpanel"><h3>Тайното послание</h3>${board()}
      ${full ? `<p class="okbox">Посланието е разкрито: <b>${esc(D().message.text)}</b></p>` : `<p class="small muted">Разкрити досиета: ${n} от ${all}. Празните полета се попълват, когато разкриеш досието им.</p>`}</section>`;
    if (full) {
      for (const [i, q] of (f.after || []).entries()) {
        const s = st("final"), shown = (s.after || {})[i];
        h += `<section class="dtask bonus"><p><b>${esc(q.q)}</b>${q.optional ? ` <span class="small muted">(по желание)</span>` : ""}</p><textarea class="field dthink" data-after="${i}" rows="3" aria-label="Твоят отговор">${esc(((s.afterT || {})[i]) || q.start || "")}</textarea>
          ${shown && q.sample ? `<div class="fb ok"><b class="t">Един добър отговор</b><span>${esc(q.sample)}</span><span class="small muted">Сравни смисъла, не точните думи.</span></div>` : q.sample ? `<button class="btn line" data-act="gameAfter" data-i="${i}">Покажи примерен отговор</button>` : `<p class="small muted">Тук няма грешен отговор – пиши със свои думи.</p>`}</section>`;
      }
      if (solved("final") && n === all) {
        h += `<section class="diploma"><span class="eyebrow">Бюро за литературни разследвания</span><h2>Диплома</h2><p>присъжда се на</p><p class="dname">${esc(S.name.trim() || "детектива")}</p>
          <p>за разкриването на ${all}-те досиета и тайното послание</p><p class="drank">Главен инспектор по литература</p><p class="small muted">${fmtDate(Date.now())}</p></section>`;
      }
    }
    app.innerHTML = h;
  }

  function show(id) {
    if (id === "final") return finalView();
    if ((D().reviews || []).some((x) => x.id === id)) return reviewView(id);
    dossierView(id);
  }
  function open(id) {
    sel = null;
    show(id);
    window.scrollTo(0, 0);
  }
  // Redraw the same screen in place (keeps the first tapped grid cell and the scroll position).
  function rerender(anchor) {
    const y = window.scrollY;
    show(view.id);
    window.scrollTo(0, y);
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: "nearest" });
  }

  // Two taps: the first and the last letter of a word, in one of the allowed directions (either order).
  function tapCell(r, c) {
    const d = dossier(view.id);
    if (!sel) { sel = [r, c]; return rerender(); }
    const [r0, c0] = sel;
    sel = null;
    if (r0 === r && c0 === c) return rerender();
    const path = (a, b) => {
      const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]);
      const len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      if ((b[0] - a[0]) !== dr * len || (b[1] - a[1]) !== dc * len) return null;
      if (!DIRS.some(([x, y]) => x === dr && y === dc)) return null;
      return Array.from({ length: len + 1 }, (_, i) => [a[0] + dr * i, a[1] + dc * i]);
    };
    const p = path([r0, c0], [r, c]) || path([r, c], [r0, c0]);
    const s = st(d.id), f = new Set(s.t1 || []);
    const hit = p && d.words.find((w) => !f.has(w.w) && w.cells.length === p.length && w.cells.every(([x, y], i) => x === p[i][0] && y === p[i][1]));
    if (hit) {
      s.t1 = [...f, hit.w];
      save();
      rerender("t1");
      const m = document.getElementById("gridMsg");
      if (m) m.textContent = `Намери „${hit.w}“!${hit.star ? "" : " (бонус дума)"}`;
    } else {
      rerender("t1");
      const m = document.getElementById("gridMsg");
      if (m) m.textContent = p ? "Тук няма дума от списъка. Опитай пак." : "Думите вървят по права линия: → ↓ ↘ ↗.";
    }
  }

  const ACT = {
    gameHome: () => home(),
    gameOpen: (b) => open(b.dataset.id),
    gameCell: (b) => tapCell(+b.dataset.r, +b.dataset.c),
    gameHint: () => {
      const d = dossier(view.id), s = st(d.id), f = new Set(s.t1 || []);
      const w = d.words.find((x) => x.star && !f.has(x.w));
      if (!w) return;
      s.t1 = [...f, w.w];
      s.hints = (s.hints || 0) + 1;
      save();
      rerender("t1");
    },
    gameClue: (b) => {
      const d = dossier(view.id), s = st(d.id);
      s.t2 = { ...(s.t2 || {}), [b.dataset.i]: b.dataset.w };
      save();
      rerender("t2");
    },
    gameAns: (b) => {
      const s = st(b.dataset.id);
      s.t3 = s.t3 || [];
      s.t3[+b.dataset.i] = +b.dataset.k;
      s.t3c = false;
      save();
      rerender("t3");
    },
    gameCheck: (b) => {
      const id = b.dataset.id, s = st(id), quiz = id === "final" ? D().final.quiz : dossier(id).quiz;
      if (quiz.every((q, i) => s.t3 && s.t3[i] === q.a)) s.done = Date.now();
      else s.t3c = true;
      save();
      if (id === "final") return rerender();
      rerender("t3");
    },
    gameMove: (b) => {
      const s = st(b.dataset.id), k = +b.dataset.k, j = k + +b.dataset.d;
      [s.b4o[k], s.b4o[j]] = [s.b4o[j], s.b4o[k]];
      s.b4c = false;
      save();
      rerender("t4");
    },
    gamePick: (b) => {
      const s = st(b.dataset.id);
      s.b4a = { ...(s.b4a || {}), [b.dataset.key]: +b.dataset.v };
      s.b4c = false;
      save();
      rerender("t4");
    },
    gameBonus: (b) => {
      const d = dossier(b.dataset.id), s = st(d.id), x = d.bonus4, a = s.b4a || {};
      let ok = false;
      if (x.type === "order") ok = (s.b4o || []).every((k, i) => k === i);
      else if (x.type === "groups") ok = x.groups.every((g, gi) => g.items.every((w) => a[w] === gi));
      else ok = x.lines.every((l, i) => a[i] === l.a);
      if (ok) s.b4 = Date.now();
      else s.b4c = true;
      save();
      rerender("t4");
    },
    gameThink: (b) => {
      const s = st(b.dataset.id);
      s.b5t = (document.getElementById("b5in")?.value || "").slice(0, 1000);
      s.b5 = Date.now();
      save();
      rerender("t5");
    },
    gameAfter: (b) => {
      const s = st("final");
      s.after = { ...(s.after || {}), [b.dataset.i]: true };
      save();
      rerender();
    },
    gameReview: (b) => {
      const id = b.dataset.id, rv = D().reviews.find((x) => x.id === id), s = st(id), a = s.a || {};
      const ok = rv.tasks.every((t, ti) => reviewRows(rv, t, ti).every((r) => r.ok.includes(a[r.key])));
      if (ok) s.done = Date.now();
      else s.c = true;
      save();
      rerender();
    },
    gameResetAsk: () => confirmBox("gameZone", "Да изтрия ли напредъка в играта? Оценките в бележника остават.", "gameReset", "Започни отначало"),
    gameReset: () => { S.dos = {}; save(); home(); },
  };
  app.addEventListener("change", (e) => {
    const el = e.target.closest("[data-act-change='gameSel']");
    if (!el || !view) return;
    const s = st(el.dataset.id);
    if (view.kind === "review") { s.a = { ...(s.a || {}), [el.dataset.key]: el.value }; s.c = false; }
    else { s.b4a = { ...(s.b4a || {}), [el.dataset.key]: el.value }; s.b4c = false; }
    save();
  });
  app.addEventListener("input", (e) => {
    if (!view) return;
    const el = e.target, v = el.value.slice(0, 1000);
    if (el.id === "b5in") { st(view.id).b5t = v; save(); }
    else if (el.dataset.more) { st(el.dataset.more).moreT = v; save(); }
    else if (el.dataset.after != null) { const s = st("final"); s.afterT = { ...(s.afterT || {}), [el.dataset.after]: v }; save(); }
  });

  return { card, home, act: (b, e) => { const f = ACT[b.dataset.act]; if (f) { f(b, e); return true; } return false; }, leave: () => { view = null; } };
})();

if (EMBED) {
  setBank(EMBED);
  S = loadLocal();
  home();
} else {
  Online.boot();
}
