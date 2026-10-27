// Teacher review: each item as the child sees it, plus "approve" and "comment".
import { $, api, esc, guard, toast, topbar } from "./app.js";

const KIND = { cards: "Карти", diagnostic: "Входен тест", t25: "Задача 25", chars: "Герои (AI)", pesho: "Научи Пешо" };
let filter = "review";
let current = null;

function itemBody(kind, d) {
  if (kind === "cards" || kind === "diagnostic") {
    return `<p class="rq">${esc(d.q)}</p>${d.qt ? `<blockquote class="rquote">${esc(d.qt)}</blockquote>` : ""}
      <ol class="ropts">${d.o.map((o, i) => `<li class="${i === 0 ? "right" : ""}">${esc(o)}${i === 0 ? ' <span class="pill ok">верен</span>' : ""}</li>`).join("")}</ol>
      <p class="rlbl">Защо</p><p>${esc(d.e)}</p>
      <p class="small muted">Творби: ${(d.ws || []).map(esc).join(", ")} · преговор: ${esc(d.w)}</p>`;
  }
  if (kind === "t25") {
    return `<p class="small muted">${esc(d.w)} · ${esc(d.a)}</p><p class="rq">${esc(d.task)}</p>${d.q ? `<blockquote class="rquote">${esc(d.q)}</blockquote>` : '<p class="small muted">Без цитат</p>'}
      <p class="rlbl">Опорни идеи</p><ul>${(d.keys || []).map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
      <p class="rlbl">Примерен отговор</p><p class="rmodel">${esc(d.model)}</p>`;
  }
  if (kind === "chars") {
    return `<p class="rq">${esc(d.name)}</p><p class="small muted">„${esc(d.work)}“ · ${esc(d.author)} · ${esc(d.genre)}</p>
      <p class="rlbl">Как говори</p><p>${esc(d.voice)}</p>
      <p class="rlbl">Факти (героят говори само от тях)</p><ul>${(d.facts || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      <p class="rlbl">Какво не разказва</p><p>${esc(d.limits)}</p>
      <p class="rlbl">Мисия за ученика</p><p>${esc(d.mission)}</p>
      <p class="rlbl">Очакван отговор</p><p>${esc(d.key)}</p>
      <p class="rlbl">Поздрав</p><p><i>${esc(d.greet)}</i></p>
      ${d.chips?.length ? `<p class="rlbl">Готови въпроси</p><p>${d.chips.map(esc).join(" · ")}</p>` : ""}`;
  }
  if (kind === "pesho") {
    return `<p class="small muted">${esc(d.work)}</p><p class="rlbl">Пешо казва (грешно)</p><p class="rq">${esc(d.says)}</p><p class="rlbl">Вярното</p><p>${esc(d.truth)}</p>`;
  }
  return `<pre>${esc(JSON.stringify(d, null, 2))}</pre>`;
}

function itemCard(kind, it) {
  const open = it.comments.filter((c) => !c.resolved_at);
  const status = it.status === "approved" ? '<span class="pill ok">Одобрено</span>' : '<span class="pill">Чака преглед</span>';
  return `<article class="ritem" id="it-${it.id}">
    <header><span class="small muted">№ ${esc(it.ext_id)}</span>${status}${open.length ? `<span class="pill bad">${open.length} коментар</span>` : ""}</header>
    ${itemBody(kind, it.data)}
    ${it.comments.length ? `<div class="rcomments">${it.comments.map((c) => `<div class="rc ${c.resolved_at ? "done" : ""}"><b>Коментар:</b> ${esc(c.body)}${c.resolution ? `<br><b>Поправка:</b> ${esc(c.resolution)}` : c.resolved_at ? "" : '<br><span class="small muted">Чака поправка</span>'}</div>`).join("")}</div>` : ""}
    <div class="row">
      ${it.status !== "approved" ? `<button class="btn" data-approve="${it.id}">Одобрено ✓</button>` : `<button class="btn ghost" data-reopen="${it.id}">Върни за преглед</button>`}
      <button class="btn ghost" data-comment="${it.id}">Коментар</button>
    </div>
    <form class="stack" data-cform="${it.id}" hidden style="margin-top:10px">
      <textarea rows="3" maxlength="2000" aria-label="Коментар" placeholder="Какво да се поправи? Напиши вярното, ако го знаеш."></textarea>
      <div class="row" style="margin-top:0"><button class="btn" type="submit">Изпрати коментара</button></div>
    </form>
  </article>`;
}

async function openModule(slug) {
  current = slug;
  const d = await api(`review/module/${encodeURIComponent(slug)}`);
  const shown = d.items.filter((it) =>
    filter === "review" ? it.status !== "approved" : filter === "comments" ? it.comments.some((c) => !c.resolved_at) : true,
  );
  const approved = d.items.filter((i) => i.status === "approved").length;
  $("main").innerHTML = `<button class="linkbtn" id="toList">← Всички модули</button>
    <h1>${esc(d.module.title)}</h1>
    <p class="muted">${d.module.grade}. клас · ${esc(KIND[d.module.kind] || d.module.kind)} · одобрени <b>${approved}</b> от ${d.items.length}</p>
    <div class="tabs" role="tablist">
      <button role="tab" data-f="review" aria-selected="${filter === "review"}">Чакащи (${d.items.length - approved})</button>
      <button role="tab" data-f="comments" aria-selected="${filter === "comments"}">С коментар</button>
      <button role="tab" data-f="all" aria-selected="${filter === "all"}">Всички</button>
    </div>
    ${shown.length ? shown.map((it) => itemCard(d.module.kind, it)).join("") : `<p class="notice ok">Няма нищо за преглед тук. Браво!</p>`}`;
  $("toList").addEventListener("click", list);
  document.querySelectorAll("[data-f]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.f;
      openModule(slug);
    }),
  );
  document.querySelectorAll("[data-approve]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`review/item/${b.dataset.approve}/approve`, {});
      toast("Одобрено");
      const el = $(`it-${b.dataset.approve}`);
      if (filter === "review") el.remove();
      else openModule(slug);
    }),
  );
  document.querySelectorAll("[data-reopen]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`review/item/${b.dataset.reopen}/reopen`, {});
      openModule(slug);
    }),
  );
  document.querySelectorAll("[data-comment]").forEach((b) =>
    b.addEventListener("click", () => {
      const f = document.querySelector(`[data-cform="${b.dataset.comment}"]`);
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector("textarea").focus();
    }),
  );
  document.querySelectorAll("[data-cform]").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = f.querySelector("textarea").value.trim();
      if (!text) return;
      await api(`review/item/${f.dataset.cform}/comment`, { body: text });
      toast("Коментарът е изпратен");
      openModule(slug);
    }),
  );
  window.scrollTo(0, 0);
}

async function list() {
  current = null;
  const d = await api("review/modules");
  const total = d.modules.reduce((s, m) => s + m.total, 0);
  const approved = d.modules.reduce((s, m) => s + m.approved, 0);
  $("main").innerHTML = `<h1>Преглед на съдържанието</h1>
    <p class="lead">Отвори модул и прегледай всеки елемент. „Одобрено“ го пуска към децата. „Коментар“ ми казва какво да поправя – след поправката той пак идва тук за одобрение.</p>
    <p class="notice info">Одобрени <b>${approved}</b> от ${total}.</p>
    <div class="mods">${d.modules
      .map(
        (m) => `<button class="mod" data-m="${esc(m.slug)}" style="--c:var(${m.review ? "--gold" : "--ok"})">
        <p class="t">${esc(m.title)}</p><p class="d">${m.grade}. клас · ${esc(KIND[m.kind] || m.kind)}</p>
        <div class="meta"><span>${m.review ? `Чакат: ${m.review}` : "Всичко е одобрено"}</span><span>${m.open_comments ? `коментари: ${m.open_comments}` : `${m.approved} / ${m.total}`}</span></div>
        <div class="bar"><i style="width:${m.total ? (m.approved / m.total) * 100 : 0}%"></i></div></button>`,
      )
      .join("")}</div>`;
  document.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => openModule(b.dataset.m)));
  window.scrollTo(0, 0);
}

async function load() {
  const m = await guard("reviewer");
  topbar(m);
  await list();
}
load().catch((e) => {
  if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
});
