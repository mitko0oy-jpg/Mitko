// Shared helpers for the engine. Plain ES modules with no dependencies, so the same
// code runs in the browser (demo mode) and in Netlify Functions (live mode).

export const TZ = "Europe/Sofia";

export const todayStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const toD = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const addDays = (s, n) => {
  const d = toD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayDiff = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
export const daysBetween = (a, b) => {
  const out = [];
  for (let c = a; c <= b && out.length < 800; c = addDays(c, 1)) out.push(c);
  return out;
};
export const weekday = (s) => toD(s).getUTCDay(); // 0 = Sunday

// Fraction of the local (Sofia) day that has passed, used to project "today".
export function dayFraction(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const [h, m] = parts.split(":").map(Number);
  return Math.min(1, Math.max(0.02, (h * 60 + m) / 1440));
}

export const RANGES = {
  today: { label: "Днес", days: 1, offset: 0 },
  yesterday: { label: "Вчера", days: 1, offset: 1 },
  d3: { label: "3 дни", days: 3, offset: 0 },
  d7: { label: "7 дни", days: 7, offset: 0 },
  d14: { label: "14 дни", days: 14, offset: 0 },
  d30: { label: "30 дни", days: 30, offset: 0 },
};
export function rangeDates(key, today) {
  const r = RANGES[key] || RANGES.d7;
  const until = addDays(today, -r.offset);
  return [addDays(until, -(r.days - 1)), until];
}

// --- numbers -------------------------------------------------------------
export const sum = (a, f = (x) => x) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export const div = (a, b) => (b ? a / b : NaN);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);
export function std(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(sum(a, (x) => (x - m) ** 2) / (a.length - 1));
}
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
// Least-squares slope of y over x = 0..n-1.
export function slope(y) {
  const n = y.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2, my = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (y[i] - my);
    den += (i - mx) ** 2;
  }
  return den ? num / den : 0;
}
export const pctChange = (now, before) => (before ? now / before - 1 : NaN);

// --- deterministic randomness (demo data and tie breaks) ----------------
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === "number" ? seed : hash(String(seed));
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export function gauss(r) {
  let u = 0, v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function poisson(r, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(r)));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}
// Beta sample through two gamma draws (Marsaglia–Tsang), used for Thompson sampling.
function gamma(r, k) {
  if (k < 1) return gamma(r, k + 1) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      x = gauss(r);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function betaSample(r, a, b) {
  const x = gamma(r, a), y = gamma(r, b);
  return x / (x + y);
}

export const uid = (p = "id") => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const groupBy = (arr, f) => {
  const m = new Map();
  for (const x of arr) {
    const k = f(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};
