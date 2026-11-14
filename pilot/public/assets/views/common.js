import { html, icon, eur, pct, toast } from "../ui.js";

export const KIND_ICON = { budget: ["bolt", "honey"], pause: ["pause", "warn"], activate: ["play", "good"], swap: ["refresh", "violet"], generate: ["wand", "info"], alert: ["alert", "bad"], launch: ["upload", "good"] };
export const RISK = { low: ["нисък риск", "good"], medium: ["среден риск", "honey"], high: ["иска одобрение", "warn"] };
export const STATUS = { proposed: ["чака", "info"], executed: ["изпълнено", "good"], rejected: ["отказано", "muted"], blocked: ["блокирано", "bad"], noted: ["видяно", "muted"], reverted: ["върнато", "muted"] };
export const STAGE_TONE = { learning: "info", rising: "good", peak: "good", tiring: "warn", burned: "bad", idle: "muted" };
export const STAGE_LABEL = { learning: "Учи се", rising: "Расте", peak: "Във форма", tiring: "Уморява се", burned: "Изгоряла", idle: "Без показвания" };

export function proposalItem(p, { compact = false } = {}) {
  const [ic, tone] = KIND_ICON[p.kind] || ["alert", "info"];
  const [rl, rt] = RISK[p.risk] || ["", ""];
  const [sl, st] = STATUS[p.status] || [p.status, "muted"];
  const change = p.kind === "budget" && p.from != null ? html`<span class="pill">${eur(p.from)} → <b class="strong">${eur(p.to)}</b></span>` : "";
  const canDecide = p.status === "proposed" || p.status === "blocked";
  return html`<div class="item">
    <div class="ic ${tone}">${icon(ic)}</div>
    <div class="body">
      <div class="t">${p.title}</div>
      <div class="r">${p.reason}</div>
      ${p.blockedBy ? html`<div class="r" style="color:var(--bad)">${p.blockedBy}</div>` : ""}
      ${compact ? "" : html`<div class="row" style="margin-top:6px;gap:6px">${change}<span class="pill ${rt}">${rl}</span>${p.status !== "proposed" ? html`<span class="pill ${st}">${sl}${p.by === "auto" ? " · автоматично" : p.by === "user" ? " · от теб" : ""}</span>` : ""}${p.temporary ? html`<span class="pill">временно</span>` : ""}</div>`}
    </div>
    ${canDecide && p.kind !== "alert" ? html`<div class="acts"><button class="btn sm good" data-act="approve" data-id="${p.id}" title="Одобри">${icon("check")}<span class="hide-s">${p.kind === "generate" ? "Направи" : "Одобри"}</span></button><button class="btn sm ghost" data-act="reject" data-id="${p.id}" title="Откажи">${icon("x")}</button></div>` : canDecide ? html`<div class="acts"><button class="btn xs ghost" data-act="reject" data-id="${p.id}" title="Скрий">${icon("x")}</button></div>` : ""}
  </div>`;
}

// Shared approve / reject handling.
export function bindDecisions(page, ctx) {
  page.addEventListener("click", async (e) => {
    const b = e.target.closest('[data-act="approve"],[data-act="reject"]');
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.act === "approve") {
        const r = await ctx.call("approve", b.dataset.id);
        toast(r.kind === "generate" ? "Готово – новите идеи са в Студиото" : "Изпълнено");
      } else {
        await ctx.call("reject", b.dataset.id);
        toast("Отказано");
      }
      window.dispatchEvent(new Event("pilot:changed"));
      ctx.refresh();
    } catch (err) {
      toast(err.message);
      b.disabled = false;
    }
  });
}

export const regimeTone = (t) => ({ good: "good", info: "info", warn: "warn", bad: "bad", muted: "muted" })[t] || "muted";
export const cmCell = (v, econ) => {
  if (!Number.isFinite(v)) return html`<span class="faint">—</span>`;
  const t = v >= econ.marginTarget ? "good" : v >= econ.marginFloor ? "honey" : v >= 0 ? "warn" : "bad";
  return html`<span class="pill ${t}">${pct(v)}</span>`;
};
