// Shops: the list comes from CB_SITES; region, currency and on/off are kept in the database.
import { cbSites } from "./cb.mts";
import { q } from "./db.mts";

// Defaults for shops seen for the first time (changeable in Настройки).
const ABROAD = new Set(["sk", "sl", "si", "hu", "vcelijed", "cz", "ro", "gr", "pl", "hr", "at", "de"]);
const CURRENCY: Record<string, string> = { hu: "HUF", cz: "CZK", pl: "PLN", ro: "RON" };

export type Shop = {
  id: string;
  label: string;
  domain: string;
  region: "bg" | "abroad";
  currency: string;
  active: boolean;
  position: number;
  hook_id: string | null;
  hook_secret: string | null;
  hook_at: string | null;
  synced_at: string | null;
  full_sync_at: string | null;
  backfill: { from: number; to: number; skip: number } | null;
  last_error: string | null;
  error_at: string | null;
};

/** Adds new shops from CB_SITES and refreshes names; returns all shops. */
export async function ensureShops(): Promise<Shop[]> {
  const sites = cbSites();
  if (sites.length) {
    const vals: unknown[] = [];
    const rows = sites.map((s, i) => {
      vals.push(s.id, s.label, s.domain, ABROAD.has(s.id.toLowerCase()) ? "abroad" : "bg", CURRENCY[s.id.toLowerCase()] || "EUR", i);
      const b = i * 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    });
    await q(
      `INSERT INTO shops (id, label, domain, region, currency, position) VALUES ${rows.join(", ")}
       ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, domain = EXCLUDED.domain, position = EXCLUDED.position`,
      vals,
    );
  }
  return q<Shop>("SELECT * FROM shops ORDER BY position, id");
}

export async function shopError(id: string, message: string | null) {
  await q("UPDATE shops SET last_error = $2, error_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1", [id, message ? message.slice(0, 300) : null]);
}
