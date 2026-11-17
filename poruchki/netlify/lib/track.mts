// Asking Speedy and Econt where each parcel is.
import { COURIERS, CourierError, isCourier, type CourierId, type Creds, type ParcelState } from "./couriers.mts";
import { getSetting, logJob, q, setSetting } from "./db.mts";
import { env } from "./http.mts";
import { matchEcont } from "./match.mts";
import { seal, unseal } from "./secret.mts";

type Stored = { sealed: string; user: string; at: string; ok?: boolean; error?: string | null };

// A login typed in Настройки wins; otherwise SPEEDY_USER / SPEEDY_PASS, ECONT_USER / ECONT_PASS from the Netlify env.
function envCreds(id: CourierId): Creds | null {
  const user = env(`${id.toUpperCase()}_USER`) || "";
  const pass = env(`${id.toUpperCase()}_PASS`) || "";
  return user && pass ? { user, pass } : null;
}

export async function loadCreds(): Promise<Partial<Record<CourierId, Creds>>> {
  const out: Partial<Record<CourierId, Creds>> = {};
  for (const id of Object.keys(COURIERS) as CourierId[]) {
    const s = await getSetting<Stored>(`courier:${id}`);
    if (s?.sealed) {
      try {
        out[id] = unseal<Creds>(s.sealed);
        continue;
      } catch (e) {
        console.error(`cannot open ${id} login`, e);
      }
    }
    const e = envCreds(id);
    if (e) out[id] = e;
  }
  return out;
}

export async function courierInfo() {
  const out: Record<string, { configured: boolean; source?: "app" | "env"; user?: string; at?: string; ok?: boolean; error?: string | null }> = {};
  for (const id of Object.keys(COURIERS) as CourierId[]) {
    const s = await getSetting<Stored>(`courier:${id}`);
    const e = envCreds(id);
    if (s) out[id] = { configured: true, source: "app", user: s.user, at: s.at, ok: s.ok, error: s.error ?? null };
    else if (e) out[id] = { configured: true, source: "env", user: e.user, ok: (await getSetting<any>(`courier_state:${id}`))?.ok, error: (await getSetting<any>(`courier_state:${id}`))?.error ?? null };
    else out[id] = { configured: false };
  }
  return out;
}

/** Checks the login with the courier first; saves only a working one. */
export async function saveCreds(id: CourierId, creds: Creds) {
  await COURIERS[id].check(creds);
  await setSetting(`courier:${id}`, { sealed: seal(creds), user: creds.user, at: new Date().toISOString(), ok: true, error: null });
}

async function markCreds(id: CourierId, ok: boolean, error: string | null) {
  const s = await getSetting<Stored>(`courier:${id}`);
  if (s) await setSetting(`courier:${id}`, { ...s, ok, error });
  else await setSetting(`courier_state:${id}`, { ok, error, at: new Date().toISOString() });
}

async function apply(id: number, trackingNo: string, st: ParcelState | { error: string }, orderedAt: string) {
  if ("error" in st) {
    // Unknown numbers stop being asked about after 30 days.
    const old = Date.now() - Date.parse(orderedAt) > 30 * 86400000;
    await q("UPDATE orders SET tracked_at = now(), track_error = $3, parcel_final = parcel_final OR $4 WHERE id = $1 AND tracking_no = $2", [id, trackingNo, st.error.slice(0, 200), old]);
    return false;
  }
  const r = await q(
    `UPDATE orders SET parcel_status = $3, parcel_text = $4, parcel_at = $5, parcel_final = $6 OR ordered_at < now() - interval '75 days',
            parcel_events = $7, delivered_at = $8, tracked_at = now(), track_error = NULL
      WHERE id = $1 AND tracking_no = $2 AND (parcel_status IS DISTINCT FROM $3 OR parcel_text IS DISTINCT FROM $4)
      RETURNING id`,
    [id, trackingNo, st.status, st.text.slice(0, 300), st.at, st.final, JSON.stringify(st.events), st.deliveredAt],
  );
  if (!r.length) await q("UPDATE orders SET tracked_at = now(), track_error = NULL WHERE id = $1 AND tracking_no = $2", [id, trackingNo]);
  return r.length > 0;
}

export async function runTracking(opts: { deadline: number; limit?: number; orderIds?: number[]; job?: string }) {
  const creds = await loadCreds();
  const couriers = (Object.keys(creds) as CourierId[]).filter((c) => creds[c]);
  const result = { checked: 0, changed: 0, matched: 0, couriers, errors: {} as Record<string, string> };
  if (!couriers.length) return result;
  if (!opts.orderIds?.length && creds.econt) {
    try {
      result.matched = (await matchEcont(creds.econt, opts.deadline - 10000)).matched;
    } catch (e: any) {
      result.errors.match = e.message;
    }
  }
  const rows = opts.orderIds?.length
    ? await q<any>("SELECT id, courier, tracking_no, ordered_at FROM orders WHERE id = ANY($1) AND tracking_no IS NOT NULL AND courier = ANY($2)", [opts.orderIds, couriers])
    : await q<any>(
        `SELECT id, courier, tracking_no, ordered_at FROM orders
          WHERE tracking_no IS NOT NULL AND NOT parcel_final AND courier = ANY($1)
            AND ordered_at > now() - interval '90 days'
            AND (tracked_at IS NULL OR tracked_at < now() - interval '80 minutes')
          ORDER BY tracked_at NULLS FIRST, ordered_at DESC LIMIT $2`,
        [couriers, opts.limit || 200],
      );
  for (const id of couriers) {
    const mine = rows.filter((r) => r.courier === id);
    for (let i = 0; i < mine.length; i += 50) {
      if (Date.now() > opts.deadline) break;
      const part = mine.slice(i, i + 50);
      try {
        const states = await COURIERS[id].track(creds[id]!, part.map((r) => String(r.tracking_no)));
        for (const r of part) {
          const st = states.get(String(r.tracking_no));
          if (!st) continue;
          result.checked++;
          if (await apply(Number(r.id), String(r.tracking_no), st, String(r.ordered_at))) result.changed++;
        }
        await markCreds(id, true, null);
      } catch (e: any) {
        result.errors[id] = e.message;
        if (e instanceof CourierError && e.auth) await markCreds(id, false, e.message);
        break;
      }
    }
  }
  await logJob(opts.job || "track", Object.keys(result.errors).length === 0, result);
  return result;
}

export { isCourier };
