// Live data source for the shared service: reads what the sync job stored in Postgres,
// and writes changes to Meta.
import { q, pgStore } from "./db.mts";
import * as meta from "./meta.mts";
import { env, HttpError } from "./http.mts";

// Sensible first guesses for this business; everything is editable in Settings.
export function guessCountry(name = ""): string {
  const n = name.toLowerCase();
  if (/словен|sloven|\bsi\b/.test(n)) return "SI";
  if (/словак|slovak|\bsk\b/.test(n)) return "SK";
  if (/унгар|hungar|magyar|\bhu\b/.test(n)) return "HU";
  return "BG";
}
export function guessSites(name = "", country = "BG", currency = "EUR"): string[] {
  // Accounts without a real name (only digits) or in another currency are not ours to map.
  if (!name || /^\s*\d+\s*$/.test(name) || currency !== "EUR") return [];
  if (/bio/i.test(name)) return ["bioshop"];
  return { BG: ["bg", "max4"], SK: ["sk", "vcelijed"], SI: ["sl"], HU: ["hu"] }[country] || [];
}

async function settingsRaw() {
  return ((await pgStore.get("settings", "main")) as any) || {};
}

export async function accountsConfigured() {
  const S = await settingsRaw();
  const list: any[] = ((await pgStore.get("meta", "accounts")) as any)?.list || [];
  return list.map((a) => {
    const cfg = S.accounts?.[a.id] || {};
    const country = cfg.country || guessCountry(a.name);
    const sites = cfg.sites?.length ? cfg.sites : guessSites(a.name, country, a.currency);
    const usable = a.status === 1 && (cfg.on === true || (cfg.on !== false && sites.length > 0));
    return { ...a, country, sites, on: usable, pageId: cfg.pageId, link: cfg.link };
  });
}

export function liveSource() {
  return {
    async snapshot({ since }: { today: string; since: string }) {
      const accounts = (await accountsConfigured()).filter((a) => a.on);
      const campaigns: any[] = [], adsets: any[] = [], ads: any[] = [], creatives: any[] = [];
      for (const a of accounts) {
        const s: any = (await pgStore.get("structure", a.id)) || {};
        campaigns.push(...(s.campaigns || []));
        adsets.push(...(s.adsets || []));
        ads.push(...(s.ads || []));
        for (const c of s.creatives || []) if (!creatives.some((x) => x.id === c.id)) creatives.push({ ...c, country: a.country });
      }
      const siteToAcct = new Map<string, string>();
      for (const a of accounts) for (const s of a.sites) if (!siteToAcct.has(s)) siteToAcct.set(s, a.id);
      const insights = (await q<{ data: any }>("SELECT data FROM insights WHERE date >= $1", [since])).map((r) => r.data);
      const orders = (await q<{ data: any }>("SELECT data FROM orders WHERE date >= $1", [since])).map((r) => ({ ...r.data, account: siteToAcct.get(r.data.site) })).filter((o) => o.account);
      const sessions = (await q<any>("SELECT site, to_char(date,'YYYY-MM-DD') AS date, sessions FROM site_sessions WHERE date >= $1", [since])).map((r) => ({ ...r, account: siteToAcct.get(r.site) })).filter((r) => r.account);
      const market: Record<string, any[]> = {}, headlines: Record<string, any[]> = {};
      for (const c of ["BG", "SK", "SI", "HU"]) {
        const m: any = await pgStore.get("market", c);
        market[c] = m?.series || [];
        headlines[c] = m?.headlines || [];
      }
      const competitors = await pgStore.list("competitors");
      const sync: any = (await pgStore.get("meta", "sync")) || {};
      const reasons: string[] = [];
      const ageH = (t?: string) => (t ? (Date.now() - new Date(t).getTime()) / 36e5 : Infinity);
      if (ageH(sync.metaAt) > 3) reasons.push("Данните от Мета са на повече от 3 часа.");
      if ((env("SALES_URL") || env("SALES_MCP_URL")) && ageH(sync.salesAt) > 2) reasons.push("Поръчките от магазина са на повече от 2 часа.");
      const metaFatigue = Object.fromEntries((await pgStore.list("metaFatigue")).map((x: any) => [x.id, x.level]));
      return { accounts, campaigns, adsets, ads, creatives, insights, orders, sessions, market, headlines, competitors, metaFatigue, gate: { ok: !reasons.length, reasons } };
    },

    async apply(op: any) {
      const accounts = await accountsConfigured();
      const findAcct = async (id: string) => {
        for (const a of accounts) {
          const s: any = await pgStore.get("structure", a.id);
          for (const k of ["campaigns", "adsets", "ads"]) {
            const e = (s?.[k] || []).find((x: any) => x.id === id);
            if (e) return { a, s, k, e };
          }
        }
        return null;
      };
      if (op.op === "budget" || op.op === "status") {
        const f = await findAcct(op.id);
        if (!f) throw new HttpError(404, "not_found", "Обектът не е намерен в Мета данните.");
        if (op.op === "budget") {
          await meta.setBudget(op.id, op.value, f.a.currency);
          f.e.budget = op.value;
        } else {
          await meta.setStatus(op.id, op.value);
          f.e.status = op.value;
        }
        await pgStore.put("structure", f.a.id, f.s);
        return { ok: true };
      }
      if (op.op === "launch") {
        const as = await findAcct(op.adset);
        if (!as) throw new HttpError(404, "not_found", "Адсетът не е намерен.");
        if (!as.a.pageId || !as.a.link) throw new HttpError(422, "setup", "Задай Facebook страница и линк към лендинга за този акаунт в Настройки.");
        return meta.launch({ acct: as.a.id, adset: op.adset, pageId: as.a.pageId, link: as.a.link, creative: op.creativeDoc });
      }
      throw new HttpError(400, "bad_op", "Непозната операция.");
    },

    async connections() {
      const sync: any = (await pgStore.get("meta", "sync")) || {};
      return {
        meta: !env("META_TOKEN") ? "missing" : sync.metaError ? "error" : "ok",
        sales: env("SALES_URL") || env("SALES_MCP_URL") || sync.hookAt ? (sync.salesError ? "error" : "ok") : "missing",
        ai: env("ANTHROPIC_API_KEY") ? "ok" : "missing",
        video: env("FAL_KEY") ? "ok" : "missing",
        adlib: !env("META_TOKEN") ? "missing" : sync.adlibError ? "error" : "ok",
      };
    },
  };
}
