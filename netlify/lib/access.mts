import { one, q } from "./db.mts";
import { env } from "./http.mts";

// In the public test phase items still waiting for the teacher are shown too (with a banner).
export const testMode = () => env("TEST_MODE") === "1";
export const visibleStatuses = () => (testMode() ? ["approved", "review"] : ["approved"]);

export async function activeEntitlements(parentId: number) {
  return q<{ product: string; ends_at: string; source: string }>(
    "SELECT product, ends_at, source FROM entitlements WHERE user_id = $1 AND starts_at <= now() AND ends_at > now() ORDER BY ends_at DESC",
    [parentId],
  );
}

export async function hasFullAccess(parentId: number, grade: number): Promise<boolean> {
  const row = await one(
    "SELECT 1 FROM entitlements WHERE user_id = $1 AND product IN ('bel-all', $2) AND starts_at <= now() AND ends_at > now() LIMIT 1",
    [parentId, `bel${grade}`],
  );
  return !!row;
}

export type ModuleRow = {
  slug: string;
  grade: number;
  kind: string;
  title: string;
  subtitle: string;
  position: number;
  free_ratio: number;
  free_count: number | null;
  meta: any;
};

export function freeLimit(m: ModuleRow, total: number): number {
  if (total === 0) return 0;
  if (m.free_count !== null && m.free_count !== undefined) return Math.min(Number(m.free_count), total);
  return Math.min(total, Math.max(1, Math.ceil(total * Number(m.free_ratio))));
}

// Visible items of a module in order, with how many of them the child may open.
export async function moduleItems(slug: string) {
  return q<{ id: number; ext_id: string; position: number; data: any; status: string }>(
    "SELECT id, ext_id, position, data, status FROM items WHERE module_slug = $1 AND status = ANY($2) ORDER BY position, id",
    [slug, visibleStatuses()],
  );
}

export async function gradeModules(grade: number) {
  return q<ModuleRow>("SELECT * FROM modules WHERE grade = $1 AND active ORDER BY position, slug", [grade]);
}

// Summary of every module of a grade for one child: totals, free limit, progress.
export async function moduleSummaries(childId: number, grade: number, full: boolean) {
  const mods = await gradeModules(grade);
  const items = await q<{ id: number; module_slug: string }>(
    `SELECT i.id, i.module_slug FROM items i JOIN modules m ON m.slug = i.module_slug
      WHERE m.grade = $1 AND m.active AND i.status = ANY($2) ORDER BY i.module_slug, i.position, i.id`,
    [grade, visibleStatuses()],
  );
  const prog = await q<{ item_id: number; last_ok: boolean | null; correct: number; attempts: number; due_at: string | null }>(
    "SELECT item_id, last_ok, correct, attempts, due_at FROM progress WHERE child_id = $1",
    [childId],
  );
  const pmap = new Map(prog.map((p) => [Number(p.item_id), p]));
  const byMod = new Map<string, number[]>();
  for (const it of items) {
    if (!byMod.has(it.module_slug)) byMod.set(it.module_slug, []);
    byMod.get(it.module_slug)!.push(Number(it.id));
  }
  const now = Date.now();
  return mods.map((m) => {
    const ids = byMod.get(m.slug) || [];
    const total = ids.length;
    const free = freeLimit(m, total);
    const accessible = full ? total : free;
    const open = ids.slice(0, accessible);
    let done = 0, ok = 0, due = 0;
    for (const id of open) {
      const p = pmap.get(id);
      if (!p) continue;
      done++;
      if (p.last_ok) ok++;
      if (p.due_at && new Date(p.due_at).getTime() <= now) due++;
    }
    return {
      slug: m.slug,
      kind: m.kind,
      title: m.title,
      subtitle: m.subtitle,
      total,
      free,
      accessible,
      locked: total - accessible,
      done,
      ok,
      due,
      freeFinished: !full && total > accessible && done >= accessible,
    };
  });
}

// Leitner intervals in days for boxes 0..5.
const INTERVALS = [0, 1, 3, 7, 16, 35];
export function nextBox(box: number, ok: boolean) {
  const b = ok ? Math.min(box + 1, 5) : 0;
  return { box: b, days: ok ? INTERVALS[b] : 0 };
}

// Items the child may open right now (the free part, or everything with a pass).
export async function accessibleItems(m: ModuleRow, parentId: number, grade: number) {
  const items = await moduleItems(m.slug);
  const full = await hasFullAccess(parentId, grade);
  const limit = full ? items.length : freeLimit(m, items.length);
  return { items, open: items.slice(0, limit), full, limit };
}
