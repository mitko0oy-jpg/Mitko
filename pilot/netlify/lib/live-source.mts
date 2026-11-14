// Live data source for the shared service: reads what the sync job stored in Postgres,
// and writes changes to Meta.
//
// Profit is counted per business line („направление“), not per Meta ad account: one ad
// account can run ads for several shops (the "Bio" account runs Еду БЕЛ and BeeVenom BG).
// Each campaign goes to a line by keywords in its name, else to its account's default line.
import { q, pgStore } from "./db.mts";
import * as meta from "./meta.mts";
import { env, HttpError } from "./http.mts";
import { DEFAULT_LINES, defaultLineFor, lineForCampaign } from "../../public/core/lines.js";

async function settingsRaw() {
  return ((await pgStore.get("settings", "main")) as any) || {};
}

// Real Meta ad accounts worth syncing: active, in EUR, with a real name.
export async function realAccounts() {
  const list: any[] = ((await pgStore.get("meta", "accounts")) as any)?.list || [];
  const S = await settingsRaw();
  return list.filter((a) => a.status === 1 && (a.currency || "EUR") === "EUR" && a.name && !/^\s*\d+\s*$/.test(a.name) && S.metaAccounts?.[a.id]?.on !== false);
}

async function model() {
  const S = await settingsRaw();
  const lines: any[] = S.lines?.length ? S.lines : DEFAULT_LINES;
  const reals = await realAccounts();
  const structures: Record<string, any> = {};
  const campLine = new Map<string, string>();
  const lineMeta: Record<string, Set<string>> = {};
  for (const a of reals) {
    const s: any = (await pgStore.get("structure", a.id)) || {};
    structures[a.id] = s;
    const dflt = S.metaAccounts?.[a.id]?.defaultLine || defaultLineFor(a.name, lines);
    for (const c of s.campaigns || []) {
      const l = lineForCampaign(c.name, dflt, lines);
      campLine.set(c.id, l);
      (lineMeta[l] ||= new Set()).add(a.id);
    }
  }
  return { S, lines, reals, structures, campLine, lineMeta };
}

export function liveSource() {
  return {
    async snapshot({ since }: { today: string; since: string }) {
      const { S, lines, reals, structures, campLine, lineMeta } = await model();
      const L = (cid: string, fallback: string) => campLine.get(cid) || fallback;
      const campaigns: any[] = [], adsets: any[] = [], ads: any[] = [], creatives: any[] = [];
      const lineOf: Record<string, any> = Object.fromEntries(lines.map((l) => [l.id, l]));
      for (const a of reals) {
        const s = structures[a.id];
        for (const c of s.campaigns || []) campaigns.push({ ...c, account: L(c.id, a.id), metaAccount: a.id });
        for (const x of s.adsets || []) adsets.push({ ...x, account: L(x.campaign, a.id), metaAccount: a.id });
        for (const x of s.ads || []) ads.push({ ...x, account: L(x.campaign, a.id), metaAccount: a.id });
        const adCamp = new Map((s.ads || []).map((x: any) => [x.creative, x.campaign]));
        for (const c of s.creatives || []) {
          if (creatives.some((y) => y.id === c.id)) continue;
          const line = L(adCamp.get(c.id) as string, a.id);
          creatives.push({ ...c, account: line, country: lineOf[line]?.country || "BG" });
        }
      }
      // Orders and sessions go to the line that owns the site.
      const siteToLine = new Map<string, string>();
      for (const l of lines) for (const s of l.sites || []) if (!siteToLine.has(s)) siteToLine.set(s, l.id);
      const insights = (await q<{ data: any }>("SELECT data FROM insights WHERE date >= $1", [since])).map((r) => ({ ...r.data, account: L(r.data.campaign, r.data.account) }));
      const orders = (await q<{ data: any }>("SELECT data FROM orders WHERE date >= $1", [since])).map((r) => ({ ...r.data, account: siteToLine.get(r.data.site) })).filter((o) => o.account);
      const sessions = (await q<any>("SELECT site, to_char(date,'YYYY-MM-DD') AS date, sessions FROM site_sessions WHERE date >= $1", [since])).map((r) => ({ ...r, account: siteToLine.get(r.site) })).filter((r) => r.account);
      // A line shows up when it has campaigns or orders.
      const active = new Set([...campaigns.map((c) => c.account), ...orders.map((o) => o.account)]);
      const accounts = lines
        .filter((l) => active.has(l.id))
        .map((l) => ({ id: l.id, name: l.name, country: l.country, sites: l.sites, currency: "EUR", metaAccounts: [...(lineMeta[l.id] || [])], ...(S.accounts?.[l.id] || {}) }));
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
      const { S, reals, structures, campLine } = await model();
      const find = (id: string) => {
        for (const a of reals) {
          const s = structures[a.id];
          for (const k of ["campaigns", "adsets", "ads"]) {
            const e = (s?.[k] || []).find((x: any) => x.id === id);
            if (e) return { a, s, k, e };
          }
        }
        return null;
      };
      if (op.op === "budget" || op.op === "status") {
        const f = find(op.id);
        if (!f) throw new HttpError(404, "not_found", "Обектът не е намерен в данните от Мета.");
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
        const f = find(op.adset);
        if (!f) throw new HttpError(404, "not_found", "Адсетът не е намерен.");
        const line = campLine.get(f.e.campaign);
        const cfg = { ...(S.metaAccounts?.[f.a.id] || {}), ...(S.accounts?.[line] || {}) };
        if (!cfg.pageId || !cfg.link) throw new HttpError(422, "setup", "Задай Facebook страница и линк към лендинга за това направление в Настройки.");
        return meta.launch({ acct: f.a.id, adset: op.adset, pageId: cfg.pageId, link: cfg.link, creative: op.creativeDoc });
      }
      throw new HttpError(400, "bad_op", "Непозната операция.");
    },

    async connections() {
      const sync: any = (await pgStore.get("meta", "sync")) || {};
      return {
        meta: !env("META_TOKEN") ? "missing" : sync.metaError ? "error" : "ok",
        sales: env("SALES_URL") || env("SALES_MCP_URL") || sync.hookAt ? (sync.salesError ? "error" : "ok") : "missing",
        ai: env("ANTHROPIC_API_KEY") ? "ok" : "missing",
        video: env("HIGGSFIELD_API_KEY") || (env("HIGGSFIELD_KEY_ID") && env("HIGGSFIELD_KEY_SECRET")) ? "ok" : "missing",
        adlib: !env("META_TOKEN") ? "missing" : sync.adlibError ? "error" : "ok",
      };
    },
  };
}
