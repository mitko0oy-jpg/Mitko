import { $, api, go, homeFor, me, params } from "./app.js";

function tab(which) {
  const child = which === "child";
  $("tabChild").setAttribute("aria-selected", String(child));
  $("tabParent").setAttribute("aria-selected", String(!child));
  $("childForm").hidden = !child;
  $("parentForm").hidden = child;
}
$("tabChild").addEventListener("click", () => tab("child"));
$("tabParent").addEventListener("click", () => tab("parent"));
if (params().get("kak") === "roditel") tab("parent");

async function done() {
  const m = await me();
  const next = params().get("next");
  go(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(m));
}

$("childForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("cErr").textContent = "";
  try {
    await api("auth/login", { username: $("cUser").value, password: $("cPass").value });
    await done();
  } catch (err) {
    $("cErr").textContent = err.message;
  }
});

$("parentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("pErr").textContent = "";
  try {
    await api("auth/login", { email: $("pEmail").value, password: $("pPass").value });
    await done();
  } catch (err) {
    $("pErr").textContent = err.message;
  }
});
