// Creative fatigue: how "tired" an ad is and how many days it has left.
// Signals: CTR falling from its peak, CPM rising faster than the account
// (the auction stops liking it), hook rate dropping, frequency climbing, CPA rising.
import { sum, div, clamp, slope, mean } from "./util.js";

export const STAGES = {
  learning: { label: "Учи се", tone: "info" },
  rising: { label: "Расте", tone: "good" },
  peak: { label: "Във форма", tone: "good" },
  tiring: { label: "Уморява се", tone: "warn" },
  burned: { label: "Изгоряла", tone: "bad" },
  idle: { label: "Без показвания", tone: "muted" },
};

function windowStats(rows) {
  const impr = sum(rows, (r) => r.impressions);
  return {
    impr,
    spend: sum(rows, (r) => r.spend),
    ctr: div(sum(rows, (r) => r.clicks), impr),
    cpm: div(sum(rows, (r) => r.spend) * 1000, impr),
    hook: div(sum(rows, (r) => r.video3s), impr),
    cpa: div(sum(rows, (r) => r.spend), sum(rows, (r) => r.purchases)),
    freq: div(impr, sum(rows, (r) => r.reach)),
  };
}

// rows: daily rows of ONE ad, sorted by date ascending.
// acctCpm: { first, last } CPM of the whole account over the same windows (market correction).
// opts.cpaTarget: allowed cost per Meta purchase; no verdict before 7 days or 2× that spend (Meta practice).
export function fatigue(rows, acctCpm = null, opts = {}) {
  const active = rows.filter((r) => r.impressions > 0);
  if (!active.length) return { stage: "idle", score: 0, daysLeft: null, signals: {} };
  const age = active.length;
  const totalImpr = sum(active, (r) => r.impressions);
  const win = (i) => windowStats(active.slice(Math.max(0, i - 2), i + 1));
  const windows = active.map((_, i) => win(i)).slice(2);
  const cur = win(active.length - 1);
  const totalSpend = sum(active, (r) => r.spend);
  const young = age < 7 && !(opts.cpaTarget && totalSpend >= 2 * opts.cpaTarget);
  if (age < 3 || totalImpr < 1500 || young || !windows.length) {
    return { stage: "learning", score: 0, daysLeft: null, age, signals: { ctr: cur.ctr, cpm: cur.cpm, hook: cur.hook, freq: cur.freq } };
  }
  const first = windows[0];
  const peakCtr = Math.max(...windows.map((w) => w.ctr || 0));
  const bestCpa = Math.min(...windows.filter((w) => Number.isFinite(w.cpa)).map((w) => w.cpa), Infinity);
  const peakHook = Math.max(...windows.map((w) => w.hook || 0));

  const ctrDrop = peakCtr ? clamp(1 - cur.ctr / peakCtr, 0, 1) : 0;
  let cpmRise = first.cpm ? cur.cpm / first.cpm - 1 : 0;
  if (acctCpm?.first && acctCpm?.last) cpmRise = (1 + cpmRise) / (acctCpm.last / acctCpm.first) - 1; // remove market moves
  const hookDrop = peakHook ? clamp(1 - cur.hook / peakHook, 0, 1) : 0;
  const cpaRise = Number.isFinite(bestCpa) && Number.isFinite(cur.cpa) ? cur.cpa / bestCpa - 1 : Number.isFinite(bestCpa) ? 1 : 0;
  const freq = cur.freq || 1;

  const score = Math.round(
    100 *
      clamp(
        0.33 * clamp(ctrDrop / 0.4, 0, 1) +
          0.2 * clamp(cpmRise / 0.5, 0, 1) +
          0.14 * clamp(hookDrop / 0.35, 0, 1) +
          0.15 * clamp((freq - 1.6) / 2.4, 0, 1) +
          0.18 * clamp(cpaRise / 1.0, 0, 1),
        0,
        1,
      ),
  );

  // Days until CTR falls to 60% of its peak, from the recent log-trend.
  const lastCtrs = active.slice(-7).map((r) => Math.log(Math.max(1e-5, div(r.clicks, r.impressions) || 1e-5)));
  const s = slope(lastCtrs);
  let daysLeft = null;
  if (s < -0.005 && cur.ctr > 0) daysLeft = Math.max(0, Math.round(Math.log((0.6 * peakCtr) / cur.ctr) / s));
  else if (s >= -0.005) daysLeft = 30;
  if (daysLeft != null) daysLeft = clamp(daysLeft, 0, 60);

  // Flags as used by top media buyers; a verdict needs at least two at once.
  const firstWeek = windowStats(active.slice(0, 7));
  const flags = [];
  if (freq > 2.5) flags.push(freq > 3.5 ? "честота > 3,5" : "честота > 2,5");
  if (firstWeek.ctr && cur.ctr <= 0.75 * firstWeek.ctr) flags.push("CTR ≤ 75% от първата седмица");
  if (cpmRise >= 0.25 && cur.ctr < peakCtr) flags.push("CPM +25% при падащ CTR");
  if (peakHook && cur.hook <= 0.8 * peakHook) flags.push("кука ≤ 80% от върха");
  if (opts.cpaTarget && Number.isFinite(cur.cpa) && cur.cpa >= 1.5 * opts.cpaTarget) flags.push("CPA ≥ 1,5× допустимото");
  if (Number.isFinite(bestCpa) && Number.isFinite(cur.cpa) && cur.cpa >= 2 * bestCpa) flags.push("CPA ≥ 2× най-добрия (праг на Мета)");

  const ctrTrend = slope(windows.slice(-4).map((w) => w.ctr || 0));
  let stage = "peak";
  if ((score >= 65 && flags.length >= 2) || flags.length >= 4) stage = "burned";
  else if ((score >= 38 && flags.length >= 2) || flags.length >= 3 || (daysLeft != null && daysLeft <= 5 && flags.length >= 1)) stage = "tiring";
  else if (ctrTrend > 0 && age <= 10) stage = "rising";

  return {
    stage,
    score,
    daysLeft,
    age,
    flags,
    signals: { ctr: cur.ctr, peakCtr, ctrDrop, cpm: cur.cpm, cpmRise, hook: cur.hook, hookDrop, freq, cpa: cur.cpa, cpaRise },
  };
}

export function reasonText(f) {
  if (f.flags?.length) return f.flags.join(" · ");
  const s = f.signals || {};
  const out = [];
  if (s.ctrDrop > 0.2) out.push(`CTR −${Math.round(s.ctrDrop * 100)}% от върха`);
  if (s.cpmRise > 0.2) out.push(`CPM +${Math.round(s.cpmRise * 100)}% (спрямо пазара)`);
  if (s.hookDrop > 0.2) out.push(`задържане в първите 3 сек −${Math.round(s.hookDrop * 100)}%`);
  if (s.freq > 2.5) out.push(`честота ${s.freq.toFixed(1)}`);
  if (s.cpaRise > 0.4) out.push(`цена на поръчка +${Math.round(s.cpaRise * 100)}%`);
  return out.join(" · ") || "сигналите са спокойни";
}

// How many fresh creatives each account needs ready on the bench.
// Rule: ready replacements ≥ number of ads carrying 80% of spend, and enough to
// cover everything burning or burning within 7 days. liveFatigue items: {stage, daysLeft, score, spend}.
export function benchPlan(liveFatigue, benchCount, opts = {}) {
  const horizon = opts.horizonDays ?? 7;
  const minBench = opts.minBench ?? 4;
  const burning = liveFatigue.filter((f) => f.stage === "burned").length;
  const soon = liveFatigue.filter((f) => f.stage === "tiring" || (f.daysLeft != null && f.daysLeft <= horizon && f.stage !== "burned")).length;
  const bySpend = [...liveFatigue].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const total = sum(bySpend, (f) => f.spend || 0);
  let acc = 0, carriers = 0;
  for (const f of bySpend) {
    if (acc >= 0.8 * total) break;
    acc += f.spend || 0;
    carriers++;
  }
  const needed = Math.max(minBench, carriers, burning + soon + 1);
  return { burning, soon, carriers, bench: benchCount, needed, gap: Math.max(0, needed - benchCount), avgScore: Math.round(mean(liveFatigue.map((f) => f.score)) || 0) };
}
