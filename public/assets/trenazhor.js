// НВО тренажор landing: plan prices and their checkout pages from the settings. Runs before shop.js.
import { TRN as BASE } from "/assets/trenazhor-config.js";
import { euro } from "/assets/shop-catalog.js";

const $$ = (s) => [...document.querySelectorAll(s)];
const SET = window.EB_LANDING?.trn || {};
const plans = structuredClone(BASE.plans);
for (const [k, v] of Object.entries(SET.prices || {})) if (plans[k] && v > 0) plans[k].price = Math.round(v * 100);
const checkout = { ...BASE.checkout, ...(SET.checkout || {}) };
const app = SET.app || BASE.app;
const store = SET.store || BASE.store;

const month = plans.m1.price;
for (const el of $$("[data-plan-price]")) el.textContent = euro(plans[el.dataset.planPrice].price);
// "≈ 3,33 € на месец", rounded up to a cent
for (const el of $$("[data-plan-month]")) {
  const p = plans[el.dataset.planMonth];
  el.textContent = `${euro(Math.ceil(p.price / p.months))} на месец`;
}
// what a longer plan saves against paying month by month
for (const el of $$("[data-plan-save]")) {
  const p = plans[el.dataset.planSave];
  const save = month * p.months - p.price;
  el.hidden = !(save > 0);
  if (save > 0) el.textContent = `Спестяваш ${euro(save)}`;
}
for (const a of $$("[data-plan-go]")) a.href = checkout[a.dataset.planGo] || "#";
for (const a of $$("[data-trn-app]")) a.href = app;
for (const a of $$("[data-store-link]")) a.href = store;
