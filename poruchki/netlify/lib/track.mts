// Asking Speedy and Econt where each parcel is.
import { COURIERS, CourierError, econtCosts, isCourier, speedyCosts, type CourierId, type Creds, type ParcelState } from "./couriers.mts";
import { getSetting, logJob, q, setSetting } from "./db.mts";
import { cKey, companyId, ENV_COMPANY, inCompany, companiesWithShops, withCompany } from "./tenant.mts";
import { env } from "./http.mts";
import { lookupSpeedy } from "./lookup.mts";
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
    const s = await getSetting<Stored>(cKey(`courier:${id}`));
    if (s?.sealed) {
      try {
        out[id] = unseal<Creds>(s.sealed);
        continue;
      } catch (e) {
        console.error(`cannot open ${id} login`, e);
      }
    }
    const e = companyId() === ENV_COMPANY ? envCreds(id) : null;
    if (e) out[id] = e;
  }
  return out;
}

export async function courierInfo() {
  const out: Record<string, { configured: boolean; source?: "app" | "env"; user?: string; at?: string; ok?: boolean; error?: string | null }> = {};
  for (const id of Object.keys(COURIERS) as CourierId[]) {
    const s = await getSetting<Stored>(cKey(`courier:${id}`));
    const e = companyId() === ENV_COMPANY ? envCreds(id) : null;
    if (s) out[id] = { configured: true, source: "app", user: s.user, at: s.at, ok: s.ok, error: s.error ?? null };
    else if (e) out[id] = { configured: true, source: "env", user: e.user, ok: (await getSetting<any>(cKey(`courier_state:${id}`)))?.ok, error: (await getSetting<any>(cKey(`courier_state:${id}`)))?.error ?? null };
    else out[id] = { configured: false };
  }
  return out;
}

/** Checks the login with the courier first; saves only a working one. */
export async function saveCreds(id: CourierId, creds: Creds) {
  await COURIERS[id].check(creds);
  await setSetting(cKey(`courier:${id}`), { sealed: seal(creds), user: creds.user, at: new Date().toISOString(), ok: true, error: null });
}

async function markCreds(id: CourierId, ok: boolean, error: string | null) {
  const s = await getSetting<Stored>(cKey(`courier:${id}`));
  if (s) await setSetting(cKey(`courier:${id}`), { ...s, ok, error });
  else await setSetting(cKey(`courier_state:${id}`), { ok, error, at: new Date().toISOString() });
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
  if (st.cost !== undefined) await q("UPDATE orders SET courier_cost = $3, courier_cost_at = now() WHERE id = $1 AND tracking_no = $2", [id, trackingNo, st.cost]);
  return r.length > 0;
}

// Requests per call: Speedy takes 10 parcels per request (speedyTrack splits), Econt more.
const BATCH: Record<CourierId, number> = { speedy: 20, econt: 40 };

export async function runTracking(opts: { deadline: number; limit?: number; orderIds?: number[]; job?: string }) {
  const creds = await loadCreds();
  const couriers = (Object.keys(creds) as CourierId[]).filter((c) => creds[c]);
  const result = { checked: 0, changed: 0, matched: 0, found: 0, costs: 0, couriers, errors: {} as Record<string, string> };
  if (!couriers.length) return result;
  // Waybills Middleware made for Speedy orders: found by the order number.
  if (!opts.orderIds?.length && creds.speedy && opts.deadline - Date.now() > 6000) {
    try {
      result.found = (await lookupSpeedy(creds.speedy, Date.now() + Math.min(60000, (opts.deadline - Date.now()) / 3))).found;
    } catch (e: any) {
      result.errors.lookup = e.message;
    }
  }
  const rows = opts.orderIds?.length
    ? await q<any>(`SELECT id, courier, tracking_no, ordered_at FROM orders WHERE id = ANY($1) AND tracking_no IS NOT NULL AND courier = ANY($2) AND ${inCompany()}`, [opts.orderIds, couriers])
    : await q<any>(
        `SELECT id, courier, tracking_no, ordered_at FROM orders
          WHERE tracking_no IS NOT NULL AND NOT parcel_final AND courier = ANY($1) AND ${inCompany()}
            AND ordered_at > now() - interval '90 days'
            AND (tracked_at IS NULL OR tracked_at < now() - interval '80 minutes')
          ORDER BY tracked_at NULLS FIRST, ordered_at DESC LIMIT $2`,
        [couriers, opts.limit || 3000],
      );
  // The couriers take turns, so a slow one cannot use up all the time.
  const queues = new Map(couriers.map((id) => [id, rows.filter((r) => r.courier === id)]));
  const failed = new Set<CourierId>();
  for (let progress = true; progress && Date.now() < opts.deadline; ) {
    progress = false;
    for (const id of couriers) {
      const queue = queues.get(id)!;
      if (failed.has(id) || !queue.length || Date.now() > opts.deadline) continue;
      progress = true;
      const part = queue.splice(0, BATCH[id]);
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
        failed.add(id);
        if (e instanceof CourierError && e.auth) await markCreds(id, false, e.message);
      }
    }
  }
  // What the courier really charged, for the parcels that do not have it yet (a few per run, newest first).
  if (!opts.orderIds?.length && opts.deadline - Date.now() > 4000) {
    try {
      result.costs = await fillCosts(creds, couriers, opts.deadline - 2000);
    } catch (e: any) {
      result.errors.costs = e.message;
    }
  }
  // Finding Econt waybills by phone is slow: only with time to spare (and matchEcont itself runs at most every few hours).
  if (!opts.orderIds?.length && creds.econt && opts.deadline - Date.now() > 5000) {
    try {
      result.matched = (await matchEcont(creds.econt, opts.deadline)).matched;
    } catch (e: any) {
      result.errors.match = e.message;
    }
  }
  await logJob(opts.job || "track", Object.keys(result.errors).length === 0, result);
  return result;
}

/** The hourly job: every company with its own courier accounts, sharing the time. */
const COSTS = { speedy: speedyCosts, econt: econtCosts } as const;

async function fillCosts(creds: Partial<Record<CourierId, Creds>>, couriers: CourierId[], deadline: number) {
  let filled = 0;
  for (const id of couriers) {
    if (Date.now() > deadline) break;
    const rows = await q<any>(
      `SELECT id, tracking_no FROM orders
        WHERE tracking_no IS NOT NULL AND courier = $1 AND courier_cost_at IS NULL AND ${inCompany()}
          AND ordered_at > now() - interval '120 days'
        ORDER BY ordered_at DESC LIMIT 40`,
      [id],
    );
    if (!rows.length) continue;
    const costs = await COSTS[id](creds[id]!, rows.map((r) => String(r.tracking_no)));
    for (const r of rows) {
      const cost = costs.get(String(r.tracking_no)) ?? null;
      await q("UPDATE orders SET courier_cost = coalesce($3, courier_cost), courier_cost_at = now() WHERE id = $1 AND tracking_no = $2", [r.id, r.tracking_no, cost]);
      if (cost !== null) filled++;
    }
  }
  return filled;
}

export async function runTrackingAll(opts: { deadline: number; job?: string }) {
  const out: Record<string, unknown> = {};
  const list = await companiesWithShops(q);
  for (let i = 0; i < list.length; i++) {
    const left = opts.deadline - Date.now();
    if (left < 1500) break;
    const share = Date.now() + left / (list.length - i);
    out[list[i]] = await withCompany(list[i], () => runTracking({ deadline: share, job: opts.job })).catch((e) => ({ error: e.message }));
  }
  return out;
}

export { isCourier };
