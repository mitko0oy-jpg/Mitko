// Market regime detection: is the market rising, falling, in shock, or just expensive?
// And when results drop: is it the market, the auction, our creatives, the site or tracking?
import { median, div, clamp, mean, std } from "./util.js";

export const REGIMES = {
  up: { label: "Възход", tone: "good", posture: "attack", mult: 1.2, text: "Търсенето расте – време е да скалираш печелившото." },
  stable: { label: "Стабилен", tone: "info", posture: "normal", mult: 1, text: "Пазарът е спокоен – работи по плана." },
  expensive: { label: "Скъп аукцион", tone: "warn", posture: "careful", mult: 0.95, text: "Показванията поскъпват, но хората купуват. Пази маржа, скалирай само победителите." },
  down: { label: "Спад", tone: "warn", posture: "defend", mult: 0.85, text: "По-малко купувачи. Намали губещото, пази бюджетите на победителите." },
  shock: { label: "Шок – вниманието е другаде", tone: "bad", posture: "hold", mult: 0.75, text: "Голямо събитие отклонява вниманието. Свий бюджетите временно и не пускай тестове." },
  nodata: { label: "Няма данни", tone: "muted", posture: "normal", mult: 1, text: "Още няма достатъчно история." },
};

export const POSTURES = {
  attack: "Атака",
  normal: "Нормално",
  careful: "Внимателно",
  defend: "Защита",
  hold: "Изчакване",
};

const MAD = (a) => {
  const m = median(a);
  return median(a.map((x) => Math.abs(x - m))) * 1.4826;
};

// Robust comparison of the last `recent` days to the baseline before them.
export function compare(values, recent = 3, gap = 0) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < recent + 7) return { change: NaN, z: NaN };
  const cur = v.slice(-recent);
  const base = v.slice(0, v.length - recent - gap).slice(-28);
  const m = median(base), s = MAD(base) || std(base) || Math.abs(m) * 0.1 || 1;
  const c = mean(cur);
  return { change: div(c, m) - 1, z: (c - m) / (s / Math.sqrt(recent)), base: m, cur: c };
}

// Two-sided CUSUM change-point on a standardized series; returns index of the first alarm.
export function cusum(values, k = 0.5, h = 4) {
  const v = values.filter(Number.isFinite);
  if (v.length < 10) return null;
  const base = v.slice(0, Math.max(7, Math.floor(v.length * 0.6)));
  const m = mean(base), s = std(base) || 1;
  let hi = 0, lo = 0;
  for (let i = 0; i < v.length; i++) {
    const z = (v[i] - m) / s;
    hi = Math.max(0, hi + z - k);
    lo = Math.max(0, lo - z - k);
    if (hi > h) return { index: i, dir: "up" };
    if (lo > h) return { index: i, dir: "down" };
  }
  return null;
}

// days: [{date, spend, impressions, clicks, purchases, orders, sessions, attention, trend}] ascending, complete days only.
export function regimeFor(days) {
  if (days.length < 10) return { regime: "nodata", ...REGIMES.nodata, reasons: [], metrics: {} };
  if (days.slice(-7).reduce((t, d) => t + (d.impressions || 0), 0) === 0) return { regime: "nodata", ...REGIMES.nodata, label: "Няма реклами", text: "Последната седмица няма показвания в тази държава.", reasons: [], metrics: {} };
  const col = (f) => days.map(f);
  const cpm = compare(col((d) => div(d.spend * 1000, d.impressions)));
  const ctr = compare(col((d) => div(d.clicks, d.impressions)));
  const cvr = compare(col((d) => div(d.orders, d.sessions || d.clicks)));
  const opm = compare(col((d) => div(d.orders * 1000, d.impressions))); // orders per 1000 impressions
  const cpo = compare(col((d) => div(d.spend, d.orders)));
  const att = compare(col((d) => d.attention ?? 0));
  const trend = compare(col((d) => d.trend ?? NaN));
  const metrics = { cpm, ctr, cvr, opm, cpo, attention: att, trend };

  // Orders are small counts – use a Poisson test so 3 lucky days are not called a trend.
  const pois = (num, den, recent = 3) => {
    const d = days.filter((x) => x[den] > 0);
    if (d.length < recent + 7) return { z: 0 };
    const cur = d.slice(-recent), base = d.slice(0, -recent).slice(-28);
    const rate = base.reduce((t, x) => t + x[num], 0) / Math.max(1, base.reduce((t, x) => t + x[den], 0));
    const exp = rate * cur.reduce((t, x) => t + x[den], 0), obs = cur.reduce((t, x) => t + x[num], 0);
    return { z: (obs - exp) / Math.sqrt(Math.max(1, exp)), obs, exp };
  };
  const pOpm = pois("orders", "impressions"), pCvr = days.some((x) => x.sessions) ? pois("orders", "sessions") : pOpm;
  opm.z = pOpm.z;
  cvr.z = pCvr.z;
  const sigDown = pOpm.z <= -2 || pCvr.z <= -2, sigUp = pOpm.z >= 2 || pCvr.z >= 2;

  let regime = "stable";
  const reasons = [];
  if ((att.z > 2.5 && (ctr.change < -0.08 || (cvr.change < -0.1 && sigDown))) || (cpm.change > 0.25 && ctr.change < -0.15)) {
    regime = "shock";
    if (att.z > 2.5) reasons.push("рязък скок на новинарския шум");
    if (cpm.change > 0.25) reasons.push(`CPM +${Math.round(cpm.change * 100)}%`);
    if (ctr.change < -0.08) reasons.push(`CTR ${Math.round(ctr.change * 100)}%`);
  } else if (sigDown && (cvr.change < -0.15 || opm.change < -0.2)) {
    regime = "down";
    if (Number.isFinite(opm.change)) reasons.push(`купувания на 1000 показвания ${Math.round(opm.change * 100)}%`);
  } else if (cpm.change > 0.18 && !sigDown && !sigUp) {
    regime = "expensive";
    reasons.push(`CPM +${Math.round(cpm.change * 100)}%, конверсията се държи`);
  } else if (sigUp && (cvr.change > 0.1 || opm.change > 0.12) && !(trend.change < -0.1)) {
    regime = "up";
    if (Number.isFinite(opm.change)) reasons.push(`купувания на 1000 показвания +${Math.round(opm.change * 100)}%`);
    if (trend.change > 0.05) reasons.push(`интерес в Google +${Math.round(trend.change * 100)}%`);
  }
  const cp = cusum(col((d) => div(d.orders * 1000, d.impressions)));
  const changePoint = cp ? { date: days.filter((d) => d.impressions > 0)[cp.index]?.date, dir: cp.dir } : null;
  return { regime, ...REGIMES[regime], reasons, metrics, changePoint };
}

// Why did results drop? Looks across accounts and at Meta vs real orders.
export function diagnose({ byCountry, metaVsReal, topAdsFatigue }) {
  const out = [];
  const countries = Object.entries(byCountry).filter(([, r]) => r.regime !== "nodata");
  const falling = countries.filter(([, r]) => r.metrics.opm?.change < -0.15);
  const cpmUp = countries.filter(([, r]) => r.metrics.cpm?.change > 0.2);
  if (falling.length >= 2) out.push({ kind: "market", title: "Пазарът", text: `Спад едновременно в ${falling.length} държави – причината е външна (внимание, сезон, новини), не рекламите.` });
  if (cpmUp.length >= Math.max(2, countries.length - 1)) out.push({ kind: "auction", title: "Аукционът", text: "CPM расте навсякъде – конкуренцията за показвания е по-голяма (сезон/празници)." });
  for (const [acct, x] of Object.entries(metaVsReal || {})) {
    if (x.metaChange < -0.3 && x.realChange > -0.1)
      out.push({ kind: "tracking", title: `Проследяване – ${x.name}`, text: "Мета отчита много по-малко покупки, но реалните поръчки са наред. Провери пиксела / Conversions API – не режи бюджети." });
    if (x.sessionsChange > -0.1 && x.siteCvrChange < -0.3)
      out.push({ kind: "site", title: `Сайтът – ${x.name}`, text: "Посещенията са същите, а поръчките паднаха. Провери лендинга, формата за поръчка и скоростта." });
  }
  const tired = (topAdsFatigue || []).filter((f) => f.stage === "burned" || f.stage === "tiring");
  if (tired.length && falling.length < 2) out.push({ kind: "creative", title: "Креативите", text: `${tired.length} от най-харчещите реклами са уморени – смени ги с готовите резерви.` });
  return out;
}

export function postureMultiplier(regime, calendarEffect = 0) {
  return clamp((REGIMES[regime]?.mult ?? 1) * (1 + calendarEffect * 0.5), 0.6, 1.35);
}
