// Claim linter for ad copy and scripts (BG / SK / SI / HU).
// Based on: EU cosmetics rules (Reg. 1223/2009 art. 20, Reg. 655/2013 – a product
// presented to relieve joint pain is a medicine, not a cosmetic), Meta's personal
// health policy (no "Do you have joint pain?"), EU AI Act art. 50 (label realistic
// AI people since 2 Aug 2026) and the Unfair Commercial Practices Directive
// (no fake testimonials). This is a safety net, not legal advice.

const MEDICAL = [
  // Bulgarian
  /леку?ва/i, /излекува/i, /облекчава болк/i, /премахва болк/i, /спира болк/i, /артрит/i, /артроз/i, /ревмат/i, /възпален/i, /противовъзпалит/i, /терапи/i, /лечени/i, /хапче/i, /дискова херния/i, /ишиас/i, /гарантиран резултат/i, /100% ефект/i,
  // Slovak
  /lieči/i, /vylieči/i, /artritíd/i, /artróz/i, /zápal/i, /reumat/i, /odstraňuje bolesť/i, /tlmí bolesť/i,
  // Slovenian
  /zdravi\b/i, /pozdravi/i, /artritis/i, /artroz/i, /vnetj/i, /revmat/i, /odpravi bolečin/i, /lajša bolečin/i,
  // Hungarian
  /gyógyít/i, /meggyógy/i, /ízületi gyulladás/i, /artritisz/i, /artrózis/i, /reuma/i, /csillapítja a fájdalm/i, /megszünteti a fájdalm/i,
];

const PERSONAL = [
  // Second person + a condition = "personal attributes" under Meta policy.
  /(имате ли|имаш ли|страдате ли|страдаш ли|боли ли ви|боли ли те|пак ли не можете|пак ли не можеш|вашите (стави|колене|болки)|твоите (стави|колене|болки))/i,
  /(máte bolesti|trpíte|bolia vás|vaše kĺby)/i,
  /(imate bolečine|ali vas bolijo|vaši sklepi)/i,
  /(fáj(nak)? az ízületei|szenved ön|az ön ízületei)/i,
];

const BEFORE_AFTER = [/преди и след/i, /before.?after/i, /pred a po/i, /pred in po/i, /előtte.?utána/i];
const ABSOLUTE = [/завинаги/i, /моментално/i, /за 1 ден/i, /веднага изчезва/i, /navždy/i, /za vedno/i, /örökre/i, /azonnal/i];

export const AI_LABEL = {
  bg: "Създадено с изкуствен интелект",
  sk: "Vytvorené pomocou umelej inteligencie",
  sl: "Ustvarjeno z umetno inteligenco",
  si: "Ustvarjeno z umetno inteligenco",
  hu: "Mesterséges intelligenciával készült",
};

export const SAFE_CLAIMS = [
  "грижа за кожата около ставите",
  "масаж и приятно затопляне",
  "комфорт след натоварен ден",
  "натурални съставки с пчелна отрова",
  "бързо попива, не цапа",
  "част от вечерния ритуал",
];

export function lint({ text = "", script = "", talent, format, isAiGenerated, language = "bg", angle }) {
  const all = `${text}\n${script}`;
  const issues = [];
  for (const re of MEDICAL) if (re.test(all)) issues.push({ level: "block", code: "medical", text: `Медицинско твърдение („${all.match(re)[0]}“). За козметика е разрешено само „грижа, масаж, затопляне, комфорт“.` });
  for (const re of PERSONAL) if (re.test(all)) issues.push({ level: "block", code: "personal", text: `Лично обръщение към състояние („${all.match(re)[0]}“) – Мета го отхвърля. Говори за ситуацията, не за човека: „След дълъг ден на крака…“` });
  for (const re of BEFORE_AFTER) if (re.test(all)) issues.push({ level: "block", code: "before_after", text: "„Преди/след“ при здравни теми е рисково – избягвай." });
  for (const re of ABSOLUTE) if (re.test(all)) issues.push({ level: "warn", code: "absolute", text: `Абсолютно обещание („${all.match(re)[0]}“) – трудно се доказва.` });
  const aiPerson = isAiGenerated && talent && !["none"].includes(talent);
  if (aiPerson || talent === "ai") issues.push({ level: "must", code: "ai_label", text: `Реалистичен AI човек → задължителен видим етикет от първия кадър: „${AI_LABEL[language] || AI_LABEL.bg}“ (EU AI Act чл. 50, от 2.08.2026).` });
  if ((aiPerson || talent === "ai") && ["social", "story"].includes(angle)) issues.push({ level: "block", code: "fake_testimonial", text: "AI аватар не може да се представя като истински клиент или специалист (Директива за нелоялните търговски практики)." });
  if (talent === "expert" && isAiGenerated) issues.push({ level: "block", code: "fake_expert", text: "AI „специалист“ е забранен – използвай истински човек с право да говори." });
  const blocks = issues.filter((i) => i.level === "block").length;
  return { ok: blocks === 0, blocks, issues };
}
