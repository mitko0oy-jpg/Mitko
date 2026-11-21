// Shops of the company, like Middleware: list, add a ConvertBuilder shop with its API key, edit, switch off, sync.
import { api, COURIER, esc, num, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
const me = await shell("magazini");
const isAdmin = me.role === "admin";
let shops = [];
let tab = "on";

const ICON = {
  orders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.2"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>`,
  off: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>`,
  kasa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7h13v9H3zM16 10h3l2 3v3h-5"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></svg>`,
};
const since = (iso) => {
  if (!iso) return "–";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d < 1 ? "днес" : d < 365 ? `преди ${d}д` : `преди ${Math.floor(d / 365)}г ${d % 365}д`;
};

function render() {
  const q = $("q").value.trim().toLowerCase();
  const on = shops.filter((s) => s.active);
  const off = shops.filter((s) => !s.active);
  $("nOn").textContent = num(on.length);
  $("nOff").textContent = num(off.length);
  $("count").textContent = `${num(shops.length)} магазина`;
  for (const b of $("tabs").querySelectorAll("button")) b.classList.toggle("on", b.dataset.tab === tab);
  const list = (tab === "on" ? on : off).filter((s) => !q || `${s.label} ${s.domain}`.toLowerCase().includes(q));
  if (!list.length) {
    $("table").innerHTML = `<tbody><tr><td class="empty">${tab === "on" ? `Няма магазини. ${isAdmin ? "Добави първия с бутона „+“." : ""}` : "Няма спрени магазини."}</td></tr></tbody>`;
    return;
  }
  $("table").innerHTML = `<thead><tr><th>Име</th><th>Статус</th><th>Платформа</th><th>Куриер</th><th>Връзка</th><th class="r">Поръчки</th><th>Създаден</th><th>Бележка</th><th></th></tr></thead><tbody>${list
    .map(
      (s) => `<tr>
      <td><div class="shopcell"><span class="shoplogo" aria-hidden="true">${esc(s.label.slice(0, 1).toUpperCase())}</span><div><b>${esc(s.label)}</b><div><a href="https://${esc(s.domain)}" target="_blank" rel="noopener">${esc(s.domain)}</a></div></div></div></td>
      <td><span class="statepill ${s.active ? "ok" : "off"}">${s.active ? "Активен" : "Спрян"}</span></td>
      <td><span class="platform">ConvertBuilder</span>${s.source === "netlify" ? `<div class="sub">ключ в Netlify</div>` : s.source === "none" ? `<div class="sub err">без ключ</div>` : ""}</td>
      <td>${s.couriers.length ? s.couriers.map((c) => `<div>${esc(COURIER[c] || c)}</div>`).join("") : `<span class="sub">няма свързан</span>`}</td>
      <td>${s.error ? `<span class="bad" title="${esc(s.error)}">✕</span>` : s.syncedAt ? `<span class="okmark" title="Последно изтегляне: ${esc(when(s.syncedAt))}">✓</span>` : `<span class="sub">още не</span>`}</td>
      <td class="r"><a href="/poruchki/?tab=&shop=${encodeURIComponent(s.id)}">${num(s.orders)}</a>${s.lastOrder ? `<div class="sub">последна ${esc(since(s.lastOrder))}</div>` : ""}</td>
      <td>${esc(since(s.createdAt))}<div class="sub">${esc(when(s.createdAt))}</div></td>
      <td class="c-note">${esc(s.note || "")}</td>
      <td class="acts"><div class="actsin">
        <a class="iconbtn" title="Поръчките на магазина" aria-label="Поръчките на магазина" href="/poruchki/?tab=&shop=${encodeURIComponent(s.id)}">${ICON.orders}</a>
        <button class="iconbtn" title="Изтегли поръчките сега" aria-label="Изтегли поръчките сега" data-sync="${esc(s.id)}">${ICON.sync}</button>
        <button class="iconbtn" title="Чекаут настройки – офисите на Еконт и Спиди в касата" aria-label="Чекаут настройки" data-kasa="${esc(s.id)}">${ICON.kasa}</button>
        ${isAdmin ? `<button class="iconbtn" title="Редактирай" aria-label="Редактирай" data-edit="${esc(s.id)}">${ICON.edit}</button>
        <button class="iconbtn ${s.active ? "warnbtn" : ""}" title="${s.active ? "Спри магазина" : "Пусни магазина"}" aria-label="${s.active ? "Спри магазина" : "Пусни магазина"}" data-toggle="${esc(s.id)}">${ICON.off}</button>` : ""}
      </div></td>
    </tr>`,
    )
    .join("")}</tbody>`;
}

async function load() {
  try {
    shops = (await api("/api/shops")).shops;
    render();
  } catch (e) {
    $("table").innerHTML = `<tbody><tr><td class="err">${esc(e.message)}</td></tr></tbody>`;
  }
}

function dialog(shop) {
  const d = $("dlg");
  const edit = Boolean(shop);
  d.innerHTML = `<form method="dialog" class="mh"><h2>${edit ? `Магазин ${esc(shop.label)}` : "Нов магазин"}</h2><button class="iconbtn" value="close" aria-label="Затвори">✕</button></form>
    <form class="mb" id="shopForm">
      <label>Платформа<select disabled><option>ConvertBuilder</option></select></label>
      <label>Име на магазина<input type="text" name="label" required maxlength="80" value="${esc(shop?.label || "")}" placeholder="напр. BeeVenom"></label>
      <label>Сайт<input type="text" name="domain" ${edit ? "disabled" : "required"} value="${esc(shop?.domain || "")}" placeholder="напр. mojmagazin.bg"></label>
      ${
        shop?.source === "netlify"
          ? `<p class="muted small">Ключът на този магазин е в настройките на Netlify.</p>`
          : `<label>API ключ от ConvertBuilder${edit ? " (само ако искаш да го смениш)" : ""}<input type="password" name="key" autocomplete="off" ${edit ? "" : "required"} placeholder="сайтът → Website Settings → Applications → API Key"></label>`
      }
      <div class="grid2">
        <label>Пазар<select name="region"><option value="bg">България</option><option value="abroad" ${shop?.region === "abroad" ? "selected" : ""}>Чужбина (само за информация)</option></select></label>
        <label>Валута<input type="text" name="currency" maxlength="3" value="${esc(shop?.currency || "EUR")}"></label>
      </div>
      <label>Бележка<input type="text" name="note" maxlength="300" value="${esc(shop?.note || "")}"></label>
      <p class="err small" id="shopErr"></p>
    </form>
    <div class="mf"><button class="btn" value="close" id="cancel">Затвори</button><button class="btn primary" id="save">${edit ? "Запази" : "Добави магазина"}</button></div>`;
  d.showModal();
  $("cancel").onclick = () => d.close();
  $("save").onclick = async () => {
    const f = $("shopForm");
    if (!f.reportValidity()) return;
    const body = { label: f.label.value, region: f.region.value, currency: f.currency.value, note: f.note.value };
    if (!edit) body.domain = f.domain.value;
    if (f.key && f.key.value.trim()) body.key = f.key.value;
    $("save").disabled = true;
    $("save").textContent = edit ? "Запазвам…" : "Проверявам ключа…";
    try {
      const r = await api(edit ? `/api/shops/${encodeURIComponent(shop.id)}` : "/api/shops", { method: "POST", body });
      shops = r.shops;
      render();
      d.close();
    } catch (e) {
      $("shopErr").textContent = e.message;
      $("save").disabled = false;
      $("save").textContent = edit ? "Запази" : "Добави магазина";
    }
  };
}

// ---------- Чекаут настройки (като в Middleware): падащото меню с офисите в касата на магазина ----------
const KIND = {
  "econt-office": { title: "Еконт – до офис", hint: "напр. „До офис на Еконт“", office: true },
  "speedy-office": { title: "Спиди – до офис", hint: "напр. „До офис на Спиди“", office: true },
  "speedy-address": { title: "Спиди – до адрес", hint: "напр. „До адрес Speedy“", office: false },
  "econt-address": { title: "Еконт – до адрес", hint: "напр. „До адрес Еконт“", office: false },
};
const tglHtml = (name, on, text) => `<label class="tgl"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span class="sw" aria-hidden="true"></span><span>${text}</span></label>`;

async function kasaDialog(id) {
  const d = $("dlg");
  d.innerHTML = `<div class="mb"><p class="muted">Зареждам…</p></div>`;
  d.showModal();
  let r;
  try {
    r = await api(`/api/kasa/${encodeURIComponent(id)}/settings`);
  } catch (e) {
    d.innerHTML = `<div class="mb"><p class="err">${esc(e.message)}</p></div><div class="mf"><button class="btn" id="kClose">Затвори</button></div>`;
    $("kClose").onclick = () => d.close();
    return;
  }
  const { shop, settings, seen } = r;
  const link = `<script src="${location.origin}/k.js" data-shop="${shop.id}" defer></script>`;
  let tab = "couriers";
  const couriers = () =>
    settings.couriers
      .map(
        (c) => `<fieldset class="card kasa-c" data-kind="${c.kind}" style="padding:12px 14px;display:grid;gap:8px">
        <div class="row" style="justify-content:space-between;gap:10px"><b>${esc(KIND[c.kind].title)}</b>${tglHtml("on", c.on, "Показвай")}</div>
        <label>Име на метода за доставка в ConvertBuilder<input type="text" name="title" maxlength="80" value="${esc(c.title)}" placeholder="празно = познава го само по името, ${esc(KIND[c.kind].hint)}"></label>
        ${KIND[c.kind].office ? tglHtml("automats", c.automats, "Покажи и автоматите (Еконтомат / АПС на Спиди)") : ""}
        <label>Допълнителен текст под избора<input type="text" name="text" maxlength="200" value="${esc(c.text)}" placeholder="напр. Пристига за 1–2 работни дни"></label>
      </fieldset>`,
      )
      .join("");
  const checkout = () => `
      <div class="card" style="padding:12px 14px;display:grid;gap:8px">
        <div class="row" style="justify-content:space-between"><b>Активация</b>${tglHtml("active", settings.active, "Активен")}</div>
      </div>
      <div class="card" style="padding:12px 14px;display:grid;gap:8px">
        <b>Линк за връзка</b>
        <div class="row" style="gap:8px;flex-wrap:nowrap"><input type="text" readonly id="kLink" value="${esc(link)}" style="flex:1;font-family:ui-monospace,monospace;font-size:12px"><button class="btn" type="button" id="kCopy">Копирай</button></div>
        <p class="small ${seen ? "" : "muted"}">${
          seen
            ? `<span class="okmark">●</span> Скриптът е открит на ${esc(shop.domain)}. Последна проверка: ${esc(when(seen.at))}${seen.page ? ` (${esc(seen.page)})` : ""}`
            : `○ Скриптът още не е открит на ${esc(shop.domain)}. Сложи реда в ConvertBuilder (Настройки на сайта → код в края на страницата) – на страниците с касата.`
        }</p>
        <p class="small muted">Касата познава методите за доставка по името им (Еконт / Спиди + офис / адрес) и при „До офис“ показва търсачка с всички офиси на куриера. Изборът се записва в полето за адрес и товарителницата отива точно до този офис. Цените на доставката остават тези от магазина в ConvertBuilder.</p>
      </div>
      <div class="card" style="padding:12px 14px;display:grid;gap:8px">
        <b>Начини на плащане</b><p class="small muted">Както са в магазина в ConvertBuilder (наложен платеж).</p>
      </div>
      <div class="card" style="padding:12px 14px;display:grid;gap:8px">
        <b>Допълнителни настройки</b>
        <label>Текст над търсачката на офисите<input type="text" id="kNote" maxlength="200" value="${esc(settings.note)}" placeholder="напр. Пратката пристига за 1–2 дни. Плащаш при получаване."></label>
      </div>`;
  const read = () => {
    for (const f of d.querySelectorAll(".kasa-c")) {
      const c = settings.couriers.find((x) => x.kind === f.dataset.kind);
      c.on = f.querySelector('[name="on"]').checked;
      c.title = f.querySelector('[name="title"]').value;
      c.text = f.querySelector('[name="text"]').value;
      const a = f.querySelector('[name="automats"]');
      c.automats = a ? a.checked : false;
    }
    const act = d.querySelector('[name="active"]');
    if (act) settings.active = act.checked;
    const note = $("kNote");
    if (note) settings.note = note.value;
  };
  const paint = () => {
    d.innerHTML = `<form method="dialog" class="mh"><h2>Чекаут настройки – ${esc(shop.label)}</h2><button class="iconbtn" value="close" aria-label="Затвори">✕</button></form>
      <div class="mb">
        <div class="tabs" role="tablist"><button type="button" data-t="couriers" class="${tab === "couriers" ? "on" : ""}">Куриери</button><button type="button" data-t="checkout" class="${tab === "checkout" ? "on" : ""}">Чекаут</button></div>
        ${tab === "couriers" ? couriers() : checkout()}
        <p class="err small" id="kErr"></p>
      </div>
      <div class="mf"><button class="btn" type="button" id="kCancel">Затвори</button>${isAdmin ? `<button class="btn primary" type="button" id="kSave">Запази</button>` : ""}</div>`;
    for (const b of d.querySelectorAll("[data-t]"))
      b.onclick = () => {
        read();
        tab = b.dataset.t;
        paint();
      };
    $("kCancel").onclick = () => d.close();
    const copy = $("kCopy");
    if (copy)
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          $("kLink").select();
          document.execCommand("copy");
        }
        copy.textContent = "Копирано ✓";
      };
    const save = $("kSave");
    if (save)
      save.onclick = async () => {
        read();
        save.disabled = true;
        save.textContent = "Запазвам…";
        try {
          const r2 = await api(`/api/kasa/${encodeURIComponent(id)}/settings`, { method: "POST", body: settings });
          Object.assign(settings, r2.settings);
          save.textContent = "Запазено ✓";
          setTimeout(() => {
            save.disabled = false;
            save.textContent = "Запази";
          }, 1500);
        } catch (e) {
          $("kErr").textContent = e.message;
          save.disabled = false;
          save.textContent = "Запази";
        }
      };
  };
  paint();
}

$("addShop").hidden = !isAdmin;
$("addShop").onclick = () => dialog(null);
$("q").oninput = render;
$("tabs").onclick = (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) ((tab = b.dataset.tab), render());
};
$("table").onclick = async (e) => {
  const sync = e.target.closest("[data-sync]");
  const edit = e.target.closest("[data-edit]");
  const tog = e.target.closest("[data-toggle]");
  const kasa = e.target.closest("[data-kasa]");
  if (kasa) return kasaDialog(kasa.dataset.kasa);
  try {
    if (sync) {
      sync.disabled = true;
      shops = (await api(`/api/shops/${encodeURIComponent(sync.dataset.sync)}/sync`, { method: "POST", body: {} })).shops;
      render();
    } else if (edit) dialog(shops.find((s) => s.id === edit.dataset.edit));
    else if (tog) {
      const s = shops.find((x) => x.id === tog.dataset.toggle);
      if (s.active && !confirm(`Да спра ли ${s.label}? Поръчките му остават, но новите няма да се теглят.`)) return;
      shops = (await api(`/api/shops/${encodeURIComponent(s.id)}`, { method: "POST", body: { active: !s.active } })).shops;
      render();
    }
  } catch (err) {
    alert(err.message);
    if (sync) sync.disabled = false;
  }
};
load();
