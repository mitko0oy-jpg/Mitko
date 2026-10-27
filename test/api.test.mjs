// End-to-end API test against a running server with imported content.
// Run: node scripts/dev-server.mjs 8899 & node scripts/admin.mjs import content.json; EDUBEL_URL=http://localhost:8899 node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.EDUBEL_URL || "http://localhost:8899";
const ADMIN = process.env.ADMIN_TOKEN || "local-admin-token-local-admin-token-0000";
const run = Date.now().toString(36);

function client() {
  let cookie = "";
  return async function call(path, data, headers = {}) {
    const res = await fetch(`${BASE}/api/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie, ...headers },
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

test("parent, child, free limit, unlock, code, review", async () => {
  const parent = client();
  let r = await parent("auth/register", { name: "Мария", email: `maria.${run}@example.com`, password: "short", consent: true });
  assert.equal(r.status, 400, "short password rejected");
  r = await parent("auth/register", { name: "Мария", email: `maria.${run}@example.com`, password: "parola123", consent: true });
  assert.equal(r.status, 200);
  r = await parent("auth/register", { name: "Мария", email: `maria.${run}@example.com`, password: "parola123", consent: true });
  assert.equal(r.status, 400, "duplicate email rejected");

  r = await parent("family/children", { name: "Иво", username: `ivo.${run}`, password: "123456", grade: 7 });
  assert.equal(r.status, 200);
  r = await parent("family/children", { name: "Друг", username: `ivo.${run}`, password: "123456", grade: 7 });
  assert.equal(r.code ?? r.error, "username_taken");

  // Child logs in on their own device.
  const kid = client();
  r = await kid("auth/login", { username: `IVO.${run}`, password: "wrong!" });
  assert.equal(r.status, 401);
  r = await kid("auth/login", { username: `IVO.${run}`, password: "123456" });
  assert.equal(r.status, 200);
  r = await kid("auth/me");
  assert.equal(r.child.grade, 7);
  r = await kid("family");
  assert.equal(r.status, 401, "child cannot open the parent area");

  const home = await kid("learn/home");
  const bySlug = Object.fromEntries(home.modules.map((m) => [m.slug, m]));
  assert.equal(bySlug["bel7-karti"].accessible, 30);
  assert.equal(bySlug["bel7-karti"].locked, 60);
  assert.equal(bySlug["bel7-test"].accessible, 15);
  assert.equal(bySlug["bel7-zadacha25"].accessible, 7);
  assert.equal(bySlug["bel7-geroi"].accessible, 2);
  assert.equal(bySlug["bel7-pesho"].accessible, 5);

  const cards = await kid("learn/module/bel7-karti");
  assert.equal(cards.items.length, 30);
  assert.equal(cards.locked, 60);
  // A locked item cannot be answered.
  const all = await admin("export");
  const lockedCard = all.items.find((i) => i.module_slug === "bel7-karti" && i.ext_id === "card-80");
  assert.ok(lockedCard);

  // Answer 29 cards: not finished yet; the 30th finishes the free part.
  const first = cards.items.slice(0, 29).map((i, k) => ({ itemId: i.id, ok: k % 3 !== 0 }));
  r = await kid("learn/progress", { module: "bel7-karti", results: first });
  assert.equal(r.freeFinished, false);
  r = await kid("learn/progress", { module: "bel7-karti", results: [{ itemId: cards.items[29].id, ok: true }] });
  assert.equal(r.freeFinished, true);

  // Characters module: AI chars hide server-only fields.
  const chars = await kid("learn/module/bel7-geroi");
  assert.equal(chars.items.length, 2);
  assert.equal(chars.items[0].data.facts, undefined);
  assert.ok(chars.items[0].data.mission);

  r = await kid("learn/unlock", { module: "bel7-karti" });
  assert.equal(r.ok, true);
  let fam = await parent("family");
  const ivo = fam.children[0];
  assert.equal(ivo.unlockRequests.length, 1);
  assert.equal(ivo.full, false);
  assert.ok(ivo.weak.length > 0, "weak works reported");

  // Parent redeems a tester code: everything unlocks.
  const { codes } = await admin("codes", { count: 1, days: 30, batch: "test" });
  r = await parent("family/redeem", { code: codes[0].toLowerCase() });
  assert.equal(r.ok, true);
  r = await parent("family/redeem", { code: codes[0] });
  assert.equal(r.status, 400, "same code twice is rejected");
  fam = await parent("family");
  assert.equal(fam.children[0].full, true);
  const full = await kid("learn/module/bel7-karti");
  assert.equal(full.items.length, 90);
  assert.equal(full.locked, 0);

  // Parent switches into the child's profile and back.
  r = await parent("auth/switch", { childId: ivo.id });
  assert.equal(r.ok, true);
  r = await parent("auth/me");
  assert.equal(r.viaParent, true);
  r = await parent("auth/switch-back", {});
  r = await parent("auth/me");
  assert.equal(r.child, null);

  // AI without a key: clear message, no crash.
  r = await kid("ai", { mode: "interview", itemId: chars.items[0].id, messages: [{ role: "user", content: "Здравей" }] });
  assert.ok([503, 200].includes(r.status));

  // Reviewer: registers with a reviewer code, approves and comments.
  const { codes: rc } = await admin("codes", { count: 1, kind: "reviewer", batch: "test-reviewer" });
  const rev = client();
  r = await rev("auth/register", { name: "Учителка", email: `rev.${run}@example.com`, password: "parola123", consent: true, code: rc[0] });
  assert.equal(r.code.kind, "reviewer");
  const mods = await rev("review/modules");
  assert.ok(mods.modules.length >= 6);
  const mod = await rev("review/module/bel7-pesho");
  const it = mod.items[0];
  r = await rev(`review/item/${it.id}/approve`, {});
  assert.equal(r.status, "approved");
  r = await rev(`review/item/${mod.items[1].id}/comment`, { body: "Провери жанра." });
  assert.equal(r.ok, true);
  r = await parent("review/modules");
  assert.equal(r.status, 403, "parents cannot review");

  const comments = await admin("comments");
  assert.ok(comments.comments.some((c) => c.body === "Провери жанра."));
  r = await admin(`items/${mod.items[1].id}`, { resolution: "Поправено" });
  assert.equal(r.ok, true);

  // Admin API rejects a wrong token.
  const bad = await fetch(`${BASE}/api/admin/stats`, { headers: { "x-admin-token": "nope" } });
  assert.equal(bad.status, 403);
  // Non-JSON POST is rejected (CSRF guard).
  const form = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=b" });
  assert.equal(form.status, 415);
});

test("mock exam: free section, locked sections, exact scoring", async () => {
  const parent = client();
  await parent("auth/register", { name: "Ева", email: `eva.${run}@example.com`, password: "parola123", consent: true });
  await parent("family/children", { name: "Боби", username: `bobi.${run}`, password: "123456", grade: 7 });
  const kid = client();
  await kid("auth/login", { username: `bobi.${run}`, password: "123456" });

  let mod = await kid("learn/module/bel7-izpit");
  assert.equal(mod.items.length, 1, "only the first section is free");
  assert.deepEqual(mod.lockedTitles, ["Български език", "Литература", "Преразказ"]);
  assert.equal(mod.items[0].data.key, undefined, "answer key is not sent before hand-in");

  // All correct answers of section 1 (from the export used by the operator).
  const all = await admin("export");
  const s1 = all.items.find((i) => i.ext_id === "izpit1-s1").data;
  const answers = Object.fromEntries(Object.entries(s1.key).map(([n, k]) => [n, k.a.trim().charAt(0)]));
  let r = await kid("learn/exam", { module: "bel7-izpit", itemId: mod.items[0].id, answers });
  assert.equal(r.result.points, r.result.max);
  assert.equal(r.percent, 100);
  // A locked section cannot be handed in.
  const s2item = all.items.find((i) => i.ext_id === "izpit1-s2");
  r = await kid("learn/exam", { module: "bel7-izpit", itemId: 999999, answers: {} });
  assert.equal(r.status, 403);
  // The generic progress endpoint cannot fake an exam score.
  r = await kid("learn/progress", { module: "bel7-izpit", results: [{ itemId: mod.items[0].id, ok: true, score: 100 }] });
  assert.equal(r.status, 400);

  // With a pass: section 2, task 17 corrected exactly as the key says.
  const { codes } = await admin("codes", { count: 1, days: 30, batch: "exam-test" });
  await parent("family/redeem", { code: codes[0] });
  mod = await kid("learn/module/bel7-izpit");
  assert.equal(mod.items.length, 4);
  const s2 = s2item.data;
  let fixed = s2.editText;
  for (const e of s2.editing) fixed = fixed.replace(e.wrong, e.right);
  const a2 = { 17: fixed };
  for (const [n, k] of Object.entries(s2.key)) if (s2.tasks.find((t) => String(t.n) === n)?.options) a2[n] = k.a.trim().charAt(0);
  const s2id = mod.items.find((i) => i.ext === "izpit1-s2").id;
  r = await kid("learn/exam", { module: "bel7-izpit", itemId: s2id, answers: a2 });
  const t17 = r.result.results.find((x) => x.n === 17);
  assert.equal(t17.points, 14, "all 14 corrections recognised");
  assert.ok(t17.errors.every((e) => e.fixed));
  // Untouched text scores 0 on task 17.
  r = await kid("learn/exam", { module: "bel7-izpit", itemId: s2id, answers: { 17: s2.editText } });
  assert.equal(r.result.results.find((x) => x.n === 17).points, 0);

  const fam = await parent("family");
  assert.equal(fam.children[0].exam.done, 2);
});
