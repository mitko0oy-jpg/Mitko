import type { Config } from "@netlify/functions";
import { createHash, randomBytes } from "node:crypto";
import { testMode, visibleStatuses } from "../lib/access.mts";
import { newCode, normalizeCode } from "../lib/codes.mts";
import { event, hit, one, q } from "../lib/db.mts";
import { bad, body, clientIp, handle, json, notFound, str, sub, tooMany } from "../lib/http.mts";

// „200 въпроса“ – the free gift. Children solve the PDF on paper, then check each part here.
// No account: the player is an anonymous random id from the browser, the teacher a secret link.
// The answer key never leaves the server before a part is handed in.
const MODULE = "podarak-200";
const LETTERS = "АБВГ";
const DEFAULT_RANKS = [
  { min: 90, title: "Будител" },
  { min: 75, title: "Майстор на словото" },
  { min: 60, title: "Летописец" },
  { min: 40, title: "Книжовник" },
  { min: 0, title: "Четец" },
];
// Statistics of a part are shown to the teacher only when enough children solved it.
const MIN_FOR_STATS = 3;

type Q = { id: number; data: { n: number; part: number; pts: number; unit: string; q: string; qt: string | null; o: string[]; a: number; e: string } };
type Part = { part: number; grade: number; section: string; title: string; from: number; to: number; count: number; max: number; minutes: number; points?: Record<number, number> };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function load() {
  const m = await one<{ meta: any }>("SELECT meta FROM modules WHERE slug = $1 AND active", [MODULE]);
  if (!m) throw notFound("Предизвикателството още не е заредено.");
  const items = await q<Q>("SELECT id, data FROM items WHERE module_slug = $1 AND status = ANY($2) ORDER BY position, id", [MODULE, visibleStatuses()]);
  // Numbers and points come from what is really published.
  const parts: Part[] = (m.meta.parts || []).map((p: Part) => {
    const mine = items.filter((i) => i.data.part === p.part);
    // Points per question number are public (they are printed in the PDF); the right letters are not.
    return { ...p, count: mine.length, max: mine.reduce((s, i) => s + i.data.pts, 0), points: Object.fromEntries(mine.map((i) => [i.data.n, i.data.pts])) };
  });
  const ranks = (m.meta.ranks?.length ? m.meta.ranks : DEFAULT_RANKS).slice().sort((a: any, b: any) => b.min - a.min);
  return { meta: m.meta, items, parts, ranks, total: parts.reduce((s, p) => s + p.max, 0) };
}

const rankOf = (ranks: { min: number; title: string }[], points: number, max: number) => {
  const pct = max ? Math.round((points / max) * 100) : 0;
  return (ranks.find((r) => pct >= r.min) || ranks[ranks.length - 1]).title;
};

function player(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(s)) throw bad("player", "Презареди страницата и опитай пак.");
  return sha256(`podarak:${s}`);
}

// A nickname for the class ranking: letters, digits and a few signs. Never a full name.
function nickOf(v: unknown): string {
  return str(v, 40)
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

async function classByCode(raw: unknown) {
  const code = normalizeCode(str(raw, 20));
  if (!code) return null;
  const c = await one<{ code: string; name: string }>("SELECT code, name FROM challenge_classes WHERE code = $1 AND module_slug = $2", [code, MODULE]);
  if (!c) throw bad("klass", "Няма клас с такъв код. Провери буквите и цифрите.");
  return c;
}

// Ranking of a class: first attempts only, one row per child.
async function ranking(code: string, parts: Part[], ranks: any[]) {
  const rows = await q<{ player_hash: string; part: number; points: number; correct: number; nick: string; created_at: string }>(
    "SELECT player_hash, part, points, correct, nick, created_at FROM challenge_results WHERE class_code = $1 AND attempt = 1 ORDER BY created_at",
    [code],
  );
  const by = new Map<string, any>();
  for (const r of rows) {
    if (!by.has(r.player_hash)) by.set(r.player_hash, { ref: r.player_hash.slice(0, 12), nick: "", parts: {}, total: 0, done: 0 });
    const p = by.get(r.player_hash);
    p.parts[r.part] = r.points;
    p.total += r.points;
    p.done += 1;
    if (r.nick) p.nick = r.nick;
  }
  const max = parts.reduce((s, p) => s + p.max, 0);
  return [...by.values()]
    .map((p) => ({ ...p, nick: p.nick || "Без псевдоним", title: rankOf(ranks, p.total, max) }))
    .sort((a, b) => b.total - a.total || b.done - a.done);
}

export default handle(async (req, ctx) => {
  const parts = sub(req, "/api/podarak/");
  const ip = clientIp(req, ctx);

  if (req.method === "GET" && parts[0] === "info") {
    const d = await load();
    const n = await one<{ n: number }>("SELECT count(DISTINCT player_hash)::int AS n FROM challenge_results WHERE module_slug = $1", [MODULE]);
    const expected = (d.meta.parts || []).reduce((s: number, p: Part) => s + p.count, 0);
    return json({ parts: d.parts, max: d.total, ranks: d.ranks, ready: d.items.length > 0 && d.items.length === expected, players: n?.n || 0, testMode: testMode() });
  }

  // The public ranking of a class (nicknames and points). Anyone with the code sees it.
  if (req.method === "GET" && parts[0] === "klas" && parts[1]) {
    const c = await classByCode(parts[1]);
    if (!c) throw notFound();
    const d = await load();
    const players = await ranking(c.code, d.parts, d.ranks);
    return json({ klass: { code: c.code, name: c.name }, parts: d.parts, max: d.total, players: players.map(({ ref, ...p }) => p) });
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req, 20_000);

  // Hand in one part: scored here, stored, then everything is shown – the key and the explanations.
  if (parts[0] === "check") {
    // A whole school can share one IP address: the per-IP limit is generous, the per-child one is not.
    if (!(await hit(`pod-ip:${ip}`, 600, 3600))) throw tooMany();
    const who = player(b.player);
    if (!(await hit(`pod-p:${who}`, 30, 3600))) throw tooMany();
    const d = await load();
    const part = d.parts.find((p) => p.part === Number(b.part));
    if (!part || !part.count) throw bad("part", "Няма такава част.");
    const items = d.items.filter((i) => i.data.part === part.part);
    const raw = b.answers && typeof b.answers === "object" ? b.answers : {};
    const answers: Record<string, number> = {};
    for (const it of items) {
      const v = raw[it.data.n];
      if (Number.isInteger(v) && v >= 0 && v <= 3) answers[it.data.n] = v;
    }
    const answered = Object.keys(answers).length;
    if (!answered) throw bad("answers", "Отбележи поне един отговор.");
    const klass = await classByCode(b.klass);
    const nick = nickOf(b.nick);
    if (klass && nick.length < 2) throw bad("nick", "Напиши псевдоним за класирането (поне 2 знака).");

    let points = 0, correct = 0;
    const results = items.map((it) => {
      const x = it.data;
      const your = answers[x.n] ?? null;
      const ok = your === x.a;
      if (ok) {
        points += x.pts;
        correct++;
      }
      return { n: x.n, pts: x.pts, ok, your: your === null ? null : LETTERS[your], right: LETTERS[x.a], q: x.q, qt: x.qt || null, rightText: x.o[x.a], yourText: your === null ? null : x.o[your], e: x.e, unit: x.unit };
    });

    const prev = await one<{ n: number }>("SELECT count(*)::int AS n FROM challenge_results WHERE module_slug = $1 AND player_hash = $2 AND part = $3", [MODULE, who, part.part]);
    const attempt = (prev?.n || 0) + 1;
    await q(
      `INSERT INTO challenge_results (module_slug, player_hash, part, attempt, nick, class_code, answers, points, max_points, correct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
      [MODULE, who, part.part, attempt, nick, klass?.code || null, JSON.stringify(answers), points, part.max, correct],
    );
    // Joining a class later brings the earlier parts along; a new nickname renames the child everywhere.
    if (klass) await q("UPDATE challenge_results SET class_code = $3 WHERE module_slug = $1 AND player_hash = $2 AND class_code IS NULL", [MODULE, who, klass.code]);
    if (nick) await q("UPDATE challenge_results SET nick = $3 WHERE module_slug = $1 AND player_hash = $2", [MODULE, who, nick]);

    // Where this result stands among everyone's first attempt at the part.
    const stand = await one<{ n: number; less: number }>(
      "SELECT count(*)::int AS n, (count(*) FILTER (WHERE points < $3))::int AS less FROM challenge_results WHERE module_slug = $1 AND part = $2 AND attempt = 1",
      [MODULE, part.part, points],
    );
    const participants = stand?.n || 0;
    const better = participants >= 5 ? Math.round(((stand?.less || 0) / participants) * 100) : null;

    // Topics worth practising: the units of the wrong answers, most mistakes first.
    const wrongBy = new Map<string, number>();
    for (const r of results) if (!r.ok) wrongBy.set(r.unit, (wrongBy.get(r.unit) || 0) + 1);
    const unitRows = wrongBy.size
      ? await q<{ slug: string; title: string; grade: number }>("SELECT slug, title, grade FROM units WHERE slug = ANY($1)", [[...wrongBy.keys()]])
      : [];
    const weak = unitRows.map((u) => ({ ...u, wrong: wrongBy.get(u.slug) || 0 })).sort((a, b) => b.wrong - a.wrong).slice(0, 5);
    const titles = new Map(unitRows.map((u) => [u.slug, u.title]));

    await event("podarak_check", { part: part.part, attempt, points, max: part.max, klass: !!klass });
    return json({
      part,
      attempt,
      counts: attempt === 1,
      points,
      max: part.max,
      correct,
      count: items.length,
      answered,
      percent: Math.round((points / part.max) * 100),
      title: rankOf(d.ranks, points, part.max),
      participants,
      better,
      klass,
      results: results.map((r) => ({ ...r, unitTitle: titles.get(r.unit) || null })),
      weak,
    });
  }

  // The child's own results on this device: first attempts count, the best one is shown too.
  if (parts[0] === "me") {
    const who = player(b.player);
    const d = await load();
    const rows = await q<{ part: number; attempt: number; points: number; max_points: number; nick: string; class_code: string | null }>(
      "SELECT part, attempt, points, max_points, nick, class_code FROM challenge_results WHERE module_slug = $1 AND player_hash = $2 ORDER BY part, attempt",
      [MODULE, who],
    );
    const mine: Record<number, any> = {};
    let nick = "", code: string | null = null;
    for (const r of rows) {
      const p = (mine[r.part] ||= { first: null, best: 0, attempts: 0 });
      if (r.attempt === 1) p.first = r.points;
      p.best = Math.max(p.best, r.points);
      p.attempts++;
      if (r.nick) nick = r.nick;
      if (r.class_code) code = r.class_code;
    }
    const total = Object.values(mine).reduce((s: number, p: any) => s + (p.first || 0), 0);
    const klass = code ? await one("SELECT code, name FROM challenge_classes WHERE code = $1", [code]) : null;
    return json({
      parts: mine,
      done: Object.keys(mine).length,
      total,
      max: d.total,
      title: rankOf(d.ranks, total, d.total),
      nick,
      klass,
    });
  }

  // A teacher creates a class: a short code for the children and a secret link for the teacher.
  if (parts[0] === "klas") {
    if (!(await hit(`pod-klas:${ip}`, 10, 86400))) throw tooMany("Създадени са твърде много класове от тази мрежа днес.");
    const name = str(b.name, 80).replace(/\s+/g, " ");
    if (name.length < 3) throw bad("name", "Напиши името на класа, например „7 б, СУ „Христо Ботев“, Враца“.");
    await load();
    const teacher = randomBytes(18).toString("base64url");
    for (let i = 0; i < 5; i++) {
      const code = newCode(6);
      const r = await q("INSERT INTO challenge_classes (code, module_slug, name, teacher_hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING code", [
        code,
        MODULE,
        name,
        sha256(`teacher:${teacher}`),
      ]);
      if (r.length) {
        await event("podarak_class", {});
        return json({ ok: true, code, teacher, name });
      }
    }
    throw new Error("could not create a class code");
  }

  // The teacher's view: the ranking, the hardest questions, and removing a nickname that does not belong.
  if (parts[0] === "uchitel") {
    if (!(await hit(`pod-t:${ip}`, 120, 3600))) throw tooMany();
    const secret = str(b.teacher, 64);
    const c = secret ? await one<{ code: string; name: string; created_at: string }>("SELECT code, name, created_at FROM challenge_classes WHERE teacher_hash = $1", [sha256(`teacher:${secret}`)]) : null;
    if (!c) throw bad("teacher", "Линкът на учителя не е верен. Отвори го отново от мястото, където си го запазил.");
    if (typeof b.remove === "string" && /^[0-9a-f]{12}$/.test(b.remove)) {
      await q("UPDATE challenge_results SET class_code = NULL WHERE class_code = $1 AND left(player_hash, 12) = $2", [c.code, b.remove]);
    }
    const d = await load();
    const players = await ranking(c.code, d.parts, d.ranks);
    const rows = await q<{ part: number; answers: Record<string, number> }>("SELECT part, answers FROM challenge_results WHERE class_code = $1 AND attempt = 1", [c.code]);
    const solved: Record<number, number> = {};
    for (const r of rows) solved[r.part] = (solved[r.part] || 0) + 1;
    const stats = new Map<number, { answered: number; wrong: number; picks: number[] }>();
    for (const r of rows) {
      if ((solved[r.part] || 0) < MIN_FOR_STATS) continue;
      for (const [n, v] of Object.entries(r.answers)) {
        const s = stats.get(Number(n)) || { answered: 0, wrong: 0, picks: [0, 0, 0, 0] };
        s.answered++;
        s.picks[v]++;
        stats.set(Number(n), s);
      }
    }
    const hardest = d.items
      .filter((i) => stats.has(i.data.n))
      .map((i) => {
        const s = stats.get(i.data.n)!;
        const wrong = s.answered - s.picks[i.data.a];
        const common = s.picks.map((k, j) => ({ k, j })).filter((x) => x.j !== i.data.a).sort((a, b) => b.k - a.k)[0];
        return {
          n: i.data.n,
          part: i.data.part,
          pts: i.data.pts,
          q: i.data.q,
          right: LETTERS[i.data.a],
          rightText: i.data.o[i.data.a],
          wrongShare: Math.round((wrong / s.answered) * 100),
          answered: s.answered,
          common: common && common.k ? { letter: LETTERS[common.j], text: i.data.o[common.j], share: Math.round((common.k / s.answered) * 100) } : null,
          e: i.data.e,
        };
      })
      .filter((x) => x.wrongShare > 0)
      .sort((a, b) => b.wrongShare - a.wrongShare || b.pts - a.pts)
      .slice(0, 15);
    return json({ klass: { code: c.code, name: c.name, created_at: c.created_at }, parts: d.parts, max: d.total, players, solved, hardest, minForStats: MIN_FOR_STATS });
  }

  throw notFound();
});

export const config: Config = { path: "/api/podarak/*" };
