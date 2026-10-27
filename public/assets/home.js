import { $, homeFor, me, topbar } from "./app.js";

// Logged-in visitors get a shortcut to their own start page.
me()
  .then((m) => {
    topbar(m);
    if (!m.user && !m.child) return;
    $("ctas").innerHTML = `<a class="btn gold" href="${homeFor(m)}">Продължи${m.child ? ` като ${m.child.name.replace(/[<>&"]/g, "")}` : ""}</a>`;
  })
  .catch(() => {});
