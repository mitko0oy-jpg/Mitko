// Turns the source content (data/*.json from the Еду БЕЛ materials) into modules and items
// for /api/admin/import. The source files are paid content and stay outside this repository.
// Usage: node scripts/build-content.mjs <path-to-data-dir> <out.json>
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [dataDir, outFile] = process.argv.slice(2);
if (!dataDir || !outFile) {
  console.error("Usage: node scripts/build-content.mjs <data-dir> <out.json>");
  process.exit(1);
}
const load = async (f) => JSON.parse(await readFile(path.join(dataDir, f), "utf8"));

const cardsSrc = await load("grade7_literature_cards.json");
const t25Src = await load("grade7_task25.json");
const charsSrc = await load("grade7_ai_characters.json");
const peshoSrc = await load("grade7_ai_pesho.json");
const worksSrc = await load("grade7_works.json");

const LEVELS = cardsSrc.levels.map((l) => ({ name: l.name, desc: l.desc }));
const card = (c) => ({
  n: c.id,
  l: c.level - 1,
  q: c.question,
  qt: c.quote || null,
  o: c.options, // options[0] is the correct answer; the app shuffles them
  e: c.explanation,
  w: c.review_label,
  ws: c.works,
});

// Works of the 6th-grade programme that are also on the 7th-grade exam list.
const GRADE6_WORKS = [
  "Хубава си, моя горо",
  "Отечество любезно, как хубаво си ти!",
  "Косачи",
  "Художник",
  "Под игото – „Представлението“",
  "Под игото – „Радини вълнения“",
  "Братчетата на Гаврош",
  "Серафим",
];

const modules = [];
const items = [];

// ---- 7th grade ----
modules.push({
  slug: "bel7-test",
  grade: 7,
  kind: "diagnostic",
  title: "Входен тест",
  subtitle: "15 въпроса за 10 минути. Показва нивото спрямо НВО.",
  position: 1,
  free_ratio: 1,
  meta: { levels: LEVELS },
});
const diagIds = [1, 7, 13, 19, 25, 31, 37, 43, 49, 55, 61, 67, 73, 79, 85];
diagIds.forEach((id, k) => {
  const c = cardsSrc.cards.find((x) => x.id === id);
  items.push({ module: "bel7-test", ext: `diag-${id}`, position: k + 1, data: card(c) });
});

modules.push({
  slug: "bel7-karti",
  grade: 7,
  kind: "cards",
  title: "90 литературни карти",
  subtitle: "Всички 22 творби за НВО в три нива",
  position: 2,
  free_count: 30,
  meta: { levels: LEVELS, works: worksSrc.works },
});
for (const c of cardsSrc.cards) {
  items.push({ module: "bel7-karti", ext: `card-${c.id}`, position: (c.level - 1) * 1000 + c.id, data: card(c) });
}

modules.push({
  slug: "bel7-zadacha25",
  grade: 7,
  kind: "t25",
  title: "Задача 25",
  subtitle: "Тренажор и коуч за разширения свободен отговор",
  position: 3,
  free_ratio: 0.3,
  meta: { self_check: t25Src.self_check },
});
for (const t of t25Src.tasks) {
  items.push({
    module: "bel7-zadacha25",
    ext: `t25-${t.id}`,
    position: t.id,
    data: { w: t.work, a: t.author, task: t.task, q: t.quote || null, keys: t.key_ideas, model: t.model_answer },
  });
}

modules.push({
  slug: "bel7-geroi",
  grade: 7,
  kind: "chars",
  title: "Интервю с героя",
  subtitle: "Питай героите от творбите. Те ти отговарят.",
  position: 4,
  free_ratio: 0.3,
  meta: {},
});
charsSrc.characters.forEach((c, k) => {
  items.push({ module: "bel7-geroi", ext: `char-${c.id}`, position: k + 1, data: c });
});

modules.push({
  slug: "bel7-pesho",
  grade: 7,
  kind: "pesho",
  title: "Научи Пешо",
  subtitle: "Пешо бърка всичко. Обясни му и ще запомниш.",
  position: 5,
  free_ratio: 0.3,
  meta: {},
});
peshoSrc.mistakes.forEach((p, k) => {
  items.push({ module: "bel7-pesho", ext: `pesho-${k + 1}`, position: k + 1, data: { work: p.work, says: p.pesho_says, truth: p.truth } });
});

// ---- 6th grade: the cards about 6th-grade works ----
const g6 = cardsSrc.cards.filter((c) => c.works.every((w) => GRADE6_WORKS.includes(w)));
modules.push({
  slug: "bel6-karti",
  grade: 6,
  kind: "cards",
  title: "Литературни карти",
  subtitle: `${g6.length} карти за творбите от 6. клас`,
  position: 2,
  free_ratio: 0.3,
  meta: { levels: LEVELS, works: GRADE6_WORKS },
});
g6.forEach((c) => items.push({ module: "bel6-karti", ext: `card-${c.id}`, position: (c.level - 1) * 1000 + c.id, data: card(c) }));

await writeFile(outFile, JSON.stringify({ modules, items }));
const count = {};
for (const it of items) count[it.module] = (count[it.module] || 0) + 1;
console.log(count);
