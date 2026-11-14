// Market signals: news attention (GDELT), headlines (Google News RSS),
// optional search interest (SerpApi Google Trends) and competitors (Meta Ad Library).
import { env } from "./http.mts";
import { pgStore } from "./db.mts";
import { adLibrary } from "./meta.mts";

const GDELT_FIPS: Record<string, string> = { BG: "BU", SK: "LO", SI: "SI", HU: "HU" };
const NEWS: Record<string, string> = { BG: "hl=bg&gl=BG&ceid=BG:bg", SK: "hl=sk&gl=SK&ceid=SK:sk", SI: "hl=sl&gl=SI&ceid=SI:sl", HU: "hl=hu&gl=HU&ceid=HU:hu" };

async function getJson(url: string, ms = 8_000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "user-agent": "pilot-ads/0.1 (+internal tool)" } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// Daily article volume from national sources, normalised (share of all monitored articles).
export async function attention(country: string) {
  const fips = GDELT_FIPS[country];
  const j: any = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=sourcecountry:${fips}&mode=timelinevolraw&timespan=60d&format=json`);
  const series = j?.timeline?.[0]?.data || [];
  const byDay: Record<string, { v: number; n: number }> = {};
  for (const p of series) {
    const d = String(p.date).slice(0, 8);
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const x = (byDay[date] ||= { v: 0, n: 0 });
    x.v += Number(p.value) || 0;
    x.n += Number(p.norm) || 0;
  }
  const vals = Object.entries(byDay).map(([date, x]) => ({ date, raw: x.v, attention: x.n ? x.v / x.n : x.v }));
  const mean = vals.reduce((t, x) => t + x.attention, 0) / Math.max(1, vals.length);
  return vals.map((x) => ({ date: x.date, attention: mean ? Math.round((x.attention / mean) * 100) / 100 : 1 }));
}

export async function headlines(country: string) {
  const r = await fetch(`https://news.google.com/rss?${NEWS[country]}`, { signal: AbortSignal.timeout(7_000) });
  const xml = await r.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);
  const tag = (s: string, t: string) => (s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  return items.map((m) => ({ title: tag(m[1], "title"), when: new Date(tag(m[1], "pubDate") || Date.now()).toISOString().slice(0, 10), volume: 1 }));
}

export async function trends(country: string, keywords: string[]) {
  const key = env("SERPAPI_KEY");
  if (!key || !keywords.length) return null;
  const j: any = await getJson(`https://serpapi.com/search.json?engine=google_trends&data_type=TIMESERIES&date=today%203-m&geo=${country}&q=${encodeURIComponent(keywords.slice(0, 5).join(","))}&api_key=${key}`, 20_000);
  return (j?.interest_over_time?.timeline_data || []).map((p: any) => ({
    date: new Date(Number(p.timestamp) * 1000).toISOString().slice(0, 10),
    trend: (p.values || []).reduce((t: number, v: any) => t + (Number(v.extracted_value) || 0), 0),
  }));
}

// Merge everything into the per-country series the service reads.
export async function refreshMarket(countries: string[], keywords: Record<string, string[]>) {
  const out: Record<string, string> = {};
  // All countries in parallel – a scheduled function has about 30 seconds.
  await Promise.allSettled(countries.map((c) => refreshCountry(c, keywords, out)));
  return out;
}

async function refreshCountry(c: string, keywords: Record<string, string[]>, out: Record<string, string>) {
  {
    const prev: any = (await pgStore.get("market", c)) || { series: [] };
    const byDate: Record<string, any> = Object.fromEntries((prev.series || []).map((x: any) => [x.date, x]));
    try {
      for (const a of await attention(c)) byDate[a.date] = { ...(byDate[a.date] || { date: a.date }), attention: a.attention };
      out[c] = "ok";
    } catch (e: any) {
      out[c] = `gdelt ${e.message}`;
    }
    try {
      const t = await trends(c, keywords[c] || []);
      if (t) for (const x of t) byDate[x.date] = { ...(byDate[x.date] || { date: x.date }), trend: x.trend };
    } catch {}
    let heads = prev.headlines || [];
    try {
      heads = await headlines(c);
    } catch {}
    const series = Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(-120);
    await pgStore.put("market", c, { series, headlines: heads, at: new Date().toISOString() });
  }
}

// Competitors: tracked pages plus discovery by keywords (pages seen 3+ times).
export async function refreshCompetitors(settings: any, deadline = Date.now() + 20_000) {
  const countries = ["BG", "SK", "SI", "HU"];
  const seen: Record<string, { name: string; country: string; n: number }> = {};
  await Promise.allSettled(
    countries.flatMap((c) =>
      (settings.keywords?.[c] || []).slice(0, 3).map(async (kw: string) => {
        for (const ad of await adLibrary({ terms: kw, countries: [c] })) {
          const s = (seen[ad.page_id] ||= { name: ad.page_name, country: c, n: 0 });
          s.n++;
        }
      }),
    ),
  );
  const tracked = new Map<string, { pageId: string; name: string; country: string }>();
  for (const t of settings.competitors || []) tracked.set(String(t.pageId), t);
  for (const [id, s] of Object.entries(seen)) if (s.n >= 3 && !tracked.has(id)) tracked.set(id, { pageId: id, name: s.name, country: s.country });
  const ids = [...tracked.keys()];
  for (let i = 0; i < ids.length; i += 10) {
    if (Date.now() > deadline) break;
    const chunk = ids.slice(i, i + 10);
    let ads: any[] = [];
    try {
      ads = await adLibrary({ pageIds: chunk, countries });
    } catch {
      continue;
    }
    for (const id of chunk) {
      const t = tracked.get(id)!;
      const mine = ads.filter((a) => a.page_id === id);
      const groups = new Map<string, number>();
      for (const a of mine) {
        const k = (a.ad_creative_bodies?.[0] || "").slice(0, 60);
        groups.set(k, (groups.get(k) || 0) + 1);
      }
      await pgStore.put("competitors", id, {
        id, name: t.name, country: t.country,
        ads: mine.slice(0, 80).map((a) => ({
          id: a.id, start: String(a.ad_delivery_start_time || "").slice(0, 10), active: !a.ad_delivery_stop_time, text: a.ad_creative_bodies?.[0] || a.ad_creative_link_titles?.[0] || "",
          angle: null, format: null, variants: groups.get((a.ad_creative_bodies?.[0] || "").slice(0, 60)) || 1, reach: Number(a.eu_total_reach) || 0, countries: 1, offer: "", snapshot: a.ad_snapshot_url,
        })),
        at: new Date().toISOString(),
      });
    }
  }
  return { tracked: ids.length };
}
