import { api } from "./app.js";

const $ = (id) => document.getElementById(id);
const next = new URLSearchParams(location.search).get("next");
const go = () => (location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

const me = await api("/api/auth/me");
if (me.user) go();
if (me.needsSetup) {
  $("login").hidden = true;
  $("setup").hidden = false;
  $("lead").textContent = "Първи вход: създай профила на собственика. Кодът е в настройките на сайта в Netlify (SETUP_CODE).";
}

for (const id of ["login", "setup"]) {
  $(id).onsubmit = async (e) => {
    e.preventDefault();
    $("err").textContent = "";
    const f = e.target;
    const btn = f.querySelector("button");
    btn.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(f));
      await api(`/api/auth/${id}`, { method: "POST", body });
      go();
    } catch (err) {
      $("err").textContent = err.message;
      btn.disabled = false;
    }
  };
}
