// The card store (edubel.bg): header with the cart, the cart drawer, the mobile menu, the footer,
// the product page buy box and the quick "add" buttons. Runs before shop.js (see store-main.js), so
// the header is already on the page when shop.js wires the scroll effects and, inside a ConvertBuilder
// block, moves the fixed bars under <body>.
// The cart holds at most two decks; every cart is one package of shop-catalog.js, and "Към поръчката"
// opens that package's checkout page in ConvertBuilder.
import { PACKAGES, euro } from "/assets/shop-catalog.js";
import * as CFG from "/assets/store-config.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SET = window.EB_LANDING?.store || {};
const local = location.pathname.startsWith("/magazin/");
const LINKS = { ...CFG.LINKS, ...(SET.links || {}), ...(local ? CFG.LOCAL : {}) };
const CHECKOUT = { ...CFG.CHECKOUT, ...(SET.checkout || {}) };
const DELIVERY_FROM = SET.delivery > 0 ? Math.round(SET.delivery * 100) : CFG.DELIVERY_FROM;
const { DECKS, CONTACT, COMPANY, MAX_DECKS } = CFG;

const host = document.getElementById("ebl") || document.body;
const main = $("main");
const MEDIA = main?.dataset.media || "/karti-nvo/media/";
const PAGE = main?.dataset.page || "";

const ICON = {
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5h11v9H3z"/><path d="M14 9.5h3.6l3.4 3.4v2.6h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  arrow: '<span class="arrow" aria-hidden="true">→</span>',
};
const LOGO = `<img class="logo" src="${esc(main?.dataset.logo || "/assets/logo.png")}" alt="Еду БЕЛ" width="220" height="160">`;

/* ---------- cart: {lit, ezik} in localStorage; at most two decks ---------- */
const KEY = "eb-cart";
const PKG_CART = { "lit-1": { lit: 1, ezik: 0 }, "lit-2": { lit: 2, ezik: 0 }, "ezik-1": { lit: 0, ezik: 1 }, "ezik-2": { lit: 0, ezik: 2 }, duo: { lit: 1, ezik: 1 } };
const n0 = (v) => Math.max(0, Math.min(MAX_DECKS, Math.floor(Number(v) || 0)));
function load() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    if (c && n0(c.lit) + n0(c.ezik) <= MAX_DECKS) return { lit: n0(c.lit), ezik: n0(c.ezik) };
  } catch {}
  return { lit: 0, ezik: 0 };
}
let cart = load();
let notice = "";
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {}
};
const count = (c = cart) => c.lit + c.ezik;
const pkgOf = (c = cart) => (c.lit && c.ezik ? "duo" : c.lit ? `lit-${c.lit}` : c.ezik ? `ezik-${c.ezik}` : null);
const checkoutOf = (pkg) => CHECKOUT[pkg] || CHECKOUT["lit-1"];
const one = () => PACKAGES["lit-1"].price;

// A package goes into the cart; past two decks the cart becomes just that package.
function add(pkg) {
  const p = PKG_CART[pkg];
  if (!p) return;
  const next = { lit: cart.lit + p.lit, ezik: cart.ezik + p.ezik };
  notice = "";
  if (count(next) > MAX_DECKS) {
    if (count()) notice = "В една поръчка влизат до 2 тестета – оставихме това, което избра сега.";
    cart = { ...p };
  } else cart = next;
  save();
  render();
  openCart();
}
function setQty(deck, n) {
  const other = deck === "lit" ? cart.ezik : cart.lit;
  cart = { ...cart, [deck]: Math.max(0, Math.min(MAX_DECKS - other, n)) };
  notice = "";
  save();
  render();
}

/* ---------- header, menu, cart drawer and footer ---------- */
const NAV = [
  ["home", "Магазин", "#produkti"],
  ["lit", "Литература"],
  ["ezik", "Български език"],
  ["duo", "Комплект"],
];
const href = (key, hash = "") => esc((LINKS[key] || "/") + hash);
const navItem = ([key, label, hash]) =>
  `<li><a href="${key === "home" && PAGE === "home" ? hash : href(key, key === "home" ? hash : "")}"${key === PAGE ? ' aria-current="page"' : ""}>${label}</a></li>`;

host.insertAdjacentHTML(
  "afterbegin",
  `<nav class="nav snav" aria-label="Основна навигация">
  <div class="ann"><div class="ann-in">
    <span>${ICON.truck}Безплатна доставка при 2 тестета</span>
    <span>${ICON.cash}Плащаш при получаване</span>
    <span>${ICON.eye}Преглед преди плащане · изпращаме до 1–2 работни дни</span>
  </div></div>
  <div class="container snav-row">
    <button class="icon-btn menu-btn" type="button" aria-label="Меню" aria-haspopup="dialog">${ICON.menu}</button>
    <a class="brand" href="${href("home")}" aria-label="Еду БЕЛ – начало">${LOGO}</a>
    <ul class="nav-links">${NAV.map(navItem).join("")}<li><a href="#vaprosi">Въпроси</a></li></ul>
    <div class="nav-cta">
      <a class="btn btn-primary btn-sm snav-shop" href="${PAGE === "home" ? "#produkti" : href("home", "#produkti")}">Пазарувай</a>
      <button class="icon-btn cart-btn" type="button" aria-label="Количка" aria-haspopup="dialog">${ICON.bag}<span class="cart-badge" hidden>0</span></button>
    </div>
  </div>
</nav>
<dialog class="smenu" aria-label="Меню">
  <div class="smenu-head"><a class="brand" href="${href("home")}">${LOGO}</a><button class="icon-btn smenu-x" type="button" aria-label="Затвори">${ICON.close}</button></div>
  <ul class="smenu-links">
    ${["lit", "ezik", "duo"].map((k) => `<li><a href="${href(k)}"><img src="${esc(MEDIA + (k === "duo" ? "kutiya-literatura.webp" : DECKS[k].img))}" alt="" loading="lazy"><span><b>${k === "duo" ? "Комплект: литература + език" : DECKS[k].title}</b><small>${k === "duo" ? "80 карти · безплатна доставка" : DECKS[k].sub}</small></span></a></li>`).join("")}
  </ul>
  <ul class="smenu-more"><li><a href="${PAGE === "home" ? "#produkti" : href("home", "#produkti")}">Всички продукти</a></li><li><a href="#vaprosi">Въпроси</a></li><li><a href="tel:${CONTACT.tel}">${CONTACT.phone}</a></li><li><a href="mailto:${CONTACT.email}">${CONTACT.email}</a></li></ul>
</dialog>
<dialog class="cart" aria-labelledby="cart-title">
  <div class="cart-head"><h2 id="cart-title">Количка <span class="cart-n"></span></h2><button class="icon-btn cart-x" type="button" aria-label="Затвори количката">${ICON.close}</button></div>
  <div class="cart-meter"><p class="meter-msg"></p><div class="meter" aria-hidden="true"><span></span></div></div>
  <p class="cart-notice" hidden></p>
  <div class="cart-body">
    <ul class="cart-items"></ul>
    <div class="cart-empty"><p><b>Количката е празна.</b></p><p>Разгледай картите и избери тестето за детето.</p><a class="btn btn-ghost btn-sm" href="${PAGE === "home" ? "#produkti" : href("home", "#produkti")}">Към магазина</a></div>
    <div class="cart-up"></div>
  </div>
  <div class="cart-foot">
    <dl class="cart-sum">
      <div><dt>Междинна сума</dt><dd class="s-sub"></dd></div>
      <div class="s-disc-row"><dt>Отстъпка за 2 тестета</dt><dd class="s-disc"></dd></div>
      <div><dt>Доставка</dt><dd class="s-ship"></dd></div>
      <div class="tot"><dt>Общо</dt><dd class="s-tot"></dd></div>
    </dl>
    <a class="btn btn-primary cart-go" href="#">Към поръчката ${ICON.arrow}</a>
    <p class="cart-note">${ICON.cash}Плащаш при получаване, след преглед на пратката</p>
  </div>
</dialog>`,
);

host.insertAdjacentHTML(
  "beforeend",
  `<footer class="sfoot">
  <div class="container">
    <div class="sf-top">
      <div class="sf-brand">
        <a class="brand" href="${href("home")}">${LOGO}</a>
        <p>Образователни карти по български език и литература за 5., 6. и 7. клас. Създадени от преподавател по БЕЛ и оценител на НВО.</p>
        <ul class="sf-chips"><li>Еконт</li><li>Спиди</li><li>Наложен платеж</li></ul>
      </div>
      <div><h4>Магазин</h4><ul><li><a href="${href("lit")}">Карти по литература</a></li><li><a href="${href("ezik")}">Карти по български език</a></li><li><a href="${href("duo")}">Комплект: литература + език</a></li><li><a href="${href("dosieta")}">Литературни досиета</a></li><li><a href="${href("trenazhor")}">НВО тренажор</a></li><li><a href="${href("app")}">Приложението Еду БЕЛ</a></li></ul></div>
      <div><h4>Помощ</h4><ul><li><a href="${href("delivery")}">Доставка и връщане</a></li><li><a href="${href("terms")}">Общи условия</a></li><li><a href="${href("privacy")}">Поверителност</a></li><li><a href="${href("cookies")}">Бисквитки</a></li></ul></div>
      <div><h4>Контакт</h4><ul><li><a href="tel:${CONTACT.tel}">${CONTACT.phone}</a></li><li><a href="mailto:${CONTACT.email}">${CONTACT.email}</a></li></ul></div>
    </div>
    <p class="sf-legal">© ${new Date().getFullYear()} ${esc(COMPANY)}</p>
  </div>
</footer>`,
);

const cartDlg = $("dialog.cart", host);
const menuDlg = $("dialog.smenu", host);
const badge = $(".cart-badge", host);

function openCart() {
  render();
  if (menuDlg.open) menuDlg.close();
  if (!cartDlg.open) cartDlg.showModal();
}
// Clicks on the dimmed area outside the panel close a dialog.
for (const d of [cartDlg, menuDlg]) {
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
}
$(".cart-btn", host).addEventListener("click", openCart);
$(".cart-x", host).addEventListener("click", () => cartDlg.close());
$(".menu-btn", host).addEventListener("click", () => menuDlg.showModal());
$(".smenu-x", host).addEventListener("click", () => menuDlg.close());
menuDlg.addEventListener("click", (e) => {
  if (e.target.closest("a")) menuDlg.close();
});
cartDlg.addEventListener("click", (e) => {
  const b = e.target.closest("[data-qty]");
  if (b) {
    const [deck, d] = b.dataset.qty.split(":");
    setQty(deck, cart[deck] + Number(d));
    return;
  }
  const up = e.target.closest("[data-up]");
  if (up) {
    setQty(up.dataset.up, cart[up.dataset.up] + 1);
    return;
  }
  if (e.target.closest(".cart-empty a")) cartDlg.close();
});

function render() {
  const n = count();
  badge.hidden = !n;
  badge.textContent = n;
  $(".cart-n", cartDlg).textContent = n ? `(${n})` : "";
  cartDlg.classList.toggle("is-empty", !n);
  const pkg = pkgOf();
  const p = pkg ? PACKAGES[pkg] : null;
  const sub = n * one();
  const disc = p ? sub - p.price : 0;

  $(".cart-items", cartDlg).innerHTML = ["lit", "ezik"]
    .filter((k) => cart[k])
    .map((k) => {
      const d = DECKS[k];
      const room = count() < MAX_DECKS;
      return `<li class="ci">
        <a class="ci-img" href="${href(k)}"><img src="${esc(MEDIA + d.img)}" alt="" loading="lazy"></a>
        <div class="ci-main">
          <a class="ci-title" href="${href(k)}">${esc(d.title)}</a>
          <small>${esc(d.sub)}</small>
          <div class="qty" role="group" aria-label="Брой">
            <button type="button" data-qty="${k}:-1" aria-label="${cart[k] === 1 ? "Махни" : "Едно по-малко"}">${ICON.minus}</button>
            <output>${cart[k]}</output>
            <button type="button" data-qty="${k}:1" aria-label="Още едно"${room ? "" : " disabled"}>${ICON.plus}</button>
          </div>
        </div>
        <div class="ci-price"><s>${euro(cart[k] * PACKAGES["lit-1"].was)}</s><b>${euro(cart[k] * one())}</b></div>
      </li>`;
    })
    .join("");

  // one deck: offer the other one – two decks cost the price of the package with free delivery
  const up = $(".cart-up", cartDlg);
  if (n === 1) {
    const other = cart.lit ? "ezik" : "lit";
    const d = DECKS[other];
    const extra = PACKAGES.duo.price - one();
    up.innerHTML = `<div class="up">
      <img src="${esc(MEDIA + d.img)}" alt="" loading="lazy">
      <div><p class="up-k">Добави второ тесте</p><b>${esc(d.title)}</b><small>Само ${euro(extra)} вместо ${euro(one())} + безплатна доставка</small></div>
      <button class="btn btn-dark btn-sm" type="button" data-up="${other}">+ ${euro(extra)}</button>
    </div>`;
  } else up.innerHTML = "";

  const msg = $(".meter-msg", cartDlg);
  const bar = $(".meter span", cartDlg);
  if (n >= 2) {
    msg.innerHTML = `${ICON.check}<span><b>Доставката е безплатна.</b> Спестяваш ${euro(disc)} от цената.</span>`;
    bar.style.width = "100%";
  } else if (n === 1) {
    msg.innerHTML = `<span>Добави още <b>1 тесте</b> – второто е за ${euro(PACKAGES.duo.price - one())} и доставката става <b>безплатна</b>.</span>`;
    bar.style.width = "50%";
  } else {
    msg.innerHTML = "<span>Две тестета в поръчката – <b>безплатна доставка</b>.</span>";
    bar.style.width = "0%";
  }
  $(".cart-meter", cartDlg).classList.toggle("done", n >= 2);

  $(".s-sub", cartDlg).textContent = euro(sub);
  $(".s-disc-row", cartDlg).hidden = !(disc > 0);
  $(".s-disc", cartDlg).textContent = `−${euro(disc)}`;
  $(".s-ship", cartDlg).textContent = n >= 2 ? "Безплатна" : `от ${euro(DELIVERY_FROM)}`;
  $(".s-tot", cartDlg).textContent = p ? euro(p.price) : euro(0);
  const go = $(".cart-go", cartDlg);
  go.href = pkg ? checkoutOf(pkg) : "#";
  go.toggleAttribute("aria-disabled", !pkg);
  const note = $(".cart-notice", cartDlg);
  note.hidden = !notice;
  note.textContent = notice;
}
// shop.js runs right after this file and first applies the price settings of the block
setTimeout(render);
// another tab changed the cart
addEventListener("storage", (e) => {
  if (e.key === KEY) {
    cart = load();
    render();
  }
});

/* ---------- "add" buttons anywhere on the page ---------- */
// On the store pages the "Поръчай" links of the edubel.site sections (data-pkg) go into the cart too.
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-add], a[data-pkg]");
  if (!a || !PKG_CART[a.dataset.add || a.dataset.pkg]) return;
  e.preventDefault();
  add(a.dataset.add || a.dataset.pkg);
});

/* ---------- links between the store pages follow the settings ---------- */
for (const a of $$("[data-store]")) a.href = href(a.dataset.store, a.hash || "");

/* ---------- product page: gallery, package options, add / buy now ---------- */
for (const pdp of $$("[data-pdp]")) {
  const opts = $$('input[name="pkg"]', pdp);
  const picked = () => opts.find((o) => o.checked)?.value || opts[0]?.value;
  const buybar = $(".buybar");
  function update() {
    const k = picked();
    const p = PACKAGES[k];
    if (!p) return;
    for (const el of $$("[data-pdp-price]", document)) el.textContent = euro(p.price);
    for (const el of $$("[data-pdp-was]", document)) {
      el.hidden = !(p.was > p.price);
      el.textContent = euro(p.was);
    }
    for (const el of $$("[data-pdp-save]", pdp)) {
      el.hidden = !(p.was > p.price);
      el.textContent = `Спестяваш ${euro(p.was - p.price)}`;
    }
    for (const el of $$("[data-pdp-ship]", pdp)) el.innerHTML = p.freeShip ? `${ICON.truck}<b>Безплатна доставка</b> с този комплект` : `${ICON.truck}Доставка от ${euro(DELIVERY_FROM)} · <b>безплатна</b> при 2 тестета`;
    for (const el of $$("[data-pdp-add]", document)) el.dataset.add = k;
    if (buybar) $("[data-add]", buybar)?.setAttribute("data-add", k);
    const buy = $("[data-pdp-buy]", pdp);
    if (buy) buy.href = checkoutOf(k);
  }
  pdp.addEventListener("change", update);
  setTimeout(update);

  // gallery: thumbnails, arrows and swipe
  const gal = $(".gal", pdp);
  if (gal) {
    const img = $(".gal-main img", gal);
    const thumbs = $$(".gal-thumbs button", gal);
    let i = 0;
    const show = (j) => {
      i = (j + thumbs.length) % thumbs.length;
      const t = thumbs[i];
      thumbs.forEach((b) => b.setAttribute("aria-current", String(b === t)));
      gal.classList.add("swap");
      const next = new Image();
      next.src = t.dataset.src;
      next.decode?.().catch(() => {}).finally(() => {
        img.src = t.dataset.src;
        img.alt = t.dataset.alt || "";
        $(".gal-main", gal).classList.toggle("contain", t.hasAttribute("data-contain"));
        gal.classList.remove("swap");
      });
      t.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    };
    thumbs.forEach((b, j) => b.addEventListener("click", () => show(j)));
    $(".gal-prev", gal)?.addEventListener("click", () => show(i - 1));
    $(".gal-next", gal)?.addEventListener("click", () => show(i + 1));
    let x0 = null;
    const stage = $(".gal-main", gal);
    stage.addEventListener("pointerdown", (e) => (x0 = e.clientX));
    stage.addEventListener("pointerup", (e) => {
      if (x0 !== null && Math.abs(e.clientX - x0) > 40) show(i + (e.clientX < x0 ? 1 : -1));
      x0 = null;
    });
  }
}

/* ---------- "−30%" next to a price: the discount from the regular price ---------- */
setTimeout(() => {
  for (const el of $$("[data-off]")) {
    const p = PACKAGES[el.dataset.off];
    el.hidden = !(p?.was > p?.price);
    if (!el.hidden) el.textContent = `−${Math.round((1 - p.price / p.was) * 100)}%`;
  }
});

/* ---------- the year in any [data-year] ---------- */
for (const el of $$("[data-year]")) el.textContent = new Date().getFullYear();
