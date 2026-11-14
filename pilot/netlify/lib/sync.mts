// Background synchronisation, time-boxed so it fits in a scheduled function.
import { q, pgStore } from "./db.mts";
import * as meta from "./meta.mts";
import * as sales from "./sales.mts";
import * as video from "./video.mts";
import { realAccounts } from "./live-source.mts";
import { env } from "./http.mts";

const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// One multi-row statement per 200 rows instead of one query per row.
async function upsertInsights(rows: any[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const vals: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      vals.push(r.ad, r.date, r.account, r.adset, r.campaign, JSON.stringify(r));
      const n = (k: number) => "$" + (j * 6 + k);
      return `(${n(1)},${n(2)},${n(3)},${n(4)},${n(5)},${n(6)},now())`;
    });
    await q(
      `INSERT INTO insights (ad, date, account, adset, campaign, data, synced_at) VALUES ${tuples.join(",")}
       ON CONFLICT (ad, date) DO UPDATE SET data = EXCLUDED.data, adset = EXCLUDED.adset, campaign = EXCLUDED.campaign, synced_at = now()`,
      vals,
    );
  }
}

export async function syncMeta(deadline: number) {
  if (!env("META_TOKEN")) return { skipped: "no META_TOKEN" };
  const sync: any = (await pgStore.get("meta", "sync")) || {};
  const today = todayStr();
  try {
    const list = await meta.accounts();
    await pgStore.put("meta", "accounts", { list, at: new Date().toISOString() });
    const accounts = await realAccounts();
    for (const a of accounts) {
      if (Date.now() > deadline) break;
      const cur: any = (await pgStore.get("backfill", a.id)) || {};
      // Campaigns, ad sets and ads change rarely – refresh them at most every 50 minutes.
      if (!cur.structureAt || Date.now() - new Date(cur.structureAt).getTime() > 50 * 60_000) {
        await pgStore.put("structure", a.id, await meta.structure(a));
        cur.structureAt = new Date().toISOString();
      }
      // Today and yesterday every run (attributed numbers keep moving).
      await upsertInsights(await meta.insights(a.id, addDays(today, -1), today));
      // Once a day re-pull the last 7 days; and backfill 60 days in 7-day steps.
      if (cur.dailyOn !== today && Date.now() < deadline) {
        await upsertInsights(await meta.insights(a.id, addDays(today, -8), addDays(today, -2)));
        cur.dailyOn = today;
      }
      const oldest = cur.oldest || addDays(today, -8);
      if (oldest > addDays(today, -60) && Date.now() < deadline) {
        const from = addDays(oldest, -7);
        await upsertInsights(await meta.insights(a.id, from, addDays(oldest, -1)));
        cur.oldest = from;
      }
      await pgStore.put("backfill", a.id, cur);
    }
    await pgStore.put("meta", "sync", { ...sync, metaAt: new Date().toISOString(), metaError: null, util: meta.usage() });
    return { accounts: accounts.length };
  } catch (e: any) {
    await pgStore.put("meta", "sync", { ...sync, metaError: meta.explain(e) });
    throw e;
  }
}

export async function syncSales() {
  const sync: any = (await pgStore.get("meta", "sync")) || {};
  if (!sales.salesConfigured()) return { skipped: "no sales source" };
  const today = todayStr();
  try {
    // Recent days every run; the last 60 days once a day (statuses change for weeks with COD).
    const full = sync.salesFullOn !== today;
    const r = await sales.pull(addDays(today, full ? -60 : -3), today);
    await pgStore.put("meta", "sync", { ...sync, salesAt: new Date().toISOString(), salesError: null, salesFullOn: full ? today : sync.salesFullOn });
    return r;
  } catch (e: any) {
    await pgStore.put("meta", "sync", { ...sync, salesError: e.message });
    throw e;
  }
}

export async function pollVideos() {
  if (!video.available()) return { skipped: true };
  let done = 0;
  for (const c of await pgStore.list("creatives")) {
    if (c.status !== "generating" || !c.job) continue;
    const r = await video.poll(c.job);
    if (!r.done) continue;
    await pgStore.put("creatives", c.id, { ...c, status: r.url ? "review" : "draft", videoUrl: r.url || null, error: r.error || null, generatedAt: new Date().toISOString() });
    done++;
  }
  return { done };
}
