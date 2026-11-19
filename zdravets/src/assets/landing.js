/* =========================================================================
   Дългата страница на продукта – по реда и с ефектите на beeevenom.eu.
   renderLanding(p) пише страницата в #product; bvEffects(root) пуска ефектите.
   Съдържанието е в landing-data.js (LANDING, CAT_LANDING), цените – в data.js.
   ========================================================================= */

const WAVE = color => `<div class="bv-wave" aria-hidden="true" style="color:${color}"><svg class="bv-wave__back" viewBox="0 0 2880 80" preserveAspectRatio="none"><path d="M0 46C240 16 480 16 720 46S1200 76 1440 46 1920 16 2160 46 2640 76 2880 46V80H0Z"/></svg><svg class="bv-wave__front" viewBox="0 0 2880 80" preserveAspectRatio="none"><path d="M0 40C240 70 480 70 720 40S1200 10 1440 40 1920 70 2160 40 2640 10 2880 40V80H0Z"/></svg></div>`;
const HEXES = `<div class="bv-hexes" aria-hidden="true">${[[4, 12, 46, 0, 9], [90, 8, 34, 1.5, 11], [82, 46, 54, .8, 10], [8, 62, 30, 2.2, 12], [48, 92, 40, 3, 9.5], [94, 86, 26, 1.1, 13]]
  .map(([x, y, w, d, t]) => `<svg class="bv-hex" style="left:${x}%;top:${y}%;width:${w}px;animation-delay:${d}s;animation-duration:${t}s" viewBox="0 0 56 64"><path d="M28 2 54 17v30L28 62 2 47V17Z"/></svg>`).join('')}</div>`;
const SPARKS = `<span class="bv-sparks" aria-hidden="true">${[[9, 5, 0], [22, 7, 1.3], [35, 4, 2.4], [48, 6, .6], [61, 5, 1.9], [74, 7, .9], [88, 4, 2.9], [55, 3, 3.3]]
  .map(([l, s, d]) => `<i style="left:${l}%;width:${s}px;height:${s}px;animation-delay:${d}s"></i>`).join('')}</span>`;
const HONEY = BVM(BV.extra, 'honey-drop.webp');
const FLOATERS = `<div class="bv-floaters" aria-hidden="true">${[[3, 20, 74, .8], [97, 38, 54, .5], [95, 84, 124, .9], [6, 78, 44, .4]]
  .map(([x, y, s, z]) => `<span class="bv-floater" style="--fx:${x}%;--fy:${y}%;--flsz:${s}px;--fz:${z}"><img src="${HONEY}" alt="" loading="lazy" decoding="async"></span>`).join('')}</div>`;

const hTxt = a => a ? `${esc(a[0] || '')}${a[1] ? `<em class="bv-accent">${esc(a[1])}</em>` : ''}${esc(a[2] || '')}` : '';
const arr = '<span class="bv-arr">→</span>';
function bvMedia(m, alt, w, h, cls = 'bv-loop') {
  if (!m) return '';
  if (typeof m === 'string') return `<img class="${cls}" src="${m}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">`;
  return `<video class="${cls}" muted loop playsinline preload="none" width="${w}" height="${h}" poster="${m.poster}" aria-label="${esc(alt)}"><source data-src="${m.video}" type="video/mp4"></video>`;
}
function seal(big, small, ring, id) {
  return `<svg class="bv-seal10" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD983"/><stop offset=".5" stop-color="#E9A21C"/><stop offset="1" stop-color="#B86A00"/></linearGradient><path id="${id}p" d="M60 60m-45 0a45 45 0 1 1 90 0a45 45 0 1 1-90 0"/></defs>
    <circle cx="60" cy="60" r="58" fill="url(#${id}g)"/><circle cx="60" cy="60" r="52" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="2 3"/>
    <g class="bv-seal10__ring"><text font-family="Manrope,sans-serif" font-weight="800" font-size="8.6" fill="#3A2408" textLength="276" lengthAdjust="spacing"><textPath href="#${id}p">${esc(ring)}</textPath></text></g>
    <circle cx="60" cy="60" r="34" fill="#FFFBF3"/><text x="60" y="66" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="${big.length > 3 ? 21 : 27}" fill="#D62A1E">${esc(big)}</text>
    <text x="60" y="80" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="7.5" letter-spacing=".6" fill="#3A2408">${esc(small)}</text></svg>`;
}
function guaranteeSeal(days) {
  return `<svg class="bv-seal" viewBox="0 0 120 120" aria-hidden="true"><defs><path id="bv-sealc" d="M60 60m-43 0a43 43 0 1 1 86 0a43 43 0 1 1-86 0"/></defs>
    <circle cx="60" cy="60" r="57" fill="#F5A623"/><circle cx="60" cy="60" r="50" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 4"/><circle cx="60" cy="60" r="34" fill="#fff"/>
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
    const m = (d.packMedia && d.packMedia[k.key]) || (bundle && (bundle.img || (bundle.collage && bundle.collage[0][0]))) || p.img;
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

function renderLanding(p) {
  const d = LANDING[p.id] || {};
  const c = CAT_LANDING[p.cat] || {};
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
  const stage = d.stage || { img: p.img, plain: true };
  const sealArgs = stage.seal || [String(days), 'ДНИ ГАРАНЦИЯ', 'ПЛАЩАШ ПРИ ПОЛУЧАВАНЕ • ДОСТАВКА 1–2 ДНИ •'];
  const legendHtml = legend.length ? `<ul class="bv-inglegend bv-glass" aria-label="Съставки">${legend.map(([ic, b, s]) =>
    `<li>${/^https?:/.test(ic) ? `<img src="${ic}" alt="" width="40" height="40">` : `<span class="bv-legico" aria-hidden="true">${ic}</span>`}<span><b>${esc(b)}</b><small>${esc(s || '')}</small></span></li>`).join('')}</ul>` : '';
  const hero = `
  <section class="bv-hero${stage.plain ? ' bv-hero--plain' : ''}">
    ${d.bg || (bee && !stage.plain) ? `<div class="bv-hero__bg" aria-hidden="true"><img src="${BVM(BV.hero, 'hero-bg-a-2000.webp')}" alt="" width="2000" height="1125" fetchpriority="high"></div>` : '<div class="bv-hero__bg bv-hero__bg--soft" aria-hidden="true"></div>'}
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
          <img class="bv-stage__img" src="${stage.img}"${stage.small ? ` srcset="${stage.small} 700w, ${stage.img} 1200w" sizes="(min-width:960px) 600px, 92vw"` : ''} alt="${esc(p.name)}" fetchpriority="high" decoding="async">
          ${stage.glint ? `<span class="bv-stage__glint" aria-hidden="true" style="-webkit-mask-image:url('${stage.small}');mask-image:url('${stage.small}')"></span>` : ''}
          ${stage.drop ? '<span class="bv-honeydrop" aria-hidden="true"></span>' : ''}
          ${seal(sealArgs[0], sealArgs[1], sealArgs[2], 'bvs-' + p.id)}
          ${bee || d.bee ? `<span class="bv-stage__bee" aria-hidden="true"><img src="${BVM(BV.hero, 'hero-bee.webp')}" alt="" width="320" height="320" decoding="async"></span>` : ''}
        </div>
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
  const f = d.formula || {};
  const stats = f.stats || c.stats || [[String(ings.length || 1), ings.length === 1 ? 'активна съставка' : 'активни съставки'], [String(days), 'дни гаранция'], ['1–2', 'работни дни до вратата ти'], ['0 €', 'предплащане – плащаш на куриера']];
  const formula = `
  <section class="bv-formula bv-honeycomb" id="bv-formula">
    ${WAVE('var(--night)')}
    <div class="bv-wrap bv-formula__grid">
      <div>
        <span class="bv-eyebrow">${esc(f.eyebrow || p.shortName)}</span>
        <h2>${f.h2 ? `${esc(f.h2[0])}<em class="bv-accent" style="color:#FFC65C">${esc(f.h2[1])}</em>` : `${esc(p.name)} – <em class="bv-accent" style="color:#FFC65C">как действа</em>`}</h2>
        <p class="bv-lead">${esc(f.lead || p.short)}</p>
        <div class="bv-stats">${stats.map(([n, t]) => `<div class="bv-stat"><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join('')}</div>
        <a class="bv-btn" href="${toOffers}">Поръчай сега ${arr}</a>
      </div>
      <figure class="bv-formula__fig bv-rv"><div class="bv-formula__media${f.media ? '' : ' bv-formula__media--img'}">${f.media
        ? bvMedia(f.media, p.name, 720, 1274, 'bv-formula__video')
        : `<img src="${(p.gallery && p.gallery[0]) || p.img}" alt="${esc(p.name)}" loading="lazy" decoding="async">`}</div></figure>
    </div>
  </section>`;

  // --- защо го избират + качество + гаранция + ленти
  const bensD = d.bens;
  const icons = c.icons || ['✨', '🌿', '💧', '🛡️', '☀️', '🤲'];
  const bens = bensD ? bensD.items : p.bullets.map((b, i) => [icons[i % icons.length], b, '', null]);
  const tapesA = d.tapes || c.tapes || (ings.length ? ings.map(x => x[0].toUpperCase()) : p.bullets.map(b => b.toUpperCase()));
  const tapesB = ['ПЛАЩАШ ПРИ ПОЛУЧАВАНЕ', 'ДОСТАВКА 1–2 ДНИ', `${days} ДНИ ГАРАНЦИЯ`, 'ПРОИЗВЕДЕНО ЗА БЪЛГАРИЯ'];
  const tape = (cls, words) => `<div class="bv-tape ${cls}"><div class="bv-tape__track">${[...words, ...words, ...words, ...words].map(w => `<span>${esc(w)}</span><i>✦</i>`).join('')}</div></div>`;
  const why = `
  <section class="bv-why">
    ${HEXES}
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
    ${FLOATERS}
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
  const ingD = d.ings;
  const ingItems = ingD ? ingD.items : ings.map(([n, t], i) => [n, i ? '' : 'Основна съставка', t, null, !i]);
  const ingsHtml = ingItems.length ? `
  <section id="bv-sastav"><div class="bv-wrap">
    <div class="bv-center">
      <span class="bv-eyebrow">${esc(ingD ? ingD.eyebrow : 'Какво съдържа?')}</span>
      <h2>${ingD ? hTxt(ingD.h2) : `${ingItems.length === 1 ? 'Съставката' : `${ingItems.length} съставки`}, <em class="bv-accent">подбрани с грижа</em>`}</h2>
      <p class="bv-lead">${esc(ingD ? ingD.lead : 'Пълният състав е отпечатан върху опаковката.')}</p>
    </div>
    <div class="bv-ings${ingItems.some(x => x[3]) ? '' : ' bv-ings--plain'}">${ingItems.map(([n, tag, t, m, main]) => `
      <article class="bv-ing${main ? ' bv-ing--main' : ''}">
        ${m ? `<div class="bv-ing__img">${bvMedia(m, n, 600, 480)}</div>` : `<div class="bv-ing__ico" aria-hidden="true">${ingIcon(n)}</div>`}
        <div class="bv-ing__body">${tag ? `<span class="bv-ing__tag${main ? ' bv-ing__tag--main' : ''}">${esc(tag)}</span>` : ''}<h3>${esc(n)}</h3><p>${esc(t)}</p></div>
        <span class="bv-glare" aria-hidden="true"></span>
      </article>`).join('')}</div>
  </div></section>` : '';

  // --- сравнение (само където има данни)
  const vs = d.vs ? `
  <section class="bv-vs"><div class="bv-wrap">
    <div class="bv-center"><span class="bv-eyebrow">Сравни сам</span><h2>${hTxt(d.vs.h2)}</h2><p class="bv-lead">${esc(d.vs.lead)}</p></div>
    <div class="bv-vs__grid">
      <div class="bv-vs__hl" aria-hidden="true"></div>
      <div class="bv-vs__corner">Какво получаваш</div>
      <div class="bv-vs__head bv-vs__head--us"><img src="${d.vs.us[2]}" alt="" width="106" height="180" loading="lazy" decoding="async"><div><b>${esc(d.vs.us[0])}</b><span>${esc(d.vs.us[1])}</span></div></div>
      <div class="bv-vs__head bv-vs__head--them"><span class="bv-vs__badge" aria-hidden="true">VS</span><svg class="bv-vs__jar" viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="10" width="36" height="12" rx="4" fill="#C9BBA8"/><rect x="10" y="20" width="44" height="36" rx="9" fill="#E8DFD2" stroke="#C9BBA8" stroke-width="2"/><rect x="18" y="32" width="28" height="12" rx="3" fill="#F7F2EA"/></svg><div><b>${esc(d.vs.them[0])}</b><span>${esc(d.vs.them[1])}</span></div></div>
      ${d.vs.rows.map(([ic, f, u, small, t], i) => {
        const dl = `style="--bv-d:${(.1 + i * .12).toFixed(2)}s"`;
        return `<div class="bv-vs__f bv-rv" ${dl}><span class="bv-vs__ic" aria-hidden="true">${ic}</span>${esc(f)}</div>
        <div class="bv-vs__u bv-rv" ${dl}><span class="bv-vs__ok" aria-hidden="true">✓</span><div><b>${u}</b><small>${esc(small)}</small></div></div>
        <div class="bv-vs__t bv-rv" ${dl}><span class="bv-vs__no" aria-hidden="true">✕</span><span>${esc(t)}</span></div>`;
      }).join('')}
    </div>
    <div class="bv-vs__cta"><a class="bv-btn" href="${toOffers}">Избери своя пакет ${arr}</a><span class="bv-small">Плащаш при получаване · ${days} дни гаранция</span></div>
  </div></section>` : '';

  // --- как се използва
  const howD = d.how;
  const steps = howD ? howD.steps : String(p.usage || '').split(/(?<=\.)\s+/).filter(s => s.length > 3).slice(0, 4).map(s => [s.replace(/\.$/, ''), '', null]);
  const howHtml = steps.length ? `
  <section class="bv-how" style="background:var(--honey-50)"><div class="bv-wrap">
    <div class="bv-center">
      <span class="bv-eyebrow">${esc(howD ? howD.eyebrow : 'Как се използва?')}</span>
      <h2>${howD ? hTxt(howD.h2) : `${steps.length === 1 ? 'Една стъпка' : `${steps.length} лесни стъпки`}. <em class="bv-accent">Това е всичко.</em>`}</h2>
      ${howD ? `<p class="bv-lead">${esc(howD.lead)}</p>` : ''}
    </div>
    <ol class="bv-hsteps${steps.some(s => s[2]) ? '' : ' bv-hsteps--plain'}">${steps.map(([h, t, m], i) => `
      <li class="bv-hstep"><span class="bv-hstep__num" style="animation-delay:${(i * .6).toFixed(1)}s">${i + 1}</span>
        ${m ? `<div class="bv-hstep__media">${bvMedia(m, h, 600, 600)}</div>` : ''}
        <div class="bv-hstep__body"><h3>${esc(h)}</h3>${t ? `<p>${esc(t)}</p>` : ''}</div><span class="bv-glare" aria-hidden="true"></span></li>`).join('')}</ol>
    ${steps.some(s => s[2]) ? '<p class="bv-swipe">Плъзни настрани <span aria-hidden="true">→</span></p>' : ''}
    <div class="bv-how__foot">
      <div class="bv-note"><span>💡</span><span>${p.wellness
        ? 'Не поставяй върху наранена или раздразнена кожа. При заболяване, прием на лекарства, бременност или кърмене се посъветвай с лекар. Не е за деца.'
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
        <div class="bv-life__txt"><h3>${esc(life.h3[0])}<em class="bv-accent" style="color:#FFC65C">${esc(life.h3[1])}</em></h3><p>${esc(life.p)}</p><a class="bv-btn" href="${toOffers}">Виж специалната оферта ${arr}</a></div></div>` : ''}
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
    ? ['Подходящ ли е за мен?', 'Пластирът не е лекарство и не замества лечението или разнообразното хранене. При заболяване, прием на лекарства, бременност или кърмене се посъветвай с лекар преди употреба. Не е подходящ за деца.']
    : ['Подходящ ли е за чувствителна кожа?', `Направи първо тест на малък участък (например вътрешната страна на предмишницата) и изчакай 24 часа. Ако няма зачервяване или дискомфорт – използвай спокойно.${bee ? ' При алергия към пчелни продукти (ужилвания, мед, прополис) не го използвай без разговор с лекар.' : ''} При бременност или кърмене се консултирай с лекар.`];
  const faqGroups = [
    ['За продукта', [...(d.faq || []), ['Как се използва правилно?', p.usage], ...(p.wellness || bee ? [] : []), ['Лекарство ли е?', 'Не. Това е продукт за ежедневна грижа и не замества лечение, предписано от лекар. Индивидуалното усещане е различно.']]],
    ['Употреба и безопасност', [safety, ['Мога ли да го ползвам заедно с други продукти?', 'Да, при нужда остави време между нанасянията на една и съща зона. Ако приемаш лекарства или имаш заболяване, попитай лекаря си.']]],
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
    <div class="bv-final__media${stage.plain ? ' bv-final__media--card' : ''}"><img src="${stage.plain ? p.img : (stage.small || stage.img)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>
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
  root.innerHTML = hero + sitsHtml + eta + formula + why + offers(offersId, packs ? `Избери своя комплект <em class="bv-accent">на изгодна цена</em>` : `${esc(p.shortName)} <em class="bv-accent">с доставка до 2 дни</em>`)
    + ingsHtml + vs + howHtml + tlHtml + revHtml
    + (packs ? offers('bv-offers-2', `Вземи своя комплект <em class="bv-accent">още днес</em>`) : '')
    + faq + final + sticky;

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
    gr.addColorStop(0, 'rgba(255,246,214,1)'); gr.addColorStop(.35, 'rgba(255,212,120,.75)'); gr.addColorStop(1, 'rgba(255,190,80,0)');
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
      if (e.isIntersecting && !loaded) { $$('source[data-src]', v).forEach(s => { s.src = s.getAttribute('data-src'); }); v.load(); loaded = true; }
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
