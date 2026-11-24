// Microsoft Clarity (Data Export API) for Път на клиента: how the landing pages are used – sessions, how far down
// people scroll, time on the page, rage / dead clicks, quick backs – next to the orders the same pages bring.
// The API gives only the last 1–3 days, as totals (no recordings), at most 10 calls a day per project, so once a day
// (the first sync after 06:00 Sofia) each connected shop is asked three times – by page, by source/medium/campaign
// and by device – for the last 24 hours, and the answer is kept in clarity_days under the day before.
// The token (Clarity → Settings → Data Export → Generate new API token) is kept encrypted in settings `clarity:<shop>`.
import { getSetting, q, setSetting } from "./db.mts";
import { env } from "./http.mts";
import { seal, unseal } from "./secret.mts";
import { inCompany } from "./tenant.mts";

const API = () => (env("CLARITY_API_URL") || "https://www.clarity.ms/export-data/api/v1").replace(/\/$/, "");
// Each call: [kind, the dimensions]. Three of the ten calls a day.
const CALLS: [string, string[]][] = [
  ["url", ["URL"]],
  ["source", ["Source", "Medium", "Campaign"]],
  ["device", ["Device"]],
];
const MAX_CALLS = 8; // a day per project, leaving room for Clarity's own tools

type Conf = { token: string; added_at: string; last_at?: string; last_day?: string; last_error?: string; calls?: { day: string; n: number } };

const sofia = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const sofiaHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hour: "2-digit", hourCycle: "h23" }).format(new Date()));

/** A page address from Clarity → the path, like the landing pages in orders.src ("/komplekt"). */
export function pathOf(url: string): string {
  try {
    const p = new URL(url, "https://x.invalid").pathname.replace(/\/+$/, "");
    return decodeURIComponent(p || "/").slice(0, 200) || "/";
  } catch {
    return String(url || "/").split(/[?#]/)[0].slice(0, 200) || "/";
  }
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const COUNT = /count|views|subtotal/i;

/** Clarity's answer ([{metricName, information: [{…numbers, <dimension>: value}]}]) → rows per key, the metrics of
 * rows with the same key (one page with different ?query) added up: counts summed, the rest weighted by sessions. */
export function parseInsights(data: any, kind: string, dims: string[]): Map<string, Record<string, any>> {
  const keyOf = (info: any) => (kind === "url" ? pathOf(String(info.URL ?? info.Url ?? "")) : dims.map((d) => String(info[d] ?? "")).join("|").slice(0, 300));
  const rawKey = (info: any) => dims.map((d) => String(info[d] ?? "")).join("|");
  const metrics = Array.isArray(data) ? data : [];
  // Sessions per raw row, for the weights.
  const weight = new Map<string, number>();
  for (const m of metrics) {
    if (m?.metricName !== "Traffic") continue;
    for (const info of m.information || []) weight.set(rawKey(info), Math.max(1, (num(info.totalSessionCount) || 0) - (num(info.totalBotSessionCount) || 0)));
  }
  const out = new Map<string, Record<string, any>>();
  for (const m of metrics) {
    const name = String(m?.metricName || "");
    if (!name) continue;
    for (const info of m.information || []) {
      const key = keyOf(info);
      const w = weight.get(rawKey(info)) || 1;
      const row = out.get(key) || {};
      const cur = row[name] || { _w: 0 };
      for (const [f, v] of Object.entries(info)) {
        if (dims.includes(f) || f === "URL") continue;
        const n = num(v);
        if (n === null) continue;
        if (COUNT.test(f)) cur[f] = (cur[f] || 0) + n;
        else cur[f] = ((cur[f] || 0) * cur._w + n * w) / (cur._w + w);
      }
      cur._w += w;
      row[name] = cur;
      out.set(key, row);
    }
  }
  return out;
}

async function call(token: string, dims: string[]) {
  const u = new URL(`${API()}/project-live-insights`);
  u.searchParams.set("numOfDays", "1");
  dims.forEach((d, i) => u.searchParams.set(`dimension${i + 1}`, d));
  const r = await fetch(u, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(8000) });
  if (r.status === 401 || r.status === 403) throw new Error("Clarity не приема ключа (изтекъл или грешен) – направи нов в Clarity → Settings → Data Export.");
  if (r.status === 429) throw new Error("Clarity: стигнат е лимитът от 10 заявки за днес – утре пак.");
  if (!r.ok) throw new Error(`Clarity отговори ${r.status}`);
  return r.json();
}

async function conf(shop: string): Promise<Conf | null> {
  return getSetting<Conf>(`clarity:${shop}`);
}

/** Pull the last 24 h for one shop now (also when it was pulled today: the button after connecting). */
export async function pullShop(shop: string, c?: Conf | null) {
  c ||= await conf(shop);
  if (!c?.token) return { skipped: "not connected" };
  const today = sofia();
  const calls = c.calls?.day === today ? c.calls.n : 0;
  if (calls + CALLS.length > MAX_CALLS) return { skipped: "daily limit" };
  // Pulled in the morning, the last 24 hours are mostly yesterday.
  const day = sofia(new Date(Date.now() - 12 * 3600e3));
  const token = unseal<string>(c.token);
  let n = calls;
  const got: Record<string, number> = {};
  try {
    for (const [kind, dims] of CALLS) {
      n++;
      const rows = parseInsights(await call(token, dims), kind, dims);
      await q(`DELETE FROM clarity_days WHERE shop = $1 AND day = $2::date AND kind = $3`, [shop, day, kind]);
      const list = [...rows.entries()].slice(0, 500);
      for (let i = 0; i < list.length; i += 100) {
        const part = list.slice(i, i + 100);
        const params: unknown[] = [];
        const values = part.map(([key, m]) => {
          params.push(shop, day, kind, key, JSON.stringify(m));
          const k = params.length;
          return `($${k - 4}, $${k - 3}::date, $${k - 2}, $${k - 1}, $${k}::jsonb)`;
        });
        await q(`INSERT INTO clarity_days (shop, day, kind, key, m) VALUES ${values.join(", ")} ON CONFLICT (shop, day, kind, key) DO UPDATE SET m = excluded.m`, params);
      }
      got[kind] = list.length;
    }
    await setSetting(`clarity:${shop}`, { ...c, last_at: new Date().toISOString(), last_day: day, last_error: undefined, calls: { day: today, n } });
    return { day, ...got };
  } catch (e: any) {
    await setSetting(`clarity:${shop}`, { ...c, last_at: new Date().toISOString(), last_error: String(e.message || e).slice(0, 300), calls: { day: today, n } });
    return { error: e.message };
  }
}

/** In the sync: each connected shop of the company once a day, after 06:00 Sofia. */
export async function runClarity(deadline: number) {
  if (sofiaHour() < 6) return { skipped: "night" };
  const shops = await q<any>(`SELECT s.id FROM shops s JOIN settings st ON st.key = 'clarity:' || s.id WHERE ${inCompany("s.id")} AND s.active`);
  const out: Record<string, unknown> = {};
  const day = sofia(new Date(Date.now() - 12 * 3600e3));
  for (const { id } of shops) {
    if (Date.now() > deadline) break;
    const c = await conf(id);
    if (!c?.token || c.last_day === day || (c.last_error && c.calls?.day === sofia())) continue;
    out[id] = await pullShop(id, c);
  }
  return out;
}

/** The shops of the company with their Clarity connection (no token). */
export async function clarityStatus() {
  const shops = await q<any>(`SELECT id, label FROM shops WHERE ${inCompany("id")} AND active ORDER BY position, label`);
  const days = await q<any>(`SELECT shop, count(DISTINCT day)::int AS days, max(day)::text AS last FROM clarity_days WHERE ${inCompany("shop")} GROUP BY 1`);
  return Promise.all(
    shops.map(async (s) => {
      const c = await conf(s.id);
      const d = days.find((x) => x.shop === s.id);
      return { id: s.id, label: s.label, connected: !!c?.token, added_at: c?.added_at || null, last_at: c?.last_at || null, last_day: c?.last_day || null, last_error: c?.last_error || null, days: d?.days || 0, last: d?.last || null };
    }),
  );
}

export async function connectClarity(shop: string, token: string) {
  const old = await conf(shop);
  await setSetting(`clarity:${shop}`, { token: seal(token), added_at: new Date().toISOString(), calls: old?.calls });
  return pullShop(shop);
}

export async function disconnectClarity(shop: string) {
  await q(`DELETE FROM settings WHERE key = $1`, [`clarity:${shop}`]);
}

const pick = (m: any, re: RegExp) => {
  if (!m) return null;
  const k = Object.keys(m).find((f) => f !== "_w" && re.test(f));
  return k ? m[k] : null;
};

/** The landing pages' Clarity numbers for the period: sessions, scroll depth %, active time (s) and the share of
 * sessions with rage / dead clicks and quick backs, per "shop\u0001path". */
export async function clarityPages(from: string, to: string, shop: string, pages: [string, string][]) {
  const params: unknown[] = [from, to];
  if (shop) params.push(shop);
  const rows = await q<any>(
    `SELECT shop, key, m FROM clarity_days WHERE ${inCompany("shop")} AND kind = 'url' AND day BETWEEN $1::date AND $2::date${shop ? " AND shop = $3" : ""}`,
    params,
  );
  const shops = [...new Set(rows.map((r) => r.shop))];
  const want = new Set(pages.map(([s, p]) => `${s}\u0001${pathOf(p)}`));
  const acc = new Map<string, { sessions: number; w: Record<string, [number, number]> }>();
  for (const r of rows) {
    const k = `${r.shop}\u0001${r.key}`;
    if (!want.has(k)) continue;
    const m = r.m || {};
    const t = m.Traffic || {};
    const sessions = Math.max(0, (num(t.totalSessionCount) || 0) - (num(t.totalBotSessionCount) || 0));
    const a = acc.get(k) || { sessions: 0, w: {} };
    a.sessions += sessions;
    const vals: Record<string, number | null> = {
      scroll: pick(m["Scroll Depth"], /scroll|average|depth/i) ?? pick(m["Scroll Depth"], /./),
      active: pick(m["Engagement Time"], /active/i) ?? pick(m["Engagement Time"], /time/i),
      rage: pick(m["Rage Click Count"], /withMetricPercentage|percent/i),
      dead: pick(m["Dead Click Count"], /withMetricPercentage|percent/i),
      quickback: pick(m["Quickback Click"], /withMetricPercentage|percent/i),
      scrolls: pick(m["Excessive Scroll"], /withMetricPercentage|percent/i),
    };
    for (const [f, v] of Object.entries(vals)) {
      if (v == null || !Number.isFinite(Number(v))) continue;
      const [sum, w] = a.w[f] || [0, 0];
      a.w[f] = [sum + Number(v) * Math.max(1, sessions), w + Math.max(1, sessions)];
    }
    acc.set(k, a);
  }
  const out = new Map<string, any>();
  for (const [k, a] of acc) {
    const avg = (f: string) => (a.w[f] ? Math.round((a.w[f][0] / a.w[f][1]) * 10) / 10 : null);
    out.set(k, { sessions: a.sessions, scroll: avg("scroll"), active: avg("active"), rage: avg("rage"), dead: avg("dead"), quickback: avg("quickback"), scrolls: avg("scrolls") });
  }
  return Object.assign(out, { shops });
}
