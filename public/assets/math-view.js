// Shared by the math quiz (/matematika/) and the teacher review (/pregled/):
// how a task, its answer options and its step-by-step solution look.
import { esc } from "./app.js";

export const LEVELS = [
  { name: "Знам", pts: 1, dots: 1 },
  { name: "Разбирам", pts: 2, dots: 2 },
  { name: "Мисля", pts: 3, dots: 3 },
];
export const level = (lv) => LEVELS[Math.min(2, Math.max(0, Number(lv) || 0))];
export const LETTERS = ["А", "Б", "В", "Г", "Д"];
export const pointsWord = (n) => (n === 1 ? "точка" : "точки");

// Text with math: escaped first, then {3/4} becomes a fraction on two lines and \n a line break.
// The fraction keeps a plain "3/4" for screen readers.
export function mathHtml(s) {
  return esc(s)
    .replace(/\{([^{}/]+)\/([^{}]+)\}/g, (_, a, b) => `<span class="sr">${a}/${b}</span><span class="fr" aria-hidden="true"><span>${a}</span><span>${b}</span></span>`)
    .replace(/\n/g, "<br>");
}

function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0);
}
function shuffled(list, seed) {
  const next = seeded(seed);
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A stable order of the options of task number n (index 0 = the right answer), so "отговор Б"
// means the same thing every time. Every 4 consecutive tasks put the right answer once on each
// of А, Б, В, Г, in a mixed order: the letters are spread evenly over the whole collection.
export function optionOrder(count, n) {
  const idx = Array.from({ length: count }, (_, i) => i);
  if (count !== 4 || !Number.isInteger(n) || n < 1) return shuffled(idx, `o${n}`);
  const right = shuffled([0, 1, 2, 3], `b${Math.floor((n - 1) / 4)}`)[(n - 1) % 4];
  const wrong = shuffled([1, 2, 3], `w${n}`);
  wrong.splice(right, 0, 0);
  return wrong;
}

// The full solution: right answer, numbered steps (what we do + why), answer, the trap, the card to revise.
export function solutionHtml(d, order) {
  const right = order ? order.indexOf(0) : 0;
  const steps = (d.s || [])
    .map((st, i) => `<li><span class="sn" aria-hidden="true">${i + 1}</span><div><p class="sdo">${mathHtml(st.do)}</p>${st.why ? `<p class="swhy">${mathHtml(st.why)}</p>` : ""}</div></li>`)
    .join("");
  return `<div class="sol">
    <p class="slbl">Верният отговор</p>
    <p class="sright">${order ? `${LETTERS[right]}) ` : ""}${mathHtml(d.o[0])}</p>
    ${steps ? `<p class="slbl">Решение стъпка по стъпка</p><ol class="steps">${steps}</ol>` : ""}
    ${d.a ? `<p class="sans"><b>Отговор:</b> ${mathHtml(d.a)}</p>` : ""}
    ${d.trap ? `<div class="trap"><p class="slbl">Уловката</p><p>${mathHtml(d.trap)}</p></div>` : ""}
    ${d.card ? `<p class="scard">Преговори: <b>Карта ${String(d.card).padStart(2, "0")}</b>${d.t ? ` · ${esc(d.t)}` : ""}</p>` : ""}
  </div>`;
}

// Titles at the end of a part, by share of the maximum points (as in „200 въпроса“).
export const TITLES = [
  { name: "Архимед", from: 0.91 },
  { name: "Майстор на задачите", from: 0.75 },
  { name: "Изобретател", from: 0.6 },
  { name: "Изследовател", from: 0.41 },
  { name: "Откривател", from: 0 },
];
export function titleRows(max) {
  const lows = TITLES.map((t) => Math.ceil(t.from * max));
  return TITLES.map((t, i) => ({ name: t.name, lo: lows[i], hi: i === 0 ? max : lows[i - 1] - 1 }));
}
export const titleFor = (points, max) => titleRows(max).find((r) => points >= r.lo) || titleRows(max).at(-1);
