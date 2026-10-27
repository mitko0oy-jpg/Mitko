// One work or language topic with everything the platform has for it.
import { $, api, esc, guard, KIND_LABEL, params, PLANNED_LABEL, renderUnlock, resourceHref, SECTION_LABEL, topbar } from "./app.js";

const DESC = {
  cards: "Въпроси с обяснение защо отговорът е верен.",
  t25: "Пишеш 3–4 изречения, коучът задава насочващи въпроси.",
  chars: "Разпитай героя и изпълни мисията.",
  pesho: "Обясни на Пешо къде греши.",
};

function tile(r, u) {
  const locked = r.open === 0;
  let links = "";
  let href = resourceHref(r, u.slug);
  if (r.kind === "cards") href = resourceHref(r, u.slug, `&w=${encodeURIComponent(u.title)}`);
  if (r.kind === "pesho") href = resourceHref(r, u.slug, `&w=${encodeURIComponent(u.title)}`);
  if (r.kind === "chars") {
    links = r.items.map((i) => (i.open ? `<a class="chip" href="${resourceHref(r, u.slug, `&c=${i.id}`)}">${esc(i.label)}</a>` : `<span class="chip off">🔒 ${esc(i.label)}</span>`)).join("");
  }
  if (r.kind === "t25") {
    links = r.items.map((i, k) => (i.open ? `<a class="chip" href="${resourceHref(r, u.slug, `&t=${i.id}`)}">Задача ${k + 1} (${esc(i.label)})</a>` : `<span class="chip off">🔒 Задача ${k + 1}</span>`)).join("");
  }
  const meta = locked ? "в пълния достъп" : r.open < r.total ? `${r.open} от ${r.total} отключени` : r.done ? `решени ${r.done} от ${r.total}` : `${r.total} ${r.total === 1 ? "брой" : "броя"}`;
  const head = `<p class="t">${esc(KIND_LABEL[r.kind] || r.title)}</p><p class="d">${esc(DESC[r.kind] || "")}</p><div class="meta"><span>${esc(meta)}</span>${locked ? "<span>🔒</span>" : ""}</div>`;
  if (links) return `<div class="res">${head}<div class="chips">${links}</div></div>`;
  return locked ? `<button class="res locked" data-locked="1">${head}</button>` : `<a class="res" href="${href}">${head}</a>`;
}

async function load() {
  const m = await guard("child");
  topbar(m, { back: { href: "/uchenik/", label: "Начало" } });
  const slug = params().get("u");
  const d = await api(`learn/unit/${encodeURIComponent(slug || "")}`);
  const u = d.unit;
  document.title = `${u.title} – Еду БЕЛ`;
  let h = `<p class="eyebrow">${esc(SECTION_LABEL[u.section] || "")}${u.grp ? ` · ${esc(u.grp)}` : ""}</p><h1>${esc(u.title)}</h1>${u.subtitle ? `<p class="lead">${esc(u.subtitle)}</p>` : ""}`;
  if (d.resources.length) h += `<div class="ress">${d.resources.map((r) => tile(r, u)).join("")}</div>`;
  else h += `<p class="notice info">Материалите за тази ${u.section === "language" ? "тема" : "творба"} се подготвят.</p>`;
  if (u.planned?.length) {
    h += `<h3 class="grp">Предстои</h3><div class="ress">${u.planned.map((p) => `<div class="res soon"><p class="t">${esc(PLANNED_LABEL[p] || p)}</p><span class="pill">скоро</span></div>`).join("")}</div>`;
  }
  h += `<div id="unlockBox"></div>`;
  $("main").innerHTML = h;
  document.querySelectorAll("[data-locked]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = d.resources.find((x) => x.open === 0);
      renderUnlock($("unlockBox"), { module: r.module, title: u.title, locked: true });
      $("unlockBox").scrollIntoView({ block: "center" });
    }),
  );
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
