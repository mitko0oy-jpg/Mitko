// The short lesson and the reading page of a unit: their sections, and how they look
// both empty (the template) and filled. Shared by the child's pages and the teacher review.
import { esc } from "./app.js";

// Every lesson has the same sections, in this order. "hint" says what goes in an empty section.
export const LESSON_TEMPLATES = {
  literature: [
    { key: "short", title: "Накратко", type: "text", hint: "3–4 изречения: за какво е творбата и защо е важна." },
    { key: "author", title: "Авторът", type: "text", hint: "2–3 факта за автора, които помагат да разбереш творбата." },
    { key: "plot", title: "Какво се случва", type: "steps", hint: "Сюжетът в 5–7 кратки стъпки. При стихотворение – какво казва всяка част." },
    { key: "characters", title: "Героите", type: "people", hint: "Кой какъв е – с една черта и пример от текста." },
    { key: "ideas", title: "Идеите", type: "list", hint: "Темите и посланията, за които питат в час и на изпита." },
    { key: "craft", title: "Как е написано", type: "list", hint: "Жанр, композиция и художествени средства – с примери." },
    { key: "quotes", title: "Цитати за запомняне", type: "quotes", hint: "3–5 кратки цитата и какво показва всеки." },
    { key: "traps", title: "Внимавай", type: "list", hint: "Честите грешки и капани в контролните и на изпита." },
    { key: "check", title: "Провери се", type: "qa", hint: "3 бързи въпроса. Отговорът се показва след натискане." },
  ],
  language: [
    { key: "short", title: "Правилото накратко", type: "text", hint: "Правилото с 2–3 изречения, без сложни термини." },
    { key: "steps", title: "Как да го приложиш", type: "steps", hint: "Стъпки, по които детето проверява само." },
    { key: "examples", title: "Примери", type: "pairs", hint: "Вярно и грешно едно до друго, с кратко обяснение." },
    { key: "traps", title: "Внимавай", type: "list", hint: "Изключенията и честите грешки." },
    { key: "check", title: "Провери се", type: "qa", hint: "3 бързи въпроса. Отговорът се показва след натискане." },
  ],
};

export const READING_PARTS = [
  { key: "audio", title: "Чуй творбата", hint: "Прочит на глас – детето може да слуша и да следи текста." },
  { key: "glossary", title: "Думи за обяснение", hint: "Остарели и непознати думи с обяснение на днешен език." },
  { key: "text", title: "Текстът", hint: "Пълният текст на творбата (само за автори, починали преди повече от 70 години)." },
];

const paras = (s) =>
  String(s || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

// Grey lines that show where text will be.
const ghost = (n = 3) => `<div class="ghost" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="width:${[92, 78, 85, 60, 70][i % 5]}%"></i>`).join("")}</div>`;

function sectionBody(s, v) {
  if (s.type === "text") return paras(v);
  if (s.type === "steps") return `<ol class="lsteps">${v.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
  if (s.type === "list") return `<ul class="llist">${v.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  if (s.type === "people") return `<div class="lpeople">${v.map((x) => `<div><b>${esc(x.name)}</b><span>${esc(x.text)}</span></div>`).join("")}</div>`;
  if (s.type === "quotes") return v.map((x) => `<blockquote class="lquote">${esc(x.q)}${x.why ? `<span>${esc(x.why)}</span>` : ""}</blockquote>`).join("");
  if (s.type === "pairs") {
    return `<div class="lpairs">${v.map((x) => `<div><p class="ok">✓ ${esc(x.ok)}</p><p class="bad">✗ ${esc(x.bad)}</p>${x.why ? `<p class="why">${esc(x.why)}</p>` : ""}</div>`).join("")}</div>`;
  }
  if (s.type === "qa") return v.map((x) => `<details class="lqa"><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("");
  return "";
}

const filled = (v) => (Array.isArray(v) ? v.length > 0 : !!String(v ?? "").trim());

// The lesson as the child sees it. Sections without content show the template hint.
export function lessonHtml(section, data) {
  const tpl = LESSON_TEMPLATES[section] || LESSON_TEMPLATES.literature;
  const sec = data?.sections || {};
  const toc = `<nav class="ltoc" aria-label="Раздели">${tpl.map((s, i) => `<a href="#l-${s.key}">${i + 1}. ${esc(s.title)}</a>`).join("")}</nav>`;
  const body = tpl
    .map((s, i) => {
      const v = sec[s.key];
      const has = filled(v);
      return `<section class="lsec ${has ? "" : "empty"}" id="l-${s.key}"><h2><span class="n">${i + 1}</span>${esc(s.title)}</h2>${has ? sectionBody(s, v) : `<p class="hint">${esc(s.hint)}</p>${ghost(s.type === "text" ? 3 : 4)}`}</section>`;
    })
    .join("");
  return toc + body;
}

// Text, audio and glossary of a work.
export function readingHtml(data) {
  const d = data || {};
  const part = (p, inner) => `<section class="lsec ${inner ? "" : "empty"}" id="r-${p.key}"><h2>${esc(p.title)}</h2>${inner || `<p class="hint">${esc(p.hint)}</p>${p.key === "audio" ? `<div class="aplayer" aria-hidden="true"><span>▶</span><i></i><small>0:00</small></div>` : ghost(p.key === "text" ? 5 : 3)}`}</section>`;
  const audio = d.audio ? `<audio controls preload="none" src="${esc(d.audio)}"></audio>${d.audioBy ? `<p class="small muted">Чете: ${esc(d.audioBy)}</p>` : ""}` : "";
  const glossary = d.glossary?.length ? `<dl class="gloss">${d.glossary.map((g) => `<div><dt>${esc(g.w)}</dt><dd>${esc(g.m)}</dd></div>`).join("")}</dl>` : "";
  const text = d.text ? `<div class="ltext">${paras(d.text)}</div>${d.source ? `<p class="small muted">Източник: ${esc(d.source)}</p>` : ""}` : "";
  return part(READING_PARTS[0], audio) + part(READING_PARTS[1], glossary) + part(READING_PARTS[2], text);
}
