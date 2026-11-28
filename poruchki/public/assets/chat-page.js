// Чат на сайта: разговорите с автоматичния асистент, предадените на човек случаи и настройките по магазин.
import { api, esc, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("chat");
const state = { tab: new URLSearchParams(location.search).get("tab") || "human", shop: "", shops: [] };
const LANGS = { sk: "словашки", hu: "унгарски", sl: "словенски", bg: "български" };
const STATUS = { bot: ["асистентът", "new"], human: ["чака човек", "returned"], done: ["приключен", "delivered"] };

function since(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return m < 1 ? "току-що" : `преди ${m} мин`;
  const h = Math.floor(m / 60);
  return h < 24 ? `преди ${h} ч` : `преди ${Math.floor(h / 24)} д`;
}
const who = { u: "Клиентът", a: "Асистентът", h: "Екипът" };

function card(c) {
  const [st, cls] = STATUS[c.status] || [c.status, "archived"];
  const last = c.last ? `${who[c.last.r] || ""}: ${c.last.t}` : "";
  return `<article class="lead chatrow" data-id="${c.id}" tabindex="0" role="button" aria-label="Отвори разговора">
    <div class="lead-main">
      <div class="row spread"><b>${esc(c.name || c.phone || c.email || "Без име")}${c.unseen ? ` <span class="pill known">ново</span>` : ""}</b><span class="badge ${cls}">${st}</span></div>
      ${c.case_summary ? `<div><b>${esc(c.kind_bg || "Случай")}:</b> ${esc(c.case_summary)}</div>` : ""}
      ${c.phone || c.email ? `<div>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}${c.email ? `${c.phone ? " · " : ""}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</div>` : ""}
      <div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(last.slice(0, 160))}</div>
      <div class="muted small">${esc(c.shop_label)} · ${c.count} съобщения · ${since(c.last_at)} (${when(c.last_at)})</div>
    </div>
  </article>`;
}

async function load() {
  const d = await api(`/api/chat/list?tab=${state.tab}&shop=${encodeURIComponent(state.shop)}`);
  state.shops = d.shops;
  const sel = $("shop");
  if (sel.options.length === 1) for (const s of d.shops) sel.insertAdjacentHTML("beforeend", `<option value="${esc(s.id)}">${esc(s.label)}</option>`);
  for (const b of $("tabs").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.tab === state.tab);
    b.querySelector(".n").textContent = d.counts[b.dataset.tab] ?? "";
  }
  $("list").innerHTML = d.chats.length
    ? d.chats.map(card).join("")
    : `<p class="muted" style="padding:12px 4px">${state.tab === "human" ? "Няма случаи, които чакат човек." : "Още няма разговори."}</p>`;
  $("shops").innerHTML = `<table class="otbl shopsTbl"><thead><tr><th>Магазин</th><th>Чат</th><th></th></tr></thead><tbody>${d.shops
    .map(
      (s) => `<tr><td><b>${esc(s.label)}</b><div class="sub">${esc(s.domain)}</div></td>
        <td>${s.enabled ? `<span class="badge delivered">включен</span>` : `<span class="muted">изключен</span>`}</td>
        <td style="text-align:right"><button class="btn sm" data-set="${esc(s.id)}">Настройки</button></td></tr>`,
    )
    .join("")}</tbody></table>`;
}

const bubble = (m) => {
  const side = m.r === "u" ? "u" : m.r === "h" ? "h" : "a";
  const orig = m.o ? `<div class="corig">Ти написа: ${esc(m.o).replace(/\n/g, "<br>")}</div>` : "";
  return `<div class="cmsg ${side}"><div class="cwho">${who[m.r] || ""} · ${when(m.at)}</div><div class="ctext">${esc(m.t).replace(/\n/g, "<br>")}</div>${orig}</div>`;
};

async function openChat(id) {
  const { chat: c } = await api(`/api/chat/c/${id}`);
  const d = $("dlg");
  const [st, cls] = STATUS[c.status] || [c.status, "archived"];
  d.innerHTML = `<div class="mh"><div><h2>${esc(c.name || c.phone || c.email || "Разговор")}</h2>
      <div class="muted small">${esc(c.shop_label)} · <span class="badge ${cls}">${st}</span> · започнат ${when(c.first_at)}${c.page ? ` · страница ${esc(c.page)}` : ""}${c.country ? ` · ${esc(c.country)}` : ""}</div></div>
      <button class="iconbtn" data-x aria-label="Затвори">✕</button></div>
    <div class="mb">
      ${c.case_summary ? `<div class="note"><b>${esc(c.kind_bg || "Случай")}:</b> ${esc(c.case_summary)}</div>` : ""}
      ${c.phone || c.email ? `<div>${c.phone ? `📞 <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}${c.email ? ` ✉ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</div>` : ""}
      <div class="cthread" id="thread">${(c.messages || []).map(bubble).join("")}</div>
      <label>Отговор до клиента<textarea id="ans" rows="3" maxlength="1000" style="width:100%;font:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--surface)" placeholder="${c.lang && c.lang !== "bg" ? "Пиши на български – ще се преведе" : "Напиши отговора…"}"></textarea></label>
      ${c.lang && c.lang !== "bg" ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--text)"><input type="checkbox" id="tr" checked> Преведи автоматично на ${LANGS[c.lang] || c.lang}</label>` : ""}
      <div class="muted small">Отговорът се появява в балончето, ако клиентът още е на страницата. Иначе му се обади или пиши на телефона/имейла по-горе.</div>
      <p class="err small" id="cErr"></p>
    </div>
    <div class="mf">
      ${c.status !== "done" ? `<button class="btn" data-st="done">✓ Приключено</button>` : ""}
      ${c.status !== "bot" ? `<button class="btn" data-st="bot">Върни на асистента</button>` : `<button class="btn" data-st="human">Чака човек</button>`}
      <button class="btn primary" id="send">Изпрати отговор</button>
    </div>`;
  if (!d.open) d.showModal();
  const t = $("thread");
  t.scrollTop = t.scrollHeight;
  d.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => d.close()));
  d.querySelectorAll("[data-st]").forEach(
    (b) =>
      (b.onclick = async () => {
        await api(`/api/chat/c/${c.id}/status`, { method: "POST", body: { status: b.dataset.st } });
        d.close();
        await load();
      }),
  );
  $("send").onclick = async () => {
    const text = $("ans").value.trim();
    if (!text) return;
    $("send").disabled = true;
    try {
      await api(`/api/chat/c/${c.id}/reply`, { method: "POST", body: { text, translate: $("tr") ? $("tr").checked : true } });
      await openChat(c.id);
      await load();
    } catch (e) {
      $("cErr").textContent = e.message || "Не стана. Опитай пак.";
      $("send").disabled = false;
    }
  };
  load().catch(() => null);
}

async function openSettings(shopId) {
  const { shop, settings: s } = await api(`/api/chat/settings/${encodeURIComponent(shopId)}`);
  const d = $("dlg");
  const line = `<script src="${location.origin}/chat.js" data-shop="${shop.id}" defer></script>`;
  const admin = me.role === "admin";
  d.innerHTML = `<div class="mh"><div><h2>Чат – ${esc(shop.label)}</h2><div class="muted small">${esc(shop.domain)}</div></div><button class="iconbtn" data-x aria-label="Затвори">✕</button></div>
    <form class="mb" id="setForm">
      <label style="display:flex;gap:8px;align-items:center;font-size:15px;color:var(--text)"><input type="checkbox" name="enabled" ${s.enabled ? "checked" : ""}> Чатът е включен на сайта</label>
      <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr">
        <label>Език на асистента<select name="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === s.lang ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Заглавие в балончето<input type="text" name="title" maxlength="40" value="${esc(s.title)}"></label>
        <label>Имейл за връзка<input type="text" name="email" maxlength="120" value="${esc(s.email)}"></label>
        <label>Цвят<input type="color" name="color" value="${esc(s.color)}"></label>
      </div>
      <label>Първо съобщение (празно = стандартното: „Som automatický asistent…“)<input type="text" name="greeting" maxlength="300" value="${esc(s.greeting)}"></label>
      <label>Информация за магазина – асистентът отговаря само от нея (продукти, цени, оферти, доставка, плащане, гаранция). Смени я, когато смениш офертите.
        <textarea name="knowledge" rows="14" maxlength="12000" style="width:100%;font:13px/1.45 ui-monospace,Menlo,monospace;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--surface)">${esc(s.knowledge)}</textarea></label>
      <div><b>Редът за сайта</b><div class="muted small">ConvertBuilder → сайтът → там, където е редът на OrderDesk (c.js) → постави този ред под него и публикувай.</div>
        <div class="row" style="margin-top:6px"><code style="word-break:break-all">${esc(line)}</code><button class="btn sm" type="button" id="copyLine">Копирай</button></div></div>
      <p class="err small" id="setErr"></p>
    </form>
    <div class="mf"><button class="btn mfleft" type="button" id="tryIt">Пробвай тук</button><button class="btn" data-x>Затвори</button>${admin ? `<button class="btn primary" id="saveSet">Запази</button>` : ""}</div>`;
  if (!d.open) d.showModal();
  d.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => d.close()));
  $("copyLine").onclick = async () => {
    try {
      await navigator.clipboard.writeText(line);
      $("copyLine").textContent = "Копирано ✓";
    } catch {
      $("copyLine").textContent = "Маркирай и копирай";
    }
  };
  $("tryIt").onclick = () => {
    d.close();
    tryChat(shop.id);
  };
  if (admin)
    $("saveSet").onclick = async () => {
      const f = $("setForm");
      try {
        await api(`/api/chat/settings/${encodeURIComponent(shop.id)}`, {
          method: "POST",
          body: { enabled: f.enabled.checked, lang: f.lang.value, title: f.title.value, email: f.email.value, color: f.color.value, greeting: f.greeting.value, knowledge: f.knowledge.value },
        });
        d.close();
        await load();
      } catch (e) {
        $("setErr").textContent = e.message || "Не стана. Опитай пак.";
      }
    };
}

/** Пробата: същото балонче като на сайта, тук в OrderDesk (сървърът го пуска само за влязъл човек от фирмата). */
function tryChat(shopId) {
  document.querySelector("[data-od-chat]")?.remove();
  window.__odChat = false;
  const s = document.createElement("script");
  s.src = `/chat.js?v=${Date.now()}`;
  s.dataset.shop = shopId;
  s.dataset.preview = "1";
  s.onload = () => setTimeout(() => document.querySelector("[data-od-chat]")?.shadowRoot?.querySelector(".lnch")?.click(), 400);
  document.body.appendChild(s);
}

$("tabs").onclick = (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  state.tab = b.dataset.tab;
  load();
};
$("shop").onchange = (e) => {
  state.shop = e.target.value;
  load();
};
$("reload").onclick = () => load();
$("list").onclick = (e) => {
  const r = e.target.closest(".chatrow");
  if (r && !e.target.closest("a")) openChat(r.dataset.id);
};
$("list").onkeydown = (e) => {
  const r = e.target.closest(".chatrow");
  if (r && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openChat(r.dataset.id);
  }
};
$("shops").onclick = (e) => {
  const b = e.target.closest("[data-set]");
  if (b) openSettings(b.dataset.set);
};
await load();
// Линкът от Telegram (/chat/?c=<номер>) отваря разговора направо.
const openId = new URLSearchParams(location.search).get("c");
if (openId && /^\d+$/.test(openId)) openChat(openId).catch(() => null);
setInterval(() => !document.hidden && !$("dlg").open && load().catch(() => null), 30000);
