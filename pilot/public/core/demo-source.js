// Demo data source: the simulator + changes made in the app (kept in the store).
import { createSimulator, DEMO_PRODUCTS } from "./simulator.js";
import { addDays, todayStr } from "./util.js";

// A few past decisions so the learning screen has something to judge.
function seedActions(today) {
  const at = (d) => `${addDays(today, d)}T07:30:00.000Z`;
  return [
    { id: "seed1", rule: "scale_winner", kind: "budget", entity: { id: "demo_bg_c0", level: "campaign", name: "ADV+ Продажби | Гел | Широко", account: "demo_bg" }, from: 120, to: 140, title: "+17%: ADV+ Продажби | Гел | Широко", reason: "Марж над целта 7 дни.", status: "executed", by: "auto", executedAt: at(-12) },
    { id: "seed2", rule: "trim", kind: "budget", entity: { id: "demo_hu_c1_s0", level: "adset", name: "Látogatók 30n", account: "demo_hu" }, from: 13, to: 10, title: "−15%: Látogatók 30n", reason: "Марж под минимума.", status: "executed", by: "user", executedAt: at(-9) },
    { id: "seed3", rule: "kill_ad", kind: "pause", entity: { id: "demo_sk_c1_s0_a1", level: "ad", name: "Фитнес треньор – след тренировка", account: "demo_sk" }, title: "Спри: Фитнес треньор", reason: "Без поръчки.", status: "executed", by: "auto", executedAt: at(-8) },
    { id: "seed4", rule: "scale_winner", kind: "budget", entity: { id: "demo_si_c0", level: "campaign", name: "ADV+ Prodaja | Gel", account: "demo_si" }, from: 60, to: 70, title: "+17%: ADV+ Prodaja | Gel", reason: "Марж над целта.", status: "executed", by: "user", executedAt: at(-7) },
    { id: "seed5", rule: "cut", kind: "budget", entity: { id: "demo_bio_c0_s1", level: "adset", name: "Конски кестен – крака", account: "demo_bio" }, from: 20, to: 15, title: "−25%: Конски кестен – крака", reason: "Загуба 3 дни.", status: "executed", by: "auto", executedAt: at(-6) },
    { id: "seed6", rule: "scale_winner", kind: "budget", entity: { id: "demo_sk_c0", level: "campaign", name: "ADV+ Predaj | Gél", account: "demo_sk" }, from: 78, to: 90, title: "+15%: ADV+ Predaj | Gél", reason: "Марж над целта.", status: "executed", by: "auto", executedAt: at(-5) },
  ];
}

export function demoSource(store) {
  async function overrides() {
    return (await store.get("demo", "overrides")) || {};
  }
  async function ensureSeed(today) {
    if (await store.get("demo", "seeded")) return;
    const ov = {};
    for (const a of seedActions(today)) {
      await store.put("actions", a.id, a);
      const since = addDays(a.executedAt.slice(0, 10), 1);
      if (a.kind === "budget") ov[a.entity.id] = { budget: a.to, since, seedFrom: a.from };
      if (a.kind === "pause") ov[a.entity.id] = { status: "PAUSED", since };
    }
    await store.put("demo", "overrides", ov);
    await store.put("demo", "seeded", { at: today });
  }
  return {
    demoProducts: DEMO_PRODUCTS,
    async snapshot({ today, since, now }) {
      await ensureSeed(today);
      const ov = await overrides();
      const sim = createSimulator({ today, overrides: ov, now });
      // Seeded budget changes started from an older budget.
      for (const list of [sim.campaigns, sim.adsets]) for (const e of list) if (ov[e.id]?.seedFrom != null) e.origBudget = ov[e.id].seedFrom;
      const market = {};
      for (const c of ["BG", "SK", "SI", "HU"]) market[c] = sim.market(c, 60);
      return {
        accounts: sim.accounts,
        campaigns: sim.campaigns,
        adsets: sim.adsets,
        ads: sim.ads,
        creatives: sim.creatives.map(({ q, half, hook, ...c }) => c),
        insights: sim.insights(since, today),
        orders: sim.orders(since, today),
        sessions: sim.sessions(since, today),
        market,
        headlines: sim.headlines,
        competitors: sim.competitors(),
        gate: { ok: true, reasons: [] },
      };
    },
    async apply(op) {
      const ov = await overrides();
      if (op.op === "budget") ov[op.id] = { ...(ov[op.id] || {}), budget: op.value, since: op.since };
      if (op.op === "status") ov[op.id] = { ...(ov[op.id] || {}), status: op.value, since: op.since };
      if (op.op === "launch") (ov._launched ||= []).push({ id: `new_${op.creative}_${Date.now().toString(36)}`, creative: op.creative, adset: op.adset, since: op.since });
      await store.put("demo", "overrides", ov);
      return { ok: true };
    },
    async connections() {
      return { meta: "demo", sales: "demo", ai: "demo", video: "demo" };
    },
  };
}

export { todayStr };
