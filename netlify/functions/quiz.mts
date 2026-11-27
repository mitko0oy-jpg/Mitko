import type { Config } from "@netlify/functions";
import { freeLimit, testMode, type ModuleRow } from "../lib/access.mts";
import { requireChild } from "../lib/auth.mts";
import { event, hit, one, q } from "../lib/db.mts";
import { bad, body, forbidden, handle, json, notFound, str, sub, tooMany } from "../lib/http.mts";
import { levelPoints, partItems, QUIZ_SUBJECTS, quizAccess, quizSummary } from "../lib/quiz.mts";

// The child's side of „200 задачи“: /api/quiz/<subject>/home, /part/<slug>, POST answer and unlock.
async function loadPart(subject: string, slug: string): Promise<ModuleRow> {
  const m = await one<ModuleRow>("SELECT * FROM modules WHERE slug = $1 AND subject = $2 AND kind = 'quiz' AND active", [slug, subject]);
  if (!m) throw notFound("Няма такава част.");
  return m;
}

export default handle(async (req) => {
  const child = await requireChild(req);
  const [subject, action, slug] = sub(req, "/api/quiz/");
  if (!QUIZ_SUBJECTS[subject]) throw notFound();
  const full = await quizAccess(subject, child.parent_id);

  if (req.method === "GET" && action === "home") {
    const summary = await quizSummary(subject, child.id, full);
    const asked = await q<{ module_slug: string }>(
      "SELECT u.module_slug FROM unlock_requests u JOIN modules m ON m.slug = u.module_slug WHERE u.child_id = $1 AND m.subject = $2",
      [child.id, subject],
    );
    return json({
      title: QUIZ_SUBJECTS[subject].title,
      child: { name: child.display_name, grade: child.grade },
      full,
      ...summary,
      unlockRequested: asked.length > 0,
      testMode: testMode(),
    });
  }

  if (req.method === "GET" && action === "part" && slug) {
    const m = await loadPart(subject, slug);
    const items = await partItems(m.slug);
    const limit = full ? items.length : freeLimit(m, items.length);
    const open = items.slice(0, limit);
    const ids = open.map((i) => Number(i.id));
    const prog = ids.length
      ? await q("SELECT item_id, attempts, last_ok, score FROM progress WHERE child_id = $1 AND item_id = ANY($2)", [child.id, ids])
      : [];
    // What the full access would open, by level, without sending the locked tasks themselves.
    const lockedLevels = [0, 0, 0];
    for (const i of items.slice(limit)) lockedLevels[Math.min(2, Math.max(0, Number(i.data.lv) || 0))]++;
    const unlock = await one("SELECT 1 FROM unlock_requests WHERE child_id = $1 AND module_slug = $2", [child.id, m.slug]);
    return json({
      part: { slug: m.slug, grade: Number(m.grade), title: m.title, subtitle: m.subtitle, meta: m.meta },
      full,
      total: items.length,
      locked: items.length - open.length,
      lockedLevels,
      max: items.reduce((s, i) => s + levelPoints(i.data.lv), 0),
      items: open.map((i) => ({ id: Number(i.id), ext: i.ext_id, status: i.status, data: i.data })),
      progress: Object.fromEntries(prog.map((p: any) => [p.item_id, { attempts: p.attempts, lastOk: p.last_ok, score: p.score }])),
      unlockRequested: !!unlock,
      testMode: testMode(),
    });
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  // One answer. The choice is the index of the option in the stored order (0 is the right one);
  // the points are decided here, only at the first attempt, and never change afterwards.
  if (action === "answer") {
    if (!(await hit(`quiz:${child.id}`, 120, 60))) throw tooMany();
    const m = await loadPart(subject, str(b.part, 80));
    const items = await partItems(m.slug);
    const limit = full ? items.length : freeLimit(m, items.length);
    const k = items.findIndex((i) => Number(i.id) === Number(b.itemId));
    if (k < 0) throw notFound("Няма такава задача.");
    if (k >= limit) throw forbidden("Тази задача е в пълния достъп.");
    const item = items[k];
    const choice = Number(b.choice);
    const options = Array.isArray(item.data.o) ? item.data.o.length : 0;
    if (!Number.isInteger(choice) || choice < 0 || choice >= options) throw bad("choice", "Избери един от отговорите.");
    const ok = choice === 0;
    const pts = levelPoints(item.data.lv);
    const row = await one<{ attempts: number; score: number }>(
      `INSERT INTO progress (child_id, item_id, attempts, correct, last_ok, score, box, last_at)
       VALUES ($1, $2, 1, $3, $4, $5, 0, now())
       ON CONFLICT (child_id, item_id) DO UPDATE SET attempts = progress.attempts + 1, correct = progress.correct + $3,
         last_ok = $4, last_at = now()
       RETURNING attempts, score`,
      [child.id, item.id, ok ? 1 : 0, ok, ok ? pts : 0],
    );
    const first = Number(row?.attempts) === 1;
    const answered = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM progress WHERE child_id = $1 AND item_id = ANY($2)",
      [child.id, items.slice(0, limit).map((i) => Number(i.id))],
    );
    const freeFinished = !full && items.length > limit && (answered?.n || 0) >= limit;
    if (first) await event("quiz_answer", { part: m.slug, lv: Number(item.data.lv) || 0, ok }, null, child.id);
    if (freeFinished && first) await event("free_finished", { module: m.slug }, null, child.id);
    return json({ ok, first, points: first && ok ? pts : 0, score: Number(row?.score || 0), freeFinished });
  }

  // The child reached the end of the free part and asks a parent: the offer goes to the parent only.
  if (action === "unlock") {
    const m = await loadPart(subject, str(b.part, 80));
    await q(
      "INSERT INTO unlock_requests (child_id, module_slug) VALUES ($1, $2) ON CONFLICT (child_id, module_slug) DO UPDATE SET created_at = now(), seen_at = NULL",
      [child.id, m.slug],
    );
    await event("unlock_requested", { module: m.slug }, null, child.id);
    return json({ ok: true });
  }

  throw notFound();
});

export const config: Config = { path: "/api/quiz/*" };
