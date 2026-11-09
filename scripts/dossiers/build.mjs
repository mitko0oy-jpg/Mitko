#!/usr/bin/env node
// Builds the book-game "Литературни досиета" as a print-ready B5 PDF.
// The content (dossiers, pictures, fonts) lives outside git, e.g. in private/dossiers10/.
//
//   node scripts/dossiers/build.mjs <content-dir> [--check] [--png 1,10,11] [--only 3,4]
//
// <content-dir>/book.json        – book settings (title, secret message, reviews, final, …)
// <content-dir>/dossiers/*.json  – one file per dossier (see scripts/dossiers/README.md)
// Output: <content-dir>/../out/<name>-uchenik.pdf and <name>-resheniya.pdf (+ PNG previews).
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildGrid, DIRS, letters, rng, shuffle } from "./grid.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ABC = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЮЯ";
const LIST_LETTERS = "АБВГДЕЖЗИЙКЛМНОПРСТУФХ";
const h = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad2 = (n) => String(n).padStart(2, "0");
const q = (t) => (/^[„"]/.test(t) ? t : `„${t}“`);

// ---------- loading and checks ----------
async function load(dir) {
  const book = JSON.parse(await readFile(path.join(dir, "book.json"), "utf8"));
  const files = (await readdir(path.join(dir, "dossiers"))).filter((f) => f.endsWith(".json")).sort();
  const dossiers = [];
  for (const f of files) {
    const d = JSON.parse(await readFile(path.join(dir, "dossiers", f), "utf8"));
    d._file = f;
    dossiers.push(d);
  }
  dossiers.sort((a, b) => a.no - b.no);
  return { book, dossiers };
}

function check(book, dossiers, draft) {
  const errors = [];
  const msg = letters(book.message);
  if (!draft && msg.length !== dossiers.length + 1) errors.push(`Посланието има ${msg.length} букви, а трябват ${dossiers.length + 1} (по една от всяко досие + финала).`);
  dossiers.forEach((d, i) => {
    const e = (m) => errors.push(`Досие ${d.no} (${d._file}): ${m}`);
    if (!draft && d.no !== i + 1) e(`номерът трябва да е ${i + 1}`);
    for (const k of ["author", "title", "summary", "stars", "bonus", "trace", "code", "yellow", "mc", "t4", "t5"]) if (d[k] == null) e(`липсва „${k}“`);
    if (!Array.isArray(d.stars) || d.stars.length !== 3) e("трябват точно 3 думи със звездичка");
    else d.stars.forEach((s) => { if (!s.w || !s.q) e("всяка дума със звездичка иска w и q"); });
    const code = letters(d.code || "");
    if (code.length !== 5) e(`кодът „${d.code}“ трябва да е от 5 букви`);
    if (!(d.yellow >= 1 && d.yellow <= 5)) e("yellow трябва да е от 1 до 5");
    else if (code[d.yellow - 1] !== msg[d.no - 1]) e(`буква № ${d.yellow} на кода „${code}“ е ${code[d.yellow - 1]}, а за поле ${d.no} трябва ${msg[d.no - 1]}`);
    if (!Array.isArray(d.mc) || d.mc.length !== 5) e("трябват точно 5 въпроса в задача 3");
    else d.mc.forEach((m, j) => {
      if (!m.q || !m.a || !Array.isArray(m.w) || m.w.length !== 2) e(`въпрос 3.${j + 1} иска q, a и два грешни отговора в w`);
      if (m.q && m.q.length > 120) e(`въпрос 3.${j + 1} е твърде дълъг (${m.q.length} знака, до 120)`);
      for (const o of [m.a, ...(m.w || [])]) if (o && o.length > 78) e(`отговор в 3.${j + 1} е твърде дълъг (${o.length} знака, до 78): ${o}`);
    });
    const tl = letters(d.trace || "").length;
    if (tl < 10 || tl > 30) e(`скритата следа има ${tl} букви (трябват 10–30)`);
    if (d.summary && d.summary.length > 330) e(`„Накратко“ е твърде дълго (${d.summary.length} знака, до 330)`);
    const t4 = d.t4 || {};
    if (!["order", "groups", "quote", "who", "match"].includes(t4.type)) e("t4.type трябва да е order, groups, quote, who или match");
    if (t4.type === "order" && (!Array.isArray(t4.items) || t4.items.length !== 5)) e("t4 order иска 5 случки в items (в правилния ред)");
    if (t4.type === "groups" && !(Array.isArray(t4.heads) && t4.heads.length === 2 && Array.isArray(t4.answer) && t4.answer.length === 2)) e("t4 groups иска heads[2] и answer[2]");
    if (t4.type === "quote" && !(Array.isArray(t4.lines) && t4.lines.every((l) => l.text?.includes("___") && l.a))) e("t4 quote иска lines с ___ и a");
    if (t4.type === "who" && !(Array.isArray(t4.lines) && t4.lines.every((l) => l.text && l.a))) e("t4 who иска lines с text и a");
    if (t4.type === "match" && !(Array.isArray(t4.pairs) && t4.pairs.length >= 3 && t4.pairs.length <= 5)) e("t4 match иска 3–5 pairs {l, r}");
    if (!d.t5?.q || !d.t5?.start || !d.t5?.example) e("t5 иска q, start и example");
  });
  const f = book.final;
  if (!f || letters(f.code).length !== 5 || letters(f.code)[f.yellow - 1] !== msg[msg.length - 1]) errors.push(`Финалът: буква № ${f?.yellow} на кода „${f?.code}“ трябва да е ${msg[msg.length - 1]}.`);
  return errors;
}

// ---------- preparing a dossier ----------
function wrongLetters(rand, avoid, count) {
  const pool = shuffle([...ABC].filter((c) => !avoid.includes(c)), rand);
  return pool.slice(0, count);
}

function prepMC(questions, code, seed) {
  const rand = rng(seed);
  return questions.map((m, i) => {
    const right = code[i];
    const wl = wrongLetters(rand, [right], 2);
    const opts = shuffle([{ t: m.a, l: right, ok: true }, { t: m.w[0], l: wl[0] }, { t: m.w[1], l: wl[1] }], rand);
    return { q: m.q, opts };
  });
}

function prepDossier(d) {
  const seed = `${d.no}|${d.seed ?? ""}`;
  const grid = buildGrid({ stars: d.stars.map((s) => s.w), bonus: d.bonus, trace: d.trace, seed, minBonus: d.minBonus ?? 6 });
  const code = letters(d.code);
  const mc = prepMC(d.mc, code, `mc|${seed}`);
  const rand = rng(`t4|${seed}`);
  const t4 = { ...d.t4 };
  if (t4.type === "order") {
    t4.shown = shuffle(t4.items.map((t, i) => ({ t, n: i + 1 })), rand);
    // Never start with the first event already in place.
    while (t4.shown[0].n === 1) t4.shown.push(t4.shown.shift());
  }
  if (t4.type === "groups") t4.bank = shuffle(t4.answer.flat(), rand);
  if (t4.type === "quote") t4.bank = shuffle([...t4.lines.map((l) => l.a), ...(t4.extra || [])], rand);
  if (t4.type === "who") t4.bank = shuffle([...new Set([...t4.lines.map((l) => l.a), ...(t4.extra || [])])], rand);
  if (t4.type === "match") {
    const right = shuffle(t4.pairs.map((p, i) => ({ r: p.r, i })), rand);
    t4.right = right.map((x, k) => ({ ...x, l: LIST_LETTERS[k] }));
    t4.key = t4.pairs.map((p, i) => t4.right.find((x) => x.i === i).l);
  }
  return { ...d, icon: d.icon || (d.no % 2 ? "magnifier" : "folder"), grid, codeL: code, mcP: mc, t4 };
}

// ---------- page plan ----------
function plan(book, ds) {
  const pages = [];
  const add = (kind, data = {}, numbered = true) => pages.push({ kind, data, numbered, id: data.id || kind });
  add("cover", {}, false);
  add("mission", {}, false);
  for (const k of ["card", "how", "tempo", "map", "message", "helpWord", "helpCode", "helpBonus", "helpThesis"]) add(k);
  const reviews = book.reviews || [];
  ds.forEach((d) => {
    add("dossierA", { d, id: `d${d.no}` });
    add("dossierB", { d, id: `d${d.no}b` });
    reviews.forEach((r, ri) => { if (r.after === d.no) { add("reviewA", { r, ri, id: `r${ri}` }); add("reviewB", { r, ri, id: `r${ri}b` }); } });
  });
  add("finalA", { id: "final" });
  add("finalB", { id: "finalB" });
  const per = book.answersPerPage || 5;
  for (let i = 0; i < ds.length; i += per) add("answers", { list: ds.slice(i, i + per), id: `ans${i}` });
  add("answersRest", { id: "ansRest" });
  add("diploma");
  add("notes");
  add("notebook");
  // A printed booklet needs a page count divisible by 4: fill up with notebook pages.
  while ((pages.length + 1) % 4) add("notebook", { id: `notebook${pages.length}` });
  add("back", {}, false);
  let n = 0;
  for (const p of pages) p.num = p.numbered ? ++n : null;
  const at = (id) => pages.find((p) => p.id === id)?.num;
  const ansPage = (no) => pages.find((p) => p.kind === "answers" && p.data.list.some((d) => d.no === no))?.num;
  return { pages, at, ansPage };
}

// ---------- rendering helpers ----------
function gridHTML(G, { cell = 8.15, starts = [], solved = false, labels = true }) {
  const n = G.grid.length, rows = G.grid.length, cols = G.grid[0].length;
  const isStart = (r, c) => starts.some(([a, b]) => a === r && b === c);
  const isFree = (r, c) => G.free?.some(([a, b]) => a === r && b === c);
  const lab = labels ? 4 : 0, top = labels ? 3.6 : 0;
  let html = `<div class="gridwrap" style="width:${lab + cols * cell}mm;height:${top + rows * cell}mm">`;
  html += labels
    ? `<div style="display:grid;grid-template-columns:${lab}mm repeat(${cols},${cell}mm);grid-template-rows:${top}mm repeat(${rows},${cell}mm)">`
    : `<div style="display:grid;grid-template-columns:repeat(${cols},${cell}mm);grid-template-rows:repeat(${rows},${cell}mm)">`;
  if (labels) {
    html += `<div></div>`;
    for (let c = 0; c < cols; c++) html += `<div style="font-size:6.2pt;color:var(--muted);text-align:center;line-height:${top}mm">${c + 1}</div>`;
  }
  for (let r = 0; r < rows; r++) {
    if (labels) html += `<div style="font-size:6.2pt;color:var(--muted);display:flex;align-items:center;justify-content:center">${r + 1}</div>`;
    for (let c = 0; c < cols; c++) {
      const bg = isStart(r, c) ? "var(--start)" : solved && isFree(r, c) ? "var(--trace)" : "var(--paper)";
      html += `<div style="border:.13mm solid var(--line);background:${bg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${cell * 1.33}pt">${h(G.grid[r][c])}</div>`;
    }
  }
  html += `</div>`;
  if (solved && G.placed?.length) {
    html += `<svg class="bands" style="left:${lab}mm;top:${top}mm;width:${cols * cell}mm;height:${rows * cell}mm" viewBox="0 0 ${cols} ${rows}">`;
    for (const p of G.placed) {
      const col = p.star ? "#1c7a4c" : "#5b88b8";
      html += `<line x1="${p.c + 0.5}" y1="${p.r + 0.5}" x2="${p.end[1] + 0.5}" y2="${p.end[0] + 0.5}" stroke="${col}" stroke-opacity="${p.star ? 0.32 : 0.24}" stroke-width="0.66" stroke-linecap="round"/>`;
    }
    html += `</svg>`;
  }
  return html + `</div>`;
}

function boxesHTML(word, yellow, solved, size) {
  return `<div class="boxes">${[...word].map((ch, i) => `<div class="c${i + 1 === yellow ? " y" : ""}"${size ? ` style="width:${size}mm;height:${size}mm"` : ""}><i>${i + 1}</i>${solved || ch === " " ? h(ch) : ""}</div>`).join("")}</div>`;
}

function mcHTML(mcP) {
  return mcP.map((m, i) => `<div class="mc"><div class="q">${i + 1}. ${h(m.q)}</div>${m.opts.map((o) => `<div class="o${o.ok ? " ok" : ""}"><span class="l">${h(o.l)}</span><span>${h(o.t)}</span></div>`).join("")}</div>`).join("");
}

const T4_TITLE = { order: "Подреди случките", groups: "Раздели в две групи", quote: "Допълни цитата", who: "Кой го казва?", match: "Свържи понятието с примера" };
const T4_PROMPT = {
  order: "Напиши 1 пред най-ранното, 2 пред следващото и така до 5.",
  groups: "Запиши думите в двете групи:",
  quote: "Допълни с думи от списъка:",
  who: "Напиши кой го казва. Избери от:",
  match: "Запиши до всяко число буквата на подходящия пример.",
};

function t4HTML(t) {
  const prompt = h(t.prompt || T4_PROMPT[t.type]);
  if (t.type === "order") return `<div class="t4"><p>${prompt}</p>${t.shown.map((x) => `<div class="row"><span class="slot"><span class="solvedonly">${x.n}</span></span><span>${h(x.t)}</span></div>`).join("")}</div>`;
  if (t.type === "groups") return `<div class="t4"><p>${prompt} ${h(t.bank.join(" · "))}</p><div class="groups">${t.heads.map((hd, i) => `<div class="box"><h3>${h(hd)}</h3><div class="ans b solvedonly">${h(t.answer[i].join(", "))}</div></div>`).join("")}</div></div>`;
  if (t.type === "quote") return `<div class="t4"><p>${prompt} <b>${h(t.bank.join(" · "))}</b></p>${t.lines.map((l) => `<div class="row"><span>${h(l.text).replace("___", `<span class="fill"><span class="solvedonly">${h(l.a)}</span>&nbsp;</span>`)}</span></div>`).join("")}</div>`;
  if (t.type === "who") return `<div class="t4"><p>${prompt} <b>${h(t.bank.join(" · "))}</b></p>${t.lines.map((l) => `<div class="row"><span>${h(q(l.text))} – <span class="fill"><span class="solvedonly">${h(l.a)}</span>&nbsp;</span></span></div>`).join("")}</div>`;
  if (t.type === "match") return `<div class="t4"><p>${prompt}</p><div class="match"><div>${t.pairs.map((p, i) => `<div class="row"><b>${i + 1}.</b><span>${h(p.l)}</span><span class="slot"><span class="solvedonly">${t.key[i]}</span></span></div>`).join("")}</div><div>${t.right.map((x) => `<div class="row"><b>${x.l}</b><span>${h(x.r)}</span></div>`).join("")}</div></div></div>`;
  return "";
}

function t4Answer(t) {
  if (t.type === "order") return `${t.shown.map((x) => x.n).join(", ")} (отгоре надолу)`;
  if (t.type === "groups") return t.heads.map((hd, i) => `${hd}: ${t.answer[i].join(", ")}`).join("; ");
  if (t.type === "quote") return t.lines.map((l) => l.a).join(", ");
  if (t.type === "who") return t.lines.map((l) => l.a).join("; ");
  if (t.type === "match") return t.key.map((l, i) => `${i + 1}–${l}`).join(", ");
  return "";
}

const cell = (r, c) => `(${r + 1},${c + 1})`;
// `short` is the title used in lists (map, reviews, answers) when `part` is long.
const workTitle = (d) => d.short || `${q(d.title)}${d.part ? ` · ${d.part}` : ""}`;

// ---------- pages ----------
function renderPage(p, ctx) {
  const { book, ds, P, solved, asset } = ctx;
  const nD = ds.length;
  const msgPage = P.at("message"), mapPage = P.at("map"), finalPage = P.at("final"), dipPage = P.at("diploma"), restPage = P.at("ansRest"), notesPage = P.at("notes");
  const foot = p.num ? `<div class="foot"><span>Еду БЕЛ / ${h(book.series)}${book.footTag ? ` · ${h(book.footTag)}` : ""}</span>${solved ? `<span class="copy">Копие с решения</span>` : ""}<span class="num">${pad2(p.num)}</span></div>` : "";
  const wrap = (kicker, inner) => `<section class="page" data-id="${p.id}">${kicker ? `<div class="kicker">${kicker}</div>` : ""}<div class="body">${inner}</div>${foot}</section>`;
  const titled = (title, icon) => `<div class="titlerow"><h1>${title}</h1>${icon ? `<img src="${asset(icon + ".png")}">` : ""}</div>`;
  const msgFields = letters(book.message);

  switch (p.kind) {
    case "cover":
      return `<section class="page full cover" style="background-image:linear-gradient(180deg,rgba(14,42,48,.92) 0%,rgba(14,42,48,.55) 30%,rgba(14,42,48,0) 52%),url('${asset("cover.jpg")}')">
        <div class="top"><div class="brand">ЕДУ БЕЛ</div><div class="badge">${h(book.badge)}</div></div>
        <div class="tag">Книга-игра за литературни детективи</div>
        <div class="t1">ЛИТЕРАТУРНИ</div><div class="t2">ДОСИЕТА</div>
        <div class="claim"><b>${nD} досиета. Един таен код.</b><span>Разследването започва с теб.</span></div>
        ${solved ? `<div class="strip">КОПИЕ С РЕШЕНИЯ · ЗА ПРЕГЛЕД</div>` : ""}
        <div class="bottom"><div class="rule"></div><div class="l1">Разкрий загадките. Разбери творбите.</div><div class="l2">${h(book.coverLine)}</div><div class="l3">Ученето се превръща в игра.</div></div>
      </section>`;

    case "mission":
      return `<section class="page full"><div class="hero" style="background-image:url('${asset("desk.jpg")}')"><div class="stamp">ДОСТЪП РАЗРЕШЕН</div></div>
        <div class="band">${h(book.missionTitle)}</div>
        <div class="inner"><h1 style="font-size:20pt;margin-top:0">Разследвай творбите. Открий смисъла.</h1>
        <p class="lead">Пред теб са ${nD} досиета върху творбите от ${h(book.gradesText)}. Ти си детективът. Следвай уликите, разпитай героите и открий какво стои зад думите.</p>
        <div class="cols3"><div><div class="kicker">Героите</div><b>Защо постъпват така?</b></div><div><div class="kicker">Следите</div><b>Кои думи разкриват идеята?</b></div><div><div class="kicker">Доказателството</div><b>Как да защитиш своя прочит?</b></div></div><div class="spacer"></div>
        ${solved
          ? `<div class="box"><h2 style="color:var(--teal);font-size:9.4pt;text-transform:uppercase">Как е попълнено това копие</h2><p class="ans" style="font-weight:500">Зеленото показва отговорите. В решетките основните думи са в зелено, а бонусните – в синьо. Златните клетки образуват скритата следа. Отговорите с „Пример“ са възможни решения; други формулировки със същия смисъл също са верни.</p></div>`
          : `<div class="box"><h2 style="color:var(--teal);font-size:9.4pt;text-transform:uppercase">Какво ти трябва</h2><p>Молив, гума и текстовете на творбите – в учебника, в книга или онлайн. Къде да ги намериш, пише на стр. ${notesPage}.</p></div>`}
        </div></section>`;

    case "card":
      return wrap("Карта на детектива", `${titled("Добре дошъл<br>в бюрото.", "badge")}
        <div class="box" style="display:flex;gap:6mm;margin-top:4mm;padding:6mm 5mm"><div class="soft" style="width:38mm;height:52mm;display:flex;align-items:center;font-size:9.4pt">Залепи снимка или нарисувай своя емблема.</div>
        <div style="flex:1">${["Име или детективски прякор", "Клас", "Начало на разследването", "Цел на НВО"].map((l) => `<div class="kicker" style="color:var(--muted);margin-top:4mm">${l}</div><div class="wline" style="min-height:7mm"></div>`).join("")}</div></div>
        <span class="pill" style="margin-top:6mm">Обещание на детектива</span>
        <p style="font-size:15pt;font-weight:800;line-height:1.3;margin:3mm 0 0">Чета внимателно. Търся доказателства. Проверявам. Ако сгреша, поправям и продължавам.</p>
        <div class="spacer"></div><div class="ranks">${book.ranks.map((r) => `<div class="soft"><h3>${h(r[0])}</h3><p>${h(r[1])}</p></div>`).join("")}</div>`);

    case "how":
      return wrap("Прочети тази страница и започни", `${titled("Как се играе?", "magnifier")}
        <p class="lead">Всяко досие е за творба или за посочена глава от нея. Приготви молив, гума и текста на творбата.</p>
        <div class="steps">
        <div class="step"><div class="n">1</div><div><h3>Избери позната творба.</h3><p>Списъкът е на стр. ${mapPage}. Прочети творбата или посочения откъс. „Накратко“ ти припомня основното и дава важни понятия.</p></div></div>
        <div class="step"><div class="n">2</div><div><h3>Реши основната мисия: 1, 2 и 3.</h3><p>В задача 1 търсиш трите думи със звездичка. В задача 2 ги използваш за отговори. В задача 3 избираш по един отговор – като в теста на НВО.</p></div></div>
        <div class="step"><div class="n">3</div><div><h3>Получи буквата от своето решение.</h3><p>Под задача 3 попълни петте квадратчета „Кодът на досието“. Вземи само буквата от жълтото квадратче. До кода пише в кое поле на стр. ${msgPage} да я запишеш.</p></div></div>
        <div class="step"><div class="n">4</div><div><h3>Провери и отбележи досието.</h3><p>В края на всяко досие пише къде са отговорите. Ако поправиш кода, провери и буквата на стр. ${msgPage}. После сложи отметка до творбата на стр. ${mapPage}.</p></div></div>
        </div><div class="spacer"></div>
        <div class="soft"><p style="margin:0">Помощта е разрешена. Можеш да гледаш в текста, да питаш и да поправяш. Няма таймер и няма наказания.</p></div>
        <p class="note" style="margin-top:3mm">Задачи 4 и 5 са бонус. След ${nD}-те досиета те чака финалът на стр. ${finalPage}.</p>`);

    case "tempo":
      return wrap("Три нива / ти избираш докъде", `${titled("Играй в своето темпо.", "folder")}
        <div class="levels">
        <div class="box"><h3>1 · Основната мисия</h3><p>Реши задачи 1–3. Вземи буквата от жълтото квадратче в кода на задача 3. Запиши я на стр. ${msgPage}. Провери и отбележи досието.</p></div>
        <div class="box"><h3>2 · Още следи</h3><p>Задача 4 е по желание. Подреди случките, свържи понятията с примерите, допълни цитата или разпознай кой говори.</p></div>
        <div class="box"><h3>3 · Докажи своя прочит</h3><p>Задача 5 е по желание. Формулирай теза в едно изречение. Има готово начало. Когато си готов, подкрепи тезата с кратък цитат – точно както на НВО.</p></div>
        </div><div class="spacer"></div>
        <div class="soft"><p style="margin:0">${h(book.tempoNote)}</p></div>`);

    case "map": {
      let rows = "", grade = null;
      for (const d of ds) {
        if (book.mapByGrade && d.grade !== grade) { grade = d.grade; rows += `<tr class="gr"><td colspan="5">${grade}. клас</td></tr>`; }
        rows += `<tr><td class="ck"><span>${solved ? "✓" : ""}</span></td><td class="n">${pad2(d.no)}</td><td>${h(workTitle(d))}</td><td class="au">${h(d.author)}</td><td class="p">${P.at(`d${d.no}`)}</td></tr>`;
      }
      return wrap("Избери творба / отбелязвай напредъка", `<h1>Картата на досиетата</h1><p>След задачи 1–3 и проверката сложи отметка. Можеш да решаваш досиетата в избран от теб ред.</p><table class="map">${rows}</table><p class="small" style="margin-top:2mm">Числото вдясно е страницата, на която започва досието.</p>`);
    }

    case "message": {
      const ex = ds.find((d) => d.no === book.exampleDossier) || ds[0];
      const words = book.message.toUpperCase().split(/[\s,.;:!?–-]+/).filter(Boolean);
      let k = 0;
      const rows = words.map((w) => `<div class="word boxes">${[...letters(w)].map((ch) => { k++; return `<div class="c" style="width:11.2mm;height:11.2mm;font-size:14pt"><i>${k}</i>${solved ? h(ch) : ""}</div>`; }).join("")}</div>`).join("");
      return wrap(`${nD} досиета + 1 финална буква`, `${titled("Събери тайното послание.", "cryptex")}
        <p class="lead">Във всяко досие реши задача 3 и попълни „Кодът на досието“. Вземи буквата от жълтото квадратче. Запиши я в полето, посочено до кода.</p>
        <span class="pill">Показан пример: досие ${ex.no}</span>
        <div style="display:flex;align-items:center;gap:5mm;margin:1mm 0 2mm">${boxesHTML(ex.codeL, ex.yellow, true)}<div style="font-weight:700;font-size:9pt">Жълто е квадратче № ${ex.yellow}.<br>В него е ${ex.codeL[ex.yellow - 1]}. Записваш ${ex.codeL[ex.yellow - 1]} в поле ${ex.no}.</div></div>
        <p class="note">По-долу пренасяш само по една буква от всяко досие.</p>
        <div class="msg">${rows}</div><div class="spacer"></div>
        <p style="font-size:9pt">Полетата са групирани по думи. Прочети редовете отгоре надолу. Последната буква ще получиш от финала на стр. ${finalPage}.</p>
        <p class="note">Можеш да оставиш празно поле и да се върнеш към него.</p>`);
    }

    case "helpWord": {
      const ex = { grid: [[..."СЛОВО"], [..."МОРЕТ"], [..."ЛИСТА"]], placed: [{ word: "СЛОВО", star: true, r: 0, c: 0, d: 0, end: [0, 4] }], free: [] };
      return wrap("Помощ при нужда / задача 1", `${titled("Как да откриеш дума?", "magnifier")}
        <p class="lead">За основната мисия търсиш само трите думи със звездичка в списъка. Началните им букви в решетката са оцветени в жълто.</p>
        <span class="pill">Малък пример</span>
        <div style="display:flex;gap:8mm;align-items:center;margin:2mm 0 5mm 4mm">${gridHTML(ex, { cell: 10, starts: [[0, 0]], solved: true, labels: false })}<p style="margin:0;font-size:10pt">Търсим СЛОВО.<br>Започваме от жълтото С.<br>Продължаваме надясно.<br>Ограждаме цялата дума.</p></div>
        <p style="font-size:10pt">В големите решетки думите вървят по права линия:</p>
        <p style="font-size:11pt;margin:2mm 0 4mm"><b>→</b> надясно &nbsp;&nbsp; <b>↓</b> надолу &nbsp;&nbsp; <b>↘</b> или <b>↗</b> по диагонал</p>
        <p style="font-size:10pt">Две думи може да имат обща буква. Не трий буквите: ограждай думите с молив.</p><div class="spacer"></div>
        <div class="soft"><p style="margin:0">Още игра, ако искаш: намери и останалите думи. Прочети неоградените букви отляво надясно, ред по ред. Получава се скрита следа – най-често кратък цитат от творбата. Тя е бонус и не е нужна за тайното послание.</p></div>`);
    }

    case "helpCode": {
      const ex = ds.find((d) => d.no === book.exampleDossier) || ds[0];
      return wrap("Помощ при нужда / задачи 2 и 3", `${titled("От уликата до кода", "cryptex")}
        <span class="pill">2 · Избери дума</span>
        <p style="font-size:10pt">До решетката има три думи със звездичка. Прочети въпроса и запиши подходящата дума на линията. Всяка от трите думи се използва веднъж.</p>
        <div class="box" style="margin:1mm 0 4mm"><p style="margin:0">Пример: МЕТАФОРА · ЕПИТЕТ · СРАВНЕНИЕ<br>Въпрос: Как се нарича художественото определение „тиха нощ“?<br>Отговор: ЕПИТЕТ</p></div>
        <span class="pill">3 · Избери отговор</span>
        <p style="font-size:10pt">На всеки въпрос има три отговора. Огради буквата пред верния. Препиши буквите по ред: от въпрос 1 до въпрос 5.</p>
        <div style="display:flex;justify-content:center;margin:3mm 0">${boxesHTML(ex.codeL, ex.yellow, true, 11)}</div>
        <p style="font-size:9.4pt">Пример с досие ${ex.no}: получаваш ${ex.codeL}. Жълтото квадратче е № ${ex.yellow} и в него пише ${ex.codeL[ex.yellow - 1]}. Вземаш тази буква и я записваш в поле ${ex.no} на стр. ${msgPage}. В другите досиета гледай кое квадратче в кода е жълто.</p>
        <div class="spacer"></div><p class="note">Не се получава дума? Провери отговорите и реда им.</p>`);
    }

    case "helpBonus":
      return wrap("Помощ при нужда / задача 4", `${titled("Бонусите са по желание.", "folder")}
        <div class="levels" style="gap:2.6mm">
        ${[["Подреди случките", "Напиши 1 пред най-ранната, 2 пред следващата и така до 5. Всяко число се използва веднъж."],
          ["Раздели в две групи", "Запиши всяка дума под подходящото заглавие. Думите в списъка се използват по веднъж."],
          ["Допълни цитата", "Избери дума от дадения списък и я запиши на празното място. Ако се колебаеш, намери реда в творбата."],
          ["Кой го казва?", "Избери име от списъка и го напиши след репликата. Едно име може да се повтори."],
          ["Свържи понятието с примера", "До всяко понятие (епитет, метафора, символ…) запиши буквата на примера от творбата."]]
          .map(([t, s]) => `<div class="box" style="padding:2.6mm 4mm"><h3 style="text-transform:none;font-size:10pt;margin-bottom:.8mm">${t}</h3><p style="margin:0">${s}</p></div>`).join("")}
        </div><div class="spacer"></div><p class="note">Можеш да пропуснеш бонуса и пак да получиш буквата.</p>`);

    case "helpThesis":
      return wrap("Помощ при нужда / задача 5", `${titled("Теза в едно изречение.", "notebook")}
        <p class="lead">Тук няма нужда от дълго съчинение. Прочети въпроса, използвай подсказаното начало и кажи какво мислиш. На НВО след 10. клас има задача, в която формулираш теза или антитеза – тук тренираш точно това.</p>
        <span class="pill">Пример с измислена история</span>
        <div class="box" style="margin:1mm 0 3mm"><p style="margin:0">„Мила се страхуваше, но влезе, за да помогне.“<br>Въпрос: Какво разкрива постъпката на Мила?<br>Начало: Постъпката на Мила разкрива, че…</p></div>
        <p class="note" style="font-size:9.4pt">Една достатъчна теза:</p>
        <p style="font-size:12.5pt;font-weight:800;line-height:1.3">Постъпката на Мила разкрива, че истинската смелост не е липса на страх, а избор да помогнеш въпреки него.</p>
        <span class="pill">Искаш ли да отидеш по-дълбоко?</span>
        <p style="font-size:10pt">Добави аргумент с точни думи от текста в кавички. Например: Думите „се страхуваше, но влезе“ показват, че Мила преодолява страха си.</p>
        <div class="spacer"></div><p class="note">При проверката сравнявай смисъла, не точните думи.</p>`);

    case "dossierA": {
      const d = p.data.d, G = d.grid;
      const starts = G.placed.filter((x) => x.star).map((x) => [x.r, x.c]);
      const starWords = d.stars.map((s) => letters(s.w));
      const bonusWords = G.placed.filter((x) => !x.star).map((x) => x.word).sort((a, b) => a.localeCompare(b, "bg"));
      const gloss = (d.gloss || []).map(([w, m]) => `${h(w)} = ${h(m)}.`).join(" ");
      return wrap(`Досие ${pad2(d.no)} / ${h(d.author)}`, `${titled(`${h(q(d.title))}${d.part ? `<span class="part">${h(d.part)}</span>` : ""}`, d.icon)}
        <span class="pill" style="margin-top:0">Накратко за творбата</span>
        <p class="summary">${h(d.summary)}</p>${gloss ? `<p class="gloss">${gloss}</p>` : ""}
        <span class="pill">1 · Огради трите думи със звездичка</span>
        <div class="dirs">Търси <b>→ ↓ ↘ ↗</b> по права линия. Началото е в жълто.</div>
        <div class="ws">${gridHTML(G, { starts, solved })}<div class="words">${starWords.map((w) => `<div class="star">${h(w)}</div>`).join("")}${bonusWords.map((w) => `<div>${h(w)}</div>`).join("")}<div class="other">Другите думи са бонус.</div></div></div>
        <div class="small" style="margin-top:1.4mm">Бонус: намери всички думи. Препиши неоградените букви ред по ред.</div>
        <div style="display:flex;gap:2mm;align-items:baseline;font-weight:800;font-size:8.8pt;margin-bottom:.6mm"><span class="${solved ? "ans b" : ""}" style="white-space:nowrap">Скрита следа:</span><span style="flex:1;border-bottom:.3mm solid var(--line)" class="ans b"><span class="solvedonly">${h(d.trace)}</span>&nbsp;</span></div>
        <div class="sechead"><span class="pill">2 · Събери уликите</span><span class="small">Отговори с трите думи със звездичка.</span></div>
        <div class="clues">${d.stars.map((s, i) => `<div>${i + 1}. ${h(s.q)}</div><div class="a"><span class="solvedonly">${h(s.a || letters(s.w))}</span></div>`).join("")}</div>`);
    }

    case "dossierB": {
      const d = p.data.d;
      return wrap(`Досие ${pad2(d.no)} / ${h(workTitle(d))}`, `<span class="pill rust" style="margin-top:.6mm">3 · Избери верния отговор</span>
        <p class="small" style="margin:0 0 1.4mm">Огради по една буква. Препиши ги долу по ред 1–5.</p>
        ${mcHTML(d.mcP)}
        <div class="coderow"><span class="lbl">Кодът на досието:</span>${boxesHTML(d.codeL, d.yellow, solved)}<div class="hint">Вземи буква № ${d.yellow} (жълтата).<br>Запиши я в поле ${d.no} на стр. ${msgPage}.</div></div>
        <span class="pill">4 · Бонус: ${h(d.t4.title || T4_TITLE[d.t4.type])}</span>
        ${t4HTML(d.t4)}
        <span class="pill gold">5 · Бонус: теза в едно изречение</span>
        <p class="t5q">${h(d.t5.q)}</p>
        <div class="blankonly"><p class="small" style="color:var(--ink)">Начало: ${h(d.t5.start)}</p><div class="wline"></div><div class="wline"></div></div>
        <p class="solvedonly ans">Пример: ${h(d.t5.example)}</p>
        <div class="spacer"></div><p class="note" style="margin:1mm 0 0">Буквата е от жълтото квадратче в кода на задача 3. Проверка: стр. ${P.ansPage(d.no)}.</p>`);
    }

    case "reviewA":
    case "reviewB": {
      const R = ctx.reviews[p.data.ri];
      if (p.kind === "reviewA") {
        return wrap(`${h(R.title)} / по желание`, `${titled("Върни се по следите.", "folder")}
          <p class="note" style="margin-top:-1mm">Използвай решените досиета. Този преговор не носи буква.</p>
          <div style="font-size:${R.list.length > 12 ? 9.2 : 9.8}pt;line-height:1.38">${R.list.map((x) => `<div><b style="color:var(--rust);display:inline-block;width:6mm">${x.l}</b>${h(workTitle(x.d))}</div>`).join("")}</div>
          <span class="pill">1 · От кое досие е следата?</span>
          <p style="margin:0 0 1mm">Запиши буквата пред заглавието от списъка по-горе.</p>
          <div class="t4" style="font-size:${R.list.length > 12 ? 9.2 : 9.8}pt">${R.t1.map((x, i) => `<div class="row" style="margin:${R.list.length > 12 ? 0.5 : 1}mm 0"><b style="width:5mm">${i + 1}.</b><span class="slot"><span class="solvedonly">${x.l}</span></span><span>${h(q(x.text))}</span></div>`).join("")}</div>
          <div class="spacer"></div><p class="note" style="margin:0">Проверка: стр. ${restPage}. Можеш да решиш само няколко реда.</p>`);
      }
      return wrap(`${h(R.title)} / по желание`, `${titled("Кой стои зад уликата?", "magnifier")}
        <span class="pill">2 · Свържи думата и досието</span>
        <p style="margin:0 0 1mm">Използвай буквите пред заглавията на стр. ${P.at(`r${p.data.ri}`)}.</p>
        <div class="t4" style="display:grid;grid-template-columns:1fr 1fr;column-gap:6mm;font-size:10pt;row-gap:1mm">${R.t2.map((x, i) => `<div class="row"><b style="width:5mm">${i + 1}.</b><span class="slot"><span class="solvedonly">${x.l}</span></span><b>${h(x.w)}</b></div>`).join("")}</div>
        <span class="pill">3 · Кой е авторът?</span>
        <p style="margin:0 0 1mm">Запиши буквите на досиетата до името на автора.</p>
        <div style="display:grid;grid-template-columns:46mm 1fr;font-size:9.8pt">${R.t3.map((x) => `<div style="padding:1mm 0">${h(x.author)}</div><div class="wline" style="min-height:5mm"><span class="solvedonly ans">${x.ls.join(", ")}</span></div>`).join("")}</div>
        <div class="spacer"></div><p class="note" style="margin:0 0 1mm">Искаш още? ${h(R.more)}</p><p class="solvedonly ans" style="font-weight:500;font-size:8.6pt">Пример: ${h(R.moreExample)}</p>`);
    }

    case "finalA": {
      const F = ctx.final;
      return wrap("Финал / пет познати автора", `${titled("Последният ключ", "cryptex")}
        <p class="lead">Огради буквата пред верния отговор на всеки въпрос. Препиши буквите по ред в квадратчетата. Можеш да проверяваш в досиетата.</p>
        ${mcHTML(F.mcP)}
        <div class="coderow" style="justify-content:center;margin-top:4mm">${boxesHTML(F.codeL, F.yellow, solved, 10)}</div>
        <p class="note" style="text-align:center">Вземи буква № ${F.yellow} (жълтата) от кода. Запиши я в поле ${msgFields.length} на стр. ${msgPage}.</p>`);
    }

    case "finalB":
      return wrap("Финал / кажи какво си открил", `${titled("Ти разкри посланието.", "chest")}
        <p class="lead">Препиши думите от стр. ${msgPage}. Ако някое поле е празно, върни се към задача 3 на досието със същия номер. За поле ${msgFields.length} виж финала на стр. ${finalPage}.</p>
        <div class="wline" style="font-size:13pt;font-weight:900;color:var(--green);min-height:10mm"><span class="solvedonly">${h(book.message.toUpperCase())}</span></div><div class="wline" style="min-height:10mm"></div>
        <h2 style="margin-top:6mm">Как ще приложиш това послание на изпита?</h2>
        ${book.applyExamples.map((x) => `<div class="wline ans" style="min-height:8mm"><span class="solvedonly">${h(x)}</span></div>`).join("")}
        <span class="pill" style="margin-top:6mm">Една последна мисъл · по желание</span>
        <h2>Коя творба те накара да мислиш най-много и защо?</h2>
        <div class="wline"><span class="solvedonly ans" style="font-weight:500">Пример: ${h(book.favoriteExample)}</span></div><div class="wline blankonly"></div>
        <div class="spacer"></div>
        <div class="soft"><p style="margin:0">Провери финала на стр. ${restPage}. След ${nD}-те основни мисии и финала можеш да попълниш дипломата на стр. ${dipPage}. Бонусите не са задължителни.</p></div>`);

    case "answers":
      return wrap("Отговори / поправките също са учене", `<h1 style="margin-bottom:1mm">Провери и продължи.</h1>
        <p class="small" style="margin-bottom:2.4mm">В задача 1 (1,2) означава ред 1, колона 2. Показани са началната и крайната клетка на всяка дума.</p>
        ${p.data.list.map((d) => {
          const stars = d.stars.map((s) => d.grid.placed.find((x) => x.word === letters(s.w)));
          return `<div class="ansblock"><div class="bar">${pad2(d.no)} · ${h(workTitle(d))}</div>
            <div class="pos">1. ${stars.map((x) => `${x.word}: ${cell(x.r, x.c)}–${cell(x.end[0], x.end[1])}`).join("; ")}</div>
            <div class="main">2. ${d.stars.map((s) => h(s.a || letters(s.w))).join(" / ")}</div>
            <div class="codeline"><span>3. Код: ${d.codeL}</span><span>Буква № ${d.yellow}: ${d.codeL[d.yellow - 1]} → поле ${d.no}</span></div>
            <div>Бонус 4. ${h(t4Answer(d.t4))}</div>
            <div>Бонус 5. Пример: ${h(d.t5.example)}</div>
            <div class="tr">Скрита следа (бонус): ${h(d.trace)}</div></div>`;
        }).join("")}`);

    case "answersRest": {
      const F = ctx.final;
      return wrap("Отговори / преговори и финал", `<h1>Провери преговорите.</h1>
        ${ctx.reviews.map((R) => `<span class="pill">${h(R.title)}</span>
          <p style="margin:0 0 1mm"><b>Задача 1:</b> ${R.t1.map((x, i) => `${i + 1}=${x.l}`).join(", ")}.</p>
          <p style="margin:0 0 1mm"><b>Задача 2:</b> ${R.t2.map((x, i) => `${i + 1}=${x.l}`).join(", ")}.</p>
          <p class="small">Задача 3. ${R.t3.map((x) => `${h(x.author)}: ${x.ls.join(", ")}`).join("; ")}.</p>`).join("")}
        <span class="pill">Финалът</span>
        <p style="font-weight:800;font-size:10.5pt;margin:0">Код: ${F.codeL}. Буква № ${F.yellow} (жълтата) е ${F.codeL[F.yellow - 1]} → поле ${msgFields.length}.<br>Послание: ${h(book.message.toUpperCase())}</p>`);
    }

    case "diploma":
      return wrap("Бюро за литературни разследвания", `<div class="dip"><h1 style="text-align:left">Диплома</h1><img src="${asset("badge.png")}">
        <div class="kicker" style="margin-top:4mm;font-size:8pt">Присъжда се на</div><div class="wline" style="margin:8mm 6mm 6mm"></div>
        <p style="font-size:12pt;text-align:left;padding-left:5mm">за разкриването на ${nD}-те основни мисии<br>и тайното послание.</p>
        <div class="rank">ГЛАВЕН ИНСПЕКТОР<br>ПО ЛИТЕРАТУРА</div>
        <div class="sig"><div>ДАТА</div><div>ПОДПИС НА РОДИТЕЛ ИЛИ УЧИТЕЛ</div></div>
        <p class="note" style="margin-top:7mm">Разследването продължава с всяка нова книга.</p></div>`);

    case "notes":
      return wrap("Бележки за родител и учител", `<h1>За съвместния преглед</h1>
        <p class="lead">Проверявайте кратките отговори по смисъл. Посочените примери не са единствените правилни формулировки.</p>
        ${(book.notes || []).map((n) => `<span class="pill">${h(n.title)}</span>${n.lines.map((l) => `<p style="margin:0 0 1.2mm;font-size:9pt">${h(l)}</p>`).join("")}`).join("")}
        <span class="pill">Нашите бележки</span><div class="lines">${"<div class='wline'></div>".repeat(4)}</div>`);

    case "notebook":
      return wrap("Личен архив / бележник на детектива", `${titled("Следите, които открих", "notebook")}
        <p>Запиши връзки между творбите, важни цитати и аргументи, които искаш да използваш на изпита.</p>
        <div class="lines">${"<div class='wline'></div>".repeat(17)}</div><div class="spacer"></div>
        <p class="note">Добрият детектив вижда връзки там, където другите виждат само думи.</p>`);

    case "back":
      return `<section class="page full back"><div class="hero" style="height:84mm;background-image:url('${asset("desk.jpg")}')"><div class="stamp">${h(book.backStamp)}</div></div>
        <div class="inner"><h2>Ученето влиза в играта.</h2><p style="font-size:10.5pt;opacity:.9;margin-bottom:6mm">Тук всяка творба е досие. Героите оставят следи, думите крият улики, а верните отговори отключват тайни кодове.</p>
        ${[["01", "Разкрий загадките", "Открий скритите думи, събери уликите и възстанови случая."], ["02", "Разбери смисъла", "Разследвай мотивите, образите и идеите зад думите."], ["03", "Докажи своя прочит", "Формулирай теза и я защити с цитат – като на НВО."]]
          .map(([n, k, t]) => `<div class="pt"><div class="n">${n}</div><div><div class="k">${k}</div><p>${t}</p></div></div>`).join("")}
        <div class="spacer"></div><div class="sum">${nD} творби · 3 нива · 1 голямо дело</div><p style="font-weight:800;margin-top:2mm">${h(book.backLine)}</p><p style="color:var(--gold);font-weight:900;font-size:8pt;margin:3mm 0 0">ЕДУ БЕЛ</p></div></section>`;
  }
  return "";
}

function prepReviews(book, ds) {
  return (book.reviews || []).map((r, ri) => {
    const rand = rng(`review|${ri}`);
    const sub = ds.filter((d) => d.no >= r.from && d.no <= r.to);
    const list = shuffle(sub, rand).map((d, i) => ({ d, l: LIST_LETTERS[i] }));
    const L = (d) => list.find((x) => x.d === d).l;
    const t1 = shuffle(sub, rand).map((d) => ({ text: d.trace, l: L(d) }));
    const t2 = shuffle(sub, rand).map((d) => ({ w: letters(d.stars[Math.floor(rand() * 3)].w), l: L(d) }));
    const authors = [...new Set(sub.map((d) => d.author))].sort((a, b) => a.localeCompare(b, "bg"));
    const t3 = authors.map((a) => ({ author: a, ls: list.filter((x) => x.d.author === a).map((x) => x.l).sort((x, y) => LIST_LETTERS.indexOf(x) - LIST_LETTERS.indexOf(y)) }));
    return { ...r, list, t1, t2, t3 };
  });
}

function prepFinal(book, ds) {
  const f = book.final;
  const rand = rng("final");
  const authors = [...new Set(ds.map((d) => d.author))];
  const qs = f.works.map((no, i) => {
    const d = ds.find((x) => x.no === no) || ds[i % ds.length]; // the fallback only matters for --draft builds
    const wrong = shuffle(authors.filter((a) => a !== d.author), rand).slice(0, 2);
    return { q: `Кой е написал ${workTitle(d)}?`, a: d.author, w: wrong };
  });
  const codeL = letters(f.code);
  return { ...f, codeL, mcP: prepMC(qs, codeL, "final-mc") };
}

async function fontCSS(assetDir) {
  const W = [400, 500, 600, 700, 800, 900];
  let css = "";
  for (const w of W) for (const sub of ["cyrillic", "latin"]) {
    const f = path.join(assetDir, "fonts", `sofia-sans-${sub}-${w}-normal.woff2`);
    css += `@font-face{font-family:"Sofia Sans";font-weight:${w};font-style:normal;src:url("${pathToFileURL(f).href}") format("woff2");${sub === "latin" ? "unicode-range:U+0000-00FF,U+2000-206F,U+2190-21FF,U+2605,U+2713;" : "unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;"}}\n`;
  }
  return css;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((a) => !a.startsWith("--")) || "private/dossiers10/content");
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const checkOnly = args.includes("--check");
  const loaded = await load(dir);
  const { book } = loaded;
  const pick = flag("--dossiers") ? flag("--dossiers").split(",").map(Number) : null;
  const dossiers = pick ? loaded.dossiers.filter((d) => pick.includes(d.no)) : loaded.dossiers;
  const draft = args.includes("--draft") || !!pick;
  const errors = check(book, dossiers, draft);
  const ds = [];
  for (const d of dossiers) {
    try { ds.push(prepDossier(d)); } catch (e) { errors.push(`Досие ${d.no} (${d._file}): ${e.message}`); }
  }
  if (errors.length) { console.error("Грешки:\n- " + errors.join("\n- ")); process.exit(1); }
  console.log(`Досиета: ${ds.length}. Посланието и кодовете са наред.`);
  if (checkOnly && !args.includes("--render")) return;

  const assetDir = path.resolve(dir, book.assets || "../assets");
  const outDir = flag("--out") ? path.resolve(flag("--out")) : path.resolve(dir, book.out || "../out");
  await mkdir(outDir, { recursive: true });
  const P = plan(book, ds);
  const reviews = prepReviews(book, ds);
  const final = prepFinal(book, ds);
  const css = (await fontCSS(assetDir)) + (await readFile(path.join(HERE, "book.css"), "utf8"));
  const asset = (f) => pathToFileURL(path.join(assetDir, f)).href;
  // --dossiers renders only the pages of those dossiers (for quick checks while writing).
  const only = flag("--only") ? flag("--only").split(",").map(Number) : null;
  const onlyKinds = pick ? ["dossierA", "dossierB", "answers"] : null;

  // Playwright is not a project dependency; createRequire also finds a globally installed copy.
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  let problems = 0;
  for (const variant of ["uchenik", "resheniya"]) {
    const solved = variant === "resheniya";
    const ctx = { book, ds, P, solved, asset, reviews, final };
    const pages = P.pages.filter((p, i) => onlyKinds ? onlyKinds.includes(p.kind) : !only || only.includes(p.num ?? -(i + 1)) || (only.includes(0) && !p.num));
    const html = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><title>${h(book.series)} – ${h(book.footTag || "")}</title><style>${css}</style></head><body class="${solved ? "solved" : "student"}">${pages.map((p) => renderPage(p, ctx)).join("\n")}</body></html>`;
    const htmlFile = path.join(outDir, `${book.name}-${variant}.html`);
    await writeFile(htmlFile, html);
    const page = await browser.newPage({ viewport: { width: 700, height: 1000 } });
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const over = await page.evaluate(() => [...document.querySelectorAll(".page")].map((pg, i) => {
      const b = pg.querySelector(".body"); const num = `${pg.querySelector(".num")?.textContent || "#" + (i + 1)} (${pg.dataset.id || ""})`;
      if (!b) return null;
      const extra = b.scrollHeight - b.clientHeight, wide = b.scrollWidth - b.clientWidth;
      return extra > 1 || wide > 1 ? `стр. ${num}: излиза ${extra > 1 ? `с ${Math.round(extra * 25.4 / 96)} мм надолу` : ""}${wide > 1 ? ` и с ${Math.round(wide * 25.4 / 96)} мм встрани` : ""}` : null;
    }).filter(Boolean));
    if (over.length) { problems += over.length; console.warn(`[${variant}] Съдържанието не се побира:\n  ` + over.join("\n  ")); }
    if (!checkOnly) {
      const pdf = path.join(outDir, `${book.name}-${variant}${only || pick ? "-preview" : ""}.pdf`);
      await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
      console.log(`PDF: ${pdf} (${pages.length} стр.)`);
    }
    const png = flag("--png");
    if (pick && args.includes("--png-dossiers")) {
      const all = await page.$$(".page");
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].kind === "answers") continue;
        await all[i].screenshot({ path: path.join(outDir, `png-${variant}-${pages[i].id}.png`) });
      }
      console.log(`PNG: ${outDir}/png-${variant}-d*.png`);
    }
    if (png) {
      const want = png.split(",").map(Number);
      const all = await page.$$(".page");
      for (let i = 0; i < pages.length; i++) {
        const n = pages[i].num ?? 0;
        if (!want.includes(n) && !(n === 0 && want.includes(-1 - i))) continue;
        const f = path.join(outDir, `png-${variant}-${n ? pad2(n) : `x${i + 1}`}.png`);
        await all[i].screenshot({ path: f });
      }
      console.log(`PNG: ${outDir}/png-${variant}-*.png`);
    }
    await page.close();
  }
  await browser.close();
  if (problems) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exit(1); });
