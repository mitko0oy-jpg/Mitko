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
const B = id => BUNDLES.find(b => b.id === id);
const L = CONFIG.links;
const productUrl = id => `${L.product}?p=${id}`;
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
const GIFT_TEXT = '12 билкови пластира подарък';
const BF_STORE_IDS = BUNDLES.filter(b => b.bf !== false).map(b => b.store);

/* ---------- font size (за по-лесно четене) ---------- */
const FS = ['', 'fs-l', 'fs-xl'];
function applyFs(i) {
  document.querySelectorAll('.zn-root').forEach(r => { r.classList.remove('fs-l', 'fs-xl'); if (FS[i]) r.classList.add(FS[i]); });
  local.set('zn_fs', i);
}
applyFs(local.get('zn_fs', 0));

function track(ev, data) { try { if (window.fbq) window.fbq('track', ev, data || {}); } catch (e) {} }

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
  async add(storeId, qty = 1) {
    const r = await req('getStoreProduct', { id: storeId });
    const p = r.data;
    const option = { productId: p.id, quantity: qty, combination: -1, variation: [], price: p.onSale ? p.salePrice : p.price };
    const r2 = await req('addToCart', { orderId: 'cart', option: JSON.stringify(option), process: 'cart' });
    try { W().Store.reportAddToCart(r2.uid, p, option, W().Store.currency); } catch (e) {}
    return setOrder(r2.data);
  },
  async remove(storeId) {
    const o = await Cart.get();
    const index = (o.items || []).findIndex(i => i.productId === storeId);
    if (index < 0) return o;
    const r = await req('updateCart', { orderId: 'cart', products: '[]', type: 'remove', index });
    try { W().Store.reportRemoveFromCart(o.items[index], W().Store.currency); } catch (e) {}
    return setOrder(r.data);
  }
};
const isGift = i => i.productId === CONFIG.giftStoreId;
const countOf = o => (o.items || []).filter(i => !isGift(i)).reduce((s, i) => s + (i.quantity || 1), 0);

// По време на Черния петък подаръкът е във всяка поръчка (и само заедно с друг продукт).
async function syncGift() {
  if (!CONFIG.giftStoreId || !cbReady()) return;
  const o = await Cart.get();
  const items = o.items || [];
  const gift = items.find(isGift), others = items.some(i => !isGift(i));
  if (bfOn() && others && !gift) await Cart.add(CONFIG.giftStoreId, 1);
  else if (gift && (!others || !bfOn())) await Cart.remove(CONFIG.giftStoreId);
  else if (gift && gift.quantity > 1) { await Cart.remove(CONFIG.giftStoreId); await Cart.add(CONFIG.giftStoreId, 1); }
}

let countNow = 0;
function updateCount(o) {
  if (o) countNow = countOf(o);
  $$('[data-cart-count]').forEach(el => { el.textContent = countNow; });
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
async function addFlow({ store, qty = 1, go = false, btn = null, value = 0, contentId = '', bf = false }) {
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
    await syncGift();
    if (go) { location.href = L.checkout; return; }
    toast('Добавено в количката');
  } catch (e) {
    toast('Не успяхме да добавим продукта. Опитай пак или поръчай по телефона:', true);
  }
  busy = false;
  if (btn) { btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = label; }
}

function separateValue(b) {
  let v = b.items.reduce((s, [id, q]) => s + P(id).price * q, 0);
  if (bfOn()) v += (b.gift || []).reduce((s, [id, q]) => s + P(id).price * q, 0);
  if (b.freeShip && freeShipFor(b.price)) v += SHIP_FROM;
  return v;
}

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
  if (!h) return;
  const here = location.pathname.replace(/\/$/, '') || '/';
  const nav = [
    [L.home, 'Начало'],
    [L.bf, '★ Черен петък', 'bf-link'],
    [L.products, 'Продукти'],
    [L.delivery, 'Доставка'],
    [L.contacts, 'Контакти']
  ].filter(n => n[0] !== L.bf || bfOn());
  h.innerHTML = `
    ${bfOn() ? `<div class="topbar">⚫ ЧЕРЕН ПЕТЪК: 3 гела + 12 пластира за ${fmt(B('bf3').price)} · остават <span class="cd-mini" data-cd-mini></span> · <a href="${L.bf}">Виж офертите →</a></div>` : ''}
    <header class="header"><div class="wrap">
      <a class="logo" href="${L.home}" aria-label="Здравец Натура — начало"><img src="${LIFESTYLE.logo}" alt="Здравец Натура — натурална козметика" width="186" height="80"></a>
      <nav class="nav" aria-label="Главно меню">${nav.map(n => `<a href="${n[0]}" class="${n[2] || ''} ${here === n[0] ? 'on' : ''}">${n[1]}</a>`).join('')}</nav>
      <div class="head-actions">
        <div class="fs-tools" aria-label="Размер на текста"><button type="button" data-fs="-" aria-label="По-малък текст">A−</button><button type="button" data-fs="+" aria-label="По-голям текст">A+</button></div>
        <a class="phone-pill" href="tel:${CONFIG.phoneHref}"><span>Поръчка по телефона</span>${CONFIG.phone}</a>
        <a class="cart-btn" href="${L.checkout}" aria-label="Количка">🛒 <span class="lbl">Количка</span> <span class="cart-count" data-cart-count aria-live="polite">0</span></a>
        <button class="menu-btn" type="button" aria-expanded="false">☰ Меню</button>
      </div>
    </div></header>`;
  $('.menu-btn', h).addEventListener('click', e => { const n = $('.nav', h); n.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', n.classList.contains('open')); });
  $$('[data-fs]', h).forEach(b => b.addEventListener('click', () => { let i = local.get('zn_fs', 0); i = b.dataset.fs === '+' ? Math.min(2, i + 1) : Math.max(0, i - 1); applyFs(i); }));
}

function renderFooter() {
  const f = $('[data-zn-footer]');
  if (!f) return;
  f.innerHTML = `
  <footer class="footer"><div class="wrap">
    <div class="cols">
      <div><a class="flogo" href="${L.home}"><img src="${LIFESTYLE.logo}" alt="Здравец Натура"></a>
        <p class="small">Натурална козметика с пчелна отрова и билкови екстракти — за ставите, кожата и уморените крака.</p></div>
      <div><h4>Продукти</h4><ul>${CATEGORIES.map(c => `<li><a href="${L.products}?cat=${c.id}">${c.name}</a></li>`).join('')}<li><a href="${L.products}">Всички продукти</a></li>${bfOn() ? `<li><a href="${L.bf}">Черен петък</a></li>` : ''}</ul></div>
      <div><h4>Полезно</h4><ul><li><a href="${L.delivery}">Доставка и плащане</a></li><li><a href="${L.delivery}#vrashtane">Връщане и гаранция</a></li><li><a href="${L.terms}">Общи условия</a></li><li><a href="${L.privacy}">Поверителност</a></li><li><a href="https://kzp.bg" rel="noopener">КЗП</a></li></ul></div>
      <div><h4>Поръчай по телефона</h4><ul>
        <li><a href="tel:${CONFIG.phoneHref}" class="fphone">${CONFIG.phone}</a></li>
        <li>${CONFIG.hours}</li><li><a href="mailto:${CONFIG.email}">${CONFIG.email}</a></li>
        <li>Плащане при доставка · Еконт и Спиди</li><li>🇧🇬 Произведено за България</li></ul></div>
    </div>
    <div class="legal">
      <p>${CONFIG.company} · ЕИК ${CONFIG.eik} · ${CONFIG.address} · Надзорен орган: Комисия за защита на потребителите.</p>
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
function productCard(p) {
  return `<article class="card pcard">
    <a class="pimg" href="${productUrl(p.id)}">${p.id === 'gel' && bfOn() ? '<span class="tag dark">Черен петък</span>' : (p.bestseller ? '<span class="tag">Предпочитан</span>' : '')}<img src="${p.img}" alt="${esc(p.name)}" loading="lazy"></a>
    <div class="pbody">
      <h3><a href="${productUrl(p.id)}">${esc(p.name)}</a></h3>
      <p>${esc(p.short)}</p>
      <div class="row"><span class="price">${p.packs ? '<small>от</small> ' : ''}${fmt(p.price)}</span>
        ${p.packs ? `<a class="btn btn-green" href="${productUrl(p.id)}">Избери</a>` : `<button class="btn btn-green" type="button" data-add="${p.id}">Добави</button>`}</div>
      <a class="small more" href="${productUrl(p.id)}">Виж повече →</a>
    </div></article>`;
}

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
    ${bfOn() && b.gift && b.gift.length ? `<div class="gift">🎁 Подарък: 12 билкови пластира (${fmt(P('beeherb').price)})</div>` : ''}
    <div class="pricebox"><span class="now">${fmt(b.price)}</span><span class="per">${esc(b.perUnit)}</span></div>
    <div class="ship ${free ? 'free' : ''}">${free ? '🚚 Безплатна доставка до офис' : `+ доставка от ${fmt(SHIP_FROM)} до офис`}</div>
    <div class="compare">Поотделно: ${fmt(sep)} · <b>спестяваш ${fmt(save)}</b></div>
    <div class="note">${esc(b.note)}</div>
    <button class="btn ${b.featured ? 'btn-primary' : 'btn-green'} btn-block btn-lg" type="button" data-bundle="${b.id}">Избирам ${b.id === 'bfFull' ? 'пълната грижа' : esc(b.title.replace(' за стави', ''))} →</button>
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
  track('ViewContent', { content_ids: ['bf3'], content_type: 'product', value: B('bf3').price, currency: 'EUR' });
}

function renderProducts() {
  const q = new URLSearchParams(location.search);
  let cat = q.get('cat') || 'all';
  const chips = $('#chips'), grid = $('#grid');
  const draw = () => {
    chips.innerHTML = [['all', 'Всички']].concat(CATEGORIES.map(c => [c.id, c.name])).map(([id, n]) => `<button class="chip ${cat === id ? 'on' : ''}" data-cat="${id}" type="button">${n}</button>`).join('');
    grid.innerHTML = PRODUCTS.filter(p => cat === 'all' || p.cat === cat).map(productCard).join('');
    $$('[data-cat]', chips).forEach(b => b.addEventListener('click', () => { cat = b.dataset.cat; history.replaceState(null, '', cat === 'all' ? L.products : `${L.products}?cat=${cat}`); draw(); }));
    bindAddButtons(grid);
    const c = CATEGORIES.find(x => x.id === cat);
    $('#cat-title').textContent = c ? c.name : 'Всички продукти';
  };
  draw();
}

function renderProduct() {
  const q = new URLSearchParams(location.search);
  const p = P(q.get('p')) || P('gel');
  document.title = `${p.name} | Здравец Натура`;
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
            <span class="pl"><b>${esc(k.label)}${gift ? ' + ' + GIFT_TEXT : ''}</b><span>${esc(sub)}</span></span>
            <span class="pp-price">${fmt(k.price)}</span></label>`; }).join('')}</div>`
          : `<div class="buyrow"><span class="price big">${fmt(p.price)}</span>
             <div class="qty"><button type="button" data-q="-1" aria-label="По-малко">−</button><input id="qty" type="number" min="1" max="20" value="1" aria-label="Количество"><button type="button" data-q="1" aria-label="Повече">+</button></div></div>`}
        ${bfOn() && !gift ? `<div class="gift">🎁 Подарък към всяка поръчка до 30 ноември: ${GIFT_TEXT.replace(' подарък', '')}</div>` : ''}
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
  const storeName = id => { const x = PRODUCTS.find(p => p.store === id) || BUNDLES.find(b => b.store === id); return x ? (x.title || x.name) : ''; };
  let working = false;

  async function draw() {
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
    const total = main.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    drawBumps(items);
    // по-изгоден комплект: 1 гел или 2 гела → 3 гела
    let up = '';
    const gel1 = P('gel').store, b2 = B('bf2').store, b3 = B('bf3');
    if (!ids.includes(b3.store) && !ids.includes(B('bfFull').store)) {
      const from = ids.includes(b2) ? B('bf2') : (ids.includes(gel1) ? { store: gel1, price: P('gel').price, title: '1 гел' } : null);
      if (from) up = `<div class="box upgrade"><div><h2>По-изгодно: 3 гела за ${fmt(b3.price)}</h2>
        <p>Вместо ${esc(from.title.replace(' за стави', ''))} за ${fmt(from.price)} вземи <b>3 гела</b> — само <b>+${fmt(b3.price - from.price)}</b>, около 6 седмици грижа без прекъсване.</p></div>
        <button class="btn btn-primary" type="button" data-swap="${from.store}">Да, искам 3 гела</button></div>`;
    }
    const toFree = FREE_FROM - total;
    box.innerHTML = `
      ${FREE_FROM ? `<div class="ship-progress">${toFree > 0 ? `Добави още ${fmt(toFree)} и доставката до офис е безплатна<div class="bar"><i style="width:${Math.min(100, total / FREE_FROM * 100)}%"></i></div>` : '🎉 Доставката до офис е безплатна'}</div>` : ''}
      ${up}
      ${bfOn() && items.some(isGift) ? '<p class="giftnote">🎁 Подаръкът за Черния петък (12 билкови пластира) е в поръчката ти.</p>' : ''}`;
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
    const list = BUMPS.filter(b => !inBundles.includes(b.id) && !ids.includes(P(b.id).store));
    if (!btns || !items.some(i => !isGift(i)) || !list.length) { if (host) host.remove(); return; }
    if (!host || host.nextElementSibling !== btns) {
      if (host) host.remove();
      host = document.createElement('div');
      host.id = 'zn-bumps';
      btns.parentElement.insertBefore(host, btns);
    }
    host.innerHTML = `<p class="zn-bumps-title">Специално само към тази поръчка:</p>` + list.map(b => {
      const p = P(b.id), on = ids.includes(b.store);
      return `<div class="zn-bump${on ? ' on' : ''}" role="checkbox" tabindex="0" aria-checked="${on}" data-bump="${b.id}">
        <span class="zn-bump-head"><span class="zn-box" aria-hidden="true"></span><span>Да, добави <b>${esc(b.title)}</b> за <b class="zn-price">${fmt(b.price)}</b> <s>${fmt(p.price)}</s></span></span>
        <span class="zn-bump-body"><img src="${p.img}" alt=""><span>${esc(b.text)}</span></span></div>`;
    }).join('');
    host.querySelectorAll('[data-bump]').forEach(el => {
      const toggle = async () => {
        if (working) return;
        const b = BUMPS.find(x => x.id === el.dataset.bump), on = el.getAttribute('aria-checked') === 'true';
        working = true; el.classList.add('busy');
        try { if (on) await Cart.remove(b.store); else await Cart.add(b.store, 1); await syncGift(); }
        catch (e) { toast('Не се получи. Опитай пак или се обади:', true); }
        working = false; draw();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    });
  }
  // формата на ConvertBuilder се зарежда и пренарежда сама: отметките се връщат на мястото си
  setInterval(() => {
    const btns = document.querySelector('.payment-step-wrapper .next-prev-buttons'), host = document.getElementById('zn-bumps');
    if (btns && bumpItems.length && (!host || host.nextElementSibling !== btns)) drawBumps(bumpItems);
  }, 1200);

  // редът с подаръка във формата: без + и −
  function markGiftRow() {
    document.querySelectorAll('.payment-step-wrapper .cart-row').forEach(r => {
      if (/Подарък:/.test(r.textContent)) { r.classList.add('zn-gift-row'); r.querySelectorAll('.number-pad,.cart-row-quantity').forEach(e => e.classList.add('zn-qty')); }
    });
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
    track('InitiateCheckout', { value: (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0), currency: 'EUR', num_items: countOf(o) });
  }
  start();
}

function renderThanks() {
  // номерът и сумата идват от магазина (последната поръчка от този браузър)
  const el = $('#order-no');
  (function wait(n) {
    const O = cbReady() && W().Store.Orders;
    if (!O || !O.getLastOrder) { if (n < 40) setTimeout(() => wait(n + 1), 250); return; }
    Promise.resolve(O.getLastOrder()).then(o => {
      const no = o && (o.number || o.orderNumber || o.id);
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
  ...BUNDLES.filter(b => !b.items.some(x => (P(x[0]) || {}).cat === 'stavi')).map(b => b.store)];
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
      const no = o && (o.number || o.orderNumber);
      if (no) $$('[data-order-no]').forEach(e => { e.textContent = `№ ${no}`; });
      const ids = ((o && (o.items || o.products)) || []).map(i => +i.productId).filter(id => id && id !== CONFIG.giftStoreId);
      const has = ids.some(id => id === p.store || id === UPSELL.store);
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
if (page === 'home') renderHome();
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
