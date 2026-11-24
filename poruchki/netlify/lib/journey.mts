// Път на клиента: how the orders got there. From orders.src (attributeOrders): the channel of the visit with the
// order form (the last touch), and – for orders placed after c.js started remembering the path (24.11.2026) – the
// channel of the first visit, how many visits and days it took, the channels in between and the pages of the last
// visit. Paid ads apart from the rest (Meta: an ad = utm campaign/ad; fbclid alone is also on posts and groups).
// Plus the people per channel (visit_days) for the conversion, when the orders come (hour, weekday) and, if a shop
// is connected to Microsoft Clarity, how its landing pages are used (clarity_days).
import { q } from "./db.mts";
import { inCompany } from "./tenant.mts";
import { fineOfSrc } from "./attribution.mts";
import { clarityPages, pathOf } from "./clarity.mts";

/** id, label, group */
export const FINE: [string, string, string][] = [
  ["meta_ads", "Meta реклама", "paid"],
  ["google_ads", "Google реклама", "paid"],
  ["tiktok_ads", "TikTok реклама", "paid"],
  ["meta_org", "Facebook / Instagram без реклама", "organic"],
  ["tiktok_org", "TikTok без реклама", "organic"],
  ["search", "Търсачки (Google без реклама)", "organic"],
  ["other", "Други сайтове", "organic"],
  ["direct", "Директно", "organic"],
  ["email", "Имейл", "own"],
  ["sms", "SMS", "own"],
  ["viber", "Viber", "own"],
  ["calls", "По телефона", "calls"],
  ["manual", "Ръчно въведени", "unknown"],
  ["unknown", "Неизвестно", "unknown"],
  ["pending", "Още се търси", "unknown"],
  ["before", "Преди проследяването", "unknown"],
];
export const GROUPS: [string, string][] = [
  ["paid", "Платени реклами"],
  ["organic", "Без реклама"],
  ["own", "Наши съобщения"],
  ["calls", "По телефона"],
  ["unknown", "Неизвестно"],
];
const GROUP_OF = new Map(FINE.map(([id, , g]) => [id, g]));
const groupOf = (fine: string) => GROUP_OF.get(fine) || "unknown";
// Channels of the visits (visit_days.channel) → the group, for the conversion per shop.
const VISIT_GROUP: Record<string, string> = { meta: "meta", google_ads: "paid", tiktok: "tiktok", search: "organic", other: "organic", direct: "organic", email: "own", sms: "own", viber: "own" };

type M = { orders: number; delivered: number; returned: number; canceled: number; open: number; sum: number; taken: number };
const zero = (): M => ({ orders: 0, delivered: 0, returned: 0, canceled: 0, open: 0, sum: 0, taken: 0 });
function add(m: M, o: any) {
  m.orders++;
  if (o.stage === "delivered") {
    m.delivered++;
    m.taken += o.total;
  } else if (o.stage === "returned") m.returned++;
  else if (o.stage === "canceled") m.canceled++;
  else m.open++;
  m.sum += o.total;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const done = (m: M) => ({ ...m, sum: r2(m.sum), taken: r2(m.taken) });
const bump = <K,>(map: Map<K, M>, k: K, o: any) => {
  if (!map.has(k)) map.set(k, zero());
  add(map.get(k)!, o);
};
/** "a > a > b > a" → "a > b > a": the same channel twice in a row is one step. */
const steps = (trail: string[]) => trail.filter((x, i) => i === 0 || x !== trail[i - 1]);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const DAYS: [string, number][] = [
  ["До 1 час", 1 / 24],
  ["Същия ден", 1],
  ["1–3 дни", 3],
  ["3–7 дни", 7],
  ["7–30 дни", Infinity],
];

export async function journeyReport(from: string, to: string, shop = "") {
  const params: unknown[] = [from, to];
  let shopSql = "";
  if (shop) {
    params.push(shop);
    shopSql = ` AND o.shop = $${params.length}`;
  }
  const rows = await q<any>(
    `SELECT o.shop, s.label AS shop_label, o.stage, coalesce(o.total_eur, 0)::float AS total, o.ordered_at, o.src,
            o.ordered_at < now() - interval '4 days' AS old,
            extract(hour FROM o.ordered_at AT TIME ZONE 'Europe/Sofia')::int AS hour,
            extract(isodow FROM o.ordered_at AT TIME ZONE 'Europe/Sofia')::int AS dow
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE ${inCompany("o.shop")} AND (o.ordered_at AT TIME ZONE 'Europe/Sofia')::date BETWEEN $1::date AND $2::date
        AND o.stage NOT IN ('abandoned', 'duplicate', 'archived')${shopSql}`,
    params,
  );
  const visits = await q<any>(
    `SELECT shop, channel, sum(people)::int AS people, sum(checkout)::int AS checkout
       FROM visit_days WHERE ${inCompany("shop")} AND day BETWEEN $1::date AND $2::date${shop ? " AND shop = $3" : ""}
      GROUP BY 1, 2`,
    params,
  );

  const total = zero();
  const byGroup = new Map<string, M>();
  const byLast = new Map<string, M>();
  const byFirst = new Map<string, M>();
  const assists = new Map<string, number>();
  const paths = new Map<string, M>();
  const pagePaths = new Map<string, M>();
  const landings = new Map<string, M & { shop: string; page: string }>();
  const touches = new Map<string, M>();
  const speed = new Map<string, M>();
  const hours = Array.from({ length: 24 }, zero);
  const days = Array.from({ length: 7 }, zero);
  const shops = new Map<string, { shop: string; label: string; m: M; groups: Map<string, M>; fine: Map<string, M> }>();
  const dayList: number[] = [];
  const touchList: number[] = [];
  let withTrail = 0;
  let withSrc = 0;
  let since: string | null = null;

  for (const o of rows) {
    const fine = o.src ? fineOfSrc(o.src) : o.old ? "before" : "pending";
    const group = groupOf(fine);
    if (o.src) withSrc++;
    add(total, o);
    bump(byGroup, group, o);
    bump(byLast, fine, o);
    add(hours[o.hour], o);
    add(days[(o.dow + 6) % 7], o);
    if (!shops.has(o.shop)) shops.set(o.shop, { shop: o.shop, label: o.shop_label, m: zero(), groups: new Map(), fine: new Map() });
    const sh = shops.get(o.shop)!;
    add(sh.m, o);
    bump(sh.groups, group, o);
    bump(sh.fine, fine, o);
    if (o.src?.page) {
      const k = `${o.shop}\u0001${o.src.page}`;
      if (!landings.has(k)) landings.set(k, { ...zero(), shop: o.shop, page: o.src.page });
      add(landings.get(k)!, o);
    }
    const trail: string[] = Array.isArray(o.src?.trail) ? o.src.trail : [];
    if (trail.length) {
      withTrail++;
      const at = new Date(o.ordered_at).toISOString();
      if (!since || at < since) since = at;
      const first = o.src.first?.fine || trail[0];
      bump(byFirst, first, o);
      for (const ch of new Set(trail.slice(0, -1))) if (ch !== fine) assists.set(ch, (assists.get(ch) || 0) + 1);
      bump(paths, steps([...trail.slice(0, -1), fine]).join(">"), o);
      const n = Number(o.src.touches) || trail.length;
      touchList.push(n);
      bump(touches, n >= 4 ? "4+" : String(n), o);
      const d = Number(o.src.days);
      if (Number.isFinite(d)) {
        dayList.push(d);
        bump(speed, (DAYS.find(([, max]) => d < max) || DAYS[DAYS.length - 1])[0], o);
      }
    } else if (o.src) {
      // Before the path was remembered: the first visit is the one we know.
      bump(byFirst, fine, o);
    }
    if (Array.isArray(o.src?.path) && o.src.path.length) bump(pagePaths, `${o.shop}\u0001${steps(o.src.path).slice(0, 6).join(" → ")}`, o);
  }

  // People per channel and shop (all visits, also those who did not order), for the conversion.
  const people = new Map<string, { people: number; checkout: number }>();
  for (const v of visits) {
    for (const k of [`${v.shop}\u0001${VISIT_GROUP[v.channel] || "organic"}`, `*\u0001${VISIT_GROUP[v.channel] || "organic"}`, `${v.shop}\u0001*`, "*\u0001*"]) {
      const p = people.get(k) || { people: 0, checkout: 0 };
      p.people += v.people;
      p.checkout += v.checkout;
      people.set(k, p);
    }
  }
  const visitsOf = (shopId: string, key: string) => people.get(`${shopId}\u0001${key}`) || null;

  const list = <K,>(map: Map<K, M>, keyName: string) => [...map.entries()].map(([k, m]) => ({ [keyName]: k, ...done(m) })).sort((a: any, b: any) => b.orders - a.orders);
  const labels = Object.fromEntries([...shops.values()].map((x) => [x.shop, x.label]));
  const landingList = [...landings.values()].map((l) => ({ ...l, sum: r2(l.sum), taken: r2(l.taken) })).sort((a, b) => b.orders - a.orders).slice(0, 40);
  const clarity = await clarityPages(from, to, shop, landingList.map((l) => [l.shop, l.page] as [string, string]));

  return {
    from,
    to,
    fine: FINE.map(([id, label, group]) => ({ id, label, group })),
    groups: GROUPS.map(([id, label]) => ({ id, label })),
    coverage: { total: total.orders, withSrc, withTrail, since },
    total: done(total),
    byGroup: list(byGroup, "group"),
    channels: FINE.map(([id]) => id)
      .filter((id) => byLast.has(id) || byFirst.has(id) || assists.has(id))
      .map((id) => ({ id, last: done(byLast.get(id) || zero()), first: done(byFirst.get(id) || zero()), assists: assists.get(id) || 0 }))
      .sort((a, b) => b.last.orders - a.last.orders || b.first.orders - a.first.orders),
    shops: [...shops.values()]
      .map((s) => ({
        shop: s.shop,
        label: s.label,
        ...done(s.m),
        groups: Object.fromEntries([...s.groups.entries()].map(([g, m]) => [g, done(m)])),
        fine: Object.fromEntries([...s.fine.entries()].map(([f, m]) => [f, done(m)])),
        people: visitsOf(s.shop, "*"),
        peopleBy: Object.fromEntries(["meta", "paid", "tiktok", "organic", "own"].map((g) => [g, visitsOf(s.shop, g)]).filter(([, v]) => v)),
      }))
      .sort((a, b) => b.orders - a.orders),
    people: { all: people.get("*\u0001*") || null, by: Object.fromEntries(["meta", "paid", "tiktok", "organic", "own"].map((g) => [g, people.get(`*\u0001${g}`) || null])) },
    paths: list(paths, "path").slice(0, 15),
    touches: ["1", "2", "3", "4+"].map((k) => ({ n: k, ...done(touches.get(k) || zero()) })),
    speed: DAYS.map(([label]) => ({ label, ...done(speed.get(label) || zero()) })),
    medianDays: median(dayList),
    avgTouches: touchList.length ? r2(touchList.reduce((a, b) => a + b, 0) / touchList.length) : null,
    pagePaths: list(pagePaths, "key")
      .slice(0, 12)
      .map((p: any) => {
        const [s, path] = String(p.key).split("\u0001");
        return { ...p, shop: s, shop_label: labels[s] || s, path };
      }),
    landings: landingList.map((l) => ({ ...l, shop_label: labels[l.shop] || l.shop, clarity: clarity.get(`${l.shop}\u0001${pathOf(l.page)}`) || null })),
    hours: hours.map(done),
    weekdays: days.map(done),
    clarityShops: (clarity as any).shops,
  };
}
