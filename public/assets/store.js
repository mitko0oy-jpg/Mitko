// The card store (edubel.bg): header with the cart, the cart drawer, the mobile menu, the footer,
// the product page buy box and the quick "add" buttons. Runs before shop.js (see store-main.js), so
// the header is already on the page when shop.js wires the scroll effects and, inside a ConvertBuilder
// block, moves the fixed bars under <body>.
// The cart holds up to three decks in any mix; every cart is one package (the old five of
// shop-catalog.js and the mixes of store-config.js), and "Към поръчката" opens that package's checkout.
import { PACKAGES, PLAIN, REGULAR, setRegular, euro } from "/assets/shop-catalog.js";
import * as CFG from "/assets/store-config.js";
import { ROOT } from "/assets/eb-root.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SET = window.EB_LANDING?.store || {};
const local = Object.values(CFG.LOCAL).some((p) => location.pathname.startsWith(p.split("#")[0]));
const LINKS = { ...CFG.LINKS, ...(SET.links || {}), ...(local ? CFG.LOCAL : {}) };
const CHECKOUT = { ...CFG.CHECKOUT, ...(SET.checkout || {}) };
const DELIVERY_FROM = SET.delivery > 0 ? Math.round(SET.delivery * 100) : CFG.DELIVERY_FROM;
const { DECKS, CONTACT, COMPANY, MAX_DECKS } = CFG;
// the edubel.bg prices that differ from the catalog (a block's own price settings still win in shop.js)
for (const [k, v] of Object.entries(CFG.PRICES || {})) if (PACKAGES[k] && v > 0) PACKAGES[k].price = v;

// Every mix of up to three decks is a package: the old five come from the catalog, the rest are added here.
// Their price goes by the number of decks (CFG.LADDER); a deck marked "plain" has no struck-through price.
const KEYS = CFG.DECK_KEYS;
// delivery is free from this many decks; the words for it ("при 2 и 3 тестета" / "при 3 тестета")
const FREE = Math.max(1, Number(SET.freeShipDecks) || CFG.FREE_SHIP_DECKS || 2);
const FREE_WORDS = FREE >= MAX_DECKS ? `при ${MAX_DECKS} тестета` : `при ${Array.from({ length: MAX_DECKS - FREE + 1 }, (_, i) => FREE + i).join(" и ")} тестета`;
const PKG_CART = {};
for (let a = 0; a <= MAX_DECKS; a++) for (let b = 0; a + b <= MAX_DECKS; b++) for (let m = 0; a + b + m <= MAX_DECKS; m++) {
  const c = { lit: a, ezik: b, mat: m };
  const k = CFG.comboKey(c);
  if (!k) continue;
  PKG_CART[k] = c;
  if (!PACKAGES[k]) PACKAGES[k] = { title: CFG.COMBOS[k] || k, boxes: KEYS.flatMap((d) => Array(c[d]).fill(d)) };
  PACKAGES[k].freeShip = a + b + m >= FREE;
}
for (const [k, d] of Object.entries(DECKS)) if (d.plain) PLAIN.add(k);
const ladder = (n) => (n === 1 ? PACKAGES["lit-1"].price : n === 2 ? PACKAGES.duo.price : CFG.LADDER[n] || 0);
// the added packages follow the price steps; again after shop.js has applied the block's prices
const syncCombos = () => {
  for (const k of Object.keys(CFG.COMBOS)) PACKAGES[k].price = ladder(PACKAGES[k].boxes.length);
};
syncCombos();
setRegular(REGULAR);
const KASA = SET.kasa || CFG.KASA;

const host = ROOT || document.body;
const main = $("main", host);
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

/* ---------- cart: {lit, ezik, mat} in localStorage; up to three decks ---------- */
const KEY = "eb-cart";
const n0 = (v) => Math.max(0, Math.min(MAX_DECKS, Math.floor(Number(v) || 0)));
const count = (c = cart) => KEYS.reduce((s, k) => s + (c[k] || 0), 0);
const blank = () => Object.fromEntries(KEYS.map((k) => [k, 0]));
function load() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    const v = c && Object.fromEntries(KEYS.map((k) => [k, n0(c[k])]));
    if (v && count(v) <= MAX_DECKS) return v;
  } catch {}
  return blank();
}
let cart = load();
let notice = "";
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {}
};
const pkgOf = (c = cart) => CFG.comboKey(c);
// a package with a checkout of its own goes there; any other mix goes to the store's cart checkout
const checkoutOf = (pkg) => CHECKOUT[pkg] || `${KASA}?p=${encodeURIComponent(pkg)}`;
const single = (k) => PACKAGES[`${k}-1`];

// A package goes into the cart; past three decks the cart becomes just that package.
function add(pkg) {
  const p = PKG_CART[pkg];
  if (!p) return;
  const next = Object.fromEntries(KEYS.map((k) => [k, cart[k] + p[k]]));
  notice = "";
  if (count(next) > MAX_DECKS) {
    if (count()) notice = `В една поръчка влизат до ${MAX_DECKS} тестета – оставихме това, което избрахте сега.`;
    cart = { ...p };
  } else cart = next;
  save();
  render();
  openCart();
}
function setQty(deck, n) {
  const others = count() - cart[deck];
  cart = { ...cart, [deck]: Math.max(0, Math.min(MAX_DECKS - others, n)) };
  notice = "";
  save();
  render();
}

/* ---------- header, menu, cart drawer and footer ----------
   The same header on every page of the site: the logo goes to the home page, the phone is always
   in sight, the menu names each product plainly. A block can carry only the header
   (<main data-shell="header">) or only the footer (data-shell="footer") for pages built elsewhere. */
const SHELL = main?.dataset.shell || "both";
const NAV = [
  ["lit", "Литература", "hit"],
  ["ezik", "Български език"],
  ["mat", "Математика", "new"],
  ["duo", "Комплект"],
  ["dosieta", "Досиета"],
  ["trenazhor", "Тренажор"],
  ["shkoli", "За училища"],
];
const href = (key, hash = "") => esc((LINKS[key] || "/") + hash);
const navItem = ([key, label, mark]) =>
  `<li><a href="${href(key)}"${key === PAGE ? ' aria-current="page"' : ""}>${label}${mark === "hit" ? '<span class="nav-hit">хит</span>' : mark === "new" ? '<span class="nav-hit nav-new">ново</span>' : ""}</a></li>`;
const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h3.5l1.6 4.2-2.2 1.4a11 11 0 0 0 6.5 6.5l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4z"/></svg>';
const VIBER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6c-5.2 0-8.6 2.7-8.6 7.6 0 2.8 1.1 4.8 3 6v3.5l3.1-2.6c.8.2 1.6.2 2.5.2 5.2 0 8.6-2.6 8.6-7.1S17.2 2.6 12 2.6z" fill="currentColor"/></svg>';
const MENU = [
  ["lit", "Карти по литература", "Най-продавани · 22 творби в 40 карти", "kutiya-literatura.webp"],
  ["ezik", "Карти по български език", "20 правила + 20 упражнения", "kutiya-ezik.webp"],
  ["mat", "Карти по математика", "Ново · 50 карти за 5.–7. клас", "kutiya-matematika.webp"],
  ["duo", "Комплект: литература + език", "80 карти · безплатна доставка", "kutiya-ezik.webp"],
  ["dosieta", "Литературни досиета", "книга-игра · 24 досиета", "dosieta/korica-hd.webp"],
  ["trenazhor", "НВО тренажор", "200 задачи онлайн · 1, 6 или 12 месеца", "trener/m-hi.webp"],
  ["produkti", "Всички продукти", "всичко на едно място", "trener/i-karti.webp"],
  ["shkoli", "За учители и училища", "поръчки за клас, библиотека, читалище", "trener/i-chetene.webp"],
];

if (SHELL !== "footer") host.insertAdjacentHTML(
  "afterbegin",
  `<nav class="nav snav" aria-label="Основна навигация">
  <div class="ann"><div class="ann-in">
    <span>${ICON.truck}Безплатна доставка ${FREE_WORDS}</span>
    <span>${ICON.cash}Плащане при получаване</span>
    <span>${ICON.eye}Преглед преди плащане · изпращаме до 1–2 работни дни</span>
  </div></div>
  <div class="container snav-row">
    <button class="icon-btn menu-btn" type="button" aria-label="Меню" aria-haspopup="dialog">${ICON.menu}<span class="ib-label">Меню</span></button>
    <a class="brand" href="${href("home")}" aria-label="Еду БЕЛ – към началната страница">${LOGO}</a>
    <ul class="nav-links">${NAV.map(navItem).join("")}</ul>
    <div class="nav-cta">
      <a class="snav-phone" href="tel:${CONTACT.tel}" aria-label="Обади се: ${CONTACT.phone}">${PHONE_ICON}<span><small>Поръчки по телефона</small>${CONTACT.phone}</span></a>
      <button class="icon-btn cart-btn" type="button" aria-label="Количка" aria-haspopup="dialog">${ICON.bag}<span class="cart-badge" hidden>0</span><span class="ib-label">Количка</span></button>
    </div>
  </div>
</nav>
<dialog class="smenu" aria-label="Меню">
  <div class="smenu-head"><a class="brand" href="${href("home")}" aria-label="Към началната страница">${LOGO}</a><button class="icon-btn smenu-x" type="button" aria-label="Затвори менюто">${ICON.close}</button></div>
  <a class="smenu-home" href="${href("home")}">← Към началната страница</a>
  <ul class="smenu-links">
    ${MENU.map(([k, t, sub, img]) => `<li><a href="${href(k)}"${k === PAGE ? ' aria-current="page"' : ""}><img src="${esc(MEDIA + img)}" alt="" loading="lazy"><span><b>${t}</b><small>${sub}</small></span></a></li>`).join("")}
  </ul>
  <div class="smenu-call">
    <p>Не сте сигурни какво да изберете? Обадете ни се – ще помогнем.</p>
    <a class="btn btn-primary" href="tel:${CONTACT.tel}">${PHONE_ICON}${CONTACT.phone}</a>
    <a class="smenu-mail" href="mailto:${CONTACT.email}">${CONTACT.email}</a>
  </div>
</dialog>
<dialog class="cart" aria-labelledby="cart-title">
  <div class="cart-head"><h2 id="cart-title">Количка <span class="cart-n"></span></h2><button class="icon-btn cart-x" type="button" aria-label="Затвори количката">${ICON.close}</button></div>
  <div class="cart-meter"><p class="meter-msg"></p><div class="meter" aria-hidden="true"><span></span></div></div>
  <p class="cart-notice" hidden></p>
  <div class="cart-body">
    <ul class="cart-items"></ul>
    <div class="cart-empty"><p><b>Количката е празна.</b></p><p>Разгледайте картите и изберете тестето за детето.</p><a class="btn btn-ghost btn-sm" href="${href("produkti")}">Всички продукти</a></div>
    <div class="cart-up"></div>
  </div>
  <div class="cart-foot">
    <dl class="cart-sum">
      <div><dt>Междинна сума</dt><dd class="s-sub"></dd></div>
      <div class="s-disc-row"><dt class="s-disc-t">Отстъпка</dt><dd class="s-disc"></dd></div>
      <div><dt>Доставка</dt><dd class="s-ship"></dd></div>
      <div class="tot"><dt>Общо</dt><dd class="s-tot"></dd></div>
    </dl>
    <a class="btn btn-primary cart-go" href="#">Към поръчката ${ICON.arrow}</a>
    <p class="cart-note">${ICON.cash}Плащане при получаване, след преглед на пратката</p>
    <p class="cart-note">Предпочитате по телефона? <a href="tel:${CONTACT.tel}">${CONTACT.phone}</a></p>
  </div>
</dialog>`,
);

// a header-only block keeps room for the fixed header above the page under it
if (SHELL === "header") host.insertAdjacentHTML("beforeend", '<div class="snav-spacer" aria-hidden="true"></div>');

if (SHELL !== "header") host.insertAdjacentHTML(
  "beforeend",
  `<footer class="sfoot">
  <div class="container">
    <div class="sf-call">
      <div><b>Имате въпрос или искате да поръчате по телефона?</b><span>Обадете ни се – ще ви помогнем да изберете.</span></div>
      <a class="btn btn-primary" href="tel:${CONTACT.tel}">${PHONE_ICON}${CONTACT.phone}</a>
      <a class="btn btn-ghost sf-viber" href="${esc(CONTACT.viber)}" target="_blank" rel="noopener">${VIBER_ICON}Viber канал</a>
    </div>
    <div class="sf-top">
      <div class="sf-brand">
        <a class="brand" href="${href("home")}" aria-label="Еду БЕЛ – към началната страница">${LOGO}</a>
        <p>Образователни карти, книга-игра и онлайн тренажор по български език и литература за 5., 6. и 7. клас. Създадени от преподавател по БЕЛ и оценител на НВО.</p>
        <ul class="sf-chips"><li>Еконт</li><li>Спиди</li><li>Наложен платеж</li></ul>
      </div>
      <div><h4>Продукти</h4><ul><li><a href="${href("lit")}">Карти по литература</a></li><li><a href="${href("ezik")}">Карти по български език</a></li><li><a href="${href("mat")}">Карти по математика</a></li><li><a href="${href("duo")}">Комплект: литература + език</a></li><li><a href="${href("dosieta")}">Литературни досиета</a></li><li><a href="${href("trenazhor")}">НВО тренажор</a></li><li><a href="${href("produkti")}">Всички продукти</a></li></ul></div>
      <div><h4>За кого</h4><ul><li><a href="${href("home")}">За родители и баби и дядовци</a></li><li><a href="${href("shkoli")}">За учители и училища</a></li><li><a href="${href("shkoli")}">За читалища и библиотеки</a></li></ul><h4 class="sf-h2">Помощ</h4><ul><li><a href="${href("delivery")}">Доставка и връщане</a></li><li><a href="${href("terms")}">Общи условия</a></li><li><a href="${href("privacy")}">Поверителност</a></li><li><a href="${href("cookies")}">Бисквитки</a></li></ul></div>
      <div><h4>Контакт</h4><ul><li><a href="tel:${CONTACT.tel}">${CONTACT.phone}</a></li><li><a href="mailto:${CONTACT.email}">${CONTACT.email}</a></li><li><a href="${esc(CONTACT.viber)}" target="_blank" rel="noopener">Viber канал на Еду БЕЛ</a></li></ul></div>
    </div>
    <p class="sf-legal">© ${new Date().getFullYear()} ${esc(COMPANY)}</p>
  </div>
</footer>`,
);

const cartDlg = $("dialog.cart", host);
const menuDlg = $("dialog.smenu", host);
const badge = $(".cart-badge", host);

function openCart() {
  if (!cartDlg) return;
  render();
  if (menuDlg.open) menuDlg.close();
  if (!cartDlg.open) cartDlg.showModal();
}
// Clicks on the dimmed area outside the panel close a dialog.
if (cartDlg) {
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
}

function render() {
  if (!cartDlg) return;
  syncCombos();
  const n = count();
  badge.hidden = !n;
  badge.textContent = n;
  $(".cart-n", cartDlg).textContent = n ? `(${n})` : "";
  cartDlg.classList.toggle("is-empty", !n);
  const pkg = pkgOf();
  const p = pkg ? PACKAGES[pkg] : null;
  const sub = KEYS.reduce((s, k) => s + cart[k] * single(k).price, 0);
  const disc = p ? sub - p.price : 0;

  $(".cart-items", cartDlg).innerHTML = KEYS
    .filter((k) => cart[k])
    .map((k) => {
      const d = DECKS[k];
      const one = single(k);
      const room = n < MAX_DECKS;
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
        <div class="ci-price">${one.was > one.price ? `<s>${euro(cart[k] * one.was)}</s>` : ""}<b>${euro(cart[k] * one.price)}</b></div>
      </li>`;
    })
    .join("");

  // room for one more deck: offer the kinds not yet in the cart at the next price step
  const up = $(".cart-up", cartDlg);
  if (n && n < MAX_DECKS) {
    const extra = ladder(n + 1) - ladder(n);
    const one = single("lit").price;
    const what = n === 1 ? "второ" : "трето";
    const why = `Само ${euro(extra)} вместо ${euro(one)}${n + 1 >= FREE && n < FREE ? " + безплатна доставка" : n === 2 ? ` – трите за ${euro(ladder(3))}` : ""}`;
    up.innerHTML = KEYS.filter((k) => !cart[k])
      .map((k) => {
        const d = DECKS[k];
        return `<div class="up">
      <img src="${esc(MEDIA + d.img)}" alt="" loading="lazy">
      <div><p class="up-k">Добави ${what} тесте${d.isNew ? " · ново" : ""}</p><b>${esc(d.title)}</b><small>${why}</small></div>
      <button class="btn btn-dark btn-sm" type="button" data-up="${k}">+ ${euro(extra)}</button>
    </div>`;
      })
      .join("");
  } else up.innerHTML = "";

  const msg = $(".meter-msg", cartDlg);
  const bar = $(".meter span", cartDlg);
  const left = FREE - n;
  if (n >= FREE) {
    msg.innerHTML = `${ICON.check}<span><b>Доставката е безплатна.</b> Спестявате ${euro(disc)} от цената.${n < MAX_DECKS ? ` Трето тесте – само ${euro(ladder(3) - ladder(2))}.` : ""}</span>`;
    bar.style.width = "100%";
  } else if (n) {
    msg.innerHTML = `<span>Добавете още <b>${left === 1 ? "1 тесте" : `${left} тестета`}</b> – ${n === 1 ? `второто е за ${euro(ladder(2) - ladder(1))}` : `третото е за ${euro(ladder(3) - ladder(2))}`} и доставката става <b>безплатна</b>.</span>`;
    bar.style.width = `${Math.round((n / FREE) * 100)}%`;
  } else {
    msg.innerHTML = `<span>Безплатна доставка ${FREE_WORDS}. Три тестета – за ${euro(ladder(3))}.</span>`;
    bar.style.width = "0%";
  }
  $(".cart-meter", cartDlg).classList.toggle("done", n >= FREE);

  $(".s-sub", cartDlg).textContent = euro(sub);
  $(".s-disc-row", cartDlg).hidden = !(disc > 0);
  $(".s-disc-t", cartDlg).textContent = `Отстъпка за ${n} тестета`;
  $(".s-disc", cartDlg).textContent = `−${euro(disc)}`;
  $(".s-ship", cartDlg).textContent = n >= FREE ? "Безплатна" : `от ${euro(DELIVERY_FROM)}`;
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
// Only the block with the cart listens: a footer-only block on the same page would add twice.
if (cartDlg) document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-add], a[data-pkg]");
  if (!a || !PKG_CART[a.dataset.add || a.dataset.pkg]) return;
  e.preventDefault();
  add(a.dataset.add || a.dataset.pkg);
});

/* ---------- links between the store pages follow the settings ---------- */
for (const a of $$("[data-store]")) a.href = href(a.dataset.store, a.hash || "");

/* ---------- digital products: each button opens that product's own checkout ---------- */
const DIG = Object.fromEntries(Object.entries(CFG.DIGITAL).map(([k, d]) => {
  const price = SET.digital?.prices?.[k];
  return [k, { ...d, price: price > 0 ? Math.round(price * 100) : d.price, checkout: SET.digital?.checkout?.[k] || d.checkout }];
}));
for (const a of $$("[data-dig]")) if (DIG[a.dataset.dig]) a.href = DIG[a.dataset.dig].checkout;
for (const el of $$("[data-dig-price]")) if (DIG[el.dataset.digPrice]) el.textContent = euro(DIG[el.dataset.digPrice].price);

/* ---------- product page: gallery, package options, add / buy now ---------- */
for (const pdp of $$("[data-pdp]")) {
  const opts = $$('input[name="pkg"]', pdp);
  // each option shows its boxes; its "Безплатна доставка" flag follows the free-delivery threshold
  for (const o of opts) {
    const p = PACKAGES[o.value];
    const box = o.closest(".opt")?.querySelector(".opt-box");
    if (!p || !box) continue;
    if (!box.querySelector(".opt-img"))
      $(".opt-t", box)?.insertAdjacentHTML("beforebegin", `<span class="opt-img" data-n="${p.boxes.length}" aria-hidden="true">${p.boxes.map((b) => `<img src="${esc(MEDIA + DECKS[b].img)}" alt="" loading="lazy">`).join("")}</span>`);
    const flag = $(".opt-flag", box);
    if (flag && /доставка/i.test(flag.textContent) && !p.freeShip) flag.remove();
  }
  const picked = () => opts.find((o) => o.checked)?.value || opts[0]?.value;
  const buybar = $(".buybar");
  function update() {
    syncCombos();
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
    for (const el of $$("[data-pdp-ship]", pdp)) el.innerHTML = p.freeShip ? `${ICON.truck}<b>Безплатна доставка</b> с този комплект` : `${ICON.truck}Доставка от ${euro(DELIVERY_FROM)} · <b>безплатна</b> ${FREE_WORDS}`;
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
