// „200 задачи по математика“: free part, first-attempt points, separate math access, parent report.
// Uses its own made-up tasks, so it runs without the paid content:
//   node scripts/dev-server.mjs 8899 & EDUBEL_URL=http://localhost:8899 node --test test/quiz.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.EDUBEL_URL || "http://localhost:8899";
const ADMIN = process.env.ADMIN_TOKEN || "local-admin-token-local-admin-token-0000";
const run = Date.now().toString(36);

function client() {
  let cookie = "";
  return async function call(path, data) {
    const res = await fetch(`${BASE}/api/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  };
}
const admin = (path, data) =>
  fetch(`${BASE}/api/admin/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-admin-token": ADMIN },
    body: data === undefined ? undefined : JSON.stringify(data),
  }).then((r) => r.json());

const task = (n, lv) => ({
  n,
  lv,
  q: `Тестова задача ${n}: колко е {1/2} + {1/2}?`,
  o: ["1", "2", "{1/4}", "0"],
  h: "Събери числителите.",
  s: [{ do: "{1/2} + {1/2} = {2/2}", why: "Знаменателите са равни." }, { do: "{2/2} = 1", why: "Съкращаваме." }],
  a: "1",
  trap: "Не събирай знаменателите.",
  card: 5,
  t: "Обикновени и десетични дроби",
});

test("math quiz: free part, points at the first attempt, own access", async () => {
  const A = `test-mat-a-${run}`;
  const B = `test-mat-b-${run}`;
  const imp = await admin("import", {
    modules: [
      { slug: A, subject: "mat", grade: 5, kind: "quiz", title: "Тестова част 5", position: 900, free_count: 2 },
      { slug: B, subject: "mat", grade: 7, kind: "quiz", title: "Тестова част 7", position: 901, free_count: 1 },
    ],
    items: [
      ...[0, 0, 1, 1, 2, 2].map((lv, i) => ({ module: A, ext: `${A}-${i + 1}`, position: i + 1, data: task(i + 1, lv) })),
      ...[0, 1, 2].map((lv, i) => ({ module: B, ext: `${B}-${i + 1}`, position: i + 1, data: task(i + 7, lv) })),
    ],
  });
  assert.equal(imp.created, 9);
  const bad = await admin("import", { modules: [{ slug: `x-${run}`, subject: "chem", grade: 5, kind: "quiz", title: "X" }] });
  assert.equal(bad.error, "subject");

  const parent = client();
  await parent("auth/register", { name: "Петя", email: `petya.${run}@example.com`, password: "parola123", consent: true });
  await parent("family/children", { name: "Мила", username: `mila.${run}`, password: "123456", grade: 7 });
  const kid = client();
  await kid("auth/login", { username: `mila.${run}`, password: "123456" });

  // The math parts are not tied to the grade: a 7th-grader sees the 5th-grade part too.
  let home = await kid("quiz/mat/home");
  assert.equal(home.full, false);
  const pa = home.parts.find((p) => p.slug === A);
  assert.ok(pa && home.parts.some((p) => p.slug === B));
  assert.equal(pa.total, 6);
  assert.equal(pa.accessible, 2);
  assert.equal(pa.max, 12);
  // The BEL course does not list or serve the math parts.
  const bel = await kid("learn/home");
  assert.ok(!bel.modules.some((m) => m.slug === A));
  let r = await kid(`learn/module/${A}`);
  assert.equal(r.status, 404);
  r = await kid("quiz/chem/home");
  assert.equal(r.status, 404);

  // Only the free tasks reach the browser.
  let part = await kid(`quiz/mat/part/${A}`);
  assert.equal(part.items.length, 2);
  assert.equal(part.locked, 4);
  assert.deepEqual(part.lockedLevels, [0, 2, 2]);
  assert.equal(part.max, 12);
  const [i1, i2] = part.items;

  // Wrong, then right: no points for the second attempt.
  r = await kid("quiz/mat/answer", { part: A, itemId: i1.id, choice: 2 });
  assert.deepEqual([r.ok, r.first, r.points], [false, true, 0]);
  r = await kid("quiz/mat/answer", { part: A, itemId: i1.id, choice: 0 });
  assert.deepEqual([r.ok, r.first, r.points, r.score], [true, false, 0, 0]);
  r = await kid("quiz/mat/answer", { part: A, itemId: i2.id, choice: 7 });
  assert.equal(r.status, 400, "no such option");
  // Right at the first attempt: 1 point (level Знам). The free part is finished.
  r = await kid("quiz/mat/answer", { part: A, itemId: i2.id, choice: 0 });
  assert.deepEqual([r.ok, r.first, r.points, r.freeFinished], [true, true, 1, true]);
  // A later wrong answer does not take the point away.
  r = await kid("quiz/mat/answer", { part: A, itemId: i2.id, choice: 1 });
  assert.equal(r.score, 1);

  // A locked task cannot be answered (the items of one import get consecutive ids).
  r = await kid("quiz/mat/answer", { part: A, itemId: i2.id + 1, choice: 0 });
  assert.equal(r.status, 403);
  const all = await admin("export");
  assert.equal(all.modules.find((m) => m.slug === A).subject, "mat");
  part = await kid(`quiz/mat/part/${A}`);
  assert.equal(part.progress[i1.id].lastOk, true);
  assert.equal(part.progress[i2.id].score, 1);

  home = await kid("quiz/mat/home");
  const pa2 = home.parts.find((p) => p.slug === A);
  assert.deepEqual([pa2.answered, pa2.points, pa2.wrong, pa2.freeFinished], [2, 1, 1, true]);

  // The child asks a parent; the parent sees the request as a math one.
  r = await kid("quiz/mat/unlock", { part: A });
  assert.equal(r.ok, true);
  let fam = await parent("family");
  const mila = fam.children[0];
  assert.equal(fam.mathFull, false);
  assert.ok(mila.unlockRequests.some((u) => u.module === A && u.subject === "mat" && u.title === "Тестова част 5"));
  assert.equal(mila.math.full, false);
  assert.ok(mila.math.parts.find((p) => p.slug === A).points === 1);

  // A BEL pass does not open the math tasks.
  const { codes: belCodes } = await admin("codes", { count: 1, days: 30, batch: "test-bel", product: "bel-all" });
  await parent("family/redeem", { code: belCodes[0] });
  part = await kid(`quiz/mat/part/${A}`);
  assert.equal(part.items.length, 2);

  // The code from the math card box does.
  const { codes } = await admin("codes", { count: 1, days: 365, batch: "test-mat", product: "mat" });
  r = await parent("family/redeem", { code: codes[0] });
  assert.equal(r.result.product, "mat");
  part = await kid(`quiz/mat/part/${A}`);
  assert.equal(part.items.length, 6);
  assert.equal(part.locked, 0);
  r = await kid("quiz/mat/answer", { part: A, itemId: part.items[5].id, choice: 0 });
  assert.equal(r.points, 3, "level Мисля gives 3 points");
  fam = await parent("family");
  assert.equal(fam.mathFull, true);
  assert.equal(fam.children[0].math.points, 4);

  // The teacher sees the math tasks in the review.
  const { codes: rc } = await admin("codes", { count: 1, kind: "reviewer", batch: "test-mat-reviewer" });
  const rev = client();
  await rev("auth/register", { name: "Учител", email: `mrev.${run}@example.com`, password: "parola123", consent: true, code: rc[0] });
  const mod = await rev(`review/module/${A}`);
  assert.equal(mod.module.kind, "quiz");
  assert.equal(mod.items.length, 6);

  // Hide the test parts again.
  await admin("import", {
    modules: [
      { slug: A, subject: "mat", grade: 5, kind: "quiz", title: "Тестова част 5", active: false },
      { slug: B, subject: "mat", grade: 7, kind: "quiz", title: "Тестова част 7", active: false },
    ],
  });
  home = await kid("quiz/mat/home");
  assert.ok(!home.parts.some((p) => p.slug === A));
});
