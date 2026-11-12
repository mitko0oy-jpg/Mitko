// Pure helpers: phone numbers, money in words, calling hours. No I/O.

/**
 * Normalise a Bulgarian phone number to E.164 (+359…). Returns null when it
 * does not look like a valid Bulgarian number.
 * @param {string} raw
 */
export function normalizePhoneBG(raw) {
  if (raw == null) return null;
  let d = String(raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("359")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1); // "+359 0888…"
  // Mobile: 8[789]XXXXXXX (9 digits). Landline: area code + number, 8–9 digits.
  if (/^8[789]\d{7}$/.test(d)) return "+359" + d;
  if (/^[2-9]\d{7,8}$/.test(d)) return "+359" + d;
  return null;
}

/**
 * Polite form for the call: "господин Георгиев" / "госпожа Петрова", from the
 * Bulgarian surname ending. Returns "" when it cannot tell (then use the first name).
 * @param {string} fullName
 */
export function formalNameBG(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "";
  const raw = parts[parts.length - 1];
  const last = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (/(ова|ева|ска|цка|ova|eva|ska|cka)$/i.test(last)) return `госпожа ${last}`;
  if (/(ов|ев|ски|цки|ov|ev|ski|cki)$/i.test(last)) return `господин ${last}`;
  return "";
}

/** @param {number} amount EUR, e.g. 27.4 → "27 евро и 40 цента" */
export function moneyBG(amount) {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents < 0) return "";
  const eur = Math.floor(cents / 100);
  const c = cents % 100;
  const eurText = `${eur} евро`;
  if (c === 0) return eurText;
  const centWord = c === 1 ? "цент" : "цента";
  return eur === 0 ? `${c} ${centWord}` : `${eurText} и ${c} ${centWord}`;
}

/**
 * Human text for the order lines, e.g.
 * "BeeVenom Care Gel 2+1 броя и подарък: 8 бр. пластири за стави и мускули"
 * @param {{name: string, qty: number, price: number}[]} items
 */
export function itemsTextBG(items) {
  const paid = [];
  const free = [];
  for (const it of items || []) {
    const name = spoken(String(it.name || "").replace(/^Подарък\s*/i, "").trim());
    if (!name) continue;
    const qty = Number(it.qty) || 1;
    const label = qty > 1 ? `${qty} броя ${name}` : name;
    if (Number(it.price) > 0) paid.push(label);
    else free.push(label);
  }
  let text = joinBG(paid);
  if (free.length) text += (text ? ", и подарък: " : "Подарък: ") + joinBG(free);
  return text;
}

/** Product names as they should be read aloud: "12бр." → "12 броя", "30 г" → "30 грама", "3+2" → "3 плюс 2". */
export function spoken(name) {
  return name
    .replace(/(\d)\s*\+\s*(\d)/g, "$1 плюс $2")
    .replace(/(\d)\s*бр\.?(?=\s|$|,)/gi, "$1 броя")
    .replace(/\bбр\.\s*/gi, "броя ")
    .replace(/(\d)\s*г\.?(?=\s|$|,)/g, "$1 грама")
    .replace(/(\d)\s*мл\.?(?=\s|$|,)/g, "$1 милилитра")
    .replace(/\s+/g, " ")
    .trim();
}

function joinBG(list) {
  if (list.length <= 1) return list.join("");
  return list.slice(0, -1).join(", ") + " и " + list[list.length - 1];
}

/** Current wall-clock time in Sofia: { hour, minute, weekday (0=Sun) } */
export function sofiaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { hour: Number(get("hour")), minute: Number(get("minute")), weekday: days.indexOf(get("weekday")) };
}

/**
 * Is it OK to call now? `hours` like "10:00-20:00" (Sofia time, every day).
 * @param {string} hours
 */
export function inCallingHours(hours = "10:00-20:00", date = new Date()) {
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(hours).trim());
  if (!m) return false;
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  const { hour, minute } = sofiaNow(date);
  const now = hour * 60 + minute;
  return now >= from && now < to;
}
