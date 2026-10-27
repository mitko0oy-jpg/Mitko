// "Teach Pesho": the child explains a typical exam mistake to a classmate.
import { $, api, esc, guard, lockLine, params, renderUnlock, saveProgress, shuffle, topbar } from "./app.js";

let MOD, ALL = [], PROG = {}, LOCKED = 0;
let pq = [], pi = 0, tries = 0, learned = 0, busy = false;

function addMsg(cls, html, who) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.innerHTML = (who ? `<span class="who">${esc(who)}</span>` : "") + html;
  $("pLog").appendChild(d);
  d.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return d;
}

function skeleton() {
  $("main").innerHTML = `
<section id="intro">
  <h1>${esc(MOD.module.title)}</h1>
  <p class="lead">Съученикът ти Пешо е пропуснал часовете и бърка всичко. Обясни му – който обяснява, той запомня.</p>
  <div id="unlockBox"></div>
  <p>${ALL.length} грешки за поправяне${Object.keys(PROG).length ? ` · поправени: ${Object.values(PROG).filter((p) => p.last_ok).length}` : ""}.</p>
  <div class="row"><button class="btn gold" id="pStart">Започни урок с Пешо</button></div>
  <div id="lockBox"></div>
  <p class="safe">AI говори само за творбите от програмата. Не пиши лични данни.</p>
</section>
<section id="pesho" hidden>
  <div class="top"><button class="back" id="pBack">← Назад</button><span class="pos" id="pPos"></span></div>
  <div class="chathead"><span class="medal" style="--c:var(--l1)">П</span><span><b>Пешо</b><small>съученик, пропуснал часовете</small></span></div>
  <div class="log" id="pLog" aria-live="polite"></div>
  <div class="composer" id="pComposer"><textarea id="pInput" rows="2" placeholder="Обясни на Пешо къде греши…" maxlength="500" aria-label="Обяснение за Пешо"></textarea><button class="btn" id="pSend">Обясни</button></div>
  <div class="row" id="pNextRow" hidden style="margin-top:6px"><button class="btn gold" id="pNext">Следващ въпрос</button></div>
  <div class="panel summary" id="pEnd" hidden></div>
</section>`;
  $("pStart").addEventListener("click", startPesho);
  $("pBack").addEventListener("click", () => {
    $("pesho").hidden = true;
    $("intro").hidden = false;
  });
  $("pSend").addEventListener("click", send);
  $("pInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  $("pNext").addEventListener("click", () => {
    pi++;
    nextQ(false);
  });
  $("lockBox").innerHTML = lockLine(LOCKED);
  if (LOCKED && ALL.every((p) => PROG[p.id])) renderUnlock($("unlockBox"), { module: MOD.module.slug, title: MOD.module.title, done: ALL.length, total: ALL.length + LOCKED });
}

function startPesho() {
  // New mistakes first, then the ones not yet fixed.
  const fresh = shuffle(ALL.filter((p) => !PROG[p.id]));
  const retry = shuffle(ALL.filter((p) => PROG[p.id] && !PROG[p.id].last_ok));
  const rest = shuffle(ALL.filter((p) => PROG[p.id]?.last_ok));
  pq = [...fresh, ...retry, ...rest].slice(0, 5);
  pi = 0;
  learned = 0;
  $("pLog").innerHTML = "";
  $("pEnd").hidden = true;
  $("intro").hidden = true;
  $("pesho").hidden = false;
  nextQ(true);
}

function nextQ(first) {
  tries = 0;
  $("pNextRow").hidden = true;
  $("pComposer").hidden = false;
  if (pi >= pq.length) return end();
  $("pPos").textContent = `Урок ${pi + 1} / ${pq.length}`;
  addMsg("them", esc((first ? "Ей, утре сме на изпит, а аз пропуснах часовете… " : "") + pq[pi].says), "Пешо");
  $("pInput").value = "";
  $("pInput").focus({ preventScroll: true });
}

async function send() {
  const v = $("pInput").value.trim();
  if (!v || busy) return;
  busy = true;
  $("pSend").disabled = true;
  $("pInput").value = "";
  addMsg("me", esc(v));
  const p = pq[pi];
  tries++;
  const bubble = addMsg("them", `<span class="thinking">Пешо мисли…</span>`, "Пешо");
  try {
    const r = await api("ai", { mode: "pesho", itemId: p.id, text: v });
    bubble.innerHTML = `<span class="who">Пешо</span>${esc(r.pesho || "Хм…")}`;
    if (r.verdict === "correct") {
      learned++;
      addMsg("teacher", `<b>Браво, научи Пешо!</b> ${esc(r.truth)}`);
      done(p, true);
    } else if (tries >= 2) {
      addMsg("teacher", `<b>Учителката подсказва:</b> ${esc(r.truth)}`);
      done(p, false);
    } else if (r.verdict === "partial") addMsg("note", "Почти! Кажи на Пешо и кое е вярното.");
    else addMsg("note", "Провери пак – Пешо още не е убеден. Помисли кое е вярното.");
  } catch (e) {
    bubble.className = "msg note";
    bubble.innerHTML = esc(e.message) + (e.code === "ai_free_used" ? ` <button class="linkbtn" id="askP">Покажи на родител</button>` : "");
    $("askP")?.addEventListener("click", async () => {
      await api("learn/unlock", { module: MOD.module.slug });
      $("askP").replaceWith(document.createTextNode("Готово! Родителят ще види молбата ти."));
    });
    tries--;
  }
  busy = false;
  $("pSend").disabled = false;
}

function done(p, ok) {
  PROG[p.id] = { last_ok: ok };
  saveProgress(MOD.module.slug, [{ itemId: p.id, ok }]);
  $("pComposer").hidden = true;
  $("pNextRow").hidden = false;
  $("pNext").textContent = pi + 1 < pq.length ? "Следващ въпрос" : "Виж резултата";
}

function end() {
  $("pComposer").hidden = true;
  $("pNextRow").hidden = true;
  $("pPos").textContent = "Резултат";
  const e = $("pEnd");
  e.hidden = false;
  e.innerHTML = `<div class="big">${learned} / ${pq.length}</div><p>${learned === pq.length ? "Пешо вече знае всичко – а ти още повече!" : learned >= 3 ? "Пешо научи много от теб." : "Пешо още се обърква. Опитай отново – всеки път е по-лесно."}</p><div class="row" style="justify-content:center"><button class="btn gold" id="pAgain">Нов урок</button><a class="btn ghost" href="/uchenik/">Начало</a></div>`;
  $("pAgain").addEventListener("click", startPesho);
  e.scrollIntoView({ block: "start" });
}

async function load() {
  const m = await guard("child");
  topbar(m, { back: { href: "/uchenik/", label: "Начало" } });
  const slug = params().get("m");
  if (!slug) return (location.href = "/uchenik/");
  MOD = await api(`learn/module/${encodeURIComponent(slug)}`);
  ALL = MOD.items.map((i) => ({ ...i.data, id: i.id }));
  PROG = MOD.progress;
  LOCKED = MOD.locked;
  skeleton();
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
