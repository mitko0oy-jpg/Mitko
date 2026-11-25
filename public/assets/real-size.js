// "Виж я в реален размер": one card (10 × 14 cm) on the screen at its true size.
// A browser does not know how big its screen is in centimetres, so the visitor first matches a frame
// to a bank or ID card (ISO/IEC 7810 ID-1, 85.6 × 53.98 mm – the same everywhere). The scale is kept
// on the device and asked again only when the screen or the zoom changes.
// Any button with data-realsize="lit|ezik|mat" opens it; the card pictures come from the button's
// data-rs-lit / data-rs-ezik / data-rs-mat (attributes, so the store build points them at the CDN).
import { ROOT } from "/assets/eb-root.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const CARD = { w: 100, h: 140 }; // mm
const ID1 = { w: 85.6, h: 53.98 }; // mm
const CSS_MM = 96 / 25.4; // px per "millimetre" as the browser counts it – right on many desktop screens
const K_MIN = 1.5, K_MAX = 9, K_STEP = 0.01;
const KEY = "eb-realsize";
const DECKS = [["lit", "Литература"], ["ezik", "Български език"], ["mat", "Математика"]];

const clampK = (k) => Math.min(K_MAX, Math.max(K_MIN, Math.round(k * 1000) / 1000));
const screenId = () => `${screen.width}x${screen.height}@${Math.round((window.devicePixelRatio || 1) * 100)}`;
function savedK() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o && o.s === screenId() && o.k >= K_MIN && o.k <= K_MAX) return o.k;
  } catch {}
  return 0;
}
function saveK(k) {
  try { localStorage.setItem(KEY, JSON.stringify({ k, s: screenId() })); } catch {}
}

// a centimetre ruler as long as the card's side: numbers every cm, ticks every 5 mm (and every mm if there is room)
function ruler(mm, k, vertical) {
  const len = Math.round(mm * k), T = 28;
  const w = vertical ? T : len, h = vertical ? len : T;
  let s = `<svg class="rs-ruler" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
  for (let i = 0; i <= mm; i++) {
    const t = i % 10 === 0 ? 13 : i % 5 === 0 ? 8 : k >= 2.6 ? 4 : 0;
    if (!t) continue;
    const p = Math.min(Math.max(i * k, 0.5), len - 0.5);
    s += vertical ? `<line x1="${T}" y1="${p}" x2="${T - t}" y2="${p}"/>` : `<line x1="${p}" y1="${T}" x2="${p}" y2="${T - t}"/>`;
    if (i % 10) continue;
    const n = i / 10;
    if (vertical) s += `<text x="1" y="${Math.min(Math.max(p + 4, 10), len - 1)}">${n}</text>`;
    else s += `<text x="${p}" y="11" text-anchor="${i === 0 ? "start" : i === mm ? "end" : "middle"}">${n}</text>`;
  }
  return s + "</svg>";
}

const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const HTML = `
<button class="rs-x" type="button" aria-label="Затвори">${X}</button>
<div class="rs-body">
  <section class="rs-cal" data-rs="cal">
    <div class="rs-cal-txt">
      <p class="kicker">Стъпка 1 от 2 · настройка</p>
      <h2 class="rs-h">Настройте екрана по истинска карта</h2>
      <p class="rs-p">Всеки екран показва нещата в различен размер. Настройката отнема 10 секунди и се прави само веднъж на това устройство.</p>
      <ol class="rs-steps">
        <li>Вземете <b>банкова или лична карта</b> – всички са с еднакъв размер.</li>
        <li>Долепете я до екрана върху рамката, като <b>подравните горните леви ъгли</b>.</li>
        <li>Местете плъзгача, докато рамката стане <b>точно колкото картата</b>.</li>
      </ol>
    </div>
    <div class="rs-frame"><div class="rs-id" data-rs="id"><span class="rs-chip" data-rs="chip"></span><span class="rs-id-t">Долепете картата тук</span></div></div>
    <div class="rs-cal-ctrl">
      <div class="rs-slider">
        <button type="button" data-step="-1" aria-label="По-малка рамка">−</button>
        <input type="range" min="${K_MIN}" max="${K_MAX}" step="${K_STEP}" aria-label="Размер на рамката" data-rs="range">
        <button type="button" data-step="1" aria-label="По-голяма рамка">+</button>
      </div>
      <button class="btn btn-primary" type="button" data-rs="done">Готово – покажи картата <span class="arrow">→</span></button>
      <button class="rs-link" type="button" data-rs="skip">Нямам карта под ръка – покажи приблизително</button>
    </div>
  </section>
  <section class="rs-view" data-rs="view" hidden>
    <div class="rs-view-txt">
      <p class="kicker" data-rs="kick">Реален размер</p>
      <h2 class="rs-h">Ето колко голяма е една карта</h2>
      <div class="side-switch rs-tabs" role="group" aria-label="Тесте" data-rs="tabs">${DECKS.map(([d, n]) => `<button type="button" data-deck="${d}" aria-pressed="false">${n}</button>`).join("")}</div>
      <p class="rs-note" data-rs="ok">Това е истинският ѝ размер – <b>10 × 14 см</b>. Линийките са в сантиметри. Картите и на трите тестета са с еднакъв размер.</p>
      <p class="rs-note rs-warn" data-rs="approx" hidden>Размерът е <b>приблизителен</b>. За точен размер <button class="rs-link" type="button" data-rs="recal">настройте екрана с банкова карта</button>.</p>
      <p class="rs-note" data-rs="over" hidden>Картата е по-голяма от видимата част на екрана – превъртете, за да я видите цялата.</p>
      <div class="rs-acts">
        <button class="btn btn-primary" type="button" data-rs="order" hidden>Към поръчката <span class="arrow">→</span></button>
        <button class="btn btn-ghost" type="button" data-rs="close">Затвори</button>
      </div>
      <button class="rs-link" type="button" data-rs="recal">↻ Настрой екрана отново</button>
    </div>
    <div class="rs-stage"><div class="rs-grid"><span class="rs-cm">см</span><div data-rs="top"></div><div data-rs="left"></div><div class="rs-card" role="img" data-rs="card"></div></div></div>
  </section>
</div>`;

const scope = ROOT || document;
const buttons = $$("[data-realsize]", scope).filter((b) => !b.dataset.rsOn);
if (buttons.length) {
  let dlg = null, k = CSS_MM, approx = false, deck = "lit", pics = {}, portrait = false, overflow = "";
  const q = (name) => $(`[data-rs="${name}"]`, dlg);

  const drawFrame = () => {
    const w = (portrait ? ID1.h : ID1.w) * k, h = (portrait ? ID1.w : ID1.h) * k;
    const f = q("id"), c = q("chip");
    Object.assign(f.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${3.18 * k}px` });
    // the chip sits where it does on a real card (landscape), turned with it (portrait)
    Object.assign(c.style, portrait
      ? { left: `${27.5 * k}px`, top: `${9 * k}px`, width: `${8.5 * k}px`, height: `${11 * k}px`, borderRadius: `${1.5 * k}px` }
      : { left: `${9 * k}px`, top: `${18 * k}px`, width: `${11 * k}px`, height: `${8.5 * k}px`, borderRadius: `${1.5 * k}px` });
  };
  const drawCard = () => {
    const w = CARD.w * k, h = CARD.h * k, card = q("card");
    q("top").innerHTML = ruler(CARD.w, k, false);
    q("left").innerHTML = ruler(CARD.h, k, true);
    Object.assign(card.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${2.5 * k}px`, backgroundImage: pics[deck] ? `url("${pics[deck]}")` : "none" });
    const name = (DECKS.find(([d]) => d === deck) || DECKS[0])[1];
    card.setAttribute("aria-label", `Карта по ${name.toLowerCase()} в реален размер – 10 × 14 см`);
    for (const b of $$("button", q("tabs"))) b.setAttribute("aria-pressed", String(b.dataset.deck === deck));
    q("ok").hidden = approx;
    q("approx").hidden = !approx;
    q("over").hidden = !(w + 70 > innerWidth || h + 70 > innerHeight);
  };
  const showCal = () => {
    q("cal").hidden = false;
    q("view").hidden = true;
    portrait = innerWidth < 640;
    q("range").value = String(k);
    drawFrame();
    dlg.scrollTop = 0;
  };
  const showView = (fromSaved) => {
    q("cal").hidden = true;
    q("view").hidden = false;
    q("kick").textContent = fromSaved ? "Реален размер" : "Стъпка 2 от 2 · реален размер";
    drawCard();
    dlg.scrollTop = 0;
  };
  const close = () => dlg.open && dlg.close();

  const build = () => {
    dlg = document.createElement("dialog");
    dlg.className = "rs-dlg";
    dlg.setAttribute("aria-label", "Картата в реален размер");
    dlg.innerHTML = HTML;
    // inside the fixed layer of the block (#ebf), so the block's styles reach it
    (document.getElementById("ebf") || ROOT || document.body).appendChild(dlg);
    $(".rs-x", dlg).addEventListener("click", close);
    q("close").addEventListener("click", close);
    q("range").addEventListener("input", (e) => { k = clampK(Number(e.target.value)); drawFrame(); });
    for (const b of $$("[data-step]", dlg)) {
      b.addEventListener("click", () => { k = clampK(k + Number(b.dataset.step) * K_STEP); q("range").value = String(k); drawFrame(); });
    }
    q("done").addEventListener("click", () => { saveK(k); approx = false; showView(false); });
    q("skip").addEventListener("click", () => { k = CSS_MM; approx = true; showView(false); });
    for (const b of $$('[data-rs="recal"]', dlg)) b.addEventListener("click", showCal);
    q("tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-deck]");
      if (b) { deck = b.dataset.deck; drawCard(); }
    });
    const order = $("#porachka", scope);
    if (order) {
      q("order").hidden = false;
      q("order").addEventListener("click", () => { close(); order.scrollIntoView({ behavior: "smooth", block: "start" }); });
    }
    dlg.addEventListener("close", () => { document.documentElement.style.overflow = overflow; });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
    addEventListener("resize", () => {
      if (!dlg.open) return;
      if (!q("cal").hidden) drawFrame();
      else drawCard();
    });
  };

  const open = (btn) => {
    if (!dlg) build();
    deck = DECKS.some(([d]) => d === btn.dataset.realsize) ? btn.dataset.realsize : "lit";
    pics = { lit: btn.dataset.rsLit, ezik: btn.dataset.rsEzik, mat: btn.dataset.rsMat };
    for (const b of $$("button", q("tabs"))) b.hidden = !pics[b.dataset.deck];
    overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dlg.showModal();
    const s = savedK();
    if (s) { k = s; approx = false; showView(true); }
    else { k = CSS_MM; approx = false; showCal(); }
    $(".rs-x", dlg).focus();
  };
  for (const b of buttons) {
    b.dataset.rsOn = "1";
    b.addEventListener("click", () => open(b));
  }
}
