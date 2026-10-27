import type { Config } from "@netlify/functions";
import { activeEntitlements, hasFullAccess, moduleSummaries, testMode } from "../lib/access.mts";
import { hashPassword, normalizeUsername, requireUser, validUsername } from "../lib/auth.mts";
import { redeemCode } from "../lib/codes.mts";
import { event, hit, one, q } from "../lib/db.mts";
import { bad, body, forbidden, handle, json, notFound, str, sub, tooMany } from "../lib/http.mts";

const GRADES = [5, 6, 7];
const MAX_CHILDREN = 6;

// Per literary work: how many card answers were right or wrong.
async function workStats(childId: number) {
  const rows = await q<{ ws: string[]; last_ok: boolean }>(
    `SELECT i.data->'ws' AS ws, p.last_ok FROM progress p
       JOIN items i ON i.id = p.item_id JOIN modules m ON m.slug = i.module_slug
      WHERE p.child_id = $1 AND m.kind IN ('cards', 'diagnostic')`,
    [childId],
  );
  const per: Record<string, { ok: number; bad: number }> = {};
  for (const r of rows) {
    for (const w of r.ws || []) {
      per[w] = per[w] || { ok: 0, bad: 0 };
      if (r.last_ok) per[w].ok++;
      else per[w].bad++;
    }
  }
  const list = Object.entries(per).map(([work, s]) => ({ work, ...s, rate: s.ok / (s.ok + s.bad) }));
  return {
    weak: list.filter((w) => w.bad > 0).sort((a, b) => a.rate - b.rate || b.bad - a.bad).slice(0, 6),
    strong: list.filter((w) => w.bad === 0 && w.ok > 0).map((w) => w.work),
  };
}

async function childOverview(c: any, full: boolean) {
  const modules = await moduleSummaries(Number(c.id), Number(c.grade), full);
  const works = await workStats(Number(c.id));
  const diag = modules.find((m) => m.kind === "diagnostic");
  const unlock = await q<{ module_slug: string; created_at: string; seen_at: string | null }>(
    "SELECT module_slug, created_at, seen_at FROM unlock_requests WHERE child_id = $1 ORDER BY created_at DESC",
    [c.id],
  );
  const exam = await q<{ title: string; points: number; max: number }>(
    `SELECT i.data->>'title' AS title, (p.answer::json->>'points')::float AS points, (p.answer::json->>'max')::float AS max
       FROM progress p JOIN items i ON i.id = p.item_id JOIN modules m ON m.slug = i.module_slug
      WHERE p.child_id = $1 AND m.kind = 'exam' AND p.answer IS NOT NULL ORDER BY i.position`,
    [c.id],
  );
  const examMod = modules.find((m) => m.kind === "exam");
  const last = await one<{ at: string }>("SELECT max(last_at) AS at FROM progress WHERE child_id = $1", [c.id]);
  const week = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM progress WHERE child_id = $1 AND last_at > now() - interval '7 days'",
    [c.id],
  );
  return {
    id: Number(c.id),
    name: c.display_name,
    username: c.username,
    grade: Number(c.grade),
    full,
    modules,
    weak: works.weak,
    strong: works.strong,
    diagnostic: diag && diag.done ? { done: diag.done, ok: diag.ok, total: diag.total } : null,
    exam: exam.length ? { sections: exam, done: exam.length, total: examMod?.total || exam.length } : null,
    unlockRequests: unlock.map((u) => ({ module: u.module_slug, at: u.created_at, seen: !!u.seen_at })),
    lastActive: last?.at || null,
    weekItems: week?.n || 0,
  };
}

export default handle(async (req) => {
  const user = await requireUser(req, ["parent", "reviewer", "admin"]);
  const parts = sub(req, "/api/family");

  if (req.method === "GET" && parts.length === 0) {
    const kids = await q("SELECT * FROM children WHERE parent_id = $1 ORDER BY created_at", [user.id]);
    const children = [];
    for (const c of kids) children.push(await childOverview(c, await hasFullAccess(user.id, Number(c.grade))));
    return json({
      parent: { name: user.name, email: user.email, role: user.role },
      access: await activeEntitlements(user.id),
      children,
      testMode: testMode(),
    });
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  if (parts[0] === "children" && parts.length === 1) {
    if (!(await hit(`child:create:${user.id}`, 20, 3600))) throw tooMany();
    const name = str(b.name, 40);
    const username = normalizeUsername(str(b.username, 40));
    const password = typeof b.password === "string" ? b.password : "";
    const grade = Number(b.grade);
    if (!name) throw bad("name", "Напиши името или прякора на детето.");
    if (!validUsername(username)) throw bad("username", "Потребителското име: 3–24 знака, латински букви, цифри, точка, тире.");
    if (password.length < 6 || password.length > 200) throw bad("password", "Паролата на детето трябва да е поне 6 знака.");
    if (!GRADES.includes(grade)) throw bad("grade", "Избери клас.");
    const count = await one<{ n: number }>("SELECT count(*)::int AS n FROM children WHERE parent_id = $1", [user.id]);
    if ((count?.n || 0) >= MAX_CHILDREN) throw bad("limit", "Можеш да добавиш до 6 деца.");
    const taken = await one("SELECT 1 FROM children WHERE username = $1", [username]);
    if (taken) throw bad("username_taken", "Това потребителско име е заето. Опитай с друго.");
    const row = await one<{ id: number }>(
      "INSERT INTO children (parent_id, display_name, username, password_hash, grade) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [user.id, name, username, await hashPassword(password), grade],
    );
    await event("child_created", { grade }, user.id, Number(row!.id));
    return json({ ok: true, id: Number(row!.id) });
  }

  if (parts[0] === "children" && parts.length === 3) {
    const childId = Number(parts[1]);
    const c = await one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [childId, user.id]);
    if (!c) throw forbidden();
    if (parts[2] === "password") {
      const password = typeof b.password === "string" ? b.password : "";
      if (password.length < 6 || password.length > 200) throw bad("password", "Паролата на детето трябва да е поне 6 знака.");
      await q("UPDATE children SET password_hash = $2 WHERE id = $1", [childId, await hashPassword(password)]);
      await q("DELETE FROM sessions WHERE child_id = $1 AND user_id IS NULL", [childId]);
      return json({ ok: true });
    }
    if (parts[2] === "grade") {
      const grade = Number(b.grade);
      if (!GRADES.includes(grade)) throw bad("grade", "Избери клас.");
      await q("UPDATE children SET grade = $2 WHERE id = $1", [childId, grade]);
      return json({ ok: true });
    }
    if (parts[2] === "delete") {
      if (b.confirm !== true) throw bad("confirm", "Потвърди изтриването.");
      await q("DELETE FROM children WHERE id = $1", [childId]);
      await event("child_deleted", {}, user.id);
      return json({ ok: true });
    }
    if (parts[2] === "seen") {
      await q("UPDATE unlock_requests SET seen_at = now() WHERE child_id = $1 AND seen_at IS NULL", [childId]);
      return json({ ok: true });
    }
  }

  if (parts[0] === "redeem") {
    if (!(await hit(`redeem:${user.id}`, 10, 3600))) throw tooMany();
    const result = await redeemCode(user.id, str(b.code, 40));
    return json({ ok: true, result });
  }

  throw notFound();
});

export const config: Config = { path: ["/api/family", "/api/family/*"] };
