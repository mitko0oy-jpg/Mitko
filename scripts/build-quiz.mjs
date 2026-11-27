// Checks the math tasks („200 задачи по математика“) and turns them into modules and items for /api/admin/import.
// The task files are paid content and stay outside this repository (private/mat/*.json).
// Usage: node scripts/build-quiz.mjs <out.json> <tasks.json>... [--free 11]
// A task file: { "parts": [{ "id": "5a", "grade": 5, "title": "…", "tasks": [task, …] }] }
// A task: { n, lv (0 Знам, 1 Разбирам, 2 Мисля), q, o: [right, wrong…], h, s: [{do, why}], a, trap, card, t }
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const freeAt = args.indexOf("--free");
const FREE = freeAt >= 0 ? Number(args.splice(freeAt, 2)[1]) : 11;
const [outFile, ...inFiles] = args;
if (!outFile || !inFiles.length) {
  console.error("Usage: node scripts/build-quiz.mjs <out.json> <tasks.json>... [--free 11]");
  process.exit(1);
}

// Card number → its topic, as printed on the cards „Еду БЕЛ – Математика“ (50 cards).
const CARDS = {
  4: "Делимост, прости числа, НОД и НОК", 5: "Обикновени и десетични дроби", 6: "Рационални числа: знаци и ред",
  7: "Степени и техните свойства", 8: "Модул: разстояние до нулата", 9: "Мерни единици и мащаб",
  10: "Права и обратна пропорционалност", 11: "Процент: част и цяло", 12: "Две поредни промени на цената",
  13: "Отстъпка, лихва и ДДС", 14: "Едночлени, многочлени и стойност", 15: "Формули за съкратено умножение",
  16: "Разлагане на множители", 17: "Линейно уравнение", 18: "Уравнение-произведение", 19: "Уравнение с модул",
  20: "Линейни неравенства", 21: "От текст към уравнение", 22: "Задачи за движение", 23: "Съвместна работа",
  24: "Смеси и сплави", 25: "Ъгли и успоредни прави", 26: "Ъгли в триъгълник", 27: "Неравенство на триъгълника",
  28: "Признаци за еднакви триъгълници", 29: "Равнобедрен и равностранен", 30: "Правоъгълен: 30° и медиана",
  31: "Симетрала и ъглополовяща", 32: "Питагорова теорема", 33: "Четириъгълници и многоъгълници",
  34: "Лица и координатна система", 35: "Окръжност и кръг", 36: "Куб, призма и пирамида",
  37: "Цилиндър, конус и кълбо", 38: "Диаграми и средно аритметично", 39: "Вероятност на събитие", 40: "Множества",
  41: "Пълно решение: алгебра", 42: "Пълно решение: текстова задача", 43: "Пълно решение: доказателство",
  44: "Знаци и отрицателни числа", 45: "Степени и формули", 46: "Три решения, три грешки",
  47: "Уравнения: изгубени решения", 48: "Мерни единици", 49: "Лице, периметър и радиус",
};
const LEVELS = [{ name: "Знам", pts: 1 }, { name: "Разбирам", pts: 2 }, { name: "Мисля", pts: 3 }];

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const text = (v) => typeof v === "string" && v.trim().length > 0;
const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

// Notation: the app shows {a/b} as a fraction; the rest is plain text.
function notation(where, s) {
  if (typeof s !== "string") return;
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0 || depth > 1) return err(where, `скобите { } не са наред: ${s}`);
  }
  if (depth) return err(where, `незатворена { : ${s}`);
  for (const m of s.matchAll(/\{([^{}]*)\}/g)) if (!/^[^/]+\/[^/]+$/.test(m[1])) err(where, `{…} трябва да е дроб {числител/знаменател}: {${m[1]}}`);
  if (/\d\.\d/.test(s)) warn(where, `десетична точка вместо запетая: ${s}`);
  if (/(^|[\s(=])-\s?[\dx(]/.test(s)) warn(where, `тире вместо знак минус „−“: ${s}`);
  if (/теза/i.test(s)) err(where, "думата „теза“");
}

const modules = [];
const items = [];
const seenN = new Set();
let position = 0;

for (const file of inFiles) {
  const src = JSON.parse(await readFile(file, "utf8"));
  for (const part of src.parts || []) {
    position++;
    const slug = `mat-${part.id}`;
    if (!/^[5-7][a-z]$/.test(part.id)) err(slug, "id на частта трябва да е като 5a");
    if (![5, 6, 7].includes(part.grade)) err(slug, "клас 5, 6 или 7");
    if (!text(part.title)) err(slug, "липсва заглавие");
    let lastLv = 0;
    for (const t of part.tasks || []) {
      const w = `${slug} №${t.n}`;
      if (!Number.isInteger(t.n) || t.n < 1) err(w, "номерът n");
      if (seenN.has(t.n)) err(w, "повторен номер");
      seenN.add(t.n);
      if (![0, 1, 2].includes(t.lv)) err(w, "ниво lv 0, 1 или 2");
      if (t.lv < lastLv) err(w, "нивата трябва да вървят Знам → Разбирам → Мисля");
      lastLv = t.lv;
      for (const f of ["q", "h", "a", "trap", "t"]) if (!text(t[f])) err(w, `липсва ${f}`);
      if (!Array.isArray(t.o) || t.o.length !== 4 || !t.o.every(text)) err(w, "трябват точно 4 отговора");
      else if (new Set(t.o.map(norm)).size !== 4) err(w, "еднакви отговори");
      if (!Array.isArray(t.s) || t.s.length < 2 || t.s.length > 7) err(w, "решението трябва да е 2–7 стъпки");
      else t.s.forEach((st, i) => {
        if (!text(st.do)) err(w, `стъпка ${i + 1} няма „do“`);
        if (!text(st.why)) err(w, `стъпка ${i + 1} няма „why“ (обяснение)`);
      });
      if (!CARDS[t.card]) err(w, `няма карта ${t.card}`);
      else if (norm(CARDS[t.card]) !== norm(t.t)) warn(w, `темата „${t.t}“ не е като на карта ${t.card}: „${CARDS[t.card]}“`);
      for (const f of ["q", "h", "a", "trap"]) notation(`${w} ${f}`, t[f]);
      (t.o || []).forEach((o, i) => notation(`${w} o[${i}]`, o));
      (t.s || []).forEach((st, i) => {
        notation(`${w} s[${i}].do`, st.do);
        notation(`${w} s[${i}].why`, st.why);
      });
      items.push({ module: slug, ext: `mat-${String(t.n).padStart(3, "0")}`, position: t.n, data: t });
    }
    const n = (part.tasks || []).length;
    const lv = [0, 1, 2].map((l) => (part.tasks || []).filter((t) => t.lv === l).length);
    console.log(`${slug}  ${part.grade}. клас · ${part.title}: ${n} задачи (Знам ${lv[0]}, Разбирам ${lv[1]}, Мисля ${lv[2]}) · до ${lv[0] + 2 * lv[1] + 3 * lv[2]} т.`);
    modules.push({
      slug,
      subject: "mat",
      grade: part.grade,
      kind: "quiz",
      title: part.title,
      subtitle: `Математика · ${part.grade}. клас`,
      position,
      free_count: FREE,
      meta: { levels: LEVELS },
    });
  }
}

const ns = [...seenN].sort((a, b) => a - b);
if (ns.length && (ns[0] !== 1 || ns.at(-1) !== ns.length)) warn("номера", `не са поредни 1–${ns.length}`);
console.log(`Общо: ${items.length} задачи в ${modules.length} части; безплатни по ${FREE} от част.`);
for (const x of warnings) console.warn(`внимание – ${x}`);
if (errors.length) {
  for (const x of errors) console.error(`ГРЕШКА – ${x}`);
  console.error(`${errors.length} грешки: файлът не е записан.`);
  process.exit(1);
}
await writeFile(outFile, JSON.stringify({ modules, items }, null, 1));
console.log(`Записано: ${outFile}`);
