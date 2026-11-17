// Order call records in Netlify Blobs (EU region – customer data stays in Frankfurt).
// Keys:  order/<site>/<orderNo>   – one record per order
//        conv/<conversationId>    – conversation → order key
//        meta/settings            – { paused, startedAt }
import { getStore } from "@netlify/blobs";

const STORE = { name: "obazhdania", region: "eu-central-1", consistency: "strong" };

export function openStore() {
  return getStore(STORE);
}

export const orderKey = (site, orderNo) => `order/${site}/${orderNo}`;

/** In-memory store with the same methods we use (for tests and local runs). */
export function memoryStore() {
  const m = new Map();
  let n = 0;
  return {
    async get(key, opts = {}) {
      if (!m.has(key)) return null;
      const v = m.get(key).value;
      return opts.type === "json" ? JSON.parse(v) : v;
    },
    async getWithMetadata(key, opts = {}) {
      if (!m.has(key)) return null;
      const { value, etag } = m.get(key);
      return { data: opts.type === "json" ? JSON.parse(value) : value, etag, metadata: {} };
    },
    async setJSON(key, obj, opts = {}) {
      const cur = m.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `"${++n}"`;
      m.set(key, { value: JSON.stringify(obj), etag });
      return { modified: true, etag };
    },
    async list({ prefix = "" } = {}) {
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: m.get(key).etag })) };
    },
    async delete(key) {
      m.delete(key);
    },
    _dump: () => m,
  };
}

export async function getSettings(store) {
  return (await store.get("meta/settings", { type: "json" })) || { paused: false, startedAt: null };
}

export async function saveSettings(store, settings) {
  await store.setJSON("meta/settings", settings);
}
