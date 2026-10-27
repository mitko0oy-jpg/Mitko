// Course structure: finds the resources of every unit (a work or a language topic)
// among the items of the grade's modules.
import { freeLimit, gradeModules, hasFullAccess, visibleStatuses, type ModuleRow } from "./access.mts";
import { q } from "./db.mts";

export type Unit = {
  slug: string;
  grade: number;
  section: "literature" | "language";
  grp: string;
  title: string;
  subtitle: string;
  position: number;
  match: { works?: string[]; topics?: string[] };
  planned: string[];
  info: any;
};

// Compare titles without quotes, dashes and case: „Под игото“ – „Представлението“ == Под игото - Представлението
export const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[„“”"«»'’]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Lessons and reading texts name their unit directly.
const PER_UNIT = ["lesson", "reading"];

// Which works/topics an item belongs to, by module kind.
function tagsOf(kind: string, data: any): string[] {
  if (kind === "cards") return data.ws || [];
  if (kind === "t25") return [data.w];
  if (kind === "chars" || kind === "pesho") return [data.work];
  return [];
}

export async function gradeUnits(grade: number): Promise<Unit[]> {
  return q<Unit>("SELECT * FROM units WHERE grade = $1 AND active ORDER BY section, position, slug", [grade]);
}

type Res = { module: string; kind: string; title: string; total: number; open: number; done: number; ok: number; items: { id: number; open: boolean; label: string }[] };

// Resources per unit. With childId/parentId, counts what the child may open and has done.
export async function unitResources(grade: number, child?: { id: number; parent_id: number }) {
  const units = await gradeUnits(grade);
  const mods = (await gradeModules(grade)).filter((m) => ["cards", "t25", "chars", "pesho", ...PER_UNIT].includes(m.kind));
  const full = child ? await hasFullAccess(child.parent_id, grade) : false;
  const items = await q<{ id: number; module_slug: string; data: any }>(
    `SELECT i.id, i.module_slug, i.data FROM items i JOIN modules m ON m.slug = i.module_slug
      WHERE m.grade = $1 AND m.active AND i.status = ANY($2) ORDER BY i.module_slug, i.position, i.id`,
    [grade, visibleStatuses()],
  );
  const done = new Map<number, boolean>();
  if (child) {
    for (const p of await q<{ item_id: number; last_ok: boolean }>("SELECT item_id, last_ok FROM progress WHERE child_id = $1", [child.id])) {
      done.set(Number(p.item_id), !!p.last_ok);
    }
  }
  // Which items of each module are open for this child.
  const openIds = new Set<number>();
  for (const m of mods) {
    const its = items.filter((i) => i.module_slug === m.slug);
    const limit = full ? its.length : freeLimit(m as ModuleRow, its.length);
    its.slice(0, limit).forEach((i) => openIds.add(Number(i.id)));
  }
  const byUnit = new Map<string, Res[]>();
  for (const u of units) {
    const want = new Set([...(u.match.works || []), ...(u.match.topics || [])].map(norm));
    const res: Res[] = [];
    for (const m of mods) {
      const its = items.filter(
        (i) => i.module_slug === m.slug && (PER_UNIT.includes(m.kind) ? i.data.unit === u.slug : tagsOf(m.kind, i.data).some((t) => want.has(norm(t)))),
      );
      if (!its.length) continue;
      const r: Res = { module: m.slug, kind: m.kind, title: m.title, total: its.length, open: 0, done: 0, ok: 0, items: [] };
      for (const i of its) {
        const id = Number(i.id);
        const isOpen = openIds.has(id) || !child;
        if (isOpen) r.open++;
        if (done.has(id)) {
          r.done++;
          if (done.get(id)) r.ok++;
        }
        const label = m.kind === "chars" ? i.data.name : m.kind === "t25" ? (i.data.q ? "цитат" : "образ") : m.kind === "pesho" ? i.data.says : "";
        r.items.push({ id, open: openIds.has(id), label });
      }
      res.push(r);
    }
    byUnit.set(u.slug, res);
  }
  return { units, byUnit, full };
}
