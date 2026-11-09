// Word search for "Литературни досиета": places the words on an N×N grid so that the cells
// left free spell the hidden trace, read row by row from left to right.
// Deterministic: the same words and seed always give the same grid.

export const DIRS = [
  { key: "→", dr: 0, dc: 1 },
  { key: "↓", dr: 1, dc: 0 },
  { key: "↘", dr: 1, dc: 1 },
  { key: "↗", dr: -1, dc: 1 },
];

export function letters(s) {
  return String(s).toUpperCase().replace(/[^А-ЯЁЪЬЮЯЙЩ]/g, "");
}

export function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function placements(word, n) {
  const out = [];
  for (let d = 0; d < DIRS.length; d++) {
    const { dr, dc } = DIRS[d];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const er = r + dr * (word.length - 1), ec = c + dc * (word.length - 1);
      if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
      out.push({ r, c, d });
    }
  }
  return out;
}

function cellsOf(word, p) {
  const { dr, dc } = DIRS[p.d];
  return [...word].map((ch, i) => [p.r + dr * i, p.c + dc * i, ch]);
}

// Count how many times a word can be read in the allowed directions.
export function occurrences(grid, word) {
  const n = grid.length;
  let count = 0;
  for (const p of placements(word, n)) {
    if (cellsOf(word, p).every(([r, c, ch]) => grid[r][c] === ch)) count++;
  }
  return count;
}

/**
 * stars: words that must be in the grid (the main mission).
 * bonus: candidate words; as many as needed are used to make the free cells fit the trace exactly.
 * Returns { grid, placed: [{word, star, r, c, d, end:[r,c]}], free: [[r,c]...] } or throws.
 */
export function buildGrid({ stars, bonus, trace, n = 10, seed = "", minBonus = 6, maxBonus = 13, tries = 4000 }) {
  const traceL = letters(trace);
  const target = n * n - traceL.length;
  const S = stars.map(letters), B = [...new Set(bonus.map(letters))].filter((w) => !S.includes(w));
  for (const w of [...S, ...B]) if (w.length > n) throw new Error(`Думата ${w} е по-дълга от ${n} букви.`);
  const allLen = B.reduce((s, w) => s + w.length, 0) + S.reduce((s, w) => s + w.length, 0);
  if (allLen < target) throw new Error(`Думите са твърде малко: ${allLen} букви, а трябват поне ${target} (скритата следа има ${traceL.length} букви). Добави бонус думи или удължи следата.`);

  for (let attempt = 0; attempt < tries; attempt++) {
    const rand = rng(`${seed}|${S.join(",")}|${traceL}|${attempt}`);
    const grid = Array.from({ length: n }, () => Array(n).fill(""));
    const owner = Array.from({ length: n }, () => Array(n).fill(0));
    let covered = 0;
    const placed = [];
    const put = (word, star) => {
      const opts = shuffle(placements(word, n), rand);
      // Prefer placements that keep the board loose; overlaps are allowed only on equal letters.
      for (const p of opts) {
        const cells = cellsOf(word, p);
        if (!cells.every(([r, c, ch]) => grid[r][c] === "" || grid[r][c] === ch)) continue;
        const fresh = cells.filter(([r, c]) => grid[r][c] === "").length;
        if (covered + fresh > target) continue;
        if (fresh < word.length - 2) continue; // at most two shared letters
        for (const [r, c, ch] of cells) { if (grid[r][c] === "") covered++; grid[r][c] = ch; owner[r][c]++; }
        const last = cells[cells.length - 1];
        placed.push({ word, star, r: p.r, c: p.c, d: p.d, end: [last[0], last[1]] });
        return true;
      }
      return false;
    };
    let ok = S.every((w) => put(w, true));
    if (!ok) continue;
    const order = shuffle(B, rand);
    let used = 0;
    for (const w of order) {
      if (covered === target && used >= minBonus) break;
      if (used >= maxBonus) break;
      if (put(w, false)) used++;
    }
    if (covered !== target || used < minBonus) continue;

    // Fill the free cells with the trace, row by row.
    const free = [];
    let k = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c] === "") { grid[r][c] = traceL[k++]; free.push([r, c]); }
    // Every word must be readable exactly once, or the answer key is ambiguous.
    if (!placed.every((p) => occurrences(grid, p.word) === 1)) continue;
    return { grid, placed, free, attempt };
  }
  throw new Error(`Не намерих подредба за ${S.join(", ")} (следа ${traceL.length} букви). Добави още бонус думи или промени следата.`);
}
