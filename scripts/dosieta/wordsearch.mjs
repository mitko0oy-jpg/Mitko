// Търсачка на думи за „Литературни досиета“.
// Думите вървят само →, ↓, ↘ и ↗. Неоградените клетки, прочетени ред по ред,
// дават „скритата следа“, затова покритите клетки трябва да са точно
// size*size − (брой букви в следата).

export const DIRS = [
  [0, 1], // →
  [1, 0], // ↓
  [1, 1], // ↘
  [-1, 1], // ↗
];

// Малък детерминиран генератор (mulberry32): еднакво съдържание → еднаква решетка.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Само главни български букви; „ѝ“ се брои като „И“.
export function letters(text) {
  return [...String(text).toUpperCase().replace(/Ѝ/g, 'И')].filter((ch) => /[А-Я]/.test(ch)).join('');
}

function occurrences(grid, size, word) {
  let n = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of DIRS) {
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const rr = r + dr * i;
          const cc = c + dc * i;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size || grid[rr * size + cc] !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) n++;
      }
    }
  }
  return n;
}

function tryOnce({ star, bonus, trace, size, rand, minBonus }) {
  const target = size * size - trace.length;
  const grid = new Array(size * size).fill(null);
  const owners = Array.from({ length: size * size }, () => []);
  const placed = [];
  let covered = 0;

  const order = [...shuffle(star, rand).map((w) => ({ w, star: true })), ...shuffle(bonus, rand).map((w) => ({ w, star: false }))];

  for (const { w, star: isStar } of order) {
    const cands = [];
    for (let d = 0; d < DIRS.length; d++) {
      const [dr, dc] = DIRS[d];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const er = r + dr * (w.length - 1);
          const ec = c + dc * (w.length - 1);
          if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
          let overlap = 0;
          let ok = true;
          for (let i = 0; i < w.length && ok; i++) {
            const k = (r + dr * i) * size + (c + dc * i);
            if (grid[k] === null) continue;
            if (grid[k] !== w[i]) ok = false;
            // Две думи в една и съща посока не се застъпват – иначе се четат трудно.
            else if (owners[k].some((p) => p.d === d)) ok = false;
            else overlap++;
          }
          if (!ok || overlap > 1) continue;
          const fresh = w.length - overlap;
          if (covered + fresh > target) continue;
          cands.push({ r, c, d, fresh, overlap });
        }
      }
    }
    if (!cands.length) {
      if (isStar) return null;
      continue;
    }
    // Леко предпочитаме кръстосване – така думите се побират по-лесно.
    const crossing = cands.filter((x) => x.overlap > 0);
    const pool = crossing.length && rand() < 0.45 ? crossing : cands;
    const pick = pool[Math.floor(rand() * pool.length)];
    const [dr, dc] = DIRS[pick.d];
    const entry = { word: w, star: isStar, r: pick.r, c: pick.c, d: pick.d, dr, dc };
    for (let i = 0; i < w.length; i++) {
      const k = (pick.r + dr * i) * size + (pick.c + dc * i);
      if (grid[k] === null) covered++;
      grid[k] = w[i];
      owners[k].push(entry);
    }
    placed.push(entry);
  }

  if (covered !== target) return null;
  if (placed.filter((p) => !p.star).length < Math.min(minBonus, bonus.length)) return null;

  const traceCells = [];
  let t = 0;
  for (let k = 0; k < grid.length; k++) {
    if (grid[k] === null) {
      grid[k] = trace[t++];
      traceCells.push(k);
    }
  }
  // Всяка дума трябва да се среща точно веднъж, за да няма двусмислие.
  for (const p of placed) if (occurrences(grid, size, p.word) !== 1) return null;
  return { grid, placed, traceCells };
}

export function buildWordSearch({ star, bonus, trace, seed, size = 10, attempts = 60000, minBonus = 7 }) {
  const S = star.map(letters);
  const B = bonus.map(letters).filter((w) => !S.includes(w));
  const T = letters(trace);
  const target = size * size - T.length;
  const total = [...S, ...B].reduce((n, w) => n + w.length, 0);
  for (const w of [...S, ...B]) if (w.length > size) throw new Error(`Думата ${w} е по-дълга от ${size} букви.`);
  if (total < target) {
    throw new Error(
      `Думите имат общо ${total} букви, а трябва да покрият ${target} клетки (следата е ${T.length} букви). Добави още ${target - total}+ букви бонус думи или удължи следата.`,
    );
  }
  for (let a = 0; a < attempts; a++) {
    const res = tryOnce({ star: S, bonus: B, trace: T, size, rand: rng(seed + a * 7919), minBonus });
    if (res) {
      const used = new Set(res.placed.map((p) => p.word));
      return { size, ...res, trace: T, unused: B.filter((w) => !used.has(w)), attempt: a };
    }
  }
  throw new Error(
    `Не успях да подредя думите (общо ${total} букви, нужни ${target} клетки). Пробвай с ${total - target > 12 ? 'по-малко' : 'още'} бонус думи или с друга дължина на следата.`,
  );
}
