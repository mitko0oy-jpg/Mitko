import { getDatabase } from "@netlify/database";

let conn: ReturnType<typeof getDatabase> | null = null;

function pool() {
  if (!conn) conn = getDatabase();
  return conn.pool as any;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query(text, params);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export type Q = <T = any>(text: string, params?: unknown[]) => Promise<T[]>;

export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const res = await fn(async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows);
    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Fixed-window counter. Returns false when the limit is exceeded.
export async function hit(key: string, max: number, windowSec: number): Promise<boolean> {
  const row = await one<{ count: number }>(
    `INSERT INTO rate_hits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_hits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_hits.count + 1 END,
       window_start = CASE WHEN rate_hits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_hits.window_start END
     RETURNING count`,
    [key, windowSec],
  );
  return (row?.count ?? 1) <= max;
}

export async function getSetting<T = any>(key: string): Promise<T | null> {
  const r = await one<{ value: T }>("SELECT value FROM settings WHERE key = $1", [key]);
  return r ? r.value : null;
}

export async function setSetting(key: string, value: unknown) {
  await q(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [key, JSON.stringify(value)],
  );
}

// Background job outcome for the settings page. Keeps the last 30 days.
export async function logJob(job: string, ok: boolean, info: Record<string, unknown> = {}) {
  try {
    await q("INSERT INTO job_log (job, ok, info) VALUES ($1, $2, $3)", [job, ok, JSON.stringify(info)]);
    if (Math.random() < 0.02) await q("DELETE FROM job_log WHERE at < now() - interval '30 days'");
  } catch (e) {
    console.error("job log failed", e);
  }
}
