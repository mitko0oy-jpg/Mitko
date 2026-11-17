// /dostap/ – the parent's page for the НВО тренажор: the free trial, the three levels, the plans and paying with a card.
// The trainer sends the parent here with „Покажи на родител“ (/dostap/?k=КОД); the child never sees prices.
// Paying happens on Stripe's own page; we only get "paid" and then the code (see netlify/lib/pay.mts).
import { $, api, esc, toast } from "./app.js";
import qrcode from "./vendor/qrcode.js";

const params = new URLSearchParams(location.search);
const main = $("main");
const eur = (n) => `${Number(n).toFixed(2).replace(".", ",").replace(/,00$/, "")} €`;
const months = (n) => `${n} ${n === 1 ? "месец" : "месеца"}`;
const bgDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });
const termOf = (p) => (p.until ? `до ${bgDay(p.until)}` : months(p.months));
const SUBJ = { bel: "БЕЛ", math: "математика" };
const dot = (s) => (/[.!?]$/.test(s) ? s : `${s}.`); // "… 2026 г." already ends with a dot
const K_TRIAL = "edubel-dostap-trial";

function qrSvg(text, px = 180) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), q = 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" width="${px}" height="${px}" role="img" aria-label="QR код към тренажора"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Копирано."); } catch (e) { toast("Копирай го ръчно."); }
}

// The code and how to open the trainer with it (after the trial or a payment).
const codeBox = (code, link, extra = "") => `<div class="codebox">
    <div class="cb-txt"><span class="eyebrow">Кодът на детето</span><b class="code">${esc(code)}</b>
      <p class="small">Отвори тренажора с бутона или сканирай QR кода с телефона на детето. Кодът работи на до 3 устройства.</p>
      <div class="row"><a class="btn gold" href="${esc(link)}">Отвори тренажора</a><button class="btn ghost" data-copy="${esc(link)}">Копирай линка</button></div>
      ${extra}</div>
    <div class="cb-qr">${qrSvg(link)}</div></div>
  <p class="small muted">Запази линка или кода (например изпрати го на себе си). С него детето отваря тренажора и оценките му се пазят.</p>`;

const LEVELS = [
  ["БЕЛ: 10 модула като на НВО", "3 модула (по 1 от всяка част)", "всички, ако избереш БЕЛ", "всички"],
  ["Карти за преговор по литература и език", "–", "с БЕЛ", "✓"],
  ["Математика: 50 карти с упражнения", "карти 1–8", "всички, ако избереш математика", "всички"],
  ["Пробна матура с оценка", "–", "с БЕЛ", "✓"],
  ["„Литературни досиета“ – играта с героите", "–", "с БЕЛ", "✓"],
  ["Бележник, прогноза за НВО, тетрадка с грешки", "✓", "✓", "✓"],
  ["Скоро: аудио уроци, говорещи герои, AI помощник за задача 25", "–", "–", "влизат без доплащане"],
];
function levelsTable(plans) {
  const from = (tier) => {
    const ps = plans.filter((p) => p.tier === tier);
    return ps.length ? `от ${eur(Math.min(...ps.map((p) => p.price)))}` : "–";
  };
  return `<section class="panel"><h2>Трите нива</h2>
    <div class="tblwrap"><table class="lvtbl"><thead><tr><th></th><th>Старт</th><th>Стандарт</th><th>Пълен</th></tr></thead><tbody>
    ${LEVELS.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}
    <tr class="price"><th scope="row">Цена</th><td>безплатно</td><td>${from("std")}</td><td>${from("full")}</td></tr></tbody></table></div>
    <p class="small muted">Когато платеният срок свърши, тренажорът не се заключва: детето остава на „Старт“ с всичките си оценки, докато решите дали да продължите.</p></section>`;
}

function plansForm(d) {
  if (!d.plans.length) return `<section class="panel"><h2>Пакети</h2><p class="muted">Пакетите скоро ще са тук.</p></section>`;
  const list = d.plans.map((p, i) => `<label class="plan ${p.tier}"><input type="radio" name="plan" value="${esc(p.id)}" ${i === 0 ? "checked" : ""}>
      <span class="pl-body"><span class="pl-tier">${esc(p.tierName)}${p.subject ? ` · ${esc(SUBJ[p.subject])}` : ""}</span><b>${esc(p.title)}</b><span class="pl-term">${esc(termOf(p))}</span>${p.note ? `<span class="small muted">${esc(p.note)}</span>` : ""}</span>
      <span class="pl-price">${eur(p.price)}</span></label>`).join("");
  return `<section class="panel" id="buy"><h2>${d.code ? "Удължи или надгради" : "Купи достъп"}</h2>
    <form id="payForm" class="plans">${list}
      <label class="agree"><input type="checkbox" id="agree"> <span>Съгласен съм с <a href="/usloviya/#plashtane" target="_blank" rel="noopener">условията</a>. Искам достъпът да започне веднага и знам, че след това правото на отказ в 14 дни отпада – вижте как връщаме парите в условията.</span></label>
      <p class="err" id="payErr" role="alert"></p>
      <button class="btn gold full" id="payBtn" ${d.payments ? "" : "disabled"}>${d.payments ? "Плати с карта" : "Плащането с карта – съвсем скоро"}</button>
      <p class="small muted">Плащането е през Stripe – с карта, Apple Pay или Google Pay. Ние не виждаме и не пазим данните на картата. Разписката идва на имейла ти.</p></form></section>`;
}

function trialPanel(d) {
  if (!d.trial) return "";
  const len = d.trial.months ? months(d.trial.months) : d.trial.days === 1 ? "1 ден" : `${d.trial.days} дни`;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(K_TRIAL) || "null"); } catch (e) {}
  return `<section class="panel trial" id="trial"><h2>Пробвай безплатно – ${esc(len)} пълен достъп</h2>
    <p>Целият тренажор – БЕЛ и математика, пробни матури и играта с героите. Без карта и без имейл. След пробата детето остава на безплатното ниво „Старт“ с всичките си оценки.</p>
    <div id="trialOut">${saved ? codeBox(saved.code, saved.link, `<p class="small muted">Този код взе от това устройство.</p>`) : `<button class="btn gold" id="trialBtn">Вземи безплатен код</button>`}</div></section>`;
}

function render(d) {
  const c = d.code;
  let h = `<h1>${c ? "Достъпът до НВО тренажора" : "НВО тренажор по БЕЛ и математика"}</h1>
    <p class="lead">${c ? "Тук удължаваш или надграждаш достъпа на детето. Бележникът и оценките остават." : "За 5.–7. клас: задачи като на НВО с обяснение след всяка, пробни матури, прогноза за оценката и игра с героите от литературата."}</p>`;
  if (d.payments && d.test) h += `<p class="testbar"><b>Тестов режим.</b> Плащанията не са истински. За проба: карта 4242 4242 4242 4242, всяка бъдеща дата и всеки CVC.</p>`;
  if (c) {
    h += `<section class="panel codenow"><span class="eyebrow">Кодът на детето</span><b class="code">${esc(c.code)}</b>
      <p>${c.unlimited ? "Този код е <b>без срок</b> – не е нужно да плащаш." : c.expired ? "Платеният достъп е свършил – сега детето е на безплатното ниво <b>„Старт“</b>." : c.tier === "start" ? "Сега детето е на безплатното ниво <b>„Старт“</b>." : `Сега: <b>„${esc(c.tierName)}“${c.subject ? ` (${esc(SUBJ[c.subject])})` : ""}</b>${c.until ? ` до <b>${esc(dot(c.until))}</b>` : " – срокът започва от първото отваряне."}`}</p>
      ${c.unlimited ? "" : `<p class="small muted">Новият срок се добавя след оставащото време.</p>`}</section>`;
  }
  if (!c || !c.unlimited) {
    if (!c) h += trialPanel(d);
    h += levelsTable(d.plans) + plansForm(d);
  }
  h += `<section class="panel"><h2>Честно и спокойно</h2><ul class="small">
      <li>Плаща родителят. В тренажора детето никога не вижда цени и предложения за покупка.</li>
      <li>Без реклами и без проследяване. Не продаваме данни.</li>
      <li>Не ти харесва? Пиши ни до 14 дни от плащането и ще върнем парите (подробно в <a href="/usloviya/#plashtane">условията</a>).</li></ul></section>`;
  main.innerHTML = h;

  $("trialBtn")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = "Правя кода…";
    try {
      const r = await api("pay/trial", {});
      try { localStorage.setItem(K_TRIAL, JSON.stringify({ code: r.code, link: r.link })); } catch (e2) {}
      $("trialOut").innerHTML = codeBox(r.code, r.link);
    } catch (err) {
      $("trialOut").innerHTML = `<p class="notice err" role="alert">${esc(err.message)}</p>`;
    }
  });
  $("payForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("payErr");
    err.textContent = "";
    if (!$("agree").checked) { err.textContent = "Отбележи, че си съгласен с условията."; return; }
    const plan = new FormData(e.currentTarget).get("plan");
    const btn = $("payBtn");
    btn.disabled = true;
    btn.textContent = "Отварям плащането…";
    try {
      const r = await api("pay/checkout", { plan, code: c ? c.code : undefined, agree: true });
      location.href = r.url;
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false;
      btn.textContent = "Плати с карта";
    }
  });
}

// After paying: Stripe sends the parent back here with ?s=<session>; the webhook may take a few seconds.
async function statusView(s) {
  main.innerHTML = `<h1>Проверявам плащането…</h1><p class="lead">Това отнема няколко секунди.</p>`;
  for (let i = 0; i < 20; i++) {
    let r;
    try { r = await api(`pay/status?s=${encodeURIComponent(s)}`); } catch (e) { main.innerHTML = `<h1>Нещо се обърка</h1><p class="notice err">${esc(e.message)}</p>`; return; }
    if (r.status === "paid") {
      const term = r.until ? ` до <b>${esc(dot(r.until))}</b>` : r.months ? ` – ${esc(months(r.months))} от първото отваряне.` : ".";
      main.innerHTML = `${r.test ? `<p class="testbar"><b>Тестово плащане</b> – не са взети истински пари.</p>` : ""}
        <h1>Готово, благодарим! ✓</h1>
        <p class="lead">${r.renewed ? `Достъпът на кода е удължен: <b>„${esc(r.tierName)}“</b>${term} Детето продължава със същия бележник – просто да отвори тренажора.` : `Ниво <b>„${esc(r.tierName)}“</b>${term}`}</p>
        ${codeBox(r.code, r.link)}`;
      return;
    }
    if (r.status === "expired") {
      main.innerHTML = `<h1>Плащането не завърши</h1><p class="lead">Не са взети пари. Можеш да опиташ отново.</p><a class="btn gold" href="/dostap/">Към пакетите</a>`;
      return;
    }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  main.innerHTML = `<h1>Плащането се обработва</h1><p class="lead">Обнови страницата след минута. Ако кодът не се появи, обади ни се – плащането е записано.</p>`;
}

// Locally only (no Stripe key): the practice payment instead of Stripe's page.
function fakeView(session) {
  main.innerHTML = `<p class="testbar"><b>Тренировъчно плащане</b> – само на тестовия сървър, вместо страницата на Stripe.</p>
    <h1>Плащане с карта</h1><p class="lead">Тук би била страницата на Stripe за картата.</p>
    <div class="row"><button class="btn gold" id="fakePay">Плати (тренировка)</button><a class="btn ghost" href="/dostap/">Откажи</a></div>`;
  $("fakePay").addEventListener("click", async () => {
    try {
      await api("pay/fake-pay", { session });
      location.href = `/dostap/?s=${encodeURIComponent(session)}`;
    } catch (e) { toast(e.message); }
  });
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]");
  if (b) copy(b.dataset.copy);
});

(async function boot() {
  if (params.get("s")) return statusView(params.get("s"));
  if (params.get("fake")) return fakeView(params.get("fake"));
  try {
    render(await api(`pay/plans${params.get("k") ? `?k=${encodeURIComponent(params.get("k"))}` : ""}`));
  } catch (e) {
    main.innerHTML = `<h1>Достъп до НВО тренажора</h1><p class="notice err" role="alert">${esc(e.message)}</p><a class="btn ghost" href="/dostap/">Към пакетите</a>`;
  }
})();
