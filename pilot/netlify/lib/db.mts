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
  return (await q<T>(text, params))[0] ?? null;
}

// The document store interface the shared service expects.
export const pgStore = {
  async get(coll: string, id: string) {
    const r = await one<{ data: any }>("SELECT data FROM docs WHERE coll = $1 AND id = $2", [coll, id]);
    return r?.data ?? null;
  },
  async put(coll: string, id: string, data: unknown) {
    await q(
      `INSERT INTO docs (coll, id, data, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [coll, id, JSON.stringify(data)],
    );
  },
  async list(coll: string) {
    const rows = await q<{ id: string; data: any }>("SELECT id, data FROM docs WHERE coll = $1 ORDER BY updated_at", [coll]);
    return rows.map((r) => ({ id: r.id, ...r.data }));
  },
  async del(coll: string, id: string) {
    await q("DELETE FROM docs WHERE coll = $1 AND id = $2", [coll, id]);
  },
};
