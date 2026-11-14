// Profit-first economics for a cash-on-delivery shop.
// Everything is computed on NET revenue (without VAT) and on EXPECTED delivered orders,
// because a COD order is only money once the courier hands it over.
import { sum, div, dayDiff, addDays } from "./util.js";

export const COUNTRY = {
  BG: { name: "България", flag: "🇧🇬", vat: 0.2, lang: "bg", langName: "български" },
  SK: { name: "Словакия", flag: "🇸🇰", vat: 0.23, lang: "sk", langName: "словашки" },
  SI: { name: "Словения", flag: "🇸🇮", vat: 0.22, lang: "sl", langName: "словенски" },
  HU: { name: "Унгария", flag: "🇭🇺", vat: 0.27, lang: "hu", langName: "унгарски" },
};

export function productFor(name, products) {
  const n = String(name || "").toLowerCase();
  let best = null, bestLen = 0;
  for (const p of products || []) {
    for (const k of String(p.keys || p.name || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (n.includes(k) && k.length > bestLen) {
        best = p;
        bestLen = k.length;
      }
    }
  }
  return best;
}

// Historical confirm / delivery rates from final orders older than `matureDays`.
// confirm = share of orders that were not cancelled before shipping;
// deliver = share of shipped orders that ended completed (not refused at the door).
export function deliveryRates(orders, today, matureDays = 12) {
  const mature = orders.filter((o) => dayDiff(o.date, today) >= matureDays);
  const decided = mature.filter((o) => o.status !== "p");
  const cancelledBefore = decided.filter((o) => o.status === "x" && !o.shipped).length;
  const shipped = decided.filter((o) => o.shipped);
  const refused = shipped.filter((o) => o.status === "x").length;
  const n1 = decided.length, n2 = shipped.length;
  // Shrink towards sensible priors when history is thin.
  const confirm = (n1 - cancelledBefore + 0.9 * 20) / (n1 + 20);
  const deliver = (n2 - refused + 0.88 * 20) / (n2 + 20);
  return { confirm, deliver, sample: n1 };
}

// Probability that an order turns into cash, given its current status.
export function cashProbability(o, rates) {
  if (o.status === "c") return 1;
  if (o.status === "x") return 0;
  if (o.status === "a") return o.shipped ? rates.deliver : 0;
  if (o.shipped || o.status === "s") return rates.deliver;
  return rates.confirm * rates.deliver;
}

// Unit economics of one order. `acct` carries VAT, courier and COD fee for its country.
export function orderEconomics(o, acct, econ, rates) {
  const p = cashProbability(o, rates);
  const vat = acct.vat ?? COUNTRY[acct.country]?.vat ?? 0.2;
  const gross = o.total || 0;
  let cogs = 0;
  for (const it of o.items || []) {
    const prod = productFor(it.product, econ.products);
    const unit = prod ? Number(prod.cost) || 0 : (it.total / Math.max(1, it.qty)) * (econ.defaultCogsPct ?? 0.3);
    cogs += unit * (it.qty || 1);
  }
  const willShip = o.status === "x" && !o.shipped ? 0 : o.shipped || o.status === "s" || o.status === "c" ? 1 : rates.confirm;
  const courier = (acct.courier ?? 4) * willShip;
  const refusedCost = (acct.returnCost ?? 3) * willShip * (1 - (o.status === "c" ? 1 : rates.deliver));
  const codFee = gross * (acct.codFeePct ?? 0.012) * p;
  return {
    p,
    gross: gross * p,
    net: (gross / (1 + vat)) * p,
    cogs: cogs * p, // a refused parcel comes back to stock, so only delivered goods cost us
    fulfil: courier + refusedCost + codFee,
  };
}

// Totals for a set of orders + ad spend.
export function profit({ orders = [], spend = 0, accts = {}, econ, rates, fixed = 0 }) {
  let gross = 0, net = 0, cogs = 0, fulfil = 0, expected = 0;
  for (const o of orders) {
    const a = accts[o.account] || {};
    const e = orderEconomics(o, a, econ, rates[o.account] || rates._ || { confirm: 0.9, deliver: 0.88 });
    gross += e.gross;
    net += e.net;
    cogs += e.cogs;
    fulfil += e.fulfil;
    expected += e.p;
  }
  const contrib = net - cogs - fulfil; // before ads
  const cm = contrib - spend;
  return {
    orders: orders.length,
    expected,
    gross,
    net,
    cogs,
    fulfil,
    spend,
    contrib,
    cm,
    cmPct: div(cm, net),
    profit: cm - fixed,
    fixed,
    mer: div(net, spend),
    poas: div(contrib, spend),
    cpo: div(spend, orders.length),
    aovNet: div(net, expected),
    varPct: div(cogs + fulfil, net),
  };
}

// Break-even and target ROAS / CPA for an account, from its recent economics.
// ROAS here is NET revenue / spend; we also give the equivalent "Meta ROAS" on gross.
export function thresholds(p, econ, vat = 0.2) {
  const varPct = Number.isFinite(p.varPct) ? p.varPct : 0.45;
  const floor = econ.marginFloor ?? 0.25, target = econ.marginTarget ?? 0.3;
  const room = (m) => 1 - varPct - m;
  const beRoas = div(1, room(0));
  const floorRoas = room(floor) > 0 ? 1 / room(floor) : Infinity;
  const targetRoas = room(target) > 0 ? 1 / room(target) : Infinity;
  const netPerOrder = div(p.net, p.orders); // expected net per raw order (delivery risk included)
  return {
    varPct,
    beRoas,
    floorRoas,
    targetRoas,
    beRoasGross: beRoas * (1 + vat),
    targetRoasGross: targetRoas * (1 + vat),
    netPerOrder,
    // Max cost per RAW order (as counted in the shop) that still keeps the margin.
    maxCpaFloor: netPerOrder * room(floor),
    maxCpaTarget: netPerOrder * room(target),
    maxCpaBreakEven: netPerOrder * room(0),
  };
}

// Meta under- or over-counts COD purchases. factor = real shop orders / Meta purchases.
export function calibration(realOrders, metaPurchases) {
  // Bayesian shrink towards 1 so one quiet day does not swing everything.
  return (realOrders + 5) / (metaPurchases + 5);
}

// Estimated profit of one campaign / ad set / ad from its spend and Meta purchases.
export function entityProfit(spend, metaPurchases, acctEcon) {
  const orders = metaPurchases * (acctEcon.factor || 1);
  const net = orders * (acctEcon.netPerOrder || 0);
  const varCost = net * (acctEcon.varPct ?? 0.45);
  const cm = net - varCost - spend;
  return { orders, net, cm, cmPct: div(cm, net), cpo: div(spend, orders), roasNet: div(net, spend) };
}

export function fixedPerDay(fixedMonthly) {
  return sum(Object.values(fixedMonthly || {}).map(Number)) / 30.4;
}

export function marginState(cmPct, econ) {
  if (!Number.isFinite(cmPct)) return "none";
  if (cmPct >= (econ.marginTarget ?? 0.3)) return "good";
  if (cmPct >= (econ.marginFloor ?? 0.25)) return "ok";
  if (cmPct >= 0) return "low";
  return "loss";
}

export const lastNDays = (today, n, skipToday = false) => {
  const end = skipToday ? addDays(today, -1) : today;
  return [addDays(end, -(n - 1)), end];
};

// Diminishing returns: orders = a · spend^b, fitted on daily (spend, orders) pairs in log space,
// with b shrunk towards 0.7 (sd 0.15) because a few weeks of noisy days say little.
// Returns the max profitable daily spend S* = min(S_profit, S_floor).
export function spendCurve(points, E, cpaMax) {
  const pts = points.filter((p) => p.spend > 1 && p.orders > 0);
  if (pts.length < 5 || !(E > 0)) return null;
  const xs = pts.map((p) => Math.log(p.spend)), ys = pts.map((p) => Math.log(p.orders));
  // Without real variation in spend the curve cannot be read – better no answer than a wrong one.
  const sdx = Math.sqrt(xs.reduce((t, x, i, a) => t + (x - a.reduce((u, v) => u + v, 0) / a.length) ** 2, 0) / xs.length);
  if (sdx < 0.15) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const bOls = sxx > 1e-6 ? sxy / sxx : 0.7;
  const resid = ys.map((y, i) => y - (my + bOls * (xs[i] - mx)));
  const s2 = resid.reduce((t, r) => t + r * r, 0) / Math.max(1, xs.length - 2);
  const varOls = sxx > 1e-6 ? s2 / sxx : 1;
  const prior = 0.7, varPrior = 0.15 ** 2;
  let b = (bOls / varOls + prior / varPrior) / (1 / varOls + 1 / varPrior);
  b = Math.min(0.95, Math.max(0.3, b));
  const a = Math.exp(my - b * mx);
  const sProfit = Math.pow(a * b * E, 1 / (1 - b));
  const sFloor = cpaMax > 0 ? Math.pow(a * cpaMax, 1 / (1 - b)) : Infinity;
  return { a, b, sProfit, sFloor, sStar: Math.min(sProfit, sFloor), n: pts.length };
}
