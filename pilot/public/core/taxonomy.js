// The creative "DNA". Every ad we ever make is described along these axes.
// Meta Andromeda groups ads that look/feel alike into one retrieval candidate, so
// real diversity means changing the BIG axes (concept: angle, persona, format,
// visual world, talent), not just the headline or the colour.

export const DIMENSIONS = [
  {
    key: "angle", label: "Ъгъл (послание)", weight: 0.26,
    values: {
      pain: "Болка → облекчение",
      natural: "Природа / пчелна отрова",
      science: "Как действа (наука)",
      social: "Отзиви / социално доказателство",
      offer: "Оферта / цена",
      compare: "Сравнение с хапчета и мазила",
      fear: "Страх от операция / хапчета",
      lifestyle: "Отново активен живот",
      story: "Лична история",
      gift: "Подарък за родител",
      expert: "Мнение на специалист",
      routine: "Ежедневен ритуал",
    },
  },
  {
    key: "persona", label: "За кого", weight: 0.16,
    values: {
      senior: "55+ с болки в ставите",
      worker: "Физически труд",
      sport: "Спортуващи / тренировки",
      office: "Офис – врат и гръб",
      child: "Деца, които купуват на родители",
      gardener: "Градинари / село",
      woman40: "Жени 40+",
    },
  },
  {
    key: "format", label: "Формат", weight: 0.16,
    values: {
      ugc: "UGC видео (селфи)",
      talking: "Говореща глава / експерт",
      demo: "Демонстрация на продукта",
      static: "Статична снимка",
      carousel: "Карусел",
      motion: "Моушън / анимация",
      podcast: "Подкаст / интервю",
      skit: "Скеч / сценка",
      meme: "Мийм / тренд",
    },
  },
  {
    key: "hook", label: "Тип кука", weight: 0.12,
    values: {
      question: "Въпрос",
      callout: "Обръщение към аудиторията",
      statement: "Смело твърдение",
      demo: "Визуална демонстрация",
      testimonial: "Започва с отзив",
      problem: "Показва проблема",
      number: "Число / факт",
      pattern: "Нестандартен кадър",
    },
  },
  {
    key: "visual", label: "Визуален свят", weight: 0.12,
    values: {
      home: "Вкъщи / кухня",
      outdoor: "Навън / природа",
      studio: "Студио / чист фон",
      apiary: "Пчелин / пчели",
      clinic: "Кабинет / бяла престилка",
      gym: "Фитнес / спорт",
      text: "Текст на екрана",
      village: "Село / двор",
    },
  },
  {
    key: "talent", label: "Лице", weight: 0.08,
    values: {
      woman60: "Жена 60+",
      man60: "Мъж 60+",
      woman35: "Жена 30–45",
      man35: "Мъж 30–45",
      expert: "Специалист",
      none: "Без човек",
      ai: "AI аватар",
    },
  },
  {
    key: "length", label: "Дължина", weight: 0.04,
    values: { s: "до 15 сек", m: "15–30 сек", l: "30–60 сек", xl: "над 60 сек", na: "—" },
  },
  {
    key: "aspect", label: "Размер", weight: 0.03,
    values: { "9x16": "9:16", "4x5": "4:5", "1x1": "1:1", "16x9": "16:9" },
  },
  {
    key: "offer", label: "Оферта", weight: 0.03,
    values: { single: "1 брой", b21: "2+1", b32: "3+2", gift: "С подарък", free: "Безплатна доставка", none: "Без оферта" },
  },
  {
    key: "layout", label: "Структура на банера", weight: 0.1,
    values: {
      hero: "Голямо заглавие + продукт",
      native: "Като снимка от телефон",
      notes: "Бележка в телефона",
      vs: "Ние срещу другите",
      callouts: "Продукт с 3 стрелки",
      offer: "Офертата е звездата",
      story: "Историята зад продукта",
      listicle: "3 причини",
      social: "Звездите на клиентите",
      editorial: "Като статия/новина",
    },
  },
];

export const DIM = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d]));
export const CONCEPT_DIMS = ["angle", "persona", "format", "visual", "talent"];

export const tagLabel = (dim, val) => DIM[dim]?.values?.[val] || val || "—";

export const STATUS = {
  live: "В реклама",
  bench: "Резерва (готова)",
  draft: "Идея",
  generating: "Генерира се",
  review: "За преглед",
  retired: "Спряна",
};
