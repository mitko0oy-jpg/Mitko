// Small UI toolkit: safe HTML templates, number formats, icons, SVG charts.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ""));
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join("") : v == null || v === false ? "" : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
  return raw(out);
}

const fEur0 = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fEur2 = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fInt = new Intl.NumberFormat("bg-BG", { maximumFractionDigits: 0 });
const fDec = new Intl.NumberFormat("bg-BG", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const ok = (n) => Number.isFinite(n);
export const eur = (n) => (ok(n) ? (Math.abs(n) >= 1000 ? fEur0 : fEur2).format(n) : "—");
export const eur0 = (n) => (ok(n) ? fEur0.format(n) : "—");
export const int = (n) => (ok(n) ? fInt.format(n) : "—");
export const dec = (n) => (ok(n) ? fDec.format(n) : "—");
export const pct = (n, d = 0) => (ok(n) ? `${(n * 100).toFixed(d).replace(".", ",")}%` : "—");
export const x2 = (n) => (ok(n) ? n.toFixed(2).replace(".", ",") : "—");
export const signPct = (n) => (ok(n) ? `${n > 0 ? "+" : ""}${Math.round(n * 100)}%` : "—");
export const delta = (cur, prev, goodUp = true) => {
  if (!ok(cur) || !ok(prev) || prev === 0) return html`<span class="faint">—</span>`;
  const d = cur / prev - 1;
  if (Math.abs(d) < 0.005) return html`<span class="faint">без промяна</span>`;
  const good = goodUp ? d >= 0 : d <= 0;
  return html`<span class="${good ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(d * 100))}%</span> <span class="faint vs">спрямо преди</span>`;
};
export const dayLabel = (s) => {
  const d = new Date(s + "T12:00:00Z");
  return `${s.slice(8, 10)}.${s.slice(5, 7)} ${["нд", "пн", "вт", "ср", "чт", "пт", "сб"][d.getUTCDay()]}`;
};
export const shortDate = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : "");
export const ago = (iso) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "току-що";
  if (m < 60) return `преди ${m} мин`;
  const h = Math.round(m / 60);
  if (h < 24) return `преди ${h} ч`;
  return `преди ${Math.round(h / 24)} дни`;
};

export const TONE = { good: "good", ok: "honey", low: "warn", loss: "bad", none: "muted" };
export const STATE_LABEL = { good: "Над целта", ok: "В коридора", low: "Под минимума", loss: "На загуба", none: "Няма данни" };

// --- icons (simple 24px strokes) -------------------------------------------
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  pilot: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1Z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  play: '<path d="M7 5v14l11-7L7 5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  bolt: '<path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  wand: '<path d="m4 20 11-11M14 4l1.5 3L19 8.5 15.5 10 14 13l-1.5-3L9 8.5 12.5 7 14 4Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  flame: '<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-5.5 1-7.5Z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/>',
  news: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h10M7 16h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevd: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
};
export const icon = (name, cls = "") => raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`);

export const logo = () => raw(`<svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5L20 2.5Z" fill="var(--honey)"/><path d="M12 25.5 18 19l4 4 7-8" fill="none" stroke="#2B1D00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24.5 15H29v4.5" fill="none" stroke="#2B1D00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

// --- charts ------------------------------------------------------------------
const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};

// Bars (spend, net) per day + margin line with the target band.
export function profitChart(series, econ, { height = 230, width = 760, font = 10.5 } = {}) {
  const W = width, H = height, pl = 40, pr = 34, pt = 12, pb = 26;
  const n = series.length;
  if (!n) return raw('<div class="empty">Няма данни</div>');
  const maxV = niceMax(Math.max(...series.map((d) => Math.max(d.net || 0, d.spend || 0))));
  const iw = W - pl - pr, ih = H - pt - pb;
  const bw = iw / n;
  const y = (v) => pt + ih - (v / maxV) * ih;
  const pMin = -0.2, pMax = 0.6;
  const yp = (p) => pt + ih - ((Math.max(pMin, Math.min(pMax, p)) - pMin) / (pMax - pMin)) * ih;
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i, yy = y(v);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="var(--chart-grid)"/><text x="${pl - 6}" y="${yy + 4}" text-anchor="end" font-size="${font}" fill="var(--faint)">${Math.round(v)}</text>`;
  }
  const f = econ?.floor ?? 0.25, t = econ?.target ?? 0.3;
  g += `<rect x="${pl}" width="${iw}" y="${yp(t + 0.0001)}" height="${Math.max(1, yp(f) - yp(t))}" fill="var(--good)" opacity=".1"/>`;
  g += `<line x1="${pl}" x2="${W - pr}" y1="${yp(f)}" y2="${yp(f)}" stroke="var(--good)" stroke-dasharray="4 4" opacity=".7"/>`;
  g += `<text x="${W - pr + 4}" y="${yp(f) + 4}" font-size="${font}" fill="var(--good)">${Math.round(f * 100)}%</text><text x="${W - pr + 4}" y="${yp(t) - 2}" font-size="${font}" fill="var(--good)">${Math.round(t * 100)}%</text>`;
  let bars = "", line = "", dots = "", labels = "";
  series.forEach((d, i) => {
    const x = pl + i * bw;
    const w = Math.max(2, bw * 0.34);
    bars += `<rect x="${x + bw * 0.14}" y="${y(d.net || 0)}" width="${w}" height="${Math.max(0, pt + ih - y(d.net || 0))}" rx="2.5" fill="var(--chart-2)" opacity=".85"><title>${d.date}: нетен оборот ${Math.round(d.net)} €</title></rect>`;
    bars += `<rect x="${x + bw * 0.14 + w + 2}" y="${y(d.spend || 0)}" width="${w}" height="${Math.max(0, pt + ih - y(d.spend || 0))}" rx="2.5" fill="var(--chart-1)"><title>${d.date}: реклама ${Math.round(d.spend)} €</title></rect>`;
    if (Number.isFinite(d.cmPct)) {
      const cx = x + bw / 2, cy = yp(d.cmPct);
      line += `${line ? "L" : "M"}${cx.toFixed(1)},${cy.toFixed(1)}`;
      dots += `<circle cx="${cx}" cy="${cy}" r="3" fill="var(--panel)" stroke="var(--chart-3)" stroke-width="2"><title>${d.date}: марж ${Math.round(d.cmPct * 100)}%</title></circle>`;
    }
    if (i % Math.max(1, Math.ceil(n / (W < 500 ? 5 : 14))) === 0) labels += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="${font}" fill="var(--faint)">${d.date.slice(8, 10)}.${d.date.slice(5, 7)}</text>`;
  });
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Разход, оборот и марж по дни">${g}${bars}<path d="${line}" fill="none" stroke="var(--chart-3)" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}</svg>`);
}

export function sparkline(values, { w = 120, h = 32, color = "var(--chart-2)", fill = true, mark = null } = {}) {
  const v = values.map((x) => (Number.isFinite(x) ? x : null));
  const nums = v.filter((x) => x != null);
  if (nums.length < 2) return raw(`<svg width="${w}" height="${h}"></svg>`);
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const pts = v.map((x, i) => (x == null ? null : [(i / (v.length - 1)) * (w - 4) + 2, h - 3 - ((x - min) / span) * (h - 6)]));
  const d = pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const last = pts.filter(Boolean).pop();
  const area = fill ? `<path d="${d}L${last[0]},${h}L${pts.find(Boolean)[0]},${h}Z" fill="${color}" opacity=".1"/>` : "";
  const markX = mark != null ? `<line x1="${((mark) / (v.length - 1)) * (w - 4) + 2}" x2="${((mark) / (v.length - 1)) * (w - 4) + 2}" y1="0" y2="${h}" stroke="var(--faint)" stroke-dasharray="2 2"/>` : "";
  return raw(`<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${markX}${area}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/></svg>`);
}

export function marginBand(cmPct, econ) {
  const lo = -0.1, hi = 0.6;
  const pos = (p) => ((Math.max(lo, Math.min(hi, p)) - lo) / (hi - lo)) * 100;
  const f = econ.floor, t = econ.target;
  return html`<div class="band" style="background:linear-gradient(90deg,var(--bad-soft) 0%,var(--bad-soft) ${pos(0)}%,var(--warn-soft) ${pos(0)}%,var(--warn-soft) ${pos(f)}%,var(--good-soft) ${pos(f)}%,var(--good-soft) 100%)">
    <div class="zone" style="left:${pos(f)}%;width:${pos(t) - pos(f)}%"></div>
    ${Number.isFinite(cmPct) ? html`<div class="mark" style="left:${pos(cmPct)}%"></div>` : ""}
  </div>
  <div class="band-legend"><span>загуба</span><span>цел ${Math.round(f * 100)}–${Math.round(t * 100)}%</span><span>60%</span></div>`;
}

export function meter(score, invert = false) {
  const s = Math.max(0, Math.min(100, score || 0));
  const tone = invert ? (s >= 65 ? "bad" : s >= 38 ? "warn" : "") : s < 40 ? "bad" : s < 65 ? "warn" : "";
  return html`<div class="meter ${tone}"><i style="width:${s}%"></i></div>`;
}

// Deterministic gradient "thumbnail" for creatives without media.
const GRADS = [["#F2A93B", "#D9622B"], ["#3A7BD5", "#00D2FF"], ["#16936A", "#7ED6A7"], ["#7A57D1", "#C59BF2"], ["#D2433F", "#F79C7A"], ["#1F2A44", "#4B6CB7"], ["#C9741A", "#F6C453"], ["#0F766E", "#5EEAD4"]];
export function thumbStyle(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = GRADS[h % GRADS.length];
  return `background:linear-gradient(135deg,${a},${b})`;
}

// --- toast & modal -----------------------------------------------------------
let toastT;
export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("on"), 2600);
}

export function modal(content, onMount) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${content}</div>`;
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => {
    if (e.target === bg || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", function k(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", k);
    }
  });
  document.body.appendChild(bg);
  onMount?.(bg.querySelector(".modal"), close);
  return close;
}

// In-page confirmation (native confirm() is blocked in embedded viewers).
export function ask(message, { ok = "Да", cancel = "Откажи", tone = "primary" } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const close = modal(`<p class="strong" style="margin:0 0 16px;font-size:15px">${esc(message)}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" id="askNo">${esc(cancel)}</button><button class="btn ${tone}" id="askYes">${esc(ok)}</button></div>`, (m, c) => {
      m.querySelector("#askYes").addEventListener("click", () => { finish(true); c(); });
      m.querySelector("#askNo").addEventListener("click", () => { finish(false); c(); });
      m.querySelector("#askYes").focus();
    });
    const obs = new MutationObserver(() => { if (!document.querySelector(".modal-bg")) { obs.disconnect(); finish(false); } });
    obs.observe(document.body, { childList: true });
  });
}
