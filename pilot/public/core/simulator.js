// Demo data source. Behaves like Meta + the shop + market feeds, so every screen
// and every rule can be tried without connecting anything. Deterministic: the same
// day gives the same numbers. Budget/status changes made in the app are respected.
import { rng, hash, addDays, dayDiff, daysBetween, poisson, gauss, pick, weekday, dayFraction, clamp } from "./util.js";

const ACCOUNTS = [
  { id: "demo_bg", name: "BeeVenom BG", country: "BG", sites: ["bg"], cpm: 3.1, ctr: 0.016, cvr: 0.06, aov: 33, calib: 1.28 },
  { id: "demo_sk", name: "Словакия", country: "SK", sites: ["sk"], cpm: 5.4, ctr: 0.014, cvr: 0.052, aov: 44, calib: 1.15 },
  { id: "demo_si", name: "Словения", country: "SI", sites: ["sl"], cpm: 6.1, ctr: 0.013, cvr: 0.05, aov: 47, calib: 1.1 },
  { id: "demo_hu", name: "Унгария", country: "HU", sites: ["hu"], cpm: 4.3, ctr: 0.015, cvr: 0.05, aov: 39, calib: 1.2 },
  { id: "demo_bio", name: "Bio", country: "BG", sites: ["bioshop"], cpm: 2.9, ctr: 0.017, cvr: 0.055, aov: 26, calib: 0.95 },
];

export const DEMO_PRODUCTS = [
  { name: "BeeVenom Care Gel 2+1", keys: "care gel 2+1,gel 2+1", cost: 15.9 },
  { name: "BeeVenom Care Gel", keys: "care gel,beevenom gel", cost: 6.4 },
  { name: "Крем за стави 3+2", keys: "3+2", cost: 12.5 },
  { name: "Крем за стави 2+1", keys: "2+1", cost: 8.9 },
  { name: "Крем за стави 30 г", keys: "крем за стави 30,30 г", cost: 3.6 },
  { name: "Пластири с пчелна отрова", keys: "пластири с пчелна", cost: 2.6 },
  { name: "Подарък пластири", keys: "подарък", cost: 1.2 },
  { name: "Спрей с пчелна отрова", keys: "спрей", cost: 1.4 },
  { name: "Хиалуронов крем", keys: "хиалурон", cost: 5.9 },
  { name: "Крем конски кестен", keys: "кестен", cost: 2.9 },
];
const CATALOG = {
  default: [
    { product: "BeeVenom Care Gel", price: 29.9, w: 4 },
    { product: "BeeVenom Care Gel 2+1", price: 59.8, w: 2 },
    { product: "Bee Venom крем за стави 3+2 бурканчета", price: 29.9, w: 3 },
    { product: "Bee Venom крем за стави 2+1 бурканчета", price: 22.9, w: 3 },
    { product: "Bee Venom крем за стави 30 г", price: 15.9, w: 1 },
  ],
  bioshop: [
    { product: "Хиалуронов крем", price: 24.9, w: 3 },
    { product: "Крем конски кестен", price: 14.9, w: 3 },
    { product: "Пластири с пчелна отрова", price: 12.9, w: 2 },
  ],
};
const PRICE_MULT = { BG: 1, SK: 1.35, SI: 1.45, HU: 1.2 };

// Hand-made concept pool. Several BG ads are near-clones on purpose (shows the Andromeda problem).
const POOL = [
  { n: "Баба Мария – болка в коляното", t: { angle: "pain", persona: "senior", format: "ugc", hook: "problem", visual: "home", talent: "woman60", length: "m", aspect: "9x16", offer: "b21" }, h: "Коленете ме боляха всяка сутрин, докато не опитах това" },
  { n: "Баба Мария v2 – сутрешна болка", t: { angle: "pain", persona: "senior", format: "ugc", hook: "problem", visual: "home", talent: "woman60", length: "m", aspect: "9x16", offer: "b21" }, h: "Всяка сутрин коленете ме боляха, докато не пробвах това" },
  { n: "Баба Мария v3 – нов текст", t: { angle: "pain", persona: "senior", format: "ugc", hook: "problem", visual: "home", talent: "woman60", length: "s", aspect: "9x16", offer: "b21" }, h: "Коленете ме боляха всяка сутрин – ето какво помогна" },
  { n: "Баба Мария 4:5", t: { angle: "pain", persona: "senior", format: "ugc", hook: "problem", visual: "home", talent: "woman60", length: "m", aspect: "4x5", offer: "b21" }, h: "Коленете ме боляха всяка сутрин, докато не опитах това" },
  { n: "Пчеларят Иван – как се добива", t: { angle: "natural", persona: "senior", format: "talking", hook: "pattern", visual: "apiary", talent: "man60", length: "l", aspect: "9x16", offer: "b32" }, h: "40 години пчелар. Ето защо мажа ставите си с пчелна отрова" },
  { n: "Демо – гелът попива за 10 сек", t: { angle: "routine", persona: "office", format: "demo", hook: "demo", visual: "studio", talent: "none", length: "s", aspect: "9x16", offer: "single" }, h: "Гледай колко бързо попива" },
  { n: "Статично 2+1 подарък", t: { angle: "offer", persona: "senior", format: "static", hook: "number", visual: "text", talent: "none", length: "na", aspect: "1x1", offer: "b21" }, h: "2+1 гратис само тази седмица" },
  { n: "Отзиви – карусел 5 клиенти", t: { angle: "social", persona: "senior", format: "carousel", hook: "testimonial", visual: "home", talent: "woman60", length: "na", aspect: "1x1", offer: "none" }, h: "Над 12 000 доволни клиенти" },
  { n: "Синът купува на майка си", t: { angle: "gift", persona: "child", format: "skit", hook: "callout", visual: "home", talent: "man35", length: "m", aspect: "9x16", offer: "b21" }, h: "Майка ти още ли се оплаква от коленете?" },
  { n: "Хапчета vs гел", t: { angle: "compare", persona: "woman40", format: "motion", hook: "statement", visual: "text", talent: "none", length: "s", aspect: "4x5", offer: "single" }, h: "Хапчетата удрят стомаха. Има и друг начин" },
  { n: "Фитнес треньор – след тренировка", t: { angle: "lifestyle", persona: "sport", format: "ugc", hook: "callout", visual: "gym", talent: "man35", length: "m", aspect: "9x16", offer: "single" }, h: "Ако тренираш след 40, това е за теб" },
  { n: "Градина – отново на лехите", t: { angle: "lifestyle", persona: "gardener", format: "ugc", hook: "question", visual: "village", talent: "woman60", length: "m", aspect: "9x16", offer: "b32" }, h: "Пак ли не можете да се наведете в градината?" },
  { n: "Физиотерапевт обяснява", t: { angle: "expert", persona: "senior", format: "talking", hook: "number", visual: "clinic", talent: "expert", length: "l", aspect: "4x5", offer: "none" }, h: "3 грешки, които влошават ставите след 50" },
  { n: "Подкаст – история на Стефка", t: { angle: "story", persona: "senior", format: "podcast", hook: "testimonial", visual: "studio", talent: "woman60", length: "xl", aspect: "9x16", offer: "none" }, h: "Мислех, че ще ме оперират…" },
  { n: "Как действа пчелната отрова", t: { angle: "science", persona: "woman40", format: "motion", hook: "question", visual: "text", talent: "none", length: "m", aspect: "9x16", offer: "none" }, h: "Защо пчелната отрова затопля ставата?" },
  { n: "Страх от операция", t: { angle: "fear", persona: "senior", format: "ugc", hook: "statement", visual: "home", talent: "man60", length: "m", aspect: "4x5", offer: "b21" }, h: "Лекарят ми каза „операция“. Аз реших първо да опитам това" },
  { n: "Строител – болки в гърба", t: { angle: "pain", persona: "worker", format: "ugc", hook: "callout", visual: "outdoor", talent: "man35", length: "s", aspect: "9x16", offer: "single" }, h: "Цял ден на крака и вечер не можеш да заспиш?" },
  { n: "Мийм – колената в 7 сутринта", t: { angle: "pain", persona: "office", format: "meme", hook: "pattern", visual: "text", talent: "none", length: "s", aspect: "9x16", offer: "none" }, h: "Колената ми в 7 сутринта:" },
];

const CAMPAIGN_PLANS = {
  demo_bg: [
    { name: "ADV+ Продажби | Гел | Широко", cbo: 140, adsets: [{ name: "Широко 35+ BG", ads: [0, 1, 2, 3, 4, 6, 7, 15] }] },
    { name: "Тест креативи | ABO", adsets: [{ name: "Тест – подарък за родител", budget: 18, ads: [8, 11] }, { name: "Тест – сравнение", budget: 15, ads: [9, 14] }, { name: "Тест – спорт и труд", budget: 15, ads: [10, 16, 17] }] },
    { name: "Ретаргет 30 дни", adsets: [{ name: "Посетители 30д", budget: 12, ads: [12, 13] }] },
  ],
  demo_sk: [
    { name: "ADV+ Predaj | Gél", cbo: 90, adsets: [{ name: "Široko SK 40+", ads: [0, 4, 5, 7, 8, 12, 15] }] },
    { name: "Test kreatív | ABO", adsets: [{ name: "Test – záhrada", budget: 15, ads: [11, 10] }] },
  ],
  demo_si: [{ name: "ADV+ Prodaja | Gel", cbo: 70, adsets: [{ name: "Široko SI", ads: [0, 1, 4, 6, 7, 13] }] }],
  demo_hu: [
    { name: "ADV+ Értékesítés | Gél", cbo: 85, adsets: [{ name: "Széles HU 45+", ads: [0, 4, 5, 6, 8, 12, 14, 9] }] },
    { name: "Retarget HU", adsets: [{ name: "Látogatók 30n", budget: 10, ads: [7, 15] }] },
  ],
  demo_bio: [{ name: "Bio | Кремове | ABO", adsets: [{ name: "Жени 35+ кремове", budget: 25, ads: [5, 9, 14] }, { name: "Конски кестен – крака", budget: 15, ads: [6, 16] }] }],
};

export function createSimulator({ today, overrides = {}, now = new Date() }) {
  const frac = dayFraction(now);
  const accounts = ACCOUNTS.map((a) => ({ id: a.id, name: a.name, country: a.country, sites: a.sites, currency: "EUR" }));
  const A = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a]));
  const campaigns = [], adsets = [], ads = [], creatives = [];

  for (const acc of ACCOUNTS) {
    const r = rng(`struct|${acc.id}`);
    CAMPAIGN_PLANS[acc.id].forEach((cp, ci) => {
      const cid = `${acc.id}_c${ci}`;
      campaigns.push({ id: cid, account: acc.id, name: cp.name, status: "ACTIVE", objective: "OUTCOME_SALES", budget: cp.cbo || null, created: addDays(today, -60 + ci * 9) });
      cp.adsets.forEach((as, si) => {
        const sid = `${cid}_s${si}`;
        adsets.push({ id: sid, account: acc.id, campaign: cid, name: as.name, status: "ACTIVE", budget: cp.cbo ? null : as.budget, created: addDays(today, -50 + si * 6), learning: si === 0 && ci === 1 ? "learning" : "active" });
        as.ads.forEach((pi, k) => {
          const p = POOL[pi];
          const crId = `cr_${acc.id}_${pi}`;
          const launchAgo = Math.round(4 + r() * 38 - k * 2);
          if (!creatives.find((c) => c.id === crId)) {
            creatives.push({
              id: crId, name: p.n, account: acc.id, country: acc.country, kind: ["static", "carousel"].includes(p.t.format) ? "image" : "video",
              tags: { ...p.t, language: acc.country.toLowerCase() }, hookText: p.h, source: "meta", status: "live", createdAt: addDays(today, -Math.max(1, launchAgo) - 2),
              q: Math.exp(gauss(rng(`q|${crId}`)) * 0.33), half: 13 + rng(`h|${crId}`)() * 30, hook: 0.22 + rng(`hk|${crId}`)() * 0.16,
            });
          }
          ads.push({ id: `${sid}_a${k}`, account: acc.id, campaign: cid, adset: sid, name: `${p.n}`, status: "ACTIVE", creative: crId, created: addDays(today, -Math.max(1, launchAgo)) });
        });
      });
    });
    // Bench: a couple of ready creatives per account.
    [[13, 2], [11, 1]].slice(0, acc.id === "demo_bg" ? 1 : 2).forEach(([pi], j) => {
      const p = POOL[(pi + j * 3 + acc.id.length) % POOL.length];
      creatives.push({ id: `bench_${acc.id}_${j}`, name: `${p.n} (резерва)`, account: acc.id, country: acc.country, kind: "video", tags: { ...p.t, language: acc.country.toLowerCase() }, hookText: p.h + "!", source: "studio", status: "bench", createdAt: addDays(today, -2), q: 1, half: 20, hook: 0.3 });
    });
  }

  // Ads launched from the app (bench creatives put live).
  for (const l of overrides._launched || []) {
    const as = adsets.find((s) => s.id === l.adset);
    const cr = creatives.find((c) => c.id === l.creative);
    if (!as || !cr || ads.some((a) => a.id === l.id)) continue;
    cr.status = "live";
    ads.push({ id: l.id, account: as.account, campaign: as.campaign, adset: as.id, name: cr.name.replace(" (резерва)", ""), status: "ACTIVE", creative: cr.id, created: l.since });
  }
  // Overrides from the app: shown at once, but the simulated delivery changes from
  // `since` (tomorrow) – what was spent today stays spent, like on Meta.
  const ov = (id) => overrides[id] || {};
  for (const list of [campaigns, adsets, ads]) for (const e of list) {
    e.origStatus = e.status;
    e.origBudget = e.budget;
    const o = ov(e.id);
    if (o.status) e.status = o.status;
    if (o.budget != null) e.budget = o.budget;
  }
  const statusOn = (e, d) => {
    const o = ov(e.id);
    if (o.status && o.since && d >= o.since) return o.status;
    return e.origStatus;
  };
  const budgetOn = (e, d) => {
    const o = ov(e.id);
    if (o.budget != null && o.since && d >= o.since) return o.budget;
    return e.origBudget;
  };

  // --- country/day factors -------------------------------------------------
  const marketFactor = (country, d) => {
    const ago = dayDiff(d, today);
    const r = rng(`mkt|${country}|${d}`);
    const nov = d.slice(5, 7) === "11" ? Math.max(0, Number(d.slice(8, 10)) - 8) / 19 : d.slice(5, 7) === "12" ? 0.6 : 0;
    let cpm = 1 + 0.42 * Math.min(1, nov) + 0.06 * gauss(r) + (weekday(d) === 6 || weekday(d) === 0 ? -0.05 : 0);
    let ctr = 1 + 0.05 * gauss(r), cvr = 1 + 0.08 * gauss(r), attention = 1 + 0.15 * gauss(r), trend = 50 + 4 * gauss(r) + (Number(d.slice(5, 7)) >= 11 ? 6 : 0);
    if (country === "BG" && ago <= 2) { cpm *= 1.33; ctr *= 0.82; cvr *= 0.8; attention = 4.2 + r(); }
    if (country === "SK" && ago <= 5) { cvr *= 1.5; trend += 14 - ago; }
    if (country === "HU" && ago <= 6) { cpm *= 1.24; }
    return { cpm, ctr, cvr, attention, trend };
  };

  // --- per ad per day ----------------------------------------------------------
  const cache = new Map();
  function adDay(ad, d) {
    const key = `${ad.id}|${d}`;
    if (cache.has(key)) return cache.get(key);
    const acc = A[ad.account];
    const cr = creatives.find((c) => c.id === ad.creative);
    const age = dayDiff(ad.created, d);
    const row = { date: d, ad: ad.id, adset: ad.adset, campaign: ad.campaign, account: ad.account, spend: 0, impressions: 0, reach: 0, clicks: 0, lpv: 0, purchases: 0, value: 0, video3s: 0, thruplay: 0 };
    if (age < 0 || statusOn(ad, d) !== "ACTIVE" || statusOn(adsets.find((s) => s.id === ad.adset), d) !== "ACTIVE" || statusOn(campaigns.find((c) => c.id === ad.campaign), d) !== "ACTIVE") {
      cache.set(key, row);
      return row;
    }
    const fresh = (a) => (a < 0 ? 0 : clamp(0.75 + 0.07 * a, 0, 1.05) * Math.exp(-Math.max(0, a - 6) / cr.half));
    const siblings = ads.filter((x) => x.adset === ad.adset && statusOn(x, d) === "ACTIVE" && dayDiff(x.created, d) >= 0);
    const weight = (x) => {
      const c = creatives.find((k) => k.id === x.creative);
      return Math.pow(c.q * fresh(dayDiff(x.created, d)), 2.2) + 0.02;
    };
    const share = weight(ad) / siblings.reduce((t, x) => t + weight(x), 0);
    const as = adsets.find((s) => s.id === ad.adset), camp = campaigns.find((c) => c.id === ad.campaign);
    const holderBudget = camp.budget ? budgetOn(camp, d) * (1 / adsets.filter((s) => s.campaign === camp.id).length) : budgetOn(as, d);
    const r = rng(key);
    const mf = marketFactor(acc.country, d);
    const isToday = d === today;
    const util = (0.9 + 0.12 * r()) * (isToday ? frac : 1);
    const f = fresh(age);
    const spend = holderBudget * share * util;
    const cpm = acc.cpm * mf.cpm * (1 + 0.6 * (1 - Math.min(1, f))) * (1 + 0.08 * gauss(r));
    const impressions = Math.round((spend / cpm) * 1000);
    const ctr = acc.ctr * cr.q * mf.ctr * (0.55 + 0.45 * f) * (1 + 0.1 * gauss(r));
    const clicks = Math.round(impressions * Math.max(0.002, ctr));
    const lpv = Math.round(clicks * (0.72 + 0.08 * r()));
    let lambda = lpv * acc.cvr * Math.sqrt(cr.q) * mf.cvr * (0.7 + 0.3 * f);
    if (ad.account === "demo_bio" && dayDiff(d, today) <= 2) lambda *= 0.35; // demo: broken pixel on Bio
    const purchases = poisson(r, lambda);
    Object.assign(row, {
      spend: Math.round(spend * 100) / 100,
      impressions,
      reach: Math.round(impressions / (1.03 + Math.min(1.1, age * 0.028))),
      clicks,
      lpv,
      purchases,
      value: Math.round(purchases * acc.aov * (0.9 + 0.25 * r()) * 100) / 100,
      video3s: cr.kind === "video" ? Math.round(impressions * cr.hook * (0.6 + 0.4 * f)) : 0,
      thruplay: cr.kind === "video" ? Math.round(impressions * cr.hook * 0.35 * f) : 0,
    });
    cache.set(key, row);
    return row;
  }

  function insights(since, until) {
    const out = [];
    for (const d of daysBetween(since, until)) for (const ad of ads) {
      const r = adDay(ad, d);
      if (r.impressions > 0) out.push(r);
    }
    return out;
  }

  // Real shop orders, driven by "true" purchases (Meta purchases × calibration, minus the pixel bug).
  function orders(since, until) {
    const out = [];
    let no = 5000;
    for (const d of daysBetween(since, until)) {
      for (const acc of ACCOUNTS) {
        const r = rng(`ord|${acc.id}|${d}`);
        let meta = 0;
        for (const ad of ads.filter((x) => x.account === acc.id)) meta += adDay(ad, d).purchases;
        if (acc.id === "demo_bio" && dayDiff(d, today) <= 2) meta /= 0.35;
        const n = poisson(r, meta * acc.calib);
        const ago = dayDiff(d, today);
        const cat = CATALOG[acc.sites[0]] || CATALOG.default;
        for (let i = 0; i < n; i++) {
          const items = [];
          const totalW = cat.reduce((t, x) => t + x.w, 0);
          let x = r() * totalW, it = cat[0];
          for (const c of cat) { if ((x -= c.w) <= 0) { it = c; break; } }
          const pm = PRICE_MULT[acc.country] || 1;
          items.push({ product: it.product, qty: 1, total: Math.round(it.price * pm * 10) / 10 });
          if (r() < 0.22) items.push({ product: "Спрей с пчелна отрова", qty: 1, total: Math.round(4.9 * pm * 10) / 10 });
          if (it.product.includes("Gel") && r() < 0.6) items.push({ product: "Подарък 12 бр. пластири", qty: 1, total: 0 });
          const sub = items.reduce((t, k) => t + k.total, 0);
          const ship = r() < 0.3 ? 0 : 4.5;
          let status = "p", shipped = 0;
          const u = r();
          if (ago >= 8) { if (u < 0.07) status = "x"; else if (u < 0.17) { status = "x"; shipped = 1; } else { status = "c"; shipped = 1; } }
          else if (ago >= 1) { if (u < 0.06) status = "x"; else { status = ago >= 4 && u > 0.55 ? "c" : "s"; shipped = 1; } }
          out.push({ site: acc.sites[0], account: acc.id, date: d, status, shipped, subTotal: sub, shipping: ship, discount: 0, total: Math.round((sub + ship) * 100) / 100, items, orderNo: no++ });
        }
      }
    }
    return out;
  }

  function sessions(since, until) {
    const out = [];
    for (const d of daysBetween(since, until)) for (const acc of ACCOUNTS) {
      let lpv = 0;
      for (const ad of ads.filter((x) => x.account === acc.id)) lpv += adDay(ad, d).lpv;
      out.push({ site: acc.sites[0], account: acc.id, date: d, sessions: Math.round(lpv * 1.22 + 15 * rng(`s|${acc.id}|${d}`)()) });
    }
    return out;
  }

  function market(country, days = 45) {
    return daysBetween(addDays(today, -(days - 1)), today).map((d) => {
      const m = marketFactor(country, d);
      return { date: d, attention: Math.round(m.attention * 100) / 100, trend: Math.round(m.trend), cpmIndex: Math.round(m.cpm * 100) };
    });
  }

  const headlines = {
    BG: [{ title: "Национално събитие доминира новините (демо)", when: addDays(today, -1), volume: 4.1 }, { title: "Студено и влажно време в цялата страна (демо)", when: addDays(today, -3), volume: 1.4 }],
    SK: [{ title: "Rastúci záujem o prírodnú kozmetiku (демо)", when: addDays(today, -4), volume: 1.2 }],
    SI: [],
    HU: [{ title: "Black Friday kampányok indulnak (демо)", when: addDays(today, -2), volume: 1.6 }],
  };

  function competitors() {
    const pages = [
      { id: "cp1", name: "АртроГел Плюс (демо)", country: "BG" },
      { id: "cp2", name: "Пчелен Балсам (демо)", country: "BG" },
      { id: "cp3", name: "СтавиФлекс (демо)", country: "BG" },
      { id: "cp4", name: "KĺbUľava (демо)", country: "SK" },
      { id: "cp5", name: "SklepGel (демо)", country: "SI" },
      { id: "cp6", name: "ÍzületMax (демо)", country: "HU" },
    ];
    return pages.map((p) => {
      const r = rng(`comp|${p.id}`);
      const n = 4 + Math.floor(r() * 9) + (p.id === "cp3" ? 9 : 0);
      const adsList = Array.from({ length: n }, (_, i) => {
        const tpl = pick(r, POOL);
        const start = addDays(today, -Math.floor(r() < 0.3 ? 30 + r() * 70 : r() * 14) - (p.id === "cp3" && i > 3 ? -0 : 0));
        const active = r() > 0.15;
        return {
          id: `${p.id}_ad${i}`,
          start: p.id === "cp3" && i >= n - 9 ? addDays(today, -Math.floor(r() * 5)) : start,
          active,
          text: tpl.h,
          angle: tpl.t.angle,
          format: tpl.t.format,
          variants: 1 + Math.floor(r() * 4),
          reach: Math.round(2000 + r() * 90000),
          countries: r() > 0.8 ? 2 : 1,
          offer: pick(r, ["2+1 гратис", "−50%", "Безплатна доставка", "3+2", ""]),
        };
      });
      return { ...p, ads: adsList };
    });
  }

  return { accounts, campaigns, adsets, ads, creatives, insights, orders, sessions, market, headlines, competitors, products: DEMO_PRODUCTS, isDemo: true };
}
