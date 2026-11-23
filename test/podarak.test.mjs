// „200 въпроса“: the online check, the class ranking and the teacher view.
// Needs a running server with the podarak-200 module imported (see CLAUDE.md).
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.EDUBEL_URL || "http://localhost:8899";
const ADMIN = process.env.ADMIN_TOKEN || "local-admin-token-local-admin-token-0000";
const run = Date.now().toString(36);

async function call(path, data) {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const player = (k) => `test-${run}-${k}-xxxxxxxxxxxx`;

test("gift challenge: check, ranking, teacher", async () => {
  const info = await call("podarak/info");
  assert.equal(info.status, 200);
  assert.equal(info.parts.length, 6);
  const p1 = info.parts[0];
  assert.ok(p1.count > 0, "the challenge is imported");
  // The key is not public before a part is handed in.
  assert.ok(!JSON.stringify(info).includes('"a":'));

  const exp = await fetch(`${BASE}/api/admin/export`, { headers: { "x-admin-token": ADMIN } }).then((r) => r.json());
  const items = exp.items.filter((i) => i.module_slug === "podarak-200" && i.data.part === 1).map((i) => i.data);
  const right = Object.fromEntries(items.map((q) => [q.n, q.a]));
  const wrong = Object.fromEntries(items.map((q) => [q.n, (q.a + 1) % 4]));

  let r = await call("podarak/check", { part: 1, answers: {}, player: player("a") });
  assert.equal(r.status, 400, "no answers");
  r = await call("podarak/check", { part: 1, answers: right, player: "short" });
  assert.equal(r.status, 400, "bad player id");

  r = await call("podarak/check", { part: 1, answers: right, player: player("a") });
  assert.equal(r.status, 200);
  assert.equal(r.points, p1.max);
  assert.equal(r.correct, items.length);
  assert.equal(r.attempt, 1);
  assert.equal(r.counts, true);
  assert.equal(r.title, "Будител");
  assert.equal(r.results[0].right, "АБВГ"[items[0].a]);
  assert.ok(r.results[0].e, "explanations come with the result");

  r = await call("podarak/check", { part: 1, answers: wrong, player: player("a") });
  assert.equal(r.points, 0);
  assert.equal(r.attempt, 2);
  assert.equal(r.counts, false);
  assert.ok(r.weak.length > 0, "weak topics point to the programme");

  r = await call("podarak/me", { player: player("a") });
  assert.equal(r.parts[1].first, p1.max, "the first attempt counts");
  assert.equal(r.parts[1].attempts, 2);
  assert.equal(r.total, p1.max);

  // A class: the code for the children, the secret link for the teacher.
  r = await call("podarak/klas", { name: "x" });
  assert.equal(r.status, 400);
  const k = await call("podarak/klas", { name: `7 б тест ${run}` });
  assert.equal(k.status, 200);
  assert.match(k.code, /^[A-Z2-9]{6}$/);

  r = await call("podarak/check", { part: 1, answers: right, player: player("b"), klass: k.code });
  assert.equal(r.status, 400, "a nickname is needed for the class ranking");
  r = await call("podarak/check", { part: 1, answers: right, player: player("b"), klass: "NOPE99" });
  assert.equal(r.status, 400, "unknown class");

  const half = Object.fromEntries(Object.entries(right).map(([n, a], i) => [n, i % 2 ? a : (a + 1) % 4]));
  await call("podarak/check", { part: 1, answers: right, player: player("b"), nick: "Звезда <b>", klass: k.code.toLowerCase() });
  await call("podarak/check", { part: 1, answers: half, player: player("c"), nick: "Книжния червей", klass: k.code });
  r = await call(`podarak/klas/${k.code}`);
  assert.equal(r.players.length, 2);
  assert.equal(r.players[0].nick, "Звезда b", "nicknames are cleaned");
  assert.ok(!("ref" in r.players[0]), "the public ranking has no player refs");

  r = await call("podarak/uchitel", { teacher: "wrong-secret" });
  assert.equal(r.status, 400);
  r = await call("podarak/uchitel", { teacher: k.teacher });
  assert.equal(r.status, 200);
  assert.equal(r.hardest.length, 0, "no statistics before enough children solved the part");
  await call("podarak/check", { part: 1, answers: wrong, player: player("d"), nick: "Трети", klass: k.code });
  r = await call("podarak/uchitel", { teacher: k.teacher });
  assert.equal(r.solved[1], 3);
  assert.ok(r.hardest.length > 0);
  assert.ok(r.hardest[0].wrongShare >= r.hardest[r.hardest.length - 1].wrongShare);

  // Joining the class later brings the earlier result along; the teacher can remove a nickname.
  await call("podarak/check", { part: 2, answers: { [info.parts[1].from]: 0 }, player: player("a"), nick: "Първи", klass: k.code });
  r = await call("podarak/uchitel", { teacher: k.teacher });
  const first = r.players.find((p) => p.nick === "Първи");
  assert.equal(first.parts[1], p1.max);
  r = await call("podarak/uchitel", { teacher: k.teacher, remove: first.ref });
  assert.ok(!r.players.some((p) => p.nick === "Първи"));
});
