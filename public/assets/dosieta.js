// „Литературни досиета“ landing: prices from the settings, the buy box (package + binding → its
// checkout page), the sticky bar and the page viewer. Runs before shop.js (see dosieta-main.js).
import { DOS as BASE } from "/assets/dosieta-config.js";
import { euro } from "/assets/shop-catalog.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const SET = window.EB_LANDING?.dos || {};
const cents = (v) => Math.round(v * 100);
const DOS = { ...BASE, packages: structuredClone(BASE.packages), checkout: { ...BASE.checkout, ...(SET.checkout || {}) } };
for (const [k, v] of Object.entries(SET.prices || {})) if (DOS.packages[k] && v > 0) DOS.packages[k].price = cents(v);
for (const [k, v] of Object.entries(SET.was || {})) if (DOS.packages[k]) DOS.packages[k].was = v > 0 ? cents(v) : 0;
if (SET.regular >= 0) DOS.regular = cents(SET.regular);
if (SET.delivery > 0) DOS.delivery = cents(SET.delivery);
if (SET.store) DOS.store = SET.store;
// the book alone is compared with the price on the cover
DOS.packages["dos-1"].was = DOS.regular > DOS.packages["dos-1"].price ? DOS.regular : 0;

for (const el of $$("[data-dprice]")) el.textContent = euro(DOS.packages[el.dataset.dprice]?.price || 0);
for (const el of $$("[data-dwas]")) {
  const p = DOS.packages[el.dataset.dwas];
  el.hidden = !(p?.was > p?.price);
  if (!el.hidden) el.textContent = euro(p.was);
}
for (const a of $$("[data-store-link]")) a.href = DOS.store;

const box = $("[data-dos-buy]");
if (box) {
  const pick = (name) => $(`input[name="${name}"]:checked`, box)?.value;
  const go = $$("[data-dos-go]");
  function update() {
    const k = pick("dpkg");
    const b = pick("bind");
    const p = DOS.packages[k];
    for (const el of $$("[data-dsel-price]")) el.textContent = euro(p.price);
    for (const el of $$("[data-dsel-was]")) {
      el.hidden = !(p.was > p.price);
      el.textContent = euro(p.was || 0);
    }
    for (const el of $$("[data-dsel-save]")) {
      el.hidden = !(p.was > p.price);
      el.textContent = `Спестяваш ${euro((p.was || 0) - p.price)}`;
    }
    for (const el of $$("[data-dsel-ship]")) el.innerHTML = p.freeShip ? "<b>Безплатна доставка</b> с този комплект" : `Доставка от ${euro(DOS.delivery)} до офис на Еконт или Спиди`;
    const url = DOS.checkout[`${k}:${b}`] || DOS.checkout[`${k}:spirala`] || "#";
    for (const a of go) a.href = url;
  }
  box.addEventListener("change", update);
  update();
}

// page viewer: a click on a page opens it large
const viewer = $("dialog.pv");
if (viewer) {
  const img = $("img", viewer);
  const pages = $$("[data-page-src]");
  let i = 0;
  const show = (j) => {
    i = (j + pages.length) % pages.length;
    img.src = pages[i].dataset.pageSrc;
    img.alt = pages[i].dataset.pageAlt || "";
    $(".pv-count", viewer).textContent = `${i + 1} / ${pages.length}`;
  };
  pages.forEach((p, j) =>
    p.addEventListener("click", () => {
      show(j);
      viewer.showModal();
    }),
  );
  $(".pv-prev", viewer).addEventListener("click", () => show(i - 1));
  $(".pv-next", viewer).addEventListener("click", () => show(i + 1));
  $(".pv-x", viewer).addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (e) => {
    if (e.target === viewer) viewer.close();
  });
  viewer.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(i - 1);
    if (e.key === "ArrowRight") show(i + 1);
  });
}

// the book tilts a little after the pointer
const book = $(".book3d");
if (book && matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const stage = book.parentElement;
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    book.style.setProperty("--ry", `${-24 + ((e.clientX - r.left) / r.width - 0.5) * 18}deg`);
    book.style.setProperty("--rx", `${4 - ((e.clientY - r.top) / r.height - 0.5) * 10}deg`);
  });
  stage.addEventListener("pointerleave", () => {
    book.style.removeProperty("--ry");
    book.style.removeProperty("--rx");
  });
}
