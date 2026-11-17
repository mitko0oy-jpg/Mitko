// Exchange rates for shops that sell in another currency (Hungary – HUF).
// Everything on the dashboard is in EUR. Rates: European Central Bank, refreshed daily.
import { getSetting, setSetting } from "./db.mts";

const FALLBACK: Record<string, number> = { HUF: 390, CZK: 25, PLN: 4.3, RON: 5, USD: 1.1, BGN: 1.95583, GBP: 0.85 };
const ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export type Rates = { rates: Record<string, number>; date: string | null; at?: string };

export async function getRates(): Promise<Rates> {
  return (await getSetting<Rates>("fx")) || { rates: {}, date: null };
}

/** Units of `currency` for 1 EUR. */
export function rateFor(currency: string, r: Rates): number {
  const c = (currency || "EUR").toUpperCase();
  if (c === "EUR") return 1;
  return Number(r.rates[c]) || FALLBACK[c] || 1;
}

export async function refreshRates(fetchImpl: typeof fetch = fetch): Promise<Rates | null> {
  const cur = await getRates();
  if (cur.at && Date.now() - Date.parse(cur.at) < 20 * 3600 * 1000) return cur;
  try {
    const res = await fetchImpl(ECB, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ECB HTTP ${res.status}`);
    const xml = await res.text();
    const rates: Record<string, number> = {};
    for (const m of xml.matchAll(/currency='([A-Z]{3})'\s+rate='([\d.]+)'/g)) rates[m[1]] = Number(m[2]);
    const date = /time='(\d{4}-\d{2}-\d{2})'/.exec(xml)?.[1] || null;
    if (!Object.keys(rates).length) throw new Error("ECB: no rates");
    const next = { rates, date, at: new Date().toISOString() };
    await setSetting("fx", next);
    return next;
  } catch (e: any) {
    console.error("fx refresh failed", e.message);
    return null;
  }
}
