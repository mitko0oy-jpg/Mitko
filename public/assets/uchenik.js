import { $, api, esc, guard, pct, topbar } from "./app.js";

export const PATHS = { cards: "/karti/", diagnostic: "/karti/", t25: "/zadacha25/", chars: "/geroi/", pesho: "/pesho/", exam: "/izpit/" };
const COLORS = ["--l0", "--l1", "--l2", "--gold", "--l1", "--l2"];

async function load() {
  const m = await guard("child");
  topbar(m);
  const d = await api("learn/home");
  const cards = d.modules.find((x) => x.kind === "cards");
  let h = `<h1>Здравей, ${esc(d.child.name)}!</h1>`;
  if (!d.modules.length) {
    h += `<p class="lead">Материалите за ${d.child.grade}. клас се подготвят. Скоро ще са тук!</p>`;
    $("main").innerHTML = h;
    return;
  }
  const diag = d.modules.find((x) => x.kind === "diagnostic");
  if (diag && !diag.done) {
    h += `<p class="lead">Започни с входния тест – 15 въпроса. Така ще видиш кое знаеш и кое да упражниш.</p>`;
  } else {
    h += `<p class="lead">По малко всеки ден е по-добре от много наведнъж.</p>`;
  }
  if (cards && d.due > 0) {
    h += `<a class="btn gold full" href="/karti/?m=${encodeURIComponent(cards.slug)}&rezhim=pregovor">Преговор за днес · ${d.due} ${d.due === 1 ? "карта" : "карти"}</a>`;
  }
  h += `<h2>Твоите модули</h2><div class="mods">`;
  d.modules.forEach((x, i) => {
    const state = x.done === 0 ? "Още не си започнал" : x.freeFinished ? "Безплатната част е готова" : `${x.done} от ${x.accessible}`;
    h += `<a class="mod" style="--c:var(${COLORS[i % COLORS.length]})" href="${PATHS[x.kind]}?m=${encodeURIComponent(x.slug)}">
      <p class="t">${esc(x.title)}</p><p class="d">${esc(x.subtitle)}</p>
      <div class="meta"><span>${state}</span><span>${x.locked ? `🔒 ${x.locked}` : x.kind === "diagnostic" ? "безплатно" : x.total ? "всичко отключено" : ""}</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${pct(x.done, x.total)}%"></i><i class="lock" style="width:${pct(x.locked, x.total)}%;margin-left:auto"></i></div>
    </a>`;
  });
  h += `</div><p class="small muted" style="margin-top:22px">AI говори само за творбите. Не пиши лични данни – име, адрес, училище или телефон.</p>`;
  $("main").innerHTML = h;
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
