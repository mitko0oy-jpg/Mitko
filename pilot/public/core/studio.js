// Creative studio: turns "gaps" into briefs. With AI connected, Claude writes the
// concept, script and translations; without it we fall back to solid templates.
import { DIM, tagLabel } from "./taxonomy.js";
import { lint, AI_LABEL, SAFE_CLAIMS } from "./compliance.js";
import { checkNew } from "./diversity.js";
import { COUNTRY } from "./metrics.js";
import { rng, pick } from "./util.js";

const HOOKS = {
  pain: ["След дълъг ден на крака вечерта е най-тежка. Ето моят ритуал.", "Сутрин първите стъпки са най-трудни – затова започвам така."],
  natural: ["Пчелите правят нещо, което лабораториите копират.", "От пчелина до буркана – без излишна химия."],
  science: ["Защо пчелната отрова затопля кожата? 20 секунди обяснение.", "Какво има в един грам от този гел?"],
  social: ["Над 12 000 поръчки в България. Ето какво казват клиентите.", "Прочетох 300 отзива, преди да поръчам."],
  offer: ["2+1 гратис – само до неделя.", "Плащаш при получаване. Без риск."],
  compare: ["Мазила, лепенки, грейки… опитах всичко. Това остана.", "Не още едно мазило – ето разликата."],
  fear: ["Преди да се примириш, опитай натурален масаж с пчелна отрова.", "Не чакай „по-късно“ – грижата е всеки ден."],
  lifestyle: ["Пак на разходка в парка – без да мисля за коленете.", "Внуците искат да играем. Аз съм готов."],
  story: ["Баща ми е пчелар от 40 години. Ето какво ми показа.", "Моята майка не вярваше, докато не опита."],
  gift: ["Най-практичният подарък за мама тази година.", "Подари на родителите си спокойни вечери."],
  expert: ["Масажистка от 20 години: това е гелът, който ползвам.", "3 навика за ставите след 50 – от физиотерапевт."],
  routine: ["30 секунди вечер – моят ритуал за подвижност.", "Нанеси, масажирай, усети топлината."],
};
const SCENES = {
  ugc: "Селфи кадър с телефон, естествена светлина, човекът говори директно в камерата.",
  talking: "Статичен кадър, човекът седи, говори спокойно и уверено, надписи на екрана.",
  demo: "Едър план на ръцете и продукта: нанасяне, попиване, текстура.",
  static: "Една силна снимка: продуктът + кратко заглавие, текстът се добавя от приложението (не от AI).",
  carousel: "5 карти: проблем → съставки → как се ползва → отзиви → оферта.",
  motion: "Анимирани икони и текст върху чист фон, бърз ритъм.",
  podcast: "Двама души на микрофони, разговорен тон, субтитри.",
  skit: "Кратка сценка с двама герои и обрат в края.",
  meme: "Популярен мийм формат, адаптиран към ежедневна ситуация.",
};

export function templateConcept(tags, country, seed) {
  const r = rng(seed);
  const hook = pick(r, HOOKS[tags.angle] || HOOKS.pain);
  const lang = COUNTRY[country]?.lang || "bg";
  return {
    title: `${tagLabel("angle", tags.angle)} · ${tagLabel("persona", tags.persona)} · ${tagLabel("format", tags.format)}`,
    hookText: hook,
    script: [
      `0–3 сек (кука): ${hook}`,
      `3–12 сек: ${SCENES[tags.format] || ""} Обстановка: ${tagLabel("visual", tags.visual)}. Лице: ${tagLabel("talent", tags.talent)}.`,
      `12–22 сек: Ползи без медицински обещания – ${pick(r, SAFE_CLAIMS)}, ${pick(r, SAFE_CLAIMS)}.`,
      `22–30 сек: Призив: „Поръчай с плащане при доставка“ + оферта (${tagLabel("offer", tags.offer || "b21")}).`,
    ].join("\n"),
    firstFrame: `Първи кадър: ${tagLabel("visual", tags.visual)}, ${tagLabel("talent", tags.talent)} – различен от всички досегашни.`,
    language: lang,
    translations: lang === "bg" ? {} : { [lang]: "Преводът се прави от AI и се проверява от носител на езика." },
    aiLabel: tags.talent === "ai" ? AI_LABEL[lang] : null,
  };
}

// Build the Claude prompt for a batch of briefs.
export function briefPrompt({ country, product, briefs, library, insights }) {
  const c = COUNTRY[country] || COUNTRY.BG;
  const done = library.slice(-60).map((x) => `- ${x.hookText} [${Object.values(x.tags || {}).join(", ")}]`).join("\n");
  return `Ти си креативен стратег за Meta реклами на ${product || "гел с пчелна отрова"} (козметика, плащане при доставка) за ${c.name}.
Напиши ${briefs.length} рекламни концепции. Всяка трябва да следва зададените тагове и да е РАЗЛИЧНА от вече правеното (Meta Andromeda групира сходни реклами – различаваме се по ъгъл, човек, формат, първи кадър и обстановка, не само по текст).

Задължителни правила:
- Само козметични твърдения: грижа, масаж, затопляне, комфорт. Никога „лекува“, „облекчава болки“, „артрит“, „възпаление“.
- Без лично обръщение към състояние („Имате ли болки…“). Говори за ситуации.
- Без „преди/след“. Без измислени отзиви. AI аватар никога не е „клиент“ или „специалист“.
- Текстът върху изображения се добавя от приложението – не го искай от генератора.
- Кука до 3 секунди, призив с плащане при доставка.

Какво работи досега: ${(insights?.top || []).join("; ") || "още няма данни"}.
Какво не работи: ${(insights?.bottom || []).join("; ") || "още няма данни"}.

Вече правено (не повтаряй):
${done || "—"}

Концепции за писане (тагове):
${briefs.map((b, i) => `${i + 1}. ${Object.entries(b.tags).map(([k, v]) => `${DIM[k]?.label}: ${tagLabel(k, v)}`).join("; ")}`).join("\n")}

Върни САМО JSON масив: [{"title","hookText","script","firstFrame","videoPrompt","translations":{"${c.lang}":"кука и текст на ${c.langName}"}}]. hookText и script на български; videoPrompt на английски, без текст в кадъра и без медицински сцени.`;
}

// Score and gate a batch: novelty against the library + claim linting.
export function gate(concepts, library, country) {
  return concepts.map((c) => {
    const novelty = checkNew({ id: "new", tags: c.tags, hookText: c.hookText, script: c.script }, library);
    const comp = lint({ text: c.hookText, script: c.script, talent: c.tags.talent, format: c.tags.format, isAiGenerated: true, language: COUNTRY[country]?.lang, angle: c.tags.angle });
    return { ...c, novelty: { score: Math.round(novelty.score * 100), ...novelty.verdict, nearest: novelty.nearest.map((n) => ({ id: n.c.id, name: n.c.name, score: Math.round(n.score * 100) })) }, compliance: comp };
  });
}

export const PROVIDERS = [
  { id: "minimax-h3", name: "MiniMax H3", kind: "video", route: "fal.ai / MiniMax API", price: "≈ $0.08/сек", use: "Масово b-roll видео от снимка на продукта" },
  { id: "wan-3", name: "Wan 3.0", kind: "video", route: "fal.ai / Alibaba", price: "≈ $0.10/сек", use: "№1 по качество (текст→видео), до 30 сек" },
  { id: "seedance-2.5", name: "Seedance 2.5", kind: "video", route: "fal.ai / BytePlus", price: "≈ $0.25–0.50/сек", use: "Герой видео, до 50 референции (без истински лица)" },
  { id: "kling-4", name: "Kling 4.0", kind: "video", route: "fal.ai", price: "≈ $0.16/сек", use: "Резервен видео модел" },
  { id: "omni-flash", name: "Gemini Omni Flash 1.2", kind: "video", route: "Gemini API", price: "≈ $0.07/сек", use: "Редакции: смяна на размер, продукт, сцена" },
  { id: "heygen", name: "HeyGen Avatar / Video 1", kind: "avatar", route: "HeyGen API", price: "≈ $0.02–0.12/сек", use: "Говореща глава (с AI етикет)" },
  { id: "higgsfield", name: "Higgsfield (Wan lip-sync)", kind: "avatar", route: "Higgsfield API / MCP", price: "по кредити", use: "UGC с ИСТИНСКИ глас + синхрон на устните" },
  { id: "elevenlabs-v3", name: "ElevenLabs v3", kind: "voice", route: "ElevenLabs API", price: "по символи", use: "Глас на BG/SK/SL/HU (и четирите поддържани)" },
  { id: "gpt-image-2.6", name: "GPT Image 2.6", kind: "image", route: "OpenAI API", price: "≈ $0.04/изобр.", use: "Сцени за статични реклами с реалния продукт" },
  { id: "nano-banana", name: "Nano Banana 2 / Pro", kind: "image", route: "Gemini API", price: "≈ $0.04–0.13/изобр.", use: "Редакции с много референции" },
];
