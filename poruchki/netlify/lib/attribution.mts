// Откъде идват поръчките (like RevOrder's Attribution, but by the parcels really taken – cash on delivery):
//  - attributeOrders(): each new order is tied once to the visit and the ad it came from (through the order form it
//    was typed in: the lead with the same phone, opened up to a day before the order) and the result is written in
//    orders.src, because the visits are deleted after 2 days and the leads after 30.
//  - rollupVisits(): today's and yesterday's visits are counted per landing page, channel and campaign into
//    visit_days, which is kept (the history of the pages).
//  - report(): orders, taken, sent back and money by channel, campaign, ad set, ad and landing page.
import { q } from "./db.mts";
import { inCompany } from "./tenant.mts";
import { channelOf, CHANNELS } from "./visits.mts";

const P9 = (col: string) => `right(regexp_replace(${col}, '\\D', '', 'g'), 9)`;

/** The channel from what is known: the visit's source, else the utm_source / click id of the ad. */
export function channelFrom(source: string, utm: any): string {
  if (source) return channelOf(source);
  if (!utm) return "unknown";
  if (utm.ck === "fbclid") return "meta";
  if (utm.ck === "gclid") return "google_ads";
  if (utm.ck === "ttclid") return "tiktok";
  return utm.s ? channelOf(utm.s) : "unknown";
}

export function srcOf(lead: any): Record<string, unknown> {
  const utm = lead.utm || lead.vutm || null;
  const src: Record<string, unknown> = { channel: channelFrom(lead.vsource || "", utm) };
  if (lead.vsource) src.source = lead.vsource;
  if (utm) {
    if (utm.c) src.campaign = utm.c;
    if (utm.t) src.adset = utm.t;
    if (utm.n) src.ad = utm.n;
    if (utm.id) src.ad_id = utm.id;
    if (utm.m) src.medium = utm.m;
    if (utm.s) src.utm_source = utm.s;
    if (utm.later) src.later = true;
  }
  const page = lead.landing || lead.page;
  if (page) src.page = String(page).slice(0, 200);
  return src;
}

export async function attributeOrders(deadline: number) {
  const done = { tied: 0, phone: 0, unknown: 0 };
  const orders = await q<any>(
    `SELECT o.id, o.shop, o.phone, o.email, o.source, o.ordered_at, o.lead_id FROM orders o
      WHERE ${inCompany("o.shop")} AND o.src IS NULL AND o.stage <> 'abandoned' AND o.ordered_at > now() - interval '4 days'
      ORDER BY o.ordered_at LIMIT 200`,
  );
  for (const o of orders) {
    if (Date.now() > deadline) break;
    let src: Record<string, unknown> | null = null;
    if (o.source === "phone") {
      src = { channel: "calls" };
      done.phone++;
    } else if (o.source === "shop") {
      const [lead] = await q<any>(
        `SELECT l.page, l.utm, v.source AS vsource, v.utm AS vutm, v.landing
           FROM leads l LEFT JOIN visits v ON v.shop = l.shop AND v.sid = l.sid
          WHERE ${inCompany("l.shop")}
            AND ((l.phone <> '' AND $1 <> '' AND ${P9("l.phone")} = ${P9("$1")}) OR (l.email <> '' AND lower($2) = l.email))
            AND l.first_at BETWEEN $3::timestamptz - interval '1 day' AND $3::timestamptz + interval '10 minutes'
          ORDER BY l.last_at DESC LIMIT 1`,
        [o.phone || "", o.email || "", o.ordered_at],
      );
      if (lead) {
        src = srcOf(lead);
        done.tied++;
      } else if (Date.parse(o.ordered_at) < Date.now() - 2 * 3600e3) {
        // The order form never reached us (no c.js on that page, or typed too fast): not known, and not asked again.
        src = { channel: "unknown" };
        done.unknown++;
      }
    } else if (o.source === "abandoned" && o.lead_id) {
      // An abandoned cart confirmed into an order: its own cart knows where it came from.
      const [lead] = await q<any>(
        `SELECT l.page, l.utm, v.source AS vsource, v.utm AS vutm, v.landing
           FROM leads l LEFT JOIN visits v ON v.shop = l.shop AND v.sid = l.sid WHERE l.id = $1 AND ${inCompany("l.shop")}`,
        [o.lead_id],
      );
      src = lead ? { ...srcOf(lead), recovered: true } : { channel: "unknown", recovered: true };
      if (lead) done.tied++;
    } else {
      src = { channel: "manual" };
    }
    if (src) await q("UPDATE orders SET src = $2::jsonb WHERE id = $1 AND src IS NULL", [o.id, JSON.stringify(src)]);
  }
  return done;
}

/** Today's and yesterday's visits (Sofia days) per shop, landing page, channel and campaign. Earlier days are kept as they are. */
export async function rollupVisits() {
  const rows = await q<any>(
    `SELECT v.shop, (v.first_at AT TIME ZONE 'Europe/Sofia')::date::text AS day, coalesce(nullif(v.landing, ''), v.page) AS landing,
            v.source, coalesce(v.utm->>'c', '') AS campaign, v.utm->>'ck' AS ck, v.utm->>'s' AS us,
            count(*)::int AS visits, array_agg(DISTINCT coalesce(nullif(v.vid, ''), v.sid)) AS people,
            count(*) FILTER (WHERE v.reached IN ('checkout', 'filling', 'ordered'))::int AS checkout,
            count(*) FILTER (WHERE v.reached IN ('filling', 'ordered'))::int AS filling,
            count(*) FILTER (WHERE v.reached = 'ordered')::int AS ordered
       FROM visits v
      WHERE ${inCompany("v.shop")} AND v.first_at >= ((now() AT TIME ZONE 'Europe/Sofia')::date - 1) AT TIME ZONE 'Europe/Sofia'
      GROUP BY 1, 2, 3, 4, 5, 6, 7`,
  );
  // The same landing, channel and campaign from different sources (fbclid / utm_source=fb …) are one row.
  const agg = new Map<string, any>();
  for (const r of rows) {
    const channel = channelFrom(r.source || "", r.ck || r.us ? { ck: r.ck, s: r.us } : null);
    const landing = String(r.landing || "/").slice(0, 200);
    const key = [r.shop, r.day, landing, channel, r.campaign].join("\u0001");
    const a = agg.get(key) || { shop: r.shop, day: r.day, landing, channel, campaign: String(r.campaign).slice(0, 120), visits: 0, people: new Set(), checkout: 0, filling: 0, ordered: 0 };
    a.visits += r.visits;
    for (const p of r.people || []) a.people.add(p);
    a.checkout += r.checkout;
    a.filling += r.filling;
    a.ordered += r.ordered;
    agg.set(key, a);
  }
  await q(
    `DELETE FROM visit_days WHERE ${inCompany("shop")} AND day >= (now() AT TIME ZONE 'Europe/Sofia')::date - 1`,
  );
  const list = [...agg.values()];
  for (let i = 0; i < list.length; i += 200) {
    const part = list.slice(i, i + 200);
    const params: unknown[] = [];
    const values = part.map((a) => {
      params.push(a.shop, a.day, a.landing, a.channel, a.campaign, a.visits, a.people.size, a.checkout, a.filling, a.ordered);
      const n = params.length;
      return `($${n - 9}, $${n - 8}::date, $${n - 7}, $${n - 6}, $${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
    });
    await q(
      `INSERT INTO visit_days (shop, day, landing, channel, campaign, visits, people, checkout, filling, ordered) VALUES ${values.join(", ")}
       ON CONFLICT (shop, day, landing, channel, campaign) DO UPDATE SET visits = excluded.visits, people = excluded.people,
         checkout = excluded.checkout, filling = excluded.filling, ordered = excluded.ordered`,
      params,
    );
  }
  return { rows: list.length };
}

const LABEL: Record<string, string> = { ...Object.fromEntries(CHANNELS), unknown: "Неизвестно", manual: "Ръчно въведени", pending: "Още се търси", before: "Преди проследяването" };
// Orders without a source: still looked for (the last 4 days) or from before the tracking began (never looked for).
const CH = `coalesce(o.src->>'channel', CASE WHEN o.ordered_at < now() - interval '4 days' THEN 'before' ELSE 'pending' END)`;

/** The report for the days from–to (Sofia), all shops of the company or one. */
export async function report(from: string, to: string, shop = "") {
  const params: unknown[] = [from, to];
  let shopSql = "";
  if (shop) {
    params.push(shop);
    shopSql = ` AND o.shop = $${params.length}`;
  }
  const inRange = `(o.ordered_at AT TIME ZONE 'Europe/Sofia')::date BETWEEN $1::date AND $2::date`;
  const m = `count(*)::int AS orders,
             count(*) FILTER (WHERE o.stage = 'delivered')::int AS delivered,
             count(*) FILTER (WHERE o.stage = 'returned')::int AS returned,
             count(*) FILTER (WHERE o.stage = 'canceled')::int AS canceled,
             count(*) FILTER (WHERE o.stage IN ('new', 'prepared', 'shipped', 'at_office'))::int AS open,
             coalesce(sum(o.total_eur), 0)::float AS sum,
             coalesce(sum(o.total_eur) FILTER (WHERE o.stage = 'delivered'), 0)::float AS taken`;
  const base = `FROM orders o WHERE ${inCompany("o.shop")} AND ${inRange} AND o.stage NOT IN ('abandoned', 'duplicate', 'archived')${shopSql}`;
  const [channels, ads, pages, visits] = await Promise.all([
    q<any>(`SELECT ${CH} AS channel, ${m} ${base} GROUP BY 1 ORDER BY orders DESC`, params),
    q<any>(
      `SELECT ${CH} AS channel, coalesce(o.src->>'campaign', '') AS campaign, coalesce(o.src->>'adset', '') AS adset,
              coalesce(o.src->>'ad', '') AS ad, max(o.src->>'ad_id') AS ad_id, ${m}
         ${base} AND (o.src ? 'campaign' OR o.src ? 'ad') GROUP BY 1, 2, 3, 4 ORDER BY orders DESC LIMIT 300`,
      params,
    ),
    q<any>(`SELECT o.shop, coalesce(o.src->>'page', '') AS page, ${m} ${base} AND o.src ? 'page' GROUP BY 1, 2 ORDER BY orders DESC LIMIT 200`, params),
    q<any>(
      `SELECT d.shop, d.landing, sum(d.visits)::int AS visits, sum(d.people)::int AS people, sum(d.checkout)::int AS checkout,
              sum(d.filling)::int AS filling, sum(d.ordered)::int AS ordered,
              jsonb_object_agg(d.channel, d.people) FILTER (WHERE d.channel IS NOT NULL) AS by_channel
         FROM (SELECT shop, landing, channel, sum(visits) AS visits, sum(people) AS people, sum(checkout) AS checkout, sum(filling) AS filling, sum(ordered) AS ordered
                 FROM visit_days WHERE ${inCompany("shop")} AND day BETWEEN $1::date AND $2::date${shop ? ` AND shop = $3` : ""}
                GROUP BY 1, 2, 3) d
        GROUP BY 1, 2 ORDER BY people DESC LIMIT 200`,
      params,
    ),
  ]);
  const round = (r: any) => ({ ...r, sum: Math.round(r.sum * 100) / 100, taken: Math.round(r.taken * 100) / 100 });
  const total = channels.reduce((a, r) => a + r.orders, 0);
  const before = channels.filter((r) => r.channel === "before").reduce((a, r) => a + r.orders, 0);
  const tracked = total - before;
  const known = channels.filter((r) => !["unknown", "pending", "manual", "before"].includes(r.channel)).reduce((a, r) => a + r.orders, 0);
  const withAd = ads.reduce((a, r) => a + r.orders, 0);
  // Orders per landing page next to its visits: the page key is the path, the visits know their shop.
  const byPage = new Map(pages.map((p) => [`${p.shop}\u0001${p.page}`, round(p)]));
  return {
    from,
    to,
    labels: LABEL,
    coverage: { total, before, tracked, known, withAd, pct: tracked ? Math.round((known / tracked) * 1000) / 10 : null },
    channels: channels.map(round),
    ads: ads.map(round),
    pages: visits.map((v) => ({ ...v, orders: byPage.get(`${v.shop}\u0001${v.landing}`) || null })),
    pagesNoVisits: pages.filter((p) => !visits.some((v) => v.shop === p.shop && v.landing === p.page)).map(round),
  };
}
