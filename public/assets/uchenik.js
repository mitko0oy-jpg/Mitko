import { $, api, esc, guard, KIND_LABEL, PATHS, pct, SECTION_LABEL, topbar } from "./app.js";

const COLORS = ["--l0", "--l1", "--l2", "--gold", "--l1", "--l2"];
let tab = "literature";
try {
  tab = sessionStorage.getItem("edubel-tab") || "literature";
} catch {}

function unitCard(u) {
  const total = u.resources.reduce((s, r) => s + r.total, 0);
  const open = u.resources.reduce((s, r) => s + r.open, 0);
  const done = u.resources.reduce((s, r) => s + r.done, 0);
  if (!total) {
    return `<div class="unit soon"><p class="t">${esc(u.title)}</p>${u.subtitle ? `<p class="d">${esc(u.subtitle)}</p>` : ""}<span class="pill">скоро</span></div>`;
  }
  const kinds = u.resources.map((r) => `<span class="rk">${esc(KIND_LABEL[r.kind] || r.kind)}${r.kind === "chars" ? "" : ` ${r.total}`}</span>`).join("");
  return `<a class="unit" href="/tema/?u=${encodeURIComponent(u.slug)}"><p class="t">${esc(u.title)}</p>${u.subtitle ? `<p class="d">${esc(u.subtitle)}</p>` : ""}
    <div class="rks">${kinds}</div>
    <div class="bar" aria-hidden="true"><i style="width:${pct(done, total)}%"></i><i class="lock" style="width:${pct(total - open, total)}%;margin-left:auto"></i></div></a>`;
}

function sectionHtml(units, section) {
  const list = units.filter((u) => u.section === section);
  if (!list.length) return `<p class="muted">Подготвяме този раздел.</p>`;
  const groups = [];
  for (const u of list) {
    let g = groups.find((x) => x.name === u.grp);
    if (!g) groups.push((g = { name: u.grp, units: [] }));
    g.units.push(u);
  }
  return groups.map((g) => `${g.name ? `<h3 class="grp">${esc(g.name)}</h3>` : ""}<div class="units">${g.units.map(unitCard).join("")}</div>`).join("");
}

function modulesHtml(mods) {
  return `<div class="mods">${mods
    .map((x, i) => {
      const state = x.done === 0 ? "Още не си започнал" : x.freeFinished ? "Безплатната част е готова" : `${x.done} от ${x.accessible}`;
      return `<a class="mod" style="--c:var(${COLORS[i % COLORS.length]})" href="${PATHS[x.kind]}?m=${encodeURIComponent(x.slug)}">
        <p class="t">${esc(x.title)}</p><p class="d">${esc(x.subtitle)}</p>
        <div class="meta"><span>${state}</span><span>${x.locked ? `🔒 ${x.locked}` : x.kind === "diagnostic" ? "безплатно" : x.total ? "всичко отключено" : ""}</span></div>
        <div class="bar" aria-hidden="true"><i style="width:${pct(x.done, x.total)}%"></i><i class="lock" style="width:${pct(x.locked, x.total)}%;margin-left:auto"></i></div></a>`;
    })
    .join("")}</div>`;
}

async function load() {
  const m = await guard("child");
  topbar(m);
  const [d, s] = await Promise.all([api("learn/home"), api("learn/units")]);
  let h = `<h1>Здравей, ${esc(d.child.name)}!</h1>`;
  if (!d.modules.length && !s.units.length) {
    $("main").innerHTML = h + `<p class="lead">Материалите за ${d.child.grade}. клас се подготвят. Скоро ще са тук!</p>`;
    return;
  }
  // Today: the next useful step first.
  const diag = d.modules.find((x) => x.kind === "diagnostic");
  const exam = d.modules.find((x) => x.kind === "exam");
  const cards = d.modules.find((x) => x.kind === "cards");
  const today = [];
  if (diag && !diag.done) today.push(`<a class="today gold" href="/karti/?m=${encodeURIComponent(diag.slug)}"><b>Входен тест</b><span>15 въпроса – виж кое знаеш</span></a>`);
  if (cards && d.due > 0) today.push(`<a class="today" href="/karti/?m=${encodeURIComponent(cards.slug)}&rezhim=pregovor"><b>Преговор за днес</b><span>${d.due} ${d.due === 1 ? "карта" : "карти"}</span></a>`);
  if (exam) today.push(`<a class="today" href="/izpit/?m=${encodeURIComponent(exam.slug)}"><b>Пробна матура</b><span>Като на НВО</span></a>`);
  h += `<p class="lead">${today.length ? "По малко всеки ден е по-добре от много наведнъж." : "Избери творба или тема."}</p>`;
  if (today.length) h += `<div class="todays">${today.join("")}</div>`;
  const tabs = [
    ["literature", SECTION_LABEL.literature],
    ["language", SECTION_LABEL.language],
    ["all", "Всички упражнения"],
  ];
  h += `<div class="tabs" role="tablist" style="margin-top:22px">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div><div id="tabBody"></div>`;
  h += `<p class="small muted" style="margin-top:22px">AI говори само за творбите. Не пиши лични данни – име, адрес, училище или телефон.</p>`;
  $("main").innerHTML = h;
  const show = () => {
    document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $("tabBody").innerHTML = tab === "all" ? modulesHtml(d.modules) : sectionHtml(s.units, tab);
  };
  document.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      try {
        sessionStorage.setItem("edubel-tab", tab);
      } catch {}
      show();
    }),
  );
  show();
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
