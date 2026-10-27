import type { Config } from "@netlify/functions";
import { accessibleItems, hasFullAccess, moduleSummaries, nextBox, testMode, type ModuleRow } from "../lib/access.mts";
import { requireChild } from "../lib/auth.mts";
import { event, hit, one, q, tx } from "../lib/db.mts";
import { scoreRetelling, scoreSection } from "../lib/exam.mts";
import { bad, body, forbidden, handle, HttpError, json, notFound, str, sub, tooMany } from "../lib/http.mts";
import { spend } from "../lib/usage.mts";
import { unitResources } from "../lib/units.mts";

// Fields the browser never needs: the AI uses them on the server.
function clientData(kind: string, data: any) {
  if (kind === "chars") {
    const { facts, voice, limits, key, ...rest } = data;
    return rest;
  }
  // The answer key of an exam section is only sent back after the child hands it in.
  if (kind === "exam") {
    const { key, editing, ...rest } = data;
    return rest;
  }
  return data;
}

async function loadModule(slug: string, grade: number): Promise<ModuleRow> {
  const m = await one<ModuleRow>("SELECT * FROM modules WHERE slug = $1 AND active", [slug]);
  if (!m) throw notFound("Няма такъв модул.");
  if (Number(m.grade) !== grade) throw forbidden("Този модул е за друг клас.");
  return m;
}

export default handle(async (req) => {
  const child = await requireChild(req);
  const parts = sub(req, "/api/learn/");

  if (req.method === "GET" && parts[0] === "home") {
    const full = await hasFullAccess(child.parent_id, child.grade);
    const modules = await moduleSummaries(child.id, child.grade, full);
    return json({
      child: { name: child.display_name, grade: child.grade },
      full,
      modules,
      due: modules.filter((m) => m.kind === "cards").reduce((s, m) => s + m.due, 0),
      testMode: testMode(),
    });
  }

  if (req.method === "GET" && parts[0] === "module" && parts[1]) {
    const m = await loadModule(parts[1], child.grade);
    const { items, open, full } = await accessibleItems(m, child.parent_id, child.grade);
    const ids = open.map((i) => Number(i.id));
    const prog = ids.length
      ? await q("SELECT item_id, attempts, correct, last_ok, score, answer, box, due_at FROM progress WHERE child_id = $1 AND item_id = ANY($2)", [child.id, ids])
      : [];
    const unlock = await one("SELECT 1 FROM unlock_requests WHERE child_id = $1 AND module_slug = $2", [child.id, m.slug]);
    // Show what the pass would open (per card level), without sending the locked content itself.
    const lockedLevels: Record<number, number> = {};
    if (m.kind === "cards") for (const i of items.slice(open.length)) lockedLevels[i.data.l] = (lockedLevels[i.data.l] || 0) + 1;
    const lockedTitles = m.kind === "exam" ? items.slice(open.length).map((i) => i.data.title) : [];
    return json({
      module: { slug: m.slug, kind: m.kind, title: m.title, subtitle: m.subtitle, meta: m.meta },
      full,
      total: items.length,
      locked: items.length - open.length,
      lockedLevels,
      lockedTitles,
      items: open.map((i) => ({ id: Number(i.id), ext: i.ext_id, status: i.status, data: clientData(m.kind, i.data) })),
      progress: Object.fromEntries(prog.map((p: any) => [p.item_id, p])),
      unlockRequested: !!unlock,
      testMode: testMode(),
    });
  }

  // The course structure of the child's grade: sections → units → resources.
  if (req.method === "GET" && parts[0] === "units") {
    const { units, byUnit, full } = await unitResources(child.grade, child);
    return json({
      grade: child.grade,
      full,
      units: units.map((u) => ({
        slug: u.slug,
        section: u.section,
        grp: u.grp,
        title: u.title,
        subtitle: u.subtitle,
        planned: u.planned,
        resources: (byUnit.get(u.slug) || []).map(({ items, ...r }) => r),
      })),
      testMode: testMode(),
    });
  }

  if (req.method === "GET" && parts[0] === "unit" && parts[1]) {
    const { units, byUnit, full } = await unitResources(child.grade, child);
    const u = units.find((x) => x.slug === parts[1]);
    if (!u) throw notFound("Няма такава тема.");
    return json({ unit: { ...u, match: undefined }, full, resources: byUnit.get(u.slug) || [], testMode: testMode() });
  }

  // Cards that are due again today across all card modules of the grade.
  if (req.method === "GET" && parts[0] === "review") {
    const mods = await q<ModuleRow>("SELECT * FROM modules WHERE grade = $1 AND active AND kind = 'cards'", [child.grade]);
    const due: any[] = [];
    for (const m of mods) {
      const { open } = await accessibleItems(m, child.parent_id, child.grade);
      const ids = open.map((i) => Number(i.id));
      if (!ids.length) continue;
      const rows = await q<{ item_id: number }>(
        "SELECT item_id FROM progress WHERE child_id = $1 AND item_id = ANY($2) AND due_at <= now() ORDER BY box, due_at LIMIT 20",
        [child.id, ids],
      );
      const dueIds = new Set(rows.map((r) => Number(r.item_id)));
      for (const i of open) if (dueIds.has(Number(i.id))) due.push({ id: Number(i.id), module: m.slug, data: i.data });
    }
    return json({ items: due.slice(0, 20) });
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req, 200_000);

  if (parts[0] === "progress") {
    if (!(await hit(`prog:${child.id}`, 120, 60))) throw tooMany();
    const m = await loadModule(str(b.module, 80), child.grade);
    if (m.kind === "exam") throw bad("module", "Изпитът се предава през /api/learn/exam.");
    const { open, items, full } = await accessibleItems(m, child.parent_id, child.grade);
    const allowed = new Set(open.map((i) => Number(i.id)));
    const results = Array.isArray(b.results) ? b.results.slice(0, 100) : [];
    if (!results.length) throw bad("results", "Няма резултати.");
    await tx(async (t) => {
      for (const r of results) {
        const itemId = Number(r.itemId);
        if (!allowed.has(itemId)) throw forbidden("Този материал е в пълния достъп.");
        const ok = !!r.ok;
        const score = Number.isFinite(r.score) ? Math.max(0, Math.min(100, Math.round(r.score))) : null;
        const answer = typeof r.answer === "string" ? r.answer.slice(0, 2000) : null;
        const [prev] = await t<{ box: number }>("SELECT box FROM progress WHERE child_id = $1 AND item_id = $2", [child.id, itemId]);
        const nb = nextBox(prev ? Number(prev.box) : 0, ok);
        await t(
          `INSERT INTO progress (child_id, item_id, attempts, correct, last_ok, score, answer, box, due_at, last_at)
           VALUES ($1, $2, 1, $3, $4, $5, $6, $7, now() + make_interval(days => $8), now())
           ON CONFLICT (child_id, item_id) DO UPDATE SET
             attempts = progress.attempts + 1,
             correct = progress.correct + $3,
             last_ok = $4,
             score = COALESCE($5, progress.score),
             answer = COALESCE($6, progress.answer),
             box = $7,
             due_at = now() + make_interval(days => $8),
             last_at = now()`,
          [child.id, itemId, ok ? 1 : 0, ok, score, answer, nb.box, nb.days],
        );
      }
    });
    const done = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM progress WHERE child_id = $1 AND item_id = ANY($2)",
      [child.id, [...allowed]],
    );
    const freeFinished = !full && items.length > open.length && (done?.n || 0) >= open.length;
    if (freeFinished) await event("free_finished", { module: m.slug }, null, child.id);
    return json({ ok: true, done: done?.n || 0, accessible: open.length, total: items.length, freeFinished });
  }

  // Hand in one section of a mock exam: scored on the server, the result (with the key) is stored.
  if (parts[0] === "exam") {
    if (!(await hit(`exam:${child.id}`, 30, 3600))) throw tooMany();
    const m = await loadModule(str(b.module, 80), child.grade);
    if (m.kind !== "exam") throw bad("module", "Това не е изпит.");
    const { open } = await accessibleItems(m, child.parent_id, child.grade);
    const item = open.find((i) => Number(i.id) === Number(b.itemId));
    if (!item) throw forbidden("Тази част е в пълния достъп.");
    const data = item.data;
    const answers: Record<string, string> = b.answers && typeof b.answers === "object" ? b.answers : {};
    let result: any;
    if (data.kind === "retelling") {
      const variant = Number(b.variant) === 1 ? 1 : 0;
      const text = String(answers.text || "").trim().slice(0, 8000);
      if (text.length < 300) throw bad("short", "Преразказът е твърде кратък. Напиши поне няколко абзаца.");
      await spend(child.id, child.parent_id, child.grade);
      let r;
      try {
        r = await scoreRetelling(child.grade, data, variant, text);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(502, "ai_error", "Проверката не успя. Текстът ти е запазен – опитай пак.");
      }
      const k = data.key.variants[variant];
      result = { kind: "retelling", variant, yours: text, ...r, model: k.model_retelling, plan: k.plan };
    } else {
      const needsAi = data.tasks.some((t: any) => !t.options && t.n !== 17 && String(answers[t.n] ?? "").trim());
      if (needsAi) await spend(child.id, child.parent_id, child.grade);
      const results = await scoreSection(child.grade, data, answers);
      result = {
        kind: "section",
        results,
        points: results.reduce((s, r) => s + (r.points ?? 0), 0),
        max: results.reduce((s, r) => s + r.max, 0),
        unscored: results.filter((r) => r.points === null).length,
      };
    }
    const percent = Math.round((result.points / result.max) * 100);
    const ok = percent >= 50;
    const [prev] = await q<{ box: number }>("SELECT box FROM progress WHERE child_id = $1 AND item_id = $2", [child.id, item.id]);
    await q(
      `INSERT INTO progress (child_id, item_id, attempts, correct, last_ok, score, answer, box, last_at)
       VALUES ($1, $2, 1, $3, $4, $5, $6, $7, now())
       ON CONFLICT (child_id, item_id) DO UPDATE SET attempts = progress.attempts + 1, correct = progress.correct + $3,
         last_ok = $4, score = $5, answer = $6, last_at = now()`,
      [child.id, item.id, ok ? 1 : 0, ok, percent, JSON.stringify(result), prev ? Number(prev.box) : 0],
    );
    await event("exam_section", { module: m.slug, section: item.ext_id, percent }, null, child.id);
    return json({ ok: true, percent, result });
  }

  // The child reached the end of the free part and asks a parent to unlock the rest.
  if (parts[0] === "unlock") {
    const m = await loadModule(str(b.module, 80), child.grade);
    await q("INSERT INTO unlock_requests (child_id, module_slug) VALUES ($1, $2) ON CONFLICT (child_id, module_slug) DO UPDATE SET created_at = now(), seen_at = NULL", [
      child.id,
      m.slug,
    ]);
    await event("unlock_requested", { module: m.slug }, null, child.id);
    return json({ ok: true });
  }

  throw notFound();
});

export const config: Config = { path: "/api/learn/*" };
