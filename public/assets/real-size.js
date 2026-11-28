// "Виж я в реален размер": one card (10 × 14 cm) on the screen, with centimetre rulers.
// A browser does not know how big its screen is in centimetres, and asking visitors to hold a bank card
// to the screen did not work for them, so the scale is a guess by kind of device (phone, tablet, Mac,
// other computer) – close on most screens. A scale saved by the old bank-card setting is still used.
// Any button with data-realsize="lit|ezik|mat" opens it; the card pictures come from the button's
// data-rs-lit / data-rs-ezik / data-rs-mat (attributes, so the store build points them at the CDN).
import { ROOT } from "/assets/eb-root.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const CARD = { w: 100, h: 140 }; // mm
const K_MIN = 1.5, K_MAX = 9;
const KEY = "eb-realsize";
const DECKS = [["lit", "Литература"], ["ezik", "Български език"], ["mat", "Математика"]];

const screenId = () => `${screen.width}x${screen.height}@${Math.round((window.devicePixelRatio || 1) * 100)}`;
function savedK() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o && o.s === screenId() && o.k >= K_MIN && o.k <= K_MAX) return o.k;
  } catch {}
  return 0;
}
// CSS pixels per inch on typical screens: phones ≈ 155, tablets ≈ 132, MacBooks ≈ 127, other computers ≈ 96
function guessK() {
  const short = Math.min(screen.width, screen.height);
  const touch = matchMedia("(pointer: coarse)").matches;
  const mac = /Mac/.test(navigator.platform || navigator.userAgent);
  const ppi = touch && short < 600 ? 155 : touch ? 132 : mac && (window.devicePixelRatio || 1) >= 2 ? 127 : 96;
  return ppi / 25.4;
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
  <section class="rs-view" data-rs="view">
    <div class="rs-view-txt">
      <p class="kicker" data-rs="kick">Реален размер</p>
      <h2 class="rs-h">Ето колко голяма е една карта</h2>
      <div class="side-switch rs-tabs" role="group" aria-label="Тесте" data-rs="tabs">${DECKS.map(([d, n]) => `<button type="button" data-deck="${d}" aria-pressed="false">${n}</button>`).join("")}</div>
      <p class="rs-note">Всяка карта е <b>10 × 14 см</b> – колкото четвърт лист А4. Линийките са в сантиметри. Картите и на трите тестета са с еднакъв размер.</p>
      <p class="rs-note" data-rs="over" hidden>Картата е по-голяма от видимата част на екрана – превъртете, за да я видите цялата.</p>
      <div class="rs-acts">
        <button class="btn btn-primary" type="button" data-rs="order" hidden>Към поръчката <span class="arrow">→</span></button>
        <button class="btn btn-ghost" type="button" data-rs="close">Затвори</button>
      </div>
    </div>
    <div class="rs-stage"><div class="rs-grid"><span class="rs-cm">см</span><div data-rs="top"></div><div data-rs="left"></div><div class="rs-card" role="img" data-rs="card"></div></div></div>
  </section>
</div>`;

const scope = ROOT || document;
const buttons = $$("[data-realsize]", scope).filter((b) => !b.dataset.rsOn);
if (buttons.length) {
  let dlg = null, k = guessK(), deck = "lit", pics = {}, overflow = "";
  const q = (name) => $(`[data-rs="${name}"]`, dlg);

  const drawCard = () => {
    const w = CARD.w * k, h = CARD.h * k, card = q("card");
    q("top").innerHTML = ruler(CARD.w, k, false);
    q("left").innerHTML = ruler(CARD.h, k, true);
    Object.assign(card.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${2.5 * k}px`, backgroundImage: pics[deck] ? `url("${pics[deck]}")` : "none" });
    const name = (DECKS.find(([d]) => d === deck) || DECKS[0])[1];
    card.setAttribute("aria-label", `Карта по ${name.toLowerCase()} в реален размер – 10 × 14 см`);
    for (const b of $$("button", q("tabs"))) b.setAttribute("aria-pressed", String(b.dataset.deck === deck));
    q("over").hidden = !(w + 70 > innerWidth || h + 70 > innerHeight);
  };
  const show = () => {
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
    addEventListener("resize", () => { if (dlg.open) drawCard(); });
  };

  const open = (btn) => {
    if (!dlg) build();
    deck = DECKS.some(([d]) => d === btn.dataset.realsize) ? btn.dataset.realsize : "lit";
    pics = { lit: btn.dataset.rsLit, ezik: btn.dataset.rsEzik, mat: btn.dataset.rsMat };
    for (const b of $$("button", q("tabs"))) b.hidden = !pics[b.dataset.deck];
    overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dlg.showModal();
    k = savedK() || guessK();
    show();
    $(".rs-x", dlg).focus();
  };
  for (const b of buttons) {
    b.dataset.rsOn = "1";
    b.addEventListener("click", () => open(b));
  }
}
