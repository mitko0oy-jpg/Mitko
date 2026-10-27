// "Interview with a character" (adapted from the talking-literature prototype). The AI runs on our server.
import { $, api, esc, guard, lockLine, params, renderUnlock, saveProgress, shuffle, topbar } from "./app.js";

let MOD, CHARS = [], PROG = {}, LOCKED = 0, CARDS = null;
let ch = null, turns = [], userCount = 0, busy = false;

const show = (id) => {
  ["ipick", "ichat"].forEach((s) => ($(s).hidden = s !== id));
  window.scrollTo(0, 0);
};
function addMsg(cls, html, who) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.innerHTML = (who ? `<span class="who">${esc(who)}</span>` : "") + html;
  $("iLog").appendChild(d);
  d.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return d;
}
function aiError(e) {
  if (e.code === "ai_free_used") {
    return `${esc(e.message)} <button class="linkbtn" data-ask>Покажи на родител</button>`;
  }
  return esc(e.message);
}
function bindAsk(root) {
  root.querySelectorAll("[data-ask]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api("learn/unlock", { module: MOD.module.slug });
      b.replaceWith(document.createTextNode("Готово! Родителят ще види молбата ти."));
    }),
  );
}

function skeleton() {
  $("main").innerHTML = `
<section id="ipick">
  <h1>${esc(MOD.module.title)}</h1>
  <p class="lead">${esc(MOD.module.subtitle)} Всеки герой ти дава мисия. Разбери отговора, като го разпитваш.</p>
  <div id="unlockBox"></div>
  <div class="chars" id="chars"></div>
  <div id="lockBox"></div>
  <p class="safe">AI говори само за творбите от програмата. Не пиши лични данни – име, адрес, училище или телефон. AI може да сгреши: когато се съмняваш, провери в текста на творбата или попитай учителя си.</p>
</section>
<section id="ichat" hidden>
  <div class="top"><button class="back" id="iBack">← Героите</button><span class="pos" id="iCount"></span></div>
  <div class="chathead"><span class="medal" id="iMedal"></span><span><b id="iName"></b><small id="iWork"></small></span></div>
  <div class="mission"><b>Мисия:</b> <span id="iMission"></span></div>
  <div class="log" id="iLog" aria-live="polite"></div>
  <div class="chips" id="iChips"></div>
  <div class="panel" id="iDonePanel" hidden>
    <h3>Изпълни ли мисията?</h3><p class="sub">Запиши в 1–2 изречения какво разбра.</p>
    <textarea class="big" id="iFound" style="min-height:90px" maxlength="800"></textarea>
    <div class="row" style="margin-top:10px"><button class="btn" id="iCheck">Провери</button></div>
    <div class="fb" id="iFb" hidden></div>
    <div class="row" style="margin-top:12px" id="iToQuiz" hidden><button class="btn gold" id="iQuizBtn">Сега героят изпитва теб</button></div>
  </div>
  <div class="panel" id="iQuiz" hidden></div>
  <div class="row" id="iDoneRow" hidden style="margin-top:12px"><button class="btn gold" id="iDoneBtn">Изпълних мисията</button></div>
  <div class="composer" id="iComposer"><textarea id="iInput" rows="1" placeholder="Задай въпрос…" maxlength="400" aria-label="Въпрос към героя"></textarea><button class="btn" id="iSend">Изпрати</button></div>
</section>`;
  $("iSend").addEventListener("click", send);
  $("iInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  $("iInput").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  });
  $("iBack").addEventListener("click", () => {
    renderChars();
    show("ipick");
  });
  $("iDoneBtn").addEventListener("click", () => {
    $("iDonePanel").hidden = false;
    $("iDoneRow").hidden = true;
    $("iComposer").hidden = true;
    $("iChips").innerHTML = "";
    $("iFound").focus();
  });
  $("iCheck").addEventListener("click", checkMission);
  $("iQuizBtn").addEventListener("click", startQuiz);
}

function renderChars() {
  $("chars").innerHTML = CHARS.map((c, i) => {
    const p = PROG[c.id];
    return `<button class="char" data-i="${i}"><span class="medal" style="--c:var(${esc(c.color)})">${esc(c.mono)}</span><b>${esc(c.name)}</b><small>„${esc(c.work)}“ · ${esc(c.author)}${p ? `<br><span style="color:var(--ok);font-weight:700">✓ мисия ${p.last_ok ? "изпълнена" : "опитана"}</span>` : ""}</small></button>`;
  }).join("");
  $("chars").querySelectorAll(".char").forEach((b) => b.addEventListener("click", () => openChar(+b.dataset.i)));
  $("lockBox").innerHTML = lockLine(LOCKED);
  if (LOCKED && CHARS.every((c) => PROG[c.id])) renderUnlock($("unlockBox"), { module: MOD.module.slug, title: MOD.module.title, done: CHARS.length, total: CHARS.length + LOCKED });
}

function openChar(i) {
  ch = CHARS[i];
  turns = [];
  userCount = 0;
  $("iMedal").textContent = ch.mono;
  $("iMedal").style.setProperty("--c", `var(${ch.color})`);
  $("iName").textContent = ch.name;
  $("iWork").textContent = `„${ch.work}“ · ${ch.author}`;
  $("iMission").textContent = ch.mission;
  $("iLog").innerHTML = "";
  ["iDonePanel", "iQuiz", "iDoneRow", "iFb", "iToQuiz"].forEach((id) => ($(id).hidden = true));
  $("iFound").value = "";
  $("iComposer").hidden = false;
  addMsg("them", esc(ch.greet), ch.name);
  renderChips();
  updCount();
  show("ichat");
  $("iInput").focus({ preventScroll: true });
}
function renderChips() {
  const used = new Set(turns.filter((t) => t.role === "user").map((t) => t.content));
  $("iChips").innerHTML = (ch.chips || []).filter((c) => !used.has(c)).map((c) => `<button class="chip">${esc(c)}</button>`).join("");
  $("iChips").querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => {
      $("iInput").value = b.textContent;
      send();
    }),
  );
}
function updCount() {
  $("iCount").textContent = userCount ? `Въпроси: ${userCount}` : "";
  $("iDoneRow").hidden = userCount < 3 || !$("iDonePanel").hidden;
}

async function send() {
  const v = $("iInput").value.trim();
  if (!v || busy) return;
  busy = true;
  $("iSend").disabled = true;
  $("iInput").value = "";
  addMsg("me", esc(v));
  turns.push({ role: "user", content: v });
  userCount++;
  renderChips();
  const bubble = addMsg("them", `<span class="thinking">${esc(ch.name)} мисли…</span>`, ch.name);
  try {
    const r = await api("ai", { mode: "interview", itemId: ch.id, messages: turns.slice(-12) });
    bubble.innerHTML = `<span class="who">${esc(ch.name)}</span>${esc(r.text)}`;
    turns.push({ role: "assistant", content: r.text });
  } catch (e) {
    bubble.className = "msg note";
    bubble.innerHTML = aiError(e);
    bindAsk(bubble);
    turns.pop();
    userCount--;
  }
  busy = false;
  $("iSend").disabled = false;
  updCount();
}

async function checkMission() {
  const v = $("iFound").value.trim();
  if (!v) return;
  $("iCheck").disabled = true;
  const fb = $("iFb");
  fb.hidden = false;
  fb.className = "fb";
  fb.textContent = "Проверявам…";
  try {
    const r = await api("ai", { mode: "mission", itemId: ch.id, text: v });
    fb.className = "fb " + (r.ok ? "ok" : "no");
    fb.innerHTML = `<b>${r.ok ? "Мисията е изпълнена!" : "Почти!"}</b> ${esc(r.feedback)}` + (r.ok ? "" : `<br><br><b>Отговорът:</b> ${esc(r.key)}`);
    PROG[ch.id] = { last_ok: r.ok };
    saveProgress(MOD.module.slug, [{ itemId: ch.id, ok: r.ok, answer: v }]);
    $("iToQuiz").hidden = false;
  } catch (e) {
    fb.className = "fb no";
    fb.innerHTML = aiError(e);
    bindAsk(fb);
  }
  $("iCheck").disabled = false;
}

// Three cards about the same work, taken from the open part of the cards module.
async function cardsFor(work) {
  if (CARDS === null) {
    CARDS = [];
    try {
      const home = await api("learn/home");
      const cm = home.modules.find((x) => x.kind === "cards");
      if (cm) CARDS = (await api(`learn/module/${encodeURIComponent(cm.slug)}`)).items.map((i) => i.data);
    } catch {}
  }
  return shuffle(CARDS.filter((c) => (c.ws || []).includes(work))).slice(0, 3);
}

async function startQuiz() {
  const qs = await cardsFor(ch.work);
  const box = $("iQuiz");
  box.hidden = false;
  $("iToQuiz").hidden = true;
  if (!qs.length) {
    box.innerHTML = `<p>Картите за тази творба са в пълния достъп. Опитай с друг герой.</p><div class="row"><button class="btn gold" id="iAgain">Друг герой</button></div>`;
    $("iAgain").addEventListener("click", () => {
      renderChars();
      show("ipick");
    });
    return;
  }
  let k = 0, right = 0;
  const render = () => {
    if (k >= qs.length) {
      box.innerHTML = `<div class="summary"><div class="big">${right} / ${qs.length}</div><p>${right === qs.length ? "Отлично! Познаваш творбата." : right >= 2 ? "Много добре!" : "Прочети творбата още веднъж и опитай с друг герой."}</p><div class="row" style="justify-content:center"><button class="btn gold" id="iAgain">Друг герой</button></div></div>`;
      $("iAgain").addEventListener("click", () => {
        renderChars();
        show("ipick");
      });
      box.scrollIntoView({ block: "start" });
      return;
    }
    const c = qs[k];
    const order = shuffle([0, 1, 2, 3]);
    box.innerHTML = `<h3>${esc(ch.name)} те пита (${k + 1}/${qs.length})</h3><p class="q">${esc(c.q)}</p>${c.qt ? `<blockquote class="quote">${esc(c.qt)}</blockquote>` : ""}<ul class="opts">${order.map((oi, j) => `<li><button class="opt" data-oi="${oi}">${"АБВГ"[j]}) ${esc(c.o[oi])}</button></li>`).join("")}</ul><div class="fb" id="qFb" hidden></div>`;
    box.querySelectorAll(".opt").forEach((b) =>
      b.addEventListener("click", () => {
        const oi = +b.dataset.oi;
        box.querySelectorAll(".opt").forEach((x) => {
          x.disabled = true;
          if (+x.dataset.oi === 0) x.classList.add("right");
        });
        if (oi === 0) right++;
        else b.classList.add("wrong");
        const f = $("qFb");
        f.hidden = false;
        f.className = "fb " + (oi === 0 ? "ok" : "no");
        f.innerHTML = `<b>${oi === 0 ? "Вярно!" : "Не е вярно."}</b> ${esc(c.e)}<div class="row" style="margin-top:10px"><button class="btn" id="qNext">${k + 1 < qs.length ? "Следващ въпрос" : "Резултат"}</button></div>`;
        $("qNext").addEventListener("click", () => {
          k++;
          render();
        });
      }),
    );
    box.scrollIntoView({ block: "start" });
  };
  render();
}

async function load() {
  const m = await guard("child");
  topbar(m, { back: { href: "/uchenik/", label: "Начало" } });
  const slug = params().get("m");
  if (!slug) return (location.href = "/uchenik/");
  MOD = await api(`learn/module/${encodeURIComponent(slug)}`);
  CHARS = MOD.items.map((i) => ({ ...i.data, id: i.id }));
  PROG = MOD.progress;
  LOCKED = MOD.locked;
  skeleton();
  renderChars();
  show("ipick");
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
