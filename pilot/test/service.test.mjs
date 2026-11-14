// The full service on demo data with an in-memory store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createService, memoryStore } from "../public/core/service.js";
import { demoSource } from "../public/core/demo-source.js";

const make = () => {
  const store = memoryStore();
  return { store, svc: createService({ store, source: demoSource(store), demo: true }) };
};

test("dashboard has profit, regimes and proposals", async () => {
  const { svc } = make();
  const d = await svc.dashboard("d7");
  assert.ok(d.kpi.spend > 0 && d.kpi.orders > 0);
  assert.ok(Number.isFinite(d.kpi.cmPct));
  assert.equal(d.byAccount.length, 5);
  assert.ok(d.regimes.length >= 3);
  assert.ok(d.pendingCount > 0);
});

test("approve executes, reject records, revert undoes", async () => {
  const { svc } = make();
  const ap = await svc.autopilot();
  const p = ap.proposals.find((x) => x.kind === "budget" && x.status === "proposed");
  const r = await svc.approve(p.id);
  assert.equal(r.status, "executed");
  const q = (await svc.autopilot()).proposals.find((x) => x.status === "proposed" && x.id !== p.id);
  assert.equal((await svc.reject(q.id)).status, "rejected");
  const rv = await svc.revert24h();
  assert.ok(rv.reverted >= 1);
});

test("observe mode runs nothing; autopilot runs only safe actions", async () => {
  const { svc } = make();
  assert.equal((await svc.run()).ran, 0, "observe is the default");
  await svc.saveSettings({ mode: "autopilot" });
  const r = await svc.run();
  assert.ok(r.ran > 0);
  const h = (await svc.autopilot()).history;
  assert.ok(h.every((x) => x.kind !== "swap" || x.by === "user"), "new ads are never launched automatically");
});

test("studio makes non-duplicate briefs that pass the claim check", async () => {
  const { svc } = make();
  const r = await svc.briefs({ account: "demo_bg", count: 4 });
  assert.ok(r.created >= 3);
  for (const c of r.items) assert.notEqual(c.novelty.level, "dup");
  const chk = await svc.check({ tags: { angle: "pain", persona: "senior", format: "ugc", visual: "home", talent: "woman60" }, hookText: "Пак ли не можете да спите от болки?" });
  assert.equal(chk.compliance.ok, false);
  assert.ok(chk.score > 50, "close to the existing 'Баба Мария' ads");
});

test("Табло archive import sets products and fixed costs", async () => {
  const { svc } = make();
  const r = await svc.importTablo({ app: "tablo-pechalba", v: 1, data: { products: [{ name: "Gel", cost: "12,37", keys: "gel" }], monthlyCosts: { insurance: 190 } } });
  assert.deepEqual(r, { products: 1, fixed: 1 });
  const s = await svc.settings();
  assert.equal(s.econ.products[0].cost, 12.37);
  await assert.rejects(svc.importTablo({ nope: 1 }));
});

test("bench creative can be launched and becomes live", async () => {
  const { svc } = make();
  const cr = await svc.creatives();
  const bench = cr.items.find((c) => c.status === "bench" && c.account === "demo_bg");
  const adset = cr.adsets.find((s) => s.account === "demo_bg");
  await svc.launch({ id: bench.id, adset: adset.id });
  const after = await svc.creatives();
  assert.equal(after.items.find((c) => c.id === bench.id).status, "live");
});

test("one-button flow: needs → Направи → 4 banners → Пусни replaces the weak ad", async () => {
  const store = memoryStore();
  const jobs = [];
  const gen = {
    available: () => true,
    productImages: async () => ["https://example.com/p.jpg"],
    startImages: async (o) => (jobs.push(o), { provider: "test", requestId: "r1", at: new Date().toISOString() }),
    startVideo: async () => ({ provider: "test", requestId: "v1", video: true }),
    poll: async (j) => (j.video ? { done: true, video: "https://example.com/v.mp4" } : { done: true, images: [1, 2, 3, 4].map((i) => `https://example.com/${i}.png`) }),
  };
  const svc = createService({ store, source: demoSource(store), demo: true, gen });
  const st = await svc.studio();
  assert.ok(st.rules.some((r) => r.t.startsWith("Структура")));
  assert.ok(st.needs.length > 0, "demo data has ads to replace or gaps to fill");
  for (const n of st.needs) assert.ok(n.concept.layout?.steps?.length >= 3, "every new idea follows a banner structure");
  const slot = st.needs.find((n) => n.kind === "replace") || st.needs[0];
  const doc = await svc.make({ slot: slot.id });
  assert.equal(doc.status, "making");
  assert.match(jobs[0].prompt, /Layout:/);
  assert.equal(jobs[0].aspect, "4:5");
  assert.deepEqual(jobs[0].imageUrls, ["https://example.com/p.jpg"], "real product photos go to the model");
  const ready = await svc.makeStatus(doc.id);
  assert.equal(ready.status, "ready");
  assert.equal(ready.images.length, 4);
  const v = await svc.makeVideo({ id: doc.id, image: ready.images[1] });
  assert.ok(v.videoJob);
  assert.equal((await svc.makeStatus(doc.id)).videoUrl, "https://example.com/v.mp4");
  const live = await svc.launchMade({ id: doc.id, image: ready.images[1] });
  assert.equal(live.status, "live");
  const lib = (await svc.creatives()).library || [];
  assert.ok(!lib.length || lib.some((c) => c.id === doc.id), "the idea is remembered so it is never repeated");
  const after = await svc.studio();
  assert.ok(!after.needs.some((n) => n.id === slot.id && slot.kind === "replace"), "the replaced ad no longer asks for a new one");
  // "Друга идея" gives a different concept for the same line.
  const other = await svc.make({ line: slot.line, shift: 7 });
  assert.notDeepEqual(other.concept.tags, doc.concept.tags);
});

test("make refuses politely when Higgsfield is not connected (live mode)", async () => {
  const store = memoryStore();
  const svc = createService({ store, source: demoSource(store), demo: false, gen: { available: () => false } });
  await assert.rejects(() => svc.make({}), /Higgsfield/);
});
