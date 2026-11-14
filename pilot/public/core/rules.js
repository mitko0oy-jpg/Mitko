// The autopilot ("Ruleset v1"). Turns numbers into concrete, explained proposals.
// Principle: "the LLM proposes, the code disposes" – every money decision here is
// deterministic and testable; AI only writes briefs and explanations.
//
// Modes:
//   observe   – shows proposals, changes nothing
//   copilot   – runs alerts and creative briefs, asks before touching money
//   autopilot – runs low/medium risk within the limits, asks for the rest
import { clamp, round } from "./util.js";

export const MODES = {
  observe: { label: "Наблюдение", text: "Само показва препоръки. Нищо не се променя само. Препоръчително за първите 2 седмици." },
  copilot: { label: "Втори пилот", text: "Предлага промени – ти одобряваш с едно натискане. Препоръчително за седмици 3–6." },
  autopilot: { label: "Автопилот", text: "Сам прави безопасните промени в границите. Големите и новите реклами винаги пита." },
};

export const DEFAULT_LIMITS = {
  maxUpPct: 20, // max increase in one step (auto only up to autoUpPct)
  autoUpPct: 15,
  maxDownPct: 30,
  cooldownUpH: 72, // after an increase (protects learning)
  cooldownDownH: 48, // after a cut
  maxDailySpend: 800, // all accounts together, EUR
  maxWeeklyUpPct: 50, // one entity cannot grow more than this in 7 days
  maxActionsPerRun: 10,
  minBudget: 5,
  testShareMin: 0.1, // share of spend reserved for testing new creatives
  testShareMax: 0.3,
};

export const RULES = [
  { id: "scale_winner", group: "Бюджети", title: "Скалирай печелившото", text: "Марж за 3 дни ≥ целта +6 п.п. и за 7 дни ≥ целта +3 п.п., поне 15 поръчки за 7 дни, не е в обучение, честота < 2,5, последна промяна преди 72+ часа → +15% (+20% при много силен марж, +25% при пазар във възход).", params: { extra3: 0.06, extra7: 0.03, minOrders7: 15, maxFreq: 2.5 } },
  { id: "trim", group: "Бюджети", title: "Подрежи слабото", text: "Марж за 7 дни под минимума с 4+ п.п. и поне 10 поръчки → −15%.", params: { below: 0.04, minOrders7: 10 } },
  { id: "cut", group: "Бюджети", title: "Режи загубата", text: "Марж за 3 дни под нулата и разход ≥ 3× допустимата цена на поръчка → −30% (най-много веднъж на 48 часа).", params: { spendX: 3 } },
  { id: "stop_propose", group: "Бюджети", title: "Предложи спиране", text: "Загуба за 7 дни при разход ≥ 6× допустимата цена на поръчка → предложение за пауза (винаги с одобрение).", params: { spendX: 6 } },
  { id: "intraday", group: "Бюджети", title: "Спешно през деня", text: "Между 8 и 23 ч: изхарчена половината от дневния бюджет, 0 поръчки, а се очакват поне 2 → −30% само за днес, утре се връща.", params: {} },
  { id: "kill_ad", group: "Реклами", title: "Спри рекламите без поръчки", text: "Реклама на 2+ дни с разход ≥ 2× допустимата цена и без поръчка, или разход ≥ 4× и цена на поръчка ≥ 1,5× допустимата → пауза. Ако в адсета остават < 3 реклами – първо нужда от нови креативи.", params: { spendX: 2, spendX2: 4, cpaX: 1.5 } },
  { id: "fatigue_swap", group: "Реклами", title: "Смени изгорелите", text: "Изгоряла реклама (поне 2 сигнала: честота, CTR −25% от първата седмица, CPA ↑) с 10%+ от харченето → пауза и резерва на нейно място (с одобрение).", params: { minShare: 0.1 } },
  { id: "bench_gap", group: "Креативи", title: "Дръж резерви", text: "Готовите резерви трябва да са поне колкото рекламите, които носят 80% от харченето, и да покриват изгарящите до 7 дни.", params: { minBench: 4 } },
  { id: "diversity_low", group: "Креативи", title: "Разнообразие за Андромеда", text: "Под 5 различни концепции (цел 8–12) или под 3 формата в адсет → задача с липсващите ъгли, хора и формати.", params: { minConcepts: 5, minScore: 55 } },
  { id: "ad_cap", group: "Креативи", title: "Таван на рекламите", text: "Мета позволява до 50 реклами в адсет. Предупреждение при 40.", params: { warn: 40 } },
  { id: "structure", group: "Структура", title: "Нахрани обучението", text: "Адсет с под ~50 покупки на седмица учи бавно и е ~28% по-скъп (данни на Мета). Максимум адсети = седмичен бюджет ÷ (цена на поръчка × 50).", params: {} },
  { id: "explore", group: "Структура", title: "Бюджет за тестове", text: "10–30% от разхода трябва да отива за тестове на нови концепции (Мета препоръчва 20–30%).", params: {} },
  { id: "market_shock", group: "Пазар", title: "Реакция на шок", text: "Голямо събитие отклонява вниманието и цената на поръчка е над допустимата → −20% в държавата и без тестове, докато мине. Ако поръчките са в норма – само пауза на тестовете.", params: { cut: 0.2 } },
  { id: "calendar_boost", group: "Пазар", title: "Пенсии, празници, подаръци", text: "Ден преди силен ден (пенсии, 8 март, Черен петък) → временно +15% на печелившите. Включи го, след като собствените данни покажат ефект.", params: { boost: 0.15 } },
  { id: "margin_floor", group: "Печалба", title: "Пазач на маржа", text: "Ако маржът от началото на месеца е под минимума → всяко увеличение иска одобрение, докато се върне над минимума +2 п.п.", params: {} },
  { id: "spend_cap", group: "Печалба", title: "Таван на дневния разход", text: "Сборът от дневните бюджети не може да мине тавана – реже се най-ниският марж.", params: {} },
  { id: "tracking_guard", group: "Защита", title: "Пазач на проследяването", text: "Ако Мета отчита с 30%+ по-малко покупки от магазина (или обратното) → сигнал, без увеличения, решенията се взимат по реалните поръчки.", params: {} },
  { id: "compliance", group: "Защита", title: "Проверка на твърденията", text: "Всеки нов текст минава проверка за медицински твърдения, лични атрибути и AI етикет. Нови реклами никога не се качват без одобрение.", params: {} },
];

const hoursSince = (ts, now) => (ts ? (now - new Date(ts).getTime()) / 36e5 : Infinity);
const pidOf = (rule, id, day) => `${rule}:${id}:${day}`;

// ctx: { now, today, hour, settings, holders[], ads[], adsets[], accounts{}, regimes{}, bench{}, tracking{}, blended7, mtd, gate, trust{} }
export function evaluate(ctx) {
  const { settings, now = Date.now(), today } = ctx;
  const L = { ...DEFAULT_LIMITS, ...(settings.limits || {}) };
  const econ = settings.econ || {};
  const floor = econ.marginFloor ?? 0.25, target = econ.marginTarget ?? 0.3;
  const on = (id) => settings.rules?.[id]?.on ?? (id !== "calendar_boost");
  const P = (id) => ({ ...RULES.find((r) => r.id === id)?.params, ...(settings.rules?.[id]?.params || {}) });
  const trustStep = (id) => 0.75 + 0.5 * (ctx.trust?.[id]?.trust ?? 0.5);
  const out = [];
  const push = (p) => out.push({ status: "proposed", createdAt: new Date(now).toISOString(), ...p, id: pidOf(p.rule, p.entity?.id || p.account || "all", today) });
  const hour = ctx.hour ?? 12;

  const floorLock = on("margin_floor") && Number.isFinite(ctx.mtd?.cmPct) && ctx.mtd.cmPct < floor;
  if (floorLock) push({ rule: "margin_floor", kind: "alert", risk: "low", title: "Маржът от началото на месеца е под минимума", reason: `${pct(ctx.mtd.cmPct)} при минимум ${pct(floor)}. Всяко увеличение на бюджет иска одобрение, докато маржът стане ${pct(floor + 0.02)}+.` });
  if (ctx.gate && !ctx.gate.ok) push({ rule: "tracking_guard", kind: "alert", risk: "low", title: "Данните не са пресни – автопилотът изчаква", reason: ctx.gate.reasons.join(" ") });

  for (const h of ctx.holders) {
    if (h.status !== "ACTIVE") continue;
    const acct = ctx.accounts[h.account] || {};
    const reg = ctx.regimes?.[acct.country] || {};
    const regime = reg.regime || "stable", posture = reg.posture || "normal";
    const th = acct.thresholds || {};
    const cpaMax = th.maxCpaTarget, cpaFloor = th.maxCpaFloor;
    const tracking = ctx.tracking?.[h.account]?.problem && on("tracking_guard");
    const d1 = h.m1 || {}, d3 = h.m3 || {}, d7 = h.m7 || {};
    const sinceChange = hoursSince(h.lastChange, now);
    const budget = h.budget || 0;
    const ent = { id: h.id, level: h.level, name: h.name, account: h.account };
    const isTest = h.isTest;
    const learning = h.learning === "learning";

    // Market shock (attention elsewhere).
    if (regime === "shock" && on("market_shock")) {
      const losing = Number.isFinite(d3.cpo) && Number.isFinite(cpaFloor) && d3.cpo > cpaFloor;
      if (losing && !h.shockCut && sinceChange > 12) {
        const to = Math.max(L.minBudget, round(budget * (1 - P("market_shock").cut), 0));
        push({ rule: "market_shock", kind: "budget", risk: "medium", entity: ent, from: budget, to, title: `Свий временно: ${h.name}`, reason: `${reg.label}: ${(reg.reasons || []).join(", ") || "вниманието е другаде"}. Цената на поръчка ${eur(d3.cpo)} е над допустимата ${eur(cpaFloor)}. −${Math.round(P("market_shock").cut * 100)}% до отминаване, после връщам на стъпки +20%/ден.`, impact: (budget - to) * 0.25, temporary: true });
      } else if (isTest && !losing) {
        push({ rule: "market_shock", kind: "alert", risk: "low", entity: ent, title: `Тестовете изчакват: ${h.name}`, reason: `${reg.label}. Поръчките се държат, затова бюджетите остават, но нови тестове не се пускат, докато мине.` });
      }
      continue;
    }

    // Intraday emergency (only cuts during the day).
    if (on("intraday") && !tracking && hour >= 8 && hour <= 23 && Number.isFinite(cpaMax)) {
      const expected = (d7.orders || 0) / 7 * (ctx.dayFraction || 0.5);
      if (d1.spend >= 0.5 * budget && (d1.orders || 0) < 0.5 && expected >= 2 && d1.spend >= 1.5 * cpaMax) {
        const to = Math.max(L.minBudget, round(budget * 0.7, 0));
        push({ rule: "intraday", kind: "budget", risk: "medium", entity: ent, from: budget, to, title: `Само днес −30%: ${h.name}`, reason: `Изхарчени ${eur(d1.spend)} от ${eur(budget)} без нито една поръчка, а обичайно до този час има ~${round(expected, 1)}. Утре бюджетът се връща.`, impact: (budget - to) * 0.5, temporary: true, revertTomorrow: true });
        continue;
      }
    }

    // Hard loss: cut.
    if (on("cut") && !tracking && Number.isFinite(d3.cmPct) && d3.cmPct < 0 && Number.isFinite(cpaMax) && d3.spend >= P("cut").spendX * cpaMax && sinceChange >= L.cooldownDownH) {
      const to = Math.max(L.minBudget, round(budget * (1 - Math.min(L.maxDownPct, 30) / 100), 0));
      push({ rule: "cut", kind: "budget", risk: "low", entity: ent, from: budget, to, title: `−30%: ${h.name}`, reason: `Загуба за 3 дни (марж ${pct(d3.cmPct)}), похарчени ${eur(d3.spend)}, цена на поръчка ${eur(d3.cpo)} при допустима ${eur(cpaMax)}.`, impact: (budget - to) * 0.4 });
      if (on("stop_propose") && d7.cmPct < 0 && d7.spend >= P("stop_propose").spendX * cpaMax)
        push({ rule: "stop_propose", kind: "pause", risk: "high", entity: { ...ent }, title: `Да спра ли ${h.name}?`, reason: `7 дни на загуба (${pct(d7.cmPct)}), ${eur(d7.spend)} разход. Предлагам пауза – реши ти.`, impact: d7.spend / 7 * 0.3 });
      continue;
    }

    // Trim below floor.
    if (on("trim") && !tracking && Number.isFinite(d7.cmPct) && d7.cmPct < floor - P("trim").below && (d7.orders || 0) >= P("trim").minOrders7 && sinceChange >= L.cooldownUpH) {
      const to = Math.max(L.minBudget, round(budget * 0.85, 0));
      push({ rule: "trim", kind: "budget", risk: "low", entity: ent, from: budget, to, title: `−15%: ${h.name}`, reason: `Марж за 7 дни ${pct(d7.cmPct)} при минимум ${pct(floor)}; ~${round(d7.orders, 0)} поръчки, цена ${eur(d7.cpo)} (допустимо ${eur(cpaFloor)}).`, impact: (budget - to) * 0.2 });
      continue;
    }

    // Scale winners.
    const sp = P("scale_winner");
    if (on("scale_winner") && !["defend", "hold"].includes(posture) && !learning && !isTest && Number.isFinite(d3.cmPct) && d3.cmPct >= target + sp.extra3 && d7.cmPct >= target + sp.extra7 && (d7.orders || 0) >= sp.minOrders7 && (h.freq7 || 0) < sp.maxFreq && sinceChange >= L.cooldownUpH) {
      let p = d7.cmPct >= target + 0.1 ? 20 : 15;
      if (regime === "up") p = 25;
      if (regime === "expensive") p = 10;
      p = clamp(Math.round(p * trustStep("scale_winner")), 5, L.maxUpPct);
      let to = round(budget * (1 + p / 100), 0);
      let note = "";
      if (Number.isFinite(h.sStar) && to > h.sStar) {
        to = Math.max(budget, round(h.sStar, 0));
        note = ` Кривата на насищане показва, че над ${eur(h.sStar)}/ден маржът пада под целта – спирам дотам.`;
      }
      if (h.weekGrowth != null && (to / budget) * (1 + h.weekGrowth) - 1 > L.maxWeeklyUpPct / 100) {
        to = budget;
        note = ` Вече е увеличен с ${Math.round(h.weekGrowth * 100)}% тази седмица – изчаквам.`;
      }
      if (to > budget) {
        const needApproval = floorLock || (to / budget - 1) * 100 > L.autoUpPct + 0.5 || (ctx.tracking?.[h.account]?.problem && on("tracking_guard"));
        push({ rule: "scale_winner", kind: "budget", risk: needApproval ? "high" : "medium", entity: ent, from: budget, to, title: `+${Math.round((to / budget - 1) * 100)}%: ${h.name}`, reason: `Марж 3 дни ${pct(d3.cmPct)} и 7 дни ${pct(d7.cmPct)} (цел ${pct(target)}), ${round(d7.orders, 0)} поръчки за 7 дни, цена ${eur(d7.cpo)}. Пазар: ${reg.label || "—"}.${note}`, impact: (to - budget) * Math.max(0.05, d7.cmPct * 0.6) });
        continue;
      }
    }

    // Calendar boost (off by default until own data confirms the effect).
    if (on("calendar_boost") && acct.tomorrowEffect >= 0.1 && d7.cmPct >= target && sinceChange >= 24 && !learning) {
      const to = round(budget * (1 + P("calendar_boost").boost), 0);
      push({ rule: "calendar_boost", kind: "budget", risk: "medium", entity: ent, from: budget, to, title: `Утре е силен ден: ${h.name}`, reason: `${acct.tomorrowEvent}. Временно +${Math.round(P("calendar_boost").boost * 100)}%, връщам вдругиден.`, impact: (to - budget) * 0.2, temporary: true });
    }

    // Under-fed learning (structure advice, weekly).
    if (on("structure") && h.level === "adset" && !isTest && Number.isFinite(d7.metaPurchases) && d7.metaPurchases < 35 && d7.spend > 0) {
      push({ rule: "structure", kind: "alert", risk: "low", entity: ent, title: `Гладен адсет: ${h.name}`, reason: `~${Math.round(d7.metaPurchases)} покупки за 7 дни (Мета иска ~50). Обедини го с друг адсет или в кампания с общ бюджет – иначе поръчката излиза ~28% по-скъпа.` });
    }
  }

  // Ads: kill and fatigue swap.
  for (const ad of ctx.ads) {
    if (ad.status !== "ACTIVE") continue;
    const acct = ctx.accounts[ad.account] || {};
    const th = acct.thresholds || {};
    const cpaMax = th.maxCpaTarget;
    const ent = { id: ad.id, level: "ad", name: ad.name, account: ad.account };
    const kp = P("kill_ad");
    if (on("kill_ad") && !ctx.tracking?.[ad.account]?.problem && ad.age >= 2 && Number.isFinite(cpaMax)) {
      const noOrders = ad.mLife.spend >= kp.spendX * cpaMax && (ad.mLife.orders || 0) < 0.5;
      const tooPricey = ad.mLife.spend >= kp.spendX2 * cpaMax && ad.mLife.cpo >= kp.cpaX * cpaMax;
      if (noOrders || tooPricey) {
        const why = noOrders ? `${eur(ad.mLife.spend)} без поръчка` : `цена на поръчка ${eur(ad.mLife.cpo)}`;
        if ((ad.activeInAdset || 0) <= 3) push({ rule: "kill_ad", kind: "generate", risk: "low", account: ad.account, entity: ent, count: 2, title: `Нужни са нови реклами в „${ad.adsetName}“`, reason: `„${ad.name}“ е за спиране (${why}), но в адсета ще останат под 3 реклами.` });
        else push({ rule: "kill_ad", kind: "pause", risk: "low", entity: ent, title: `Спри: ${ad.name}`, reason: `${ad.age} дни, ${why} (допустимо ${eur(cpaMax)} на поръчка).`, impact: ad.mLife.spend / Math.max(1, ad.age) });
        continue;
      }
    }
    if (on("fatigue_swap") && ad.fatigue?.stage === "burned" && (ad.shareInAdset || 0) >= P("fatigue_swap").minShare) {
      const benchAvail = (ctx.bench?.[ad.account]?.items || []).length;
      push({ rule: "fatigue_swap", kind: benchAvail ? "swap" : "pause", risk: "high", entity: ent, adset: ad.adset, title: benchAvail ? `Смени изгоряла: ${ad.name}` : `Пауза на изгоряла: ${ad.name}`, reason: `Умора ${ad.fatigue.score}/100 – ${ad.fatigueText}. ${benchAvail ? "Пускам резерва от същата държава в същия адсет." : "Няма готова резерва – пусни генератора."}`, impact: ((ad.m3?.spend || 0) / 3) * 0.2 });
    }
  }

  // Creative pipeline tasks.
  for (const [acctId, b] of Object.entries(ctx.bench || {})) {
    if (on("bench_gap") && b.plan.gap > 0) {
      const a = ctx.accounts[acctId] || {};
      push({ rule: "bench_gap", kind: "generate", risk: "low", account: acctId, entity: { id: acctId, level: "account", name: a.name, account: acctId }, count: b.plan.gap, title: `${b.plan.gap} нови концепции за ${a.name}`, reason: `${b.plan.burning} изгорели и ${b.plan.soon} ще изгорят до 7 дни; ${b.plan.carriers} реклами носят 80% от харченето, а резервите са ${b.plan.bench} (нужни ${b.plan.needed}).` });
    }
  }
  for (const as of ctx.adsets || []) {
    if (as.status !== "ACTIVE" || !as.diversity) continue;
    const dp = P("diversity_low");
    if (on("diversity_low") && (as.diversity.concepts < dp.minConcepts || as.diversity.score < dp.minScore)) {
      push({ rule: "diversity_low", kind: "generate", risk: "low", account: as.account, entity: { id: as.id, level: "adset", name: as.name, account: as.account }, count: Math.max(2, as.diversity.target - as.diversity.concepts), missing: as.diversity.missing.slice(0, 6), title: `Разнообразие ${as.diversity.score}/100: ${as.name}`, reason: as.diversity.issues.join(" ") });
    }
    if (on("ad_cap") && as.activeAds >= P("ad_cap").warn) push({ rule: "ad_cap", kind: "alert", risk: "low", entity: { id: as.id, level: "adset", name: as.name, account: as.account }, title: `${as.activeAds} реклами в ${as.name}`, reason: "Мета позволява до 50 в адсет. Спри най-слабите, преди да добавяш нови." });
  }
  for (const [acctId, t] of Object.entries(ctx.tracking || {})) {
    if (t.problem && on("tracking_guard")) push({ rule: "tracking_guard", kind: "alert", risk: "low", account: acctId, entity: { id: acctId, level: "account", name: t.name, account: acctId }, title: `Проверете проследяването: ${t.name}`, reason: t.text });
  }
  for (const [acctId, a] of Object.entries(ctx.accounts || {})) {
    if (!on("explore") || !Number.isFinite(a.testShare) || !a.spend7) continue;
    if (a.testShare < L.testShareMin) push({ rule: "explore", kind: "alert", risk: "low", account: acctId, entity: { id: acctId, level: "account", name: a.name, account: acctId }, title: `Малко тестове в ${a.name}`, reason: `Само ${pct(a.testShare)} от разхода е за тестове на нови концепции. Мета препоръчва 20–30% – без тестове няма следващ победител.` });
    if (a.testShare > L.testShareMax) push({ rule: "explore", kind: "alert", risk: "low", account: acctId, entity: { id: acctId, level: "account", name: a.name, account: acctId }, title: `Много тестове в ${a.name}`, reason: `${pct(a.testShare)} от разхода е за тестове – премести част към доказаните реклами.` });
  }

  // Spend cap across everything.
  if (on("spend_cap")) {
    const planned = ctx.holders.filter((h) => h.status === "ACTIVE").reduce((t, h) => t + (h.budget || 0), 0);
    const ups = out.filter((p) => p.kind === "budget" && p.to > p.from).reduce((t, p) => t + (p.to - p.from), 0);
    if (planned + ups > L.maxDailySpend) {
      for (const p of out.filter((p) => p.kind === "budget" && p.to > p.from)) {
        p.status = "blocked";
        p.blockedBy = `Таванът ${eur(L.maxDailySpend)}/ден би бил надминат`;
      }
      const worst = ctx.holders.filter((h) => h.status === "ACTIVE" && !out.some((p) => p.entity?.id === h.id)).sort((a, b) => (a.m7?.cmPct ?? 0) - (b.m7?.cmPct ?? 0))[0];
      if (worst && planned > L.maxDailySpend) {
        const to = Math.max(L.minBudget, round(worst.budget * 0.8, 0));
        push({ rule: "spend_cap", kind: "budget", risk: "low", entity: { id: worst.id, level: worst.level, name: worst.name, account: worst.account }, from: worst.budget, to, title: `Таван: −20% на ${worst.name}`, reason: `Планираният дневен разход ${eur(planned)} е над тавана ${eur(L.maxDailySpend)}. Режа най-слабия марж (${pct(worst.m7?.cmPct)}).` });
      }
    }
  }

  // Data gate: when data is stale, nothing that spends more may run.
  if (ctx.gate && !ctx.gate.ok) for (const p of out) if (p.kind === "budget" && p.to > p.from) { p.status = "blocked"; p.blockedBy = "Данните не са пресни"; }

  return out.slice(0, 80);
}

// Should this proposal run by itself in the current mode?
export function autoRuns(p, mode) {
  if (p.status === "blocked") return false;
  if (mode === "observe") return false;
  if (p.kind === "alert") return true;
  if (p.kind === "generate") return true; // only drafts briefs – nothing is uploaded
  if (mode === "copilot") return false;
  if (p.kind === "swap" || p.kind === "launch") return false; // new ads always need a human
  return p.risk === "low" || p.risk === "medium";
}

export const KIND_LABEL = { budget: "Бюджет", pause: "Пауза", activate: "Пускане", swap: "Смяна", generate: "Креативи", alert: "Сигнал", launch: "Пускане" };
export const RISK_LABEL = { low: "нисък риск", medium: "среден риск", high: "иска одобрение" };

function eur(n) {
  return Number.isFinite(n) ? `${n.toFixed(n >= 100 ? 0 : 2).replace(".", ",")} €` : "—";
}
function pct(x) {
  return Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—";
}
