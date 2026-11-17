// Numbers for the dashboard. All money in EUR, all days in Sofia time.
// Every order is in exactly one stage, so the stages always add up to the total.
import { addDays, sofiaDay } from "./dates.mts";
import { one, q } from "./db.mts";
import { STAGES } from "./orders.mts";
import { countOpenLeads } from "./leads.mts";
import { printQueue } from "./waybills.mts";

export type Filter = { from: string; to: string; region?: "bg" | "abroad" | ""; shop?: string };
type Cell = { n: number; sum: number };

function where(f: Filter, firstParam = 1) {
  const params: unknown[] = [f.from, f.to];
  const parts = [`o.day BETWEEN $${firstParam} AND $${firstParam + 1}`, "s.active"];
  if (f.region === "bg" || f.region === "abroad") {
    params.push(f.region);
    parts.push(`s.region = $${firstParam + params.length - 1}`);
  }
  if (f.shop) {
    params.push(f.shop);
    parts.push(`o.shop = $${firstParam + params.length - 1}`);
  }
  return { sql: parts.join(" AND "), params };
}

const emptyStages = () => Object.fromEntries(STAGES.map((s) => [s, { n: 0, sum: 0 }])) as Record<string, Cell>;
const round = (x: number) => Math.round(x * 100) / 100;

function totalsOf(stages: Record<string, Cell>) {
  const all = Object.values(stages).reduce((a, c) => ({ n: a.n + c.n, sum: a.sum + c.sum }), { n: 0, sum: 0 });
  const done = stages.delivered.n + stages.returned.n;
  return {
    orders: all.n,
    sum: round(all.sum),
    // Of the parcels that already have an outcome, how many were taken.
    takenRate: done ? Math.round((stages.delivered.n / done) * 1000) / 10 : null,
  };
}

export async function dashboard(f: Filter) {
  const w = where(f);
  const base = `FROM orders o JOIN shops s ON s.id = o.shop WHERE ${w.sql}`;
  const [byStage, byShop, byDay, products, refused] = await Promise.all([
    q<any>(`SELECT o.stage, count(*)::int AS n, coalesce(sum(o.total_eur), 0)::float AS sum ${base} GROUP BY o.stage`, w.params),
    q<any>(`SELECT o.shop, o.stage, count(*)::int AS n, coalesce(sum(o.total_eur), 0)::float AS sum ${base} GROUP BY o.shop, o.stage`, w.params),
    q<any>(`SELECT o.day::text AS day, o.stage, count(*)::int AS n, coalesce(sum(o.total_eur), 0)::float AS sum ${base} GROUP BY o.day, o.stage ORDER BY o.day`, w.params),
    q<any>(
      `SELECT it->>'name' AS name, sum(coalesce((it->>'qty')::numeric, 1))::float AS qty,
              round(sum(coalesce((it->>'total')::numeric, 0) / o.fx), 2)::float AS sum
         FROM orders o JOIN shops s ON s.id = o.shop CROSS JOIN LATERAL jsonb_array_elements(o.items) it
        WHERE ${w.sql} AND o.stage <> 'canceled'
        GROUP BY 1 ORDER BY 3 DESC, 2 DESC LIMIT 15`,
      w.params,
    ),
    one<any>(`SELECT count(*)::int AS n ${base} AND o.parcel_status = 'refused'`, w.params),
  ]);

  const stages = emptyStages();
  for (const r of byStage) stages[r.stage] = { n: r.n, sum: round(r.sum) };

  const shopsMeta = await q<any>("SELECT id, label, region, currency FROM shops WHERE active ORDER BY position, id");
  const shopMap = new Map<string, any>();
  for (const r of byShop) {
    if (!shopMap.has(r.shop)) shopMap.set(r.shop, emptyStages());
    shopMap.get(r.shop)[r.stage] = { n: r.n, sum: round(r.sum) };
  }
  const shops = shopsMeta
    .filter((s) => shopMap.has(s.id))
    .map((s) => ({ id: s.id, label: s.label, region: s.region, currency: s.currency, stages: shopMap.get(s.id), ...totalsOf(shopMap.get(s.id)) }))
    .sort((a, b) => b.sum - a.sum);

  const dayMap = new Map<string, Record<string, Cell>>();
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) dayMap.set(d, emptyStages());
  for (const r of byDay) {
    if (!dayMap.has(r.day)) dayMap.set(r.day, emptyStages());
    dayMap.get(r.day)![r.stage] = { n: r.n, sum: round(r.sum) };
  }
  const days = [...dayMap.entries()].map(([day, st]) => ({ day, stages: st, ...totalsOf(st) }));

  return {
    filter: f,
    stages,
    refused: refused?.n || 0,
    ...totalsOf(stages),
    shops,
    days,
    products,
  };
}

/** Today / yesterday / this week / this month / last month at a glance. */
export async function summary(region?: string) {
  const today = sofiaDay(new Date());
  const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -dow);
  const monthStart = today.slice(0, 8) + "01";
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + "01";
  const periods = {
    today: [today, today],
    yesterday: [addDays(today, -1), addDays(today, -1)],
    week: [weekStart, today],
    month: [monthStart, today],
    lastMonth: [lastMonthStart, lastMonthEnd],
  } as Record<string, [string, string]>;
  const params: unknown[] = [];
  const cols: string[] = [];
  for (const [k, [a, b]] of Object.entries(periods)) {
    params.push(a, b);
    const cond = `o.day BETWEEN $${params.length - 1} AND $${params.length}`;
    cols.push(
      `count(*) FILTER (WHERE ${cond})::int AS "${k}_n"`,
      `coalesce(sum(o.total_eur) FILTER (WHERE ${cond}), 0)::float AS "${k}_sum"`,
      `count(*) FILTER (WHERE ${cond} AND o.stage = 'delivered')::int AS "${k}_dn"`,
      `coalesce(sum(o.total_eur) FILTER (WHERE ${cond} AND o.stage = 'delivered'), 0)::float AS "${k}_dsum"`,
      `count(*) FILTER (WHERE ${cond} AND o.stage = 'canceled')::int AS "${k}_cn"`,
    );
  }
  let regionSql = "";
  if (region === "bg" || region === "abroad") {
    params.push(region);
    regionSql = ` AND s.region = $${params.length}`;
  }
  params.push(lastMonthStart);
  const row = await one<any>(`SELECT ${cols.join(", ")} FROM orders o JOIN shops s ON s.id = o.shop WHERE s.active AND o.day >= $${params.length}${regionSql}`, params);
  const out: Record<string, any> = {};
  for (const [k, [from, to]] of Object.entries(periods)) {
    out[k] = { from, to, orders: row?.[`${k}_n`] || 0, sum: round(row?.[`${k}_sum`] || 0), delivered: row?.[`${k}_dn`] || 0, deliveredSum: round(row?.[`${k}_dsum`] || 0), canceled: row?.[`${k}_cn`] || 0 };
  }
  const sync = await one<any>("SELECT max(synced_at) AS at FROM shops WHERE active");
  return { today, periods: out, syncedAt: sync?.at || null };
}

/** The bell in the top bar: orders and leads waiting for someone, and labels waiting for the printer. */
export async function alerts() {
  const [o, leads, print] = await Promise.all([
    one<any>(
      `SELECT count(*) FILTER (WHERE o.confirmed_at IS NULL AND coalesce(o.call->>'state', '') NOT IN ('requested', 'calling'))::int AS unconfirmed,
              count(*) FILTER (WHERE o.confirmed_at IS NULL AND o.call->>'state' IN ('needs_human', 'change_requested', 'callback_later', 'wrong_person', 'wrong_number', 'canceled', 'gave_up'))::int AS ai,
              count(*) FILTER (WHERE o.confirmed_at IS NOT NULL AND o.tracking_no IS NULL AND s.region = 'bg')::int AS to_ship
         FROM orders o JOIN shops s ON s.id = o.shop
        WHERE s.active AND o.stage = 'new' AND o.archived_at IS NULL AND o.ordered_at > now() - interval '30 days'`,
    ),
    countOpenLeads().catch(() => 0),
    printQueue().then((r) => r.length).catch(() => 0),
  ]);
  return { unconfirmed: o?.unconfirmed || 0, ai: o?.ai || 0, toShip: o?.to_ship || 0, leads, toPrint: print };
}
