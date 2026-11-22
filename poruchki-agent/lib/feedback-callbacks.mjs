// Feedback calls: who we have talked to, and the calls we promised.
//  - "fb-called/<phone hash>" and "fb-called/n<order>": we talked to this customer (kept a year; a
//    "do not call" forever). /obratna skips them even after the 60-day result is gone, and even
//    for another order of the same person. Only a hash of the number is kept, no name.
//  - "Обадете се след месец" → the date is worked out from the customer's words; on that day,
//    in the calling hours, the order goes back to the queue by itself and Mitko gets a message.
import { createHash } from "node:crypto";
import { normalizePhoneBG } from "./format.mjs";

const DAY = 86_400_000;
const KEEP_CALLED_DAYS = 365;
const DEFAULT_LATER_DAYS = 14;

const phoneHash = (phone) => {
  const p = normalizePhoneBG(phone);
  return p ? createHash("sha256").update(`fb:${p}`).digest("hex").slice(0, 20) : "";
};
const calledKeys = (label, phone) => [label ? `fb-called/n${String(label).replace(/\D/g, "")}` : "", phone ? `fb-called/${phoneHash(phone)}` : ""].filter((k) => k && !k.endsWith("/") && !k.endsWith("/n"));

/** We talked to this customer (any order of theirs): { at, outcome, doNotCall } or null. */
export async function alreadyCalled(store, label, phone) {
  for (const key of calledKeys(label, phone)) {
    const m = await store.get(key, { type: "json" }).catch(() => null);
    if (m) return m;
  }
  return null;
}

export async function rememberCalled(store, { label, phone, outcome, doNotCall = false }, now = new Date()) {
  const mark = { at: now.toISOString(), outcome: String(outcome || ""), ...(doNotCall ? { doNotCall: true } : {}) };
  for (const key of calledKeys(label, phone)) await store.setJSON(key, mark);
}

export async function purgeCalled(store, now = new Date()) {
  let n = 0;
  for (const { key } of (await store.list({ prefix: "fb-called/" })).blobs) {
    const m = await store.get(key, { type: "json" }).catch(() => null);
    if (m?.doNotCall) continue;
    if (!m || now - new Date(m.at) > KEEP_CALLED_DAYS * DAY) {
      await store.delete(key);
      n++;
    }
  }
  return n;
}

// ── When to call again ────────────────────────────────────────────────────────────

const WORD_NUM = { един: 1, една: 1, едно: 1, два: 2, две: 2, три: 3, четири: 4, пет: 5, шест: 6, седем: 7, осем: 8, десет: 10 };
const num = (w) => (w ? (/^\d+$/.test(w) ? Number(w) : WORD_NUM[w] || 1) : 1);
const MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
const WEEKDAYS = ["неделя", "понеделник", "вторник", "сряда", "четвъртък", "петък", "събота"];

/** Today in Sofia as {y, m (0-11), d, wd}. */
function sofiaDay(now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month) - 1, d: Number(p.day), wd };
}
// 10:30 Sofia time on that day (UTC+2 in winter, +3 in summer – the hour is not critical).
const at1030 = (y, m, d) => new Date(Date.UTC(y, m, d, 8, 30));

/**
 * The day to call again from the customer's words („след месец“, „след две седмици“, „около пенсията“,
 * „в началото на декември“, „в петък“). exact=false: we guessed – Mitko sees it.
 * @returns {{ due: Date, exact: boolean }}
 */
export function callbackDue(text, outcome = "later", now = new Date()) {
  const t = String(text || "").toLowerCase();
  const { y, m, d, wd } = sofiaDay(now);
  const plusDays = (n) => at1030(y, m, d + n);
  let r;
  if ((r = /след\s+(\d+|една|две|три|четири)?\s*седмиц/.exec(t))) return { due: plusDays(7 * num(r[1])), exact: true };
  if ((r = /след\s+(\d+|един|два|три|четири|пет|шест)?\s*месец/.exec(t))) return { due: at1030(y, m + num(r[1]), d), exact: true };
  if ((r = /след\s+(\d+|един|два|три|четири|пет|шест|седем|осем|десет)?\s*(ден|дни|дена)/.exec(t))) return { due: plusDays(num(r[1])), exact: true };
  if (/вдругиден/.test(t)) return { due: plusDays(2), exact: true };
  if (/утре/.test(t)) return { due: plusDays(1), exact: true };
  if ((r = /след\s+(\d{1,2})[\s-]*(ти|ри|ви|ми)?\b/.exec(t)) || (r = /(?:около|на)\s+(\d{1,2})[\s-]*(?:ти|ри|ви|ми)?\b/.exec(t))) {
    const day = Number(r[1]);
    if (day >= 1 && day <= 31) return { due: day > d ? at1030(y, m, day + (t.includes("след") ? 1 : 0)) : at1030(y, m + 1, day + (t.includes("след") ? 1 : 0)), exact: true };
  }
  if (/нова година|празниците|коледа/.test(t)) return { due: at1030(m === 0 && d < 4 ? y : y + 1, 0, 5), exact: true };
  if (/пенси/.test(t)) return { due: d < 10 ? at1030(y, m, 12) : at1030(y, m + 1, 12), exact: false }; // pensions: 7th–20th
  if (/заплат/.test(t)) return { due: at1030(y, m + 1, 3), exact: false };
  const mi = MONTHS.findIndex((name) => new RegExp(`(^|[^а-яё])${name.slice(0, 5)}`).test(t));
  if (mi >= 0) {
    let day = /края/.test(t) ? 25 : /средат/.test(t) ? 15 : 3;
    if (mi === m && day <= d) day = d + 3;
    return { due: at1030(mi < m ? y + 1 : y, mi, day), exact: true };
  }
  if (/началото на (следващия )?месец|следващия месец|другия месец/.test(t)) return { due: at1030(y, m + 1, 3), exact: true };
  if (/края на месеца/.test(t)) return { due: d < 26 ? at1030(y, m, 26) : at1030(y, m + 1, 26), exact: true };
  // Word start: „неделя“ is inside „понеделник“.
  const wi = WEEKDAYS.findIndex((name) => new RegExp(`(^|[^а-яё])${name.slice(0, 5)}`).test(t));
  if (wi >= 0) return { due: plusDays(((wi - wd + 7) % 7) || 7), exact: true };
  if (/следващата седмица|другата седмица/.test(t)) return { due: plusDays(((1 - wd + 7) % 7) || 7), exact: true };
  if (outcome === "busy") return { due: plusDays(1), exact: false };
  return { due: plusDays(DEFAULT_LATER_DAYS), exact: false };
}

/** Outcomes after which we promised (or may) call again. */
const NEVER_AGAIN = new Set(["do_not_call", "wrong_number", "wrong_person", "unhappy", "side_effect", "needs_human", "reorder", "unclear_order"]);
export function wantsCallback(outcome, when) {
  const o = String(outcome || "").toLowerCase();
  if (NEVER_AGAIN.has(o)) return false;
  return o === "later" || o === "busy" || Boolean(String(when || "").trim());
}

export const dateBG = (d) => new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", weekday: "long", day: "numeric", month: "long" }).format(d);
