// Calendar of moments that move attention and buying: public holidays,
// shopping peaks, pension days (our buyers are often 55+). Editable in Settings;
// these are sensible defaults, not legal references.
import { addDays, toD, dayDiff } from "./util.js";

function westernEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function orthodoxEaster(y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  const julian = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return addDays(julian, 13); // Julian → Gregorian (1900–2099)
}
const nthWeekday = (y, m, wd, n) => {
  let d = `${y}-${String(m).padStart(2, "0")}-01`, count = 0;
  for (;;) {
    if (toD(d).getUTCDay() === wd && ++count === n) return d;
    d = addDays(d, 1);
  }
};
const lastDay = (y, m) => addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);

function forYear(y) {
  const ev = [];
  const add = (country, date, name, kind, effect) => ev.push({ country, date, name, kind, effect });
  const fixed = (country, list, kind = "holiday", effect = -0.15) => list.forEach(([md, name]) => add(country, `${y}-${md}`, name, kind, effect));

  const oe = orthodoxEaster(y), we = westernEaster(y);
  fixed("BG", [["01-01", "Нова година"], ["03-03", "Трети март"], ["05-01", "Ден на труда"], ["05-06", "Гергьовден"], ["05-24", "24 май"], ["09-06", "Съединението"], ["09-22", "Независимостта"], ["12-24", "Бъдни вечер"], ["12-25", "Коледа"], ["12-26", "Коледа"]]);
  add("BG", addDays(oe, -2), "Разпети петък", "holiday", -0.15);
  add("BG", oe, "Великден", "holiday", -0.3);
  add("BG", addDays(oe, 1), "Великден (понеделник)", "holiday", -0.15);
  add("BG", `${y}-03-08`, "8 март – подаръци", "gifting", 0.2);
  add("BG", `${y}-03-01`, "Баба Марта", "gifting", 0.05);

  fixed("SK", [["01-01", "Nový rok"], ["01-06", "Zjavenie Pána"], ["05-01", "Sviatok práce"], ["05-08", "Deň víťazstva"], ["07-05", "Cyril a Metod"], ["08-29", "SNP"], ["09-15", "Sedembolestná"], ["11-01", "Všetkých svätých"], ["11-17", "Deň boja za slobodu"], ["12-24", "Štedrý deň"], ["12-25", "Vianoce"], ["12-26", "Vianoce"]]);
  add("SK", addDays(we, -2), "Veľký piatok", "holiday", -0.15);
  add("SK", addDays(we, 1), "Veľkonočný pondelok", "holiday", -0.2);

  fixed("SI", [["01-01", "Novo leto"], ["01-02", "Novo leto"], ["02-08", "Prešernov dan"], ["04-27", "Dan upora"], ["05-01", "Praznik dela"], ["05-02", "Praznik dela"], ["06-25", "Dan državnosti"], ["08-15", "Marijino vnebovzetje"], ["10-31", "Dan reformacije"], ["11-01", "Dan spomina na mrtve"], ["12-25", "Božič"], ["12-26", "Dan samostojnosti"]]);
  add("SI", we, "Velika noč", "holiday", -0.3);
  add("SI", addDays(we, 1), "Velikonočni ponedeljek", "holiday", -0.2);

  fixed("HU", [["01-01", "Újév"], ["03-15", "Nemzeti ünnep"], ["05-01", "A munka ünnepe"], ["08-20", "Államalapítás"], ["10-23", "Nemzeti ünnep"], ["11-01", "Mindenszentek"], ["12-24", "Szenteste"], ["12-25", "Karácsony"], ["12-26", "Karácsony"]]);
  add("HU", addDays(we, -2), "Nagypéntek", "holiday", -0.15);
  add("HU", addDays(we, 1), "Húsvéthétfő", "holiday", -0.2);
  add("HU", addDays(we, 50), "Pünkösdhétfő", "holiday", -0.15);
  add("HU", nthWeekday(y, 5, 0, 1), "Anyák napja – подаръци", "gifting", 0.1);
  add("SK", nthWeekday(y, 5, 0, 2), "Deň matiek – подаръци", "gifting", 0.1);

  // Shopping peaks for everyone.
  const bf = nthWeekday(y, 11, 5, 4);
  for (const c of ["BG", "SK", "SI", "HU"]) {
    add(c, addDays(bf, -4), "Седмица на Черния петък – скъп аукцион", "auction", -0.1);
    add(c, bf, "Черен петък", "shopping", 0.25);
    add(c, addDays(bf, 3), "Кибер понеделник", "shopping", 0.1);
    add(c, `${y}-12-05`, "Коледни подаръци – пик", "gifting", 0.15);
    add(c, `${y}-12-18`, "Последни дни за доставка преди Коледа", "deadline", 0.1);
    add(c, `${y}-12-31`, "Нова година – ниско внимание", "holiday", -0.3);
  }
  // Pension days (default guesses – adjust in Settings).
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    add("BG", `${y}-${mm}-07`, "Пенсии (начало на изплащане)", "payday", 0.12);
    add("HU", `${y}-${mm}-12`, "Пенсии", "payday", 0.1);
    add("SI", lastDay(y, m), "Пенсии", "payday", 0.08);
  }
  return ev;
}

export function calendar(fromDate, days = 30, countries = ["BG", "SK", "SI", "HU"], custom = []) {
  const until = addDays(fromDate, days);
  const y = Number(fromDate.slice(0, 4));
  const all = [...forYear(y - 1), ...forYear(y), ...forYear(y + 1), ...custom];
  return all
    .filter((e) => (e.country === "ALL" || countries.includes(e.country)) && e.date >= fromDate && e.date <= until)
    .map((e) => ({ ...e, inDays: dayDiff(fromDate, e.date) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function dayEffect(date, country, custom = []) {
  return calendar(date, 0, [country], custom).reduce((t, e) => t + (e.effect || 0), 0);
}

export const EVENT_KIND = {
  holiday: "Празник",
  shopping: "Пазаруване",
  gifting: "Подаръци",
  payday: "Пенсии/заплати",
  auction: "Аукцион",
  deadline: "Краен срок",
  news: "Новини",
  sport: "Спорт",
  custom: "Свое",
};
