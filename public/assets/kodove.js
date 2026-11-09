// /kodove/ – the owner's page for the НВО тренажор codes: batches, new codes, printing stickers and PDFs, support.
import { $, api, esc, go, me, toast, topbar } from "./app.js";
import qrcode from "./vendor/qrcode.js";

const params = new URLSearchParams(location.search);
// Printed QR codes must point at the live site even when the sheets are made on a test server.
const BASE = params.get("base") || (/^(localhost|127\.)/.test(location.hostname) ? "https://edubel-app.netlify.app" : location.origin);
const HOST = BASE.replace(/^https?:\/\//, "");
const linkOf = (code) => `${BASE}/t/?k=${code}`;
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString("bg-BG") : "–");
const fmtTime = (t) => (t ? new Date(t).toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" }) : "–");

// QR code as an SVG path: sharp at any print size.
function qrSvg(text, mm) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), q = 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" style="width:${mm}mm;height:${mm}mm" role="img" aria-label="QR код"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/* ---------- printing ---------- */
function sticker(code) {
  return `<div class="stk">${qrSvg(linkOf(code), 30)}<div class="stk-t">
    <b>НВО тренажор по БЕЛ</b><span>7. клас · 200 задачи · оценки · пробна матура</span>
    <span class="go">Сканирай QR кода с камерата</span><span>или отвори <b>${esc(HOST)}/t</b></span>
    <span class="code">Код: <b>${esc(code)}</b></span><span class="small">Работи на до 3 устройства</span></div></div>`;
}
function pdfPage(code) {
  return `<section class="pdfp">
    <header><img src="/assets/logo.png" alt="Еду БЕЛ" width="86" height="62"><span>Учебен център по български език и литература</span></header>
    <h1>НВО тренажор <em>по БЕЛ</em></h1>
    <p class="sub">Подготовка за националното външно оценяване в 7. клас: 200 задачи в 10 модула, оценка след всеки модул, бележник с дати, прогноза за НВО и пробна матура с таймер.</p>
    <div class="pdf-main">${qrSvg(linkOf(code), 62)}<div>
      <p class="big">Сканирай QR кода с камерата на телефона – тренажорът се отваря веднага.</p>
      <p>Или отвори <b>${esc(HOST)}/t</b> и въведи кода:</p>
      <p class="code">${esc(code)}</p>
      <p class="small">Без регистрация и без парола. Кодът работи на до 3 устройства – телефон, таблет или компютър. Оценките се пазят към кода и те следват на всяко устройство.</p>
    </div></div>
    <h2>Как да започнеш</h2>
    <ol><li>Сканирай кода или отвори линка в <b>Chrome</b> или <b>Safari</b>.</li><li>Реши първия модул и виж оценката си – тя се записва в бележника с датата.</li><li>Следи „Прогноза за НВО“: тя показва къде ще спечелиш най-много точки.</li></ol>
    <h2>Ако нещо не става</h2>
    <ul><li><b>Отваря се във Viber или Facebook?</b> Натисни ⋮ или ··· горе вдясно и избери „Отвори в браузър“.</li>
      <li><b>Ново устройство, а местата са заети?</b> На старото устройство отвори тренажора → „Твоят достъп“ → „Премахни“. Устройство, което не е ползвано 60 дни, се освобождава само.</li>
      <li><b>Пази този документ</b> – с него отваряш тренажора навсякъде.</li></ul>
    <footer>Еду БЕЛ · edubel.site · Кодът е личен – не го публикувай.</footer></section>`;
}
function showPrint(kind, codes, title) {
  const p = $("print");
  const help = kind === "pdf"
    ? "Всяка страница е един PDF за един клиент. Натисни „Печат“ и избери „Запази като PDF“. За един клиент направи партида от 1 код."
    : kind === "single" ? "Всяка страница е един стикер 99,1 × 38,1 мм – за печатница с рязане." : "A4 листове с по 14 стикера 99,1 × 38,1 мм (2 × 7, като Avery L7163). Печатай в реален размер (100 %).";
  let body = "";
  if (kind === "sheet") for (let i = 0; i < codes.length; i += 14) body += `<div class="sheet">${codes.slice(i, i + 14).map(sticker).join("")}</div>`;
  else if (kind === "single") body = codes.map((c) => `<div class="one">${sticker(c)}</div>`).join("");
  else body = codes.map(pdfPage).join("");
  p.className = `print-${kind}`;
  p.innerHTML = `<div class="ptools"><b>${esc(title)}</b> · ${codes.length} ${codes.length === 1 ? "код" : "кода"}<p>${esc(help)}</p>
    <div class="row"><button class="btn" id="doPrint">Печат</button><button class="btn ghost" id="closePrint">Назад</button></div></div>${body}`;
  p.hidden = false;
  $("screen").hidden = true;
  window.scrollTo(0, 0);
  $("doPrint").addEventListener("click", () => window.print());
  $("closePrint").addEventListener("click", () => { p.hidden = true; p.innerHTML = ""; $("screen").hidden = false; });
}

/* ---------- the page ---------- */
let summary = null;
async function render(found) {
  summary = await api("trener/admin/summary");
  const b = summary.bank;
  let h = `<h1>Кодове за НВО тренажора</h1>
    <p class="lead">Всеки код отваря тренажора на до 3 устройства. Стикерите и PDF-ите се печатат оттук.</p>
    <div class="kstats"><div><b>${b ? b.questions : 0}</b><span>задачи в тренажора${b ? ` (от ${fmtDate(b.created_at)})` : ""}</span></div>
      <div><b>${summary.batches.reduce((s, x) => s + x.total, 0)}</b><span>кода общо</span></div>
      <div><b>${summary.batches.reduce((s, x) => s + x.used, 0)}</b><span>отворени</span></div>
      <div><b>${summary.full}</b><span>със заети 3 места</span></div></div>

    <section class="panel"><h3>Намери код</h3><p class="small muted">Когато клиент пише, въведи кода му. Можеш да освободиш устройствата му, да го спреш или да запишеш бележка (например номер на поръчка).</p>
      <form id="findForm" class="row"><input type="text" id="findIn" placeholder="XXXXX-XXXXX" autocomplete="off" aria-label="Код"><button class="btn">Търси</button></form>
      <p class="formerr" id="findErr" role="alert"></p><div id="found"></div></section>

    <section class="panel"><h3>Нови кодове</h3>
      <form id="newForm" class="newform">
        <label class="field"><span>За какво</span><select id="newKind"><option value="sheet">Стикери за кутии (A4, 14 на лист)</option><option value="single">Стикери, по един на страница</option><option value="pdf">PDF за клиент (по една страница)</option></select></label>
        <label class="field"><span>Брой</span><input type="text" inputmode="numeric" id="newCount" value="140"></label>
        <label class="field"><span>Име на партидата</span><input type="text" id="newBatch" value="стикери-${new Date().toISOString().slice(0, 10)}"></label>
        <button class="btn gold">Направи кодовете</button></form>
      <p class="small muted">140 стикера = 10 листа. Кодовете се правят веднага и после се отварят за печат.</p><p class="formerr" id="newErr" role="alert"></p></section>

    <section class="panel"><h3>Партиди</h3>`;
  if (!summary.batches.length) h += `<p class="muted">Още няма кодове.</p>`;
  else {
    h += `<div class="tblwrap"><table class="ktbl"><thead><tr><th>Партида</th><th>Общо</th><th>Отворени</th><th>Активни 7 дни</th><th>Неотворени</th><th>Спрени</th><th>Печат</th></tr></thead><tbody>`;
    for (const x of summary.batches) {
      h += `<tr><td><b>${esc(x.batch || "без име")}</b><small>${fmtDate(x.created_at)}</small></td><td>${x.total}</td><td>${x.used}</td><td>${x.active7}</td><td>${x.total - x.used}</td><td>${x.disabled}</td>
        <td class="acts"><button class="linkbtn" data-print="sheet" data-batch="${esc(x.batch)}">стикери A4</button><button class="linkbtn" data-print="single" data-batch="${esc(x.batch)}">по един</button><button class="linkbtn" data-print="pdf" data-batch="${esc(x.batch)}">PDF</button></td></tr>`;
    }
    h += `</tbody></table></div><label class="chk"><input type="checkbox" id="onlyUnused" checked> Печатай само неотворените кодове</label>`;
  }
  h += `</section>`;
  $("main").innerHTML = h;

  $("newKind").addEventListener("change", () => {
    const k = $("newKind").value;
    $("newCount").value = k === "pdf" ? "1" : k === "single" ? "50" : "140";
    $("newBatch").value = `${k === "pdf" ? "pdf" : "стикери"}-${new Date().toISOString().slice(0, 10)}`;
  });
  $("newForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const count = Number($("newCount").value);
    if (!(count >= 1 && count <= 500)) return ($("newErr").textContent = "Броят е от 1 до 500.");
    $("newErr").textContent = "";
    const kind = $("newKind").value;
    try {
      const r = await api("trener/admin/codes", { count, batch: $("newBatch").value.trim() });
      await render();
      showPrint(kind, r.codes, r.batch);
    } catch (err) {
      $("newErr").textContent = err.message;
    }
  });
  $("findForm").addEventListener("submit", (e) => { e.preventDefault(); find($("findIn").value); });
  document.querySelectorAll("[data-print]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const unused = $("onlyUnused")?.checked ? "1" : "";
      const r = await api(`trener/admin/batch?batch=${encodeURIComponent(btn.dataset.batch)}&unused=${unused}`);
      const codes = r.codes.filter((c) => !c.disabled).map((c) => c.code);
      if (!codes.length) return toast("В тази партида няма кодове за печат.");
      showPrint(btn.dataset.print, codes, btn.dataset.batch);
    }),
  );
  if (found) find(found);
}

async function find(raw, action) {
  $("findErr").textContent = "";
  try {
    const code = String(raw || "").trim();
    const r = action ? await api("trener/admin/key", { code, ...action }) : await api(`trener/admin/key?code=${encodeURIComponent(code)}`);
    const k = r.key;
    $("found").innerHTML = `<div class="kcard ${k.disabled ? "off" : ""}">
      <p class="kcode">${esc(k.code)} ${k.disabled ? `<span class="tag bad">спрян</span>` : k.firstUsed ? `<span class="tag ok">отворен</span>` : `<span class="tag">неотворен</span>`}</p>
      <dl><dt>Партида</dt><dd>${esc(k.batch || "–")}</dd><dt>Създаден</dt><dd>${fmtDate(k.createdAt)}</dd><dt>Първо отваряне</dt><dd>${fmtTime(k.firstUsed)}</dd><dt>Последно</dt><dd>${fmtTime(k.lastUsed)}</dd>
        <dt>Решени тестове</dt><dd>${k.tests}${k.last ? ` (последно ${k.last.p}/${k.last.n} на ${fmtDate(k.last.d)})` : ""}</dd></dl>
      <p><b>Устройства (${r.devices.length} от ${k.maxDevices})</b></p>
      ${r.devices.length ? `<ul class="kdev">${r.devices.map((d) => `<li>${esc(d.label)} <small>от ${fmtDate(d.since)}, последно ${fmtTime(d.lastSeen)}</small></li>`).join("")}</ul>` : `<p class="muted small">Няма записани устройства.</p>`}
      <label class="field"><span>Бележка (например номер на поръчка)</span><input type="text" id="noteIn" value="${esc(k.note)}" maxlength="300"></label>
      <div class="row"><button class="btn ghost" id="saveNote">Запази бележката</button>
        ${r.devices.length ? `<button class="btn" id="freeDev">Освободи устройствата</button>` : ""}
        <button class="btn ghost" id="toggle">${k.disabled ? "Пусни кода" : "Спри кода"}</button></div>
      <p class="small muted">„Освободи устройствата“ изтрива списъка – следващите 3 отваряния заемат местата наново. Оценките остават.</p></div>`;
    $("saveNote").addEventListener("click", () => find(k.code, { action: "note", note: $("noteIn").value }).then(() => toast("Бележката е записана.")));
    $("freeDev")?.addEventListener("click", () => find(k.code, { action: "free" }).then(() => toast("Устройствата са освободени.")));
    $("toggle").addEventListener("click", () => find(k.code, { action: k.disabled ? "enable" : "disable" }));
  } catch (err) {
    $("found").innerHTML = "";
    $("findErr").textContent = err.message;
  }
}

(async () => {
  const m = await me();
  if (m.user?.role !== "admin") {
    if (!m.user) return go(`/vhod/?kak=roditel&next=${encodeURIComponent(location.pathname + location.search)}`);
    $("main").innerHTML = `<h1>Тази страница е само за администратора</h1><p class="lead">Влез с профила на Еду БЕЛ, който има права на администратор.</p>`;
    return;
  }
  topbar(m);
  await render(params.get("code"));
  // Used by tools/nvo-trener to make the first PDFs and sticker sheets: ?print=pdf&codes=A,B,C
  if (params.get("print") && params.get("codes")) showPrint(params.get("print"), params.get("codes").split(","), params.get("title") || "");
})();
