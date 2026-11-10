// Landing of the Еду БЕЛ app: the links to the app follow the settings (its address can change,
// e.g. to app.edubel.site), the store link too. Runs before shop.js (see prilozhenie-main.js).
const SET = window.EB_LANDING?.app || {};
const APP = (SET.url || "https://edubel-app.netlify.app/").replace(/\/?$/, "/");
for (const a of document.querySelectorAll("[data-app]")) a.href = APP + a.dataset.app;
for (const a of document.querySelectorAll("[data-store-link]")) if (SET.store) a.href = SET.store;
