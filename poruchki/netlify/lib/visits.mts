// Live visitors of the shops (Сега в сайтовете): what c.js reports while a shop page is open.
import { q } from "./db.mts";
import { companyId } from "./tenant.mts";

const STAGES = ["browsing", "checkout", "filling", "ordered"] as const;
type Stage = (typeof STAGES)[number];
const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export type Utm = { s?: string; m?: string; c?: string; t?: string; n?: string; id?: string; ck?: string; later?: boolean };
export type Ping = { sid: string; vid: string; page: string; stage: Stage; device: string; source: string; cart: number; value: string; gone: boolean; utm: Utm | null };

/** The ad a visit came from: utm_source/medium/campaign/term/content, an ad id and which click id (fbclid, gclid, ttclid). */
export function cleanUtm(input: any): Utm | null {
  if (!input || typeof input !== "object") return null;
  const u: Utm = {};
  for (const k of ["s", "m", "c", "t", "n", "id"] as const) {
    const v = clean(input[k], k === "id" ? 40 : 120);
    if (v) u[k] = v;
  }
  const ck = clean(input.ck, 10);
  if (["fbclid", "gclid", "ttclid"].includes(ck)) u.ck = ck;
  if (!Object.keys(u).length) return null;
  if (input.later === true) u.later = true; // from an earlier visit in the last 7 days, not this one
  return u;
}

/** One earlier visit of the same browser (c.js `pr_trail`): when (unix s), from where, the first page, the ad. */
export type Touch = { t: number; s: string; p: string; u?: Utm };

/** The browser's visits in the last 30 days (at most 8, oldest first), as c.js sends them with the order form. */
export function cleanTrail(input: any): Touch[] | null {
  if (!Array.isArray(input)) return null;
  const now = Date.now() / 1000;
  const out: Touch[] = [];
  for (const x of input.slice(0, 8)) {
    const t = Math.trunc(Number(x?.t));
    if (!Number.isFinite(t) || t < now - 31 * 86400 || t > now + 86400) continue;
    const touch: Touch = { t, s: clean(x?.s, 60), p: clean(x?.p, 80) };
    const u = cleanUtm(x?.u);
    if (u) {
      delete u.later;
      touch.u = u;
    }
    out.push(touch);
  }
  out.sort((a, b) => a.t - b.t);
  return out.length ? out : null;
}

/** The pages of the visit with the order form, in order (at most 12). */
export function cleanPath(input: any): string[] | null {
  if (!Array.isArray(input)) return null;
  const out = input.slice(0, 12).map((p: unknown) => clean(p, 80)).filter(Boolean);
  return out.length ? out : null;
}

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
    utm: cleanUtm(input?.utm),
  };
}

const RANK: Record<string, number> = { browsing: 0, checkout: 1, filling: 2, ordered: 3 };

export async function savePing(shop: string, p: Ping, geo: { country?: string; city?: string }) {
  const [row] = await q<any>(
    `WITH old AS (SELECT reached FROM visits WHERE shop = $1 AND sid = $2), up AS (
     INSERT INTO visits (shop, sid, vid, page, landing, stage, reached, device, source, country, city, cart_lines, value, left_at, utm)
     VALUES ($1, $2, $3, $4, $4, $5, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $12 THEN now() END, $13::jsonb)
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
       left_at = CASE WHEN $12 THEN now() ELSE NULL END,
       landing = CASE WHEN visits.landing = '' THEN excluded.landing ELSE visits.landing END,
       utm = coalesce(visits.utm, excluded.utm)
     RETURNING reached, country, city, source, device)
     SELECT (SELECT reached FROM old) AS was, up.* FROM up`,
    [shop, p.sid, p.vid, p.page, p.stage, p.device, p.source, clean(geo.country, 2).toUpperCase(), clean(geo.city, 60), p.cart, p.value, p.gone, p.utm ? JSON.stringify(p.utm) : null],
  );
  if (!row) return;
  // The live feed: a new visitor, or one who went further (form, typing, ordered).
  const kinds = row.was == null ? ["came", ...(RANK[row.reached] > 0 ? [row.reached] : [])] : RANK[row.reached] > RANK[row.was] ? [row.reached] : [];
  for (const kind of kinds)
    await q("INSERT INTO visit_events (shop, sid, kind, country, city, source, device) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
      shop, p.sid, kind, row.country, row.city, row.source, row.device,
    ]);
}

/** The marketing channel of a visit, from where it came (c.js: fbclid, gclid, utm_source, referrer). */
export const CHANNELS = [
  ["meta", "Meta"],
  ["google_ads", "Google Ads"],
  ["tiktok", "TikTok"],
  ["search", "Търсачки"],
  ["email", "Имейл"],
  ["sms", "SMS"],
  ["viber", "Viber"],
  ["calls", "Кол център"],
  ["other", "Други сайтове"],
  ["direct", "Директно"],
] as const;
export function channelOf(source: string): string {
  const s = String(source || "").toLowerCase();
  if (!s || s === "директно") return "direct";
  if (/facebook|instagram|^fb|^ig|meta/.test(s)) return "meta";
  if (/google реклама|google ads|adwords|^cpc$/.test(s)) return "google_ads";
  if (/tiktok/.test(s)) return "tiktok";
  if (/viber/.test(s)) return "viber";
  if (/^sms|smsapi/.test(s)) return "sms";
  if (/mail|newsletter|brevo|klaviyo|mailchimp|sendinblue/.test(s)) return "email";
  if (/^(google|bing|yahoo|duckduckgo|yandex|search\.|ecosia|seznam)/.test(s)) return "search";
  return "other";
}

export const purgeVisits = async () => {
  await q("DELETE FROM visits WHERE last_at < now() - interval '2 days'");
  await q("DELETE FROM visit_events WHERE at < now() - interval '2 days'");
};

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
  // Today's orders with the channel of the visit that typed the same phone in the form (via the unfinished-order row).
  // Phone orders (the AI agent) are the call centre.
  const attributed = await q<any>(
    `SELECT o.id, o.shop, o.order_no, o.total_eur::float AS total, o.ordered_at, o.city, o.source AS made, a.source
       FROM orders o JOIN shops s ON s.id = o.shop
       LEFT JOIN LATERAL (
         SELECT v.source FROM leads l JOIN visits v ON v.shop = l.shop AND v.sid = l.sid
          WHERE l.shop IN (SELECT id FROM shops WHERE company_id = $1)
            AND right(regexp_replace(l.phone, '\\D', '', 'g'), 9) = right(regexp_replace(o.phone, '\\D', '', 'g'), 9)
            AND l.first_at BETWEEN o.ordered_at - interval '1 day' AND o.ordered_at + interval '10 minutes'
          ORDER BY l.last_at DESC LIMIT 1) a ON true
      WHERE s.company_id = $1 AND o.day = (now() AT TIME ZONE 'Europe/Sofia')::date`,
    [company],
  );
  const chOfOrder = (o: any) => (o.made === "phone" ? "calls" : o.source != null ? channelOf(o.source) : "unknown");
  const channels = new Map<string, { id: string; label: string; now: number; form: number; orders: number; sum: number }>(
    [...CHANNELS, ["unknown", "Неизвестен"] as const].map(([id, label]) => [id, { id, label, now: 0, form: 0, orders: 0, sum: 0 }]),
  );
  for (const x of sessions) {
    x.channel = channelOf(x.source);
    if (!x.online) continue;
    const c = channels.get(x.channel)!;
    c.now++;
    if (x.stage === "checkout" || x.stage === "filling") c.form++;
  }
  for (const o of attributed) {
    const c = channels.get(chOfOrder(o))!;
    c.orders++;
    c.sum = Math.round((c.sum + (Number(o.total) || 0)) * 100) / 100;
  }
  // The feed: visits moving on, and today's orders (last 3 hours, newest first).
  const events = await q<any>(
    `SELECT e.kind, e.shop, s.label AS shop_label, e.country, e.city, e.source, e.device, e.at
       FROM visit_events e JOIN shops s ON s.id = e.shop
      WHERE s.company_id = $1 AND e.at > now() - interval '3 hours'
      ORDER BY e.at DESC LIMIT 60`,
    [company],
  );
  const labels = new Map(shops.map((s: any) => [s.id, s.label]));
  const feed = [
    ...events.map((e: any) => ({ ...e, channel: channelOf(e.source) })),
    ...attributed
      .filter((o: any) => Date.now() - Date.parse(o.ordered_at) < 3 * 3600e3)
      .map((o: any) => ({ kind: "order", shop: o.shop, shop_label: labels.get(o.shop) || o.shop, city: o.city, country: "", source: o.source || "", channel: chOfOrder(o), at: o.ordered_at, order_no: o.order_no, total: o.total, id: Number(o.id) })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 50);

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
    channels: [...channels.values()].filter((c) => c.id !== "unknown" || c.orders > 0),
    feed,
  };
}
