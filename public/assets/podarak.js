// „200 въпроса“ – the gift. One module for all its pages (data-page on <body>):
// landing, online check of a part, class ranking, teacher view, certificate.
// No account: the child is an anonymous id kept in this browser, the teacher a secret link.
import { $, api, esc, me, params, toast, topbar } from "./app.js";

const LETTERS = ["А", "Б", "В", "Г"];
const LEVEL = { 1: "Знам", 2: "Разбирам", 3: "Мисля" };
const SECTION = { literature: "Литература", language: "Български език" };
const PDF_URL = "/podarak/Edu-BEL-200-vaprosa.pdf";
const page = document.body.dataset.page;

// ---- storage that never breaks the page (private windows, blocked storage)
const mem = {};
const store = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return k in mem ? mem[k] : d;
    }
  },
  set(k, v) {
    mem[k] = v;
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

function playerId() {
  let id = store.get("eb_pk_player");
  if (!id) {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    id = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    store.set("eb_pk_player", id);
  }
  return id;
}

const stars = (n) => `<span class="stars lv${n}" aria-label="${n} ${n === 1 ? "точка" : "точки"}">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}">★</i>`).join("")}</span>`;
const pts = (n) => `${n} ${n === 1 ? "точка" : "точки"}`;
const partName = (p) => `${p.grade}. клас · ${SECTION[p.section]}`;

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Копирано");
  } catch {
    toast("Маркирай текста и го копирай ръчно");
  }
}

function footer() {
  return `<footer class="site"><span>© Еду БЕЛ</span><a href="/podarak/">200 въпроса</a><a href="/programa/">Програмата</a><a href="/usloviya/">Условия и поверителност</a><a href="https://edubel.site">edubel.site</a></footer>`;
}

// ================================================================ landing
async function landing() {
  const [info, mine] = await Promise.all([api("podarak/info"), api("podarak/me", { player: playerId() }).catch(() => null)]);
  const done = mine?.parts || {};
  let h = `<section class="pk-hero">
      <p class="kick">Голямото БЕЛ предизвикателство</p>
      <h1>200 въпроса</h1>
      <p class="lead">по български език и литература за 5., 6. и 7. клас – в шест части, с точки за трудност, проверка онлайн и класиране.</p>
      <div class="row"><a class="btn gold" href="${PDF_URL}" download>Изтегли PDF файла</a><a class="btn ghost" href="#chasti">Провери отговорите</a></div>
      <div class="pk-nums"><div><b>6</b><span>части</span></div><div><b>3</b><span>нива трудност</span></div><div><b>${info.max || 400}</b><span>точки максимум</span></div></div>
    </section>`;
  if (mine && mine.done) {
    h += `<div class="pk-me"><div><h3>Твоят резултат</h3><p>${mine.done} от 6 части · титла „${esc(mine.title)}“${mine.klass ? ` · клас ${esc(mine.klass.name)}` : ""}</p>
      <p><a href="/podarak/gramota/">Грамота</a>${mine.klass ? ` · <a href="/podarak/klas/?k=${esc(mine.klass.code)}">Класирането</a>` : ""}</p></div>
      <div class="big">${mine.total} <small style="font-size:16px;color:var(--paper);opacity:.7">/ ${mine.max}</small></div></div>`;
  }
  h += `<h2 id="chasti">Провери част</h2>
    <p class="muted">Реши частта на хартия, после я отвори тук и въведи буквите. Ще видиш точките си и обяснение за всяка грешка.</p>
    ${info.ready ? "" : `<p class="notice info">Въпросите още се подготвят. Скоро всичко ще е готово.</p>`}
    <div class="pk-parts">${info.parts
      .map((p) => {
        const r = done[p.part];
        return `<a class="pk-part" href="/podarak/proverka/?c=${p.part}"><span class="num">${p.part}</span>
          <p class="t">${esc(partName(p))}</p><p class="d">Въпроси ${p.from}–${p.to} · до ${p.max} т.</p>
          <span class="pk-st ${r ? "" : "todo"}">${r ? `<span>${r.first ?? r.best} от ${p.max} т.</span><span>${r.attempts > 1 ? `най-добро ${r.best}` : "✓"}</span>` : `<span>Провери</span><span>→</span>`}</span></a>`;
      })
      .join("")}</div>`;
  h += `<h2>Как се играе</h2>
    <ol class="pk-steps">
      <li><div><b>Избери частта</b><span>5. клас – части 1 и 2, 6. клас – 3 и 4, 7. клас – 5 и 6. Седмокласниците могат да минат през всички: творбите от 5. и 6. клас също са в НВО.</span></div></li>
      <li><div><b>Реши честно</b><span>Без учебник и без помощ. Огради буквите в листа за отговори в края на частта.</span></div></li>
      <li><div><b>Сканирай QR кода</b><span>Въведи буквите и веднага виждаш точките, титлата си и защо е вярно всяко нещо.</span></div></li>
      <li><div><b>Събери 6-те части</b><span>До ${info.max || 400} точки общо и грамота с твоята титла.</span></div></li>
    </ol>
    <div class="panel"><h3>Точки за трудност</h3>
      <p>${stars(1)} <b>Знам</b> – 1 точка &nbsp; ${stars(2)} <b>Разбирам</b> – 2 точки &nbsp; ${stars(3)} <b>Мисля</b> – 3 точки</p>
      <h3 style="margin-top:12px">Титли</h3>
      <p>${info.ranks.map((r) => `<b>${esc(r.title)}</b> ${r.min ? `от ${r.min}%` : "до 39%"}`).join(" · ")}</p>
      <p class="small muted">Първият опит за всяка част влиза в класирането. После можеш да опитваш колкото искаш.</p></div>`;
  h += `<h2 id="uchitel">Състезание в класа</h2>
    <p>За учители: създайте безплатно код за класа. Децата го въвеждат при проверката и класът вижда своето класиране, а вие – кои въпроси затрудняват класа най-много.</p>
    <form class="stack panel" id="klasForm">
      <div class="field"><label for="klasName">Име на класа</label><input id="klasName" type="text" maxlength="80" placeholder="напр. 7 б, СУ „Христо Ботев“, Враца" required>
      <span class="hint">Без имена на деца. Кодът е безплатен.</span></div>
      <p class="formerr" id="klasErr"></p>
      <button class="btn" type="submit">Създай код за класа</button>
    </form>
    <div id="klasOut"></div>
    <div class="panel"><h3>За родителя</h3>
      <p>Еду БЕЛ е платформа по български език и литература за 5.–7. клас: литературни карти с преговор, тренажор за задача 25, разговори с героите от творбите и отчет за родителя.</p>
      <div class="row" style="margin-top:8px"><a class="btn ghost" href="/programa/">Виж програмата</a><a class="btn ghost" href="/registracia/">Регистрация за родители</a></div></div>
    ${footer()}`;
  $("main").innerHTML = h;
  $("klasForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("klasErr").textContent = "";
    try {
      const r = await api("podarak/klas", { name: $("klasName").value });
      const kidLink = `${location.origin}/podarak/proverka/?c=1&k=${r.code}`;
      const teacherLink = `${location.origin}/podarak/uchitel/#${r.teacher}`;
      store.set("eb_pk_teacher", { code: r.code, name: r.name, link: teacherLink });
      $("klasForm").hidden = true;
      $("klasOut").innerHTML = `<div class="panel"><h3>${esc(r.name)}</h3>
        <p>Код на класа за децата:</p><p class="pk-code">${esc(r.code)}</p>
        <p class="small muted">Децата въвеждат кода при проверката на всяка част. Или им дайте линка:</p>
        <div class="pk-link"><input type="text" readonly value="${esc(kidLink)}" aria-label="Линк за децата"><button class="btn ghost" data-copy="${esc(kidLink)}">Копирай</button></div>
        <p class="notice info" style="margin-top:14px"><b>Вашият линк на учител.</b> Запазете го – с него виждате класирането и най-трудните въпроси. Не го давайте на децата.</p>
        <div class="pk-link"><input type="text" readonly value="${esc(teacherLink)}" aria-label="Линк на учителя"><button class="btn ghost" data-copy="${esc(teacherLink)}">Копирай</button></div>
        <div class="row"><a class="btn" href="${esc(teacherLink)}">Отвори учителската страница</a></div></div>`;
      document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copy(b.dataset.copy)));
    } catch (err) {
      $("klasErr").textContent = err.message;
    }
  });
  const t = store.get("eb_pk_teacher");
  if (t) $("klasOut").innerHTML = `<p class="small muted">Вашият клас: <a href="${esc(t.link)}">${esc(t.name)} (${esc(t.code)})</a></p>`;
}

// ================================================================ check one part
async function check() {
  const info = await api("podarak/info");
  const p = info.parts.find((x) => x.part === Number(params().get("c"))) || info.parts[0];
  const key = `eb_pk_draft_${p.part}`;
  const draft = store.get(key, {});
  const who = store.get("eb_pk_who", { nick: "", klass: "" });
  if (params().get("k")) who.klass = params().get("k").toUpperCase();
  const mine = await api("podarak/me", { player: playerId() }).catch(() => null);
  const prev = mine?.parts?.[p.part];
  document.title = `Част ${p.part} – проверка · 200 въпроса · Еду БЕЛ`;

  const nums = [];
  for (let n = p.from; n <= p.to; n++) nums.push(n);
  let h = `<p class="eyebrow">Част ${p.part} от 6 · проверка</p>
    <h1>${esc(partName(p))}</h1>
    <p class="muted">Въпроси ${p.from}–${p.to} · до ${p.max} точки. Отбележи буквите, които си оградил в листа за отговори, и натисни „Провери“.</p>
    ${prev ? `<p class="notice info">Вече си проверил тази част: първият ти резултат е <b>${prev.first ?? prev.best} от ${p.max}</b> и той остава за класирането. Новият опит е за упражнение.</p>` : `<p class="notice info">Първият опит влиза в класирането – провери, когато си готов.</p>`}
    <div class="panel"><div class="pk-who">
      <div class="field"><label for="nick">Псевдоним</label><input id="nick" type="text" maxlength="20" autocomplete="off" value="${esc(who.nick)}" placeholder="напр. Книжния червей"><span class="hint">Не пиши истинското си име.</span></div>
      <div class="field"><label for="klass">Код на класа <span class="muted">(ако имаш)</span></label><input id="klass" type="text" maxlength="12" autocomplete="off" value="${esc(who.klass)}" placeholder="от учителя"><span class="hint">За класирането в класа.</span></div>
    </div></div>
    <form id="ans"><div class="pk-grid">${nums
      .map(
        (n) => `<div class="pk-row"><span class="n">${n}${p.points?.[n] ? stars(p.points[n]) : ""}</span><fieldset><legend>Въпрос ${n}</legend>${LETTERS.map(
          (L, i) => `<label class="ab"><input type="radio" name="q${n}" value="${i}" ${draft[n] === i ? "checked" : ""}><span>${L}</span></label>`,
        ).join("")}</fieldset></div>`,
      )
      .join("")}</div>
    <p class="formerr" id="ansErr" style="margin-top:12px"></p>
    <div class="pk-bar"><span class="cnt" id="cnt"></span><button class="btn gold" type="submit" id="go">Провери</button></div></form>
    <p class="small muted" style="margin-top:14px">Нямаш PDF файла? <a href="${PDF_URL}" download>Изтегли го тук</a>. <a href="/podarak/">Всички части</a></p>`;
  $("main").innerHTML = h;

  const answers = () => {
    const a = {};
    for (const n of nums) {
      const c = document.querySelector(`input[name="q${n}"]:checked`);
      if (c) a[n] = Number(c.value);
    }
    return a;
  };
  const count = () => {
    const k = Object.keys(answers()).length;
    $("cnt").innerHTML = `Отбелязани <b>${k}</b> от ${nums.length}`;
  };
  count();
  $("ans").addEventListener("change", () => {
    store.set(key, answers());
    count();
  });
  $("ans").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("ansErr").textContent = "";
    const a = answers();
    const empty = nums.length - Object.keys(a).length;
    if (!Object.keys(a).length) return ($("ansErr").textContent = "Отбележи поне един отговор.");
    if (empty && !confirm(`${empty} ${empty === 1 ? "въпрос е" : "въпроса са"} без отговор. Да проверя ли така?`)) return;
    const nick = $("nick").value.trim();
    const klass = $("klass").value.trim();
    store.set("eb_pk_who", { nick, klass });
    $("go").disabled = true;
    try {
      const r = await api("podarak/check", { part: p.part, answers: a, player: playerId(), nick, klass });
      store.set(key, {});
      showResult(r, info);
    } catch (err) {
      $("ansErr").textContent = err.message;
      $("go").disabled = false;
    }
  });
}

function showResult(r, info) {
  const wrong = r.results.filter((x) => !x.ok);
  const byLv = [1, 2, 3].map((lv) => {
    const all = r.results.filter((x) => x.pts === lv);
    return { lv, ok: all.filter((x) => x.ok).length, n: all.length };
  });
  const stand =
    r.better === null
      ? "Ти си сред първите участници в тази част."
      : r.better > 0
        ? `По-добър резултат от <b>${r.better}%</b> от участниците в тази част.`
        : "Следващия път ще е по-добре – прочети обясненията.";
  const next = info.parts.find((x) => x.part === r.part.part + 1);
  let h = `<p class="eyebrow">Част ${r.part.part} от 6 · резултат</p><h1>${esc(partName(r.part))}</h1>
    <div class="pk-score"><div class="medal" aria-hidden="true">${r.percent >= 75 ? "★" : r.percent >= 40 ? "✓" : "↑"}</div>
      <div class="big">${r.points} <small>от ${r.max} точки</small></div>
      <div class="title">${esc(r.title)}</div>
      <p>${r.correct} верни от ${r.count} · ${stand}</p>
      ${r.counts ? "" : `<p><b>Опит № ${r.attempt}</b> – за класирането остава първият ти резултат.</p>`}
      ${r.klass ? `<p>Резултатът е в класирането на <a href="/podarak/klas/?k=${esc(r.klass.code)}">${esc(r.klass.name)}</a>.</p>` : ""}
      <div class="pk-lv">${byLv.map((x) => `<div>${stars(x.lv)}<b>${x.ok} / ${x.n}</b>${LEVEL[x.lv]}</div>`).join("")}</div>
    </div>`;
  if (r.weak.length) {
    h += `<div class="panel"><h3>Какво да упражниш</h3><ul class="weak">${r.weak
      .map((u) => `<li><a href="/tema/?u=${encodeURIComponent(u.slug)}">${esc(u.title)}</a><span>${u.wrong} ${u.wrong === 1 ? "грешка" : "грешки"}</span></li>`)
      .join("")}</ul><p class="small muted" style="margin-top:8px">Темите водят към програмата на Еду БЕЛ.</p></div>`;
  }
  h += `<div class="row no-print">${next ? `<a class="btn" href="/podarak/proverka/?c=${next.part}">Към част ${next.part}</a>` : ""}<a class="btn ghost" href="/podarak/">Всички части</a><a class="btn ghost" href="/podarak/gramota/">Грамота</a></div>
    <h2>Отговорите</h2>
    <div class="tabs" role="tablist"><button role="tab" data-f="bad" aria-selected="true">Грешки (${wrong.length})</button><button role="tab" data-f="all" aria-selected="false">Всички (${r.results.length})</button></div>
    <div id="qs"></div>
    <div class="panel"><h3>За родителя</h3><p>Обясненията показват какво точно не е ясно. В Еду БЕЛ всяка тема има кратък урок, карти с преговор и упражнения, а родителят вижда отчет.</p>
      <div class="row" style="margin-top:8px"><a class="btn ghost" href="/programa/">Виж програмата</a></div></div>
    ${footer()}`;
  $("main").innerHTML = h;
  const list = (f) => {
    const shown = f === "bad" ? wrong : r.results;
    $("qs").innerHTML = shown.length
      ? shown
          .map(
            (x) => `<article class="pk-q ${x.ok ? "" : "bad"}"><header><span><b>${x.n}</b> · ${stars(x.pts)}</span><span>${x.ok ? `+${pts(x.pts)}` : "0 точки"}</span></header>
        <p class="qq">${esc(x.q)}</p>${x.qt ? `<blockquote>${esc(x.qt)}</blockquote>` : ""}
        ${x.ok ? `<p class="a ok">✓ ${x.right}) ${esc(x.rightText)}</p>` : `${x.your ? `<p class="a no">✗ Твоят отговор: ${x.your}) ${esc(x.yourText)}</p>` : `<p class="a no">Без отговор</p>`}<p class="a ok">Верният: ${x.right}) ${esc(x.rightText)}</p>`}
        <p class="why">${esc(x.e)}</p>
        ${!x.ok && x.unitTitle ? `<p class="pk-unit"><a href="/tema/?u=${encodeURIComponent(x.unit)}">Упражни: ${esc(x.unitTitle)}</a></p>` : ""}</article>`,
          )
          .join("")
      : `<p class="notice ok">Нито една грешка. Браво!</p>`;
  };
  list(wrong.length ? "bad" : "all");
  if (!wrong.length) document.querySelectorAll("[data-f]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.f === "all")));
  document.querySelectorAll("[data-f]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      list(b.dataset.f);
    }),
  );
  window.scrollTo(0, 0);
}

// ================================================================ class ranking
function rankingTable(d, { remove = false, myNick = "" } = {}) {
  if (!d.players.length) return `<p class="notice info">Още никой от класа не е проверил част. Резултатите се появяват тук веднага след проверката.</p>`;
  return `<div class="pk-scroll"><table class="pk-table"><thead><tr><th class="nm">№</th><th class="nm">Псевдоним</th>${d.parts.map((p) => `<th title="${esc(partName(p))}">Ч${p.part}</th>`).join("")}<th>Общо</th>${remove ? "<th></th>" : ""}</tr></thead><tbody>${d.players
    .map(
      (p, i) => `<tr class="${myNick && p.nick === myNick ? "me" : ""}"><td class="pos">${i + 1}</td><td class="nm"><b>${esc(p.nick)}</b><br><span class="small muted">${esc(p.title)}</span></td>${d.parts
        .map((x) => `<td>${p.parts[x.part] ?? "–"}</td>`)
        .join("")}<td class="tot">${p.total}</td>${remove ? `<td><button class="linkbtn" data-rm="${esc(p.ref)}" title="Махни от класа">✕</button></td>` : ""}</tr>`,
    )
    .join("")}</tbody></table></div>
    <p class="small muted">Точки от първия опит на всяка част. Ч1–Ч6 са частите, максимум ${d.max} точки.</p>`;
}

async function klas() {
  const code = (params().get("k") || "").toUpperCase();
  if (!code) {
    $("main").innerHTML = `<h1>Класиране</h1><form class="stack panel" id="kf"><div class="field"><label for="kc">Код на класа</label><input id="kc" type="text" maxlength="12" required></div><button class="btn">Покажи</button></form>${footer()}`;
    $("kf").addEventListener("submit", (e) => {
      e.preventDefault();
      location.search = `?k=${encodeURIComponent($("kc").value.trim().toUpperCase())}`;
    });
    return;
  }
  const d = await api(`podarak/klas/${encodeURIComponent(code)}`);
  const who = store.get("eb_pk_who", { nick: "" });
  $("main").innerHTML = `<p class="eyebrow">200 въпроса · класиране</p><h1>${esc(d.klass.name)}</h1>
    <p class="muted">Код на класа: <b>${esc(d.klass.code)}</b> · участници: ${d.players.length}</p>
    ${rankingTable(d, { myNick: who.nick })}
    <div class="row"><a class="btn gold" href="/podarak/proverka/?c=1&k=${esc(d.klass.code)}">Провери част</a><a class="btn ghost" href="/podarak/">Всички части</a></div>
    ${footer()}`;
}

// ================================================================ teacher
async function teacher() {
  const secret = location.hash.slice(1);
  if (!secret) {
    $("main").innerHTML = `<h1>Учителска страница</h1><p class="notice info">Отворете линка на учителя, който получихте при създаването на класа. Нямате клас? <a href="/podarak/#uchitel">Създайте код</a>.</p>${footer()}`;
    return;
  }
  const render = async (remove) => {
    const d = await api("podarak/uchitel", { teacher: secret, remove });
    const kidLink = `${location.origin}/podarak/proverka/?c=1&k=${d.klass.code}`;
    const solved = d.parts.map((p) => `<span class="pill ${d.solved[p.part] >= d.minForStats ? "ok" : ""}">Ч${p.part}: ${d.solved[p.part] || 0}</span>`).join(" ");
    $("main").innerHTML = `<p class="eyebrow">200 въпроса · учителска страница</p><h1>${esc(d.klass.name)}</h1>
      <div class="panel"><p>Код за децата:</p><p class="pk-code">${esc(d.klass.code)}</p>
        <div class="pk-link no-print"><input type="text" readonly value="${esc(kidLink)}" aria-label="Линк за децата"><button class="btn ghost" data-copy="${esc(kidLink)}">Копирай</button></div>
        <p class="small muted" style="margin-top:8px">Публичното класиране на класа: <a href="/podarak/klas/?k=${esc(d.klass.code)}">/podarak/klas/?k=${esc(d.klass.code)}</a></p></div>
      <h2>Класиране</h2>${rankingTable(d, { remove: true })}
      <h2>Най-трудните въпроси за класа</h2>
      <p class="muted">Решили по части: ${solved}. Статистиката на част се показва, когато поне ${d.minForStats} деца я решат.</p>
      ${
        d.hardest.length
          ? d.hardest
              .map(
                (x) => `<article class="pk-q bad"><header><span><b>${x.n}</b> · част ${x.part} · ${stars(x.pts)}</span><span><b>${x.wrongShare}%</b> грешно</span></header>
          <p class="qq">${esc(x.q)}</p><p class="a ok">Верният: ${x.right}) ${esc(x.rightText)}</p>
          ${x.common ? `<p class="a no">Най-честата грешка: ${x.common.letter}) ${esc(x.common.text)} – ${x.common.share}%</p>` : ""}
          <p class="why">${esc(x.e)}</p></article>`,
              )
              .join("")
          : `<p class="notice info">Още няма достатъчно решени части.</p>`
      }
      <div class="row no-print"><button class="btn ghost" id="print">Принтирай</button><a class="btn ghost" href="/podarak/">Към 200 въпроса</a></div>
      <p class="small muted">Пазете този линк – той е ключът към страницата. Псевдонимите избират децата; ✕ маха неуместен псевдоним от класа.</p>
      ${footer()}`;
    document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copy(b.dataset.copy)));
    document.querySelectorAll("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => {
        if (confirm("Да махна ли този участник от класа?")) render(b.dataset.rm).catch((e) => toast(e.message));
      }),
    );
    $("print").addEventListener("click", () => print());
  };
  await render();
}

// ================================================================ certificate
async function certificate() {
  const [mine, info] = await Promise.all([api("podarak/me", { player: playerId() }), api("podarak/info")]);
  const saved = store.get("eb_pk_name", "");
  const today = new Date().toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });
  $("main").innerHTML = `<div class="no-print"><h1>Грамота</h1>
      <p class="muted">${mine.done ? `Решил си ${mine.done} от 6 части.` : "Още нямаш проверена част."} Грамотата е с точките от първите опити. Името остава само на това устройство – не го изпращаме никъде.</p>
      <div class="field"><label for="nm">Име за грамотата</label><input id="nm" type="text" maxlength="40" value="${esc(saved)}" placeholder="Име и фамилия"></div>
      <div class="field" style="margin-top:10px"><label for="gr">Клас</label><select id="gr"><option value="">–</option>${[5, 6, 7].map((g) => `<option>${g}.</option>`).join("")}</select></div>
      <div class="row"><button class="btn gold" id="pr" ${mine.done ? "" : "disabled"}>Принтирай грамотата</button><a class="btn ghost" href="/podarak/">Към частите</a></div></div>
    <div class="pk-cert" id="cert"><img src="/assets/logo.png" alt="Еду БЕЛ" width="120" height="87">
      <h2>Грамота</h2><p class="sub">за участие в „Голямото БЕЛ предизвикателство“ – 200 въпроса</p>
      <p>се присъжда на</p><div class="name" id="cn">${esc(saved)}</div>
      <p id="cg"></p><p>за <b>${mine.total}</b> точки от ${mine.max} в ${mine.done} от 6 части и титлата</p>
      <div class="title">${esc(mine.title)}</div>
      <p class="small" style="color:#5A6275">${info.ranks.slice().reverse().map((r) => esc(r.title)).join(" · ")}</p>
      <div class="foot"><span>${esc(today)}</span><span>edubel.site</span></div><div class="brand">ЕДУ БЕЛ</div></div>`;
  const upd = () => {
    $("cn").textContent = $("nm").value;
    $("cg").textContent = $("gr").value ? `ученик от ${$("gr").value} клас,` : "";
    store.set("eb_pk_name", $("nm").value);
  };
  $("nm").addEventListener("input", upd);
  $("gr").addEventListener("change", upd);
  $("pr").addEventListener("click", () => print());
  upd();
}

const PAGES = { landing, check, klas, teacher, certificate };
me()
  .then((m) => topbar(m))
  .catch(() => {});
(PAGES[page] || landing)().catch((e) => {
  $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p><p><a href="/podarak/">Към 200 въпроса</a></p>`;
});
