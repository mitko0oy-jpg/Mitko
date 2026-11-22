/* ===== Здравец Натура — логика на сайта в ConvertBuilder =====
   Количката и поръчката са тези на магазина в ConvertBuilder (WebPlatform.Store):
   бутоните добавят продукта там и водят към страницата с поръчката (CONFIG.links.checkout). */

const ROOT = (document.currentScript && document.currentScript.previousElementSibling) || document.getElementById('znl');
if (!ROOT || ROOT.dataset.znOn) return;
ROOT.dataset.znOn = '1';

/* ---------- helpers ---------- */
const $ = (s, r = ROOT) => r.querySelector(s);
const $$ = (s, r = ROOT) => [...r.querySelectorAll(s)];
const fmt = n => n.toFixed(2).replace('.', ',') + ' €';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = id => PRODUCTS.find(p => p.id === id);
// стари адреси на продукти (?p=…) → новия номер; пластирите за стави бяха с бранд в адреса
const PID_ALIAS = { sumifun: 'plastiri' };
const B = id => BUNDLES.find(b => b.id === id);
const L = CONFIG.links;
// всеки продукт е на своя страница (PRODUCT_PAGES в data.js); без такава – общата /produkt?p=
const productUrl = id => PRODUCT_PAGES[id] ? `/${PRODUCT_PAGES[id]}` : `${L.product}?p=${id}`;
const productFromPath = () => { const path = location.pathname.replace(/\/+$/, '').slice(1); const id = Object.keys(PRODUCT_PAGES).find(k => PRODUCT_PAGES[k] === path); return id ? P(id) : null; };
const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const page = ROOT.dataset.page || '';
const BF_END = new Date(CONFIG.bf.end).getTime();
const bfOn = () => CONFIG.bf.active && Date.now() < BF_END;
const FREE_FROM = CONFIG.freeOfficeShippingFrom || 0;
const freeShipFor = price => FREE_FROM > 0 && price >= FREE_FROM;
const SHIP_FROM = Math.min(...CONFIG.shipping.filter(m => m.office).map(m => m.price));
const GIFT_TEXT = '12 пластира подарък';
// подаръкът (тъмните пластири за стави) се продава и отделно – стойността му се показва задраскана до подаръка
const GIFT_VALUE = (PRODUCTS.find(x => x.id === 'plastiri') || {}).price || 0;
const giftWas = (n = 1) => GIFT_VALUE ? ` <s class="gift-was">${fmt(GIFT_VALUE * n)}</s>` : '';
// колко пакета пластири са подаръкът: обикновено 1, а към 5-те гела – 3 пакета (36 пластира) – `gift` в BUNDLES
const giftPacks = b => ((b && b.gift) || []).reduce((s, [, n]) => s + n, 0);
const GIFT_PACKS = {};
BUNDLES.forEach(b => { if (giftPacks(b) > 1) GIFT_PACKS[b.store] = giftPacks(b); });
const giftPacksFor = store => GIFT_PACKS[store] || 1;
const giftLabel = n => n > 1 ? `${n} пакета пластири за стави (${12 * n} бр.)` : '12 пластира за стави и мускули';
const BF_STORE_IDS = BUNDLES.filter(b => b.bf !== false).map(b => b.store);

/* ---------- font size (за по-лесно четене) ---------- */
const FS = ['', 'fs-l', 'fs-xl'];
function applyFs(i) {
  document.querySelectorAll('.zn-root').forEach(r => { r.classList.remove('fs-l', 'fs-xl'); if (FS[i]) r.classList.add(FS[i]); });
  local.set('zn_fs', i);
}
applyFs(local.get('zn_fs', 0));

/* ---------- Microsoft Clarity: записи на посещенията и топлинни карти ----------
   Зарежда се веднъж на страница (и при няколко блока). Без банер за бисквитки Clarity работи за посетителите
   от ЕС без бисквитки: всяка отворена страница е отделен запис. Написаното в полетата Clarity не записва. */
(function clarityTag() {
  const id = CONFIG.clarity;
  if (!id || window.__znClarity) return;
  window.__znClarity = 1;
  if (typeof window.clarity === 'function') return; // вече е сложен (напр. в настройките на сайта)
  try {
    window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.clarity.ms/tag/' + id;
    document.head.appendChild(s);
  } catch (e) {}
})();
// събитие в Clarity – по него се филтрират записите (напр. „кой е добавил в количката“)
function mark(ev) { try { if (window.clarity) window.clarity('event', ev); } catch (e) {} }

const CLARITY_EVENTS = { ViewContent: 'product_view', InitiateCheckout: 'checkout' };
function track(ev, data) {
  try { if (window.fbq) window.fbq('track', ev, data || {}); } catch (e) {}
  if (CLARITY_EVENTS[ev]) mark(CLARITY_EVENTS[ev]);
}

/* ---------- магазинът на ConvertBuilder ---------- */
const W = () => window.WebPlatform;
const cbReady = () => { const w = W(); return !!(w && w.Store && w.Store.Orders && w.makeClientWebsiteRequest); };
function req(action, data) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 15000);
    const fail = e => { clearTimeout(timer); reject(e || new Error(action)); };
    try {
      W().makeClientWebsiteRequest({ action, data, onOk: r => { clearTimeout(timer); resolve(r); }, onError: fail, onFail: fail });
    } catch (e) { fail(e); }
  });
}
function setOrder(order) {
  const S = W().Store;
  S.Orders.set('cart', order);
  try { S.updateCartNumber(order.size || 0, false); } catch (e) {}
  try { W().Events.trigger(document, W().Events.ORDER_CHANGED, { id: 'cart', order }); } catch (e) {}
  updateCount(order);
  return order;
}
const Cart = {
  get() {
    return new Promise(resolve => {
      if (!cbReady()) return resolve({ items: [] });
      const timer = setTimeout(() => resolve({ items: [] }), 10000);
      try { W().Store.Orders.get('cart', o => { clearTimeout(timer); resolve(o || { items: [] }); }); } catch (e) { clearTimeout(timer); resolve({ items: [] }); }
    });
  },
  // quiet = смяна на цената от сайта (½ цена): без събития към пиксела
  async add(storeId, qty = 1, quiet = false) {
    const r = await req('getStoreProduct', { id: storeId });
    const p = r.data;
    const option = { productId: p.id, quantity: qty, combination: -1, variation: [], price: p.onSale ? p.salePrice : p.price };
    const r2 = await req('addToCart', { orderId: 'cart', option: JSON.stringify(option), process: 'cart' });
    if (!quiet) try { W().Store.reportAddToCart(r2.uid, p, option, W().Store.currency); } catch (e) {}
    return setOrder(r2.data);
  },
  async remove(storeId, quiet = false) {
    const o = await Cart.get();
    const index = (o.items || []).findIndex(i => i.productId === storeId);
    if (index < 0) return o;
    const r = await req('updateCart', { orderId: 'cart', products: '[]', type: 'remove', index });
    if (!quiet) try { W().Store.reportRemoveFromCart(o.items[index], W().Store.currency); } catch (e) {}
    return setOrder(r.data);
  }
};
const isGift = i => i.productId === CONFIG.giftStoreId;
const countOf = o => (o.items || []).filter(i => !isGift(i) && !inComboOf(i.productId)).reduce((s, i) => s + (i.quantity || 1), 0);

// По време на Черния петък подаръкът върви с поръчка от GIFT_FROM (3) и повече броя общо:
// 3 гела, 3 кутии, 5 гела, „Грижа за тялото“ (3 продукта) или 3 отделни продукта (без уелнес пластирите).
// 2 броя (напр. 2 гела) са без подарък.
const GIFT_FROM = CONFIG.giftFrom || 3;
const STORE_UNITS = {};
Object.values(PACKS).forEach(l => l.forEach(k => {
  const b = k.bundle ? B(k.bundle) : null;
  const m = /^(\d+)/.exec(k.label);
  STORE_UNITS[k.store] = b ? b.items.reduce((s, [, n]) => s + n, 0) : (m ? +m[1] : 1);
}));
BUNDLES.forEach(b => { STORE_UNITS[b.store] = b.items.reduce((s, [, n]) => s + n, 0); }); // „Грижа за тялото“ = 3
PATCH_COMBOS.forEach(c => { if (c.store) STORE_UNITS[c.store] = c.n });
const unitsOf = store => STORE_UNITS[store] || 1;
const IN_COMBO_STORES = Object.values(PATCH_IN_COMBO);
// уелнес пластирите имат свой подарък (кутия към комплекта от 3) – не носят пластирите за стави
const WELL_STORES = PRODUCTS.filter(p => p.wellness).map(p => p.store).concat(PATCH_COMBOS.map(c => c.store).filter(Boolean), IN_COMBO_STORES);
function giftEarned(items) {
  const real = (items || []).filter(i => !isGift(i) && !WELL_STORES.includes(i.productId));
  return real.reduce((n, i) => n + unitsOf(i.productId) * (i.quantity || 1), 0) >= GIFT_FROM;
}
// колко пакета подарък да има в количката: най-големият подарък сред комплектите в нея (5 гела → 3 пакета)
function giftQty(items) {
  return Math.max(1, ...(items || []).filter(i => !isGift(i)).map(i => GIFT_PACKS[i.productId] || 0));
}
/* ---------- „½ цена“: при поръчка над HALF_FROM всеки следващ продукт е на половин цена ----------
   Единичните продукти от HALF са „гъвкави“ бройки: на пълна цена остава най-евтиният набор от тях, с който
   поръчката минава прага, а всички останали бройки отиват на половин цена (скритите продукти в магазина).
   Всичко друго (комплекти, бъмп оферти, уелнес пластири) се брои към прага със своята цена.             */
const HALF_FROM = CONFIG.halfFrom || 0;
const HALF_OF = {}, HALF_REG = {}; // ½ цена → редовен номер; редовен номер → ½ цена
Object.keys(typeof HALF === 'object' ? HALF : {}).forEach(id => { const p = P(id); if (p && HALF[id]) { HALF_OF[HALF[id]] = p.store; HALF_REG[p.store] = HALF[id]; } });
const halfOn = () => HALF_FROM > 0 && Object.keys(HALF_OF).length > 0;
const isHalf = i => !!HALF_OF[i.productId];
const halfPriceOf = p => Math.round(p.price * 50) / 100;
const regProduct = store => PRODUCTS.find(x => x.store === store);
const EPS = 0.005;
function halfPlan(items) {
  const real = (items || []).filter(i => !isGift(i) && !IN_COMBO_STORES.includes(i.productId));
  let fixed = 0;
  const units = [];
  real.forEach(i => {
    const reg = HALF_OF[i.productId] || (HALF_REG[i.productId] ? i.productId : 0);
    if (reg) { const p = regProduct(reg); for (let k = 0; k < (i.quantity || 1); k++) units.push({ reg, price: p.price }); }
    else fixed += +i.price || 0;
  });
  const all = units.reduce((s, u) => s + u.price, 0);
  const unlocked = halfOn() && fixed + all >= HALF_FROM - EPS;
  const need = HALF_FROM - fixed - EPS;
  let keep = units.map(() => true);
  if (unlocked) {
    if (need <= 0) keep = units.map(() => false);
    else if (units.length <= 14) {
      let best = 0, bestSum = Infinity;
      for (let m = 1; m < (1 << units.length); m++) {
        let s = 0;
        for (let k = 0; k < units.length; k++) if (m & (1 << k)) s += units[k].price;
        if (s >= need && s < bestSum - 0.001) { best = m; bestSum = s; }
      }
      keep = units.map((u, k) => !!(best & (1 << k)));
    } else {
      // много бройки: най-скъпите остават на пълна цена, докато поръчката стигне прага
      const order = units.map((u, k) => k).sort((a, b) => units[b].price - units[a].price);
      keep = units.map(() => false);
      let s = 0;
      for (const k of order) { if (s >= need) break; keep[k] = true; s += units[k].price; }
    }
  }
  const want = {}; // редовен номер → колко бройки на пълна и колко на половин цена
  units.forEach((u, k) => { const w = want[u.reg] = want[u.reg] || { full: 0, half: 0 }; if (keep[k]) w.full++; else w.half++; });
  const saved = units.reduce((s, u, k) => s + (keep[k] ? 0 : u.price - halfPriceOf(regProduct(u.reg))), 0);
  return { want, unlocked, saved, left: unlocked ? 0 : Math.max(0, HALF_FROM - fixed - all) };
}
// бележка в количката, когато поръчката падне под прага и сайтът върне редовната цена
let halfNote = '';
async function syncHalf() {
  if (!cbReady() || !Object.keys(HALF_OF).length) return false;
  const items = (await Cart.get()).items || [];
  const plan = halfPlan(items);
  const had = items.some(isHalf);
  const qtyOf = id => { const i = items.find(x => x.productId === id); return i ? (i.quantity || 1) : 0; };
  let changed = false;
  for (const reg of Object.keys(plan.want).map(Number)) {
    const w = plan.want[reg], hs = HALF_REG[reg];
    const full = qtyOf(reg), half = qtyOf(hs);
    if (full !== w.full) { changed = true; if (full) await Cart.remove(reg, true); if (w.full) await Cart.add(reg, w.full, true); }
    if (half !== w.half) { changed = true; if (half) await Cart.remove(hs, true); if (w.half) await Cart.add(hs, w.half, true); }
  }
  if (had && !plan.unlocked) halfNote = `Поръчката вече е под ${fmt(HALF_FROM)}, затова върнахме редовната цена. Добави още ${fmt(plan.left)} и пак получаваш половин цена.`;
  else if (plan.unlocked || !Object.keys(plan.want).length) halfNote = '';
  return changed;
}
// текстът над количката: колко остава до безплатната доставка и половин цена
function dealsMsg(items) {
  const sub = (items || []).filter(i => !isGift(i)).reduce((s, i) => s + (+i.price || 0), 0);
  const plan = halfPlan(items);
  if (!halfOn()) {
    if (!FREE_FROM) return null;
    const left = Math.max(0, FREE_FROM - sub);
    return { done: !left, pct: Math.min(100, Math.round(sub / FREE_FROM * 100)), text: left ? `Още <b>${fmt(left)}</b> до <b>безплатна доставка</b> до офис` : '<b>Доставката до офис е безплатна!</b>' };
  }
  const shipFree = FREE_FROM && sub >= FREE_FROM - EPS;
  const same = FREE_FROM && Math.abs(FREE_FROM - HALF_FROM) < 0.01;
  const pct = plan.unlocked ? 100 : Math.min(100, Math.round((HALF_FROM - plan.left) / HALF_FROM * 100));
  let text;
  if (plan.unlocked) text = `${shipFree ? '<b>Доставката до офис е безплатна</b>, а ' : ''}<b>всеки следващ продукт е на половин цена</b>${plan.saved > EPS ? ` · спестяваш <b>${fmt(plan.saved)}</b>` : ''}`;
  else if (same) text = `Още <b>${fmt(plan.left)}</b> до <b>безплатна доставка</b> и <b>½ цена</b> на следващия продукт`;
  else text = `${FREE_FROM && !shipFree ? `Още <b>${fmt(FREE_FROM - sub)}</b> до <b>безплатна доставка</b>. ` : ''}Още <b>${fmt(plan.left)}</b> до <b>½ цена</b> на следващия продукт`;
  return { done: plan.unlocked, pct, text, plan };
}
// продуктите, които да предложим на половин цена: първо подходящите за поръчката, после останалите
function halfOffers(items) {
  if (!halfPlan(items).unlocked) return [];
  const first = (typeof recs === 'function' ? recs(items) : []).filter(p => HALF[p.id]);
  const inCart = (items || []).map(i => i.productId);
  const giftIn = bfOn() && (items || []).some(isGift);
  const rest = PRODUCTS.filter(p => HALF[p.id] && !first.includes(p) && !inCart.includes(p.store) && !inCart.includes(HALF[p.id]) && !BUMPS.some(b => b.id === p.id && inCart.includes(b.store)));
  return first.concat(rest).filter(p => !(giftIn && p.id === 'plastiri'));
}

// syncGift се вика от много места (бутони, формата, таймер): изпълнява се едно след друго, за да не се
// разминат две смени на количката (иначе ½ цена може да се добави два пъти)
let syncChain = Promise.resolve();
function syncGift() { const run = syncChain.then(syncGiftNow, syncGiftNow); syncChain = run.catch(() => {}); return run; }
async function syncGiftNow() {
  await syncHalf();
  if (!CONFIG.giftStoreId || !cbReady()) return;
  const o = await Cart.get();
  const items = o.items || [];
  const gift = items.find(isGift), others = giftEarned(items), need = giftQty(items);
  if (bfOn() && others && !gift) await Cart.add(CONFIG.giftStoreId, need);
  else if (gift && (!others || !bfOn())) await Cart.remove(CONFIG.giftStoreId);
  else if (gift && (gift.quantity || 1) !== need) { await Cart.remove(CONFIG.giftStoreId); await Cart.add(CONFIG.giftStoreId, need); }
}

let countNow = 0;
function updateCount(o) {
  if (o) countNow = countOf(o);
  $$('[data-cart-count]').forEach(el => { el.textContent = countNow; el.classList.toggle('is-zero', !countNow); });
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, bad) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); ROOT.appendChild(t); }
  t.innerHTML = bad
    ? `<span>${esc(msg)}</span><a href="tel:${CONFIG.phoneHref}">${CONFIG.phone}</a>`
    : `<span>✓ ${esc(msg)}</span><a href="${L.checkout}">Към поръчката →</a>`;
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), bad ? 8000 : 4500);
}

/* ---------- добавяне в количката ---------- */
let busy = false;
async function addFlow({ store, qty = 1, go = false, btn = null, value = 0, contentId = '', bf = false, extra = [] }) {
  if (busy || !store) return;
  // без магазина на страницата: поръчката го добавя сама (?add=)
  if (!cbReady()) { location.href = `${L.checkout}?add=${store}&q=${qty}`; return; }
  busy = true;
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.classList.add('loading'); btn.innerHTML = 'Добавяме…'; }
  try {
    let skip = false;
    if (bf) {
      // един комплект от Черния петък в поръчката: новият заменя стария, същият не се добавя втори път
      const o = await Cart.get();
      skip = (o.items || []).some(i => i.productId === store);
      for (const it of (o.items || []).filter(i => BF_STORE_IDS.includes(i.productId) && i.productId !== store)) await Cart.remove(it.productId);
    }
    if (!skip) await Cart.add(store, qty);
    for (const x of extra) await Cart.add(x, 1);
    mark('add_to_cart');
    await syncGift();
    if (go) { location.href = L.checkout; return; }
    busy = false;
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = label; }
    openCart();
    return;
  } catch (e) {
    toast('Не успяхме да добавим продукта. Опитай пак или поръчай по телефона:', true);
  }
  busy = false;
  if (btn) { btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = label; }
}

// „Поотделно“: продуктите по редовна цена + подаръкът (пластирите се продават отделно) + доставката, ако е безплатна
function separateParts(b) {
  const items = b.items.reduce((s, [id, q]) => s + P(id).price * q, 0);
  const gift = bfOn() && b.gift && b.gift.length ? GIFT_VALUE * giftPacks(b) : 0;
  const ship = b.freeShip && freeShipFor(b.price) ? SHIP_FROM : 0;
  return { items, gift, ship, total: items + gift + ship };
}
function separateValue(b) { return separateParts(b).total; }

/* ---------- countdown ---------- */
function tickCountdowns() {
  const left = Math.max(0, BF_END - Date.now());
  const d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60, s = Math.floor(left / 1e3) % 60;
  const pad = n => String(n).padStart(2, '0');
  $$('[data-countdown]').forEach(el => {
    el.innerHTML = `<div class="u"><b>${d}</b><span>дни</span></div><div class="u"><b>${pad(h)}</b><span>часа</span></div><div class="u"><b>${pad(m)}</b><span>мин.</span></div><div class="u"><b>${pad(s)}</b><span>сек.</span></div>`;
  });
  $$('[data-cd-mini]').forEach(el => { el.textContent = `${d} д ${pad(h)}:${pad(m)}:${pad(s)}`; });
}

/* ---------- header / footer ---------- */
function renderHeader() {
  const h = $('[data-zn-header]');
  if (h) shopHeader(h);
}

function renderFooter() {
  const f = $('[data-zn-footer]');
  if (!f) return;
  f.innerHTML = `
  <section class="sp-perks" aria-label="Защо да поръчаш от нас"><div class="wrap sp-perks__in">
    <div><span>💶</span><b>Плащаш при получаване</b><small>Без карта и без предплащане</small></div>
    <div><span>🚚</span><b>Доставка 1–2 работни дни</b><small>Еконт и Спиди${FREE_FROM ? ` · безплатно над ${fmt(FREE_FROM)}` : ''}</small></div>
    <div><span>🛡️</span><b>${CONFIG.guaranteeDays} дни гаранция</b><small>Не си доволен – връщаме парите</small></div>
    <div><span>📞</span><b>Обади се денонощно</b><small>${CONFIG.phone} · без почивен ден. Отговаря ${esc(CONFIG.phoneBot)} – приема поръчки и проверява поръчка.</small></div>
  </div></section>
  <footer class="sp-footer"><div class="wrap">
    <div class="sp-footer__cols">
      <div class="sp-footer__brand"><a class="sp-footer__logo" href="${L.home}"><img src="${LIFESTYLE.logo}" alt="Здравец Натура" width="170" height="73"></a>
        <p>Натурална козметика и пластири с пчелна отрова и билки – за ставите, кожата и уморените крака. 🇧🇬 Произведено за България.</p>
        <a class="sp-footer__phone" href="tel:${CONFIG.phoneHref}">📞 ${CONFIG.phone}</a><small>${esc(CONFIG.hours)}</small></div>
      <div><h4>Магазин</h4><ul>${CATEGORIES.map(c => `<li><a href="${L.products}?cat=${c.id}">${esc(c.name)}</a></li>`).join('')}<li><a href="${L.products}">Всички продукти</a></li>${bfOn() ? `<li><a href="${L.bf}">★ Черен петък</a></li>` : ''}</ul></div>
      <div><h4>Помощ</h4><ul><li><a href="${L.delivery}">Доставка и плащане</a></li><li><a href="${L.delivery}#vrashtane">Връщане и гаранция</a></li><li><a href="${L.contacts}">Контакти</a></li><li><a href="${L.terms}">Общи условия</a></li><li><a href="${L.privacy}">Поверителност</a></li><li><a href="https://kzp.bg" rel="noopener">КЗП</a></li></ul></div>
      <div><h4>Най-поръчвани</h4><ul>${PRODUCTS.filter(p => p.bestseller).slice(0, 5).map(p => `<li><a href="${productUrl(p.id)}">${esc(p.shortName)}</a></li>`).join('')}</ul></div>
    </div>
    <div class="sp-footer__pay"><span>💶 Наложен платеж</span><span>📦 Еконт</span><span>📦 Спиди</span><span>🔒 Без данни за карта</span></div>
    <div class="sp-footer__legal">
      <p><a href="mailto:${CONFIG.email}">${CONFIG.email}</a> · <a href="${L.terms}">Данни за търговеца – в Общите условия</a> · Надзорен орган: Комисия за защита на потребителите.</p>
      <p>Продуктите на този сайт не са лекарства и не са предназначени за диагностика, лечение или профилактика на заболявания. Гелът, кремовете и спреевете са козметични продукти по смисъла на Регламент (ЕО) № 1223/2009. При здравословен проблем се консултирайте с лекар или фармацевт. Индивидуалното усещане може да се различава.</p>
      <p>© ${new Date().getFullYear()} Здравец Натура</p>
    </div>
  </div></footer>`;
}

function renderMobileBar() {
  if (!ROOT.hasAttribute('data-mbar') || $('.mbar')) return;
  const mb = document.createElement('div');
  mb.className = 'mbar';
  mb.innerHTML = `<a class="btn btn-outline" href="tel:${CONFIG.phoneHref}">📞 Обади се</a><a class="btn btn-primary" data-mbar-go href="${bfOn() ? L.bf + '#oferti' : L.products}"><span>🛒 Поръчай</span></a>`;
  ROOT.appendChild(mb);
}
function refreshMobileBar() {
  const go = $('[data-mbar-go]');
  if (!go) return;
  if (countNow) { go.href = L.checkout; go.innerHTML = `<span>🛒 Поръчка (<b data-cart-count>${countNow}</b>)</span>`; }
}

/* ---------- components ---------- */
function productCard(p) { return shopCard(p); }

function bundleCard(b) {
  const sep = separateValue(b), save = sep - b.price;
  const free = b.freeShip && freeShipFor(b.price);
  const img = b.collage
    ? `<div class="collage ${b.collage.length === 2 ? 'two' : ''}">${b.collage.map(([src, alt]) => `<img src="${src}" alt="${esc(alt)}" loading="lazy">`).join('')}</div>`
    : `<img src="${b.img}" alt="${esc(b.title)}" loading="lazy">`;
  const ribbon = b.featured ? '<div class="ribbon">★ Най-избиран</div>' : (free ? '<div class="ribbon green">Безплатна доставка</div>' : '');
  return `<div class="offer ${b.featured ? 'featured' : ''}">
    ${ribbon}
    <div class="tier">${esc(b.tier)}</div>
    <h3>${esc(b.title)}</h3>
    <div class="oimg">${img}</div>
    <div class="contents">${esc(b.line)}</div>
    ${bfOn() && b.gift && b.gift.length ? `<div class="gift">🎁 Подарък: ${giftLabel(giftPacks(b))}${giftWas(giftPacks(b))}</div>` : ''}
    <div class="pricebox">${b.prev && bfOn() ? `<span class="bf-blink">Черен петък</span> <span class="xprice">${fmt(b.prev)}</span> ` : ''}<span class="now">${fmt(b.price)}</span><span class="per">${esc(b.perUnit)}</span></div>
    <div class="ship ${free ? 'free' : ''}">${free ? '🚚 Безплатна доставка до офис' : `+ доставка от ${fmt(SHIP_FROM)} до офис`}</div>
    <div class="compare">Поотделно: ${(sp => [`продуктите ${fmt(sp.items)}`, sp.gift ? `пластирите ${fmt(sp.gift)}` : '', sp.ship ? `доставка ${fmt(sp.ship)}` : ''].filter(Boolean).join(' + ') + (sp.gift || sp.ship ? ` = ${fmt(sp.total)}` : ''))(separateParts(b))} · <b>спестяваш ${fmt(save)}</b></div>
    <div class="note">${esc(b.note)}</div>
    <button class="btn ${b.featured ? 'btn-primary' : 'btn-green'} btn-block btn-lg" type="button" data-bundle="${b.id}">Избирам ${b.id === 'trio' ? 'комплекта' : esc(b.title.replace(' за стави', ''))} →</button>
  </div>`;
}

function reviewCard(r) {
  return `<div class="review"><div class="stars" aria-label="5 от 5">★★★★★</div><p>„${esc(r.text)}“</p>
    <div class="who"><div class="av">${esc(r.name[0])}</div><div><b>${esc(r.name)}</b><span>${esc(r.city)} · ${esc(r.product)}</span><br><span class="verified">✓ Потвърдена поръчка</span></div></div></div>`;
}

function bindAddButtons(root = ROOT) {
  const fresh = el => { if (el.dataset.bound) return false; el.dataset.bound = '1'; return true; };
  $$('[data-add]', root).filter(fresh).forEach(b => b.addEventListener('click', () => {
    const p = P(b.dataset.add);
    addFlow({ store: p.store, qty: 1, btn: b, value: p.price, contentId: p.id });
  }));
  // „Добави на половин цена“ (количката и поръчката): скритият продукт с ½ цена; syncHalf проверява прага
  $$('[data-add-half]', root).filter(fresh).forEach(b => b.addEventListener('click', () => {
    const p = P(b.dataset.addHalf);
    addFlow({ store: HALF[p.id], qty: 1, btn: b, value: halfPriceOf(p), contentId: p.id });
  }));
  $$('[data-bundle]', root).filter(fresh).forEach(b => b.addEventListener('click', () => {
    const x = B(b.dataset.bundle);
    addFlow({ store: x.store, qty: 1, go: true, btn: b, value: x.price, contentId: x.id, bf: x.bf !== false });
  }));
}

/* ---------- pages ---------- */
function renderHome() {
  const best = PRODUCTS.filter(p => p.bestseller).slice(0, 4);
  const el = $('#bestsellers'); if (el) el.innerHTML = best.map(productCard).join('');
  const cats = $('#cats'); if (cats) cats.innerHTML = CATEGORIES.map(c => `<a class="card catcard" href="${L.products}?cat=${c.id}"><img src="${c.img}" alt="" loading="lazy"><div><h3>${c.name}</h3><p>${c.desc}</p><span class="go">Разгледай →</span></div></a>`).join('');
  const rv = $('#reviews'); if (rv) rv.innerHTML = REVIEWS.slice(0, 3).map(reviewCard).join('');
  const bfb = $('#bf-band'); if (bfb && !bfOn()) bfb.remove();
  const bfc = $('#bf-card'); if (bfc) bfc.innerHTML = bundleCard(B('bf3'));
}

function renderBF() {
  if (!bfOn()) { const o = $('#bf-ended'); if (o) o.hidden = false; }
  const o = $('#offers'); if (o) o.innerHTML = BUNDLES.filter(b => b.bf !== false).map(bundleCard).join('');
  const rv = $('#reviews'); if (rv) rv.innerHTML = REVIEWS.map(reviewCard).join('');
  track('ViewContent', { content_ids: ['bf5'], content_type: 'product', value: B('bf5').price, currency: 'EUR' });
}

function renderProducts() {
  const q = new URLSearchParams(location.search);
  // ?zone= идва от зоните на началната страница (ZONES в landing-data.js)
  const zone = ZONES.find(z => z.id === q.get('zone')); // landing-data.js е на всяка страница
  let cat = zone ? 'zone' : q.get('cat') || 'all', sort = 'pop';
  const term = (q.get('q') || '').trim().toLowerCase();
  const chips = $('#chips'), grid = $('#grid');
  const order = PRODUCTS.map((p, i) => [p, i]);
  const draw = () => {
    chips.innerHTML = (zone ? [['zone', zone.name]] : []).concat([['all', 'Всички']], CATEGORIES.map(c => [c.id, c.name])).map(([id, n]) => `<button class="${cat === id ? 'on' : ''}" data-cat="${id}" type="button" role="tab" aria-selected="${cat === id}">${n}</button>`).join('');
    let list = order.filter(([p]) => (cat === 'all' || (cat === 'zone' ? zone.ids.includes(p.id) : p.cat === cat)) && (!term || [p.name, p.short].join(' ').toLowerCase().includes(term)));
    if (sort === 'pop' && cat === 'zone') list.sort((a, b) => zone.ids.indexOf(a[0].id) - zone.ids.indexOf(b[0].id));
    else if (sort === 'pop') list.sort((a, b) => ((b[0].bestseller ? 1 : 0) - (a[0].bestseller ? 1 : 0)) || a[1] - b[1]);
    if (sort === 'asc') list.sort((a, b) => fromPrice(a[0]) - fromPrice(b[0]));
    if (sort === 'desc') list.sort((a, b) => fromPrice(b[0]) - fromPrice(a[0]));
    grid.innerHTML = list.map(([p]) => productCard(p)).join('');
    $('#found').textContent = `${list.length} ${list.length === 1 ? 'продукт' : 'продукта'}`;
    $$('[data-cat]', chips).forEach(b => b.addEventListener('click', () => { cat = b.dataset.cat; history.replaceState(null, '', cat === 'zone' ? `${L.products}?zone=${zone.id}` : cat === 'all' ? L.products : `${L.products}?cat=${cat}`); draw(); }));
    bindAddButtons(grid);
    const c = CATEGORIES.find(x => x.id === cat);
    const zn = cat === 'zone';
    $('#cat-title').textContent = term ? `Търсене: „${q.get('q')}“` : zn ? zone.name : c ? c.name : 'Всички продукти';
    $('#crumb').textContent = zn ? zone.name : c ? c.name : 'Продукти';
    $('#cat-desc').textContent = zn ? `${zone.sub}. Първият е най-поръчваният. Плащаш при получаване.` : c ? c.desc + '. Плащаш при получаване.' : 'Натурална козметика и пластири с пчелна отрова и билки. Плащаш при получаване.';
  };
  $('#sort').addEventListener('change', e => { sort = e.target.value; draw(); });
  draw();
}

function renderProduct() {
  const q = new URLSearchParams(location.search);
  const p = P(PID_ALIAS[q.get('p')] || q.get('p')) || productFromPath() || P('gel');
  document.title = `${p.name} | Здравец Натура`;
  // дългата страница в стила на beeevenom.eu (landing.js)
  if (renderLanding) {
    renderLanding(p);
    track('ViewContent', { content_ids: [p.id], content_type: 'product', value: p.price, currency: 'EUR' });
    return;
  }
  const cat = CATEGORIES.find(c => c.id === p.cat);
  const imgs = [p.img].concat(p.gallery || []);
  const packs = p.packs ? PACKS[p.packs] : null;
  const gift = bfOn() && p.packs === 'gel';
  let sel = packs ? (packs.find(x => x.featured) || packs[0]).key : null;
  const root = $('#product');
  root.innerHTML = `
    <div class="breadcrumbs"><a href="${L.home}">Начало</a> › <a href="${L.products}?cat=${cat.id}">${cat.name}</a> › ${esc(p.shortName)}</div>
    <div class="pp">
      <div class="gallery">
        <div class="main"><img id="mainimg" src="${imgs[0]}" alt="${esc(p.name)}"></div>
        ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((s, i) => `<button type="button" class="${i ? '' : 'on'}" data-img="${s}" aria-label="Снимка ${i + 1}"><img src="${s}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      </div>
      <div class="pinfo">
        ${p.id === 'gel' && bfOn() ? '<span class="tag dark static">★ Черен петък до 30 ноември</span>' : ''}
        <h1>${esc(p.name)}</h1>
        <div class="size">${esc(p.size)}</div>
        <p class="lead">${esc(p.short)}</p>
        <ul class="checks">${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        ${packs ? `<div class="packs" role="radiogroup" aria-label="Избери количество">${packs.map(k => {
            const free = k.bundle && B(k.bundle).freeShip && freeShipFor(k.price);
            const sub = [k.sub, free ? 'безплатна доставка до офис' : ''].filter(Boolean).join(' · ');
            return `
          <label class="pack ${k.key === sel ? 'on' : ''}">${k.featured ? '<span class="flag">Най-избиран</span>' : ''}
            <input type="radio" name="pack" value="${k.key}" ${k.key === sel ? 'checked' : ''}>
            <span class="pl"><b>${esc(k.label)}${gift && unitsOf(k.store) >= GIFT_FROM ? ' + ' + GIFT_TEXT : ''}</b><span>${esc(sub)}</span></span>
            <span class="pp-price">${fmt(k.price)}</span></label>`; }).join('')}</div>`
          : `<div class="buyrow"><span class="price big">${fmt(p.price)}</span>
             <div class="qty"><button type="button" data-q="-1" aria-label="По-малко">−</button><input id="qty" type="number" min="1" max="20" value="1" aria-label="Количество"><button type="button" data-q="1" aria-label="Повече">+</button></div></div>`}
        ${bfOn() && !gift ? `<div class="gift">🎁 Подарък при ${GIFT_FROM} и повече броя до 30 ноември: ${GIFT_TEXT.replace(' подарък', '')}</div>` : ''}
        <div class="buybox">
          <button class="btn btn-primary btn-lg btn-block" id="buynow" type="button">Купи сега — плащаш при получаване</button>
          <button class="btn btn-outline btn-block" id="addcart" type="button">Добави в количката</button>
        </div>
        <div class="mini-trust"><div>💶 Плащане при доставка</div><div>🚚 1–2 работни дни</div><div>🛡️ ${CONFIG.guaranteeDays} дни гаранция</div><div>🇧🇬 Произведено за България</div><div>📞 ${CONFIG.phone} · поръчка по телефона</div></div>
      </div>
    </div>
    <div class="ptabs narrow">
      <h2>Съставки</h2>
      <div class="ingr-list">${p.ingredients.map(([n, d]) => `<div><b>${esc(n)}</b> — ${esc(d)}</div>`).join('')}<div>Пълният състав е на опаковката.</div></div>
      <h2>Как се използва</h2><p>${esc(p.usage)}</p>
      <h2>Важно</h2>
      ${p.wellness ? `<div class="warn">Не е лекарство и не замества лечението или разнообразното хранене. Не поставяй върху наранена или раздразнена кожа. При заболяване, прием на лекарства, бременност или кърмене се посъветвай с лекар преди употреба. Не е подходящ за деца. Съхранявай далеч от деца.</div>` : `<div class="warn">Само за външна употреба. Не нанасяй върху наранена или раздразнена кожа и избягвай контакт с очите. ${/пчелна отрова/i.test(p.name + p.short) ? '<b>Не използвай при алергия към пчелни продукти (ужилвания, мед, прополис).</b> ' : ''}Преди първата употреба направи тест на малък участък кожа. При бременност, кърмене или здравословен проблем се консултирай с лекар. Съхранявай далеч от деца.</div>`}
    </div>`;
  $$('[data-img]', root).forEach(b => b.addEventListener('click', () => { $('#mainimg').src = b.dataset.img; $$('[data-img]', root).forEach(x => x.classList.toggle('on', x === b)); }));
  $$('input[name=pack]', root).forEach(r => r.addEventListener('change', () => { sel = r.value; $$('.pack', root).forEach(l => l.classList.toggle('on', $('input', l).checked)); }));
  $$('[data-q]', root).forEach(b => b.addEventListener('click', () => { const i = $('#qty'); i.value = Math.max(1, Math.min(20, (+i.value || 1) + +b.dataset.q)); }));
  const doAdd = (go, btn) => {
    if (packs) {
      const k = packs.find(x => x.key === sel);
      addFlow({ store: k.store, qty: 1, go, btn, value: k.price, contentId: k.key, bf: !!(k.bundle && B(k.bundle).bf !== false) });
    } else addFlow({ store: p.store, qty: Math.max(1, Math.min(20, +$('#qty').value || 1)), go, btn, value: p.price, contentId: p.id });
  };
  $('#buynow').addEventListener('click', e => doAdd(true, e.currentTarget));
  $('#addcart').addEventListener('click', e => doAdd(false, e.currentTarget));
  const rel = $('#related');
  if (rel) { rel.innerHTML = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).concat(PRODUCTS.filter(x => x.cat !== p.cat)).slice(0, 4).map(productCard).join(''); bindAddButtons(rel); }
  // отзиви само за същия продукт; без тях разделът се маха
  const rv = $('#reviews');
  if (rv) {
    const r = REVIEWS.filter(x => p.shortName.toLowerCase().includes(x.product.toLowerCase().split(' ')[0]));
    if (r.length) rv.innerHTML = r.slice(0, 3).map(reviewCard).join(''); else { const sec = rv.closest('section'); if (sec) sec.remove(); }
  }
  track('ViewContent', { content_ids: [p.id], content_type: 'product', value: p.price, currency: 'EUR' });
}

/* ---------- поръчката: над формата на ConvertBuilder ---------- */
function renderCheckoutHelper() {
  const box = $('#co-helper');
  if (!box) return;
  // старата страница за поръчка води към фунията (там са ъпселът и даунселът); количката е обща
  if (L.checkout !== '/poruchka' && location.pathname.replace(/\/$/, '') === '/poruchka') { location.replace(L.checkout + location.search); return; }
  const storeName = id => { const x = PRODUCTS.find(p => p.store === id) || BUNDLES.find(b => b.store === id); return x ? (x.title || x.name) : ''; };
  let working = false;

  async function draw() {
    await syncCombos();
    const o = await Cart.get();
    const items = o.items || [];
    const ids = items.map(i => i.productId);
    const main = items.filter(i => !isGift(i));
    if (!main.length) {
      drawBumps([]);
      box.innerHTML = `<div class="box empty"><h2>Количката е празна</h2><p class="lead">Избери продукт или комплект — поръчката отнема по-малко от минута.</p>
        <div class="row-btns">${bfOn() ? `<a class="btn btn-primary btn-lg" href="${L.bf}#oferti">Виж офертите за Черен петък</a>` : ''}<a class="btn btn-outline btn-lg" href="${L.products}">Всички продукти</a></div>
        <p>Или поръчай по телефона: <a href="tel:${CONFIG.phoneHref}"><b>${CONFIG.phone}</b></a></p></div>`;
      document.documentElement.classList.add('zn-cart-empty');
      return;
    }
    document.documentElement.classList.remove('zn-cart-empty');
    drawBumps(items);
    // по-изгоден комплект: 1 гел или 2 гела → 3 гела
    let up = '';
    const gel1 = P('gel').store, b2 = B('bf2').store, b3 = B('bf3');
    if (!ids.includes(b3.store) && !ids.includes(B('bf5').store)) {
      const from = ids.includes(b2) ? B('bf2') : (ids.includes(gel1) ? { store: gel1, price: P('gel').price, title: '1 гел' } : null);
      if (from) up = `<div class="box upgrade"><div><h2>По-изгодно: 3 гела за ${fmt(b3.price)}</h2>
        <p>Вместо ${esc(from.title.replace(' за стави', ''))} за ${fmt(from.price)} вземи <b>3 гела</b> — само <b>+${fmt(b3.price - from.price)}</b>, около 6 седмици грижа без прекъсване.</p></div>
        <button class="btn btn-primary" type="button" data-swap="${from.store}">Да, искам 3 гела</button></div>`;
    }
    const dm = dealsMsg(items);
    box.innerHTML = `
      ${dm ? `<div class="ship-progress${dm.done ? ' is-done' : ''}">${dm.done ? '🎉 ' : '🚚 '}${dm.text}${dm.done ? '' : `<div class="bar"><i style="width:${dm.pct}%"></i></div>`}</div>` : ''}
      ${halfNote ? `<p class="halfnote">${esc(halfNote)}</p>` : ''}
      ${up}
      ${bfOn() && items.some(isGift) ? `<p class="giftnote">🎁 Подаръкът за Черния петък (${giftLabel(items.find(isGift).quantity || 1)}) е в поръчката ти.</p>` : ''}`;
    $$('[data-swap]', box).forEach(b => b.addEventListener('click', () => run(b, async () => { await Cart.remove(+b.dataset.swap); await Cart.add(b3.store, 1); })));
  }
  async function run(btn, fn) {
    if (working) return;
    working = true; btn.disabled = true; btn.textContent = 'Момент…';
    try { await fn(); await syncGift(); } catch (e) { toast('Не се получи. Опитай пак или се обади:', true); }
    working = false; draw();
  }

  // Бъмп офертите: отметки точно над бутона „Завърши поръчката“ във формата на ConvertBuilder.
  // Отметката добавя скрития продукт със специалната цена, махането ѝ го маха.
  let bumpItems = [];
  function drawBumps(items) {
    bumpItems = items;
    const btns = document.querySelector('.payment-step-wrapper .next-prev-buttons');
    let host = document.getElementById('zn-bumps');
    const ids = items.map(i => i.productId);
    const inBundles = BUNDLES.filter(b => ids.includes(b.store)).flatMap(b => b.items.map(x => x[0]));
    // над прага: вместо бъмп офертите – до 3 продукта на половин цена (вече добавените стоят отметнати)
    const unlocked = halfPlan(items).unlocked;
    const halfList = unlocked ? PRODUCTS.filter(p => HALF[p.id] && ids.includes(HALF[p.id]) && !ids.includes(p.store))
      .concat(halfOffers(items)).slice(0, 3).map(p => ({ id: p.id, store: HALF[p.id], price: halfPriceOf(p), title: p.shortName, text: p.short, half: true })) : [];
    const list = (unlocked ? BUMPS.filter(b => ids.includes(b.store)) : BUMPS.filter(b => !inBundles.includes(b.id) && !ids.includes(P(b.id).store))).concat(halfList);
    if (!btns || !items.some(i => !isGift(i)) || !list.length) { if (host) host.remove(); return; }
    if (!host || host.nextElementSibling !== btns) {
      if (host) host.remove();
      host = document.createElement('div');
      host.id = 'zn-bumps';
      btns.parentElement.insertBefore(host, btns);
    }
    host.innerHTML = `<p class="zn-bumps-title">${halfList.length ? `Поръчката ти е над ${fmt(HALF_FROM)} – добави на <b>половин цена</b>:` : 'Специално само към тази поръчка:'}</p>` + list.map(b => {
      const p = P(b.id), on = ids.includes(b.store);
      return `<div class="zn-bump${on ? ' on' : ''}${b.half ? ' zn-bump--half' : ''}" role="checkbox" tabindex="0" aria-checked="${on}" data-bump="${b.id}" data-store="${b.store}">
        <span class="zn-bump-head"><span class="zn-box" aria-hidden="true"></span><span>Да, добави <b>${esc(b.title)}</b> за <b class="zn-price">${fmt(b.price)}</b> <s>${fmt(p.price)}</s>${b.half ? ' <span class="zn-off">−50%</span>' : ''}</span></span>
        <span class="zn-bump-body"><img src="${productLook(p).img}" alt=""><span>${b.half ? 'Половин цена само към тази поръчка. Идва в същата пратка.' : esc(b.text)}</span></span></div>`;
    }).join('');
    host.querySelectorAll('[data-bump]').forEach(el => {
      const toggle = async () => {
        if (working) return;
        const b = { store: +el.dataset.store }, on = el.getAttribute('aria-checked') === 'true';
        working = true; el.classList.add('busy');
        try { if (on) await Cart.remove(b.store); else await Cart.add(b.store, 1); await syncGift(); }
        catch (e) { toast('Не се получи. Опитай пак или се обади:', true); }
        working = false; draw();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    });
  }
  // Доставката. Над прага за безплатна доставка формата показва друг списък и сама избира първия ред
  // („До адрес“, платен), макар офисът да е безплатен. Пазим избора на клиента; ако още не е избирал –
  // не оставяме платения адрес, когато има офис. Оправяме и надписите, и подсказката в полето за адрес.
  let shipKind = null;
  const kindOf = t => /спиди|speedy/i.test(t) ? 'speedy' : /еконт|econt/i.test(t) ? 'econt' : 'address';
  const SHIP_LABEL = { econt: 'До офис на Еконт', speedy: 'До офис на Спиди', address: 'До адрес (с куриер)' };
  const ADDR_HINT = { econt: 'Офис на Еконт – име или адрес на офиса', speedy: 'Офис на Спиди – име или адрес на офиса', address: 'Улица, номер, блок, вход, апартамент' };
  document.addEventListener('change', e => {
    const t = e.target;
    if (e.isTrusted && t && t.name === 'shippingOption' && t.closest('label')) shipKind = kindOf(t.closest('label').textContent);
  }, true);
  function fixShipping() {
    const wrap = document.querySelector('.payment-step-wrapper [data-role="shipping-methods"]');
    if (!wrap) return;
    const rows = [...wrap.querySelectorAll('label')].map(l => {
      const inp = l.querySelector('input[type="radio"]'), name = l.querySelector('span:not(.price)');
      return inp && name ? { l, inp, name, kind: kindOf(name.textContent) } : null;
    }).filter(Boolean);
    if (!rows.length) return;
    rows.forEach(r => {
      const tn = [...r.name.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      if (tn && tn.textContent.trim() !== SHIP_LABEL[r.kind]) tn.textContent = SHIP_LABEL[r.kind];
    });
    let cur = rows.find(r => r.inp.checked);
    const want = shipKind ? rows.find(r => r.kind === shipKind) : (cur && cur.kind === 'address' ? rows.find(r => r.kind !== 'address') : null);
    if (want && want !== cur) { want.l.click(); cur = want; }
    const kind = cur ? cur.kind : 'address';
    const addr = document.querySelector('.payment-step-wrapper input[name="shippingAddress"]');
    if (addr && addr.placeholder !== ADDR_HINT[kind]) addr.placeholder = ADDR_HINT[kind];
    const city = document.querySelector('.payment-step-wrapper input[name="shippingCity"]');
    if (city && city.placeholder !== 'Град или село') city.placeholder = 'Град или село';
  }
  // формата на ConvertBuilder се зарежда и пренарежда сама: отметките се връщат на мястото си
  setInterval(() => {
    const btns = document.querySelector('.payment-step-wrapper .next-prev-buttons'), host = document.getElementById('zn-bumps');
    if (btns && bumpItems.length && (!host || host.nextElementSibling !== btns)) drawBumps(bumpItems);
    fixShipping();
  }, 1200);

  // редът с подаръка във формата: без + и −
  function markGiftRow() {
    document.querySelectorAll('.payment-step-wrapper .cart-row').forEach(r => {
      if (/Подарък:/.test(r.textContent)) {
        r.classList.add('zn-gift-row'); r.querySelectorAll('.number-pad,.cart-row-quantity').forEach(e => e.classList.add('zn-qty'));
        // броят е скрит, затова при повече от 1 пакет (5 гела → 3 пакета) го пишем до името
        const inp = r.querySelector('input[type=number]'), n = inp ? Math.max(1, parseInt(inp.value, 10) || 1) : 1;
        const name = r.querySelector('h1,h2,h3,h4,h5,h6');
        let tag = r.querySelector('.zn-gift-n');
        if (n > 1 && name) { if (!tag) { tag = document.createElement('b'); tag.className = 'zn-gift-n'; name.appendChild(tag); } tag.textContent = ` × ${n} пакета (${12 * n} бр.)`; }
        else if (tag) tag.remove();
      }
    });
  }

  // OrderDesk (като „Линк за връзка“ в Middleware): при „До офис“ търсачка с офисите на Еконт и Спиди,
  // изборът се записва в полето за адрес и товарителницата отива точно до този офис
  if (CONFIG.kasa && CONFIG.kasa.src && !document.querySelector('script[src$="/k.js"]')) {
    const k = document.createElement('script');
    k.src = CONFIG.kasa.src; k.defer = true;
    k.setAttribute('data-shop', CONFIG.kasa.shop);
    document.body.appendChild(k);
  }
  async function start() {
    if (!cbReady()) { setTimeout(start, 300); return; }
    // ?add=<номер>&q=<брой> – добавяне от страница без магазина
    const q = new URLSearchParams(location.search);
    const add = +q.get('add');
    if (add) {
      history.replaceState(null, '', location.pathname);
      try {
        if (BF_STORE_IDS.includes(add)) { const o = await Cart.get(); for (const it of (o.items || []).filter(i => BF_STORE_IDS.includes(i.productId) && i.productId !== add)) await Cart.remove(it.productId); }
        await Cart.add(add, Math.max(1, Math.min(20, +q.get('q') || 1)));
      } catch (e) {}
    }
    try { await syncGift(); } catch (e) {}
    // всяка промяна в поръчката (бутоните + и − във формата) обновява блока
    const S = W().Store, set = S.Orders.set;
    if (!set.znWrapped) {
      S.Orders.set = function (id, order) { const r = set.apply(this, arguments); if (id === 'cart') { updateCount(order); markGiftRow(); clearTimeout(start.t); start.t = setTimeout(() => { if (!working) syncGift().catch(() => {}).then(draw); }, 400); } return r; };
      S.Orders.set.znWrapped = true;
    }
    draw();
    markGiftRow();
    const o = await Cart.get();
    track('InitiateCheckout', { value: (o.items || []).reduce((s, i) => s + (+i.price || 0), 0), currency: 'EUR', num_items: countOf(o) }); // цената на реда е вече по броя
  }
  start();
}

function renderThanks() {
  mark('order_done');
  // номерът и сумата идват от магазина (последната поръчка от този браузър)
  const el = $('#order-no');
  (function wait(n) {
    const O = cbReady() && W().Store.Orders;
    if (!O || !O.getLastOrder) { if (n < 40) setTimeout(() => wait(n + 1), 250); return; }
    Promise.resolve(O.getLastOrder()).then(o => {
      const no = o && (o.no || o.number || o.orderNumber || o.id); // no = номерът на фактурата, който показва ConvertBuilder
      if (el && no) el.innerHTML = `Номер на поръчката: <b>${esc(no)}</b>${o.total ? ` · за плащане при получаване: <b>${fmt(+o.total)}</b>` : ''}`;
    }).catch(() => {});
  })(0);
}

/* ---------- офертата след поръчката (ъпсел / даунсел във фунията) ----------
   Под блока стои елементът „Ъпсел / Даунсел“ на ConvertBuilder. Нашите бутони натискат неговите
   (.upsell-positive-action / .upsell-negative-action): той добавя продукта към вече приетата
   поръчка и води към следващата стъпка. Ако нашият код не тръгне, неговите бутони си остават.  */
const JOINT_FREE = [...PRODUCTS.filter(p => p.cat !== 'stavi').map(p => p.store),
  ...Object.entries(PACKS).filter(([k]) => k !== 'gel').flatMap(([, v]) => v.map(x => x.store)),
  ...BUNDLES.filter(b => !b.items.some(x => (P(x[0]) || {}).cat === 'stavi')).map(b => b.store),
  ...Object.keys(HALF).filter(id => P(id) && P(id).cat !== 'stavi').map(id => HALF[id])]; // ½ цена на продукт не за ставите
function renderUpsell() {
  const box = $('#ups');
  if (!box) return;
  const p = P(UPSELL.product);
  const price = page === 'downsell' ? UPSELL.downsellPrice : UPSELL.price;
  $$('[data-ups-price]').forEach(e => { e.textContent = fmt(price); });
  $$('[data-ups-regular]').forEach(e => { e.textContent = fmt(p.price); });
  $$('[data-ups-save]').forEach(e => { e.textContent = fmt(p.price - price); });
  $$('[data-ups-first]').forEach(e => { e.textContent = fmt(UPSELL.price); });

  const native = yes => document.querySelector(yes ? '.upsell-positive-action' : '.upsell-negative-action');
  let pressed = false;
  function press(yes, auto) {
    const el = native(yes);
    if (!el) { if (!auto) toast('Бутонът още се зарежда — опитай след секунда.', true); return; }
    if (pressed) return;
    pressed = true;
    box.classList.add(yes ? 'is-yes' : 'is-no');
    $$('[data-ups]').forEach(b => { b.disabled = true; });
    const btn = $(`[data-ups="${yes ? 'yes' : 'no'}"]`);
    if (btn) btn.textContent = yes ? 'Добавяме го…' : 'Момент…';
    el.click();
    // ако нещо се обърка, бутоните се връщат
    setTimeout(() => { pressed = false; box.classList.remove('is-yes', 'is-no'); $$('[data-ups]').forEach(b => { b.disabled = false; b.innerHTML = b.dataset.label; }); }, 12000);
  }
  $$('[data-ups]').forEach(b => {
    b.dataset.label = b.innerHTML;
    b.addEventListener('click', e => { e.preventDefault(); press(b.dataset.ups === 'yes'); });
  });

  // елементът на ConvertBuilder се скрива, щом нашите бутони са готови
  (function hide(n) {
    const el = native(true);
    const w = el && (el.closest('.widget') || el.parentElement);
    if (w && !w.contains(ROOT)) w.style.display = 'none';
    else if (n < 60) setTimeout(() => hide(n + 1), 250);
  })(0);

  // поръчката: номерът горе, а ако кремът вече е в нея или в поръчката няма нищо за ставите – прескачаме
  (function check(n) {
    const O = cbReady() && W().Store.Orders;
    if (!O || !O.getLastOrder) { if (n < 40) setTimeout(() => check(n + 1), 250); return; }
    Promise.resolve(O.getLastOrder()).then(o => {
      const no = o && (o.no || o.number || o.orderNumber || o.id);
      if (no) $$('[data-order-no]').forEach(e => { e.textContent = ` (№ ${no})`; });
      const ids = ((o && (o.items || o.products)) || []).map(i => +i.productId).filter(id => id && id !== CONFIG.giftStoreId);
      const has = ids.some(id => id === p.store || id === UPSELL.store || id === HALF_REG[p.store]);
      const noJoints = ids.length && ids.every(id => JOINT_FREE.includes(id));
      if (has || noJoints) { box.classList.add('is-skip'); (function skip(k) { if (native(false)) press(false, true); else if (k < 40) setTimeout(() => skip(k + 1), 250); })(0); }
    }).catch(() => {});
  })(0);
}

/* ---------- images by key (снимките се сменят само в данните) ---------- */
$$('[data-img-key]').forEach(i => { const k = i.dataset.imgKey; const src = LIFESTYLE[k] || (P(k) && P(k).img) || (B(k) && B(k).img); if (src) i.src = src; });
$$('[data-bg-key]').forEach(i => { const src = LIFESTYLE[i.dataset.bgKey]; if (src) i.style.backgroundImage = `url("${src}")`; });
$$('[data-bf-only]').forEach(el => { if (!bfOn()) el.remove(); });
$$('[data-free-ship]').forEach(el => { if (!FREE_FROM) el.remove(); else el.querySelectorAll('[data-free-from]').forEach(x => { x.textContent = fmt(FREE_FROM); }); });
$$('[data-ship]').forEach(el => { const m = CONFIG.shipping.find(x => x.id === el.dataset.ship); if (m) el.textContent = fmt(m.price); });
$$('[data-price]').forEach(el => { const x = B(el.dataset.price) || P(el.dataset.price); if (x) el.textContent = fmt(x.price); });

/* ---------- init ---------- */
renderHeader();
renderFooter();
renderMobileBar();
if (page === 'home') { if (renderHomeBv) renderHomeBv(); else renderHome(); }
if (page === 'bf') renderBF();
if (page === 'products') renderProducts();
if (page === 'product') renderProduct();
if (page === 'checkout') renderCheckoutHelper();
if (page === 'thanks') renderThanks();
if (page === 'upsell' || page === 'downsell') renderUpsell();
bindAddButtons();
tickCountdowns(); setInterval(tickCountdowns, 1000);
// броят в количката (магазинът се зарежда малко след страницата)
(function count(n) {
  if (cbReady()) Cart.get().then(o => { updateCount(o); refreshMobileBar(); });
  else if (n < 40) setTimeout(() => count(n + 1), 250);
})(0);
