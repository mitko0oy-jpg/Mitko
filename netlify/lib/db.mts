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

export async function event(name: string, props: Record<string, unknown> = {}, userId?: number | null, childId?: number | null) {
  try {
    await q("INSERT INTO events (name, user_id, child_id, props) VALUES ($1, $2, $3, $4)", [name, userId ?? null, childId ?? null, JSON.stringify(props)]);
  } catch (e) {
    console.error("event failed", e);
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
