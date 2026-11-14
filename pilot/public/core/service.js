// Application service: one API surface used by the browser (demo mode, memory store +
// simulator) and by Netlify Functions (live mode, Postgres store + Meta/shop sources).
import { todayStr, addDays, dayDiff, daysBetween, rangeDates, RANGES, dayFraction, div, sum, round, groupBy, uid, median, TZ } from "./util.js";
import { COUNTRY, deliveryRates, profit, thresholds, calibration, entityProfit, fixedPerDay, marginState, spendCurve } from "./metrics.js";
import { fatigue, reasonText, benchPlan, STAGES } from "./fatigue.js";
import { diversity, checkNew, clusters } from "./diversity.js";
import { regimeFor, diagnose, REGIMES, POSTURES } from "./regime.js";
import { calendar, dayEffect } from "./calendar.js";
import { evaluate, autoRuns, RULES, MODES, DEFAULT_LIMITS } from "./rules.js";
import { judge, ruleTrust, tagStats, nextBriefs, insightsText, EVAL_DAYS } from "./learning.js";
import { templateConcept, briefPrompt, gate, PROVIDERS } from "./studio.js";
import { lint } from "./compliance.js";
import { DIMENSIONS, CONCEPT_DIMS } from "./taxonomy.js";
import { START_PRODUCTS } from "./defaults.js";
import { DEFAULT_LINES } from "./lines.js";

export const DEFAULT_SETTINGS = {
  mode: "observe",
  paused: false,
  econ: { marginFloor: 0.25, marginTarget: 0.3, defaultCogsPct: 0.3, products: [], fixedMonthly: {} },
  limits: { ...DEFAULT_LIMITS },
  rules: {},
  accounts: {},
  sites: {},
  keywords: {
    BG: ["пчелна отрова", "гел за стави", "болки в ставите"],
    SK: ["včelí jed", "gél na kĺby", "bolesť kĺbov"],
    SI: ["čebelji strup", "gel za sklepe", "bolečine v sklepih"],
    HU: ["méhméreg", "ízületi gél", "ízületi fájdalom"],
  },
  competitors: [],
  calendarCustom: [],
  monthlyBudget: null,
};

export const DEFAULT_RADAR = [
  { id: "r1", area: "Мета", name: "Marketing API v27.0", status: "adopt", note: "Излезе на 4.11.2026. v24 спря на 10.11.2026. Приложението ползва v27." },
  { id: "r2", area: "Мета", name: "Уебхук „умора на креатива“", status: "adopt", note: "От юли 2026 Мета праща LOW/MEDIUM/HIGH за всяка реклама – вграден като втори сигнал." },
  { id: "r3", area: "Мета", name: "Колона „Разнообразие на креативите“", status: "adopt", note: "Сравнява изображения и първи кадри в адсета. Нашият резултат я изпреварва." },
  { id: "r4", area: "Мета", name: "Ads AI Connectors (официален MCP)", status: "trial", note: "За AI асистента в приложението, с правила за таван на бюджета. Графикът работи през API." },
  { id: "r5", area: "Мета", name: "Advantage+ sales структура", status: "adopt", note: "Старите ASC кампании не се правят през API от 19.05.2026." },
  { id: "r6", area: "Мета", name: "Инкрементална атрибуция", status: "assess", note: "Колона за сравнение – полезна за проверка дали рекламите носят нови продажби." },
  { id: "r7", area: "Видео", name: "Wan 3.0 / MiniMax H3", status: "trial", note: "Топ по качество и цена (ноември 2026). През fal.ai с един ключ." },
  { id: "r8", area: "Видео", name: "Seedance 2.5", status: "assess", note: "Най-добро снимка→видео, но не приема истински лица." },
  { id: "r9", area: "Видео", name: "Sora / Veo 3.1 (Gemini API)", status: "hold", note: "Sora API спря на 24.09.2026; Veo 3.1 preview спря на 22.10.2026." },
  { id: "r10", area: "Глас", name: "ElevenLabs v3", status: "adopt", note: "Единственият потвърден за български, словашки, словенски и унгарски." },
  { id: "r11", area: "Изображения", name: "GPT Image 2.6", status: "trial", note: "№1 в класацията; текстът се слага от приложението, не от модела." },
  { id: "r12", area: "Анализ", name: "Gemini Flash видео анализ", status: "trial", note: "Автоматично тагване на видеа под 1 цент на реклама." },
  { id: "r13", area: "Анализ", name: "PDQ + мултимодални ембединги", status: "assess", note: "Пръстов отпечатък на всеки креатив, за да не повтаряме." },
  { id: "r14", area: "Регулации", name: "EU AI Act чл. 50", status: "adopt", note: "От 2.08.2026: видим етикет за реалистични AI хора. Вграден в проверката." },
  { id: "r15", area: "AI", name: "Claude Opus 5.5 / Sonnet 5.5", status: "adopt", note: "Брифове, сценарии, преводи и проверка на твърдения." },
];

const merge = (a, b) => {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b ?? a;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a?.[k], v) : v;
  return out;
};

const SUMS = ["spend", "impressions", "reach", "clicks", "lpv", "purchases", "value", "video3s", "thruplay"];
const zero = () => Object.fromEntries(SUMS.map((k) => [k, 0]));

export function createService({ store, source, ai = null, video = null, now = () => new Date(), demo = false }) {
  async function settings() {
    const s = merge(DEFAULT_SETTINGS, (await store.get("settings", "main")) || {});
    if (!demo && !s.econ.products.length) s.econ.products = START_PRODUCTS.map((p) => ({ ...p, start: true }));
    if (!s.lines?.length) s.lines = DEFAULT_LINES;
    if (demo && !s.econ.products.length) {
      s.econ.products = source.demoProducts || [];
      if (!Object.keys(s.econ.fixedMonthly).length) s.econ.fixedMonthly = { "Счетоводство": 100, "Осигуровки": 190, "ConvertBuilder": 90, "AI инструменти": 200, "Софтуер": 130 };
    }
    return s;
  }

  // ---------------------------------------------------------------------------
  // The model: everything computed from raw data, once per request.
  async function model() {
    const S = await settings();
    const nowD = now();
    const today = todayStr(nowD);
    const yesterday = addDays(today, -1);
    const since = addDays(today, -59);
    const snap = await source.snapshot({ today, since, now: nowD });
    const econ = S.econ;
    const floor = econ.marginFloor, target = econ.marginTarget;

    // Library = creatives seen on Meta + our own (studio, manual) with local edits.
    const stored = await store.list("creatives");
    const lib = new Map(snap.creatives.map((c) => [c.id, { ...c }]));
    for (const c of stored) lib.set(c.id, { ...(lib.get(c.id) || {}), ...c });
    const library = [...lib.values()];

    // Accounts and their economics.
    const accounts = snap.accounts
      .map((a) => ({ ...a, ...(S.accounts[a.id] || {}), on: S.accounts[a.id]?.on !== false }))
      .filter((a) => a.on);
    const acctIds = new Set(accounts.map((a) => a.id));
    const accts = Object.fromEntries(accounts.map((a) => [a.id, { ...a, vat: a.vat ?? COUNTRY[a.country]?.vat ?? 0.2, courier: a.courier ?? (demo ? 4 : 0), codFeePct: a.codFeePct ?? (demo ? 0.012 : 0), returnCost: a.returnCost ?? 3.5 }]));
    const orders = snap.orders.filter((o) => acctIds.has(o.account));
    const ordersBy = groupBy(orders, (o) => o.account);
    const rates = {};
    for (const a of accounts) rates[a.id] = deliveryRates(ordersBy.get(a.id) || [], today);
    rates._ = deliveryRates(orders, today);

    // Daily sums per entity.
    const daily = new Map();
    const add = (id, r) => {
      const k = `${id}|${r.date}`;
      let t = daily.get(k);
      if (!t) daily.set(k, (t = zero()));
      for (const f of SUMS) t[f] += r[f] || 0;
    };
    const ins = snap.insights.filter((r) => acctIds.has(r.account));
    for (const r of ins) {
      add(r.ad, r);
      add(r.adset, r);
      add(r.campaign, r);
      add(r.account, r);
      add("all", r);
      add(`c:${accts[r.account]?.country}`, r);
    }
    const win = (id, from, to) => {
      const t = zero();
      for (const d of daysBetween(from, to)) {
        const x = daily.get(`${id}|${d}`);
        if (x) for (const f of SUMS) t[f] += x[f];
      }
      return t;
    };
    const ordersIn = (acct, from, to) => (acct ? ordersBy.get(acct) || [] : orders).filter((o) => o.date >= from && o.date <= to);
    const sessionsIn = (acct, from, to) => sum(snap.sessions.filter((s) => (!acct || s.account === acct) && s.date >= from && s.date <= to), (s) => s.sessions);

    const W = { d1: [today, today], d3: [addDays(today, -3), yesterday], d7: [addDays(today, -7), yesterday], d14: [addDays(today, -14), yesterday], life: [since, today] };

    // Per-account economics over the last 14 complete days.
    for (const a of accounts) {
      const [f, t] = W.d14;
      const sp = win(a.id, f, t);
      const p = profit({ orders: ordersIn(a.id, f, t), spend: sp.spend, accts, econ, rates });
      const q = calibration(p.orders, sp.purchases);
      const th = thresholds(p, econ, accts[a.id].vat);
      Object.assign(accts[a.id], {
        q,
        econ14: p,
        thresholds: th,
        acctEcon: { factor: q, netPerOrder: th.netPerOrder || 0, varPct: th.varPct },
        aovGross: div(sum(ordersIn(a.id, f, t), (o) => o.total), p.orders),
      });
    }

    const econOf = (id, acct, from, to) => {
      const m = win(id, from, to);
      const e = entityProfit(m.spend, m.purchases, accts[acct]?.acctEcon || {});
      return {
        ...m,
        metaPurchases: m.purchases,
        orders: e.orders,
        net: e.net,
        cm: e.cm,
        cmPct: e.cmPct,
        cpo: e.cpo,
        roasNet: e.roasNet,
        roasMeta: div(m.value, m.spend),
        ctr: div(m.clicks, m.impressions),
        cpm: div(m.spend * 1000, m.impressions),
        freq: div(m.impressions, m.reach),
        hook: div(m.video3s, m.impressions),
        hold: div(m.thruplay, m.video3s),
      };
    };

    // Actions log (executed changes) – used for cooldowns, reverts and learning.
    const actionsAll = await store.list("actions");
    const executed = actionsAll.filter((a) => a.status === "executed");
    const lastChangeOf = (id) => executed.filter((a) => a.entity?.id === id && a.kind === "budget").map((a) => a.executedAt).sort().pop();
    const weekGrowthOf = (id) => {
      let g = 1;
      for (const a of executed) if (a.entity?.id === id && a.kind === "budget" && a.from && dayDiff(a.executedAt.slice(0, 10), today) <= 7) g *= a.to / a.from;
      return g - 1;
    };

    // Ads.
    const crOf = (id) => lib.get(id) || { id, tags: {} };
    const adsetsById = Object.fromEntries(snap.adsets.map((s) => [s.id, s]));
    const adModels = [];
    for (const ad of snap.ads.filter((x) => acctIds.has(x.account))) {
      const a = accts[ad.account];
      const rows = daysBetween(ad.created > since ? ad.created : since, today).map((d) => ({ date: d, ...(daily.get(`${ad.id}|${d}`) || zero()) }));
      const active = rows.filter((r) => r.impressions > 0);
      const firstDates = active.slice(0, 3).map((r) => r.date);
      const acctCpm = firstDates.length ? { first: div(win(ad.account, firstDates[0], firstDates[firstDates.length - 1]).spend * 1000, win(ad.account, firstDates[0], firstDates[firstDates.length - 1]).impressions), last: div(win(ad.account, ...W.d3).spend * 1000, win(ad.account, ...W.d3).impressions) } : null;
      const cpaTargetMeta = (a.thresholds.maxCpaTarget || 0) * (a.q || 1);
      const fat = fatigue(active, acctCpm, { cpaTarget: cpaTargetMeta > 0 ? cpaTargetMeta : null });
      // Meta's own creative_fatigue webhook counts as one more signal.
      const metaLevel = snap.metaFatigue?.[ad.id];
      if (metaLevel === "HIGH" || metaLevel === "MEDIUM") {
        fat.flags = [...(fat.flags || []), `Мета: умора ${metaLevel}`];
        if (metaLevel === "HIGH" && fat.stage !== "learning") fat.stage = fat.flags.length >= 2 ? "burned" : "tiring";
      }
      const m3 = econOf(ad.id, ad.account, ...W.d3);
      const as3 = win(ad.adset, ...W.d3);
      adModels.push({
        ...ad,
        adsetName: adsetsById[ad.adset]?.name,
        country: a.country,
        cr: crOf(ad.creative),
        age: Math.max(0, dayDiff(ad.created, today)),
        m1: econOf(ad.id, ad.account, ...W.d1),
        m3,
        m7: econOf(ad.id, ad.account, ...W.d7),
        mLife: econOf(ad.id, ad.account, ...W.life),
        fatigue: fat,
        fatigueText: reasonText(fat),
        shareInAdset: div(m3.spend, as3.spend) || 0,
        activeInAdset: snap.ads.filter((x) => x.adset === ad.adset && x.status === "ACTIVE").length,
      });
    }
    const adsByAdset = groupBy(adModels, (x) => x.adset);

    // Ad sets with diversity.
    const adsetModels = snap.adsets
      .filter((s) => acctIds.has(s.account))
      .map((s) => {
        const live = (adsByAdset.get(s.id) || []).filter((x) => x.status === "ACTIVE");
        return { ...s, activeAds: live.length, diversity: diversity(live.map((x) => ({ ...x.cr, id: x.id }))) };
      });

    // Budget holders (CBO campaigns, ABO ad sets).
    const holders = [];
    for (const c of snap.campaigns.filter((x) => acctIds.has(x.account))) {
      const isTest = /тест|test/i.test(c.name);
      const mk = (e, level) => {
        const a = accts[e.account];
        const pts = daysBetween(addDays(today, -28), yesterday).map((d) => {
          const m = daily.get(`${e.id}|${d}`) || zero();
          return { spend: m.spend, orders: m.purchases * (a.q || 1) };
        });
        const E = (a.thresholds.netPerOrder || 0) * (1 - (a.thresholds.varPct ?? 0.45));
        const curve = spendCurve(pts, E, a.thresholds.maxCpaTarget);
        const m7 = econOf(e.id, e.account, ...W.d7);
        const kids = level === "campaign" ? snap.adsets.filter((s) => s.campaign === e.id) : [e];
        return {
          id: e.id, level, name: e.name, account: e.account, status: e.status, budget: e.budget, campaign: level === "adset" ? e.campaign : e.id,
          learning: kids.some((k) => k.learning === "learning") ? "learning" : "active",
          isTest: isTest || /тест|test/i.test(e.name),
          m1: econOf(e.id, e.account, ...W.d1), m3: econOf(e.id, e.account, ...W.d3), m7,
          freq7: m7.freq, lastChange: lastChangeOf(e.id), weekGrowth: weekGrowthOf(e.id),
          curve, sStar: curve?.sStar,
          shockCut: executed.some((x) => x.entity?.id === e.id && x.rule === "market_shock" && dayDiff(x.executedAt.slice(0, 10), today) <= 3),
        };
      };
      if (c.budget != null) holders.push(mk(c, "campaign"));
      else for (const s of snap.adsets.filter((x) => x.campaign === c.id && x.budget != null)) holders.push(mk(s, "adset"));
    }

    // Market regimes per country (complete days only).
    const countries = [...new Set(accounts.map((a) => a.country))];
    const regimes = {};
    const marketSeries = {};
    for (const c of countries) {
      const series = snap.market?.[c] || [];
      marketSeries[c] = series;
      const byDate = Object.fromEntries(series.map((x) => [x.date, x]));
      const ids = accounts.filter((a) => a.country === c).map((a) => a.id);
      const days = daysBetween(addDays(today, -35), yesterday).map((d) => {
        const m = daily.get(`c:${c}|${d}`) || zero();
        const ord = orders.filter((o) => o.date === d && ids.includes(o.account)).length;
        const ses = sum(snap.sessions.filter((s) => s.date === d && ids.includes(s.account)), (s) => s.sessions);
        return { date: d, spend: m.spend, impressions: m.impressions, clicks: m.clicks, purchases: m.purchases, orders: ord, sessions: ses, attention: byDate[d]?.attention, trend: byDate[d]?.trend };
      });
      regimes[c] = { ...regimeFor(days), days };
    }

    // Tracking: Meta purchases vs real orders.
    const tracking = {};
    const siteInfo = {};
    for (const a of accounts) {
      const m3 = win(a.id, ...W.d3), m14 = win(a.id, addDays(today, -17), addDays(today, -4));
      const r3 = ordersIn(a.id, ...W.d3).length, r14 = ordersIn(a.id, addDays(today, -17), addDays(today, -4)).length;
      const ratioNow = div(m3.purchases, r3), ratioBase = div(m14.purchases, r14);
      const rel = div(ratioNow, ratioBase);
      const metaChange = div(m3.purchases / 3, m14.purchases / 14) - 1, realChange = div(r3 / 3, r14 / 14) - 1;
      const s3 = sessionsIn(a.id, ...W.d3), s14 = sessionsIn(a.id, addDays(today, -17), addDays(today, -4));
      const problem = r3 >= 5 && Number.isFinite(rel) && (rel < 0.65 || rel > 1.6);
      tracking[a.id] = {
        name: a.name, problem, rel, metaChange, realChange,
        text: problem ? (rel < 1 ? `Мета вижда ${Math.round(m3.purchases)} покупки за 3 дни, а магазинът има ${r3} поръчки – с ${Math.round((1 - rel) * 100)}% по-малко от обичайното съотношение. Провери пиксела / Conversions API. Не режа бюджети по данните на Мета.` : `Мета отчита повече покупки от реалните поръчки (×${rel.toFixed(1)} спрямо обичайното). Възможни дублирани събития.`) : "Наред",
      };
      siteInfo[a.id] = { name: a.name, metaChange, realChange, sessionsChange: div(s3 / 3, s14 / 14) - 1, siteCvrChange: div(div(r3, s3), div(r14, s14)) - 1 };
    }

    const topAds = [...adModels].filter((x) => x.status === "ACTIVE").sort((a, b) => b.m3.spend - a.m3.spend).slice(0, 8);
    const diagnosis = diagnose({ byCountry: regimes, metaVsReal: siteInfo, topAdsFatigue: topAds.map((x) => x.fatigue) });

    // Blended truth (real orders vs all spend).
    const blended = (from, to, acct = null) => {
      const sp = acct ? win(acct, from, to).spend : win("all", from, to).spend;
      const days = dayDiff(from, to) + 1;
      return profit({ orders: ordersIn(acct, from, to), spend: sp, accts, econ, rates, fixed: acct ? 0 : fixedPerDay(econ.fixedMonthly) * days });
    };
    const blended7 = blended(...W.d7);
    const mtd = blended(today.slice(0, 8) + "01", today);

    // Bench and creative pipeline.
    const bench = {};
    for (const a of accounts) {
      const items = library.filter((c) => c.status === "bench" && (c.account === a.id || (!c.account && c.country === a.country)));
      const live = adModels.filter((x) => x.account === a.id && x.status === "ACTIVE").map((x) => ({ ...x.fatigue, spend: x.m7.spend }));
      bench[a.id] = { items, plan: benchPlan(live, items.length) };
    }

    // Calendar.
    const cal = calendar(today, 45, countries, S.calendarCustom);
    for (const a of accounts) {
      const tomorrowEv = cal.filter((e) => e.date === addDays(today, 1) && e.country === a.country && e.effect > 0);
      accts[a.id].tomorrowEffect = sum(tomorrowEv, (e) => e.effect);
      accts[a.id].tomorrowEvent = tomorrowEv.map((e) => e.name).join(", ");
      const spend7 = win(a.id, ...W.d7).spend;
      const test7 = sum(holders.filter((h) => h.account === a.id && h.isTest), (h) => h.m7.spend);
      accts[a.id].spend7 = spend7;
      accts[a.id].testShare = div(test7, spend7);
    }

    // Learning: outcomes of past actions.
    const evaluated = [];
    for (const x of executed) {
      if (!x.entity?.id || !["budget", "pause"].includes(x.kind)) continue;
      const day = x.executedAt.slice(0, 10);
      const n = EVAL_DAYS[x.kind] || 3;
      if (dayDiff(day, yesterday) < n) continue;
      const acct = x.entity.account;
      const b = econOf(x.entity.id, acct, addDays(day, -n), addDays(day, -1));
      const af = econOf(x.entity.id, acct, addDays(day, 1), addDays(day, n));
      const ab = econOf(acct, acct, addDays(day, -n), addDays(day, -1));
      const aa = econOf(acct, acct, addDays(day, 1), addDays(day, n));
      const ctrl = (all, ent) => ({ spend: all.spend - ent.spend, cm: all.cm - ent.cm });
      evaluated.push({ ...x, outcome: x.outcome || judge(x, b, af, ctrl(ab, b), ctrl(aa, af)) });
    }
    const trust = ruleTrust(evaluated);

    // Creative results for tag learning.
    const crStats = new Map();
    for (const x of adModels) {
      const s = crStats.get(x.creative) || { spend: 0, cm: 0, orders: 0, impressions: 0, clicks: 0, video3s: 0, thruplay: 0, ads: 0 };
      s.spend += x.mLife.spend;
      s.cm += x.mLife.cm || 0;
      s.orders += x.mLife.orders || 0;
      s.impressions += x.mLife.impressions;
      s.clicks += x.mLife.clicks;
      s.video3s += x.mLife.video3s;
      s.thruplay += x.mLife.thruplay;
      s.ads++;
      crStats.set(x.creative, s);
    }
    const medianEff = median([...crStats.values()].filter((s) => s.spend > 20).map((s) => s.cm / s.spend));
    for (const c of library) {
      const s = crStats.get(c.id);
      if (!s) continue;
      c.stats = { ...s, cmPct: div(s.cm, s.cm + s.spend), ctr: div(s.clicks, s.impressions), hook: div(s.video3s, s.impressions), hold: div(s.thruplay, s.video3s), cpo: div(s.spend, s.orders) };
      const minSpend = 2 * (accts[c.account]?.thresholds?.maxCpaTarget || 10);
      c.result = s.spend >= minSpend ? (s.cm / s.spend >= medianEff ? "win" : "lose") : null;
      c.spend = s.spend;
    }
    const tags = tagStats(library);

    const ctx = {
      now: nowD.getTime(), today, settings: S, hour: Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(nowD)), dayFraction: dayFraction(nowD),
      holders, ads: adModels, adsets: adsetModels, accounts: accts, regimes, bench, tracking, blended7, mtd, trust,
      gate: snap.gate || { ok: true, reasons: [] },
    };
    const proposals = S.paused ? [] : evaluate(ctx);
    // Merge with what was already decided today.
    const decided = Object.fromEntries(actionsAll.map((a) => [a.id, a]));
    for (const p of proposals) {
      const d = decided[p.id];
      if (d) Object.assign(p, { status: d.status, by: d.by, decidedAt: d.decidedAt || d.executedAt });
    }

    return { S, today, nowD, snap, accounts, accts, rates, holders, adModels, adsetModels, library, regimes, marketSeries, tracking, diagnosis, blended, blended7, mtd, bench, cal, evaluated, trust, tags, proposals, executed, actionsAll, win, econOf, ordersIn, sessionsIn, daily, countries, W };
  }

  // ---------------------------------------------------------------------------
  // Views
  async function dashboard(rangeKey = "d7") {
    const M = await model();
    const [from, to] = rangeDates(rangeKey, M.today);
    const n = dayDiff(from, to) + 1;
    const [pf, pt] = [addDays(from, -n), addDays(from, -1)];
    const cur = M.blended(from, to), prev = M.blended(pf, pt);
    const byAccount = M.accounts.map((a) => {
      const p = M.blended(from, to, a.id);
      const m = M.econOf(a.id, a.id, from, to);
      return { id: a.id, name: a.name, country: a.country, flag: COUNTRY[a.country]?.flag, ...p, metaPurchases: m.metaPurchases, roasMeta: m.roasMeta, q: M.accts[a.id].q, state: marginState(p.cmPct, M.S.econ), thresholds: M.accts[a.id].thresholds, regime: M.regimes[a.country]?.regime };
    });
    const span = Math.max(n, 14);
    const series = daysBetween(addDays(to, -(span - 1)), to).map((d) => {
      const p = M.blended(d, d);
      return { date: d, spend: p.spend, net: p.net, cm: p.cm, cmPct: p.cmPct, orders: p.orders };
    });
    const PRIO = { tracking_guard: 100, margin_floor: 95, stop_propose: 90, cut: 85, intraday: 82, market_shock: 80, fatigue_swap: 70, spend_cap: 65, scale_winner: 60, trim: 55, kill_ad: 50, bench_gap: 40, diversity_low: 30, explore: 20, structure: 15, ad_cap: 10, calendar_boost: 35 };
    const prio = (p) => (PRIO[p.rule] || 0) - (p.kind === "alert" && !["tracking_guard", "margin_floor"].includes(p.rule) ? 60 : 0) + (p.risk === "high" ? 5 : 0);
    const pending = M.proposals.filter((p) => p.status === "proposed" && p.kind !== "alert");
    const alerts = M.proposals.filter((p) => p.status === "proposed").sort((a, b) => prio(b) - prio(a)).slice(0, 5);
    const benchTotals = Object.values(M.bench).reduce((t, b) => ({ bench: t.bench + b.plan.bench, needed: t.needed + b.plan.needed, burning: t.burning + b.plan.burning, soon: t.soon + b.plan.soon }), { bench: 0, needed: 0, burning: 0, soon: 0 });
    const divs = M.adsetModels.filter((s) => s.status === "ACTIVE" && s.activeAds > 0).map((s) => s.diversity.score);
    return {
      today: M.today, range: rangeKey, rangeLabel: RANGES[rangeKey]?.label, from, to, demo, mode: M.S.mode, paused: M.S.paused,
      econ: { floor: M.S.econ.marginFloor, target: M.S.econ.marginTarget },
      kpi: cur, prev, state: marginState(cur.cmPct, M.S.econ), byAccount, series,
      mtd: M.mtd,
      regimes: M.countries.map((c) => ({ country: c, flag: COUNTRY[c]?.flag, name: COUNTRY[c]?.name, regime: M.regimes[c].regime, label: M.regimes[c].label, tone: M.regimes[c].tone, posture: POSTURES[M.regimes[c].posture], text: M.regimes[c].text, reasons: M.regimes[c].reasons })),
      diagnosis: M.diagnosis,
      pendingCount: pending.length,
      pending: pending.slice(0, 5),
      alerts,
      bench: benchTotals,
      diversityAvg: divs.length ? Math.round(divs.reduce((a, b) => a + b, 0) / divs.length) : null,
      nextEvents: M.cal.filter((e) => e.inDays <= 10).slice(0, 6),
      lastRun: (await store.get("meta", "lastRun")) || null,
    };
  }

  async function campaigns(rangeKey = "d7") {
    const M = await model();
    const [from, to] = rangeDates(rangeKey, M.today);
    const propBy = groupBy(M.proposals.filter((p) => p.entity), (p) => p.entity.id);
    const holderBy = Object.fromEntries(M.holders.map((h) => [h.id, h]));
    const metrics = (id, acct) => M.econOf(id, acct, from, to);
    const out = M.accounts.map((a) => ({
      id: a.id, name: a.name, country: a.country, flag: COUNTRY[a.country]?.flag, thresholds: M.accts[a.id].thresholds, q: M.accts[a.id].q,
      m: metrics(a.id, a.id),
      campaigns: M.snap.campaigns.filter((c) => c.account === a.id).map((c) => ({
        id: c.id, name: c.name, status: c.status, budget: c.budget, level: "campaign", m: metrics(c.id, a.id), holder: holderBy[c.id] ? slimHolder(holderBy[c.id]) : null, proposals: propBy.get(c.id) || [],
        adsets: M.adsetModels.filter((s) => s.campaign === c.id).map((s) => ({
          id: s.id, name: s.name, status: s.status, budget: s.budget, level: "adset", learning: s.learning, m: metrics(s.id, a.id), diversity: slimDiv(s.diversity), activeAds: s.activeAds, holder: holderBy[s.id] ? slimHolder(holderBy[s.id]) : null, proposals: propBy.get(s.id) || [],
          ads: M.adModels.filter((x) => x.adset === s.id).map((x) => ({ id: x.id, name: x.name, status: x.status, level: "ad", age: x.age, creative: x.creative, tags: x.cr.tags, hookText: x.cr.hookText, kind: x.cr.kind, m: metrics(x.id, a.id), fatigue: { stage: x.fatigue.stage, score: x.fatigue.score, daysLeft: x.fatigue.daysLeft, text: x.fatigueText }, proposals: propBy.get(x.id) || [] })),
        })),
      })),
    }));
    return { range: rangeKey, from, to, accounts: out, econ: M.S.econ };
  }
  const slimHolder = (h) => ({ sStar: h.sStar, curveB: h.curve?.b, learning: h.learning, isTest: h.isTest, lastChange: h.lastChange, m7: { cmPct: h.m7.cmPct, orders: h.m7.orders, cpo: h.m7.cpo } });
  const slimDiv = (d) => ({ score: d.score, concepts: d.concepts, ads: d.ads, target: d.target, issues: d.issues, missing: d.missing.slice(0, 8), groups: d.groups.map((g) => g.map((c) => c.name || c.id)) });

  async function creatives() {
    const M = await model();
    const liveByCreative = groupBy(M.adModels.filter((x) => x.status === "ACTIVE"), (x) => x.creative);
    const items = M.library.map((c) => {
      const lives = liveByCreative.get(c.id) || [];
      const f = lives.length ? lives.sort((a, b) => b.m3.spend - a.m3.spend)[0].fatigue : null;
      return {
        id: c.id, name: c.name, account: c.account, country: c.country, kind: c.kind, tags: c.tags, hookText: c.hookText, script: c.script, status: lives.length ? "live" : c.status, source: c.source,
        createdAt: c.createdAt, stats: c.stats || null, result: c.result, fatigue: f ? { stage: f.stage, score: f.score, daysLeft: f.daysLeft, text: reasonText(f), flags: f.flags } : null,
        compliance: c.hookText || c.script ? lint({ text: c.hookText, script: c.script, talent: c.tags?.talent, format: c.tags?.format, isAiGenerated: c.source === "studio", language: COUNTRY[c.country]?.lang, angle: c.tags?.angle }) : null,
        provider: c.provider, thumb: c.thumb, videoUrl: c.videoUrl, firstFrame: c.firstFrame, translations: c.translations, novelty: c.novelty,
      };
    });
    const perAccount = M.accounts.map((a) => {
      const live = M.adModels.filter((x) => x.account === a.id && x.status === "ACTIVE");
      return {
        id: a.id, name: a.name, country: a.country, flag: COUNTRY[a.country]?.flag,
        bench: { ...M.bench[a.id].plan, items: M.bench[a.id].items.map((c) => c.id) },
        diversity: slimDiv(diversity(live.map((x) => ({ ...x.cr, id: x.id })), { targetConcepts: 12 })),
        stages: Object.fromEntries(Object.keys(STAGES).map((s) => [s, live.filter((x) => x.fatigue.stage === s).length])),
      };
    });
    const adsets = M.adsetModels.filter((s) => s.status === "ACTIVE").map((s) => ({ id: s.id, name: s.name, account: s.account, diversity: slimDiv(s.diversity), activeAds: s.activeAds }));
    // Coverage matrix angle × format over everything ever made.
    const matrix = {};
    for (const c of M.library) {
      const k = `${c.tags?.angle}|${c.tags?.format}`;
      matrix[k] = (matrix[k] || 0) + 1;
    }
    const insights = Object.fromEntries(M.countries.map((c) => [c, insightsText(M.tags, c)]));
    return { items, perAccount, adsets, matrix, insights, tags: M.tags.filter((t) => t.n >= 1), providers: PROVIDERS, dims: DIMENSIONS.map((d) => ({ key: d.key, label: d.label, values: d.values })) };
  }

  async function autopilot() {
    const M = await model();
    const history = [...M.actionsAll].filter((a) => a.status !== "proposed").sort((a, b) => String(b.decidedAt || b.executedAt).localeCompare(String(a.decidedAt || a.executedAt))).slice(0, 60);
    const outcomes = Object.fromEntries(M.evaluated.map((e) => [e.id, e.outcome]));
    return {
      mode: M.S.mode, modes: MODES, paused: M.S.paused, limits: M.S.limits,
      rules: RULES.map((r) => ({ ...r, on: M.S.rules?.[r.id]?.on ?? r.id !== "calendar_boost", params: { ...r.params, ...(M.S.rules?.[r.id]?.params || {}) }, trust: M.trust[r.id] || null })),
      proposals: M.proposals, history: history.map((h) => ({ ...h, outcome: outcomes[h.id] || h.outcome || null })),
      blended7: M.blended7, mtd: M.mtd, econ: M.S.econ,
    };
  }

  async function market() {
    const M = await model();
    const competitors = (M.snap.competitors || []).map((p) => {
      const ads = p.ads.map((ad) => {
        const days = dayDiff(ad.start, M.today);
        return { ...ad, days };
      });
      const reaches = ads.map((x) => x.reach).sort((a, b) => a - b);
      const q75 = reaches[Math.floor(reaches.length * 0.75)] || Infinity;
      for (const ad of ads) {
        let w = 0;
        if (ad.active && ad.days >= 21) w++;
        if (ad.active && ad.days >= 45) w++;
        if (ad.variants >= 3) w++;
        if (ad.reach >= q75) w++;
        if (ad.countries >= 2) w++;
        ad.winnerScore = w;
        ad.winner = w >= 3;
      }
      const new7 = ads.filter((x) => x.days <= 7).length;
      const burst = new7 >= Math.max(10, 2 * Math.max(1, Math.round(ads.filter((x) => x.days > 7 && x.days <= 63).length / 8)));
      return { ...p, flag: COUNTRY[p.country]?.flag, active: ads.filter((x) => x.active).length, new7, burst, winners: ads.filter((x) => x.winner).length, ads: ads.sort((a, b) => b.winnerScore - a.winnerScore) };
    });
    return {
      today: M.today,
      countries: M.countries.map((c) => ({
        country: c, flag: COUNTRY[c]?.flag, name: COUNTRY[c]?.name,
        ...pickRegime(M.regimes[c]),
        series: M.regimes[c].days.map((d) => ({ date: d.date, cpm: div(d.spend * 1000, d.impressions), ctr: div(d.clicks, d.impressions), opm: div(d.orders * 1000, d.impressions), cvr: div(d.orders, d.sessions), attention: d.attention, trend: d.trend, orders: d.orders, spend: d.spend })),
        headlines: M.snap.headlines?.[c] || [],
        keywords: M.S.keywords[c] || [],
      })),
      diagnosis: M.diagnosis,
      tracking: Object.values(M.tracking),
      calendar: M.cal,
      competitors,
    };
  }
  const pickRegime = (r) => ({ regime: r.regime, label: r.label, tone: r.tone, posture: POSTURES[r.posture], mult: r.mult, text: r.text, reasons: r.reasons || [], changePoint: r.changePoint, metrics: Object.fromEntries(Object.entries(r.metrics || {}).map(([k, v]) => [k, { change: v.change, z: v.z }])) });

  async function learning() {
    const M = await model();
    const radar = (await store.list("radar")).length ? await store.list("radar") : DEFAULT_RADAR;
    return {
      evaluated: M.evaluated.sort((a, b) => b.executedAt.localeCompare(a.executedAt)),
      trust: Object.entries(M.trust).map(([rule, t]) => ({ rule, title: RULES.find((r) => r.id === rule)?.title || rule, ...t })),
      tags: M.tags.filter((t) => t.n >= 1).sort((a, b) => b.rate - a.rate),
      insights: Object.fromEntries(M.countries.map((c) => [c, insightsText(M.tags, c)])),
      radar: radar.sort((a, b) => ["adopt", "trial", "assess", "hold"].indexOf(a.status) - ["adopt", "trial", "assess", "hold"].indexOf(b.status)),
      review: (await store.get("meta", "review")) || null,
    };
  }

  async function settingsView() {
    const S = await settings();
    const M = await model();
    return {
      settings: S, demo,
      accounts: M.snap.accounts.map((a) => ({ ...a, ...(S.accounts[a.id] || {}), vat: S.accounts[a.id]?.vat ?? COUNTRY[a.country]?.vat, rates: M.rates[a.id], q: M.accts[a.id]?.q, thresholds: M.accts[a.id]?.thresholds, econ14: M.accts[a.id]?.econ14 })),
      connections: source.connections ? await source.connections() : { meta: demo ? "demo" : "unknown" },
      fixedPerDay: fixedPerDay(S.econ.fixedMonthly),
    };
  }

  // ---------------------------------------------------------------------------
  // Actions
  async function record(p, status, by, extra = {}) {
    const doc = { ...p, status, by, decidedAt: now().toISOString(), ...extra };
    if (status === "executed") doc.executedAt = doc.decidedAt;
    await store.put("actions", p.id, doc);
    return doc;
  }

  async function execute(p, by, M) {
    const today = M?.today || todayStr(now());
    const tomorrow = addDays(today, 1);
    if (p.kind === "budget") await source.apply({ op: "budget", id: p.entity.id, level: p.entity.level, value: p.to, from: p.from, since: tomorrow });
    else if (p.kind === "pause") await source.apply({ op: "status", id: p.entity.id, level: p.entity.level, value: "PAUSED", since: tomorrow });
    else if (p.kind === "activate") await source.apply({ op: "status", id: p.entity.id, level: p.entity.level, value: "ACTIVE", since: tomorrow });
    else if (p.kind === "swap") {
      await source.apply({ op: "status", id: p.entity.id, level: "ad", value: "PAUSED", since: tomorrow });
      const b = (M?.bench?.[p.entity.account]?.items || [])[0];
      if (b) {
        await source.apply({ op: "launch", creative: b.id, adset: p.adset, since: tomorrow });
        await store.put("creatives", b.id, { ...b, status: "live", launchedAt: now().toISOString() });
      }
    } else if (p.kind === "generate") {
      await briefs({ account: p.account || p.entity?.account, count: Math.min(6, p.count || 3), missing: p.missing, auto: true });
    }
    return record(p, p.kind === "alert" ? "noted" : "executed", by, { evalAt: addDays(today, EVAL_DAYS[p.kind] || 3) });
  }

  async function run({ by = "auto" } = {}) {
    const M = await model();
    if (M.S.paused) return { ran: 0, skipped: "paused" };
    let ran = 0;
    const L = { ...DEFAULT_LIMITS, ...(M.S.limits || {}) };
    for (const p of M.proposals) {
      if (p.status !== "proposed") continue;
      if (!autoRuns(p, M.S.mode)) continue;
      if (ran >= L.maxActionsPerRun) break;
      await execute(p, by, M);
      ran++;
    }
    await store.put("meta", "lastRun", { at: now().toISOString(), ran, mode: M.S.mode });
    return { ran };
  }

  async function approve(id) {
    const M = await model();
    const p = M.proposals.find((x) => x.id === id);
    if (!p) throw Object.assign(new Error("Предложението вече не е актуално."), { status: 404 });
    if (p.status !== "proposed" && p.status !== "blocked") throw Object.assign(new Error("Вече е решено."), { status: 409 });
    return execute(p, "user", M);
  }
  async function reject(id) {
    const M = await model();
    const p = M.proposals.find((x) => x.id === id);
    if (!p) throw Object.assign(new Error("Предложението вече не е актуално."), { status: 404 });
    return record(p, "rejected", "user");
  }

  // Manual change from the campaigns screen.
  async function act({ id, level, kind, value }) {
    const M = await model();
    const ent = [...M.snap.campaigns, ...M.snap.adsets, ...M.snap.ads].find((e) => e.id === id);
    if (!ent) throw Object.assign(new Error("Няма такъв обект."), { status: 404 });
    const L = { ...DEFAULT_LIMITS, ...(M.S.limits || {}) };
    const p = { id: uid("m"), rule: "manual", kind, entity: { id, level, name: ent.name, account: ent.account }, title: "Ръчна промяна", reason: "Направено от теб." };
    if (kind === "budget") {
      const v = Number(value);
      if (!(v >= L.minBudget)) throw Object.assign(new Error(`Бюджетът трябва да е поне ${L.minBudget} €.`), { status: 400 });
      p.from = ent.budget;
      p.to = round(v, 2);
      const jump = ent.budget ? v / ent.budget - 1 : 0;
      if (jump > 0.5) p.warning = "Скок над 50% може да рестартира обучението на Мета.";
    }
    return execute(p, "user", M);
  }

  async function revert24h() {
    const M = await model();
    const since = Date.now() - 24 * 36e5;
    const recent = M.executed.filter((a) => new Date(a.executedAt).getTime() >= since && ["budget", "pause"].includes(a.kind) && a.entity);
    let n = 0;
    for (const a of recent.reverse()) {
      if (a.kind === "budget" && a.from != null) await source.apply({ op: "budget", id: a.entity.id, level: a.entity.level, value: a.from, since: addDays(M.today, 1) });
      if (a.kind === "pause") await source.apply({ op: "status", id: a.entity.id, level: a.entity.level, value: "ACTIVE", since: addDays(M.today, 1) });
      await store.put("actions", a.id, { ...a, status: "reverted", revertedAt: now().toISOString() });
      n++;
    }
    return { reverted: n };
  }

  async function saveSettings(patch) {
    const cur = (await store.get("settings", "main")) || {};
    const next = merge(cur, patch);
    if (patch?.econ?.products) next.econ.products = patch.econ.products;
    if (patch?.econ?.fixedMonthly) next.econ.fixedMonthly = patch.econ.fixedMonthly;
    if (patch?.competitors) next.competitors = patch.competitors;
    if (patch?.calendarCustom) next.calendarCustom = patch.calendarCustom;
    if (patch?.lines) next.lines = patch.lines;
    if (next.mode && !MODES[next.mode]) throw Object.assign(new Error("Непознат режим."), { status: 400 });
    const f = next.econ?.marginFloor, t = next.econ?.marginTarget;
    if ((f != null && (f < 0 || f > 0.8)) || (t != null && (t < 0 || t > 0.9))) throw Object.assign(new Error("Маржът трябва да е между 0 и 80%."), { status: 400 });
    await store.put("settings", "main", next);
    return settings();
  }

  // Import products and fixed costs from the "Табло Печалба" archive.
  async function importTablo(json) {
    const data = json?.data || json;
    if (!data || !Array.isArray(data.products)) throw Object.assign(new Error("Това не е архив от „Табло Печалба“."), { status: 400 });
    const products = data.products.map((p) => ({ name: String(p.name || ""), keys: String(p.keys || p.name || ""), cost: Number(String(p.cost).replace(",", ".")) || 0 })).filter((p) => p.name);
    const fixed = {};
    for (const [k, v] of Object.entries(data.monthlyCosts || {})) fixed[k] = Number(v) || 0;
    await saveSettings({ econ: { products, fixedMonthly: fixed } });
    return { products: products.length, fixed: Object.keys(fixed).length };
  }

  // ---------------------------------------------------------------------------
  // Creatives
  async function saveCreative(c) {
    const id = c.id || uid("cr");
    const prev = (await store.get("creatives", id)) || {};
    const doc = { ...prev, ...c, id, tags: { ...(prev.tags || {}), ...(c.tags || {}) }, updatedAt: now().toISOString() };
    if (!doc.createdAt) doc.createdAt = todayStr(now());
    await store.put("creatives", id, doc);
    return doc;
  }

  async function check(c) {
    const M = await model();
    const res = checkNew({ id: c.id || "new", tags: c.tags || {}, hookText: c.hookText, script: c.script }, M.library);
    const comp = lint({ text: c.hookText, script: c.script, talent: c.tags?.talent, format: c.tags?.format, isAiGenerated: !!c.ai, language: COUNTRY[c.country]?.lang, angle: c.tags?.angle });
    const seen = new Set();
    res.nearest = checkNew({ id: c.id || "new", tags: c.tags || {}, hookText: c.hookText, script: c.script }, M.library, 12).nearest.filter((n) => !seen.has(n.c.name) && seen.add(n.c.name)).slice(0, 3);
    return { score: Math.round(res.score * 100), verdict: res.verdict, nearest: res.nearest.map((n) => ({ id: n.c.id, name: n.c.name, hookText: n.c.hookText, score: Math.round(n.score * 100), tags: n.c.tags })), compliance: comp };
  }

  async function briefs({ account, country, count = 4, product, missing, auto = false }) {
    const M = await model();
    const a = M.accounts.find((x) => x.id === account) || M.accounts.find((x) => x.country === country) || M.accounts[0];
    const ctry = a?.country || country || "BG";
    const avoid = M.library.filter((c) => c.country === ctry).map((c) => c.tags || {});
    let plan = nextBriefs(M.tags, ctry, count, `${M.today}|${account}|${Date.now()}`, avoid);
    // Push missing dimensions (from the diversity check) into the plan.
    (missing || []).forEach((m, i) => {
      if (plan[i]) plan[i].tags[m.dim] = m.value;
    });
    for (const b of plan) {
      b.tags.length = ["ugc", "skit", "talking"].includes(b.tags.format) ? "m" : b.tags.format === "static" || b.tags.format === "carousel" ? "na" : "s";
      b.tags.aspect = b.tags.format === "static" || b.tags.format === "carousel" ? "4x5" : "9x16";
      b.tags.offer = b.tags.angle === "offer" ? "b21" : "none";
      b.tags.language = (COUNTRY[ctry]?.lang || "bg");
    }
    let concepts = null;
    if (ai) {
      try {
        concepts = await ai.briefs(briefPrompt({ country: ctry, product, briefs: plan, library: M.library.filter((c) => c.country === ctry), insights: insightsText(M.tags, ctry) }));
      } catch (e) {
        concepts = null;
      }
    }
    const out = plan.map((b, i) => ({ ...templateConcept(b.tags, ctry, `${M.today}|${i}|${account}`), ...(concepts?.[i] || {}), tags: b.tags, why: b.why }));
    const gated = gate(out, M.library, ctry);
    const saved = [];
    for (const g of gated) {
      if (g.novelty.level === "dup") continue;
      saved.push(await saveCreative({ name: g.title, account: a?.id, country: ctry, kind: ["static", "carousel"].includes(g.tags.format) ? "image" : "video", tags: g.tags, hookText: g.hookText, script: g.script, firstFrame: g.firstFrame, videoPrompt: g.videoPrompt, translations: g.translations, source: "studio", status: "draft", novelty: g.novelty, why: g.why, auto, ai: !!concepts }));
    }
    return { created: saved.length, items: saved, ai: !!concepts };
  }

  async function generate({ id, provider = "minimax-h3" }) {
    const c = await store.get("creatives", id);
    if (!c) throw Object.assign(new Error("Няма такава идея."), { status: 404 });
    const comp = lint({ text: c.hookText, script: c.script, talent: c.tags?.talent, isAiGenerated: true, language: COUNTRY[c.country]?.lang, angle: c.tags?.angle });
    if (!comp.ok) throw Object.assign(new Error("Първо поправи текста – има забранени твърдения."), { status: 422, details: comp.issues });
    if (video) {
      const job = await video.start({ provider, prompt: c.videoPrompt || c.script, aspect: c.tags?.aspect || "9x16", creative: c });
      return saveCreative({ id, status: "generating", provider, job });
    }
    // Demo: the clip is "ready" at once, a human still has to review it.
    return saveCreative({ id, status: "review", provider, thumb: null, generatedAt: now().toISOString() });
  }

  async function approveCreative(id) {
    const c = await store.get("creatives", id);
    if (!c) throw Object.assign(new Error("Няма такъв креатив."), { status: 404 });
    return saveCreative({ id, status: "bench", reviewedAt: now().toISOString() });
  }

  async function launch({ id, adset }) {
    const M = await model();
    const c = M.library.find((x) => x.id === id);
    const as = M.snap.adsets.find((s) => s.id === adset);
    if (!c || !as) throw Object.assign(new Error("Липсва креатив или адсет."), { status: 404 });
    const comp = lint({ text: c.hookText, script: c.script, talent: c.tags?.talent, isAiGenerated: c.source === "studio", language: COUNTRY[c.country]?.lang, angle: c.tags?.angle });
    if (!comp.ok) throw Object.assign(new Error("Текстът има забранени твърдения."), { status: 422 });
    await source.apply({ op: "launch", creative: id, adset, since: addDays(M.today, 1), creativeDoc: c });
    await saveCreative({ id, status: "live", launchedAt: now().toISOString() });
    return record({ id: uid("l"), rule: "manual", kind: "launch", entity: { id: adset, level: "adset", name: as.name, account: as.account }, title: `Пусната: ${c.name}`, reason: "Пусната от теб от резервите." }, "executed", "user");
  }

  async function saveRadar(item) {
    const list = (await store.list("radar")).length ? await store.list("radar") : DEFAULT_RADAR;
    const id = item.id || uid("r");
    const prev = list.find((x) => x.id === id) || {};
    if (!(await store.list("radar")).length) for (const r of DEFAULT_RADAR) await store.put("radar", r.id, r);
    const doc = { ...prev, ...item, id, checkedAt: todayStr(now()) };
    await store.put("radar", id, doc);
    return doc;
  }

  return { settings, model, dashboard, campaigns, creatives, autopilot, market, learning, settingsView, run, approve, reject, act, revert24h, saveSettings, importTablo, saveCreative, check, briefs, generate, approveCreative, launch, saveRadar };
}

// Simple in-memory store (browser demo + tests).
export function memoryStore(initial = {}, onChange = null) {
  const data = initial;
  const coll = (c) => (data[c] ||= {});
  return {
    data,
    async get(c, id) {
      return coll(c)[id] ? structuredClone(coll(c)[id]) : null;
    },
    async put(c, id, v) {
      coll(c)[id] = structuredClone(v);
      onChange?.(data);
    },
    async list(c) {
      return Object.entries(coll(c)).map(([id, v]) => ({ id, ...structuredClone(v) }));
    },
    async del(c, id) {
      delete coll(c)[id];
      onChange?.(data);
    },
  };
}
