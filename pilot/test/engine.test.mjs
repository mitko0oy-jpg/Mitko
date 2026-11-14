// Unit tests for the shared engine (no network, no database).
import { test } from "node:test";
import assert from "node:assert/strict";
import { profit, thresholds, deliveryRates, calibration, spendCurve } from "../public/core/metrics.js";
import { similarity, clusters, diversity, sameConcept, checkNew } from "../public/core/diversity.js";
import { lint } from "../public/core/compliance.js";
import { evaluate, autoRuns } from "../public/core/rules.js";
import { regimeFor, cusum } from "../public/core/regime.js";
import { calendar } from "../public/core/calendar.js";
import { fatigue, benchPlan } from "../public/core/fatigue.js";
import { judge, ruleTrust, nextBriefs } from "../public/core/learning.js";
import { addDays } from "../public/core/util.js";

const econ = { marginFloor: 0.25, marginTarget: 0.3, defaultCogsPct: 0.3, products: [{ name: "Gel", keys: "gel", cost: 6 }] };
const acct = { a: { country: "BG", vat: 0.2, courier: 4, codFeePct: 0.01, returnCost: 3 } };
const order = (status, shipped, date = "2026-10-01") => ({ account: "a", date, status, shipped, total: 34.4, items: [{ product: "Care Gel", qty: 1, total: 29.9 }] });

test("profit uses net revenue and only expected cash", () => {
  const rates = { a: { confirm: 0.9, deliver: 0.9 } };
  const p = profit({ orders: [order("c", 1), order("x", 0)], spend: 10, accts: acct, econ, rates });
  assert.equal(p.orders, 2);
  assert.ok(Math.abs(p.net - 34.4 / 1.2) < 0.01, "cancelled order brings no revenue, VAT removed");
  assert.ok(p.cm < p.net - 6 - 10, "courier and fees are costs");
  const th = thresholds(p, econ, 0.2);
  assert.ok(th.maxCpaBreakEven > th.maxCpaFloor && th.maxCpaFloor > th.maxCpaTarget, "stricter margin → lower allowed CPA");
  assert.ok(th.targetRoas > th.beRoas);
});

test("delivery rates shrink towards priors with little history", () => {
  const r = deliveryRates([order("x", 1, "2026-09-01")], "2026-11-14");
  assert.ok(r.deliver > 0.8, "one refusal does not make delivery 0%");
  assert.ok(calibration(0, 0) === 1);
});

test("spend curve finds a finite max profitable spend", () => {
  const pts = [20, 30, 40, 60, 80, 100, 130, 160].map((s) => ({ spend: s, orders: 0.8 * Math.pow(s, 0.7) }));
  const c = spendCurve(pts, 18, 8);
  assert.ok(c && Math.abs(c.b - 0.7) < 0.05);
  assert.ok(c.sStar > 0 && c.sStar <= c.sProfit);
  assert.equal(spendCurve(pts.map((p) => ({ ...p, spend: 50 })), 18, 8), null, "no spend variation → no answer");
});

const T = (o) => ({ angle: "pain", persona: "senior", format: "ugc", hook: "problem", visual: "home", talent: "woman60", length: "m", aspect: "9x16", ...o });

test("Andromeda: copy-only variants are one concept, real changes are new", () => {
  const a = { id: "a", tags: T(), hookText: "Коленете ме боляха всяка сутрин" };
  const b = { id: "b", tags: T({ aspect: "4x5" }), hookText: "Всяка сутрин коленете ме боляха" };
  const c = { id: "c", tags: T({ angle: "gift", persona: "child", format: "skit", talent: "man35" }), hookText: "Подари на мама" };
  assert.ok(sameConcept(a, b));
  assert.ok(!sameConcept(a, c));
  assert.ok(similarity(a, b) > similarity(a, c));
  assert.equal(clusters([a, b, c]).length, 2);
  const d = diversity([a, b, c]);
  assert.equal(d.concepts, 2);
  assert.ok(d.issues.length > 0 && d.missing.length > 0);
  assert.equal(checkNew(b, [a]).verdict.level === "new", false);
});

test("claim linter blocks medical claims and personal attributes, requires AI label", () => {
  const bad = lint({ text: "Пак ли не можете да се наведете? Гелът лекува артрит." });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.code === "medical"));
  assert.ok(bad.issues.some((i) => i.code === "personal"));
  const good = lint({ text: "След дълъг ден – масаж с приятно затопляне." });
  assert.equal(good.ok, true);
  const ai = lint({ text: "Моят вечерен ритуал", talent: "woman60", isAiGenerated: true, angle: "social" });
  assert.ok(ai.issues.some((i) => i.code === "ai_label"));
  assert.ok(ai.issues.some((i) => i.code === "fake_testimonial"));
  assert.ok(lint({ text: "Tento gél lieči artritídu" }).issues.some((i) => i.code === "medical"));
});

function ctx(over = {}) {
  const th = { maxCpaTarget: 8, maxCpaFloor: 9, maxCpaBreakEven: 15, netPerOrder: 28, varPct: 0.45 };
  const h = { id: "c1", level: "campaign", name: "ADV+", account: "a", status: "ACTIVE", budget: 100, learning: "active", isTest: false, freq7: 1.6, m1: { spend: 30, orders: 5 }, m3: { spend: 300, orders: 50, cmPct: 0.4, cpo: 6 }, m7: { spend: 700, orders: 110, cmPct: 0.38, cpo: 6.3, metaPurchases: 90 } };
  return {
    now: Date.parse("2026-11-14T10:00:00Z"), today: "2026-11-14", hour: 10, settings: { mode: "autopilot", econ, limits: {}, rules: {} },
    holders: [h], ads: [], adsets: [], accounts: { a: { name: "BG", country: "BG", thresholds: th, spend7: 700, testShare: 0.2 } },
    regimes: { BG: { regime: "stable", posture: "normal", label: "Стабилен" } }, bench: {}, tracking: {}, mtd: { cmPct: 0.33 }, gate: { ok: true, reasons: [] }, trust: {},
    ...over,
  };
}

test("autopilot scales a clear winner within limits", () => {
  const p = evaluate(ctx()).find((x) => x.rule === "scale_winner");
  assert.ok(p, "proposal exists");
  assert.equal(p.from, 100);
  assert.ok(p.to > 100 && p.to <= 120);
  assert.ok(autoRuns(p, "autopilot"));
  assert.equal(autoRuns(p, "copilot"), false);
  assert.equal(autoRuns(p, "observe"), false);
});

test("autopilot never scales in a shock, and cuts losers", () => {
  const shock = evaluate(ctx({ regimes: { BG: { regime: "shock", posture: "hold", label: "Шок", reasons: [] } } }));
  assert.ok(!shock.some((x) => x.rule === "scale_winner"));
  const c = ctx();
  c.holders[0].m3 = { spend: 300, orders: 20, cmPct: -0.2, cpo: 15 };
  c.holders[0].m7 = { spend: 700, orders: 40, cmPct: -0.1, cpo: 17.5 };
  const out = evaluate(c);
  const cut = out.find((x) => x.rule === "cut");
  assert.ok(cut && cut.to === 70);
  assert.ok(out.some((x) => x.rule === "stop_propose" && x.risk === "high"));
});

test("stale data blocks any increase; cooldown is respected", () => {
  const out = evaluate(ctx({ gate: { ok: false, reasons: ["стари данни"] } }));
  assert.ok(out.filter((x) => x.kind === "budget" && x.to > x.from).every((x) => x.status === "blocked"));
  const c = ctx();
  c.holders[0].lastChange = "2026-11-13T10:00:00Z";
  assert.ok(!evaluate(c).some((x) => x.rule === "scale_winner"), "72 h cooldown after a change");
});

test("regime: a news shock is detected, plain noise is not", () => {
  const base = (i) => ({ date: addDays("2026-10-01", i), spend: 100, impressions: 30000, clicks: 450, orders: 12 + (i % 3), sessions: 400, attention: 1 + (i % 2) * 0.05, trend: 50 });
  const calm = Array.from({ length: 30 }, (_, i) => base(i));
  assert.equal(regimeFor(calm).regime, "stable");
  const shock = calm.map((d, i) => (i >= 27 ? { ...d, impressions: 22000, clicks: 270, orders: 7, attention: 4 } : d));
  assert.equal(regimeFor(shock).regime, "shock");
  assert.ok(cusum([...Array(20).fill(10), ...Array(10).fill(18)]));
});

test("calendar knows Easter and Black Friday", () => {
  const ev = calendar("2026-11-20", 200, ["BG", "SK"]);
  assert.ok(ev.some((e) => e.date === "2026-11-27" && e.name === "Черен петък"));
  assert.ok(ev.some((e) => e.country === "BG" && e.date === "2027-05-02" && e.name === "Великден"));
  assert.ok(ev.some((e) => e.country === "SK" && e.date === "2027-03-29"));
});

test("fatigue: a decaying ad burns, a new ad is still learning", () => {
  const rows = Array.from({ length: 28 }, (_, i) => {
    const f = Math.exp(-Math.max(0, i - 6) / 8);
    return { date: addDays("2026-10-10", i), spend: 40, impressions: 10000, reach: 10000 / (1.05 + i * 0.1), clicks: Math.round(200 * f), video3s: Math.round(3000 * f), purchases: Math.max(0, Math.round(6 * f)) };
  });
  const f = fatigue(rows, null, { cpaTarget: 8 });
  assert.ok(["tiring", "burned"].includes(f.stage), f.stage);
  assert.ok(f.flags.length >= 2);
  assert.equal(fatigue(rows.slice(0, 2)).stage, "learning");
  const plan = benchPlan([{ stage: "burned", spend: 50 }, { stage: "peak", spend: 40, daysLeft: 3 }, { stage: "peak", spend: 5 }], 1);
  assert.ok(plan.gap >= 3);
});

test("learning: outcomes update rule trust; briefs explore untested values", () => {
  const good = judge({ kind: "budget", from: 100, to: 115 }, { spend: 300, cm: 90 }, { spend: 345, cm: 100 }, { spend: 500, cm: 100 }, { spend: 500, cm: 100 });
  assert.equal(good.good, true);
  const t = ruleTrust([{ rule: "x", outcome: { good: true } }, { rule: "x", outcome: { good: false } }, { rule: "x", outcome: { good: true } }]);
  assert.equal(Math.round(t.x.trust * 100), 60);
  const b = nextBriefs([], "BG", 4, "seed");
  assert.equal(b.length, 4);
  assert.ok(new Set(b.map((x) => x.tags.angle)).size >= 3, "a batch is diverse");
});

test("real-data rules: per-order cost, wholesale, digital, HUF already in EUR", async () => {
  const { orderEconomics } = await import("../public/core/metrics.js");
  const { lineForCampaign, defaultLineFor } = await import("../public/core/lines.js");
  const econ2 = { defaultCogsPct: 0.3, products: [{ name: "Gel", keys: "care gel", cost: 12.37 }, { name: "Patches", keys: "пластири", cost: 5.9 }] };
  const a = { country: "BG", vat: 0.2, courier: 0, codFeePct: 0, returnCost: 3.5 };
  const rates = { confirm: 1, deliver: 1 };
  const one = orderEconomics({ status: "c", shipped: 1, total: 20.4, items: [{ product: "BeeVenom Care Gel", qty: 1, total: 15.9 }, { product: "Подарък пластири", qty: 1, total: 0 }] }, a, econ2, rates);
  assert.equal(Math.round(one.cogs * 100) / 100, 12.37, "gift adds nothing, cost counted once");
  const bulk = orderEconomics({ status: "c", shipped: 1, total: 140.9, items: [{ product: "BeeVenom Care Gel", qty: 30, total: 135 }] }, a, econ2, rates);
  assert.ok(bulk.cogs < 60, "30 units are not 30 order costs");
  const pdf = orderEconomics({ status: "c", shipped: 0, total: 9.9, items: [{ product: "PDF тест", qty: 1, total: 9.9 }] }, { ...a, courier: 4 }, econ2, rates);
  assert.equal(pdf.fulfil, 0, "digital orders have no courier");
  assert.equal(lineForCampaign("АBO | Карти за НВО | 02.10 | FM", "bv-bg"), "edubel");
  assert.equal(lineForCampaign("BeeVenom|Slovakia|21.09", "bv-bg"), "bv-sk");
  assert.equal(lineForCampaign("Тест | Студ и дъжд | 5€", "bv-bg"), "bv-bg");
  assert.equal(defaultLineFor("Словения"), "bv-si");
});
