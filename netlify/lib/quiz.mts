// „200 задачи“: a quiz in parts with three levels (Знам 1 т., Разбирам 2 т., Мисля 3 т.).
// Points count only for a right answer at the first attempt; later attempts are practice.
// Parts are not tied to the child's grade: a 7th-grader may revise the 5th-grade parts too.
import { freeLimit, hasProduct, MATH_PRODUCTS, visibleStatuses, type ModuleRow } from "./access.mts";
import { q } from "./db.mts";

export const QUIZ_SUBJECTS: Record<string, { title: string; products: string[] }> = {
  mat: { title: "200 задачи по математика", products: MATH_PRODUCTS },
};

// Points of one task by its level (0, 1, 2).
export const levelPoints = (lv: unknown) => Math.min(3, Math.max(1, (Number(lv) || 0) + 1));

export async function quizModules(subject: string) {
  return q<ModuleRow>("SELECT * FROM modules WHERE subject = $1 AND kind = 'quiz' AND active ORDER BY position, grade, slug", [subject]);
}

export async function quizAccess(subject: string, parentId: number) {
  const s = QUIZ_SUBJECTS[subject];
  return !!s && (await hasProduct(parentId, s.products));
}

type Item = { id: number; ext_id: string; position: number; data: any; status: string };

export async function partItems(slug: string) {
  return q<Item>(
    "SELECT id, ext_id, position, data, status FROM items WHERE module_slug = $1 AND status = ANY($2) ORDER BY position, id",
    [slug, visibleStatuses()],
  );
}

// Every part of a subject with totals, the open part and the child's points.
export async function quizSummary(subject: string, childId: number, full: boolean) {
  const mods = await quizModules(subject);
  const slugs = mods.map((m) => m.slug);
  const items = slugs.length
    ? await q<{ id: number; module_slug: string; lv: number }>(
        `SELECT id, module_slug, COALESCE((data->>'lv')::int, 0) AS lv FROM items
          WHERE module_slug = ANY($1) AND status = ANY($2) ORDER BY module_slug, position, id`,
        [slugs, visibleStatuses()],
      )
    : [];
  const ids = items.map((i) => Number(i.id));
  const prog = ids.length
    ? await q<{ item_id: number; score: number | null; last_ok: boolean | null }>(
        "SELECT item_id, score, last_ok FROM progress WHERE child_id = $1 AND item_id = ANY($2)",
        [childId, ids],
      )
    : [];
  const pmap = new Map(prog.map((p) => [Number(p.item_id), p]));
  const parts = mods.map((m) => {
    const its = items.filter((i) => i.module_slug === m.slug);
    const total = its.length;
    const accessible = full ? total : freeLimit(m, total);
    let answered = 0, points = 0, wrong = 0, firstOk = 0;
    its.forEach((it, k) => {
      const p = pmap.get(Number(it.id));
      if (!p || k >= accessible) return;
      answered++;
      points += Number(p.score || 0);
      if (Number(p.score || 0) > 0) firstOk++;
      if (p.last_ok === false) wrong++;
    });
    const levels = [0, 1, 2].map((lv) => its.filter((i) => Number(i.lv) === lv).length);
    return {
      slug: m.slug,
      grade: Number(m.grade),
      title: m.title,
      subtitle: m.subtitle,
      total,
      accessible,
      locked: total - accessible,
      answered,
      firstOk,
      points,
      max: its.reduce((s, i) => s + levelPoints(i.lv), 0),
      wrong,
      levels,
      freeFinished: !full && total > accessible && answered >= accessible,
    };
  });
  return {
    parts,
    points: parts.reduce((s, p) => s + p.points, 0),
    max: parts.reduce((s, p) => s + p.max, 0),
    answered: parts.reduce((s, p) => s + p.answered, 0),
    total: parts.reduce((s, p) => s + p.total, 0),
  };
}
