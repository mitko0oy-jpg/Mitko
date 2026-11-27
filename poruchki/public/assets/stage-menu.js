// A click on an order's status opens the statuses to choose from (like Middleware's status menu):
// coloured pills in a small card under the status. The choice is kept by hand until the courier reports
// something new about the parcel; „Автоматичен статус“ goes back to the courier's / shop's.
import { api, ONE } from "./app.js";

const CHOICES = ["new", "shipped", "at_office", "delivered", "returned", "canceled"];

const menu = document.createElement("div");
menu.className = "stagemenu";
menu.setAttribute("role", "menu");
menu.setAttribute("aria-label", "Смени статуса");
menu.hidden = true;
document.body.append(menu);
let anchor = null;

export function closeStageMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  anchor?.setAttribute("aria-expanded", "false");
  anchor = null;
}
document.addEventListener("click", (e) => !menu.contains(e.target) && !e.target.closest("[data-act=stage]") && closeStageMenu());
document.addEventListener("keydown", (e) => {
  if (menu.hidden) return;
  if (e.key === "Escape") {
    const a = anchor;
    closeStageMenu();
    a?.focus();
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const items = [...menu.querySelectorAll("button")];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    e.preventDefault();
  }
});
addEventListener("scroll", closeStageMenu, { passive: true });
addEventListener("resize", closeStageMenu);

/**
 * Opens the menu under the status button `btn` of order `o`; `done(order)` gets the order back after a change.
 */
export function openStageMenu(o, btn, done) {
  if (anchor === btn) return closeStageMenu();
  closeStageMenu();
  // Not the one it has now (a parcel refused at the office counts as returned, but reads „Отказана“).
  const skip = new Set([o.stage, ...(o.parcel_status === "refused" && o.stage === "returned" ? ["canceled"] : [])]);
  const items = CHOICES.filter((k) => !skip.has(k)).map(
    (k) => `<button type="button" role="menuitem" class="badge ${k}" data-stage="${k}">${ONE[k]}</button>`,
  );
  if (o.manual_stage)
    items.push(`<button type="button" role="menuitem" class="auto" data-stage="auto" title="Статусът пак идва от куриера и магазина">↺ Автоматичен статус</button>`);
  menu.innerHTML = `<span class="arrow" aria-hidden="true"></span>${items.join("")}`;
  menu.hidden = false;
  anchor = btn;
  btn.setAttribute("aria-expanded", "true");
  // Under the status, centred on it; above it if there is no room below.
  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 10 + h <= innerHeight;
  menu.style.left = `${left}px`;
  menu.style.top = `${below ? r.bottom + 10 : Math.max(8, r.top - h - 10)}px`;
  menu.classList.toggle("up", !below);
  menu.querySelector(".arrow").style.left = `${Math.max(14, Math.min(w - 14, r.left + r.width / 2 - left))}px`;
  menu.querySelectorAll("button[data-stage]").forEach(
    (b) =>
      (b.onclick = async () => {
        const stage = b.dataset.stage;
        menu.querySelectorAll("button").forEach((x) => (x.disabled = true));
        try {
          const order = await api(`/api/orders/${o.id}/stage`, { method: "POST", body: { stage } });
          closeStageMenu();
          done?.(order);
        } catch (e) {
          closeStageMenu();
          alert(e.message);
        }
      }),
  );
  menu.querySelector("button")?.focus();
}
