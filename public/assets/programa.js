// Public course map: every work and topic per grade, with what is ready and what is coming.
import { $, api, esc, me, params, SECTION_LABEL, stepLabel, topbar, unitSteps } from "./app.js";

let grade = [5, 6, 7].includes(Number(params().get("klas"))) ? Number(params().get("klas")) : 7;

// Every unit opens its page: the steps that are ready and the ones still coming.
function unitRow(u) {
  const steps = unitSteps(u.planned, u.resources);
  const chips = steps.map((s) => `<span class="rk ${s.res ? "" : "soon"}">${esc(stepLabel(s.kind, u.section))}${s.res && !["chars", "lesson", "reading"].includes(s.kind) ? ` ${s.res.total}` : ""}</span>`).join("");
  return `<a class="unit ${u.resources.length ? "" : "soon"}" href="/tema/?u=${encodeURIComponent(u.slug)}"><p class="t">${esc(u.title)}</p>${u.subtitle ? `<p class="d">${esc(u.subtitle)}</p>` : ""}<div class="rks">${chips}</div></a>`;
}

async function render() {
  const d = await api(`units?grade=${grade}`);
  const ready = d.units.filter((u) => u.resources.length).length;
  let h = `<h1>Програмата по класове</h1>
    <p class="lead">Всички творби и теми по учебната програма на МОН. Отвори която и да е, за да видиш стъпките ѝ.</p>
    <div class="tabs" role="tablist">${[5, 6, 7].map((g) => `<button role="tab" data-g="${g}" aria-selected="${g === grade}">${g}. клас</button>`).join("")}</div>
    <p class="notice info">${grade}. клас: <b>${ready}</b> от ${d.units.length} теми и творби имат упражнения.</p>
    <p class="small muted"><span class="rk">Готово</span> има упражнения · <span class="rk soon">Предстои</span> се подготвя</p>`;
  for (const sec of ["literature", "language"]) {
    const list = d.units.filter((u) => u.section === sec);
    if (!list.length) continue;
    h += `<h2>${SECTION_LABEL[sec]}</h2>`;
    const groups = [];
    for (const u of list) {
      let g = groups.find((x) => x.name === u.grp);
      if (!g) groups.push((g = { name: u.grp, units: [] }));
      g.units.push(u);
    }
    h += groups.map((g) => `${g.name ? `<h3 class="grp">${esc(g.name)}</h3>` : ""}<div class="units">${g.units.map(unitRow).join("")}</div>`).join("");
  }
  h += `<div class="row" style="margin-top:28px"><a class="btn gold" href="/registracia/">Регистрация за родители</a><a class="btn ghost" href="/">Към началото</a></div>`;
  $("main").innerHTML = h;
  document.querySelectorAll("[data-g]").forEach((b) =>
    b.addEventListener("click", () => {
      grade = Number(b.dataset.g);
      history.replaceState(null, "", `?klas=${grade}`);
      render();
    }),
  );
}

me().then((m) => topbar(m)).catch(() => {});
render().catch((e) => ($("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`));
