// НВО тренажор: paying by card right in the app (app.edubel.site/dostap/, Stripe Checkout) – the personal code shows
// at once after paying and is also in Stripe's receipt by e-mail, with nobody sending it by hand.
// The plan buttons go there as soon as the app takes real card payments (a live Stripe key in Netlify); until then,
// or if the app does not answer within 3 seconds, they stay on the ConvertBuilder order pages, as before.
// Paying on delivery stays on ConvertBuilder: [data-trn-cod] lines (hidden until the switch) link there with
// a[data-trn-cod-go="m1|m6|m12"].
import { TRN } from "/assets/trenazhor-config.js";

// buttons: [[<a>, "m1" | "m6" | "m12"], …]; checkout: the ConvertBuilder order page of each plan (for paying on delivery).
// pay = "" (window.EB_LANDING.trn.appPay) keeps everything on ConvertBuilder.
export function payInApp(buttons, checkout, pay = TRN.appPay, plans = TRN.appPlans) {
  if (!pay || !buttons.length || typeof fetch !== "function") return;
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), 3000);
  fetch(new URL("/api/pay/plans", pay).href, ctl ? { signal: ctl.signal, credentials: "omit" } : { credentials: "omit" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.payments || d.test) return; // only real payments (no test key, no key at all)
      const sold = new Set((d.plans || []).map((p) => p.id));
      let moved = 0;
      for (const [a, k] of buttons) {
        const id = plans[k];
        if (!id || !sold.has(id)) continue;
        a.href = `${pay}?plan=${encodeURIComponent(id)}`;
        moved++;
      }
      if (!moved) return;
      for (const a of document.querySelectorAll("[data-trn-cod-go]")) if (checkout[a.dataset.trnCodGo]) a.href = checkout[a.dataset.trnCodGo];
      for (const el of document.querySelectorAll("[data-trn-cod]")) el.hidden = false;
    })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
}
