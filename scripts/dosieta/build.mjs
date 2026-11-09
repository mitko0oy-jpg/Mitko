#!/usr/bin/env node
// Генератор на книгата-игра „Литературни досиета“ (печатен PDF, формат B5).
//
//   node scripts/dosieta/build.mjs <съдържание> <assets> <out> [--check] [--html] [--only=student|solutions]
//
// <съдържание> е JSON файл ({ book, dossiers }) или папка с book.json и d01.json, d02.json, …
// Съдържанието е платено и НЕ влиза в git – дръж го в private/.
// <assets> е папка с изображенията (cover.jpg, hero.jpg, lupa.png …) и fonts-local.css.
// --check само проверява съдържанието и решетките; --html пропуска PDF.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildWordSearch, DIRS, rng, hash, shuffle, letters } from './wordsearch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALPHA = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЮЯ';
const REVIEW_LETTERS = 'АБВГДЕЖЗИЙКЛМНОПРСТУФ';
const ICONS = ['lupa', 'papka', 'kod', 'znachka', 'sandak', 'tetradka'];

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const q = (t) => `„${esc(t)}“`;
const pad = (n) => String(n).padStart(2, '0');
const upper = (s) => String(s).toLocaleUpperCase('bg');

// ---------------------------------------------------------------- съдържание

function loadContent(src) {
  const st = fs.statSync(src);
  if (st.isFile()) return JSON.parse(fs.readFileSync(src, 'utf8'));
  const book = JSON.parse(fs.readFileSync(path.join(src, 'book.json'), 'utf8'));
  const files = fs
    .readdirSync(src)
    .filter((f) => /^d\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const dossiers = files.map((f) => {
    try {
      return { ...JSON.parse(fs.readFileSync(path.join(src, f), 'utf8')), _file: f, _no: parseInt(f.slice(1)) };
    } catch (e) {
      throw new Error(`${f}: невалиден JSON – ${e.message}`);
    }
  });
  return { book, dossiers };
}

function keyIndex(code, letter, explicit) {
  if (explicit) return code[explicit - 1] === letter ? explicit : -1;
  return code.indexOf(letter) + 1 || -1;
}

// Подрежда трите отговора и дава букви на грешните: верният е буквата от кода.
function layoutMcq(items, code, seed) {
  const rand = rng(seed);
  let positions;
  do positions = items.map(() => Math.floor(rand() * 3));
  while (new Set(positions).size === 1);
  return items.map((it, i) => {
    const okLetter = code[i];
    const others = shuffle(
      ALPHA.split('').filter((ch) => ch !== okLetter),
      rand,
    ).slice(0, 2);
    const opts = [...it.no.map((t, j) => ({ t, l: others[j], ok: false }))];
    opts.splice(positions[i], 0, { t: it.ok, l: okLetter, ok: true });
    return { q: it.q, opts };
  });
}

function prepare({ book, dossiers }, { partial = false } = {}) {
  const errors = [];
  const warns = [];
  const message = letters(book.message || '');
  if (message.length !== dossiers.length + 1) {
    (partial ? warns : errors).push(`Посланието има ${message.length} букви, а досиетата са ${dossiers.length} (трябват ${message.length - 1} + финала).`);
  }
  if (!partial) dossiers.forEach((d, i) => d._no && d._no !== i + 1 && errors.push(`Файлът ${d._file} е на място ${i + 1} – номерата трябва да са поредни.`));
  const out = dossiers.map((d, i) => {
    const no = d._no || i + 1;
    const tag = `Досие ${pad(no)}${d._file ? ` (${d._file})` : ''} „${d.title || '?'}“`;
    const err = (m) => errors.push(`${tag}: ${m}`);
    const warn = (m) => warns.push(`${tag}: ${m}`);
    for (const f of ['author', 'title', 'theme', 'grade', 'genre', 'summary', 'trace', 'code']) if (!d[f]) err(`липсва „${f}“`);
    if (d.no && d.no !== no) warn(`полето no=${d.no}, а досието е № ${no}`);
    const star = (d.words?.star || []).map(letters);
    const bonus = (d.words?.bonus || []).map(letters);
    if (star.length !== 3) err('трябват точно 3 думи със звездичка');
    if (bonus.length < 7) err('трябват поне 7 бонус думи');
    const clues = d.clues || [];
    if (clues.length !== 3) err('трябват точно 3 улики (clues)');
    const clueAns = clues.map((c) => letters(c.a));
    if ([...clueAns].sort().join() !== [...star].sort().join()) err(`отговорите на уликите (${clueAns.join(', ')}) трябва да са трите думи със звездичка (${star.join(', ')})`);
    const mcq = d.mcq || [];
    if (mcq.length !== 5) err('трябват точно 5 въпроса в задача 3');
    mcq.forEach((m, j) => {
      if (!m.q || !m.ok || !Array.isArray(m.no) || m.no.length !== 2) err(`въпрос ${j + 1} в задача 3 трябва да има q, ok и два грешни отговора в no`);
      for (const t of [m.ok, ...(m.no || [])]) if (String(t).length > 70) warn(`дълъг отговор във въпрос ${j + 1} (${String(t).length} знака): ${t}`);
      if (String(m.q).length > 110) warn(`дълъг въпрос ${j + 1} (${String(m.q).length} знака)`);
    });
    const code = letters(d.code || '');
    if (code.length !== 5) err(`кодът „${d.code}“ трябва да е 5 букви`);
    const need = message[no - 1];
    const key = keyIndex(code, need, d.key);
    if (key < 0) err(`кодът ${code} няма буквата „${need}“ за поле ${no} от посланието${d.key ? ` на позиция ${d.key}` : ''}`);
    const b4 = d.bonus4 || {};
    if (!['order', 'groups', 'quote', 'match'].includes(b4.type)) err('bonus4.type трябва да е order, groups, quote или match');
    if (b4.type === 'order' && (!Array.isArray(b4.items) || b4.items.length < 4 || b4.items.length > 6)) err('bonus4 order: 4–6 случки в items, в правилния ред');
    if (b4.type === 'groups' && (!b4.a || !b4.b || !b4.itemsA?.length || !b4.itemsB?.length)) err('bonus4 groups: a, b, itemsA, itemsB');
    if (b4.type === 'quote') {
      if (!Array.isArray(b4.lines) || b4.lines.length < 2) err('bonus4 quote: поне 2 реда в lines');
      for (const l of b4.lines || []) if (!/\{[^}]+\}/.test(l)) err(`bonus4 quote: редът „${l}“ няма {дума}`);
    }
    if (b4.type === 'match') {
      if (!b4.prompt || !Array.isArray(b4.lines) || b4.lines.length < 3) err('bonus4 match: prompt и поне 3 реда в lines ({t, a})');
      for (const l of b4.lines || []) if (!l.t || !l.a) err('bonus4 match: всеки ред има t и a');
    }
    const th = d.thesis || {};
    if (!th.q || !th.start || !th.example) err('thesis: q, start и example');
    if (String(d.summary || '').length > 340) warn(`резюмето е ${String(d.summary).length} знака (препоръка до 320)`);
    let ws = null;
    if (star.length === 3 && bonus.length) {
      try {
        ws = buildWordSearch({ star, bonus, trace: d.trace, seed: hash(`${d.author}|${d.title}|${d.part || ''}`) });
        if (ws.unused.length) warn(`тези бонус думи не влязоха в решетката: ${ws.unused.join(', ')}`);
      } catch (e) {
        err(`решетка: ${e.message}`);
      }
    }
    const mcqL = mcq.length === 5 && code.length === 5 ? layoutMcq(mcq, code, hash(d.title) + 17) : [];
    return { ...d, no, star, bonus, ws, code, key, mcqL };
  });

  const f = book.final || {};
  const fcode = letters(f.code || '');
  const fkey = keyIndex(fcode, message[message.length - 1], f.key);
  if (fcode.length !== 5 || (f.mcq || []).length !== 5) errors.push('Финал: трябва код от 5 букви и 5 въпроса');
  else if (fkey < 0) errors.push(`Финал: кодът ${fcode} няма буквата „${message[message.length - 1]}“`);
  const final = { ...f, code: fcode, key: fkey, mcqL: fcode.length === 5 && f.mcq?.length === 5 ? layoutMcq(f.mcq, fcode, 99) : [] };
  return { book, dossiers: out, final, message, errors, warns };
}

// ---------------------------------------------------------------- части

function gridSvg(ws, solved, { cell = 7.4 } = {}) {
  const n = ws.size;
  const ox = 5;
  const oy = 4.4;
  const W = ox + n * cell;
  const H = oy + n * cell;
  const starts = new Set(ws.placed.filter((p) => p.star).map((p) => p.r * n + p.c));
  const trace = new Set(ws.traceCells);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`;
  for (let c = 0; c < n; c++) s += `<text x="${ox + c * cell + cell / 2}" y="3" font-size="2.5" text-anchor="middle" fill="#7a8286" font-weight="700">${c + 1}</text>`;
  for (let r = 0; r < n; r++) s += `<text x="2.2" y="${oy + r * cell + cell / 2 + 0.9}" font-size="2.5" text-anchor="middle" fill="#7a8286" font-weight="700">${r + 1}</text>`;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = r * n + c;
      const fill = starts.has(k) ? '#f2d58a' : solved && trace.has(k) ? '#efdcae' : '#fffdf8';
      s += `<rect x="${ox + c * cell}" y="${oy + r * cell}" width="${cell}" height="${cell}" fill="${fill}" stroke="#dccfb2" stroke-width="0.25"/>`;
    }
  }
  if (solved) {
    for (const p of ws.placed) {
      const L = p.word.length - 1;
      const x1 = ox + p.c * cell + cell / 2;
      const y1 = oy + p.r * cell + cell / 2;
      const x2 = x1 + p.dc * L * cell;
      const y2 = y1 + p.dr * L * cell;
      const col = p.star ? 'rgba(31,111,90,0.34)' : 'rgba(110,158,190,0.30)';
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${cell * 0.62}" stroke-linecap="round"/>`;
    }
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      s += `<text x="${ox + c * cell + cell / 2}" y="${oy + r * cell + cell / 2 + 1.45}" font-size="4.1" text-anchor="middle" fill="#1d3a44" font-weight="800" font-family="Sofia Sans">${ws.grid[r * n + c]}</text>`;
    }
  }
  return s + '</svg>';
}

function codeSlots(code, key, solved, cls = 'code') {
  return `<div class="${cls}">${[...code]
    .map((ch, i) => `<div class="slot${i + 1 === key ? ' key' : ''}"><i>${i + 1}</i>${solved ? ch : ''}</div>`)
    .join('')}</div>`;
}

function mcqHtml(mcqL, solved) {
  return mcqL
    .map(
      (m, i) =>
        `<div class="q">${i + 1}. ${esc(m.q)}</div>` +
        m.opts.map((o) => `<div class="o"><b class="${solved && o.ok ? 'circ' : ''}">${o.l}</b><span>${esc(o.t)}</span></div>`).join(''),
    )
    .join('');
}

function bonus4Html(d, solved) {
  const b = d.bonus4;
  const rand = rng(hash(d.title) + 41);
  if (b.type === 'order') {
    let shown;
    do shown = shuffle(b.items.map((t, i) => ({ t, n: i + 1 })), rand);
    while (shown.every((x, i) => x.n === i + 1));
    return (
      `<div class="instr">${esc(b.prompt || `Подреди случките: 1 пред най-ранната, ${b.items.length} пред последната.`)}</div>` +
      shown.map((x) => `<div class="ord"><div class="bx">${solved ? x.n : ''}</div><div>${esc(x.t)}</div></div>`).join('')
    );
  }
  if (b.type === 'groups') {
    const all = shuffle([...b.itemsA, ...b.itemsB], rand);
    return (
      `<div class="instr">Запиши думите в двете групи: ${all.map(esc).join(' · ')}</div>` +
      `<div class="groups"><div class="g"><b>${esc(b.a)}</b><span>${solved ? b.itemsA.map(esc).join(', ') : ''}</span></div>` +
      `<div class="g"><b>${esc(b.b)}</b><span>${solved ? b.itemsB.map(esc).join(', ') : ''}</span></div></div>`
    );
  }
  if (b.type === 'quote') {
    const words = b.lines.map((l) => l.match(/\{([^}]+)\}/)[1]);
    return (
      `<div class="instr">Допълни с: ${shuffle(words, rand).map((w) => esc(upper(w))).join(' · ')}</div>` +
      b.lines
        .map((l) => {
          const [pre, rest] = l.split('{');
          const [w, post] = rest.split('}');
          return `<div class="line"><div>„${esc(pre)}<span class="blank">${solved ? esc(upper(w)) : '&nbsp;'}</span>${esc(post)}“</div><div></div></div>`;
        })
        .join('')
    );
  }
  // match
  return (
    `<div class="instr">${esc(b.prompt)}</div>` +
    b.lines.map((l) => `<div class="line"><div>${l.raw ? esc(l.t) : `„${esc(l.t)}“`}</div><div class="a">${solved ? esc(l.a) : ''}</div></div>`).join('')
  );
}

function bonus4Answer(d) {
  const b = d.bonus4;
  const rand = rng(hash(d.title) + 41);
  if (b.type === 'order') {
    let shown;
    do shown = shuffle(b.items.map((t, i) => ({ t, n: i + 1 })), rand);
    while (shown.every((x, i) => x.n === i + 1));
    return `${shown.map((x) => x.n).join(', ')} (отгоре надолу)`;
  }
  if (b.type === 'groups') return `${b.a}: ${b.itemsA.join(', ')}; ${b.b}: ${b.itemsB.join(', ')}`;
  if (b.type === 'quote') return b.lines.map((l) => upper(l.match(/\{([^}]+)\}/)[1])).join(', ');
  return b.lines.map((l) => l.a).join('; ');
}

// ---------------------------------------------------------------- страници

function buildPages(P, solved) {
  const { book, dossiers, final, message } = P;
  const n = dossiers.length;
  const pages = [];
  const add = (key, kind, render) => pages.push({ key, kind, render });
  const ex = dossiers[Math.min(n - 1, Math.max(0, Math.round(n / 3) - 1))];
  const g11 = dossiers.filter((d) => String(d.grade) === '11');
  const g12 = dossiers.filter((d) => String(d.grade) === '12');
  const groups = [g11, g12].filter((g) => g.length);
  const lastNo = n;

  add('cover', 'full', coverPage);
  add('mission', 'full', missionPage);
  add('card', 'page', cardPage);
  add('howto', 'page', howtoPage);
  add('tempo', 'page', tempoPage);
  groups.forEach((g, i) => add(`map${i}`, 'page', (c) => mapPage(c, g, i)));
  add('themes', 'page', themesPage);
  add('secret', 'page', secretPage);
  add('help1', 'page', help1Page);
  add('help2', 'page', help2Page);
  add('help3', 'page', help3Page);
  add('help4', 'page', help4Page);
  groups.forEach((g, gi) => {
    for (const d of g) {
      add(`d${d.no}a`, 'page', (c) => dossierA(c, d));
      add(`d${d.no}b`, 'page', (c) => dossierB(c, d));
    }
    add(`rv${gi}a`, 'page', (c) => reviewA(c, g, gi));
    add(`rv${gi}b`, 'page', (c) => reviewB(c, g, gi));
  });
  add('final1', 'page', final1Page);
  add('final2', 'page', final2Page);
  for (let i = 0; i < n; i += 3) {
    const chunk = dossiers.slice(i, i + 3);
    add(`ans${i}`, 'page', (c) => answersPage(c, chunk));
  }
  add('ansrv', 'page', answersReviewPage);
  add('diploma', 'page', diplomaPage);
  add('notes', 'page', notesPage);
  add('notebook', 'page', notebookPage);
  while ((pages.length + 1) % 4) add(`notebook${pages.length}`, 'page', notebookPage);
  add('back', 'full', backPage);

  const num = new Map(pages.map((p, i) => [p.key, i - 1]));
  const ctx = {
    solved,
    pg: (key) => pad(num.get(key)),
    pgn: (key) => num.get(key),
    ansOf: (no) => pad(num.get(`ans${Math.floor((no - 1) / 3) * 3}`)),
  };
  return pages.map((p, i) => {
    const inner = p.render(ctx);
    if (p.kind === 'full') return `<section class="page full pg-${p.key}">${inner}</section>`;
    return `<section class="page pg-${p.key}"><div class="body">${inner}</div>${footer(i - 1)}</section>`;
  });

  function footer(numb) {
    return `<div class="footer"><span>Еду БЕЛ / Литературни досиета · Матура</span><span class="mid">${solved ? 'Копие с решения' : ''}</span><span class="num">${pad(numb)}</span></div>`;
  }

  function img(name, cls = 'icon') {
    return `<img class="${cls}" src="assets/${name}.png" alt="">`;
  }

  function coverPage() {
    return `<img class="bg" src="assets/cover.jpg" alt="">
      <div class="brand">ЕДУ БЕЛ</div>
      <div class="chip">${esc(book.badge || '11.–12. КЛАС · МАТУРА')}</div>
      <div class="kick">КНИГА-ИГРА ЗА ЛИТЕРАТУРНИ ДЕТЕКТИВИ</div>
      <div class="t1">ЛИТЕРАТУРНИ</div>
      <div class="t2">ДОСИЕТА</div>
      <div class="t3"><b>${n} досиета. Един таен код.</b><span>Разследването води до матурата.</span></div>
      ${solved ? '<div class="strip">Копие с решения · за преглед</div>' : ''}
      <div class="band"><hr><div class="a">Разкрий загадките. Разбери творбите.</div><div class="b">Подготви се за матурата.</div><div class="c">Ученето се превръща в игра.</div></div>`;
  }

  function missionPage() {
    const box = solved
      ? `<div class="box"><div class="kicker" style="font-size:8.6pt">Как е попълнено това копие</div><div class="gap2"></div><p class="ok small" style="font-size:9.6pt">Зеленото показва отговорите. В решетките думите със звездичка са оградени в зелено, а бонусните – в синьо. Златните клетки образуват скритата следа. Отговорите с „Пример“ са възможни решения; други формулировки със същия смисъл също са верни.</p></div>`
      : `<div class="box"><div class="kicker" style="font-size:8.6pt">Какво те чака</div><div class="gap2"></div><p style="font-size:9.8pt">${n} досиета · 9 теми · 2 преговора · 1 финал. Отговорите са в края на книгата – провери се след всяко досие.</p></div>`;
    return `<img class="hero" src="assets/hero.jpg" alt=""><div class="hero-chip">Достъп разрешен</div>
      <div class="band-title">Мисия: Матура</div>
      <div class="mission-body">
        <h2>Разследвай творбите. Открий смисъла.</h2>
        <div class="gap2"></div>
        <p class="lead">Пред теб са ${n} досиета за творбите от 11. и 12. клас, които влизат в матурата. Ти си детективът. Следвай уликите, разпитай героите и открий какво стои зад думите.</p>
        <div class="gap3"></div>
        <div class="three"><div><div class="k">Темите</div><div class="v">Какво свързва творбите?</div></div><div><div class="k">Следите</div><div class="v">Кои думи разкриват идеята?</div></div><div><div class="k">Тезата</div><div class="v">Какво ще защитиш на матурата?</div></div></div>
        <div class="push">${box}</div>
      </div>`;
  }

  function cardPage() {
    return `<div class="kicker">Карта на детектива</div>${img('znachka', 'icon big')}
      <h1>Добре дошли<br>в бюрото.</h1><div class="gap4"></div>
      <div class="idcard"><div class="photo">Нарисувай се или залепи своя снимка.</div><div><div class="field">Име или детективски прякор</div><div class="field">Клас и училище</div><div class="field" style="margin-bottom:0">Начало на разследването</div></div></div>
      <div class="gap4"></div><div><span class="pill">Обещание на детектива</span></div><div class="gap2"></div>
      <h2 style="font-size:13.5pt;line-height:1.3">Чета. Търся. Проверявам. Ако сгреша, поправям и продължавам. Мога да ползвам помощ.</h2>
      <div class="push ranks"><div class="rank"><b>Стажант</b><span>Започваш сега</span></div><div class="rank"><b>Детектив</b><span>${g11.length ? Math.min(5, n) : 5} разкрити досиета</span></div><div class="rank"><b>Инспектор</b><span>${g11.length || Math.ceil(n / 2)} разкрити досиета (целият 11. клас)</span></div><div class="rank"><b>Главен инспектор</b><span>${n} досиета + финала</span></div></div>
      <div class="gap3"></div>`;
  }

  function howtoPage(c) {
    const steps = [
      ['Избери творба.', `Списъкът е на стр. ${c.pg('map0')}${groups.length > 1 ? `–${c.pg('map1')}` : ''}. Прочети творбата или посочения откъс в учебника. Краткото представяне в досието ще ти помогне да си припомниш.`],
      ['Реши основната мисия: 1, 2 и 3.', 'В задача 1 търси трите думи със звездичка. В задача 2 ги използвай за отговори. В задача 3 избирай по един отговор.'],
      ['Получи буквата от своето решение.', `Под задача 3 попълни петте квадратчета „Кодът на досието“. Вземи само буквата от жълтото квадратче. До кода пише в кое поле на стр. ${c.pg('secret')} да я запишеш.`],
      ['Провери и отбележи досието.', `В края на всяко досие пише къде са отговорите. Ако поправиш кода, провери и буквата на стр. ${c.pg('secret')}. След проверката сложи отметка до творбата в картата на досиетата.`],
    ];
    return `<div class="kicker">Прочети тази страница и започни</div>${img('lupa')}<h1>Как се играе?</h1><div class="gap3"></div>
      <p class="lead">Всяко досие е за една творба от матурата. Приготви молив, гума и текста на творбата.</p><div class="gap3"></div>
      <div class="steps">${steps.map((s, i) => `<div class="step"><div class="n">${i + 1}</div><div><h3>${s[0]}</h3><p>${s[1]}</p></div></div>`).join('')}</div>
      <div class="push soft"><p>Помощта е разрешена. Можеш да гледаш в текста, да питаш и да поправяш. Няма таймер и няма наказания.</p></div>
      <div class="footnote">Задачи 4 и 5 са бонус. Избери ги, когато имаш желание. След ${n}-те досиета те чака финалът на стр. ${c.pg('final1')}.</div>`;
  }

  function tempoPage() {
    return `<div class="kicker">Три нива / ти избираш докъде</div>${img('papka')}<h1>Играй в своето темпо.</h1><div class="gap4"></div>
      <div class="level"><h3>1 · Основната мисия</h3><p>Реши задачи 1–3. Вземи буквата от жълтото квадратче в кода на задача 3. Запиши я в тайното послание. Провери и отбележи досието.</p></div>
      <div class="level"><h3>2 · Още следи</h3><p>Задача 4 е по желание. Подреди случките, раздели думите, допълни цитата или свържи репликата с героя. Условието е до самата задача.</p></div>
      <div class="level"><h3>3 · Една теза</h3><p>Задача 5 е по желание. Формулирай в едно изречение своята теза за творбата – така започва всяко литературно-интерпретативно съчинение. Има готово начало.</p></div>
      <div class="push soft"><p>Досиетата следват деветте теми на матурата: пет от 11. клас и четири от 12. клас. Можеш да ги решаваш в реда на учебната година или да започнеш от темата, която ти е най-трудна.</p></div><div class="gap2"></div>`;
  }

  function mapPage(c, g, i) {
    const grade = g[0].grade;
    let rows = '';
    let theme = '';
    for (const d of g) {
      if (d.theme !== theme) {
        theme = d.theme;
        rows += `<div class="map-theme">Тема „${esc(theme)}“</div>`;
      }
      rows += `<div class="map-row"><span class="check">${solved ? '✓' : ''}</span><span class="no">${pad(d.no)}</span><span class="w">${q(d.title)} <small>· ${esc(d.author)}</small></span><span class="pg">${c.pg(`d${d.no}a`)}</span></div>`;
    }
    return `<div class="kicker">Избери творба / отбелязвай напредъка</div>${img(i ? 'tetradka' : 'papka')}<h1>Картата на досиетата</h1><div class="tagline">${esc(grade)}. клас · ${new Set(g.map((d) => d.theme)).size} теми · ${g.length} творби</div><div class="gap2"></div>
      <p>След задачи 1–3 и проверката сложи отметка. Можеш да решаваш досиетата в избран от теб ред.</p>${rows}
      <div class="footnote push" style="font-weight:600;color:#5b6468;font-size:8.4pt">Числото вдясно е страницата, на която започва досието.</div>`;
  }

  function themesPage() {
    const QS = book.themeQuestions || {};
    const themes = [...new Set(dossiers.map((d) => d.theme))];
    return `<div class="kicker">Деветте теми на матурата</div>${img('znachka')}<h1>Една тема – три творби.</h1><div class="gap2"></div>
      <p>На матурата темите свързват творбите. Задай си въпроса на темата, когато решаваш всяко досие.</p><div class="gap1"></div>
      ${themes
        .map((t) => {
          const ds = dossiers.filter((d) => d.theme === t);
          return `<div class="map-theme" style="margin-top:2.6mm">${esc(t)} · ${esc(ds[0].grade)}. клас</div><div style="font-weight:800;font-size:9.6pt">${esc(QS[t] || '')}</div><div class="small muted">${ds.map((d) => q(d.title)).join(' · ')}</div>`;
        })
        .join('')}`;
  }

  function secretPage(c) {
    const words = String(book.message)
      .toUpperCase()
      .split(/[^А-ЯЁЍ]+/)
      .filter(Boolean)
      .map(letters);
    let k = 0;
    const rows = words
      .map((w) => `<div class="row">${[...w].map((ch) => `<div class="slot${solved ? ' ans' : ''}"><i>${++k}</i>${solved ? ch : ''}</div>`).join('')}</div>`)
      .join('');
    return `<div class="kicker">${n} досиета + 1 финална буква</div>${img('kod')}<h1>Събери тайното послание.</h1><div class="gap3"></div>
      <p class="lead">Във всяко досие реши задача 3 и попълни „Кодът на досието“. Вземи буквата от жълтото квадратче. Запиши я в полето, посочено до кода.</p><div class="gap3"></div>
      <div><span class="pill">Показан пример: досие ${ex.no}</span></div><div class="gap2"></div>
      <div style="display:flex;gap:6mm;align-items:center">${codeSlots(ex.code, ex.key, true)}<div class="bold" style="font-size:9.6pt">Жълто е квадратче № ${ex.key}.<br>В него е ${ex.code[ex.key - 1]}. Записваш ${ex.code[ex.key - 1]} в поле ${ex.no}.</div></div>
      <div class="gap2"></div><p class="teal bold small">По-долу пренасяш само по една буква от всяко досие.</p><div class="gap2"></div>
      <div class="msg">${rows}</div><div class="gap2"></div>
      <p class="small">Полетата са групирани по думи. Прочети редовете отгоре надолу. Последната буква ще получиш от финала на стр. ${c.pg('final1')}.</p>
      <div class="footnote push">Можеш да оставиш празно поле и да се върнеш към него.</div>`;
  }

  function help1Page() {
    const mini = ['КНИГА', 'МОРЕТ', 'ЛИСТА'];
    let svg = `<svg width="62mm" height="37mm" viewBox="0 0 62 37">`;
    mini.forEach((row, r) =>
      [...row].forEach((ch, cI) => {
        svg += `<rect x="${cI * 12 + 1}" y="${r * 12 + 0.5}" width="12" height="12" fill="${r === 0 && cI === 0 ? '#f2d58a' : '#fffdf8'}" stroke="#dccfb2" stroke-width="0.3"/><text x="${cI * 12 + 7}" y="${r * 12 + 9}" font-size="6" text-anchor="middle" font-weight="800" fill="#1d3a44">${ch}</text>`;
      }),
    );
    svg += `<rect x="1.8" y="1.3" width="58.4" height="10.4" rx="5.2" fill="none" stroke="#1f6f6b" stroke-width="0.7"/></svg>`;
    return `<div class="kicker">Помощ при нужда / задача 1</div>${img('lupa')}<h1>Как да откриеш дума?</h1><div class="gap4"></div>
      <p class="lead">За основната мисия търсиш само трите думи със звездичка в списъка. Началните им букви в решетката са оцветени в жълто.</p><div class="gap4"></div>
      <div><span class="pill">Малък пример</span></div><div class="gap3"></div>
      <div style="display:flex;gap:9mm;align-items:center;padding-left:9mm">${svg}<p>Търсим КНИГА.<br>Започваме от жълтото К.<br>Продължаваме надясно.<br>Ограждаме цялата дума.</p></div><div class="gap4"></div>
      <p>В големите решетки думите вървят по права линия:</p><div class="gap2"></div><p class="lead">→ &nbsp;надясно &nbsp;&nbsp; ↓ &nbsp;надолу &nbsp;&nbsp; ↘ &nbsp;или ↗ по диагонал</p><div class="gap3"></div>
      <p>Две думи може да имат обща буква. Не трий буквите: ограждай думите с молив.</p>
      <div class="push soft"><p>Още игра, ако искаш: намери и останалите думи. Прочети неоградените букви отляво надясно, ред по ред. Получава се скрита следа. Тя е бонус и не е нужна за тайното послание.</p></div><div class="gap3"></div>`;
  }

  function help2Page() {
    return `<div class="kicker">Помощ при нужда / задачи 2 и 3</div>${img('kod')}<h1>От уликата до кода</h1><div class="gap4"></div>
      <div><span class="pill">2 · Избери дума</span></div><div class="gap2"></div>
      <p class="lead">До решетката има три думи със звездичка. Прочети въпроса и запиши подходящата дума на линията. Всяка от трите думи се използва веднъж.</p><div class="gap3"></div>
      <div class="box"><p>Пример: КНИГА · МОЛИВ · ГУМА<br>Въпрос: С какво триеш?<br>Отговор: ГУМА</p></div><div class="gap4"></div>
      <div><span class="pill">3 · Избери отговор</span></div><div class="gap2"></div>
      <p class="lead">На всеки въпрос има три отговора. Огради буквата пред верния. Препиши буквите по ред: от въпрос 1 до въпрос 5.</p><div class="gap4"></div>
      <div style="display:flex;justify-content:center">${codeSlots(ex.code, ex.key, true)}</div><div class="gap3"></div>
      <p>Пример с досие ${ex.no}: получаваш ${ex.code}. Жълтото квадратче е № ${ex.key} и в него пише ${ex.code[ex.key - 1]}. Вземаш тази буква и я записваш в поле ${ex.no} на стр. ${ctxPg('secret')}. В другите досиета гледай кое квадратче в кода е жълто.</p>
      <div class="footnote push">Не се получава дума? Провери отговорите и реда им.</div>`;
  }

  function help3Page() {
    const items = [
      ['Подреди случките', 'Напиши 1 пред най-ранната случка, 2 пред следващата и така нататък. Всяко число се използва веднъж.'],
      ['Раздели в две групи', 'Запиши всяка дума под подходящото заглавие. Думите в списъка се използват по веднъж.'],
      ['Допълни цитата', 'Избери дума от дадения списък и я запиши на празното място. Ако се колебаеш, намери реда в творбата.'],
      ['Свържи', 'Кой го казва? Кое е художественото средство? Избери отговор от списъка и го запиши след реда. Един отговор може да се повтори.'],
    ];
    return `<div class="kicker">Помощ при нужда / задача 4</div>${img('papka')}<h1>Бонусите са по желание.</h1><div class="gap4"></div>
      ${items.map((x) => `<div class="level"><h3 style="text-transform:none;font-size:11.6pt">${x[0]}</h3><p>${x[1]}</p></div>`).join('')}
      <div class="footnote push">Можеш да пропуснеш бонуса и пак да получиш буквата.</div>`;
  }

  function help4Page() {
    return `<div class="kicker">Помощ при нужда / задача 5</div>${img('tetradka')}<h1>Една теза е начало.</h1><div class="gap4"></div>
      <p class="lead">На матурата съчинението започва с теза – твоята основна мисъл за творбата. Тук тренираш само нея: едно ясно изречение, което може да се докаже с текста.</p><div class="gap4"></div>
      <div><span class="pill">Пример с измислена история</span></div><div class="gap2"></div>
      <div class="box"><p>„Мила се страхуваше, но влезе, за да помогне.“<br>Въпрос: Какво разкрива постъпката на Мила?<br>Начало: Постъпката на Мила разкрива, че…</p></div><div class="gap4"></div>
      <p class="teal bold">Една достатъчна теза:</p><div class="gap2"></div>
      <h2 style="font-size:13pt;line-height:1.3">Постъпката на Мила разкрива, че смелостта не е липса на страх, а избор да помогнеш въпреки него.</h2><div class="gap4"></div>
      <div><span class="pill">Искаш ли да отидеш по-дълбоко?</span></div><div class="gap2"></div>
      <p>Добави аргумент с точни думи от текста в кавички. Например: Думите „се страхуваше, но влезе“ показват, че Мила преодолява страха си.</p>
      <div class="footnote push">При проверката сравнявай смисъла, не точните думи.</div>`;
  }

  function ctxPg(key) {
    return pad(pages.findIndex((p) => p.key === key) - 1);
  }

  function dossierA(c, d) {
    const ws = d.ws;
    const placedBonus = ws.placed.filter((p) => !p.star).map((p) => p.word).sort((a, b) => a.localeCompare(b, 'bg'));
    const longTitle = d.title.length > 26;
    return `<div class="kicker">Досие ${pad(d.no)} / ${esc(d.author)}</div>${img(ICONS[(d.no - 1) % ICONS.length])}
      <h1 class="${longTitle ? 'long' : ''}">${q(d.title)}</h1>
      <div class="dossier-meta">Тема „${esc(d.theme)}“ <span>· ${esc(d.grade)}. клас · ${esc(d.genre)}${d.part ? ` · ${esc(d.part)}` : ''}</span></div>
      <div class="gap2"></div><div><span class="pill">Накратко за творбата</span></div>
      <p class="summary">${esc(d.summary)}</p>${d.gloss ? `<p class="gloss">${esc(d.gloss)}</p>` : ''}
      <div class="gap2"></div><div><span class="pill">1 · Огради трите думи със звездичка</span></div>
      <p class="task-note">Търси &nbsp;→ ↓ ↘ ↗ &nbsp;&nbsp;по права линия. Началото е в жълто.</p>
      <div class="ws">${gridSvg(ws, solved)}<div class="wordlist">${d.star.map((w) => `<div class="st">${w}</div>`).join('')}${placedBonus.map((w) => `<div>${w}</div>`).join('')}<div class="bonusnote">Другите думи са бонус.</div></div></div>
      <p class="trace-line">Бонус: намери всички думи. Препиши неоградените букви ред по ред.</p>
      <div class="trace-ans">${solved ? `Скрита следа: ${esc(d.trace)}` : '<span style="color:#4f5a5e;font-weight:700">Скрита следа:</span>'}</div>
      <div class="gap1"></div>
      <div class="pill-row"><span class="pill">2 · Събери уликите</span><span class="small">Отговори с трите думи със звездичка.</span></div>
      ${d.clues.map((x, i) => `<div class="qa"><div>${i + 1}. ${esc(x.q)}</div><div class="a">${solved ? letters(x.a) : ''}</div></div>`).join('')}`;
  }

  function dossierB(c, d) {
    const th = d.thesis;
    return `<div class="kicker">Досие ${pad(d.no)} / ${q(upper(d.title))}</div>
      <div class="gap2"></div><div><span class="pill red">3 · Избери верния отговор</span></div>
      <p class="task-note">Огради по една буква. Препиши ги долу по ред 1–5.</p>
      <div class="mcq">${mcqHtml(d.mcqL, solved)}</div>
      <div class="coderow"><span class="lbl">Кодът на досието:</span>${codeSlots(d.code, d.key, solved)}<span class="hint">Вземи буква № ${d.key} (жълтата).<br>Запиши я в поле ${d.no} на стр. ${c.pg('secret')}.</span></div>
      <div class="gap2"></div><div><span class="pill">4 · Бонус: още следи</span></div>
      <div class="b4">${bonus4Html(d, solved)}</div>
      <div class="gap2"></div><div><span class="pill gold">5 · Бонус: една теза</span></div>
      <div class="thesis-q">${esc(th.q)}</div>
      ${solved ? `<div class="thesis-a">Пример: ${esc(th.example)}</div>` : `<div class="thesis-s">Начало: ${esc(th.start)}…</div><div class="wline thin"></div><div class="wline thin"></div>`}
      <div class="endnote push">Буквата е от жълтото квадратче в кода на задача 3. Проверка: стр. ${c.ansOf(d.no)}.</div>`;
  }

  function reviewMap(g, gi) {
    const rand = rng(1234 + gi);
    const order = shuffle(g, rand);
    const L = new Map(order.map((d, i) => [d.no, REVIEW_LETTERS[i]]));
    const traces = shuffle(g, rand);
    const words = shuffle(g, rand);
    return { order, L, traces, words };
  }

  function reviewA(c, g, gi) {
    const { order, L, traces } = reviewMap(g, gi);
    return `<div class="kicker">Преговор ${gi + 1} / ${esc(g[0].grade)}. клас / по желание</div>${img('papka')}<h1>Върни се по следите.</h1><div class="gap2"></div>
      <p class="teal bold">Използвай решените досиета. Този преговор не носи буква.</p><div class="gap2"></div>
      <div class="rv-list">${order.map((d) => `<b>${L.get(d.no)}</b><span>${q(d.title)} <span class="muted small">· ${esc(d.author)}</span></span>`).join('')}</div>
      <div class="gap3"></div><div><span class="pill">1 · От кое досие е следата?</span></div><div class="gap1"></div>
      <p class="small">Запиши буквата пред заглавието от списъка по-горе.</p><div class="gap1"></div>
      <div class="rv-items">${traces.map((d, i) => `<div class="rv-item"><span class="n">${i + 1}.</span><span class="lbox">${solved ? L.get(d.no) : ''}</span><span>${d.traceIsQuote ? q(d.trace) : esc(d.trace)}</span></div>`).join('')}</div>
      <div class="footnote push">Проверка: стр. ${c.pg('ansrv')}. Можеш да решиш само няколко реда.</div>`;
  }

  function reviewB(c, g, gi) {
    const { L, words } = reviewMap(g, gi);
    const themes = [...new Set(g.map((d) => d.theme))];
    const half = Math.ceil(words.length / 2);
    const col = (arr, off) =>
      arr.map((d, i) => `<div class="rv-item"><span class="n">${i + 1 + off}.</span><span class="lbox">${solved ? L.get(d.no) : ''}</span><span class="rv-word">${d.star[0]}</span></div>`).join('');
    return `<div class="kicker">Преговор ${gi + 1} / по желание</div>${img('lupa')}<h1>Кой стои зад уликата?</h1><div class="gap3"></div>
      <div><span class="pill">2 · Свържи думата и досието</span></div><div class="gap1"></div>
      <p class="small">Използвай буквите пред заглавията на стр. ${c.pg(`rv${gi}a`)}.</p><div class="gap2"></div>
      <div class="rv-cols"><div class="rv-items">${col(words.slice(0, half), 0)}</div><div class="rv-items">${col(words.slice(half), half)}</div></div>
      <div class="gap3"></div><div><span class="pill">3 · Към коя тема?</span></div><div class="gap1"></div>
      <p class="small">Запиши буквите на трите досиета до темата.</p>
      ${themes.map((t) => `<div class="rv-theme"><span>${esc(t)}</span><span class="a">${solved ? g.filter((d) => d.theme === t).map((d) => L.get(d.no)).sort((a, b) => a.localeCompare(b, 'bg')).join(', ') : ''}</span></div>`).join('')}
      <div class="push"><p class="teal bold">Искаш още? Избери две творби от една тема и кажи с едно изречение какво ги свързва.</p>${solved && book.reviewExamples?.[gi] ? `<p class="ok small" style="margin-top:1.4mm">Пример: ${esc(book.reviewExamples[gi])}</p>` : '<div class="wline"></div>'}</div>`;
  }

  function final1Page() {
    return `<div class="kicker">Финал / ${esc(final.kicker || 'Пет въпроса за всичко')}</div>${img('kod')}<h1>Последният ключ</h1><div class="gap3"></div>
      <p class="lead">Огради буквата пред верния отговор на всеки въпрос. Препиши буквите по ред в квадратчетата. Можеш да проверяваш в досиетата.</p>
      ${final.mcqL
        .map(
          (m, i) =>
            `<div class="final-q"><div class="q">${i + 1}. ${esc(m.q)}</div>${m.opts.map((o) => `<div class="o"><b class="${solved && o.ok ? 'circ' : ''}">${o.l}</b><span>${esc(o.t)}</span></div>`).join('')}</div>`,
        )
        .join('')}
      <div class="gap3"></div><div style="display:flex;justify-content:center">${codeSlots(final.code, final.key, solved)}</div>
      <div class="footnote push">Вземи буква № ${final.key} (жълтата) от кода. Запиши я в поле ${n + 1} на стр. ${ctxPg('secret')}.</div>`;
  }

  function final2Page(c) {
    const ex2 = book.finalExamples || {};
    return `<div class="kicker">Финал / кажи какво откри</div>${img('sandak')}<h1>Ти разкри посланието.</h1><div class="gap3"></div>
      <p>Препиши думите от стр. ${c.pg('secret')}. Ако някое поле е празно, върни се към задача 3 на досието със същия номер. За поле ${n + 1} виж финала на стр. ${c.pg('final1')}.</p>
      <div class="gap2"></div><div class="answer-line" style="font-size:12pt">${solved ? esc(book.message) + '.' : ''}</div><div class="answer-line"></div>
      <div class="gap4"></div><h3>Как ще приложиш това послание на матурата?</h3>
      <div class="answer-line">${solved && ex2.apply1 ? `Пример: ${esc(ex2.apply1)}` : ''}</div><div class="answer-line">${solved && ex2.apply2 ? esc(ex2.apply2) : ''}</div>
      <div class="gap4"></div><div><span class="pill">Една последна мисъл · по желание</span></div><div class="gap2"></div>
      <h3>Коя творба ти беше най-интересна и защо?</h3><div class="gap1"></div>
      ${solved && ex2.favourite ? `<p class="ok">Пример: ${esc(ex2.favourite)}</p>` : '<div class="wline"></div><div class="wline"></div>'}
      <div class="push soft"><p>Провери финала на стр. ${c.pg('ansrv')}. След ${n}-те основни мисии и финала можеш да попълниш дипломата на стр. ${c.pg('diploma')}. Бонусите не са задължителни.</p></div><div class="gap2"></div>`;
  }

  function answersPage(c, chunk) {
    return `<div class="kicker">Отговори / поправките също са учене</div><h1 style="margin-top:4mm">Провери и продължи.</h1>
      <p class="small muted" style="margin-top:2mm">В задача 1 (1,2) означава ред 1, колона 2. Показани са началната и крайната клетка на всяка дума.</p>
      ${chunk
        .map((d) => {
          const pos = d.star
            .map((w) => {
              const p = d.ws.placed.find((x) => x.word === w);
              const L = w.length - 1;
              return `${w}: (${p.r + 1},${p.c + 1})—(${p.r + p.dr * L + 1},${p.c + p.dc * L + 1})`;
            })
            .join('; ');
          return `<div class="ans"><div class="ans-h">${pad(d.no)} · ${q(d.title)}</div>
            <p class="pos">1. ${pos}</p>
            <p class="l2">2. ${d.clues.map((x) => letters(x.a)).join(' / ')}</p>
            <p class="l3"><span class="c">3. Код: ${d.code}</span><span class="k">Буква № ${d.key}: ${d.code[d.key - 1]} → поле ${d.no}</span></p>
            <p>Бонус 4. ${esc(bonus4Answer(d))}</p>
            <p>Бонус 5. Пример: ${esc(d.thesis.example)}</p>
            <p class="tr">Скрита следа (бонус): ${esc(d.trace)}</p></div>`;
        })
        .join('')}`;
  }

  function answersReviewPage() {
    const parts = groups.map((g, gi) => {
      const { L, traces, words } = reviewMap(g, gi);
      const themes = [...new Set(g.map((d) => d.theme))];
      return `<div class="gap3"></div><div><span class="pill">Преговор ${gi + 1}</span></div>
        <p class="bold small" style="margin-top:2mm">Задача 1: ${traces.map((d, i) => `${i + 1}=${L.get(d.no)}`).join(', ')}.</p>
        <p class="bold small" style="margin-top:1.4mm">Задача 2: ${words.map((d, i) => `${i + 1}=${L.get(d.no)}`).join(', ')}.</p>
        <p class="small" style="margin-top:1.4mm">Задача 3. ${themes
          .map((t) => `${esc(t)}: ${g.filter((d) => d.theme === t).map((d) => L.get(d.no)).sort((a, b) => a.localeCompare(b, 'bg')).join(', ')}`)
          .join('; ')}.</p>`;
    });
    return `<div class="kicker">Отговори / преговори и финал</div><h1 style="margin-top:4mm">Провери преговорите.</h1>${parts.join('')}
      <div class="gap3"></div><div><span class="pill">Финалът</span></div>
      <p class="bold" style="margin-top:2mm">Код: ${final.code}. Буква № ${final.key} (жълтата) е ${final.code[final.key - 1]} → поле ${n + 1}.<br>Послание: ${esc(book.message)}.</p>
      ${book.finalExamples?.apply1 ? `<p class="small" style="margin-top:2mm">Пример: ${esc(book.finalExamples.apply1)}</p>` : ''}`;
  }

  function diplomaPage() {
    return `<div class="kicker">Бюро за литературни разследвания</div>${img('znachka')}<h1>Диплома</h1>
      <div class="diploma" style="display:flex;flex-direction:column;flex:1">
        <img class="badge" src="assets/znachka.png" alt="">
        <div class="gap3"></div><div class="center kicker" style="font-size:8.6pt">Присъжда се на</div>
        <div style="border-bottom:.3mm solid #cdbf9d;margin:12mm 8mm 0"></div>
        <div class="gap4"></div><p class="lead" style="padding:0 8mm">за разкриването на ${n}-те основни мисии и тайното послание.</p>
        <div class="gap4"></div><div class="rankname" style="padding:0 8mm">Главен инспектор<br>по литература</div>
        <div class="push sig" style="padding:0 2mm"><div>Дата</div><div>Подпис на учител или родител</div></div>
        <div class="gap3"></div><p class="teal bold center">Разследването продължава с всяка нова книга.</p>
      </div>`;
  }

  function notesPage() {
    const themes = [...new Set(dossiers.map((d) => d.theme))];
    return `<div class="kicker">Бележки за учителя и ученика</div><h1>За съвместния преглед</h1><div class="gap3"></div>
      <p class="lead">Проверявайте кратките отговори и тезите по смисъл. Посочените примери не са единствените правилни формулировки.</p>
      <div class="gap3"></div><div><span class="pill">Деветте теми</span></div><div class="gap1"></div>
      ${themes.map((t) => `<p class="small" style="margin-top:1.2mm"><b>${esc(t)}</b> – ${dossiers.filter((d) => d.theme === t).map((d) => `${pad(d.no)} ${q(d.title)}`).join(', ')}</p>`).join('')}
      <div class="gap3"></div><div><span class="pill">Текстовете</span></div><div class="gap1"></div>
      <p class="small">${esc(book.textsNote || 'Досиетата не съдържат пълните текстове на творбите. Работете с учебника или с изданието, което ползвате в час. За творбите на съвременни автори в досиетата има само кратко представяне и собствени формулировки, без цитати.')}</p>
      <div class="gap3"></div><div><span class="pill">Нашите бележки</span></div>
      <div class="lines">${'<div class="wline"></div>'.repeat(5)}</div>`;
  }

  function notebookPage() {
    return `<div class="kicker">Личен архив / бележник на детектива</div>${img('tetradka')}<h1>Следите, които открих</h1><div class="gap2"></div>
      <p style="margin-right:32mm">Запиши връзки между творбите, важни цитати и тези, които искаш да защитиш на матурата.</p><div class="gap3"></div>
      <div class="lines">${'<div class="wline"></div>'.repeat(19)}</div>
      <div class="footnote push">Добрият детектив вижда връзки там, където другите виждат само думи.</div>`;
  }

  function backPage() {
    return `<div class="back" style="position:absolute;inset:0"><img class="hero" src="assets/hero.jpg" alt=""><div class="hero-chip" style="padding-right:22mm">Мисия: подготовка за матурата</div>
      <div class="inner"><h2>Ученето влиза в играта.</h2><p style="margin-top:4mm;font-size:10.6pt;opacity:.9">Тук всяка творба е досие. Героите оставят следи, думите крият улики, а верните отговори отключват тайни кодове.</p>
      <div class="item"><span class="n">01</span><div><b>Разкрий загадките</b><span>Открий скритите думи, събери уликите и възстанови случая.</span></div></div>
      <div class="item"><span class="n">02</span><div><b>Разбери смисъла</b><span>Свържи творбите с деветте теми на матурата.</span></div></div>
      <div class="item"><span class="n">03</span><div><b>Защити тезата си</b><span>Формулирай теза като в литературно-интерпретативното съчинение.</span></div></div>
      <div class="bottom"><div class="a">${n} творби · 9 теми · 1 тайно послание</div><div class="b">Разкрий тайния код. Влез по-подготвен на матурата.</div><div class="c">ЕДУ БЕЛ</div></div></div></div>`;
  }
}

function html(P, solved, assetsRel) {
  const css = fs.readFileSync(path.join(HERE, 'book.css'), 'utf8');
  const fonts = fs.readFileSync(path.join(assetsRel.abs, 'fonts-local.css'), 'utf8').replace(/url\((?!https?:|data:)/g, 'url(assets/');
  const pages = buildPages(P, solved);
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><title>Литературни досиета – ${solved ? 'с решения' : 'ученик'}</title><style>${fonts}\n${css}</style></head><body>${pages.join('\n')}</body></html>`;
}

// ---------------------------------------------------------------- PDF

async function toPdf(htmlFile, pdfFile) {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(htmlFile), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('.page')]
      .map((p, i) => {
        const b = p.querySelector('.body');
        if (!b) return null;
        const over = b.scrollHeight - b.clientHeight;
        return over > 1 ? { page: i + 1, key: p.className, over: Math.round(over) } : null;
      })
      .filter(Boolean),
  );
  await page.pdf({ path: pdfFile, width: '176mm', height: '250mm', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  return overflow;
}

// ---------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const [src, assets, out] = argv.filter((a) => !a.startsWith('--'));
  if (!src) {
    console.log('node scripts/dosieta/build.mjs <content.json|dir> <assets-dir> <out-dir> [--check] [--html] [--only=student|solutions]');
    process.exit(1);
  }
  const P = prepare(loadContent(src), { partial: flags.has('--check') });
  for (const w of P.warns) console.log('⚠ ' + w);
  for (const e of P.errors) console.log('✗ ' + e);
  if (P.errors.length) {
    console.log(`\n${P.errors.length} грешки.`);
    process.exit(2);
  }
  console.log(`✓ ${P.dossiers.length} досиета без грешки, посланието е ${P.message.length} букви.`);
  for (const d of P.dossiers) console.log(`  ${pad(d.no)} ${d.code} [${d.key}] ${d.ws.placed.length - 3} бонус думи, опит ${d.ws.attempt}`);
  if (flags.has('--check')) return;

  fs.mkdirSync(out, { recursive: true });
  const assetsAbs = path.resolve(assets);
  const link = path.join(out, 'assets');
  if (!fs.existsSync(link)) fs.symlinkSync(assetsAbs, link, 'dir');
  const only = [...flags].find((f) => f.startsWith('--only='))?.split('=')[1];
  const name = P.book.fileName || 'Literaturni_dosieta';
  for (const [solved, suffix] of [
    [true, 'Reshenia'],
    [false, 'Uchenik'],
  ]) {
    if (only && only !== (solved ? 'solutions' : 'student')) continue;
    const hf = path.join(out, `${name}_${suffix}.html`);
    fs.writeFileSync(hf, html(P, solved, { abs: assetsAbs }));
    console.log('HTML: ' + hf);
    if (flags.has('--html')) continue;
    const pf = path.join(out, `${name}_${suffix}.pdf`);
    const over = await toPdf(hf, pf);
    console.log('PDF:  ' + pf);
    for (const o of over) console.log(`⚠ страница ${o.page} (${o.key}) прелива с ${o.over}px`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
