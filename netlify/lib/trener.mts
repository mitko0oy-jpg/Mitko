// НВО тренажор: personal codes (no account), up to N devices per code, grades kept with the code.
import { createHash } from "node:crypto";
import { one } from "./db.mts";

export const DEVICE_IDLE_DAYS = 60; // a device unused this long frees its place by itself

export const deviceHash = (raw: string) => createHash("sha256").update(raw).digest("hex");
export const publicId = (hash: string) => hash.slice(0, 12);
export const validDevice = (raw: unknown): raw is string => typeof raw === "string" && /^[a-f0-9]{32,128}$/.test(raw);

// The newest question bank. Its id is checked on every call (cheap); the data is read again only when it changes.
let cache: { id: number; data: any } | null = null;
export async function latestBank(): Promise<{ id: number; data: any } | null> {
  const top = await one<{ id: string | null }>("SELECT max(id) AS id FROM trener_bank");
  if (!top?.id) return null;
  if (cache && cache.id === Number(top.id)) return cache;
  const row = await one<{ id: string; data: any }>("SELECT id, data FROM trener_bank WHERE id = $1", [top.id]);
  cache = row ? { id: Number(row.id), data: row.data } : null;
  return cache;
}

/* ---------- the pupil's saved state ---------- */
// Shape (written by public/assets/trener.js):
// { name, hist: [{m, d, p, n, s, w: [ids], a?: {read:[p,n], lang:[p,n], lit:[p,n]}}], mist: {id: {n, ok, d}},
//   resetAt, resets: {module: ts}, at }
const ID = /^[a-z0-9-]{1,24}$/;
const MIN_TS = Date.UTC(2026, 0, 1);
const int = (v: unknown, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : lo);
const ts = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= MIN_TS && n <= Date.now() + 86_400_000 ? Math.round(n) : 0;
};

export function cleanState(s: any) {
  const out: any = { name: "", hist: [], mist: {}, resetAt: 0, resets: {}, at: 0 };
  if (!s || typeof s !== "object") return out;
  out.name = typeof s.name === "string" ? s.name.trim().slice(0, 40) : "";
  out.at = ts(s.at);
  out.resetAt = ts(s.resetAt);
  if (s.resets && typeof s.resets === "object") {
    for (const [k, v] of Object.entries(s.resets).slice(0, 30)) if (ID.test(k) && ts(v)) out.resets[k] = ts(v);
  }
  if (Array.isArray(s.hist)) {
    for (const h of s.hist.slice(-1000)) {
      if (!h || typeof h !== "object" || typeof h.m !== "string" || !ID.test(h.m) || !ts(h.d)) continue;
      const n = int(h.n, 1, 100);
      const e: any = { m: h.m, d: ts(h.d), p: Math.min(int(h.p, 0, 100), n), n, s: int(h.s, 0, 36_000) };
      e.w = Array.isArray(h.w) ? h.w.filter((x: unknown) => typeof x === "string" && ID.test(x)).slice(0, 60) : [];
      if (h.a && typeof h.a === "object") {
        e.a = {};
        for (const k of ["read", "lang", "lit"]) {
          const v = h.a[k];
          if (Array.isArray(v)) { const an = int(v[1], 0, 100); e.a[k] = [Math.min(int(v[0], 0, 100), an), an]; }
        }
      }
      out.hist.push(e);
    }
  }
  if (s.mist && typeof s.mist === "object") {
    for (const [k, v] of Object.entries<any>(s.mist).slice(0, 400)) {
      if (ID.test(k) && v && typeof v === "object") out.mist[k] = { n: int(v.n, 0, 999), ok: int(v.ok, 0, 9), d: ts(v.d) };
    }
  }
  return out;
}

// Two devices can save in turn: results from both are kept, resets win over older results,
// and the name and the mistakes notebook come from whichever state changed last.
export function mergeState(a: any, b: any) {
  a = cleanState(a);
  b = cleanState(b);
  const resetAt = Math.max(a.resetAt, b.resetAt);
  const resets: Record<string, number> = { ...a.resets };
  for (const [k, v] of Object.entries<number>(b.resets)) resets[k] = Math.max(resets[k] || 0, v);
  const byKey = new Map<string, any>();
  for (const h of [...a.hist, ...b.hist]) byKey.set(`${h.m}|${h.d}`, h);
  const hist = [...byKey.values()]
    .filter((h) => h.d > resetAt && h.d > (resets[h.m] || 0))
    .sort((x, y) => x.d - y.d)
    .slice(-1000);
  const newer = b.at >= a.at ? b : a;
  return { name: newer.name, hist, mist: newer.mist, resetAt, resets, at: Math.max(a.at, b.at) };
}

// "iPhone · Safari", "Android · Chrome" – just enough for the family to recognise its devices.
export const cleanLabel = (v: unknown) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} .·()/,+-]/gu, "").trim().slice(0, 60) : "") || "Устройство";
