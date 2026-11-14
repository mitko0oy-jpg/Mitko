import { html, icon, eur, pct, sparkline, signPct, shortDate, int } from "../ui.js";
import { regimeTone } from "./common.js";

const KIND = { holiday: ["Празник", "muted"], shopping: ["Пазаруване", "honey"], gifting: ["Подаръци", "violet"], payday: ["Пенсии", "good"], auction: ["Аукцион", "warn"], deadline: ["Срок", "info"], custom: ["Свое", "info"] };
const ANGLE = { pain: "Болка → облекчение", natural: "Природа", science: "Наука", social: "Отзиви", offer: "Оферта", compare: "Сравнение", fear: "Страх от операция", lifestyle: "Активен живот", story: "История", gift: "Подарък", expert: "Специалист", routine: "Ритуал" };

function metricRow(label, m, invert = false) {
  if (!m || !Number.isFinite(m.change)) return "";
  const good = invert ? m.change <= 0 : m.change >= 0;
  return html`<div class="row between small"><span class="muted">${label}</span><span class="${Math.abs(m.change) < 0.05 ? "faint" : good ? "up" : "down"}">${signPct(m.change)}</span></div>`;
}

export default {
  range: false,
  async render({ call }) {
    const d = await call("market");
    return html`
      ${d.diagnosis.length ? html`<div class="stack" style="gap:8px;margin-bottom:16px">${d.diagnosis.map((x) => html`<div class="banner ${x.kind === "tracking" || x.kind === "site" ? "bad" : ""}">${icon("alert")}<div><b>Причината е ${x.title.toLowerCase()}:</b> ${x.text}</div></div>`)}</div>` : ""}
      <div class="grid g2">${d.countries.map((c) => {
        const s = c.series;
        return html`<section class="card">
          <div class="card-h"><h2>${c.flag} ${c.name}</h2><span class="pill ${regimeTone(c.tone)}">${c.label}</span></div>
          <p class="small" style="margin:-6px 0 10px">${c.text} <span class="muted">Позиция: <b>${c.posture}</b>${c.mult !== 1 ? ` (бюджети ×${c.mult})` : ""}.</span></p>
          ${c.reasons.length ? html`<div class="chip-row" style="margin-bottom:10px">${c.reasons.map((r) => html`<span class="pill">${r}</span>`)}</div>` : ""}
          <div class="grid g2" style="gap:12px">
            <div><div class="tiny muted">CPM (цена за 1000 показвания)</div>${sparkline(s.map((x) => x.cpm), { w: 220, h: 40, color: "var(--chart-1)" })}</div>
            <div><div class="tiny muted">Поръчки на 1000 показвания</div>${sparkline(s.map((x) => x.opm), { w: 220, h: 40, color: "var(--chart-3)" })}</div>
            <div><div class="tiny muted">Новинарски шум (внимание)</div>${sparkline(s.map((x) => x.attention), { w: 220, h: 40, color: "var(--chart-4)" })}</div>
            <div><div class="tiny muted">Интерес в Google (${c.keywords.slice(0, 2).join(", ")})</div>${sparkline(s.map((x) => x.trend), { w: 220, h: 40, color: "var(--chart-2)" })}</div>
          </div>
          <div class="sep"></div>
          <div class="grid g2" style="gap:4px 18px">${metricRow("CPM", c.metrics.cpm, true)}${metricRow("CTR", c.metrics.ctr)}${metricRow("Поръчки/1000 показв.", c.metrics.opm)}${metricRow("Конверсия на сайта", c.metrics.cvr)}${metricRow("Цена на поръчка", c.metrics.cpo, true)}${metricRow("Интерес в Google", c.metrics.trend)}</div>
          ${c.changePoint ? html`<p class="tiny muted" style="margin:10px 0 0">${icon("bolt")} Промяна в режима от ${shortDate(c.changePoint.date)} (${c.changePoint.dir === "up" ? "нагоре" : "надолу"}) – открита с CUSUM.</p>` : ""}
          ${c.headlines.length ? html`<div class="sep"></div><div class="stack" style="gap:6px">${c.headlines.map((h) => html`<div class="row small" style="gap:8px">${icon("news")}<span class="grow">${h.title}</span><span class="faint">${shortDate(h.when)}</span></div>`)}</div>` : ""}
        </section>`;
      })}</div>

      <div class="grid g2" style="margin-top:16px">
        <section class="card">
          <div class="card-h"><h2>${icon("calendar")} Календар</h2><span class="hint">Следващите 45 дни</span></div>
          <div class="list">${d.calendar.slice(0, 18).map((e) => html`<div class="item" style="padding:8px 0"><div class="body"><div class="t small">${shortDate(e.date)} · ${e.country} · ${e.name}</div></div><span class="pill ${(KIND[e.kind] || [])[1]}">${(KIND[e.kind] || [e.kind])[0]}</span><span class="small ${e.effect > 0 ? "up" : e.effect < 0 ? "down" : "faint"}" style="min-width:42px;text-align:right">${e.effect ? signPct(e.effect) : ""}</span></div>`)}</div>
          <p class="tiny faint">Ефектите са начални предположения. След 2–3 месеца пилотът ги заменя с измерените от твоите поръчки.</p>
        </section>
        <section class="card">
          <div class="card-h"><h2>${icon("shield")} Проследяване</h2><span class="hint">Мета ↔ реални поръчки</span></div>
          <div class="list">${d.tracking.map((t) => html`<div class="item"><div class="ic ${t.problem ? "bad" : "good"}">${icon(t.problem ? "alert" : "check")}</div><div class="body"><div class="t">${t.name}</div><div class="r">${t.text}</div></div><div class="small muted" style="text-align:right">Мета ${signPct(t.metaChange)}<br>Магазин ${signPct(t.realChange)}</div></div>`)}</div>
        </section>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>${icon("users")} Конкуренция</h2><span class="hint">Библиотека с реклами на Мета (в ЕС – всички реклами, с обхват)</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Страница</th><th>Активни</th><th>Нови за 7 дни</th><th>Победители</th><th>Сигнал</th><th>Най-силна реклама</th></tr></thead><tbody>
        ${d.competitors.map((c) => {
          const top = c.ads[0];
          return html`<tr><td>${c.flag} <b class="strong">${c.name}</b></td><td>${c.active}</td><td>${c.new7}</td><td>${c.winners}</td>
            <td>${c.burst ? html`<span class="pill bad">${icon("flame")} вълна от нови реклами</span>` : c.winners ? html`<span class="pill honey">има победител</span>` : html`<span class="faint">спокойно</span>`}</td>
            <td class="l small" style="white-space:normal;min-width:260px">${top ? html`„${top.text}“ <span class="faint">· ${ANGLE[top.angle] || top.angle} · ${top.days} дни · ${int(top.reach)} обхват${top.offer ? ` · ${top.offer}` : ""}</span>` : ""}</td></tr>`;
        })}
        </tbody></table></div>
        <p class="tiny faint">Победител = активна 21+ дни, с 3+ варианта, голям обхват или в няколко държави. Пилотът не копира – прави оригинален бриф по същия ъгъл. При вълна от нови реклами на конкурент: 3–5 контра-креатива до 72 ч, без да режеш цената.</p>
      </section>`;
  },
};
