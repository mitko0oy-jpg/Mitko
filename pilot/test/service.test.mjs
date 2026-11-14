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
