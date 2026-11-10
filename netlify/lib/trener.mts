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

/* ---------- invisible watermark ---------- */
// Every copy of the questions a code receives carries that code's fingerprint, hidden in the explanations as
// zero-width characters (invisible on screen, kept when the text is copied). A leaked copy can be traced back
// to its code (scripts/admin.mjs trener-trace <file>) and the code stopped.
const ZW0 = "​", ZW1 = "‌", ZWMARK = "⁠";
export const fingerprint = (code: string) => createHash("sha256").update("edubel-wm:" + code).digest("hex").slice(0, 8);
// Puts the mark at a space near the middle of the text, never inside an HTML tag (the math explanations are HTML).
function markText(s: string, mark: string) {
  let inTag = false;
  for (let i = Math.floor(s.length / 2); i < s.length; i++) {
    const c = s[i];
    if (c === "<") inTag = true;
    else if (c === ">") inTag = false;
    else if (c === " " && !inTag && s.lastIndexOf("<", i) <= s.lastIndexOf(">", i)) return s.slice(0, i) + mark + s.slice(i);
  }
  return s + mark;
}
export function watermark(data: any, code: string) {
  const bits = [...parseInt(fingerprint(code), 16).toString(2).padStart(32, "0")].map((b) => (b === "1" ? ZW1 : ZW0)).join("");
  const mark = ZWMARK + bits + ZWMARK;
  const out = JSON.parse(JSON.stringify(data));
  for (const q of out.questions || []) {
    if (typeof q.why === "string" && q.why.length > 20) q.why = markText(q.why, mark);
  }
  // The math cards too: one block on each side.
  for (const c of out.math?.cards || []) {
    for (const side of [c.front, c.back]) {
      const b = Array.isArray(side) ? side.find((x: any) => typeof x?.html === "string" && x.html.length > 40) : null;
      if (b) b.html = markText(b.html, mark);
    }
  }
  return out;
}
// Reads the fingerprints (8 hex characters) hidden in a piece of text.
export function readMarks(text: string) {
  const re = new RegExp(`${ZWMARK}([${ZW0}${ZW1}]{32})${ZWMARK}`, "g");
  const found = new Set<string>();
  for (const m of text.matchAll(re)) found.add(parseInt([...m[1]].map((c) => (c === ZW1 ? "1" : "0")).join(""), 2).toString(16).padStart(8, "0"));
  return [...found];
}

/* ---------- the pupil's saved state ---------- */
// Shape (written by public/assets/trener.js):
// { name, avatar, hist: [{m, d, p, n, s, w: [ids], a?: {read:[p,n], lang:[p,n], lit:[p,n]}}], mist: {id: {n, ok, d}},
//   resetAt, resets: {module: ts}, at }
const ID = /^[a-z0-9-]{1,24}$/;
const MIN_TS = Date.UTC(2026, 0, 1);
const int = (v: unknown, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : lo);
const ts = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= MIN_TS && n <= Date.now() + 86_400_000 ? Math.round(n) : 0;
};

export function cleanState(s: any) {
  const out: any = { name: "", avatar: "", hist: [], mist: {}, dos: {}, resetAt: 0, resets: {}, at: 0 };
  if (!s || typeof s !== "object") return out;
  out.name = typeof s.name === "string" ? s.name.trim().slice(0, 40) : "";
  // The picture the child chose (Erčo or a hero from the game), by its file name.
  out.avatar = typeof s.avatar === "string" && ID.test(s.avatar) ? s.avatar : "";
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
  // Progress in the game „Литературни досиета“: small objects per dossier, kept as they are if the whole is small.
  if (s.dos && typeof s.dos === "object" && !Array.isArray(s.dos)) {
    const ids = Object.keys(s.dos).filter((k) => ID.test(k)).slice(0, 60);
    const dos = Object.fromEntries(ids.map((k) => [k, s.dos[k]]).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)));
    if (JSON.stringify(dos).length <= 80_000) out.dos = dos;
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
  return { name: newer.name, avatar: newer.avatar, hist, mist: newer.mist, dos: newer.dos, resetAt, resets, at: Math.max(a.at, b.at) };
}

// "iPhone · Safari", "Android · Chrome" – just enough for the family to recognise its devices.
export const cleanLabel = (v: unknown) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} .·()/,+-]/gu, "").trim().slice(0, 60) : "") || "Устройство";
