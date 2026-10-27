import { $, api, go, params } from "./app.js";

const code = params().get("kod");
if (code) $("rCode").value = code;

$("regForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("rErr").textContent = "";
  if (!$("rConsent").checked) {
    $("rErr").textContent = "Отбележи съгласието си, за да продължиш.";
    return;
  }
  try {
    const r = await api("auth/register", {
      name: $("rName").value,
      email: $("rEmail").value,
      password: $("rPass").value,
      code: $("rCode").value,
      consent: true,
    });
    const extra = r.code?.error ? `&kod=${encodeURIComponent(r.code.error)}` : r.code?.kind === "reviewer" ? "&pregled=1" : "";
    go(`/roditel/?nov=1${extra}`);
  } catch (err) {
    $("rErr").textContent = err.message;
  }
});
