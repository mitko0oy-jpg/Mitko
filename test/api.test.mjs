// End-to-end API test against a running server with imported content.
// Run: node scripts/dev-server.mjs 8899 & node scripts/admin.mjs import content.json; EDUBEL_URL=http://localhost:8899 node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("course structure: public map, unit page, locked resources", async () => {
  const units = JSON.parse(await readFile(new URL("../curriculum/units.json", import.meta.url), "utf8"));
  const imp = await admin("import", units);
  assert.equal(imp.units, units.units.length);

  // Public map: titles and counts only, no item content.
  const pub = await fetch(`${BASE}/api/units?grade=7`).then((r) => r.json());
  const edna = pub.units.find((u) => u.slug === "g7-edna-balgarka");
  assert.ok(edna, "unit for „Една българка“");
  assert.ok(edna.resources.some((r) => r.kind === "cards" && r.total > 0));
  assert.equal(JSON.stringify(pub).includes("\"items\""), false);
  const badGrade = await fetch(`${BASE}/api/units?grade=9`);
  assert.equal(badGrade.status, 400);

  const parent = client();
  await parent("auth/register", { name: "Ани", email: `ani.${run}@example.com`, password: "parola123", consent: true });
  await parent("family/children", { name: "Вики", username: `viki.${run}`, password: "123456", grade: 7 });
  const kid = client();
  await kid("auth/login", { username: `viki.${run}`, password: "123456" });

  const map = await kid("learn/units");
  assert.equal(map.grade, 7);
  assert.ok(map.units.some((u) => u.section === "language"));
  assert.ok(map.units.every((u) => u.resources.every((r) => r.items === undefined)));

  const page = await kid("learn/unit/g7-edna-balgarka");
  assert.equal(page.unit.match, undefined, "matching rules stay on the server");
  const cards = page.resources.find((r) => r.kind === "cards");
  assert.ok(cards.total >= cards.open);
  assert.equal(cards.items.filter((i) => i.open).length, cards.open);
  let r = await kid("learn/unit/no-such-unit");
  assert.equal(r.status, 404);

  // A child of another grade does not see 7th-grade units.
  await parent("family/children", { name: "Бояна", username: `boyana.${run}`, password: "123456", grade: 5 });
  const kid5 = client();
  await kid5("auth/login", { username: `boyana.${run}`, password: "123456" });
  r = await kid5("learn/unit/g7-edna-balgarka");
  assert.equal(r.status, 404);
});

test("lessons and texts: empty template, written lesson, locked text", async () => {
  const units = JSON.parse(await readFile(new URL("../curriculum/units.json", import.meta.url), "utf8"));
  await admin("import", units);
  const unit = units.units.find((u) => u.grade === 6 && u.planned.includes("reading"));
  const parent = client();
  await parent("auth/register", { name: "Ели", email: `eli.${run}@example.com`, password: "parola123", consent: true });
  await parent("family/children", { name: "Дани", username: `dani.${run}`, password: "123456", grade: 6 });
  const kid = client();
  await kid("auth/login", { username: `dani.${run}`, password: "123456" });

  // Nothing written yet: the page gets no item and shows the template.
  let r = await kid(`learn/unit/${unit.slug}/lesson`);
  assert.equal(r.status, 200);
  assert.equal(r.item, null);
  assert.equal(r.locked, false);
  assert.equal(r.unit.slug, unit.slug);

  const mods = [
    { slug: `test-uroci-${run}`, grade: 6, kind: "lesson", title: "Кратки уроци", free_ratio: 1 },
    { slug: `test-chetene-${run}`, grade: 6, kind: "reading", title: "Текстове", free_count: 0 },
  ];
  await admin("import", {
    modules: mods,
    items: [
      { module: mods[0].slug, ext: "u1", position: 1, data: { unit: unit.slug, sections: { short: "Тестов урок." } } },
      { module: mods[1].slug, ext: "r1", position: 1, data: { unit: unit.slug, text: "Тестов текст." } },
    ],
  });
  r = await kid(`learn/unit/${unit.slug}/lesson`);
  assert.equal(r.item.data.sections.short, "Тестов урок.");
  assert.equal(r.item.done, false);
  r = await kid("learn/progress", { module: mods[0].slug, results: [{ itemId: r.item.id, ok: true }] });
  r = await kid(`learn/unit/${unit.slug}/lesson`);
  assert.equal(r.item.done, true, "the lesson is marked as read");

  // A locked text is not sent to the browser.
  r = await kid(`learn/unit/${unit.slug}/reading`);
  assert.equal(r.item, null);
  assert.equal(r.locked, true);
  const page = await kid(`learn/unit/${unit.slug}`);
  assert.deepEqual(page.resources.map((x) => x.kind).filter((k) => k === "lesson" || k === "reading").sort(), ["lesson", "reading"]);

  // Hide the test modules again.
  await admin("import", { modules: mods.map((m) => ({ ...m, active: false })), items: [] });
  r = await kid(`learn/unit/${unit.slug}/lesson`);
  assert.equal(r.item, null);
});

test("НВО тренажор: personal code, three devices, merged grades, support page", async () => {
  const bank = await admin("trener-bank", {
    passages: { p1: { title: "Текст", text: ["Абзац."] } },
    questions: [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `pravopis-${String(i + 1).padStart(2, "0")}`, m: "pravopis", t: "mc", q: "Въпрос?", o: ["а", "б", "в", "г"], a: 0, why: "Защото така казва правилото за правопис." })),
      { id: "m12-k1", m: "mk-12", t: "mc", h: 1, q: "Кое е вярно?", o: ["96 · 0,8", "96 · 0,2"], a: 0, why: 'Второто <span class="fr"><span>1</span><span>5</span></span> се смята от <b class="x y">новата цена</b>, а не от старата.' },
    ],
    modules: [{ id: "pravopis", n: 1, area: "lang", title: "Правопис", desc: "" }, { id: "mk-12", n: 112, area: "math", sec: "pct", title: "Карта 12", desc: "" }],
    dossiers: { title: "Литературни досиета", dossiers: [{ id: "d01", no: 1, work: "„Творба“" }], message: { fields: 1, groups: [[1]], text: "А" } },
    math: { title: "Математика", sections: [{ id: "pct", t: "Проценти и пари", c: "#A8641B" }], index: [{ n: 12, area: "pct", title: "Две поредни промени", grades: "6–7" }],
      cards: [{ n: 12, area: "pct", title: "Две поредни промени", front: [{ tag: "section", cls: "key", html: '<h5>Ключът <span class="badge mem">Наизуст</span></h5><p class="f">умножи по <span class="fr"><span>p</span><span>100</span></span> и после пак</p>' }], back: [] }] },
  });
  assert.ok(bank.id > 0);
  assert.equal(bank.dossiers, 1, "the game is kept with the bank");
  assert.equal(bank.mathCards, 1, "the math cards are kept with the bank");
  const { codes } = await admin("trener-codes", { count: 2, batch: `test-${run}` });
  const [code, other] = codes;
  const t = client();
  const dev = (n) => `${n}`.padStart(2, "0").repeat(24);

  let r = await t("trener/open", { code: "AAAAA-BBBBB", device: dev(1) });
  assert.equal(r.status, 404, "unknown code");
  r = await t("trener/open", { code: code.toLowerCase().replace("-", ""), device: dev(1), label: "iPhone · Safari" });
  assert.equal(r.code, code, "code typed in lower case without the dash");
  assert.equal(r.bank.questions.length, 13);
  assert.equal(r.bank.dossiers.dossiers[0].id, "d01", "the game reaches the browser");
  assert.equal(r.bank.math.cards[0].n, 12, "the math cards reach the browser");
  // The fingerprint goes into the math HTML too, but never inside a tag.
  const unmark = (x) => x.replace(/\u2060[\u200b\u200c]{32}\u2060/g, "");
  const mathWhy = r.bank.questions.find((x) => x.id === "m12-k1").why, cardHtml = r.bank.math.cards[0].front[0].html;
  assert.ok(/\u2060[\u200b\u200c]{32}\u2060/.test(mathWhy) && /\u2060[\u200b\u200c]{32}\u2060/.test(cardHtml), "math text and cards carry the fingerprint");
  assert.ok(!/<[^>]*\u2060/.test(mathWhy) && !/<[^>]*\u2060/.test(cardHtml), "not inside an HTML tag");
  assert.ok(unmark(mathWhy).startsWith("Второто <span") && unmark(cardHtml).includes('<span class="fr">'), "the HTML is unchanged apart from the mark");
  assert.equal(r.devices.length, 1);
  r = await t("trener/open", { code, device: dev(1), have: r.bankId });
  assert.equal(r.bank, undefined, "the bank is not sent again when the browser has it");

  // Device 1 saves a result, device 2 another one: both are kept.
  const d1 = Date.now() - 5000, d2 = Date.now() - 1000;
  r = await t("trener/save", { code, device: dev(1), state: { name: "Ива", hist: [{ m: "pravopis", d: d1, p: 18, n: 20, s: 300, w: [] }], mist: {}, at: d1 } });
  assert.equal(r.state.hist.length, 1);
  await t("trener/open", { code, device: dev(2) });
  r = await t("trener/save", { code, device: dev(2), state: { name: "Ива", hist: [{ m: "glagol", d: d2, p: 11, n: 20, s: 300, w: ["glagol-01"] }], mist: { "glagol-01": { n: 1, ok: 0, d: d2 } }, at: d2 } });
  assert.deepEqual(r.state.hist.map((h) => h.m), ["pravopis", "glagol"], "results from both devices are merged");

  // Third device fits, the fourth does not.
  await t("trener/open", { code, device: dev(3) });
  r = await t("trener/open", { code, device: dev(4) });
  assert.equal(r.status, 409);
  assert.equal(r.error, "devices_full");
  assert.equal(r.devices.length, 3);

  // From device 1, free device 3: device 4 gets in, device 3 is told it was removed.
  r = await t("trener/open", { code, device: dev(1) });
  const third = r.devices[2].id;
  r = await t("trener/forget", { code, device: dev(1), target: third });
  assert.equal(r.devices.length, 2);
  r = await t("trener/open", { code, device: dev(4) });
  assert.equal(r.devices.length, 3);
  r = await t("trener/save", { code, device: dev(3), state: {} });
  assert.equal(r.error, "device_removed");

  // A reset on one device clears the older results everywhere.
  r = await t("trener/save", { code, device: dev(2), state: { name: "Ива", hist: [], mist: {}, resetAt: Date.now(), at: Date.now() } });
  assert.equal(r.state.hist.length, 0);

  // Support page: only for admins.
  const owner = client();
  await owner("auth/register", { name: "Собственик", email: `owner.${run}@example.com`, password: "parola123", consent: true });
  r = await owner("trener/admin/summary");
  assert.equal(r.status, 403, "a parent cannot open the support page");
  await admin("role", { email: `owner.${run}@example.com`, role: "admin" });
  r = await owner("trener/admin/summary");
  assert.ok(r.batches.some((b) => b.batch === `test-${run}` && b.total === 2 && b.used === 1));
  r = await owner(`trener/admin/key?code=${code}`);
  assert.equal(r.devices.length, 3);
  r = await owner("trener/admin/key", { code, action: "free" });
  assert.equal(r.devices.length, 0);
  r = await owner("trener/admin/key", { code: other, action: "disable" });
  assert.equal(r.key.disabled, true);
  r = await t("trener/open", { code: other, device: dev(1) });
  assert.equal(r.error, "disabled");
  r = await owner("trener/admin/codes", { count: 3, batch: `stickers-${run}` });
  assert.equal(r.codes.length, 3);
  r = await owner(`trener/admin/batch?batch=stickers-${run}&unused=1`);
  assert.equal(r.codes.length, 3);

  // Time-limited access: 12 months from the first opening; a fixed end date in the past opens at the free level Старт.
  r = await owner("trener/admin/codes", { count: 1, batch: `year-${run}`, months: 12 });
  const year = r.codes[0];
  r = await t("trener/open", { code: year, device: dev(7) });
  const days = (new Date(r.expiresAt) - Date.now()) / 86_400_000;
  assert.ok(days > 360 && days < 370, "expires about a year after the first opening");
  r = await owner("trener/admin/codes", { count: 1, batch: `old-${run}`, validUntil: "2026-01-31" });
  const old = r.codes[0];
  r = await t("trener/open", { code: old, device: dev(8) });
  assert.equal(r.access.tier, "start", "an ended term is not locked: the code is at Старт");
  assert.equal(r.access.expired, true);
  r = await owner("trener/admin/key", { code: old, action: "extend", months: 12 });
  r = await t("trener/open", { code: old, device: dev(8) });
  assert.ok(new Date(r.expiresAt) > new Date(Date.now() + 360 * 86400e3), "extended by the owner");
  assert.equal(r.access.tier, "full", "and full again");

  // Renewal codes: bought for 1, 6 or 12 months, entered on a device of the family, used once.
  r = await owner("trener/admin/codes", { count: 2, batch: `renew-${run}`, kind: "renew", months: 6 });
  const [ren1, ren2] = r.codes;
  r = await t("trener/open", { code: ren1, device: dev(9) });
  assert.equal(r.error, "renew_code", "a renewal code does not open the trainer by itself");
  const before = new Date((await t("trener/open", { code: year, device: dev(7) })).expiresAt);
  r = await t("trener/renew", { code: year, device: dev(9), renew: ren1 });
  assert.equal(r.error, "device_removed", "only a registered device can renew");
  r = await t("trener/renew", { code: year, device: dev(7), renew: ren1 });
  const added = (new Date(r.expiresAt) - before) / 86_400_000;
  assert.ok(added > 180 && added < 186, "six months are added to the end date");
  r = await t("trener/renew", { code: year, device: dev(7), renew: ren1 });
  assert.equal(r.error, "used", "a renewal code works once");
  r = await t("trener/renew", { code: year, device: dev(7), renew: other.replace("-", "") });
  assert.ok(r.status >= 400, "an access code is not a renewal code");
  r = await owner(`trener/admin/key?code=${ren1}`);
  assert.equal(r.key.usedFor, year);
  await t("trener/open", { code, device: dev(1) });
  r = await t("trener/renew", { code, device: dev(1), renew: ren2 });
  assert.equal(r.error, "unlimited", "a code without an end date needs no renewal");

  // Passing a code around: a code takes its 3 places plus 3 changes in 30 days, then no more new devices.
  r = await owner("trener/admin/codes", { count: 1, batch: `swap-${run}` });
  const swap = r.codes[0];
  const sw = (n) => `${n}`.padStart(2, "0").repeat(24).replace(/^../, "ab");
  for (let i = 0; i < 6; i++) {
    r = await t("trener/open", { code: swap, device: sw(i) });
    assert.ok(r.devices, `device ${i + 1} gets in`);
    if (r.devices.length === 3) await t("trener/forget", { code: swap, device: sw(i), target: r.devices[0].id });
  }
  r = await t("trener/open", { code: swap, device: sw(6) });
  assert.equal(r.error, "too_many_devices", "the 7th new device in a month is refused");
  r = await owner(`trener/admin/key?code=${swap}`);
  assert.equal(r.key.adds30, 6);
  r = await owner("trener/admin/key", { code: swap, action: "free" });
  r = await t("trener/open", { code: swap, device: sw(6) });
  assert.ok(r.devices, "freeing the devices on the support page starts the count again");

  // Every copy of the questions carries its code's invisible fingerprint; a leaked text leads back to the code.
  const whyText = r.bank.questions.map((x) => x.why || "").join("\n");
  assert.ok(/\u2060[\u200b\u200c]{32}\u2060/.test(whyText), "the explanations carry the fingerprint");
  const trace = await admin("trener-trace", { text: whyText });
  assert.deepEqual(trace.codes.map((c) => c.code), [swap]);
});

test("signals about problems: errors and task reports, counted, nobody identified", async () => {
  const send = (data) => fetch(`${BASE}/api/report`, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile" }, body: JSON.stringify(data) });
  const msg = `TypeError: x is undefined ${run}`;
  for (let i = 0; i < 3; i++) assert.equal((await send({ kind: "error", message: msg, page: "/t/", ref: "module:m1:q1", version: "test", detail: "trener.js:10:5" })).status, 204);
  await send({ kind: "task", ref: `q-${run}`, note: "Грешен отговор: пиши ми на test@example.com или 0888 123 456", version: "test" });
  assert.equal((await send({ kind: "nonsense", message: "x" })).status, 204, "bad signals are dropped quietly");
  let r = await admin("reports");
  const err = r.reports.find((x) => x.message === msg);
  assert.ok(err, "the error is listed");
  assert.equal(err.count, 3, "the same error is one line with a count");
  assert.equal(err.device, "Android · Chrome");
  const task = r.reports.find((x) => x.ref === `q-${run}`);
  assert.ok(task && !/test@example|0888/.test(task.note), "e-mails and phone numbers are removed from the note");
  assert.ok(!r.reports.some((x) => x.message === "x"));
  assert.ok(!("ip" in err) && !("code" in err), "nothing says who it was");
  r = await admin("report", { id: err.id, status: "fixed" });
  assert.equal(r.status, "fixed");
  r = await admin("reports");
  assert.ok(!r.reports.some((x) => x.id === err.id), "a fixed signal leaves the list");
  await send({ kind: "error", message: msg, page: "/t/", ref: "module:m1:q1", version: "test" });
  r = await admin("reports");
  assert.equal(r.reports.find((x) => x.message === msg)?.count, 1, "if it happens again after the fix, it is a new line");
});

test("levels of access, the free trial and paying (practice payment and a signed Stripe webhook)", async () => {
  const { createHmac } = await import("node:crypto");
  const t = client();
  const dev = (n) => `${n}`.padStart(2, "0").repeat(24).replace(/^../, "cd");
  const open = async (code, n = 1) => t("trener/open", { code, device: dev(n) });
  // A bank with all kinds of modules, so the levels can be seen.
  const mods = ["chetene:read", "pravopis:lang", "glagol:lang", "lit1:lit", "lit2:lit", "karti1:cards", "mk-4:math", "mk-12:math"].map((x) => ({ id: x.split(":")[0], area: x.split(":")[1], title: x, desc: "" }));
  const questions = [];
  for (const m of mods) for (let i = 0; i < 3; i++) questions.push({ id: `${m.id}-${i}`, m: m.id, t: "mc", q: `Въпрос ${i}`, o: ["а", "б"], a: 0, why: "Обяснение, което е достатъчно дълго за водния знак." });
  const cards = [4, 12].map((n) => ({ n, title: `Карта ${n}`, sec: "num", front: [{ html: "<p>лице на картата, достатъчно дълго за знака</p>" }], back: [] }));
  await admin("trener-bank", { passages: {}, questions, modules: mods, dossiers: { title: "Д", dossiers: [{ id: "d01", no: 1 }] }, math: { title: "М", sections: [{ id: "num", t: "Числа" }], index: cards.map((c) => ({ n: c.n, title: c.title, sec: "num" })), cards } });

  // Старт: one module of each NVO part and the first math cards; the rest comes only as titles.
  let r = await admin("trener-codes", { count: 1, batch: `start-${run}`, tier: "start" });
  r = await open(r.codes[0]);
  assert.equal(r.access.tier, "start");
  assert.deepEqual(r.bank.modules.map((m) => m.id).sort(), ["chetene", "lit1", "mk-4", "pravopis"]);
  assert.ok(!r.bank.questions.some((q) => ["glagol", "lit2", "karti1", "mk-12"].includes(q.m)), "locked tasks never reach the browser");
  assert.deepEqual(r.bank.locked.modules.map((m) => m.id).sort(), ["glagol", "karti1", "lit2", "mk-12"]);
  assert.deepEqual(r.bank.locked.math, [12]);
  assert.equal(r.bank.locked.mock, true);
  assert.equal(r.bank.dossiers, null);

  // Стандарт математика: only math.
  r = await admin("trener-codes", { count: 1, batch: `std-${run}`, tier: "std", subject: "math", months: 1 });
  const stdCode = r.codes[0];
  r = await open(stdCode);
  assert.equal(r.access.tier, "std");
  assert.ok(r.bank.modules.every((m) => m.area === "math") && r.bank.modules.length === 2);
  // A cached bank is per level: the same level sends nothing new.
  const again = await t("trener/open", { code: stdCode, device: dev(1), have: r.bankId });
  assert.equal(again.bank, undefined);

  // A term that ended: not locked, back to Старт with the grades.
  r = await admin("trener-codes", { count: 1, batch: `old-${run}`, validUntil: "2020-01-31" });
  const oldCode = r.codes[0];
  r = await open(oldCode);
  assert.equal(r.status, 200);
  assert.equal(r.access.tier, "start");
  assert.equal(r.access.expired, true);

  // The free trial: a full code at once (the launch setting: 1 month).
  await admin("trial", { open: true, months: 1, daily: 1000 });
  r = await t("pay/trial", {});
  assert.match(r.code, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  assert.match(r.link, /\/t\/\?k=/);
  const trialOpen = await open(r.code, 3);
  assert.equal(trialOpen.access.tier, "full");
  assert.ok(new Date(trialOpen.expiresAt) > new Date(Date.now() + 27 * 86400e3));
  r = await admin("trial", { open: false });
  r = await t("pay/trial", {});
  assert.equal(r.error, "trial_closed");
  await admin("trial", { open: true, months: 1, daily: 1000 });

  // Plans and paying (practice payment: PAY_FAKE=1 on the local server).
  await admin("plans", { plans: [{ id: `full-${run}`, title: "Пълен – 1 месец", tier: "full", months: 1, price: 9 }, { id: `std-${run}`, title: "Стандарт БЕЛ – 1 месец", tier: "std", subject: "bel", months: 1, price: 6 }] });
  r = await t(`pay/plans?k=${oldCode}`);
  assert.equal(r.code.expired, true);
  // edubel.bg reads the plans too (its buttons switch to paying here): open to other sites, no cookies.
  const cors = await fetch(`${BASE}/api/pay/plans`, { headers: { origin: "https://edubel.bg" } });
  assert.equal(cors.headers.get("access-control-allow-origin"), "*");
  assert.ok(r.plans.some((p) => p.id === `full-${run}`) && r.payments);
  r = await t("pay/checkout", { plan: `full-${run}` });
  assert.equal(r.error, "agree", "the parent agrees to the terms first");
  r = await t("pay/checkout", { plan: `full-${run}`, code: oldCode, agree: true });
  const session = new URL(r.url).searchParams.get("fake");
  assert.ok(session);
  r = await t(`pay/status?s=${session}`);
  assert.equal(r.status, "open");
  await t("pay/fake-pay", { session });
  r = await t(`pay/status?s=${session}`);
  assert.equal(r.status, "paid");
  assert.equal(r.renewed, true);
  r = await open(oldCode);
  assert.equal(r.access.tier, "full", "the expired code is full again");
  assert.ok(new Date(r.expiresAt) > new Date(Date.now() + 27 * 86400e3));
  // A lower level while a higher one runs is refused.
  r = await t("pay/checkout", { plan: `std-${run}`, code: oldCode, agree: true });
  assert.equal(r.error, "lower");
  // Two subjects bought one by one make Пълен.
  r = await t("pay/checkout", { plan: `std-${run}`, code: stdCode, agree: true });
  await t("pay/fake-pay", { session: new URL(r.url).searchParams.get("fake") });
  r = await open(stdCode);
  assert.equal(r.access.tier, "full");

  // A new code bought with a card, confirmed by a webhook signed like Stripe's; an unsigned one is refused.
  r = await t("pay/checkout", { plan: `std-${run}`, agree: true });
  const s2 = new URL(r.url).searchParams.get("fake");
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: s2, payment_status: "paid", customer_details: { email: "parent@example.com" } } } });
  const hook = (sig) => fetch(`${BASE}/api/pay/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: payload });
  assert.equal((await hook("t=1,v1=00")).status, 400, "an unsigned webhook is refused");
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_local_test_secret").update(`${ts}.${payload}`).digest("hex");
  assert.equal((await hook(`t=${ts},v1=${sig}`)).status, 200);
  assert.equal((await hook(`t=${ts},v1=${sig}`)).status, 200, "the same event twice is harmless");
  r = await t(`pay/status?s=${s2}`);
  assert.equal(r.status, "paid");
  assert.equal(r.renewed, false);
  r = await open(r.code);
  assert.equal(r.access.tier, "std");
  assert.equal(r.access.subject, "bel");
  const pays = await admin("payments");
  assert.equal(pays.payments.find((p) => p.session === s2).email, "parent@example.com");
});

test("demo in one tap, a code typed in Cyrillic, the code of a card payment chosen before paying", async () => {
  const t = client();
  const dev = (n) => `${n}`.padStart(2, "0").repeat(24).replace(/^../, "ef");
  const fmt = (c) => `${c.slice(0, 5)}-${c.slice(5)}`;

  // With the free trial closed, the demo is the free level Старт (no term) – the trainer still opens at once.
  await admin("trial", { open: false });
  let r = await t("pay/demo", {});
  assert.equal(r.status, 200);
  assert.equal(r.tier, "start");
  assert.match(r.link, /\/t\/\?k=[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  r = await t("trener/open", { code: r.code, device: dev(1) });
  assert.equal(r.access.tier, "start");
  assert.equal(r.access.trial, true, "the board knows it is a demo");
  assert.equal(r.expiresAt, null);
  // With the trial open, the demo is the trial while this address has trials left today (3), then Старт.
  await admin("trial", { open: true, days: 7, daily: 1000 });
  r = await t("pay/demo", {});
  assert.ok(["full", "start"].includes(r.tier));
  if (r.tier === "full") {
    assert.equal(r.days, 7);
    const o = await t("trener/open", { code: r.code, device: dev(2) });
    assert.equal(o.access.tier, "full");
    assert.equal(o.access.trial, true);
    assert.ok(new Date(o.expiresAt) > new Date(Date.now() + 6 * 86400e3));
  }
  await admin("trial", { open: true, months: 1, daily: 1000 });

  // A code typed on a Bulgarian keyboard: Cyrillic letters that look like Latin ones count as those.
  const made = await admin("trener-codes", { count: 1, batch: `cyr-${run}` });
  const code = made.codes[0].replace(/-/g, "");
  const LOOK = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", P: "Р", C: "С", T: "Т", X: "Х", Y: "У" };
  const typed = code.replace(/[ABEKMHPCTXY]/g, (c) => LOOK[c]).toLowerCase();
  r = await t("trener/open", { code: typed, device: dev(3) });
  assert.equal(r.status, 200);
  assert.equal(r.code, fmt(code));

  // A new code bought with a card is chosen before paying (it is in the receipt) and works only after the payment.
  await admin("plans", { plans: [{ id: `full12-${run}`, title: "Пълен – 12 месеца", tier: "full", months: 12, price: 39.9 }] });
  r = await t("pay/checkout", { plan: `full12-${run}`, agree: true });
  const session = new URL(r.url).searchParams.get("fake");
  const pay = (await admin("payments")).payments.find((p) => p.session === session);
  assert.match(pay.code, /^[A-Z0-9]{10}$/, "the code is chosen at the start");
  assert.equal(pay.status, "open");
  r = await t("trener/open", { code: pay.code, device: dev(4) });
  assert.equal(r.status, 404, "not before the payment");
  await t("pay/fake-pay", { session });
  r = await t(`pay/status?s=${session}`);
  assert.equal(r.status, "paid");
  assert.equal(r.code, fmt(pay.code), "the code in the receipt is the code that works");
  r = await t("trener/open", { code: pay.code, device: dev(4) });
  assert.equal(r.access.tier, "full");
  assert.equal(r.access.trial, false);
});

test("math tasks like on the NVO: added on top of the bank, the first module free in Старт", async () => {
  const t = client();
  const before = await admin("trener-bank");
  assert.ok(before.questions.length > 0);
  const mods = [{ id: "mz-chisla", area: "math", sec: "num", title: "Числа и действия", desc: "" }, { id: "mz-geometria", area: "math", sec: "geo", title: "Геометрия", desc: "" }];
  const questions = mods.flatMap((m) => [1, 2, 3].map((i) => ({ id: `${m.id}-0${i}`, m: m.id, t: "input", h: 1, q: `Колко е 2 · ${i}?`, a: [String(2 * i)], num: [2 * i], why: "Обяснение, което е достатъчно дълго за водния знак." })));
  let r = await admin("trener-bank-add", { modules: mods, questions });
  assert.equal(r.ok, true);
  const after = await admin("trener-bank");
  assert.equal(after.questions.length, before.questions.length + 6);
  assert.ok(before.modules.every((m) => after.modules.some((x) => x.id === m.id)), "nothing else is lost");
  assert.deepEqual(after.math, before.math);
  // Again with fewer tasks: the module is replaced, not doubled.
  await admin("trener-bank-add", { modules: mods, questions: questions.slice(0, 4) });
  assert.equal((await admin("trener-bank")).questions.length, before.questions.length + 4);
  r = await admin("trener-bank-add", { modules: mods.slice(0, 1), questions });
  assert.equal(r.error, "bank", "a task of a module that is not in the list is refused");

  // Старт: the first math module is open, the others come only as locked titles; the cards are as before.
  const c = await admin("trener-codes", { count: 1, batch: `mz-${run}`, tier: "start" });
  const o = await t("trener/open", { code: c.codes[0], device: "ab".repeat(24) });
  const ids = o.bank.modules.map((m) => m.id);
  assert.ok(ids.includes("mz-chisla") && ids.includes("mk-4"));
  assert.ok(!ids.includes("mz-geometria") && !ids.includes("mk-12"));
  assert.ok(o.bank.locked.modules.some((m) => m.id === "mz-geometria"));
  assert.ok(!o.bank.questions.some((q) => q.m === "mz-geometria"), "locked tasks never reach the browser");
});

test("draft modules reach only the review codes until the teacher approves them", async () => {
  const t = client();
  const mods = [{ id: "mz-danni", area: "math", sec: "dat", title: "Данни и вероятности", desc: "", draft: true }];
  const questions = [1, 2, 3].map((i) => ({ id: `mz-danni-0${i}`, m: "mz-danni", t: "input", h: 1, q: `Колко е 3 · ${i}?`, a: [String(3 * i)], num: [3 * i], why: "Обяснение, което е достатъчно дълго за водния знак." }));
  assert.equal((await admin("trener-bank-add", { modules: mods, questions })).ok, true);
  const pupil = (await admin("trener-codes", { count: 1, batch: `draft-${run}` })).codes[0];
  const teacher = (await admin("trener-codes", { count: 1, batch: `преглед-${run}` })).codes[0];
  let r = await t("trener/open", { code: pupil, device: "cd".repeat(24) });
  assert.ok(!r.bank.modules.some((m) => m.id === "mz-danni") && !r.bank.questions.some((q) => q.m === "mz-danni"), "a pupil does not see a draft");
  r = await t("trener/open", { code: teacher, device: "ce".repeat(24) });
  assert.ok(r.bank.modules.some((m) => m.id === "mz-danni" && m.draft), "the teacher sees it, marked as a draft");
  assert.match(r.bankId, /\.r$/, "the teacher's copy is cached apart");
  r = await admin("trener-bank-approve", { ids: ["mz-danni"] });
  assert.deepEqual(r.approved, ["mz-danni"]);
  r = await t("trener/open", { code: pupil, device: "cd".repeat(24) });
  assert.ok(r.bank.modules.some((m) => m.id === "mz-danni" && !m.draft), "after approval everybody sees it");
});

test("an invitation link: every device gets its own code with everything and no term, until it is switched off", async () => {
  const t = client();
  const inv = await admin("invites", { batch: `приятели-${run}`, note: "тест" });
  assert.match(inv.link, /\/i\/[\w-]{10,}$/);
  const token = inv.link.split("/i/")[1];
  const a = await t("pay/invite", { token });
  const b = await t("pay/invite", { token });
  assert.equal(a.status, 200);
  assert.notEqual(a.code, b.code, "each person gets a gradebook of their own");
  let r = await t("trener/open", { code: a.code, device: "ba".repeat(24) });
  assert.equal(r.access.tier, "full");
  assert.equal(r.expiresAt, null, "no term");
  assert.equal(r.access.trial, false);
  const list = (await admin("invites")).invites.find((x) => x.batch === inv.batch);
  assert.equal(list.count, 2);
  assert.ok(!("hash" in list), "the token's hash is not shown");
  assert.equal((await t("pay/invite", { token: "wrong-token-123" })).status, 404);
  await admin("invites", { batch: inv.batch, off: true });
  assert.equal((await t("pay/invite", { token })).error, "invite_off");
  r = await t("trener/open", { code: a.code, device: "ba".repeat(24) });
  assert.equal(r.status, 200, "codes already given keep working");
  // With drafts: the batch is a review batch, so the teacher's drafts show too.
  const d = await admin("invites", { batch: `тест-чернови-${run}`, drafts: true });
  assert.match(d.batch, /^преглед-/);
});
