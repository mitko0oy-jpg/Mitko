// One work or language topic: its steps in order – what is ready and what is still coming.
// A child opens the materials; anyone else sees the structure of the unit.
import { $, api, esc, me, params, publicUnit, renderUnlock, resourceHref, SECTION_LABEL, stepLabel, topbar, unitSteps } from "./app.js";

const DESC = {
  reading: "Текстът на творбата, прочит на глас и думи за обяснение.",
  lesson: "Най-важното за творбата на един екран.",
  cards: "Въпроси с обяснение защо отговорът е верен.",
  t25: "Пишеш 3–4 изречения, коучът задава насочващи въпроси.",
  chars: "Разпитай героя и изпълни мисията.",
  pesho: "Обясни на Пешо къде греши.",
};
const DESC_LANG = { lesson: "Правилото с примери и честите грешки.", cards: "Задачи с обяснение защо отговорът е верен." };
const PAGE = { lesson: "/urok/", reading: "/chetene/" };

const head = (kind, u, meta, lockIcon) =>
  `<p class="t">${esc(stepLabel(kind, u.section))}</p><p class="d">${esc((u.section === "language" && DESC_LANG[kind]) || DESC[kind] || "")}</p>${meta ? `<div class="meta"><span>${esc(meta)}</span>${lockIcon ? "<span>🔒</span>" : ""}</div>` : ""}`;

// A step that exists, for a child.
function readyTile(r, u) {
  const locked = r.open === 0;
  if (PAGE[r.kind]) {
    const meta = locked ? "в пълния достъп" : r.done ? "прочетено ✓" : "готово";
    return locked ? `<button class="res locked" data-locked="${esc(r.module)}">${head(r.kind, u, meta, true)}</button>` : `<a class="res" href="${PAGE[r.kind]}?u=${encodeURIComponent(u.slug)}">${head(r.kind, u, meta)}</a>`;
  }
  let links = "";
  let href = resourceHref(r, u.slug);
  if (r.kind === "cards" || r.kind === "pesho") href = resourceHref(r, u.slug, `&w=${encodeURIComponent(u.title)}`);
  if (r.kind === "chars") {
    links = r.items.map((i) => (i.open ? `<a class="chip" href="${resourceHref(r, u.slug, `&c=${i.id}`)}">${esc(i.label)}</a>` : `<span class="chip off">🔒 ${esc(i.label)}</span>`)).join("");
  }
  if (r.kind === "t25") {
    links = r.items.map((i, k) => (i.open ? `<a class="chip" href="${resourceHref(r, u.slug, `&t=${i.id}`)}">Задача ${k + 1} (${esc(i.label)})</a>` : `<span class="chip off">🔒 Задача ${k + 1}</span>`)).join("");
  }
  const meta = locked ? "в пълния достъп" : r.open < r.total ? `${r.open} от ${r.total} отключени` : r.done ? `решени ${r.done} от ${r.total}` : `${r.total} ${r.total === 1 ? "брой" : "броя"}`;
  const h = head(r.kind, u, meta, locked);
  if (links) return `<div class="res">${h}<div class="chips">${links}</div></div>`;
  return locked ? `<button class="res locked" data-locked="${esc(r.module)}">${h}</button>` : `<a class="res" href="${href}">${h}</a>`;
}

// A step that exists, for a visitor: only what it is and how much there is.
function previewTile(r, u) {
  const meta = PAGE[r.kind] ? "готово" : `${r.total} ${r.total === 1 ? "брой" : "броя"}`;
  return PAGE[r.kind] ? `<a class="res" href="${PAGE[r.kind]}?u=${encodeURIComponent(u.slug)}">${head(r.kind, u, meta)}</a>` : `<div class="res">${head(r.kind, u, meta)}</div>`;
}

// A step that is not written yet. Lessons and texts open their empty template.
function soonTile(kind, u, showTemplate) {
  const inner = `${head(kind, u)}<span class="pill">${showTemplate && PAGE[kind] ? "скоро · виж шаблона" : "скоро"}</span>`;
  return showTemplate && PAGE[kind] ? `<a class="res soon" href="${PAGE[kind]}?u=${encodeURIComponent(u.slug)}">${inner}</a>` : `<div class="res soon">${inner}</div>`;
}

async function load() {
  const m = await me();
  const slug = params().get("u") || "";
  const child = !!m.child;
  let u, resources, full = false;
  if (child) {
    const d = await api(`learn/unit/${encodeURIComponent(slug)}`);
    ({ unit: u, resources, full } = d);
  } else {
    u = await publicUnit(slug);
    resources = u.resources;
  }
  topbar(m, { back: child ? { href: "/uchenik/", label: "Начало" } : { href: `/programa/?klas=${u.grade}`, label: "Програмата" } });
  document.title = `${u.title} – Еду БЕЛ`;
  // Children see empty templates only in the test version; visitors always see the structure.
  const showTemplate = !child || !!m.testMode;
  const steps = unitSteps(u.planned, resources);
  let h = `<p class="eyebrow">${esc(SECTION_LABEL[u.section] || "")}${u.grp ? ` · ${esc(u.grp)}` : ""}</p><h1>${esc(u.title)}</h1>${u.subtitle ? `<p class="lead">${esc(u.subtitle)}</p>` : ""}`;
  if (!child) h += `<p class="notice info">Така изглежда ${u.section === "language" ? "темата" : "творбата"} за ученика. Упражненията се отварят в профила на детето.</p>`;
  const ready = steps.filter((s) => s.res).length;
  h += `<p class="small muted">${ready ? `Готови ${ready} от ${steps.length} стъпки` : "Материалите се подготвят"}${child && full ? " · пълен достъп" : ""}</p>`;
  h += `<ol class="path">${steps
    .map((s, i) => `<li class="${s.res ? "on" : ""}"><span class="num" aria-hidden="true">${i + 1}</span>${s.res ? (child ? readyTile(s.res, u) : previewTile(s.res, u)) : soonTile(s.kind, u, showTemplate)}</li>`)
    .join("")}</ol>`;
  if (u.section === "literature" && u.info?.textbook) h += `<p class="small muted">Текстът на творбата е в учебника – тук са урокът и упражненията.</p>`;
  h += `<div id="unlockBox"></div>`;
  $("main").innerHTML = h;
  document.querySelectorAll("[data-locked]").forEach((b) =>
    b.addEventListener("click", () => {
      renderUnlock($("unlockBox"), { module: b.dataset.locked, title: u.title, locked: true });
      $("unlockBox").scrollIntoView({ block: "center" });
    }),
  );
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
