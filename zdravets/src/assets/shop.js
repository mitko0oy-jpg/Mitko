/* =========================================================================
   Магазинът в стил Shopify: лента със съобщения, меню с всички продукти,
   търсене, количка, която се плъзга отстрани, карти на продуктите и
   комплектите от пластири по избор. Количката е тази на ConvertBuilder (Cart в app.js).
   Тук има само функции – извикват се от app.js и landing.js.
   ========================================================================= */

const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l1.6 4.2-2 1.4a12 12 0 0 0 6.8 6.8l1.4-2L21 15l-.5 2.4a2 2 0 0 1-2 1.6A16 16 0 0 1 5 5.5a2 2 0 0 1 1.6-2Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/></svg>'
};

/* ---------- как изглежда продуктът: 3D сцената и цветът му (landing-data.js) ---------- */
function productLook(p) {
  const sc = sceneOf(p.id), th = THEMES[p.id];
  const gel = p.id === 'gel';
  return {
    img: gel ? BVM(BV.hero, 'hero-scene-700.webp') : sc ? sc.small : p.img,
    big: gel ? BVM(BV.hero, 'hero-scene-1200.webp') : sc ? sc.img : p.img,
    video: sc ? sc.video : null,
    scene: gel || !!sc, gel,
    a: th ? th.a : '#F5A623', d: th ? th.d : '#E08A00'
  };
}
const catOf = p => CATEGORIES.find(c => c.id === p.cat) || { name: '', short: '' };
const fromPrice = p => (p.packs ? Math.min(...PACKS[p.packs].map(k => k.price)) : p.price);

/* ---------- комплектите от пластири по избор ----------
   В ConvertBuilder: продуктът „Комплект N вида пластири“ носи цената, а всеки избран вид е ред за 0 €
   („… (в комплект)“) – така поръчката в OrderDesk казва точно какво да се изпрати. */
const comboReady = () => PATCH_COMBOS.some(c => c.store) && PRODUCTS.filter(p => p.wellness).every(p => PATCH_IN_COMBO[p.id]);
const comboOf = store => PATCH_COMBOS.find(c => c.store && c.store === store);
const inComboOf = store => Object.keys(PATCH_IN_COMBO).find(id => PATCH_IN_COMBO[id] && PATCH_IN_COMBO[id] === store);
async function addCombo(n, ids, { go = false, btn = null } = {}) {
  const c = PATCH_COMBOS.find(x => x.n === n);
  if (!c || !c.store || ids.length !== n) return;
  await addFlow({ store: c.store, qty: 1, btn, value: c.price, contentId: `combo${n}:${ids.join('+')}`, extra: ids.map(id => PATCH_IN_COMBO[id]), go });
}
// всеки вид в комплект трябва да има свой комплект: без комплекта редовете за 0 € се махат
async function syncCombos() {
  if (!cbReady() || !PATCH_COMBOS.some(c => c.store)) return;
  const o = await Cart.get();
  const items = o.items || [];
  const allowed = items.reduce((s, i) => { const c = comboOf(i.productId); return s + (c ? c.n * (i.quantity || 1) : 0); }, 0);
  const inCombo = items.filter(i => inComboOf(i.productId));
  const have = inCombo.reduce((s, i) => s + (i.quantity || 1), 0);
  if (have > allowed) for (const i of inCombo) await Cart.remove(i.productId);
}

/* ---------- всичко в количката по номера в магазина ---------- */
function storeInfo(id) {
  if (HALF_OF[id]) { const hp = regProduct(HALF_OF[id]); return { name: hp.name, img: productLook(hp).img, url: productUrl(hp.id), p: hp, half: true }; }
  const p = PRODUCTS.find(x => x.store === id);
  if (p) return { name: p.name, img: productLook(p).img, url: productUrl(p.id), p };
  for (const key of Object.keys(PACKS)) {
    const k = PACKS[key].find(x => x.store === id);
    if (k) { const pp = P(key) || PRODUCTS.find(x => x.packs === key); const b = k.bundle && B(k.bundle); return { name: b ? b.title : `${pp.shortName} – ${k.label}`, img: (b && (b.img || (b.collage && b.collage[0][0]))) || productLook(pp).img, url: productUrl(pp.id), p: pp }; }
  }
  const b = BUNDLES.find(x => x.store === id);
  if (b) return { name: b.title, img: b.img || (b.collage && b.collage[0][0]) || P('gel').img };
  const bump = BUMPS.find(x => x.store === id);
  if (bump) return { name: bump.title, img: productLook(P(bump.id)).img, url: productUrl(bump.id), p: P(bump.id) };
  if (id === UPSELL.store) return { name: P(UPSELL.product).name, img: productLook(P(UPSELL.product)).img };
  if (id === CONFIG.giftStoreId) return { name: 'Подарък: 12 пластира за стави и мускули', img: GIFT_IMG, gift: true };
  const c = comboOf(id);
  if (c) return { name: c.title, img: productLook(P('apetit')).img, combo: c };
  const ic = inComboOf(id);
  if (ic) return { name: `${P(ic).shortName} (в комплект)`, img: productLook(P(ic)).img, inCombo: true };
  return { name: '', img: '' };
}

/* ---------- лентата със съобщения ---------- */
function announceHtml() {
  const msgs = [];
  if (bfOn()) msgs.push(`⚫ <b>ЧЕРЕН ПЕТЪК:</b> 3 гела + 12 пластира за ${fmt(B('bf3').price)} · остават <span class="cd-mini" data-cd-mini></span> · <a href="${L.bf}">Виж офертите →</a>`);
  if (halfOn() && FREE_FROM && Math.abs(FREE_FROM - HALF_FROM) < 0.01) msgs.push(`🛒 Над ${fmt(HALF_FROM)}: <b>безплатна доставка</b> и <b>всеки следващ продукт на половин цена</b>`);
  else {
    if (FREE_FROM) msgs.push(`🚚 <b>Безплатна доставка до офис</b> при поръчка над ${fmt(FREE_FROM)}`);
    if (halfOn()) msgs.push(`🛒 Над ${fmt(HALF_FROM)} <b>всеки следващ продукт е на половин цена</b>`);
  }
  msgs.push(`💶 Плащаш при получаване · 🛡️ <b>${CONFIG.guaranteeDays} дни гаранция</b>`);
  msgs.push(`📞 Поръчка и по телефона: <a href="tel:${CONFIG.phoneHref}"><b>${CONFIG.phone}</b></a>`);
  return `<div class="sp-announce" role="region" aria-label="Съобщения"><div class="sp-announce__in">${msgs.map((m, i) => `<p class="${i ? '' : 'on'}">${m}</p>`).join('')}</div></div>`;
}
function rotateAnnounce(h) {
  const ps = $$('.sp-announce p', h);
  if (ps.length < 2 || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  let i = 0;
  setInterval(() => { ps[i].classList.remove('on'); i = (i + 1) % ps.length; ps[i].classList.add('on'); }, 4500);
}

/* ---------- менюто ---------- */
function megaHtml() {
  return `<div class="sp-mega" role="menu"><div class="wrap sp-mega__in">${CATEGORIES.map(c => `
    <div class="sp-mega__col"><a class="sp-mega__cat" href="${L.products}?cat=${c.id}">${esc(c.name)} →</a>
      <ul>${PRODUCTS.filter(p => p.cat === c.id).map(p => `<li><a href="${productUrl(p.id)}"><img src="${productLook(p).img}" alt="" loading="lazy" width="48" height="48"><span>${esc(p.shortName)}<small>${p.packs ? 'от ' : ''}${fmt(fromPrice(p))}</small></span></a></li>`).join('')}</ul></div>`).join('')}
    <a class="sp-mega__all" href="${L.products}">Всички ${PRODUCTS.length} продукта →</a></div></div>`;
}
function shopHeader(h) {
  const here = location.pathname.replace(/\/$/, '') || '/';
  h.innerHTML = `
    ${announceHtml()}
    <header class="sp-header"><div class="wrap sp-header__row">
      <button class="sp-icon sp-burger" type="button" aria-label="Меню" aria-expanded="false">${ICON.menu}</button>
      <a class="sp-logo" href="${L.home}" aria-label="Здравец Натура – начало"><img src="${LIFESTYLE.logo}" alt="Здравец Натура – натурална козметика" width="186" height="80"></a>
      <nav class="sp-nav" aria-label="Главно меню">
        <a href="${L.home}" class="${here === L.home ? 'on' : ''}">Начало</a>
        <div class="sp-nav__mega"><a href="${L.products}" class="${here === L.products ? 'on' : ''}" aria-haspopup="true">Продукти ${ICON.chevron}</a>${megaHtml()}</div>
        ${bfOn() ? `<a href="${L.bf}" class="sp-nav__bf">★ Черен петък</a>` : ''}
        <a href="${L.delivery}" class="${here === L.delivery ? 'on' : ''}">Доставка</a>
        <a href="${L.contacts}" class="${here === L.contacts ? 'on' : ''}">Контакти</a>
      </nav>
      <div class="sp-actions">
        <a class="sp-phone" href="tel:${CONFIG.phoneHref}">${ICON.phone}<span><small>Поръчка по телефона</small>${CONFIG.phone}</span></a>
        <div class="fs-tools" aria-label="Размер на текста"><button type="button" data-fs="-" aria-label="По-малък текст">A−</button><button type="button" data-fs="+" aria-label="По-голям текст">A+</button></div>
        <button class="sp-icon sp-search-btn" type="button" aria-label="Търсене">${ICON.search}</button>
        <button class="sp-icon sp-cart-btn" type="button" aria-label="Количка">${ICON.bag}<span class="sp-count is-zero" data-cart-count aria-live="polite">0</span></button>
      </div>
    </div>
    <div class="sp-search" hidden><div class="wrap">
      <form class="sp-search__form" role="search"><span class="sp-search__ico">${ICON.search}</span><input type="search" placeholder="Търси продукт – напр. гел, крем, пластири…" aria-label="Търси продукт" autocomplete="off"><button class="sp-icon" type="button" data-search-close aria-label="Затвори">${ICON.close}</button></form>
      <div class="sp-search__res"></div>
    </div></div></header>`;
  rotateAnnounce(h);
  $$('[data-fs]', h).forEach(b => b.addEventListener('click', () => { let i = local.get('zn_fs', 0); i = b.dataset.fs === '+' ? Math.min(2, i + 1) : Math.max(0, i - 1); applyFs(i); }));
  $('.sp-cart-btn', h).addEventListener('click', () => openCart());
  $('.sp-burger', h).addEventListener('click', () => openMenu());
  // търсене
  const box = $('.sp-search', h), input = $('input', box), res = $('.sp-search__res', box);
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const list = (q ? PRODUCTS.filter(p => [p.name, p.shortName, p.short, catOf(p).name].join(' ').toLowerCase().includes(q)) : PRODUCTS.filter(p => p.bestseller)).slice(0, 8);
    res.innerHTML = list.length
      ? `<p class="sp-search__lbl">${q ? 'Продукти' : 'Най-търсени'}</p><div class="sp-search__grid">${list.map(p => `<a href="${productUrl(p.id)}"><img src="${productLook(p).img}" alt="" width="64" height="64" loading="lazy"><span><b>${esc(p.shortName)}</b><small>${esc(catOf(p).name)} · ${p.packs ? 'от ' : ''}${fmt(fromPrice(p))}</small></span></a>`).join('')}</div>`
      : `<p class="sp-search__none">Няма продукт с „${esc(input.value)}“. Обади се на <a href="tel:${CONFIG.phoneHref}">${CONFIG.phone}</a> – ще помогнем.</p>`;
  };
  $('.sp-search-btn', h).addEventListener('click', () => { box.hidden = !box.hidden; if (!box.hidden) { draw(); input.focus(); } });
  $('[data-search-close]', h).addEventListener('click', () => { box.hidden = true; });
  input.addEventListener('input', draw);
  $('form', box).addEventListener('submit', e => { e.preventDefault(); const a = $('.sp-search__grid a', res); if (a) location.href = a.href; });
  // при скрол менюто става по-ниско
  const hd = $('.sp-header', h);
  addEventListener('scroll', () => hd.classList.toggle('is-scrolled', scrollY > 40), { passive: true });
  shopPanels();
}

/* ---------- менюто на телефона и количката (плъзгат се отстрани) ---------- */
function shopPanels() {
  if ($('.sp-drawer')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div class="sp-overlay" hidden></div>
  <aside class="sp-drawer" aria-label="Количка" aria-hidden="true" tabindex="-1">
    <div class="sp-drawer__head"><h2>Количка <span data-drawer-count></span></h2><button class="sp-icon" type="button" data-close-panels aria-label="Затвори">${ICON.close}</button></div>
    <div class="sp-drawer__body"></div>
    <div class="sp-drawer__foot"></div>
  </aside>
  <aside class="sp-menu" aria-label="Меню" aria-hidden="true" tabindex="-1">
    <div class="sp-drawer__head"><a class="sp-logo" href="${L.home}"><img src="${LIFESTYLE.logo}" alt="Здравец Натура" width="140" height="60"></a><button class="sp-icon" type="button" data-close-panels aria-label="Затвори">${ICON.close}</button></div>
    <nav class="sp-menu__nav">
      <a href="${L.home}">Начало</a>
      ${bfOn() ? `<a href="${L.bf}" class="sp-nav__bf">★ Черен петък</a>` : ''}
      <a href="${L.products}">Всички продукти</a>
      ${CATEGORIES.map(c => `<details><summary>${esc(c.name)} ${ICON.chevron}</summary><ul>${PRODUCTS.filter(p => p.cat === c.id).map(p => `<li><a href="${productUrl(p.id)}"><img src="${productLook(p).img}" alt="" width="44" height="44" loading="lazy">${esc(p.shortName)}</a></li>`).join('')}</ul></details>`).join('')}
      <a href="${L.delivery}">Доставка и плащане</a>
      <a href="${L.contacts}">Контакти</a>
    </nav>
    <div class="sp-menu__foot">
      <a class="bv-btn sp-wide" href="tel:${CONFIG.phoneHref}">📞 ${CONFIG.phone}</a>
      <p>${esc(CONFIG.hours)}</p>
      <div class="fs-tools" aria-label="Размер на текста"><span>Размер на текста:</span><button type="button" data-fs="-" aria-label="По-малък текст">A−</button><button type="button" data-fs="+" aria-label="По-голям текст">A+</button></div>
    </div>
  </aside>`;
  while (wrap.firstElementChild) ROOT.appendChild(wrap.firstElementChild);
  $$('[data-close-panels]').forEach(b => b.addEventListener('click', closePanels));
  $('.sp-overlay').addEventListener('click', closePanels);
  addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });
  $$('.sp-menu [data-fs]').forEach(b => b.addEventListener('click', () => { let i = local.get('zn_fs', 0); i = b.dataset.fs === '+' ? Math.min(2, i + 1) : Math.max(0, i - 1); applyFs(i); }));
}
function showPanel(el) {
  closePanels(true);
  $('.sp-overlay').hidden = false;
  requestAnimationFrame(() => { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); $('.sp-overlay').classList.add('on'); el.focus({ preventScroll: true }); });
  document.documentElement.style.overflow = 'hidden';
}
function closePanels(keep) {
  $$('.sp-drawer.open,.sp-menu.open').forEach(el => { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); });
  const ov = $('.sp-overlay');
  if (ov && keep !== true) { ov.classList.remove('on'); setTimeout(() => { if (!ov.classList.contains('on')) ov.hidden = true; }, 300); }
  if (keep !== true) document.documentElement.style.overflow = '';
}
function openMenu() { shopPanels(); showPanel($('.sp-menu')); }

let cartBusy = false;
async function openCart() {
  shopPanels();
  const d = $('.sp-drawer');
  showPanel(d);
  $('.sp-drawer__body', d).innerHTML = '<p class="sp-drawer__loading">Зареждаме количката…</p>';
  drawCart(await Cart.get());
}
function drawCart(o) {
  const d = $('.sp-drawer');
  if (!d) return;
  const items = o.items || [];
  const body = $('.sp-drawer__body', d), foot = $('.sp-drawer__foot', d);
  const main = items.filter(i => !isGift(i) && !inComboOf(i.productId));
  const sub = items.reduce((s, i) => s + (+i.price || 0), 0);
  $('[data-drawer-count]', d).textContent = main.length ? `(${countOf(o)})` : '';
  if (!main.length) {
    body.innerHTML = `<div class="sp-empty"><div class="sp-empty__ico">${ICON.bag}</div><h3>Количката е празна</h3><p>Разгледай продуктите – поръчката отнема по-малко от минута.</p>
      <a class="bv-btn sp-wide" href="${bfOn() ? L.bf : L.products}">${bfOn() ? '★ Офертите за Черен петък' : 'Към продуктите'}</a>
      <div class="sp-recs"><p class="sp-recs__lbl">Най-поръчвани</p>${recs([]).map(recRow).join('')}</div></div>`;
    foot.innerHTML = '';
    bindAddButtons(body);
    return;
  }
  const dm = dealsMsg(items);
  const offers = halfOffers(items).slice(0, 3);
  const line = i => {
    const info = storeInfo(i.productId);
    const c = info.combo;
    const parts = c ? items.filter(x => inComboOf(x.productId)).map(x => P(inComboOf(x.productId)).shortName) : [];
    return `<div class="sp-line" data-id="${i.productId}">
      <a class="sp-line__img"${info.url ? ` href="${info.url}"` : ''}><img src="${info.img}" alt="" width="84" height="84" loading="lazy"></a>
      <div class="sp-line__txt"><b>${esc(info.name || i.title)}</b>
        ${c ? `<small>${parts.map(esc).join(' · ')}</small>` : ''}
        ${info.half ? `<small class="sp-half-tag">½ цена – поръчката е над ${fmt(HALF_FROM)}</small>` : ''}
        <div class="sp-line__row">${c ? '<span class="sp-line__fixed">1 комплект</span>' : `<div class="sp-qty"><button type="button" data-q="-1" aria-label="По-малко">−</button><span>${i.quantity || 1}</span><button type="button" data-q="1" aria-label="Повече">+</button></div>`}
          <span class="sp-line__price">${info.half ? `<s>${fmt(info.p.price * (i.quantity || 1))}</s> ` : ''}${fmt(+i.price || 0)}</span></div>
        <button class="sp-line__rm" type="button" data-rm>${ICON.trash} Премахни</button></div></div>`;
  };
  const gift = items.find(isGift);
  body.innerHTML = `
    ${dm ? `<div class="sp-ship${dm.done ? ' is-done' : ''}"><p>${dm.done ? '<span class="sp-ship__ok" aria-hidden="true">🎉</span>' : ICON.truck}<span>${dm.text}</span></p><div class="sp-ship__bar"><i style="width:${dm.pct}%"></i></div></div>` : ''}
    ${halfNote ? `<p class="sp-half-note">${esc(halfNote)}</p>` : ''}
    <div class="sp-lines">${main.map(line).join('')}
      ${gift ? `<div class="sp-line sp-line--gift"><span class="sp-line__img"><img src="${storeInfo(CONFIG.giftStoreId).img}" alt="" width="84" height="84"></span><div class="sp-line__txt"><b>🎁 Подарък: 12 пластира за стави и мускули</b><small>за Черния петък – към поръчка от ${GIFT_FROM} и повече броя</small><div class="sp-line__row"><span></span><span class="sp-line__price sp-free">${giftWas()} 0,00 €</span></div></div></div>` : ''}
    </div>
    ${offers.length
      ? `<div class="sp-recs sp-recs--half"><p class="sp-recs__lbl">Добави на половин цена</p>${offers.map(halfRow).join('')}</div>`
      : `<div class="sp-recs"><p class="sp-recs__lbl">Добави и…</p>${halfOn() ? `<p class="sp-recs__hint">Над ${fmt(HALF_FROM)} всеки следващ продукт е на <b>половин цена</b>.</p>` : ''}${recs(items).slice(0, 2).map(recRow).join('')}</div>`}`;
  foot.innerHTML = `
    <div class="sp-total"><span>Междинна сума</span><b>${fmt(sub)}</b></div>
    <p class="sp-note">Доставката (от ${fmt(SHIP_FROM)}) избираш в следващата стъпка.</p>
    <a class="bv-btn bv-btn--xl sp-wide" href="${L.checkout}">Към поръчката →</a>
    <p class="sp-trustline">💶 Плащаш при получаване · 🛡️ ${CONFIG.guaranteeDays} дни гаранция</p>
    <button class="sp-link" type="button" data-close-panels>← Продължи пазаруването</button>`;
  $$('[data-close-panels]', foot).forEach(b => b.addEventListener('click', closePanels));
  $$('.sp-line[data-id]', body).forEach(row => {
    const id = +row.dataset.id;
    const it = items.find(x => x.productId === id);
    $$('[data-q]', row).forEach(b => b.addEventListener('click', () => setQty(id, (it.quantity || 1) + +b.dataset.q, row)));
    const rm = $('[data-rm]', row); if (rm) rm.addEventListener('click', () => setQty(id, 0, row));
  });
  bindAddButtons(body);
}
async function setQty(id, q, row) {
  if (cartBusy) return;
  cartBusy = true;
  if (row) row.classList.add('is-busy');
  try {
    await Cart.remove(id);
    if (q > 0) await Cart.add(id, q);
    await syncCombos();
    await syncGift();
  } catch (e) { toast('Не успяхме да променим количката. Опитай пак или поръчай по телефона:', true); }
  cartBusy = false;
  const o = await Cart.get();
  updateCount(o);
  drawCart(o);
}
// предложения в количката: към ставите – пластири и спрей, към пластир – друг пластир, иначе най-поръчваните
function recs(items) {
  const ids = items.map(i => i.productId);
  const has = p => ids.includes(p.store);
  const inCart = items.map(i => storeInfo(i.productId).p).filter(Boolean);
  let pool;
  if (inCart.some(p => p.cat === 'stavi')) pool = ['gel', 'spray', 'hyal', 'bvpatch', 'beeherb'];
  else if (inCart.some(p => p.wellness)) pool = PRODUCTS.filter(p => p.wellness).map(p => p.id);
  else if (inCart.some(p => p.cat === 'kraka' || p.cat === 'koja')) pool = ['vein', 'nail', 'skin', 'ghk'];
  else pool = ['gel', 'beeherb', 'vein', 'skin'];
  // без продукта, който по време на Черния петък вече е подарък в поръчката;
  // първи са тези, с които поръчката стига безплатната доставка
  const sub = items.filter(i => !isGift(i)).reduce((t, i) => t + (+i.price || 0), 0);
  const left = FREE_FROM && sub > 0 ? FREE_FROM - sub : 0;
  const list = pool.map(P).filter(p => p && !has(p) && !inCart.includes(p) && !(bfOn() && items.some(isGift) && p.id === 'plastiri'));
  return left > 0 ? list.slice().sort((x, y) => (y.price >= left) - (x.price >= left)) : list;
}
// под прага: 1 бр. по редовна цена (бутонът добавя направо, без да води към страницата)
function recRow(p) {
  const lk = productLook(p);
  const one = p.wellness && comboReady() ? null : p.price;
  return `<div class="sp-rec"><a href="${productUrl(p.id)}"><img src="${lk.img}" alt="" width="60" height="60" loading="lazy"></a><div><a href="${productUrl(p.id)}"><b>${esc(p.shortName)}</b></a><small>${one ? fmt(one) : `от ${fmt(fromPrice(p))}`}</small></div>
    ${one ? `<button class="sp-rec__add" type="button" data-add="${p.id}">+ Добави</button>` : `<a class="sp-rec__add" href="${productUrl(p.id)}">Виж</a>`}</div>`;
}
// над прага: същият продукт на половин цена
function halfRow(p) {
  const lk = productLook(p);
  return `<div class="sp-rec sp-rec--half"><a href="${productUrl(p.id)}"><img src="${lk.img}" alt="" width="60" height="60" loading="lazy"></a><div><a href="${productUrl(p.id)}"><b>${esc(p.shortName)}</b></a><small><s>${fmt(p.price)}</s> <b class="sp-half__now">${fmt(halfPriceOf(p))}</b> <span class="sp-half__off">−50%</span></small></div>
    <button class="sp-rec__add sp-rec__add--half" type="button" data-add-half="${p.id}">+ Добави</button></div>`;
}

/* ---------- картата на продукта (магазин, начало, търсене) ---------- */
function shopCard(p) {
  const lk = productLook(p), cat = catOf(p);
  const tag = p.id === 'gel' && bfOn() ? '<span class="sp-badge sp-badge--bf">Черен петък</span>' : p.bestseller ? '<span class="sp-badge">Най-поръчван</span>' : p.wellness && comboReady() ? '<span class="sp-badge sp-badge--combo">2 за 22,90 €</span>' : '';
  return `<article class="sp-card" style="--pc:${lk.a};--pcd:${lk.d}">
    <a class="sp-card__media${lk.scene ? ' is-scene' : ''}${lk.gel ? ' is-gel' : ''}" href="${productUrl(p.id)}" aria-label="${esc(p.name)}">
      <img class="sp-card__img" src="${lk.img}" alt="${esc(p.name)}" loading="lazy" width="600" height="600">
      ${lk.scene && !CLEAN_PHOTOS.includes(p.id) ? `<img class="sp-card__alt" src="${p.img}" alt="" loading="lazy" width="600" height="600">` : ''}
      ${tag}
    </a>
    <div class="sp-card__body">
      <span class="sp-card__cat">${esc(cat.name)}</span>
      <h3><a href="${productUrl(p.id)}">${esc(p.shortName)}</a></h3>
      <p class="sp-card__size">${esc(p.size)}</p>
      <div class="sp-card__price">${p.packs ? '<small>от</small> ' : ''}${fmt(fromPrice(p))}</div>
      ${p.packs || (p.wellness && comboReady())
        ? `<a class="sp-card__btn" href="${productUrl(p.id)}">Избери ${p.packs ? 'комплект' : 'количество'}</a>`
        : `<button class="sp-card__btn" type="button" data-add="${p.id}">Добави в количката</button>`}
    </div></article>`;
}
