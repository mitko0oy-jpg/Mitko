// The SMS window: pick a ready text (already filled in for the order) or write your own.
import { api, esc, eur } from "./app.js";

// Same rules as on the server: 160/153 Latin characters per SMS, 70/67 with Cyrillic.
const GSM = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r^{}\\[~\]|€]*$/;
const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya" };
export const toLatin = (t) =>
  t.replace(/[„“”«»]/g, '"').replace(/[–—]/g, "-").replace(/№/g, "No").replace(/€/g, "EUR").replace(/[Ѐ-ӿ]/g, (ch) => {
    const low = ch.toLowerCase();
    const r = TR[low] ?? ch;
    return ch === low ? r : r.charAt(0).toUpperCase() + r.slice(1);
  });
export function parts(text) {
  const unicode = !GSM.test(text);
  const chars = unicode ? [...text].length : [...text].reduce((a, c) => a + ("^{}\\[~]|€".includes(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { chars, unicode, parts: chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi) };
}

function dialog() {
  let d = document.getElementById("smsDialog");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "smsDialog";
    d.className = "modal";
    document.body.append(d);
  }
  return d;
}

/** Resolves to true when an SMS was sent. */
export async function openSms(orderId) {
  const d = dialog();
  d.innerHTML = `<div class="mb"><div class="empty">Зареждам…</div></div>`;
  d.showModal();
  let data;
  try {
    data = await api(`/api/sms/draft?order=${orderId}`);
  } catch (e) {
    d.innerHTML = `<div class="mb"><p class="err">${esc(e.message)}</p></div><div class="mf"><button class="btn" data-close>Затвори</button></div>`;
    d.querySelector("[data-close]").onclick = () => d.close();
    return false;
  }
  return new Promise((resolve) => {
    let sent = false;
    d.onclose = () => resolve(sent);
    let key = data.suggested;
    let latin = data.latin;
    d.innerHTML = `
      <div class="mh"><div><h2>SMS до ${esc(data.name || "клиента")}</h2><div class="muted small">${esc(data.phone || "")}</div></div>
        <button class="iconbtn" data-close aria-label="Затвори">✕</button></div>
      <div class="mb">
        ${data.configured ? "" : `<div class="note err">SMS още не е свързан. Добави токена от SMSAPI в Настройки → SMS.</div>`}
        <div class="seg" id="smsTpl">${Object.entries(data.templates)
          .map(([k, t]) => `<button type="button" data-k="${k}" class="${k === key ? "on" : ""}">${esc(t.label)}</button>`)
          .join("")}<button type="button" data-k="free" class="${key === "free" ? "on" : ""}">Свободен текст</button></div>
        <label>Телефон<input type="tel" id="smsPhone" value="${esc(data.phone || "")}"></label>
        <label>Текст<textarea id="smsText" rows="5" style="width:100%;font:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--surface)"></textarea></label>
        <label class="chk"><input type="checkbox" id="smsLatin" ${latin ? "checked" : ""}> На латиница (до 160 знака в един SMS – по-евтино)</label>
        <div class="small" id="smsCount"></div>
        <div class="err small" id="smsErr"></div>
      </div>
      <div class="mf"><button class="btn" data-close>Откажи</button><button class="btn primary" id="smsSend" ${data.configured ? "" : "disabled"}>Изпрати</button></div>`;
    const text = d.querySelector("#smsText");
    const count = () => {
      const t = d.querySelector("#smsLatin").checked ? toLatin(text.value) : text.value;
      const p = parts(t);
      d.querySelector("#smsCount").innerHTML = `${p.chars} знака · <b>${p.parts} SMS</b> · около ${eur(p.parts * data.pricePerPart, true)}${d.querySelector("#smsLatin").checked && text.value !== t ? `<div class="muted">Ще замине като: ${esc(t)}</div>` : ""}`;
    };
    const pick = (k) => {
      key = k;
      text.value = k === "free" ? "" : data.filled[k] || "";
      d.querySelectorAll("#smsTpl button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
      count();
      if (k === "free") text.focus();
    };
    d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
    d.querySelectorAll("#smsTpl button").forEach((b) => (b.onclick = () => pick(b.dataset.k)));
    text.oninput = count;
    d.querySelector("#smsLatin").onchange = count;
    d.querySelector("#smsSend").onclick = async (e) => {
      const btn = e.target;
      const phone = d.querySelector("#smsPhone").value;
      btn.disabled = true;
      btn.textContent = "Изпращам…";
      d.querySelector("#smsErr").textContent = "";
      try {
        const r = await api("/api/sms/send", { method: "POST", body: { orderId, text: text.value, latin: d.querySelector("#smsLatin").checked, phone } });
        sent = true;
        d.innerHTML = `<div class="mh"><h2>SMS-ът е изпратен</h2><button class="iconbtn" data-close aria-label="Затвори">✕</button></div>
          <div class="mb"><p>${r.parts} SMS до ${esc(phone)}.</p></div>
          <div class="mf"><button class="btn primary" data-close>Затвори</button></div>`;
        d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
      } catch (err) {
        d.querySelector("#smsErr").textContent = err.message;
        btn.disabled = false;
        btn.textContent = "Изпрати";
      }
    };
    pick(key);
  });
}
