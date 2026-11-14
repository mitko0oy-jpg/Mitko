// Once a day: market signals (news attention, headlines, search interest) and competitors.
import type { Config } from "@netlify/functions";
import { refreshMarket, refreshCompetitors } from "../lib/market.mts";
import { app, isDemo } from "../lib/app.mts";
import { pgStore } from "../lib/db.mts";
import { env } from "../lib/http.mts";

export default async () => {
  if (isDemo()) return;
  const S = await app().settings();
  const out: Record<string, unknown> = {};
  try {
    out.market = await refreshMarket(["BG", "SK", "SI", "HU"], S.keywords || {});
  } catch (e: any) {
    out.market = { error: e.message };
  }
  if (env("META_TOKEN")) {
    const sync: any = (await pgStore.get("meta", "sync")) || {};
    try {
      out.competitors = await refreshCompetitors(S);
      await pgStore.put("meta", "sync", { ...sync, adlibError: null });
    } catch (e: any) {
      out.competitors = { error: e.message };
      await pgStore.put("meta", "sync", { ...sync, adlibError: e.message });
    }
  }
  await pgStore.put("meta", "lastDaily", { at: new Date().toISOString(), out });
  console.log("daily", JSON.stringify(out));
};

// 04:37 UTC ≈ 06:37 in Sofia, before the working day.
export const config: Config = { schedule: "37 4 * * *" };
