// Live visitors of the shops (Сега в сайтовете): what c.js reports while a shop page is open.
import { q } from "./db.mts";
import { companyId } from "./tenant.mts";

const STAGES = ["browsing", "checkout", "filling", "ordered"] as const;
type Stage = (typeof STAGES)[number];
const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export type Ping = { sid: string; vid: string; page: string; stage: Stage; device: string; source: string; cart: number; value: string; gone: boolean };

export function cleanPing(input: any): Ping | null {
  const sid = clean(input?.sid, 40);
  if (!/^[a-z0-9]{8,40}$/i.test(sid)) return null;
  const vid = clean(input?.vid, 40);
  return {
    sid,
    vid: /^[a-z0-9]{8,40}$/i.test(vid) ? vid : "",
    page: clean(input?.page, 200),
    stage: STAGES.includes(input?.stage) ? input.stage : "browsing",
    device: ["mobile", "tablet", "desktop"].includes(input?.device) ? input.device : "",
    source: clean(input?.source, 60),
    cart: Math.max(0, Math.min(50, Math.trunc(Number(input?.cart) || 0))),
    value: clean(input?.value, 40),
    gone: input?.gone === true,
  };
}

export async function savePing(shop: string, p: Ping, geo: { country?: string; city?: string }) {
  await q(
    `INSERT INTO visits (shop, sid, vid, page, stage, reached, device, source, country, city, cart_lines, value, left_at)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $12 THEN now() END)
     ON CONFLICT (shop, sid) DO UPDATE SET
       vid = CASE WHEN excluded.vid <> '' THEN excluded.vid ELSE visits.vid END,
       pages = visits.pages + CASE WHEN excluded.page <> visits.page AND excluded.page <> '' THEN 1 ELSE 0 END,
       page = CASE WHEN excluded.page <> '' THEN excluded.page ELSE visits.page END,
       stage = excluded.stage,
       reached = CASE WHEN array_position(ARRAY['browsing','checkout','filling','ordered'], excluded.stage)
                         > array_position(ARRAY['browsing','checkout','filling','ordered'], visits.reached)
                      THEN excluded.stage ELSE visits.reached END,
       device = CASE WHEN excluded.device <> '' THEN excluded.device ELSE visits.device END,
       source = CASE WHEN visits.source = '' THEN excluded.source ELSE visits.source END,
       country = CASE WHEN visits.country = '' THEN excluded.country ELSE visits.country END,
       city = CASE WHEN visits.city = '' THEN excluded.city ELSE visits.city END,
       cart_lines = CASE WHEN excluded.cart_lines > 0 THEN excluded.cart_lines ELSE visits.cart_lines END,
       value = CASE WHEN excluded.value <> '' THEN excluded.value ELSE visits.value END,
       last_at = now(),
       left_at = CASE WHEN $12 THEN now() ELSE NULL END`,
    [shop, p.sid, p.vid, p.page, p.stage, p.device, p.source, clean(geo.country, 2).toUpperCase(), clean(geo.city, 60), p.cart, p.value, p.gone],
  );
}

export const purgeVisits = () => q("DELETE FROM visits WHERE last_at < now() - interval '2 days'");

// Online = a sign of life in the last 75 s (the page sends one every ~30 s) and not closed.
const ONLINE = "v.last_at > now() - interval '75 seconds' AND v.left_at IS NULL";

/** What the live page shows: now per shop, the sessions of the last minutes, and today's funnel. */
export async function liveView(minutes = 15) {
  const company = companyId();
  const shops = await q<any>("SELECT id, label FROM shops WHERE company_id = $1 AND active ORDER BY position, id", [company]);
  const [now, sessions, today] = await Promise.all([
    q<any>(
      `SELECT v.shop, count(*)::int AS online,
              count(*) FILTER (WHERE v.stage = 'browsing')::int AS browsing,
              count(*) FILTER (WHERE v.stage = 'checkout')::int AS checkout,
              count(*) FILTER (WHERE v.stage = 'filling')::int AS filling,
              count(*) FILTER (WHERE v.device = 'mobile')::int AS mobile
         FROM visits v JOIN shops s ON s.id = v.shop
        WHERE s.company_id = $1 AND ${ONLINE}
        GROUP BY v.shop`,
      [company],
    ),
    q<any>(
      `SELECT v.shop, s.label AS shop_label, v.sid, left(coalesce(nullif(v.vid, ''), v.sid), 8) AS visitor, v.page, v.stage, v.reached,
              v.device, v.source, v.country, v.city, v.cart_lines, v.value, v.pages, v.first_at, v.last_at,
              (${ONLINE}) AS online, l.name AS lead_name
         FROM visits v JOIN shops s ON s.id = v.shop
         LEFT JOIN leads l ON l.shop = v.shop AND l.sid = v.sid
        WHERE s.company_id = $1 AND v.last_at > now() - make_interval(mins => $2)
        ORDER BY (${ONLINE}) DESC, v.last_at DESC
        LIMIT 200`,
      [company, minutes],
    ),
    q<any>(
      `SELECT v.shop, count(DISTINCT coalesce(nullif(v.vid, ''), v.sid))::int AS people,
              count(*)::int AS visits,
              count(*) FILTER (WHERE v.reached IN ('checkout', 'filling', 'ordered'))::int AS checkout,
              count(*) FILTER (WHERE v.reached IN ('filling', 'ordered'))::int AS filling,
              count(*) FILTER (WHERE v.device = 'mobile')::int AS mobile
         FROM visits v JOIN shops s ON s.id = v.shop
        WHERE s.company_id = $1 AND (v.first_at AT TIME ZONE 'Europe/Sofia')::date = (now() AT TIME ZONE 'Europe/Sofia')::date
        GROUP BY v.shop`,
      [company],
    ),
  ]);
  const orders = await q<any>(
    `SELECT o.shop, count(*)::int AS n FROM orders o JOIN shops s ON s.id = o.shop
      WHERE s.company_id = $1 AND o.day = (now() AT TIME ZONE 'Europe/Sofia')::date GROUP BY o.shop`,
    [company],
  );
  const by = (rows: any[]) => new Map(rows.map((r) => [r.shop, r]));
  const N = by(now);
  const T = by(today);
  const O = by(orders);
  return {
    at: new Date().toISOString(),
    shops: shops.map((s: any) => ({
      id: s.id,
      label: s.label,
      now: N.get(s.id) || { online: 0, browsing: 0, checkout: 0, filling: 0, mobile: 0 },
      today: { ...(T.get(s.id) || { people: 0, visits: 0, checkout: 0, filling: 0, mobile: 0 }), orders: O.get(s.id)?.n || 0 },
    })),
    sessions,
  };
}
