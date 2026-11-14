// One client for both worlds: the live server (Netlify Functions) or the in-browser
// demo (same service code, simulated data kept in localStorage).
import { createService, memoryStore } from "../core/service.js";
import { demoSource } from "../core/demo-source.js";

const LS = "pilot.demo.v1";
let mode = null;
let svc = null;

export async function init() {
  const q = new URLSearchParams(location.search);
  const forceDemo = q.has("demo") || location.protocol === "file:";
  if (!forceDemo) {
    try {
      const r = await fetch("/api/health", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (r.ok) {
        const j = await r.json();
        if (j.app === "pilot") {
          mode = "live";
          return { mode, auth: j.auth, live: j };
        }
      }
    } catch {}
  }
  mode = "demo";
  let initial = {};
  try {
    initial = JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {}
  const store = memoryStore(initial, (d) => {
    try {
      localStorage.setItem(LS, JSON.stringify(d));
    } catch {}
  });
  svc = createService({ store, source: demoSource(store), demo: true });
  return { mode, auth: true };
}

export const isDemo = () => mode === "demo";

export function resetDemo() {
  try {
    localStorage.removeItem(LS);
  } catch {}
  location.reload();
}

const VIEWS = new Set(["dashboard", "campaigns", "creatives", "autopilot", "market", "learning", "settingsView"]);

export async function call(name, args) {
  if (mode === "demo") {
    if (name === "login" || name === "logout") return { ok: true };
    if (!svc[name]) throw new Error("Няма такава команда");
    try {
      return await svc[name](args);
    } catch (e) {
      throw Object.assign(new Error(e.message || "Грешка"), { status: e.status || 500, details: e.details });
    }
  }
  const isView = VIEWS.has(name);
  const url = isView ? `/api/view/${name}${args ? `?${new URLSearchParams(typeof args === "object" ? args : { range: args })}` : ""}` : `/api/do/${name}`;
  const r = await fetch(url, {
    method: isView ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: isView ? undefined : JSON.stringify({ args: args ?? null }),
  });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent("pilot:auth"));
    throw Object.assign(new Error("Влез отново."), { status: 401 });
  }
  if (!r.ok) throw Object.assign(new Error(j?.message || "Нещо се обърка. Опитай пак."), { status: r.status, details: j?.details });
  return j;
}
