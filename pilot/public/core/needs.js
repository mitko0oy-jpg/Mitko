// "What needs a new ad right now" – the whole creative workflow in one list.
// An ad is replaced when it does not sell cheaply (cost per order above the allowed
// maximum after enough spend) or is burned out. Every slot gets a NEW idea: different
// from every live ad in its ad set (Andromeda groups look-alikes into one ad).
import { nextBriefs } from "./learning.js";
import { sameConcept } from "./diversity.js";
import { tagLabel } from "./taxonomy.js";
import { COUNTRY } from "./metrics.js";

// Banner structures. Each is a proven performance-ad layout; "trend" marks the formats
// that work best right now (2026: native, lo-fi and "not an ad" looks beat polished studio
// ads). Кошер learns which ones win for you and gives trending ones a head start.
export const LAYOUTS = {
  hero: { name: "Голямо заглавие + продукт", steps: ["Заглавие отгоре – до 6 думи, едро", "Продуктът голям в центъра, в реална сцена", "Кръгъл стикер с офертата", "Лента „Поръчай сега“ отдолу"], prompt: "Layout: big bold headline across the top third; the real product large in the center in a real-life scene; round offer sticker; a clear call-to-action strip at the bottom." },
  native: { trend: true, name: "Като снимка от телефон", steps: ["Естествена снимка от телефон – продуктът в ръка или на масата", "Текст като надпис в TikTok/Instagram (бял с черен контур)", "Малък стикер с офертата", "Без лъскав студиен вид"], prompt: "Layout: looks like a casual smartphone photo (UGC, natural light, slightly imperfect framing) of the real product in hand or on a home table; caption text in native social style (white text with black outline) at the top; small offer sticker; must NOT look like a polished studio ad." },
  notes: { trend: true, name: "Бележка в телефона", steps: ["Изглежда като бележка/съобщение в телефона", "3 кратки реда с отметки", "Снимка на продукта отдолу", "Оферта и „плащане при доставка“"], prompt: "Layout: designed like a phone notes app or chat message screenshot with a short title and 3 short checkmarked lines; a photo of the real product below; small offer line with cash on delivery." },
  vs: { trend: true, name: "Ние срещу другите", steps: ["Екранът разделен на две", "Вляво: „обикновеното“ с ✗", "Вдясно: нашият продукт с ✓ и 3 предимства", "Оферта отдолу"], prompt: "Layout: split screen comparison. Left side: a generic ordinary alternative with red crosses. Right side: the real product with green checkmarks and 3 short advantages. Offer at the bottom. Do not show competitor brands." },
  callouts: { name: "Продукт с 3 стрелки", steps: ["Продуктът в центъра", "3 стрелки към кратки ползи", "Заглавие отгоре", "Оферта в ъгъла"], prompt: "Layout: the real product centered on a clean background; three arrows pointing to three short benefit callouts; headline at the top; offer badge in a corner." },
  offer: { name: "Офертата е звездата", steps: ["Огромно „2+1 ГРАТИС“ или пакетът", "Продуктите подредени", "„Плащане при доставка“", "Краен срок: „само тази седмица“"], prompt: "Layout: the offer is the hero – a huge bundle/discount text; the real products arranged as the bundle; a 'cash on delivery' line; a small urgency line (this week only)." },
  story: { name: "Историята зад продукта", steps: ["Топла снимка (пчелин, ръце, дом)", "Едно изречение като ръкописна бележка", "Продуктът в ъгъла"], prompt: "Layout: warm authentic photo telling the origin story; one short sentence styled as a handwritten note; the real product small in a corner." },
  listicle: { name: "3 причини", steps: ["Заглавие „3 причини…“", "3 номерирани реда с иконки", "Продуктът вдясно", "Оферта отдолу"], prompt: "Layout: headline '3 reasons…'; three numbered lines with simple icons on the left; the real product on the right; offer at the bottom." },
  social: { name: "Звездите на клиентите", steps: ["Голям ред със 5 звезди", "Кратко „Любим на хиляди клиенти“", "Продуктът", "Оферта"], prompt: "Layout: a large five-star rating row at the top; a short line about many happy customers (no names, no invented quotes); the real product; offer badge." },
  editorial: { trend: true, name: "Като статия/новина", steps: ["Заглавие в стил статия/новина", "Реална снимка", "Малък етикет „Ново“", "Продуктът присъства естествено"], prompt: "Layout: looks like an editorial or news article thumbnail – article-style headline, a realistic photo, a small 'new' label; the real product appears naturally in the photo." },
};

// Head start for trending layouts and for angles that win for competitors.
export function creativePriors({ competitors = [], country } = {}) {
  const pr = {};
  for (const [k, l] of Object.entries(LAYOUTS)) if (l.trend) pr[`layout|${k}`] = { a: 1.5, b: 0, why: "актуален формат (2026)" };
  for (const c of competitors) {
    if (country && c.country !== country) continue;
    for (const ad of c.ads || []) {
      if (!ad.winner || !ad.angle) continue;
      const key = `angle|${ad.angle}`;
      pr[key] = { a: (pr[key]?.a || 0) + 0.7, b: 0, why: "печели при конкурентите" };
    }
  }
  return pr;
}

// Built-in rules shown in the app and baked into every prompt.
export const AD_RULES = [
  { t: "Една реклама = една нова идея", d: "Различен ъгъл, човек, сцена и първи кадър. 4 варианта на една идея Мета брои за 1 реклама – от тях пускаме най-добрия." },
  { t: "Спира скрола за 1 секунда", d: "Голямо ясно заглавие до 6 думи или силен първи кадър. Без дълги текстове." },
  { t: "Истинският продукт в кадър", d: "Снимката на продукта от сайта влиза във всяка реклама – AI не измисля опаковката." },
  { t: "Два размера", d: "4:5 за фийда и 9:16 за Reels и Stories." },
  { t: "Само козметични думи", d: "Грижа, масаж, затопляне, комфорт. Никога „лекува“, „болки“, „артрит“, „възпаление“, „преди/след“ и „Имате ли…?“." },
  { t: "Оферта и доверие", d: "Пакет (2+1, 3+2), плащане при доставка, бърза доставка." },
  { t: "AI човек = етикет", d: "Ако в рекламата има реалистичен AI човек – надпис „Създадено с изкуствен интелект“ (закон от 2.08.2026)." },
  { t: "Структура, която продава", d: "Всеки банер следва проверена структура (заглавие + продукт, „като от телефон“, бележка, ние срещу другите, 3 причини…). Кошер предпочита структурите, които печелят при теб и при конкурентите, и дава шанс на най-новите формати." },
  { t: "Продава евтино или се сменя", d: "Ако след 2× допустимата цена няма поръчка или поръчката излиза по-скъпо от допустимото – Кошер я маркира за смяна с нова идея." },
];

const NICHE = {
  edubel: { product: "образователни карти и тестове за НВО по български език и литература", productEn: "study cards and practice tests for the Bulgarian 7th-grade national exam in Bulgarian language and literature", niche: "education, exam prep for 7th grade (Bulgaria)", audience: "parents of 6th and 7th graders in Bulgaria who want their child calmly prepared for the national exam" },
  default: { product: "гел и крем с пчелна отрова за масаж на ставите и мускулите", productEn: "a bee venom massage gel and cream for joint and muscle care (natural cosmetics)", niche: "natural cosmetics with bee venom (joint & muscle care massage gel)", audience: "people over 45 who are active, do physical work or sports, and adult children buying for their parents" },
};
export const nicheFor = (lineId) => NICHE[lineId] || NICHE.default;

// Short, compliant headlines per idea (≤ 6 words). Еду БЕЛ has its own.
const HEAD = {
  default: { pain: ["Вечер краката искат грижа", "Сутрешен ритуал за подвижност"], natural: ["Природна грижа с пчелна отрова", "От пчелина до вашия дом"], science: ["Затоплящ масаж с пчелна отрова", "Усети топлината за секунди"], social: ["Хиляди доволни клиенти", "Любимият гел на България"], offer: ["2+1 гратис само сега", "3+2 с безплатна доставка"], compare: ["Не поредното мазило", "Гел, който наистина попива"], fear: ["Грижа всеки ден, не по-късно", "Не отлагай грижата за себе си"], lifestyle: ["Пак на разходка с внуците", "Активен ден, спокойна вечер"], story: ["Рецептата на стария пчелар", "Семейна грижа от пчелина"], gift: ["Подарък за мама и татко", "Подари им спокойни вечери"], expert: ["Избор на масажистите", "Препоръчван за масаж"], routine: ["30 секунди вечерен ритуал", "Нанеси, масажирай, отпусни се"] },
  edubel: { pain: ["НВО без стрес", "Спокойно към изпита"], natural: ["Учене като игра", "Карти вместо зубрене"], science: ["Как запомнят отличниците", "Метод, който остава в главата"], social: ["Хиляди деца вече учат така", "Родителите го препоръчват"], offer: ["Комплект карти с отстъпка", "Целият материал на едно място"], compare: ["Карти вместо скучни учебници", "По-лесно от учебника"], fear: ["Остават малко месеци до НВО", "Започнете подготовката сега"], lifestyle: ["15 минути на ден стигат", "Учене и в автобуса"], story: ["Нашият път до НВО", "Как се подготвихме за НВО"], gift: ["Най-полезният подарък за ученик", "Подарък, който помага"], expert: ["Създадени от учител по БЕЛ", "Учителски подбор на материала"], routine: ["15 минути карти всяка вечер", "Малко всеки ден, голям резултат"] },
};
export function headline(lineId, angle, seed = 0) {
  const set = (lineId === "edubel" ? HEAD.edubel : HEAD.default)[angle] || HEAD.default.pain;
  return set[Math.abs(seed) % set.length];
}

const EDU_ANGLE = { pain: "Без стрес преди изпита", natural: "Учене чрез игра", science: "Метод за запомняне", social: "Други родители и деца", offer: "Оферта", compare: "Карти срещу учебници", fear: "Времето до НВО", lifestyle: "Малко време на ден", story: "Нашата история", gift: "Подарък", expert: "Учителят", routine: "Ежедневен навик" };

// ctx: { lines (accounts), ads (adModels), adsets (adsetModels), library, tags, today }
export function computeNeeds({ accounts, accts, ads, adsets, library, tags, today, bench, competitors = [] }) {
  const out = [];
  for (const a of accounts) {
    const th = accts[a.id]?.thresholds || {};
    const cpaMax = th.maxCpaTarget, q = accts[a.id]?.q || 1;
    const live = ads.filter((x) => x.account === a.id && x.status === "ACTIVE");
    if (!live.length) continue;
    // 1) Ads that do not sell cheaply or are burned → replace.
    for (const ad of live) {
      const m = ad.m7.spend > 0 ? ad.m7 : ad.mLife;
      const spent = m.spend || 0;
      let reason = null;
      if (Number.isFinite(cpaMax) && cpaMax > 0 && spent >= 2 * cpaMax && (m.orders || 0) < 0.5) reason = `${eur(spent)} без поръчка (допустимо ${eur(cpaMax)} на поръчка)`;
      else if (Number.isFinite(cpaMax) && cpaMax > 0 && spent >= 3 * cpaMax && m.cpo > cpaMax * 1.15) reason = `поръчката излиза ${eur(m.cpo)}, а допустимото е ${eur(cpaMax)}`;
      else if (Number.isFinite(cpaMax) && cpaMax <= 0 && spent >= 20 && m.cmPct < 0) reason = `на загуба: марж ${Math.round(m.cmPct * 100)}%`;
      else if (ad.fatigue?.stage === "burned") reason = `изгоряла – ${ad.fatigueText}`;
      if (reason) out.push({ id: `rep:${ad.id}`, kind: "replace", line: a.id, lineName: a.name, country: a.country, adset: ad.adset, adsetName: ad.adsetName, replaces: { id: ad.id, name: ad.name }, reason, priority: 100 + spent });
    }
    // 2) Not enough ready replacements for what will burn soon.
    const gap = bench?.[a.id]?.plan?.gap || 0;
    const mainAdset = [...adsets].filter((s) => s.account === a.id && s.status === "ACTIVE").sort((x, y) => (y.activeAds || 0) - (x.activeAds || 0))[0];
    for (let i = 0; i < Math.min(gap, 3); i++) out.push({ id: `new:${a.id}:${i}`, kind: "bench", line: a.id, lineName: a.name, country: a.country, adset: mainAdset?.id, adsetName: mainAdset?.name, reason: `резерва – ${bench[a.id].plan.soon} реклами ще изгорят до 7 дни`, priority: 50 - i });
  }
  out.sort((x, y) => y.priority - x.priority);
  // Give each slot a concept that is new for its ad set (and for the batch).
  const taken = [];
  for (const s of out.slice(0, 12)) {
    const liveCr = ads.filter((x) => x.adset === s.adset && x.status === "ACTIVE").map((x) => x.cr);
    const avoid = library.filter((c) => c.country === s.country).map((c) => c.tags || {}).concat(taken);
    let pick = null;
    for (let tries = 0; tries < 6 && !pick; tries++) {
      const b = nextBriefs(tags, s.country, 1, `${today}|${s.id}|${tries}`, avoid, creativePriors({ competitors, country: s.country }))[0];
      if (!b) break;
      b.tags.format = "static"; // banners; a video made from the banner keeps the same idea
      const cand = { tags: b.tags };
      if (!liveCr.some((c) => sameConcept(cand, c))) pick = b;
      else avoid.push(b.tags);
    }
    if (!pick) continue;
    taken.push(pick.tags);
    s.concept = { tags: pick.tags, summary: summary(pick.tags, s.line), why: whyOf(pick), layout: layoutOf(pick.tags) };
  }
  return out.filter((s) => s.concept).slice(0, 12);
}

// Banners are always static, so a reason about the video format would only confuse.
export const whyOf = (b) => (b.why || []).filter((w) => !w.startsWith("Формат"));

export const layoutOf = (t) => {
  const l = LAYOUTS[t.layout] || LAYOUTS.hero;
  return { id: t.layout || "hero", name: l.name, steps: l.steps, trend: !!l.trend };
};

export function summary(t, lineId) {
  if (lineId === "edubel") return `${EDU_ANGLE[t.angle] || t.angle} · за родители на седмокласници · ${(LAYOUTS[t.layout] || LAYOUTS.hero).name.toLowerCase()}`;
  return `${tagLabel("angle", t.angle)} · за ${tagLabel("persona", t.persona).toLowerCase()} · ${(LAYOUTS[t.layout] || LAYOUTS.hero).name.toLowerCase()}`;
}

// The prompt for Higgsfield Ads Studio (images) – rules included, text in the market's language.
// English wording for the image model (it follows English instructions best);
// only the text ON the banner is in the market's language.
const LANG_EN = { BG: "Bulgarian", SK: "Slovak", SI: "Slovenian", HU: "Hungarian" };
const LAND_EN = { BG: "Bulgaria", SK: "Slovakia", SI: "Slovenia", HU: "Hungary" };
const EN = {
  angle: { pain: "evening relief and comfort after a long day", natural: "natural care from the apiary (bee venom)", science: "how the warming massage works", social: "loved by many customers", offer: "the bundle offer is the hero", compare: "not just another ordinary cream", fear: "care today instead of putting it off", lifestyle: "back to an active, joyful day", story: "the old beekeeper's family recipe", gift: "a caring gift for mum and dad", expert: "chosen by massage therapists", routine: "a 30-second evening ritual" },
  persona: { senior: "people 55+", worker: "people doing physical work", sport: "active people after training", office: "office workers (neck and back)", child: "adult children buying for their parents", gardener: "gardeners and village life", woman40: "women 40+" },
  visual: { home: "cozy home or kitchen", outdoor: "outdoors in nature", studio: "clean studio background", apiary: "apiary with beehives", clinic: "massage studio", gym: "gym or sports setting", text: "bold text-first design", village: "village yard" },
  talent: { woman60: "a woman about 60", man60: "a man about 60", woman35: "a woman 30–45", man35: "a man 30–45", expert: "a massage therapist", none: "no person, product only", ai: "a person" },
};
const EDU_EN = { pain: "calm, stress-free exam preparation", natural: "learning through play", science: "a memory method that sticks", social: "many parents and kids already learn this way", offer: "the card set offer", compare: "cards instead of boring textbooks", fear: "only a few months left until the national exam", lifestyle: "15 minutes a day is enough", story: "our family's road to the exam", gift: "the most useful gift for a student", expert: "made by a Bulgarian language teacher", routine: "a small daily habit with big results" };

export function adsPrompt({ concept, hook, country, lineId, offer }) {
  const lang = LANG_EN[country] || "Bulgarian";
  const n = nicheFor(lineId);
  const t = concept.tags;
  const en = (dim, v) => EN[dim]?.[v] || tagLabel(dim, v);
  return [
    `Scroll-stopping Meta ad for ${n.productEn || n.product}.`,
    lineId === "edubel"
      ? `Idea: ${EDU_EN[t.angle] || t.angle}. For parents of 7th graders preparing for the national exam. Scene: ${en("visual", t.visual)}.`
      : `Idea: ${en("angle", t.angle)}. For: ${en("persona", t.persona)}. Scene: ${en("visual", t.visual)}; person: ${en("talent", t.talent)}.`,
    (LAYOUTS[t.layout] || LAYOUTS.hero).prompt,
    country === "BG" || !LANG_EN[country]
      ? `Headline (max 6 words), exactly: „${hook}“. All text on the image in Bulgarian Cyrillic, spelled correctly.`
      : `Headline (max 6 words) in ${lang}: a natural ${lang} version of „${hook}“ (Bulgarian original; if it names a country, use ${LAND_EN[country]}). All text on the image in ${lang} with correct diacritics.`,
    `Show the REAL product from the reference photos clearly and unchanged – do not redesign the packaging.`,
    offer ? `Offer badge: ${offer}. Cash on delivery.` : `Small badge: cash on delivery.`,
    lineId === "edubel"
      ? `Friendly, trustworthy, school-themed. No promises of exact grades.`
      : `Only cosmetic wording: care, massage, warming, comfort. No medical claims, no disease names, no pain words, no before/after, no questions about the viewer's health.`,
    `Clean, high-contrast, mobile-first layout, one clear focal point, big readable headline, no clutter.`,
  ].join(" ");
}

export function videoPrompt({ concept }) {
  const t = concept.tags;
  return `Smooth, realistic 5-second ad shot. Setting: ${EN.visual[t.visual] || "cozy home"}. Gentle camera push-in, natural light, the product stays sharp and unchanged, subtle motion (hands applying a little gel, soft glow). No new text, no distortion.`;
}

function eur(n) {
  return Number.isFinite(n) ? `${n.toFixed(2).replace(".", ",")} €` : "—";
}
