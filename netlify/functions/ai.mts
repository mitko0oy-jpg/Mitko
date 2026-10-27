import type { Config } from "@netlify/functions";
import { accessibleItems, type ModuleRow } from "../lib/access.mts";
import { chat, jsonCall, safety } from "../lib/ai.mts";
import { requireChild } from "../lib/auth.mts";
import { one } from "../lib/db.mts";
import { spend } from "../lib/usage.mts";
import { bad, body, forbidden, handle, json, notFound, str } from "../lib/http.mts";

function sentences(txt: string) {
  const s = txt.replace(/\b(г|в|др|пр|Хр|напр|т\.е|т\.нар|ок)\./gi, "$1").replace(/…/g, ".");
  return s.split(/[.!?]+(?:[\s"“”»]|$)/).map((x) => x.trim()).filter((x) => /[А-Яа-яA-Za-z]/.test(x)).length;
}

// Loads one item the child is allowed to use, together with its module.
async function itemFor(childId: number, parentId: number, grade: number, itemId: number, kinds: string[]) {
  const row = await one<any>("SELECT i.id, i.module_slug, i.data FROM items i WHERE i.id = $1", [itemId]);
  if (!row) throw notFound();
  const m = await one<ModuleRow>("SELECT * FROM modules WHERE slug = $1 AND active", [row.module_slug]);
  if (!m || Number(m.grade) !== grade || !kinds.includes(m.kind)) throw forbidden();
  const { open } = await accessibleItems(m, parentId, grade);
  if (!open.some((i) => Number(i.id) === Number(itemId))) throw forbidden("Този материал е в пълния достъп.");
  return { item: row.data, module: m };
}

export default handle(async (req) => {
  if (req.method !== "POST") throw notFound();
  const child = await requireChild(req);
  const b = await body(req, 40_000);
  const mode = str(b.mode, 20);
  const itemId = Number(b.itemId);
  if (!Number.isFinite(itemId)) throw bad("item", "Липсва задача.");
  const S = safety(child.grade);

  if (mode === "interview") {
    const { item: c } = await itemFor(child.id, child.parent_id, child.grade, itemId, ["chars"]);
    const raw = Array.isArray(b.messages) ? b.messages.slice(-12) : [];
    const messages = raw
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 600) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") throw bad("messages", "Задай въпрос.");
    if (messages[0].role !== "user") messages.shift();
    await spend(child.id, child.parent_id, child.grade);
    const system = `${S}

Ти си ${c.name} от „${c.work}“ на ${c.author} (${c.genre}). Отговаряш в първо лице, като този герой.
Как говориш: ${c.voice}
Отговорите ти са 2–4 изречения. Не пиши списъци и заглавия.
Факти, които знаеш (говори само от тях):
- ${(c.facts || []).join("\n- ")}
Ограничения: ${c.limits || "няма"}
Мисията на ученика е: „${c.mission}“. Не я решавай вместо него с първия отговор – отговаряй на това, което пита. Ако се отклонява, подхвърли нещо, което го насочва към мисията.
Ако ученикът сбърка факт за творбата, поправи го меко, в ролята си.
Вече си поздравил ученика с: „${c.greet}“`;
    const text = await chat(system, messages, 500);
    return json({ text });
  }

  if (mode === "mission") {
    const { item: c } = await itemFor(child.id, child.parent_id, child.grade, itemId, ["chars"]);
    const v = str(b.text, 800);
    if (!v) throw bad("text", "Напиши какво разбра.");
    await spend(child.id, child.parent_id, child.grade);
    const r = await jsonCall<{ ok: boolean; feedback: string }>(
      `${S}\n\nТи си учител по литература и проверяваш дали ученикът е изпълнил мисия след разговор с литературен герой.`,
      `Героят е ${c.name} от „${c.work}“. Мисията беше: „${c.mission}“.
Очакван отговор (същност): ${c.key}
Ученикът написа: """${v}"""
Прецени дали ученикът е схванал същността (не изисквай дословност). "feedback" е винаги 1–2 изречения към ученика (никога празен): какво е уловил добре и, ако липсва нещо, кое (без да го наказваш).`,
      {
        type: "object",
        properties: { ok: { type: "boolean" }, feedback: { type: "string" } },
        required: ["ok", "feedback"],
        additionalProperties: false,
      },
    );
    // The fast model sometimes leaves the feedback empty; the child should always get a sentence.
    const feedback = String(r.feedback || "").trim() || (r.ok ? "Точно така – разбрал си същността." : "Почти – сравни с отговора отдолу.");
    return json({ ok: !!r.ok, feedback, key: c.key });
  }

  if (mode === "pesho") {
    const { item: p } = await itemFor(child.id, child.parent_id, child.grade, itemId, ["pesho"]);
    const v = str(b.text, 800);
    if (!v) throw bad("text", "Обясни на Пешо.");
    await spend(child.id, child.parent_id, child.grade);
    const r = await jsonCall<{ verdict: string; pesho: string }>(
      `${S}\n\nУченикът играе ролята на учител: обяснява на съученика си Пешо (момче от ${child.grade}. клас, пропуснал часовете), който е казал нещо грешно.`,
      `Творбата: „${p.work}“
Пешо каза: „${p.says}“
Вярното е: ${p.truth}
Ученикът обясни: """${v}"""
Прецени обяснението:
- "correct": ученикът поправя грешката и казва вярното (ключовия факт). Кратък отговор е достатъчен – не изисквай определения и подробности.
- "partial": казва, че е грешно, но не казва кое е вярното, или го казва неточно.
- "wrong": потвърждава грешката или казва друго невярно.
"pesho" е отговорът на Пешо, 1–2 изречения, разговорно и мило: при correct – благодари и повтаря вярното със свои думи; при partial – пита за липсващото; при wrong – казва, че още не е сигурен.`,
      {
        type: "object",
        properties: { verdict: { type: "string", enum: ["correct", "partial", "wrong"] }, pesho: { type: "string" } },
        required: ["verdict", "pesho"],
        additionalProperties: false,
      },
    );
    return json({ verdict: r.verdict, pesho: String(r.pesho || ""), truth: p.truth });
  }

  if (mode === "coach") {
    const { item: t } = await itemFor(child.id, child.parent_id, child.grade, itemId, ["t25"]);
    const v = str(b.text, 1500);
    if (!v) throw bad("text", "Напиши своя текст.");
    const round = Math.max(1, Math.min(20, Number(b.round) || 1));
    await spend(child.id, child.parent_id, child.grade);
    const r = await jsonCall<any>(
      `${S}\n\nТи си коуч по литература за задачата с разширен свободен отговор от НВО (текст от 3–4 изречения за внушението на цитат или образ). Методът ти е Сократов: НЕ пишеш отговора вместо ученика и НЕ преписваш изреченията му. Задаваш въпроси, които го насочват сам да подобри текста. Никога не показваш и не цитираш примерния отговор.`,
      `Задача: ${t.task}${t.q ? "\nЦитат: " + t.q : ""}
Ключови идеи, които добрият отговор съдържа: ${(t.keys || []).join("; ")}
Примерен отговор (само за твоя ориентация): ${t.model}
Текстът на ученика (опит ${round}): """${v}"""
Брой изречения според нас: ${sentences(v)}.
Оцени текста: "level" е "силен", "почти" или "начало"; "good" е 1 изречение какво конкретно е направил добре; "questions" са 1 или 2 кратки насочващи въпроса към това, което липсва (празен списък при "силен"); "language" е една конкретна забележка за правопис, пунктуация или брой изречения, или празен низ.`,
      {
        type: "object",
        properties: {
          level: { type: "string", enum: ["силен", "почти", "начало"] },
          good: { type: "string" },
          questions: { type: "array", items: { type: "string" } },
          language: { type: "string" },
        },
        required: ["level", "good", "questions", "language"],
        additionalProperties: false,
      },
      true,
    );
    return json({
      level: r.level,
      good: String(r.good || ""),
      questions: (Array.isArray(r.questions) ? r.questions : []).filter(Boolean).slice(0, 2).map(String),
      language: String(r.language || ""),
    });
  }

  throw bad("mode", "Непознат режим.");
});

export const config: Config = { path: "/api/ai" };
