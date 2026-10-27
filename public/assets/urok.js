// The short lesson (/urok/) and the reading page (/chetene/) of one unit.
// Until the material is written, the page shows its empty template.
import { $, api, esc, me, params, publicUnit, renderUnlock, saveProgress, SECTION_LABEL, stepLabel, topbar } from "./app.js";
import { lessonHtml, readingHtml } from "./lesson-view.js";

const kind = location.pathname.startsWith("/chetene") ? "reading" : "lesson";

async function load() {
  const m = await me();
  const slug = params().get("u") || "";
  let u, item = null, locked = false, module = null, ready = false;
  if (m.child) {
    const d = await api(`learn/unit/${encodeURIComponent(slug)}/${kind}`);
    ({ unit: u, item, locked, module } = d);
  } else {
    u = await publicUnit(slug);
    ready = u.resources.some((r) => r.kind === kind);
  }
  topbar(m, { back: { href: `/tema/?u=${encodeURIComponent(slug)}`, label: "Към темата" } });
  const label = stepLabel(kind, u.section);
  document.title = `${label}: ${u.title} – Еду БЕЛ`;
  let h = `<p class="eyebrow">${esc(label)} · ${esc(SECTION_LABEL[u.section] || "")}</p><h1>${esc(u.title)}</h1>${u.subtitle ? `<p class="lead">${esc(u.subtitle)}</p>` : ""}`;
  if (locked) h += `<div id="unlockBox"></div>`;
  else if (ready) h += `<p class="notice info">Готово е. Съдържанието се отваря в профила на ученика – тук се виждат само разделите.</p>`;
  else if (!item) h += `<p class="notice info"><b>Шаблон.</b> ${kind === "lesson" ? "Урокът още не е написан" : "Текстът още не е добавен"}. Така ще изглеждат разделите – всеки с кратко описание какво ще има в него.</p>`;
  h += `<div class="lesson">${kind === "lesson" ? lessonHtml(u.section, item?.data) : readingHtml(item?.data)}</div>`;
  if (item) {
    h += `<div class="row" style="margin-top:22px"><button class="btn gold" id="doneBtn" ${item.done ? "disabled" : ""}>${item.done ? "Прочетено ✓" : kind === "lesson" ? "Прочетох урока" : "Прочетох творбата"}</button><a class="btn ghost" href="/tema/?u=${encodeURIComponent(slug)}">Към темата</a></div>`;
  }
  $("main").innerHTML = h;
  if (locked) renderUnlock($("unlockBox"), { module, title: u.title, locked: true });
  $("doneBtn")?.addEventListener("click", async () => {
    const r = await saveProgress(module, [{ itemId: item.id, ok: true }]);
    if (r) {
      $("doneBtn").textContent = "Прочетено ✓";
      $("doneBtn").disabled = true;
    }
  });
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
