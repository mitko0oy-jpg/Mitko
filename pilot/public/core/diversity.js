// Creative similarity and Andromeda-style diversity.
// Similarity = weighted tag overlap + text overlap (hook/script) + optional
// embedding cosine and perceptual hash distance when we have them.
import { DIMENSIONS, CONCEPT_DIMS, DIM, tagLabel } from "./taxonomy.js";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function trigrams(s) {
  const t = ` ${norm(s)} `;
  const out = new Map();
  for (let i = 0; i < t.length - 2; i++) {
    const g = t.slice(i, i + 3);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}
export function textSim(a, b) {
  if (!a || !b) return 0;
  const A = trigrams(a), B = trigrams(b);
  let dot = 0, na = 0, nb = 0;
  for (const [g, x] of A) {
    na += x * x;
    if (B.has(g)) dot += x * B.get(g);
  }
  for (const [, y] of B) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    x += a[i] * a[i];
    y += b[i] * b[i];
  }
  return x && y ? d / Math.sqrt(x * y) : null;
}
// 64-bit perceptual hash as 16 hex chars → similarity 0..1.
export function phashSim(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return null;
  let dist = 0;
  for (let i = 0; i < h1.length; i++) {
    let x = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return 1 - dist / (h1.length * 4);
}

export function tagSim(a, b) {
  let s = 0, w = 0;
  for (const d of DIMENSIONS) {
    const x = a?.[d.key], y = b?.[d.key];
    if (!x || !y || x === "na" || y === "na") continue;
    w += d.weight;
    if (x === y) s += d.weight;
  }
  return w ? s / w : 0;
}

// Overall 0..1. Strong signals (embeddings, image hash) dominate when present.
export function similarity(a, b) {
  const t = tagSim(a.tags, b.tags);
  const txt = Math.max(textSim(a.hookText, b.hookText), textSim(a.script, b.script) * 0.9);
  const emb = cosine(a.embedding, b.embedding);
  const img = phashSim(a.phash, b.phash);
  let score = 0.7 * t + 0.3 * txt;
  if (emb != null) score = 0.45 * score + 0.55 * Math.max(0, (emb - 0.5) / 0.5);
  if (img != null && img > 0.9) score = Math.max(score, img);
  return Math.min(1, score);
}

export const SIM_DUPLICATE = 0.8; // Meta will most likely treat these as the same ad
export const SIM_CLOSE = 0.62; // same concept, different execution

export function verdict(score) {
  if (score >= SIM_DUPLICATE) return { level: "dup", label: "Повторение", hint: "Мета ще ги брои като една реклама – смени ъгъла, човека или формата." };
  if (score >= SIM_CLOSE) return { level: "close", label: "Много близко", hint: "Същата идея в нова опаковка. Става за итерация на победител, не за нов концепт." };
  if (score >= 0.45) return { level: "related", label: "Сродно", hint: "Различно изпълнение – добре." };
  return { level: "new", label: "Нов концепт", hint: "Ново за акаунта – точно това иска Андромеда." };
}

// Practitioner rule (Nov 2026): two ads are the SAME concept if they differ on fewer
// than 3 of these 5: angle, persona, hook/first frame, format, talent-or-setting.
// Copy-, crop- or colour-only variants never count as new.
export function sameConcept(a, b) {
  const x = a.tags || {}, y = b.tags || {};
  let diff = 0;
  for (const k of ["angle", "persona", "hook", "format"]) if (x[k] && y[k] && x[k] !== y[k]) diff++;
  if ((x.talent && y.talent && x.talent !== y.talent) || (x.visual && y.visual && x.visual !== y.visual)) diff++;
  const ff = phashSim(a.phash, b.phash);
  if (ff != null && ff >= 0.85) return true; // same first frame → Meta's Creative Diversity sees one visual
  return diff < 3;
}

// Union-find clustering of creatives into "concepts" (what Andromeda would see).
export function clusters(creatives, threshold = SIM_CLOSE) {
  const n = creatives.length;
  const parent = creatives.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (sameConcept(creatives[i], creatives[j]) || similarity(creatives[i], creatives[j]) >= threshold) parent[find(i)] = find(j);
  const groups = new Map();
  creatives.forEach((c, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function entropy(values, dim) {
  const m = new Map();
  for (const v of values) if (v && v !== "na") m.set(v, (m.get(v) || 0) + 1);
  const n = [...m.values()].reduce((a, b) => a + b, 0);
  if (!n) return 0;
  let h = 0;
  for (const c of m.values()) h -= (c / n) * Math.log(c / n);
  const cap = Math.min(n, Object.keys(DIM[dim]?.values || {}).length || m.size);
  return m.size > 1 && cap > 1 ? Math.min(1, h / Math.log(cap)) : 0;
}

// Diversity score 0..100 for a set of live ads (an ad set, a campaign or an account).
export function diversity(creatives, opts = {}) {
  const live = creatives.filter(Boolean);
  const target = opts.targetConcepts ?? 8;
  if (!live.length) return { score: 0, concepts: 0, ads: 0, target, groups: [], spread: {}, issues: ["Няма активни реклами"], missing: [] };
  const groups = clusters(live);
  const concepts = groups.length;
  const spread = {};
  for (const k of CONCEPT_DIMS.concat(["hook", "aspect"])) {
    const vals = live.map((c) => c.tags?.[k]);
    spread[k] = { entropy: entropy(vals, k), distinct: new Set(vals.filter((v) => v && v !== "na")).size };
  }
  const conceptScore = Math.min(1, concepts / target);
  const dupShare = 1 - concepts / live.length; // ads that are clones of another ad
  const formatMix = Math.min(1, spread.format.distinct / 3);
  const spreadScore = (spread.angle.entropy + spread.persona.entropy + spread.visual.entropy + spread.talent.entropy) / 4;
  const score = Math.round(100 * (0.45 * conceptScore + 0.25 * spreadScore + 0.15 * formatMix + 0.15 * (1 - dupShare)));
  const issues = [];
  if (concepts < 5) issues.push(`Само ${concepts} различни концепции – Андромеда вижда толкова „реклами“ (минимум 5, цел 8–12).`);
  else if (concepts < target) issues.push(`${concepts} различни концепции (цел: ${target}–12).`);
  if (dupShare > 0.3) issues.push(`${Math.round(dupShare * 100)}% от рекламите са варианти на една и съща идея – Мета ги слива.`);
  if (spread.format.distinct < 3) issues.push("Под 3 формата – добави статични, UGC видео и карусел.");
  if (live.length >= 40) issues.push(`${live.length} реклами – таванът на Мета е 50 в адсет.`);
  if (spread.aspect.distinct < 2) issues.push("Само един размер – нужни са 9:16 за Reels/Stories и 4:5 за фийда.");
  if (spread.persona.distinct < 2) issues.push("Всички реклами говорят на един и същ човек.");
  // Which values of the big axes are not represented at all → ideas for next briefs.
  const missing = [];
  for (const k of ["angle", "persona", "format", "visual"]) {
    const have = new Set(live.map((c) => c.tags?.[k]));
    for (const v of Object.keys(DIM[k].values)) if (!have.has(v)) missing.push({ dim: k, value: v, label: `${DIM[k].label}: ${tagLabel(k, v)}` });
  }
  return { score, concepts, ads: live.length, target, groups, spread, issues, missing };
}

// Compare a proposed concept with everything ever made. Returns the nearest matches.
export function checkNew(candidate, library, top = 3) {
  const scored = library
    .filter((c) => c.id !== candidate.id)
    .map((c) => ({ c, score: similarity(candidate, c) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  return { score: best, verdict: verdict(best), nearest: scored.slice(0, top) };
}
