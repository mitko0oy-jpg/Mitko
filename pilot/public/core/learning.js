// Self-learning: every executed action is judged after a few days against the
// rest of the account (difference-in-differences), and each rule gets a trust
// score. Creative tags get Beta posteriors so the generator knows what to repeat
// (exploit) and what is still untested (explore) – Thompson sampling.
import { div, clamp, rng, betaSample, round } from "./util.js";
import { DIM, CONCEPT_DIMS, tagLabel } from "./taxonomy.js";

export const EVAL_DAYS = { budget: 3, pause: 2, swap: 4, activate: 3 };

// before/after: {spend, orders, cm} of the entity; ctrlBefore/ctrlAfter: same for the rest of the account.
export function judge(action, before, after, ctrlBefore, ctrlAfter) {
  const eff = (m) => div(m.cm, Math.max(1, m.spend)); // profit per euro
  const dEnt = eff(after) - eff(before);
  const dCtl = eff(ctrlAfter) - eff(ctrlBefore);
  const did = Number.isFinite(dEnt) && Number.isFinite(dCtl) ? dEnt - dCtl : dEnt;
  let good;
  if (action.kind === "budget" && action.to > action.from) {
    // A scale-up is good if extra money kept making profit (margin per euro did not collapse).
    good = Number.isFinite(after.cm) && after.cm > before.cm * 0.98 && did > -0.08;
  } else if (action.kind === "budget" || action.kind === "pause") {
    // A cut/pause is good if account profit did not suffer.
    good = Number.isFinite(ctrlAfter.cm) && ctrlAfter.cm + (after.cm || 0) >= (ctrlBefore.cm + (before.cm || 0)) * 0.95;
  } else {
    good = did >= 0;
  }
  return { good, did: round(did, 3), cmBefore: round(before.cm, 2), cmAfter: round(after.cm, 2) };
}

export function ruleTrust(evaluated) {
  const out = {};
  for (const a of evaluated) {
    const r = (out[a.rule] ||= { n: 0, good: 0 });
    r.n++;
    if (a.outcome?.good) r.good++;
  }
  for (const r of Object.values(out)) r.trust = (r.good + 1) / (r.n + 2); // Laplace
  return out;
}

// Tag performance: a creative "wins" if its profit per euro beat the account median.
export function tagStats(creatives) {
  const stats = {};
  for (const c of creatives) {
    if (c.result == null) continue;
    for (const k of CONCEPT_DIMS.concat(["hook"])) {
      const v = c.tags?.[k];
      if (!v) continue;
      const key = `${c.country || "ALL"}|${k}|${v}`;
      const s = (stats[key] ||= { country: c.country || "ALL", dim: k, value: v, a: 1, b: 1, n: 0, spend: 0 });
      s.n++;
      s.spend += c.spend || 0;
      if (c.result === "win") s.a++;
      else s.b++;
    }
  }
  return Object.values(stats).map((s) => ({ ...s, label: tagLabel(s.dim, s.value), rate: s.a / (s.a + s.b) }));
}

// Pick briefs: a mix of exploiting winners and exploring untested values.
export function nextBriefs(stats, country, count, seed = "x", avoid = []) {
  const r = rng(`${seed}|${country}`);
  const briefs = [];
  for (let i = 0; i < count; i++) {
    const b = { tags: {}, why: [] };
    for (const k of ["angle", "persona", "format", "visual", "talent", "hook"]) {
      let best = null, bestDraw = -1;
      for (const v of Object.keys(DIM[k].values)) {
        if (k === "talent" && v === "ai") continue;
        const s = stats.find((x) => x.country === country && x.dim === k && x.value === v) || { a: 1, b: 1, n: 0 };
        // Already used in this batch → lower its chance to keep the batch diverse.
        const used = briefs.filter((x) => x.tags[k] === v).length;
        const draw = betaSample(r, s.a, s.b) * Math.pow(0.55, used);
        if (draw > bestDraw) {
          bestDraw = draw;
          best = { v, s };
        }
      }
      b.tags[k] = best.v;
      if (best.s.n === 0) b.why.push(`${DIM[k].label}: „${tagLabel(k, best.v)}“ още не е тестван`);
      else if (best.s.a / (best.s.a + best.s.b) > 0.55) b.why.push(`${DIM[k].label}: „${tagLabel(k, best.v)}“ печели ${Math.round((best.s.a / (best.s.a + best.s.b)) * 100)}%`);
    }
    if (avoid.some((t) => CONCEPT_DIMS.every((k) => t[k] === b.tags[k]))) {
      i--;
      if (briefs.length > count * 5) break;
      continue;
    }
    briefs.push(b);
  }
  return briefs;
}

export function insightsText(stats, country) {
  const s = stats.filter((x) => x.country === country && x.n >= 2);
  const top = [...s].sort((a, b) => b.rate - a.rate).slice(0, 3);
  const bottom = [...s].sort((a, b) => a.rate - b.rate).slice(0, 2);
  return {
    top: top.map((x) => `${DIM[x.dim].label}: ${x.label} (${Math.round(x.rate * 100)}% победи, ${x.n} реклами)`),
    bottom: bottom.map((x) => `${DIM[x.dim].label}: ${x.label} (${Math.round(x.rate * 100)}%)`),
  };
}

export const clampTrust = (t) => clamp(t, 0, 1);
