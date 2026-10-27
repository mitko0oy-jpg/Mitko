import { $, api, esc, go, gradeOf, guard, params, pct, toast, topbar } from "./app.js";

const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya" };
const translit = (s) => s.toLowerCase().split("").map((ch) => TR[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 16);

function ago(iso) {
  if (!iso) return "още не е учил";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "днес" : days === 1 ? "вчера" : `преди ${days} дни`;
}
const date = (iso) => new Date(iso).toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });

function kidCard(c, d) {
  const titles = Object.fromEntries(c.modules.map((m) => [m.slug, m.title]));
  const pending = c.unlockRequests.filter((u) => !u.seen);
  let h = `<article class="kid" id="kid-${c.id}">
    <header><div><h3>${esc(c.name)}</h3><div class="sub">${c.grade}. клас · потребителско име: <b>${esc(c.username)}</b></div></div>
    <span class="pill ${c.full ? "ok" : ""}">${c.full ? "Пълен достъп" : "Безплатна част"}</span></header>`;

  if (pending.length && !c.full) {
    h += `<div class="offer"><h3>${esc(c.name)} мина безплатната част</h3>
      <p>Стигна края на безплатното в ${pending.map((u) => `„${esc(titles[u.module] || u.module)}“`).join(", ")} и иска да продължи.</p>
      ${offerBody(d)}
      <button class="linkbtn" data-seen="${c.id}">Видях го</button></div>`;
  }

  const dg = c.diagnostic;
  h += `<div class="stats">
    <div class="stat"><div class="n txt">${esc(ago(c.lastActive))}</div><div class="l">последно учене</div></div>
    <div class="stat"><div class="n">${c.weekItems}</div><div class="l">упражнения за 7 дни</div></div>
    <div class="stat"><div class="n">${dg ? `${dg.ok} / ${dg.done}` : "–"}</div><div class="l">${dg ? `входен тест · ${gradeOf(dg.ok, dg.done)} (ориентировъчно)` : "входният тест не е решен"}</div></div>
    ${examStat(c.exam)}
  </div>`;

  if (c.modules.length) {
    h += `<h3 style="margin-top:18px">Напредък</h3><div>`;
    for (const m of c.modules) {
      const lockedPct = pct(m.locked, m.total);
      h += `<div class="mrow"><span class="nm">${esc(m.title)}</span><span class="pc">${m.done} / ${m.accessible}${m.locked ? ` · 🔒 ${m.locked}` : ""}</span>
        <div class="bar" aria-hidden="true"><i style="width:${pct(m.done, m.total)}%"></i><i class="lock" style="width:${lockedPct}%;margin-left:auto"></i></div></div>`;
    }
    h += `</div>`;
  } else {
    h += `<p class="notice info">Материалите за ${c.grade}. клас се подготвят. Ще ти пишем, когато са готови.</p>`;
  }

  if (c.weak.length || c.strong.length) {
    h += `<h3 style="margin-top:18px">Слаби места</h3>`;
    if (c.weak.length) h += `<p class="small muted" style="margin:0">За преговор:</p><ul class="weak">${c.weak.map((w) => `<li><span>${esc(w.work)}</span><span>${w.bad} ${w.bad === 1 ? "грешка" : "грешки"}</span></li>`).join("")}</ul>`;
    if (c.strong.length) h += `<p class="small" style="margin-top:10px"><b>Знае добре:</b> ${c.strong.map(esc).join(", ")}</p>`;
  }

  h += `<div class="row">
      <button class="btn" data-switch="${c.id}">Учи като ${esc(c.name)}</button>
      <button class="btn ghost" data-pass="${c.id}">Нова парола</button>
    </div>
    <form class="stack" data-passform="${c.id}" hidden style="margin-top:12px">
      <div class="field"><label for="np-${c.id}">Нова парола за ${esc(c.name)}</label><input type="text" id="np-${c.id}" autocomplete="off" minlength="6"></div>
      <div class="row" style="margin-top:0"><button class="btn" type="submit">Запази</button></div>
    </form>
    <details style="margin-top:14px"><summary class="small muted">Още настройки</summary>
      <div class="row">
        <label class="field" style="flex:1"><span class="small">Клас</span>
          <select data-grade="${c.id}">${[5, 6, 7].map((g) => `<option value="${g}" ${g === c.grade ? "selected" : ""}>${g}. клас</option>`).join("")}</select></label>
      </div>
      <div class="row"><button class="btn ghost" data-del="${c.id}">Изтрий профила на ${esc(c.name)}</button></div>
    </details>
  </article>`;
  return h;
}

function examStat(e) {
  if (!e) return "";
  const pts = e.sections.reduce((s, x) => s + x.points, 0);
  const max = e.sections.reduce((s, x) => s + x.max, 0);
  const label = e.done >= e.total ? `пробна матура · ${gradeOf(pts, max)} (ориентировъчно)` : `пробна матура · ${e.done} от ${e.total} части`;
  return `<div class="stat"><div class="n">${Math.round(pts)} / ${Math.round(max)}</div><div class="l">${label}</div></div>`;
}

function offerBody(d) {
  const codeHint = d.testMode
    ? "В тестовата версия пълният достъп се отключва с код за тестери."
    : "Плащането с карта ще бъде добавено скоро. Ако имаш код от кутията с картите, въведи го тук.";
  return `<p class="small">Пълният достъп отключва всички карти, задачи, разговорите с героите и проверката на писането за всички деца в профила ти.</p>
    <p class="small muted">${codeHint}</p>
    <form class="row" data-codeform style="margin-top:8px"><input type="text" placeholder="ABCDE-23456" aria-label="Код за достъп" autocapitalize="characters" spellcheck="false" style="flex:1;min-width:160px"><button class="btn gold" type="submit">Отключи</button></form>`;
}

function render(d) {
  const p = params();
  let h = `<h1>Здравей, ${esc(d.parent.name)}</h1>`;
  if (p.get("kod")) h += `<p class="notice err">Кодът не беше приет: ${esc(p.get("kod"))}</p>`;
  if (["reviewer", "admin"].includes(d.parent.role)) {
    h += `<div class="panel"><h3>Преглед на съдържанието</h3><p>Профилът ти е за проверка на уроците, картите и задачите.</p><a class="btn gold" href="/pregled/">Към прегледа</a></div>`;
  }
  if (d.access.length) {
    const a = d.access[0];
    h += `<p class="notice ok">Пълен достъп до ${date(a.ends_at)}${a.product !== "bel-all" ? ` (${esc(a.product.replace("bel", ""))}. клас)` : ""}.</p>`;
  }
  if (!d.children.length) {
    h += `<div class="panel"><h3>Първа стъпка: добави детето си</h3><p class="muted">Измисли му потребителско име и парола. С тях то влиза от своя телефон или компютър. Не са нужни имейл или телефон на детето.</p></div>`;
  } else {
    h += `<p class="small muted">Децата влизат на <b>${esc(location.host)}</b> с потребителското си име и парола.</p>`;
  }
  for (const c of d.children) h += kidCard(c, d);

  h += `<details class="panel" ${d.children.length ? "" : "open"} id="addBox"><summary><b>Добави дете</b></summary>
    <form class="stack" id="addForm" novalidate style="margin-top:12px">
      <div class="field"><label for="aName">Име или прякор</label><input type="text" id="aName" maxlength="40" required></div>
      <div class="field"><label for="aUser">Потребителско име</label><input type="text" id="aUser" autocapitalize="none" spellcheck="false" maxlength="24" required><span class="hint">Латински букви и цифри, напр. ivan.7b</span></div>
      <div class="field"><label for="aPass">Парола за детето</label><input type="text" id="aPass" autocomplete="off" minlength="6" required><span class="hint">Поне 6 знака. Запиши я на детето.</span></div>
      <div class="field"><label for="aGrade">Клас</label><select id="aGrade"><option value="7">7. клас</option><option value="6">6. клас</option><option value="5">5. клас</option></select></div>
      <p class="formerr" id="aErr" role="alert"></p>
      <button class="btn" type="submit">Добави</button>
    </form></details>`;

  if (!d.access.length && d.children.length) h += `<div class="panel"><h3>Пълен достъп</h3>${offerBody(d)}</div>`;
  h += `<footer class="site"><a href="/programa/">Програмата по класове</a><a href="/usloviya/">Условия и поверителност</a></footer>`;
  $("main").innerHTML = h;
  bind(d);
}

function bind(d) {
  $("aName")?.addEventListener("input", () => {
    if (!$("aUser").dataset.touched) $("aUser").value = translit($("aName").value);
  });
  $("aUser")?.addEventListener("input", () => ($("aUser").dataset.touched = "1"));
  $("addForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("aErr").textContent = "";
    try {
      await api("family/children", { name: $("aName").value, username: $("aUser").value, password: $("aPass").value, grade: Number($("aGrade").value) });
      toast("Детето е добавено");
      load();
    } catch (err) {
      $("aErr").textContent = err.message;
    }
  });
  document.querySelectorAll("[data-switch]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api("auth/switch", { childId: Number(b.dataset.switch) });
      go("/uchenik/");
    }),
  );
  document.querySelectorAll("[data-pass]").forEach((b) =>
    b.addEventListener("click", () => {
      const f = document.querySelector(`[data-passform="${b.dataset.pass}"]`);
      f.hidden = !f.hidden;
    }),
  );
  document.querySelectorAll("[data-passform]").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api(`family/children/${f.dataset.passform}/password`, { password: f.querySelector("input").value });
        f.hidden = true;
        toast("Паролата е сменена");
      } catch (err) {
        toast(err.message);
      }
    }),
  );
  document.querySelectorAll("[data-grade]").forEach((s) =>
    s.addEventListener("change", async () => {
      await api(`family/children/${s.dataset.grade}/grade`, { grade: Number(s.value) });
      toast("Класът е сменен");
      load();
    }),
  );
  document.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.confirm !== "1") {
        b.dataset.confirm = "1";
        b.textContent = "Натисни пак, за да изтриеш завинаги";
        return;
      }
      await api(`family/children/${b.dataset.del}/delete`, { confirm: true });
      toast("Профилът е изтрит");
      load();
    }),
  );
  document.querySelectorAll("[data-seen]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`family/children/${b.dataset.seen}/seen`, {});
      load();
    }),
  );
  document.querySelectorAll("[data-codeform]").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const r = await api("family/redeem", { code: f.querySelector("input").value });
        toast(r.result.kind === "reviewer" ? "Профилът е за преглед на съдържанието" : "Пълният достъп е отключен!");
        load();
      } catch (err) {
        toast(err.message, 4000);
      }
    }),
  );
}

let me;
async function load() {
  try {
    me = me || (await guard("parent"));
    if (me.child) {
      // A parent who switched into a child's profile comes back as the parent.
      await api("auth/switch-back", {});
      me = { ...me, child: null, viaParent: false };
    }
    if (!$("topbar").innerHTML) topbar(me);
    render(await api("family"));
  } catch (e) {
    if (e.message !== "redirect") $("main").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
  }
}
load();
