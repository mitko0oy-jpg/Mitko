/* =========================================================================
   Дългата страница на продукта – по реда и с ефектите на beeevenom.eu.
   renderLanding(p) пише страницата в #product; bvEffects(root) пуска ефектите.
   Съдържанието е в landing-data.js (LANDING, CAT_LANDING), цените – в data.js.
   ========================================================================= */

const WAVE = color => `<div class="bv-wave" aria-hidden="true" style="color:${color}"><svg class="bv-wave__back" viewBox="0 0 2880 80" preserveAspectRatio="none"><path d="M0 46C240 16 480 16 720 46S1200 76 1440 46 1920 16 2160 46 2640 76 2880 46V80H0Z"/></svg><svg class="bv-wave__front" viewBox="0 0 2880 80" preserveAspectRatio="none"><path d="M0 40C240 70 480 70 720 40S1200 10 1440 40 1920 70 2160 40 2640 10 2880 40V80H0Z"/></svg></div>`;
const HEX_SPOTS = [[4, 12, 46, 0, 9], [90, 8, 34, 1.5, 11], [82, 46, 54, .8, 10], [8, 62, 30, 2.2, 12], [48, 92, 40, 3, 9.5], [94, 86, 26, 1.1, 13]];
const hexes = t => `<div class="bv-hexes" aria-hidden="true">${HEX_SPOTS.map(([x, y, w, d, tt]) => t
  ? `<svg class="bv-hex bv-hex--s" style="left:${x}%;top:${y}%;width:${w}px;animation-delay:${d}s;animation-duration:${tt}s" viewBox="0 0 24 24"><path d="${SHAPES[t.shape]}"/></svg>`
  : `<svg class="bv-hex" style="left:${x}%;top:${y}%;width:${w}px;animation-delay:${d}s;animation-duration:${tt}s" viewBox="0 0 56 64"><path d="M28 2 54 17v30L28 62 2 47V17Z"/></svg>`).join('')}</div>`;
const SPARKS = `<span class="bv-sparks" aria-hidden="true">${[[9, 5, 0], [22, 7, 1.3], [35, 4, 2.4], [48, 6, .6], [61, 5, 1.9], [74, 7, .9], [88, 4, 2.9], [55, 3, 3.3]]
  .map(([l, s, d]) => `<i style="left:${l}%;width:${s}px;height:${s}px;animation-delay:${d}s"></i>`).join('')}</span>`;
const HONEY = BVM(BV.extra, 'honey-drop.webp');
const FLOAT_SPOTS = [[3, 20, 74, .8], [97, 38, 54, .5], [95, 84, 124, .9], [6, 78, 44, .4]];
const floaters = t => `<div class="bv-floaters" aria-hidden="true">${FLOAT_SPOTS.map(([x, y, sz, z]) => `<span class="bv-floater${t ? ' bv-floater--s' : ''}" style="--fx:${x}%;--fy:${y}%;--flsz:${t ? Math.round(sz * .62) : sz}px;--fz:${z}">${t
  ? `<svg viewBox="0 0 24 24"><path d="${SHAPES[t.shape]}"/></svg>`
  : `<img src="${HONEY}" alt="" loading="lazy" decoding="async">`}</span>`).join('')}</div>`;

/* ---------- характерът на продукта (THEMES в landing-data.js) ---------- */
const SHAPES = {
  drop: 'M12 2.5C12 2.5 5 10.6 5 15.2a7 7 0 0 0 14 0C19 10.6 12 2.5 12 2.5Z',
  bubble: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z',
  dot: 'M12 6.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11Z',
  leaf: 'M20.5 3.5C11 3.5 4 8.5 4 17.5c0 1 .1 2 .3 3C13.5 20.5 20.5 14 20.5 3.5ZM4.3 20.5C8 14 12 10.5 17 7.5',
  sparkle: 'M12 1.5c.9 5.6 4.9 9.6 10.5 10.5c-5.6.9-9.6 4.9-10.5 10.5c-.9-5.6-4.9-9.6-10.5-10.5C7.1 11.1 11.1 7.1 12 1.5Z',
  heart: 'M12 21s-8.5-5.4-8.5-11.2A4.8 4.8 0 0 1 12 6.9a4.8 4.8 0 0 1 8.5 2.9C20.5 15.6 12 21 12 21Z',
  bolt: 'M13.5 1.5 4 13.5h7l-1.5 9 10-12.5h-7.2l1.2-8.5Z',
  flame: 'M12 1.5c.8 4.2 6.5 6.6 6.5 13a6.5 6.5 0 0 1-13 0c0-3.4 2-5.6 3.3-7.4.2 2.2 1.2 3.6 2.6 3.9C11 8.2 10.8 4.6 12 1.5Z',
  sun: 'M12 6.2a5.8 5.8 0 1 0 0 11.6a5.8 5.8 0 1 0 0-11.6ZM12 .8v3M12 20.2v3M.8 12h3M20.2 12h3M4.1 4.1l2.1 2.1M17.8 17.8l2.1 2.1M4.1 19.9l2.1-2.1M17.8 6.2l2.1-2.1'
};
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixC = (a, b, k) => { const x = hexRgb(a), y = hexRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const rgbT = h => hexRgb(h).join(',');
function themeVars(t) {
  const W = '#ffffff', K = '#000000', { a, d, n } = t;
  const bg = t.bg || mixC(a, W, .955), sh = rgbT(mixC(n, K, .1));
  const pat = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g fill="none" stroke="${a}" stroke-opacity=".2" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path transform="translate(6 6) scale(.9)" d="${SHAPES[t.shape]}"/><path transform="translate(38 36) scale(.75) rotate(20 12 12)" d="${SHAPES[t.shape]}"/></g></svg>`;
  return {
    '--honey': a, '--honey-d': d, '--honey-50': mixC(a, W, .92), '--honey-100': mixC(a, W, .8), '--cream': bg,
    '--night': n, '--night-2': mixC(n, W, .08), '--ink': mixC(n, K, .15), '--ink-2': mixC(n, W, .22), '--muted': mixC(n, W, .38), '--line': mixC(a, W, .84),
    '--acc': mixC(d, K, .12), '--acc-d': mixC(d, K, .2), '--acc2': mixC(d, K, .05), '--gt1': mixC(d, K, .3), '--gt2': d, '--gt3': a,
    '--tx': mixC(a, W, .35), '--dkt': mixC(n, W, .9), '--dkm': mixC(n, W, .78), '--dkm2': mixC(n, W, .7),
    '--hl': mixC(a, W, .3), '--bd': mixC(a, W, .55), '--tint1': mixC(a, W, .62), '--tint2': mixC(a, W, .86),
    '--tglow': rgbT(mixC(a, W, .35)), '--t1rgb': rgbT(a), '--t2rgb': rgbT(d), '--tint1rgb': rgbT(mixC(a, W, .62)), '--tint2rgb': rgbT(mixC(a, W, .86)),
    '--creamrgb': rgbT(bg), '--sh': sh,
    '--shadow': `0 1px 2px rgba(${sh},.06),0 8px 24px rgba(${sh},.08)`, '--shadow-l': `0 2px 6px rgba(${sh},.08),0 22px 50px rgba(${sh},.14)`,
    '--pat': `url("data:image/svg+xml,${encodeURIComponent(pat)}")`,
    '--dust-a': rgbT(mixC(a, W, .85)), '--dust-b': rgbT(mixC(a, W, .4)), '--dust-c': rgbT(a),
    '--seal1': mixC(a, W, .45), '--seal2': a, '--seal3': d,
    // тъмно начало: заглавието и малките надписи светят в цвета на продукта
    ...(t.dark ? { '--gt1': a, '--gt2': mixC(a, W, .35), '--gt3': mixC(a, W, .6), '--acc2': mixC(a, W, .3) } : {})
  };
}
const DECO_SPOTS = [[-7, 12, 46, 0], [90, 2, 32, 1.2], [97, 50, 40, .6], [-3, 66, 30, 2], [80, 86, 26, 1.6]];
const stageDeco = t => t ? DECO_SPOTS.map(([x, y, w, dl]) => `<span class="bv-deco" aria-hidden="true" style="left:${x}%;top:${y}%;width:${w}px;animation-delay:-${dl}s"><svg viewBox="0 0 24 24"><path d="${SHAPES[t.shape]}"/></svg></span>`).join('') : '';
const GRAD = '<svg class="bv-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><linearGradient id="bvp-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--tint2)"/><stop offset=".45" style="stop-color:var(--honey)"/><stop offset="1" style="stop-color:var(--honey-d)"/></linearGradient></defs></svg>';

const hTxt = a => a ? `${esc(a[0] || '')}${a[1] ? `<em class="bv-accent">${esc(a[1])}</em>` : ''}${esc(a[2] || '')}` : '';
const arr = '<span class="bv-arr">→</span>';
function bvMedia(m, alt, w, h, cls = 'bv-loop') {
  if (!m) return '';
  if (typeof m === 'string') return `<img class="${cls}" src="${m}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">`;
  return `<video class="${cls}" muted loop playsinline preload="none" width="${w}" height="${h}" poster="${m.poster}" aria-label="${esc(alt)}"><source data-src="${m.video}" type="video/mp4"></video>`;
}
function seal(big, small, ring, id) {
  return `<svg class="bv-seal10" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--seal1,#FFD983)"/><stop offset=".5" style="stop-color:var(--seal2,#E9A21C)"/><stop offset="1" style="stop-color:var(--seal3,#B86A00)"/></linearGradient><path id="${id}p" d="M60 60m-45 0a45 45 0 1 1 90 0a45 45 0 1 1-90 0"/></defs>
    <circle cx="60" cy="60" r="58" fill="url(#${id}g)"/><circle cx="60" cy="60" r="52" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="2 3"/>
    <g class="bv-seal10__ring"><text font-family="Manrope,sans-serif" font-weight="800" font-size="8.6" fill="#3A2408" textLength="276" lengthAdjust="spacing"><textPath href="#${id}p">${esc(ring)}</textPath></text></g>
    <circle cx="60" cy="60" r="34" fill="#FFFBF3"/><text x="60" y="66" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="${big.length > 3 ? 21 : 27}" fill="#D62A1E">${esc(big)}</text>
    <text x="60" y="80" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="7.5" letter-spacing=".6" fill="#3A2408">${esc(small)}</text></svg>`;
}
function guaranteeSeal(days) {
  return `<svg class="bv-seal" viewBox="0 0 120 120" aria-hidden="true"><defs><path id="bv-sealc" d="M60 60m-43 0a43 43 0 1 1 86 0a43 43 0 1 1-86 0"/></defs>
    <circle cx="60" cy="60" r="57" style="fill:var(--honey)"/><circle cx="60" cy="60" r="50" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 4"/><circle cx="60" cy="60" r="34" fill="#fff"/>
    <g class="bv-seal__ring"><text font-family="Manrope,sans-serif" font-weight="800" font-size="9.5" fill="#24180C" letter-spacing="1.6"><textPath href="#bv-sealc">ГАРАНЦИЯ · ВРЪЩАМЕ ПАРИТЕ · ГАРАНЦИЯ ·</textPath></text></g>
    <text x="60" y="63" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="30" fill="#D62A1E">${days}</text>
    <text x="60" y="78" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="11" fill="#24180C">ДНИ</text></svg>`;
}
const isBee = p => /пчелна отрова|beevenom/i.test(p.name + ' ' + p.short);

/* офертите на продукта: комплекти от PACKS или единичната цена */
function landingOffers(p, d) {
  const gift = bfOn(); // подаръкът на Черния петък върви с всяка поръчка (syncGift)
  const unit = p.price;
  const list = p.packs ? PACKS[p.packs] : [{ key: p.id, label: '1 брой', sub: p.size, store: p.store, price: p.price }];
  const best = list.reduce((a, k) => (k.price / (packQty(p, k) || 1) < a.price / (packQty(p, a) || 1) ? k : a), list[0]);
  return list.map(k => {
    const bundle = k.bundle ? B(k.bundle) : null;
    const qty = packQty(p, k);
    const regular = bundle ? bundle.items.reduce((s, [id, n]) => s + P(id).price * n, 0) : unit * qty;
    const off = regular > k.price + .01 ? Math.round((1 - k.price / regular) * 100) : 0;
    const hot = !!k.featured && list.length > 1;
    const isBest = !hot && list.length > 2 && k === best;
    const sc = sceneOf(p.id);
    const m = (d.packMedia && d.packMedia[k.key]) || (bundle && (bundle.img || (bundle.collage && bundle.collage[0][0]))) || (sc ? sc.small : p.img);
    const lis = [];
    if (gift) lis.push(`<li class="bv-gift"><span><b>+ ${esc(GIFT_TEXT.replace(' подарък', ''))}</b> – подарък до 30 ноември</span></li>`);
    if (bundle && bundle.note) lis.push(`<li>${esc(bundle.note)}</li>`);
    else if (qty === 1) lis.push(`<li>${list.length > 1 ? 'За да пробваш' : esc(p.bullets[0])}</li>`);
    if (qty > 1 || bundle) lis.push(`<li>${esc(bundle ? bundle.line : `${qty} броя`)}</li>`);
    if (off) lis.push(`<li class="bv-save">Спестяваш ${fmt(regular - k.price)}</li>`);
    else lis.push(`<li>${CONFIG.guaranteeDays} дни гаранция</li>`);
    if (freeShipFor(k.price)) lis.push('<li class="bv-save">Безплатна доставка до офис</li>');
    const per = qty > 1 ? `само ${fmt(k.price / qty)} за брой` : 'Плащаш при получаване';
    return `<article class="bv-pack${hot ? ' bv-pack--hot' : ''}${isBest ? ' bv-pack--best' : ''}">
      ${hot ? '<span class="bv-ribbon">⭐ Най-избиран</span>' : isBest ? '<span class="bv-ribbon bv-ribbon--gold">💰 Най-изгоден</span>' : ''}
      ${off ? `<span class="bv-off">−${off}%</span>` : ''}
      <div class="bv-pack__media">${bvMedia(m, k.label, 640, 512)}${SPARKS}</div>
      <div class="bv-pack__body">
        <h3>${esc(k.label)}</h3>
        <p class="bv-pack__sub">${esc(String(k.sub || p.size).replace(/ · най-(избиран|изгодно)$/, ''))}</p>
        <ul>${lis.join('')}</ul>
        <div class="bv-price"><b${off ? ` data-from="${regular.toFixed(2)}"` : ''}>${fmt(k.price)}</b>${off ? `<s>${fmt(regular)}</s>` : ''}</div>
        <p class="bv-unit">${per}</p>
        <button class="bv-btn${hot ? ' bv-pulse' : ''}" type="button" data-bv-buy="${k.store}" data-bv-key="${esc(k.key)}">Избирам този пакет</button>
        <p class="bv-pack__note"><span>💶 Плащаш при получаване</span><span>🚚 Пристига: <b class="bv-eta-short">до 2 работни дни</b></span></p>
      </div></article>`;
  }).join('');
}
function packQty(p, k) {
  const b = k.bundle ? B(k.bundle) : null;
  if (b) return b.items.filter(([id]) => id === p.id).reduce((s, [, n]) => s + n, 0) || 1;
  const m = /^(\d+)/.exec(k.label);
  return m ? +m[1] : 1;
}

/* ---------- уелнес пластирите: кръгът на формулата, трите слоя, местата за залепване ---------- */
const JAR_SVG = '<svg class="bv-vs__jar" viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="10" width="36" height="12" rx="4" fill="#C9BBA8"/><rect x="10" y="20" width="44" height="36" rx="9" fill="#E8DFD2" stroke="#C9BBA8" stroke-width="2"/><rect x="18" y="32" width="28" height="12" rx="3" fill="#F7F2EA"/></svg>';
const PILLS_SVG = '<svg class="bv-vs__jar" viewBox="0 0 64 64" aria-hidden="true"><rect x="19" y="6" width="26" height="10" rx="3" fill="#C9BBA8"/><rect x="15" y="14" width="34" height="44" rx="8" fill="#E8DFD2" stroke="#C9BBA8" stroke-width="2"/><rect x="20" y="28" width="24" height="14" rx="3" fill="#F7F2EA"/><g transform="rotate(-35 46 50)"><rect x="34" y="44" width="24" height="11" rx="5.5" fill="#fff" stroke="#B9A994" stroke-width="1.6"/><path d="M46 44v11" stroke="#B9A994" stroke-width="1.6"/><path d="M46 44.8h6.5a4.7 4.7 0 0 1 0 9.4H46z" fill="#D9CCBA"/></g></svg>';
const ingShort = n => {
  const t = String(n).replace(/^Екстракт от /i, '').replace(/^Кора от /i, '').replace(/^Гъба /i, '').replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/[„“"]/g, '').replace(/^Витамини от група B$/i, 'Витамини B').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
function ingRing(p, ings) {
  const list = ings.slice(0, 7);
  return `<div class="bv-ring" style="--n:${list.length}">
    <span class="bv-ring__orbit" aria-hidden="true"></span>
    <div class="bv-ring__core"><img src="${productLook(p).img}" alt="${esc(p.name)}" loading="lazy" decoding="async"><span class="bv-ring__cap">${list.length} съставки</span></div>
    <ul class="bv-ring__list" aria-label="Съставки">${list.map(([n], i) => `<li style="--i:${i}"><span class="bv-ring__spin"><span class="bv-ring__b"><i aria-hidden="true">${ingIcon(n)}</i><b>${esc(ingShort(n))}</b></span></span></li>`).join('')}</ul>
  </div>`;
}
/* силует отпред; точките са местата за залепване – по реда на ZONE_AT */
const ZONE_AT = { 'ръка': [56, 120], 'китка': [157, 196], 'гърди': [84, 98], 'корем': [102, 150], 'хълбок': [128, 188] };
const bodySvg = zones => `<svg class="bv-body" viewBox="0 0 200 350" role="img" aria-label="Местата за залепване на пластира">
  <g class="bv-body__fig"><circle cx="100" cy="36" r="23"/><rect x="91" y="54" width="18" height="16" rx="6"/><rect x="60" y="68" width="80" height="132" rx="30"/>
    <path d="M66 84 40 206M134 84l26 122" stroke-width="20"/><path d="M84 192 79 338M116 192l5 146" stroke-width="27"/></g>
  ${zones.map(([, k], i) => { const [x, y] = ZONE_AT[k] || [100, 120]; return `<g class="bv-body__dot" style="--d:${(i * .5).toFixed(1)}s"><circle class="bv-body__ping" cx="${x}" cy="${y}" r="10"/><circle class="bv-body__pt" cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y + 4}" text-anchor="middle">${i + 1}</text></g>`; }).join('')}
</svg>`;
function layersSection(L, p) {
  if (!L) return '';
  const plate = (i, cls) => `<div class="bv-plate bv-plate--${i + 1}"><div class="bv-plate__face ${cls}"></div><span class="bv-plate__n">${i + 1}</span></div>`;
  return `
  <section class="bv-layers"><div class="bv-wrap">
    <div class="bv-center"><span class="bv-eyebrow">${esc(L.eyebrow)}</span><h2>${hTxt(L.h2)}</h2><p class="bv-lead">${esc(L.lead)}</p></div>
    <div class="bv-layers__grid">
      <div class="bv-layers__stack bv-rv" aria-hidden="true">${plate(0, 'bv-plate__face--top')}${plate(1, 'bv-plate__face--mid')}${plate(2, 'bv-plate__face--glue')}</div>
      <ol class="bv-layers__list">${L.items.map(([h, t], i) => `<li class="bv-rv" style="--bv-d:${(i * .15).toFixed(2)}s"><span class="bv-layers__n">${i + 1}</span><div><h3>${esc(h)}</h3><p>${esc(t)}</p></div></li>`).join('')}</ol>
    </div>
    ${L.zones ? `<div class="bv-zones">
      <div class="bv-zones__fig bv-rv">${bodySvg(L.zones)}</div>
      <div class="bv-zones__txt">
        <h3>Къде да го залепиш?</h3>
        <ol class="bv-zones__list">${L.zones.map(([t], i) => `<li><span>${i + 1}</span>${esc(t)}</li>`).join('')}</ol>
        ${L.when ? `<p class="bv-zones__lbl">Носиш го навсякъде – до 8 часа</p><div class="bv-zones__when">${L.when.map(([ic, t]) => `<span><i aria-hidden="true">${ic}</i>${esc(t)}</span>`).join('')}</div>` : ''}
        ${L.note ? `<div class="bv-note"><span>🔄</span><span>${esc(L.note)}</span></div>` : ''}
      </div>
    </div>` : ''}
  </div></section>`;
}

function renderLanding(p) {
  const d = LANDING[p.id] || {};
  const c = CAT_LANDING[p.cat] || {};
  const theme = THEMES[p.id] || null;
  const cat = CATEGORIES.find(x => x.id === p.cat);
  const bee = isBee(p);
  const days = CONFIG.guaranteeDays;
  const packs = p.packs ? PACKS[p.packs] : null;
  const minUnit = packs ? Math.min(...packs.map(k => k.price / (packQty(p, k) || 1))) : p.price;
  const ings = (p.ingredients || []).filter(x => x && x[0]);
  const reviews = REVIEWS.filter(x => p.shortName.toLowerCase().startsWith(String(x.product).toLowerCase()));
  const shots = d.shots || [];
  const offersId = 'bv-offers';
  const toOffers = `#${offersId}`;

  // --- hero
  const h1 = d.h1 || [p.shortName + ' ', 'без хапчета и вода', ''];
  const h1sub = d.h1sub || (p.wellness ? ['Един пластир на ден – ', '30 броя за цял месец'] : null);
  const eyebrow = d.eyebrow || (p.wellness ? '🩹 Уелнес пластир за всеки ден' : `🌿 ${cat.name}`);
  const badge = d.badge || { img: bee ? BVM(BV.extra, 'bee-side.webp') : p.img, name: cat.name, strong: p.name, eq: esc(p.size) };
  const legend = d.legend || (c.legend ? c.legend : ings.slice(0, 4).map(([n, t]) => [ingIcon(n), n, t.split(/ — |, | – /)[0]]));
  const scene = sceneOf(p.id);
  const stage = d.stage || (scene ? { img: scene.img, small: scene.small, video: scene.video, scene: true } : { img: p.img, plain: true });
  const still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sealArgs = stage.seal || [String(days), 'ДНИ ГАРАНЦИЯ', 'ПЛАЩАШ ПРИ ПОЛУЧАВАНЕ • ДОСТАВКА 1–2 ДНИ •'];
  const legendHtml = legend.length ? `<ul class="bv-inglegend bv-glass" aria-label="Съставки">${legend.map(([ic, b, s]) =>
    `<li>${/^https?:/.test(ic) ? `<img src="${ic}" alt="" width="40" height="40">` : `<span class="bv-legico" aria-hidden="true">${ic}</span>`}<span><b>${esc(b)}</b><small>${esc(s || '')}</small></span></li>`).join('')}</ul>` : '';
  const hero = `
  <section class="bv-hero${stage.plain ? ' bv-hero--plain' : ''}${stage.scene ? ' bv-hero--scene' : ''}">
    ${!theme && (d.bg || (bee && !stage.plain)) ? `<div class="bv-hero__bg" aria-hidden="true"><img src="${BVM(BV.hero, 'hero-bg-a-2000.webp')}" alt="" width="2000" height="1125" fetchpriority="high"></div>` : '<div class="bv-hero__bg bv-hero__bg--soft" aria-hidden="true"></div>'}
    <canvas class="bv-dust" aria-hidden="true"></canvas>
    <div class="bv-wrap bv-hero__grid">
      <div class="bv-hero__copy">
        <span class="bv-eyebrow bv-glass">${esc(eyebrow)}</span>
        <h1>${esc(h1[0])}<em class="bv-accent bv-goldtext">${esc(h1[1])}</em>${esc(h1[2] || '')}${h1sub ? `<span class="bv-h1sub">${esc(h1sub[0])}<em class="bv-accent">${esc(h1sub[1])}</em></span>` : ''}</h1>
        <div class="bv-fbadge bv-glass"><img src="${badge.img}" alt="" width="58" height="58" decoding="async"><p class="bv-fbadge__txt"><span class="bv-fbadge__name">${esc(badge.name)}</span><strong>${esc(badge.strong)}</strong><span class="bv-fbadge__eq">${badge.eq}</span></p></div>
        <p class="bv-lead">${esc(d.lead || p.short)}</p>
        <div class="bv-proof bv-glass"><span class="bv-stars" aria-hidden="true">★★★★★</span><strong>${shots.length || reviews.length ? 'Истински отзиви от наши клиенти' : 'Плащаш чак когато пратката е в ръцете ти'}</strong></div>
        <div class="bv-cta-row">
          <a class="bv-btn bv-btn--xl bv-pulse" href="${toOffers}">Поръчай сега ${arr}</a>
          <a class="bv-btn-ghost bv-glass" href="tel:${CONFIG.phoneHref}">📞 ${CONFIG.phone}</a>
        </div>
        <p class="bv-from">${packs ? 'Комплекти от' : 'Цена'} <b>${fmt(minUnit)}</b>${packs ? ' за брой' : ''} · без предплащане</p>
        <div class="bv-micro"><span>Плащаш при получаване</span><span>Доставка 1–2 дни</span><span>${days} дни гаранция</span></div>
      </div>
      <div class="bv-stage">
        <div class="bv-stage__inner"${stage.ratio ? ` style="aspect-ratio:${stage.ratio}"` : ''}>
          <div class="bv-stage__glow" aria-hidden="true"></div>
          ${stage.scene ? `<div class="bv-stage__card">${stage.video && !still
            ? `<video class="bv-stage__vid" autoplay muted loop playsinline preload="auto" poster="${stage.small}" aria-label="${esc(p.name)}"><source src="${stage.video}" type="video/mp4"></video>`
            : `<img class="bv-stage__img bv-kb" src="${stage.img}" srcset="${stage.small} 600w, ${stage.img} 1000w" sizes="(min-width:960px) 560px, 92vw" alt="${esc(p.name)}" fetchpriority="high" decoding="async">`}<span class="bv-stage__sheen" aria-hidden="true"></span></div>`
          : `<img class="bv-stage__img" src="${stage.img}"${stage.small ? ` srcset="${stage.small} 700w, ${stage.img} 1200w" sizes="(min-width:960px) 600px, 92vw"` : ''} alt="${esc(p.name)}" fetchpriority="high" decoding="async">`}
          ${stage.glint ? `<span class="bv-stage__glint" aria-hidden="true" style="-webkit-mask-image:url('${stage.small}');mask-image:url('${stage.small}')"></span>` : ''}
          ${stage.drop ? '<span class="bv-honeydrop" aria-hidden="true"></span>' : ''}
          ${seal(sealArgs[0], sealArgs[1], sealArgs[2], 'bvs-' + p.id)}
          ${bee || d.bee ? `<span class="bv-stage__bee" aria-hidden="true"><img src="${BVM(BV.hero, 'hero-bee.webp')}" alt="" width="320" height="320" decoding="async"></span>` : ''}
        </div>
        ${stageDeco(theme)}
        ${legendHtml}
      </div>
    </div>
  </section>
  <div class="bv-trust"><div class="bv-wrap bv-trust__grid">
    <div class="bv-trust__item"><span class="bv-ico">💶</span><div><strong>Плащаш при получаване</strong>на куриера, без предплащане</div></div>
    <div class="bv-trust__item"><span class="bv-ico">🚚</span><div><strong>1–2 работни дни</strong>Еконт или Спиди, до офис или адрес</div></div>
    <div class="bv-trust__item"><span class="bv-ico">🛡️</span><div><strong>${days} дни гаранция</strong>не си доволен – връщаме парите</div></div>
    <div class="bv-trust__item"><span class="bv-ico">📞</span><div><strong>${CONFIG.phone}</strong>поръчка и по телефона</div></div>
  </div></div>`;

  // --- познато ли ти е?
  const sits = d.sits || c.sits;
  const sitsHtml = sits ? `
  <section class="bv-situ"><div class="bv-wrap bv-center">
    <span class="bv-eyebrow">${esc(sits.eyebrow)}</span>
    <h2>${hTxt(sits.h2)}</h2>
    <p class="bv-lead">${esc(sits.lead)}</p>
    <div class="bv-sits">${sits.items.map(([t, m]) => typeof m === 'string' && !/^https?:/.test(m)
      ? `<figure class="bv-sit bv-sit--ico"><div class="bv-sit__ico" aria-hidden="true">${m}</div><p>${esc(t)}</p></figure>`
      : `<figure class="bv-sit"><div class="bv-sit__img">${bvMedia(m, t, 640, 480)}</div><p>${esc(t)}</p></figure>`).join('')}</div>
    <div class="bv-sits-foot"><a class="bv-btn" href="${toOffers}">${esc(sits.cta)} ${arr}</a></div>
  </div></section>` : '';

  // --- доставка
  const eta = `
  <section class="bv-eta"><div class="bv-wrap"><div class="bv-eta__box">
    <div class="bv-row"><span class="bv-ico">📦</span><div><strong>Поръчай днес – очаквана доставка: <span class="bv-eta-long">до 2 работни дни</span></strong>
      <span class="bv-eta__gift">${bfOn() ? `🎁 До 30 ноември – ${esc(GIFT_TEXT)} към всяка поръчка.` : FREE_FROM ? `🚚 Безплатна доставка до офис при поръчка над ${fmt(FREE_FROM)}.` : ''}</span></div></div>
    <a class="bv-btn" href="${toOffers}">Избери пакет</a>
  </div></div></section>`;

  // --- формулата (тъмен блок)
  const f = d.formula || c.formula || {};
  const stats = f.stats || c.stats || [[String(ings.length || 1), ings.length === 1 ? 'активна съставка' : 'активни съставки'], [String(days), 'дни гаранция'], ['1–2', 'работни дни до вратата ти'], ['0 €', 'предплащане – плащаш на куриера']];
  const formula = `
  <section class="bv-formula bv-honeycomb" id="bv-formula">
    ${WAVE('var(--night)')}
    <div class="bv-wrap bv-formula__grid">
      <div>
        <span class="bv-eyebrow">${esc(f.eyebrow || p.shortName)}</span>
        <h2>${f.h2 ? `${esc(f.h2[0])}<em class="bv-accent" style="color:var(--tx,#FFC65C)">${esc(f.h2[1])}</em>` : `${esc(p.shortName)} – <em class="bv-accent" style="color:var(--tx,#FFC65C)">накратко</em>`}</h2>
        <p class="bv-lead">${esc(f.lead || p.short)}</p>
        <div class="bv-stats">${stats.map(([n, t]) => `<div class="bv-stat"><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join('')}</div>
        <a class="bv-btn" href="${toOffers}">Поръчай сега ${arr}</a>
      </div>
      <figure class="bv-formula__fig bv-rv">${f.ring && ings.length > 1 ? ingRing(p, ings) : `<div class="bv-formula__media${f.media ? '' : ' bv-formula__media--img'}">${f.media
        ? bvMedia(f.media, p.name, 720, 1274, 'bv-formula__video')
        : `<img src="${(p.gallery && p.gallery[0]) || p.img}" alt="${esc(p.name)}" loading="lazy" decoding="async">`}</div>`}</figure>
    </div>
  </section>`;

  // --- защо го избират + качество + гаранция + ленти
  const bensD = d.bens;
  const icons = c.icons || ['✨', '🌿', '💧', '🛡️', '☀️', '🤲'];
  const bens = bensD ? bensD.items : p.bullets.map((b, i) => [icons[i % icons.length], b, '', null]);
  const tapesA = d.tapes || (p.wellness && ings.length ? ings.map(x => ingShort(x[0]).toUpperCase()) : null) || c.tapes || (ings.length ? ings.map(x => x[0].toUpperCase()) : p.bullets.map(b => b.toUpperCase()));
  const tapesB = ['ПЛАЩАШ ПРИ ПОЛУЧАВАНЕ', 'ДОСТАВКА 1–2 ДНИ', `${days} ДНИ ГАРАНЦИЯ`, 'ПРОИЗВЕДЕНО ЗА БЪЛГАРИЯ'];
  const tape = (cls, words) => `<div class="bv-tape ${cls}"><div class="bv-tape__track">${[...words, ...words, ...words, ...words].map(w => `<span>${esc(w)}</span><i>✦</i>`).join('')}</div></div>`;
  const why = `
  <section class="bv-why">
    ${hexes(theme)}
    <div class="bv-wrap">
      <div class="bv-center">
        <span class="bv-eyebrow">Какво получаваш</span>
        <h2>${bensD ? hTxt(bensD.h2) : `Защо да избереш <em class="bv-accent">${esc(p.shortName)}</em>`}</h2>
      </div>
      <div class="bv-bens${bens.some(b => b[3]) ? '' : ' bv-bens--plain'}">${bens.map(([ic, h, t, m, flip]) => `
        <article class="bv-ben${m ? '' : ' bv-ben--plain'}">
          ${m ? `<div class="bv-ben__media">${bvMedia(m, h, 640, 480)}<span class="bv-ben__ico${flip ? ' bv-cwflip' : ''}" aria-hidden="true">${flip ? '<i>❄️</i><i>🔥</i>' : ic}</span></div>` : `<span class="bv-ben__ico" aria-hidden="true">${ic}</span>`}
          <div class="bv-ben__body"><h3>${esc(h)}</h3>${t ? `<p>${esc(t)}</p>` : ''}</div>
          <span class="bv-glare" aria-hidden="true"></span>
        </article>`).join('')}</div>
      ${bens.some(b => b[3]) ? '<p class="bv-swipe">Плъзни настрани <span aria-hidden="true">→</span></p>' : ''}
      <div class="bv-assure">
        <div class="bv-card"><h3><span class="bv-ico">🔬</span>Качество и сигурност</h3><ul class="bv-qual">
          <li>Пълният състав е отпечатан върху опаковката</li><li>Произведено за България</li>
          <li>Обаждаме се да потвърдим всяка поръчка</li><li>Изпращаме до 1–2 работни дни от България</li></ul></div>
        <div class="bv-card bv-guar">${guaranteeSeal(days)}<div><h3 style="margin-bottom:6px">${days} дни гаранция</h3>
          <p>Пробвай продукта. Ако не си доволен – обади се и ти връщаме парите. Решаваме всеки случай бързо и по човешки.</p></div></div>
      </div>
      <div class="bv-callbar">
        <div><small>За бърза поръчка по телефона</small><a href="tel:${CONFIG.phoneHref}">📞 ${CONFIG.phone}</a></div>
        <div><small>${esc(CONFIG.hours)}</small><strong>🚚 Доставка 1–2 дни · Плащане при получаване</strong></div>
      </div>
    </div>
    <div class="bv-tapes" aria-hidden="true">${tape('bv-tape--b', tapesB)}${tape('bv-tape--a', tapesA)}</div>
  </section>`;

  // --- оферти
  const offers = (id, title) => `
  <section class="bv-offers" id="${id}">
    ${WAVE('var(--honey-50)')}
    ${floaters(theme)}
    <div class="bv-wrap">
      <div class="bv-center">
        <span class="bv-eyebrow">${bfOn() ? 'Черен петък' : 'Специални цени'}</span>
        <h2>${title}</h2>
        <p class="bv-lead">${packs ? 'Повечето клиенти избират комплект – стига за по-дълго, а цената на брой пада.' : 'Плащаш при получаване, а ако не си доволен – връщаме парите.'}</p>
      </div>
      <div class="bv-packs bv-packs--n${packs ? packs.length : 1}${packs ? '' : ' bv-packs--one'}">${landingOffers(p, d)}</div>
      <div class="bv-pay"><span>🔒 Без данни за карта в сайта</span><span>💶 Наложен платеж</span><span>🛡️ ${days} дни гаранция</span></div>
    </div>
  </section>`;

  // --- съставки
  const ingD = d.ings && d.ings.items ? d.ings : null;
  const ingMeta = ingD || d.ings || c.ings || null;
  const ingItems = ingD ? ingD.items : ings.map(([n, t], i) => [n, i ? '' : 'Основна съставка', t, null, !i]);
  const ingsHtml = ingItems.length ? `
  <section id="bv-sastav"><div class="bv-wrap">
    <div class="bv-center">
      <span class="bv-eyebrow">${esc(ingMeta && ingMeta.eyebrow ? ingMeta.eyebrow : 'Какво съдържа?')}</span>
      <h2>${ingD ? hTxt(ingD.h2) : `${ingItems.length === 1 ? 'Съставката' : `${ingItems.length} съставки`}, <em class="bv-accent">подбрани с грижа</em>`}</h2>
      <p class="bv-lead">${esc(ingMeta && ingMeta.lead ? ingMeta.lead : 'Пълният състав е отпечатан върху опаковката.')}</p>
    </div>
    <div class="bv-ings${ingItems.some(x => x[3]) ? '' : ' bv-ings--plain'}">${ingItems.map(([n, tag, t, m, main]) => `
      <article class="bv-ing${main ? ' bv-ing--main' : ''}">
        ${m ? `<div class="bv-ing__img">${bvMedia(m, n, 600, 480)}</div>` : `<div class="bv-ing__ico" aria-hidden="true">${ingIcon(n)}</div>`}
        <div class="bv-ing__body">${tag ? `<span class="bv-ing__tag${main ? ' bv-ing__tag--main' : ''}">${esc(tag)}</span>` : ''}<h3>${esc(n)}</h3><p>${esc(t)}</p></div>
        <span class="bv-glare" aria-hidden="true"></span>
      </article>`).join('')}</div>
  </div></section>` : '';

  // --- как е направен пластирът (трите слоя и къде да го залепиш)
  const layersHtml = layersSection(d.layers || c.layers, p);

  // --- сравнение (само където има данни)
  const vsD = d.vs || c.vs;
  const vsUs = vsD && (vsD.us || [p.shortName, p.size.split(' · ')[0], productLook(p).img]);
  const vs = vsD ? `
  <section class="bv-vs"><div class="bv-wrap">
    <div class="bv-center"><span class="bv-eyebrow">Сравни сам</span><h2>${hTxt(vsD.h2)}</h2><p class="bv-lead">${esc(vsD.lead)}</p></div>
    <div class="bv-vs__grid">
      <div class="bv-vs__hl" aria-hidden="true"></div>
      <div class="bv-vs__corner">Какво получаваш</div>
      <div class="bv-vs__head bv-vs__head--us"><img src="${vsUs[2]}" alt="" width="106" height="180" loading="lazy" decoding="async"><div><b>${esc(vsUs[0])}</b><span>${esc(vsUs[1])}</span></div></div>
      <div class="bv-vs__head bv-vs__head--them"><span class="bv-vs__badge" aria-hidden="true">VS</span>${vsD.pills ? PILLS_SVG : JAR_SVG}<div><b>${esc(vsD.them[0])}</b><span>${esc(vsD.them[1])}</span></div></div>
      ${vsD.rows.map(([ic, f, u, small, t], i) => {
        const dl = `style="--bv-d:${(.1 + i * .12).toFixed(2)}s"`;
        return `<div class="bv-vs__f bv-rv" ${dl}><span class="bv-vs__ic" aria-hidden="true">${ic}</span>${esc(f)}</div>
        <div class="bv-vs__u bv-rv" ${dl}><span class="bv-vs__ok" aria-hidden="true">✓</span><div><b>${u}</b><small>${esc(small)}</small></div></div>
        <div class="bv-vs__t bv-rv" ${dl}><span class="bv-vs__no" aria-hidden="true">✕</span><span>${esc(t)}</span></div>`;
      }).join('')}
    </div>
    <div class="bv-vs__cta"><a class="bv-btn" href="${toOffers}">Избери своя пакет ${arr}</a><span class="bv-small">Плащаш при получаване · ${days} дни гаранция</span></div>
  </div></section>` : '';

  // --- как се използва
  const howD = d.how || c.how;
  const steps = howD ? howD.steps : String(p.usage || '').split(/(?<=\.)\s+/).filter(s => s.length > 3).slice(0, 4).map(s => [s.replace(/\.$/, ''), '', null]);
  const howHtml = steps.length ? `
  <section class="bv-how" style="background:var(--honey-50)"><div class="bv-wrap">
    <div class="bv-center">
      <span class="bv-eyebrow">${esc(howD ? howD.eyebrow : 'Как се използва?')}</span>
      <h2>${howD ? hTxt(howD.h2) : `${steps.length === 1 ? 'Една стъпка' : `${steps.length} лесни стъпки`}. <em class="bv-accent">Това е всичко.</em>`}</h2>
      ${howD ? `<p class="bv-lead">${esc(howD.lead)}</p>` : ''}
    </div>
    <ol class="bv-hsteps${steps.some(s => s[2]) ? '' : ' bv-hsteps--plain'}${steps.length === 3 ? ' bv-hsteps--3' : ''}">${steps.map(([h, t, m, ic], i) => `
      <li class="bv-hstep"><span class="bv-hstep__num" style="animation-delay:${(i * .6).toFixed(1)}s">${i + 1}</span>
        ${m ? `<div class="bv-hstep__media">${bvMedia(m, h, 600, 600)}</div>` : ic ? `<div class="bv-hstep__ico" aria-hidden="true">${ic}</div>` : ''}
        <div class="bv-hstep__body"><h3>${esc(h)}</h3>${t ? `<p>${esc(t)}</p>` : ''}</div><span class="bv-glare" aria-hidden="true"></span></li>`).join('')}</ol>
    ${steps.some(s => s[2]) ? '<p class="bv-swipe">Плъзни настрани <span aria-hidden="true">→</span></p>' : ''}
    <div class="bv-how__foot">
      <div class="bv-note"><span>💡</span><span>${p.wellness
        ? `${p.caution ? esc(p.caution) + ' ' : 'При заболяване, прием на лекарства, бременност или кърмене се посъветвай с лекар. '}Не поставяй върху наранена или раздразнена кожа. Не е за деца.`
        : `Само за външна употреба. Не нанасяй върху наранена или раздразнена кожа и избягвай контакт с очите.${bee ? ' Не използвай при алергия към пчелни продукти.' : ''}`}</span></div>
      <a class="bv-btn" href="${toOffers}">Поръчай сега ${arr}</a>
    </div>
  </div></section>` : '';

  // --- какво ще усетиш + банер
  const tl = d.tl;
  const life = d.life || c.life;
  const tlHtml = tl || life ? `
  <section class="bv-timeline">
    ${WAVE('#fff')}
    <div class="bv-wrap">
      ${tl ? `<div class="bv-center"><span class="bv-eyebrow">${esc(tl.eyebrow)}</span><h2>${hTxt(tl.h2)}</h2><p class="bv-lead">${esc(tl.lead)}</p></div>
      <div class="bv-tl">${tl.items.map(([when, h, li, emo]) => `<div class="bv-tl__item"><span class="bv-tl__emo${Array.isArray(emo) ? ' bv-cwflip' : ''}" aria-hidden="true">${Array.isArray(emo) ? emo.map(x => `<i>${x}</i>`).join('') : emo}</span><span class="bv-tl__when">${esc(when)}</span><h3>${esc(h)}</h3><ul>${li.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
      <p class="bv-small bv-center" style="margin-top:18px">Индивидуалното усещане и резултатите могат да се различават. Продуктът е за външна козметична употреба и не е лекарство.</p>` : ''}
      ${life ? `<div class="bv-life bv-rv"><div class="bv-life__img"><img loading="lazy" src="${typeof life.img === 'function' ? life.img() : life.img}" width="1200" height="1200" alt=""></div>
        <div class="bv-life__txt"><h3>${esc(life.h3[0])}<em class="bv-accent" style="color:var(--tx,#FFC65C)">${esc(life.h3[1])}</em></h3><p>${esc(life.p)}</p><a class="bv-btn" href="${toOffers}">Виж специалната оферта ${arr}</a></div></div>` : ''}
    </div>
  </section>` : '';

  // --- отзиви
  const revHtml = shots.length || reviews.length ? `
  <section id="bv-otzivi">
    ${WAVE('var(--cream)')}
    <div class="bv-wrap">
      <div class="bv-rev-head bv-center"><span class="bv-eyebrow">Какво споделят нашите клиенти</span><span class="bv-stars" aria-hidden="true">★★★★★</span>
        <h2 style="margin:0">Какво казват <em class="bv-accent">хората, които го ползват</em></h2>
        ${shots.length ? '<p class="bv-small" style="margin:6px 0 0">Коментари на клиенти от нашата Facebook страница</p>' : ''}</div>
      ${shots.length ? `<div class="bv-shots">${shots.map(([src, w, h, alt]) => `<figure class="bv-shot"><img loading="lazy" src="${src}" width="${w}" height="${h}" alt="Коментар: ${esc(alt)}"></figure>`).join('')}</div>` : ''}
      ${reviews.length ? `<div class="bv-stories">${reviews.slice(0, 4).map(r => `<article class="bv-story"><span class="bv-stars" aria-hidden="true" style="font-size:18px;margin-bottom:10px">★★★★★</span><p>${esc(r.text)}</p><div class="bv-who"><span class="bv-av">${esc(r.name[0])}</span><div><strong>${esc(r.name)}</strong><span>${esc(r.city)}</span></div></div></article>`).join('')}</div>` : ''}
    </div>
  </section>` : '';

  // --- въпроси
  const safety = p.wellness
    ? ['Подходящ ли е за мен?', p.caution
      ? `${p.caution} Пластирът не е лекарство и не замества лечението или разнообразното хранене. Не е подходящ за деца.`
      : 'Пластирът не е лекарство и не замества лечението или разнообразното хранене. При заболяване, прием на лекарства, бременност или кърмене се посъветвай с лекар преди употреба. Не е подходящ за деца.']
    : ['Подходящ ли е за чувствителна кожа?', `Направи първо тест на малък участък (например вътрешната страна на предмишницата) и изчакай 24 часа. Ако няма зачервяване или дискомфорт – използвай спокойно.${bee ? ' При алергия към пчелни продукти (ужилвания, мед, прополис) не го използвай без разговор с лекар.' : ''} При бременност или кърмене се консултирай с лекар.`];
  const faqGroups = [
    ['За продукта', [...(d.faq || []), ['Как се използва правилно?', p.usage], ...(p.wellness || bee ? [] : []), ['Лекарство ли е?', 'Не. Това е продукт за ежедневна грижа и не замества лечение, предписано от лекар. Индивидуалното усещане е различно.']]],
    ['Употреба и безопасност', [safety, ...(c.faq || [['Мога ли да го ползвам заедно с други продукти?', 'Да, при нужда остави време между нанасянията на една и съща зона. Ако приемаш лекарства или имаш заболяване, попитай лекаря си.']])]],
    ['Поръчка, доставка и гаранция', [
      ['Трябва ли да плащам предварително?', 'Не. Плащаш с наложен платеж – на куриера при получаване. Не въвеждаш данни за карта в сайта.'],
      ['Колко струва доставката и кога пристига?', `Изпращаме с Еконт и Спиди: до офис от ${fmt(SHIP_FROM)}, до адрес ${fmt(Math.max(...CONFIG.shipping.map(m => m.price)))}.${FREE_FROM ? ` При поръчка над ${fmt(FREE_FROM)} доставката до офис е безплатна.` : ''} Пратката обикновено пристига за 1–2 работни дни.`],
      ['Ами ако не съм доволен?', `Имаш ${days} дни гаранция – обади се на ${CONFIG.phone} и ще ти върнем парите. Освен това по закон имаш 14 дни право на отказ.`],
      ['Мога ли да поръчам по телефона?', `Да – обади се на ${CONFIG.phone} (${CONFIG.hours}). Ще приемем поръчката и ще отговорим на въпросите ти.`]
    ]]
  ];
  const faq = `
  <section class="bv-faq" id="bv-faq"><div class="bv-wrap"><div class="bv-faq__wrap">
    <div class="bv-center"><span class="bv-eyebrow">Питай спокойно</span><h2>Често задавани <em class="bv-accent">въпроси</em></h2>
      <p class="bv-lead">Събрахме това, което клиентите ни питат преди първата поръчка – с честни отговори.</p></div>
    ${faqGroups.map(([g, qs]) => `<h3>${esc(g)}</h3>${qs.map(([q, a]) => `<details><summary>${esc(q)}</summary><div><p>${esc(a)}</p></div></details>`).join('')}`).join('')}
  </div></div></section>`;

  // --- финал + още продукти
  const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).concat(PRODUCTS.filter(x => x.cat !== p.cat && x.bestseller)).slice(0, 4);
  const final = `
  <section class="bv-final"><div class="bv-wrap">
    <div class="bv-final__media${stage.plain ? ' bv-final__media--card' : stage.scene ? ' bv-final__media--scene' : ''}"><img src="${stage.plain ? p.img : (stage.small || stage.img)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>
    <h2>${p.wellness ? 'Малка стъпка всеки ден. ' : 'Грижата започва с първата поръчка. '}<em class="bv-accent">Заслужаваш я.</em></h2>
    <p class="bv-lead" style="margin-left:auto;margin-right:auto">Поръчай сега – плащаш чак когато пратката е в ръцете ти.</p>
    <div class="bv-cta-row"><a class="bv-btn bv-btn--xl bv-pulse" href="${toOffers}">Виж офертите ${arr}</a><a class="bv-btn-ghost" href="tel:${CONFIG.phoneHref}">📞 ${CONFIG.phone}</a></div>
    <div class="bv-micro" style="justify-content:center"><span>Плащаш при получаване</span><span>Доставка 1–2 дни</span><span>${days} дни гаранция</span></div>
  </div></section>
  ${related.length ? `<section class="bv-more"><div class="bv-wrap"><div class="bv-center"><span class="bv-eyebrow">Още от Здравец Натура</span><h2>Може да те <em class="bv-accent">заинтересува</em></h2></div>
    <div class="grid g4" id="related">${related.map(productCard).join('')}</div></div></section>` : ''}
  <p class="bv-disclaimer">${p.wellness ? 'Не е лекарство и не замества лечението или разнообразното хранене.' : 'Козметичен продукт за външна употреба. Не е лекарство и не замества лечение, предписано от лекар.'} Индивидуалните резултати могат да се различават.</p>`;

  const sticky = `
  <div class="bvp-sticky" aria-hidden="true">
    <div class="bv-sticky__txt"><strong>${packs ? `от ${fmt(minUnit)} за брой` : fmt(p.price)}</strong>плащаш при получаване</div>
    <a class="bv-call" href="tel:${CONFIG.phoneHref}" aria-label="Обади се">📞</a>
    <a class="bv-btn" href="${toOffers}">Избери пакет</a>
  </div>`;

  const root = $('#product');
  root.classList.add('bvp');
  root.removeAttribute('style'); delete root.dataset.shape; delete root.dataset.dark;
  if (theme) { const v = themeVars(theme); Object.keys(v).forEach(k => root.style.setProperty(k, v[k])); root.dataset.shape = theme.shape; if (theme.dark) root.dataset.dark = '1'; }
  const trustHtml = hero.slice(hero.indexOf('<div class="bv-trust">'));
  const top = productTop(p, d, { theme, packs, reviewsOn: !!(shots.length || reviews.length) });
  root.innerHTML = GRAD + top + trustHtml + sitsHtml + eta + formula + why + offers(offersId, packs ? `Избери своя комплект <em class="bv-accent">на изгодна цена</em>` : `${esc(p.shortName)} <em class="bv-accent">с доставка до 2 дни</em>`)
    + ingsHtml + layersHtml + vs + howHtml + tlHtml + revHtml
    + (packs ? offers('bv-offers-2', `Вземи своя комплект <em class="bv-accent">още днес</em>`) : '')
    + faq + final;
  bindTop(root, p);

  // бутоните на офертите → количката на ConvertBuilder и към поръчката
  $$('[data-bv-buy]', root).forEach(b => b.addEventListener('click', () => {
    const store = +b.dataset.bvBuy;
    const k = (packs || []).find(x => x.store === store);
    addFlow({ store, qty: 1, go: true, btn: b, value: k ? k.price : p.price, contentId: k ? k.key : p.id, bf: !!(k && k.bundle && B(k.bundle).bf !== false) });
  }));
  bindAddButtons($('#related', root) || root);
  bvEffects(root);
}

/* ---------- ефектите (по beeevenom.eu) ---------- */
function bvEffects(root) {
  root.classList.add('bv-js');
  const mm = q => !!(window.matchMedia && matchMedia(q).matches);
  const reduce = mm('(prefers-reduced-motion: reduce)'), fine = mm('(hover: hover) and (pointer: fine)');
  const sticky = root.querySelector('.bvp-sticky');

  // очаквана доставка: 1–2 работни дни
  try {
    const add = (d, n) => { d = new Date(d); while (n > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n--; } return d; };
    const wd = new Intl.DateTimeFormat('bg-BG', { weekday: 'short' }), mo = new Intl.DateTimeFormat('bg-BG', { month: 'long' });
    const d1 = add(new Date(), 1), d2 = add(new Date(), 2), day = d => `${wd.format(d)}, ${d.getDate()}`;
    const ms = ['яну.', 'фев.', 'март', 'апр.', 'май', 'юни', 'юли', 'авг.', 'сеп.', 'окт.', 'ное.', 'дек.'];
    const same = d1.getMonth() === d2.getMonth();
    $$('.bv-eta-long', root).forEach(e => { e.textContent = same ? `${day(d1)} – ${day(d2)} ${mo.format(d2)}` : `${day(d1)} ${mo.format(d1)} – ${day(d2)} ${mo.format(d2)}`; });
    $$('.bv-eta-short', root).forEach(e => { e.textContent = same ? `${day(d1)} – ${day(d2)} ${ms[d2.getMonth()]}` : `${day(d1)} ${ms[d1.getMonth()]} – ${day(d2)} ${ms[d2.getMonth()]}`; });
  } catch (e) {}

  if (!('IntersectionObserver' in window)) { root.classList.remove('bv-js'); return; }
  const hero = root.querySelector('.bv-hero');

  // начален блок: дълбочина след мишката и златен прашец
  if (hero && !reduce && fine) {
    hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); hero.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5).toFixed(3)); hero.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5).toFixed(3)); });
    hero.addEventListener('pointerleave', () => { hero.style.setProperty('--px', 0); hero.style.setProperty('--py', 0); });
  }
  const cv = hero && hero.querySelector('.bv-dust');
  if (cv && cv.getContext && !reduce) {
    const ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, parts = [], running = false;
    const spr = document.createElement('canvas'); spr.width = spr.height = 32;
    const sg = spr.getContext('2d'), gr = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    const cs = getComputedStyle(root), dv = (k, f) => (cs.getPropertyValue(k) || '').trim() || f;
    gr.addColorStop(0, `rgba(${dv('--dust-a', '255,246,214')},1)`); gr.addColorStop(.35, `rgba(${dv('--dust-b', '255,212,120')},.75)`); gr.addColorStop(1, `rgba(${dv('--dust-c', '255,190,80')},0)`);
    sg.fillStyle = gr; sg.fillRect(0, 0, 32, 32);
    const spawn = (p, anyY) => Object.assign(p, { x: W * (.3 + .7 * Math.pow(Math.random(), .6)), y: anyY ? Math.random() * H : H + 12, r: 2 + Math.random() * 6, vy: .12 + Math.random() * .38, vx: -.12 + Math.random() * .24, ph: Math.random() * 6.283, tw: .008 + Math.random() * .022 });
    const size = () => { const w = hero.clientWidth, h = hero.clientHeight; if (w === W && h === H) return; W = w; H = h; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); parts = []; for (let i = 0; i < (W < 700 ? 22 : 44); i++) parts.push(spawn({}, true)); };
    const frame = () => {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) { p.y -= p.vy; p.x += p.vx + Math.sin(p.ph) * .18; p.ph += p.tw; if (p.y < -12 || p.x < -12 || p.x > W + 12) spawn(p, false); ctx.globalAlpha = .3 + .45 * (.5 + .5 * Math.sin(p.ph * 2)); ctx.drawImage(spr, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
      ctx.globalAlpha = 1; requestAnimationFrame(frame);
    };
    size(); window.addEventListener('resize', size);
    new IntersectionObserver(es => { const vis = es[0].isIntersecting && !document.hidden; if (vis && !running) { running = true; requestAnimationFrame(frame); } else if (!vis) running = false; }).observe(hero);
  }

  // лепкав бутон: след началния екран, крие се при офертите
  let heroVisible = true; const visibleOffers = new Set();
  const upd = () => { if (!sticky) return; const on = !heroVisible && visibleOffers.size === 0; sticky.classList.toggle('bv-show', on); sticky.setAttribute('aria-hidden', on ? 'false' : 'true'); };
  if (hero) new IntersectionObserver(es => { heroVisible = es[0].isIntersecting; upd(); }).observe(hero);
  const io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) visibleOffers.add(e.target); else visibleOffers.delete(e.target); }); upd(); });
  $$('.bv-offers', root).forEach(el => io.observe(el));

  // видеата: зареждат се чак когато наближат, спират, когато не се виждат
  $$('video', root).forEach(v => {
    let loaded = false;
    if (reduce && v.classList.contains('bv-loop')) return;
    new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && !loaded) { const ss = $$('source[data-src]', v); if (ss.length) { ss.forEach(s => { s.src = s.getAttribute('data-src'); }); v.load(); } loaded = true; }
      if (reduce) return;
      if (e.isIntersecting) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } else v.pause();
    }), { rootMargin: '300px 0px' }).observe(v);
  });

  // стъпаловидно появяване
  $$('.bv-bens,.bv-ings,.bv-sits,.bv-tl,.bv-stories,.bv-packs,.bv-shots,.bv-hsteps', root).forEach(g => [...g.children].forEach((c, i) => { c.classList.add('bv-rv'); c.style.setProperty('--bv-d', (i % 6) * .09 + 's'); }));
  $$('section .bv-center', root).forEach(c => c.classList.add('bv-rv'));

  // числата броят нагоре
  $$('.bv-stat b, .bv-vs__num', root).forEach(b => {
    const m = b.textContent.match(/^(\d+)(.*)$/); if (!m || reduce || +m[1] < 2) return;
    const to = +m[1], tail = m[2]; b.textContent = '0' + tail;
    new IntersectionObserver((es, ob) => { if (!es[0].isIntersecting) return; ob.disconnect(); let t0 = null; const step = t => { if (!t0) t0 = t; const k = Math.min(1, (t - t0) / 1200); b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + tail; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }).observe(b);
  });

  // цената „пада“ от сбора на бройките до цената на комплекта
  $$('.bv-price b[data-from]', root).forEach(b => {
    if (reduce) return;
    const to = parseFloat(b.textContent.replace(/[^\d,]/g, '').replace(',', '.')), from = parseFloat(b.getAttribute('data-from'));
    if (!(to > 0 && from > to)) return;
    new IntersectionObserver((es, ob) => { if (!es[0].isIntersecting) return; ob.disconnect();
      b.textContent = fmt(from);
      setTimeout(() => { let t0 = null; const step = t => { if (!t0) t0 = t; const k = Math.min(1, (t - t0) / 1100); b.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); else b.classList.add('bv-landed'); }; requestAnimationFrame(step); }, 500);
    }, { rootMargin: '0px 0px -12% 0px' }).observe(b.closest('.bv-pack') || b);
  });

  // картите се накланят леко след мишката
  if (!reduce && fine) {
    $$('.bv-pack, .bv-ben, .bv-ing, .bv-sit, .bv-hstep', root).forEach(c => {
      const tilt = c.classList.contains('bv-pack') ? 9 : 6;
      c.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.setProperty('--mx', ((x + .5) * 100).toFixed(1) + '%'); c.style.setProperty('--my', ((y + .5) * 100).toFixed(1) + '%');
        c.style.rotate = `${(-y).toFixed(3)} ${x.toFixed(3)} 0 ${(Math.sqrt(x * x + y * y) * tilt).toFixed(2)}deg`;
      });
      c.addEventListener('pointerleave', () => { c.style.rotate = ''; });
    });
  }

  // плавно появяване
  const rv = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('bv-in'); rv.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.bv-rv', root).forEach(el => rv.observe(el));
}

/* =========================================================================
   Горната част на продукта в стил Shopify: снимки и видео вляво, вдясно
   цена, избор на пакет/брой/комплект, „Добави в количката“ и „Купи сега“.
   ========================================================================= */
function packCalc(p, k) {
  const bundle = k.bundle ? B(k.bundle) : null;
  const qty = packQty(p, k);
  const regular = bundle ? bundle.items.reduce((s, [id, n]) => s + P(id).price * n, 0) : p.price * qty;
  const off = regular > k.price + .01 ? Math.round((1 - k.price / regular) * 100) : 0;
  return { bundle, qty, regular, off };
}
function galleryItems(p, d) {
  const lk = productLook(p), list = [];
  if (lk.gel) {
    list.push({ img: lk.big, thumb: lk.img, alt: p.name, gel: true });
    list.push({ video: bvVid(BV.how, 'kak-deistva'), alt: 'Как действа гелът' });
    list.push({ video: bvVid(BV.pack2, 'pack-2'), alt: '3 гела' });
  } else if (lk.video) list.push({ video: { video: lk.video, poster: lk.img }, big: lk.big, alt: p.name });
  else if (lk.scene) list.push({ img: lk.big, thumb: lk.img, alt: p.name });
  [p.img].concat(p.gallery || []).forEach((src, i) => list.push({ img: src, thumb: src, alt: `${p.name} – снимка ${i + 1}`, photo: true }));
  return list;
}
function productTop(p, d, ctx) {
  const { theme, packs, reviewsOn } = ctx;
  const cat = catOf(p);
  const g = galleryItems(p, d);
  const still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const tag = d.h1 ? `${esc(d.h1[0])}<em>${esc(d.h1[1])}</em>${esc(d.h1[2] || '')}` : '';
  const media = (m, i) => m.video
    ? `<div class="sp-slide${i ? '' : ' on'}" data-slide="${i}"><video ${i || still ? '' : 'autoplay '}muted loop playsinline preload="${i ? 'none' : 'auto'}" poster="${m.video.poster}" aria-label="${esc(m.alt)}"><source ${i ? 'data-src' : 'src'}="${m.video.video}" type="video/mp4"></video></div>`
    : `<div class="sp-slide${i ? '' : ' on'}${m.photo ? ' is-photo' : ''}${m.gel ? ' is-gel' : ''}" data-slide="${i}"><img src="${m.img}" alt="${esc(m.alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></div>`;
  const opts = [];
  if (packs) packs.forEach(k => {
    const c = packCalc(p, k);
    opts.push({ kind: 'pack', key: k.key, label: k.label, sub: String(k.sub || '').replace(/ · най-(избиран|изгодно)$/, ''), price: k.price, was: c.off ? c.regular : 0, off: c.off, per: c.qty > 1 ? k.price / c.qty : 0, hot: !!k.featured, store: k.store, bf: !!(k.bundle && B(k.bundle).bf !== false) });
  });
  else {
    opts.push({ kind: 'qty', key: 'one', label: p.wellness ? '1 кутия' : '1 брой', sub: p.size, price: p.price });
    if (p.wellness && comboReady()) PATCH_COMBOS.filter(c => c.store).forEach(c => opts.push({ kind: 'combo', key: `combo${c.n}`, n: c.n, label: `${c.n} вида по избор`, sub: `този + още ${c.n - 1} ${c.n - 1 === 1 ? 'вид' : 'вида'} пластири`, price: c.price, was: p.price * c.n, off: Math.round((1 - c.price / (p.price * c.n)) * 100), per: c.price / c.n, hot: c.n === 2 }));
  }
  const showOpts = opts.length > 1;
  const sel = (opts.find(o => o.hot) || opts[0]).key;
  const others = p.wellness ? PRODUCTS.filter(x => x.wellness && x.id !== p.id) : [];
  return `
  <section class="sp-top" id="sp-top"><div class="bv-wrap sp-top__grid">
    <div class="sp-gallery">
      <div class="sp-gallery__main">${g.map(media).join('')}
        ${g.length > 1 ? `<button class="sp-gallery__nav sp-prev" type="button" aria-label="Предишна снимка">‹</button><button class="sp-gallery__nav sp-next" type="button" aria-label="Следваща снимка">›</button>` : ''}
        ${bfOn() && p.id === 'gel' ? '<span class="sp-gallery__tag">★ Черен петък</span>' : ''}</div>
      ${g.length > 1 ? `<div class="sp-gallery__thumbs">${g.map((m, i) => `<button type="button" class="${i ? '' : 'on'}${m.video ? ' is-video' : ''}" data-go="${i}" aria-label="Снимка ${i + 1}"><img src="${m.video ? m.video.poster : m.thumb}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    </div>
    <div class="sp-buy">
      <nav class="sp-crumbs" aria-label="Път"><a href="${L.home}">Начало</a><span>/</span><a href="${L.products}?cat=${p.cat}">${esc(cat.name)}</a></nav>
      <h1 class="sp-title">${esc(p.name)}</h1>
      ${tag ? `<p class="sp-tagline">${tag}</p>` : ''}
      ${reviewsOn ? '<a class="sp-rating" href="#bv-otzivi"><span class="bv-stars" aria-hidden="true">★★★★★</span> Истински отзиви от клиенти</a>' : ''}
      <div class="sp-price"><b data-sp-price></b><s data-sp-was></s><span class="sp-off" data-sp-off></span></div>
      <p class="sp-price__note"><span data-sp-per></span>С ДДС · плащаш при получаване</p>
      <p class="sp-short">${esc(p.short)}</p>
      <ul class="sp-bullets">${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      ${showOpts ? `<p class="sp-lbl">${packs ? 'Избери комплект' : 'Избери количество'}</p>
      <div class="sp-opts" role="radiogroup" aria-label="${packs ? 'Избери комплект' : 'Избери количество'}">${opts.map(o => `
        <label class="sp-opt${o.key === sel ? ' on' : ''}${o.hot ? ' is-hot' : ''}">
          <input type="radio" name="sp-opt" value="${o.key}"${o.key === sel ? ' checked' : ''}>
          ${o.hot ? `<span class="sp-opt__flag">${o.kind === 'combo' ? 'Най-изгодно' : 'Най-избиран'}</span>` : ''}
          <span class="sp-opt__txt"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
          <span class="sp-opt__price"><b>${fmt(o.price)}</b>${o.off ? `<s>${fmt(o.was)}</s><em>−${o.off}%</em>` : ''}</span>
        </label>`).join('')}</div>` : ''}
      ${others.length && comboReady() ? `<div class="sp-combo" hidden>
        <p class="sp-lbl"><span data-combo-need></span></p>
        <div class="sp-combo__grid">${others.map(x => `<button type="button" class="sp-pick" data-pick="${x.id}" aria-pressed="false" style="--pc:${productLook(x).a}"><img src="${productLook(x).img}" alt="" loading="lazy" width="96" height="96"><span>${esc(((n) => n.charAt(0).toUpperCase() + n.slice(1))(x.shortName.replace(/^Пластири (с )?/, '').replace(/ пластири$/, '')))}</span><i aria-hidden="true">✓</i></button>`).join('')}</div>
      </div>` : ''}
      <div class="sp-qtyrow"${packs ? ' hidden' : ''}><span class="sp-lbl">Брой</span><div class="sp-qty sp-qty--lg"><button type="button" data-q="-1" aria-label="По-малко">−</button><span data-qty>1</span><button type="button" data-q="1" aria-label="Повече">+</button></div></div>
      ${bfOn() ? `<p class="sp-gift">🎁 <span><b>+ 12 билкови пластира подарък</b> към всяка поръчка до 30 ноември</span></p>` : ''}
      <div class="sp-ctas">
        <button class="sp-add" type="button" data-sp-add>${ICON.bag} Добави в количката</button>
        <button class="bv-btn bv-btn--xl sp-buynow" type="button" data-sp-buy>Купи сега – плащаш при получаване</button>
      </div>
      <p class="sp-eta">${ICON.truck}<span>Поръчай днес – пристига <b class="bv-eta-long">до 2 работни дни</b></span></p>
      <div class="sp-badges"><span>💶 Наложен платеж</span><span>🛡️ ${CONFIG.guaranteeDays} дни гаранция</span><span>📞 <a href="tel:${CONFIG.phoneHref}">${CONFIG.phone}</a></span></div>
      <div class="sp-acc">
        <details open><summary>Описание</summary><div><p>${esc(d.lead || p.short)}</p><ul>${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul><p class="sp-muted">${esc(p.size)}</p></div></details>
        <details><summary>Съставки</summary><div>${(p.ingredients || []).length ? `<ul>${p.ingredients.map(([n, t]) => `<li><b>${esc(n)}</b> – ${esc(t)}</li>`).join('')}</ul>` : ''}<p class="sp-muted">Пълният състав е отпечатан върху опаковката.</p></div></details>
        <details><summary>Как се използва</summary><div><p>${esc(p.usage)}</p><p class="sp-muted">${p.wellness ? `${p.caution ? esc(p.caution) + ' ' : 'При заболяване, прием на лекарства, бременност или кърмене се посъветвай с лекар. '}Не е лекарство. Не е за деца.` : `Само за външна употреба. Не нанасяй върху наранена кожа и избягвай контакт с очите.${isBee(p) ? ' Не използвай при алергия към пчелни продукти.' : ''}`}</p></div></details>
        <details><summary>Доставка и плащане</summary><div><ul>${CONFIG.shipping.map(m => `<li>${esc(m.label)} – <b>${fmt(m.price)}</b></li>`).join('')}</ul>${FREE_FROM ? `<p>При поръчка над <b>${fmt(FREE_FROM)}</b> доставката до офис е <b>безплатна</b>.</p>` : ''}<p>Плащаш на куриера при получаване. Пратката пристига за 1–2 работни дни.</p></div></details>
        <details><summary>Гаранция и връщане</summary><div><p>${CONFIG.guaranteeDays} дни гаранция за удовлетвореност – ако не си доволен, обади се и ти връщаме парите. Освен това по закон имаш 14 дни право на отказ.</p></div></details>
      </div>
    </div>
  </div></section>
  <div class="sp-sticky" aria-hidden="true"><div class="bv-wrap sp-sticky__in">
    <img src="${productLook(p).img}" alt="" width="52" height="52"><div class="sp-sticky__txt"><b>${esc(p.shortName)}</b><span data-sp-sticky-lbl></span></div>
    <b class="sp-sticky__price" data-sp-sticky-price></b>
    <button class="bv-btn sp-sticky__btn" type="button" data-sp-add>Добави в количката</button>
  </div></div>
  <script type="application/json" class="sp-opts-data">${JSON.stringify({ opts, sel }).replace(/</g, '\\u003c')}<\/script>`;
}
function bindTop(root, p) {
  const top = $('#sp-top', root);
  if (!top) return;
  const data = JSON.parse($('.sp-opts-data', root).textContent);
  const opts = data.opts;
  let sel = data.sel, qty = 1, picks = [];
  // галерията
  const slides = $$('.sp-slide', top), thumbs = $$('.sp-gallery__thumbs button', top);
  let cur = 0;
  const go = i => {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => {
      s.classList.toggle('on', k === cur);
      const v = $('video', s);
      if (!v) return;
      if (k === cur) { $$('source[data-src]', v).forEach(x => { x.src = x.dataset.src; x.removeAttribute('data-src'); v.load(); }); const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } else v.pause();
    });
    thumbs.forEach((t, k) => t.classList.toggle('on', k === cur));
  };
  thumbs.forEach(t => t.addEventListener('click', () => go(+t.dataset.go)));
  const prev = $('.sp-prev', top), next = $('.sp-next', top);
  if (prev) prev.addEventListener('click', () => go(cur - 1));
  if (next) next.addEventListener('click', () => go(cur + 1));
  let x0 = null;
  const main = $('.sp-gallery__main', top);
  main.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  main.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); x0 = null; });
  // изборът
  const combo = $('.sp-combo', top);
  const o = () => opts.find(x => x.key === sel);
  const draw = () => {
    const x = o();
    const price = x.kind === 'qty' ? x.price * qty : x.price;
    $('[data-sp-price]', top).textContent = fmt(price);
    $('[data-sp-was]', top).textContent = x.was ? fmt(x.was) : '';
    $('[data-sp-off]', top).textContent = x.off ? `−${x.off}%` : '';
    $('[data-sp-off]', top).hidden = !x.off;
    $('[data-sp-per]', top).textContent = x.per ? `${fmt(x.per)} за ${x.kind === 'combo' ? 'кутия' : 'брой'} · ` : '';
    $$('.sp-opt', top).forEach(l => l.classList.toggle('on', $('input', l).value === sel));
    const qr = $('.sp-qtyrow', top); if (qr) qr.hidden = x.kind !== 'qty';
    if (combo) {
      combo.hidden = x.kind !== 'combo';
      if (x.kind === 'combo') {
        picks = picks.slice(0, x.n - 1);
        const need = x.n - 1 - picks.length;
        $('[data-combo-need]', combo).innerHTML = need ? `Избери още <b>${need}</b> ${need === 1 ? 'вид' : 'вида'} пластири за комплекта:` : '✓ Комплектът е готов – можеш да смениш вид с едно натискане:';
        $$('.sp-pick', combo).forEach(b => { const on = picks.includes(b.dataset.pick); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      }
    }
    $('[data-sp-sticky-lbl]', root).textContent = x.kind === 'qty' ? `${qty} ${p.wellness ? (qty === 1 ? 'кутия' : 'кутии') : 'бр.'}` : x.label;
    $('[data-sp-sticky-price]', root).textContent = fmt(price);
  };
  $$('.sp-opt input', top).forEach(r => r.addEventListener('change', () => { sel = r.value; draw(); }));
  $$('[data-q]', top).forEach(b => b.addEventListener('click', () => { qty = Math.max(1, Math.min(20, qty + +b.dataset.q)); $('[data-qty]', top).textContent = qty; draw(); }));
  if (combo) $$('.sp-pick', combo).forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.pick, x = o();
    if (picks.includes(id)) picks = picks.filter(k => k !== id);
    else { picks.push(id); if (picks.length > x.n - 1) picks.shift(); }
    draw();
  }));
  const act = (goNow, btn) => {
    const x = o();
    if (x.kind === 'pack') return addFlow({ store: x.store, qty: 1, go: goNow, btn, value: x.price, contentId: x.key, bf: x.bf });
    if (x.kind === 'qty') return addFlow({ store: p.store, qty, go: goNow, btn, value: p.price * qty, contentId: p.id });
    if (picks.length < x.n - 1) { combo.scrollIntoView({ behavior: 'smooth', block: 'center' }); combo.classList.add('shake'); setTimeout(() => combo.classList.remove('shake'), 600); return; }
    return addCombo(x.n, [p.id].concat(picks), { go: goNow, btn });
  };
  $$('[data-sp-add]', root).forEach(b => b.addEventListener('click', () => act(false, b)));
  $$('[data-sp-buy]', root).forEach(b => b.addEventListener('click', () => act(true, b)));
  draw();
  // лепкавата лента: на компютър – щом бутоните излязат нагоре от екрана; на телефон – винаги,
  // когато бутоните не се виждат (и в самото начало: там те са чак на третия екран)
  const sticky = $('.sp-sticky', root), ctas = $('.sp-ctas', top);
  const phone = !!(window.matchMedia && matchMedia('(max-width:719px)').matches);
  if (sticky && 'IntersectionObserver' in window) new IntersectionObserver(es => {
    const out = !es[0].isIntersecting && (phone || es[0].boundingClientRect.top < 0);
    sticky.classList.toggle('on', out); sticky.setAttribute('aria-hidden', out ? 'false' : 'true');
  }).observe(ctas);
}

/* =========================================================================
   Началната страница: витрина в стил Shopify с цветовете и сцените на продуктите.
   ========================================================================= */
function renderHomeBv() {
  const root = $('#home');
  if (!root) return;
  const days = CONFIG.guaranteeDays;
  const gel = P('gel');
  const look = id => productLook(P(id));
  const stack = [['hyal', 6, 4, -6], ['beeherb', 2, 70, 5], ['vein', 78, 74, -4]];
  const hero = `
  <section class="bv-hero hv-hero">
    <div class="bv-hero__bg" aria-hidden="true"><img src="${BVM(BV.hero, 'hero-bg-a-2000.webp')}" alt="" width="2000" height="1125" fetchpriority="high"></div>
    <canvas class="bv-dust" aria-hidden="true"></canvas>
    <div class="bv-wrap bv-hero__grid">
      <div class="bv-hero__copy">
        <span class="bv-eyebrow bv-glass">🌿 Здравец Натура · натурална козметика</span>
        <h1>Природна грижа, <em class="bv-accent bv-goldtext">която усещаш</em><span class="bv-h1sub">С пчелна отрова и билки – <em class="bv-accent">за стави, кожа и крака</em></span></h1>
        <p class="bv-lead">${PRODUCTS.length} продукта с пчелна отрова, билки и натурални екстракти – всеки със своя цел. Поръчваш за минута, плащаш на куриера.</p>
        <div class="bv-proof bv-glass"><span class="bv-stars" aria-hidden="true">★★★★★</span><strong>Истински отзиви от наши клиенти</strong></div>
        <div class="bv-cta-row">
          <a class="bv-btn bv-btn--xl bv-pulse" href="${bfOn() ? L.bf : '#hv-shop'}">${bfOn() ? '★ Офертите за Черен петък' : 'Разгледай продуктите'} <span class="bv-arr">→</span></a>
          <a class="bv-btn-ghost bv-glass" href="#hv-shop">Всички продукти</a>
        </div>
        <div class="bv-micro"><span>Плащаш при получаване</span><span>Доставка 1–2 дни</span><span>${days} дни гаранция</span></div>
      </div>
      <div class="bv-stage hv-stage">
        <div class="bv-stage__inner" style="aspect-ratio:1200/1248">
          <div class="bv-stage__glow" aria-hidden="true"></div>
          <a href="${productUrl('gel')}" aria-label="${esc(gel.name)}"><img class="bv-stage__img" src="${BVM(BV.hero, 'hero-scene-1200.webp')}" srcset="${BVM(BV.hero, 'hero-scene-700.webp')} 700w, ${BVM(BV.hero, 'hero-scene-1200.webp')} 1200w" sizes="(min-width:960px) 600px, 92vw" alt="${esc(gel.name)}" fetchpriority="high" decoding="async"></a>
          <span class="bv-honeydrop" aria-hidden="true"></span>
          <span class="bv-stage__bee" aria-hidden="true"><img src="${BVM(BV.hero, 'hero-bee.webp')}" alt="" width="320" height="320" decoding="async"></span>
        </div>
        ${stack.map(([id, x, y, r], i) => `<a class="hv-chip" href="${productUrl(id)}" style="left:${x}%;top:${y}%;--r:${r}deg;--d:${i * 1.3}s;--pc:${look(id).a}"><img src="${look(id).img}" alt="" width="120" height="120" loading="lazy"><span>${esc(P(id).shortName)}</span></a>`).join('')}
      </div>
    </div>
  </section>
  <div class="bv-trust"><div class="bv-wrap bv-trust__grid">
    <div class="bv-trust__item"><span class="bv-ico">💶</span><div><strong>Плащаш при получаване</strong>на куриера, без предплащане</div></div>
    <div class="bv-trust__item"><span class="bv-ico">🚚</span><div><strong>1–2 работни дни</strong>Еконт или Спиди, до офис или адрес</div></div>
    <div class="bv-trust__item"><span class="bv-ico">🛡️</span><div><strong>${days} дни гаранция</strong>не си доволен – връщаме парите</div></div>
    <div class="bv-trust__item"><span class="bv-ico">📞</span><div><strong>${CONFIG.phone}</strong>поръчка и по телефона</div></div>
  </div></div>`;

  const catPic = { stavi: 'gel', koja: 'skin', kraka: 'vein', wellness: 'energy' };
  const cats = `
  <section class="hv-cats"><div class="bv-wrap">
    <div class="bv-center"><span class="bv-eyebrow">Какво търсиш?</span><h2>Избери за какво е <em class="bv-accent">грижата</em></h2></div>
    <div class="hv-cats__grid">${CATEGORIES.map(c => { const lk = look(catPic[c.id]); const n = PRODUCTS.filter(p => p.cat === c.id).length; return `
      <a class="hv-cat${lk.gel ? ' is-gel' : ''}" href="${L.products}?cat=${c.id}" style="--pc:${lk.a};--pcd:${lk.d}">
        <span class="hv-cat__img"><img src="${lk.img}" alt="" loading="lazy" width="600" height="600"></span>
        <span class="hv-cat__txt"><small>${n} ${n === 1 ? 'продукт' : 'продукта'}</small><b>${esc(c.name)}</b><span>${esc(c.desc)}</span><i>Разгледай →</i></span>
        <span class="bv-glare" aria-hidden="true"></span>
      </a>`; }).join('')}</div>
  </div></section>`;

  const shop = `
  <section class="hv-shop" id="hv-shop"><div class="bv-wrap">
    <div class="bv-center"><span class="bv-eyebrow">Нашите продукти</span><h2>Всеки продукт – <em class="bv-accent">със свой характер</em></h2>
      <p class="bv-lead">Всеки има своя страница с всичко важно: за какво е, съставки, употреба и цени.</p></div>
    <div class="sp-tabs" role="tablist">${[['all', 'Най-поръчвани']].concat(CATEGORIES.map(c => [c.id, c.name])).map(([id, n], i) => `<button type="button" role="tab" class="${i ? '' : 'on'}" data-tab="${id}" aria-selected="${!i}">${esc(n)}</button>`).join('')}</div>
    <div class="sp-grid" id="hv-grid"></div>
    <p class="bv-center hv-more"><a class="sp-outline" href="${L.products}">Виж всички ${PRODUCTS.length} продукта →</a></p>
  </div></section>`;

  const bf = bfOn() ? `
  <section class="hv-bf" id="hv-bf">
    ${WAVE('var(--night)')}
    <div class="bv-wrap">
      <div class="bv-center"><span class="bv-eyebrow">⚫ Черен петък · до 30 ноември</span>
        <h2>3 гела с пчелна отрова <em class="bv-accent" style="color:var(--tx,#FFC65C)">за ${fmt(B('bf3').price)}</em></h2>
        <p class="bv-lead">+ 12 билкови пластира подарък към всяка поръчка. Офертата изтича след:</p>
        <div class="countdown hv-cd" data-countdown></div></div>
      <div class="bv-packs bv-packs--n4">${landingOffers(gel, LANDING.gel)}</div>
      <p class="bv-center hv-more"><a class="sp-outline sp-outline--light" href="${L.bf}">Всички оферти за Черен петък →</a></p>
    </div>
  </section>` : '';

  const wl = PRODUCTS.filter(p => p.wellness);
  const combos = comboReady() ? `
  <section class="hv-combo"><div class="bv-wrap hv-combo__in">
    <div><span class="bv-eyebrow">Уелнес пластири</span><h2>Комбинирай пластирите – <em class="bv-accent">по-изгодно</em></h2>
      <p class="bv-lead">Избери 2 или 3 вида – например „Апетит“ с Energy или Focus.</p>
      <div class="hv-combo__prices"><span><b>2 вида</b>${fmt(PATCH_COMBOS[0].price)}</span><span><b>3 вида</b>${fmt(PATCH_COMBOS[1].price)}</span></div>
      <a class="bv-btn" href="${productUrl('apetit')}">Направи своя комплект →</a></div>
    <div class="hv-combo__grid">${wl.map(p => `<a href="${productUrl(p.id)}" style="--pc:${look(p.id).a}"><img src="${look(p.id).img}" alt="" loading="lazy" width="160" height="160"><span>${esc(p.shortName.replace(/^Пластири /, ''))}</span></a>`).join('')}</div>
  </div></section>` : '';

  const story = `
  <section class="bv-formula bv-honeycomb">
    ${WAVE('var(--night)')}
    <div class="bv-wrap bv-formula__grid">
      <div>
        <span class="bv-eyebrow">Нашата история</span>
        <h2>Силата на билките и пчелите, <em class="bv-accent" style="color:var(--tx,#FFC65C)">която познаваме от деца</em></h2>
        <p class="bv-lead">Чаят от лайка при настинка, компресът от билки, бурканът с мехлем на бабината етажерка. Тръгнахме от тази традиция и я съчетахме с модерната козметика – с ясна цел и кратък състав: пчелна отрова, куркума, пелин, арника, конски кестен, мед.</p>
        <div class="bv-stats"><div class="bv-stat"><b>${PRODUCTS.length}</b><span>продукта с ясна цел</span></div><div class="bv-stat"><b>${days}</b><span>дни гаранция</span></div><div class="bv-stat"><b>1–2</b><span>работни дни до вратата ти</span></div><div class="bv-stat"><b>0 €</b><span>предплащане – плащаш на куриера</span></div></div>
        <a class="bv-btn" href="#hv-shop">Разгледай продуктите <span class="bv-arr">→</span></a>
      </div>
      <figure class="bv-formula__fig bv-rv"><div class="bv-formula__media hv-story__media">${bvMedia({ video: look('beeherb').video, poster: look('beeherb').img }, 'Билкови пластири', 720, 720, 'bv-formula__video')}</div></figure>
    </div>
  </section>`;

  const steps = [['Избираш продукт', 'Натискаш „Добави в количката“ или „Купи сега“ на продукта или комплекта.'], ['Пишеш име и телефон', 'Само няколко полета. Обаждаме се, за да потвърдим поръчката.'], ['Плащаш на куриера', 'Пратката пристига за 1–2 работни дни. Плащаш, когато я получиш.']];
  const how = `
  <section class="bv-how" style="background:var(--honey-50)"><div class="bv-wrap">
    <div class="bv-center"><span class="bv-eyebrow">Лесно е</span><h2>3 стъпки. <em class="bv-accent">Без регистрация и без карта.</em></h2></div>
    <ol class="bv-hsteps bv-hsteps--plain">${steps.map(([h, t], i) => `<li class="bv-hstep"><span class="bv-hstep__num" style="animation-delay:${(i * .6).toFixed(1)}s">${i + 1}</span><div class="bv-hstep__body"><h3>${esc(h)}</h3><p>${esc(t)}</p></div><span class="bv-glare" aria-hidden="true"></span></li>`).join('')}</ol>
    <div class="bv-callbar" style="margin-top:34px">
      <div><small>Не обичаш да поръчваш онлайн?</small><a href="tel:${CONFIG.phoneHref}">📞 ${CONFIG.phone}</a></div>
      <div><small>${esc(CONFIG.hours)}</small><strong>Обади се – ще запишем поръчката вместо теб</strong></div>
    </div>
  </div></section>`;

  const shots = LANDING.gel.shots || [];
  const reviews = `
  <section id="bv-otzivi">
    ${WAVE('var(--cream)')}
    <div class="bv-wrap">
      <div class="bv-rev-head bv-center"><span class="bv-eyebrow">Какво споделят клиентите</span><span class="bv-stars" aria-hidden="true">★★★★★</span>
        <h2 style="margin:0">Какво казват <em class="bv-accent">хората, които ни избраха</em></h2>
        <p class="bv-small" style="margin:6px 0 0">Коментари на клиенти от нашата Facebook страница</p></div>
      <div class="bv-shots">${shots.slice(0, 6).map(([src, w, h, alt]) => `<figure class="bv-shot"><img loading="lazy" src="${src}" width="${w}" height="${h}" alt="Коментар: ${esc(alt)}"></figure>`).join('')}</div>
      <div class="bv-stories">${REVIEWS.slice(0, 4).map(r => `<article class="bv-story"><span class="bv-stars" aria-hidden="true" style="font-size:18px;margin-bottom:10px">★★★★★</span><p>${esc(r.text)}</p><div class="bv-who"><span class="bv-av">${esc(r.name[0])}</span><div><strong>${esc(r.name)}</strong><span>${esc(r.city)} · ${esc(r.product)}</span></div></div></article>`).join('')}</div>
    </div>
  </section>`;

  const assure = `
  <section class="bv-why" style="padding-top:20px">
    ${hexes(null)}
    <div class="bv-wrap"><div class="bv-assure" style="margin-top:0">
      <div class="bv-card"><h3><span class="bv-ico">🔬</span>Качество и сигурност</h3><ul class="bv-qual">
        <li>Пълният състав е отпечатан върху всяка опаковка</li><li>Произведено за България</li>
        <li>Обаждаме се да потвърдим всяка поръчка</li><li>Изпращаме до 1–2 работни дни от България</li></ul></div>
      <div class="bv-card bv-guar">${guaranteeSeal(days)}<div><h3 style="margin-bottom:6px">Пробвай без риск</h3>
        <p>Ако в рамките на ${days} дни продуктът не ти хареса, обади се и ще ти върнем парите. Без излишни въпроси.</p></div></div>
    </div></div>
  </section>`;

  const qa = [
    ['Как да направя поръчка?', `Натисни „Добави в количката“ или „Купи сега“, напиши име, телефон и офис или адрес. Можеш да поръчаш и по телефона на ${CONFIG.phone} (${CONFIG.hours}).`],
    ['Как се плаща?', 'Плащаш на куриера, когато получиш пратката (наложен платеж). Не ти трябва карта и не плащаш нищо предварително.'],
    ['Колко струва доставката и кога ще пристигне?', `${CONFIG.shipping.map(m => `${m.label} – ${fmt(m.price)}`).join(', ')}.${FREE_FROM ? ` При поръчка над ${fmt(FREE_FROM)} доставката до офис е безплатна.` : ''} Пристига за 1–2 работни дни.`],
    ['Мога ли да върна продукт?', `Да. Имаш ${days} дни гаранция за удовлетвореност и законово право да върнеш продукта в 14-дневен срок.`],
    ['Лекарства ли са продуктите?', 'Не. Това са козметични продукти за външна употреба и уелнес пластири. Те не лекуват заболявания. При здравословен проблем се консултирай с лекар.'],
    ['Подходящи ли са за чувствителна кожа?', 'Преди първата употреба направи тест на малък участък кожа. Продуктите с пчелна отрова не са подходящи при алергия към пчелни продукти.']
  ];
  const faq = `
  <section class="bv-faq"><div class="bv-wrap"><div class="bv-faq__wrap">
    <div class="bv-center"><span class="bv-eyebrow">Питай спокойно</span><h2>Често задавани <em class="bv-accent">въпроси</em></h2></div>
    ${qa.map(([q, a]) => `<details><summary>${esc(q)}</summary><div><p>${esc(a)}</p></div></details>`).join('')}
  </div></div></section>
  <section class="bv-final"><div class="bv-wrap">
    <div class="bv-final__media"><img src="${BVM(BV.hero, 'hero-scene-700.webp')}" alt="" loading="lazy" decoding="async"></div>
    <h2>Грижата започва с първата поръчка. <em class="bv-accent">Заслужаваш я.</em></h2>
    <p class="bv-lead" style="margin-left:auto;margin-right:auto">Плащаш чак когато пратката е в ръцете ти.</p>
    <div class="bv-cta-row"><a class="bv-btn bv-btn--xl bv-pulse" href="${bfOn() ? L.bf : '#hv-shop'}">${bfOn() ? 'Офертите за Черен петък' : 'Разгледай продуктите'} <span class="bv-arr">→</span></a><a class="bv-btn-ghost" href="tel:${CONFIG.phoneHref}">📞 ${CONFIG.phone}</a></div>
  </div></section>`;

  root.classList.add('bvp');
  root.innerHTML = GRAD + hero + cats + shop + bf + combos + story + how + reviews + assure + faq;
  // витрината с разделите
  const grid = $('#hv-grid', root);
  const order = PRODUCTS.slice().sort((a, b) => (b.bestseller ? 1 : 0) - (a.bestseller ? 1 : 0));
  const show = tab => {
    grid.innerHTML = (tab === 'all' ? order.slice(0, 8) : PRODUCTS.filter(p => p.cat === tab)).map(shopCard).join('');
    bindAddButtons(grid);
  };
  $$('[data-tab]', root).forEach(b => b.addEventListener('click', () => {
    $$('[data-tab]', root).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    show(b.dataset.tab);
  }));
  show('all');
  // офертите на гела
  $$('[data-bv-buy]', root).forEach(b => b.addEventListener('click', () => {
    const k = PACKS.gel.find(x => x.store === +b.dataset.bvBuy);
    addFlow({ store: k.store, qty: 1, go: true, btn: b, value: k.price, contentId: k.key, bf: !!(k.bundle && B(k.bundle).bf !== false) });
  }));
  bvEffects(root);
}
