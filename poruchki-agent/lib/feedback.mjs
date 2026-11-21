// Feedback calls: after delivery (2–3 weeks, or months later for older
// customers) the agent asks how the customer is doing with the gel and, if
// they are happy, offers a repeat order.
// The offer is two choices in one sentence („три гела на цената на един“ or
// five; 12 patches with both): two options sell better than one.
// Both packs come with 12 herbal patches („лепенки“) as a gift.
import { formalNameBG, moneyBG } from "./format.mjs";
import { officeName } from "./convertbuilder.mjs";

export const FEEDBACK_OFFER = {
  delivery: 4.5,
  // Prices on beevenombg.eu (13.11.2026), said as the reference: one gel = the price of three for customers.
  site: { one: 15.9, five: 29.9 },
  packs: {
    3: { qty: 3, words: "три", price: 15.9, gift: "дванайсет билкови лепенки" },
    5: { qty: 5, words: "пет", price: 19.9, gift: "дванайсет билкови лепенки" },
  },
};

/** How many tubes of gel the order had (1, 3 or 5), 0 when there was no gel. */
export function gelTubes(items) {
  let n = 0;
  for (const it of items || []) {
    const name = String(it.name || "");
    const qty = Number(it.q ?? it.qty ?? 1) || 1;
    if (/подарък|пластир|лепенк/i.test(name)) continue;
    if (/3\s*\+\s*2/.test(name)) n += 5 * qty;
    else if (/2\s*\+\s*1/.test(name)) n += 3 * qty;
    else if (/gel|гел|пчелна отрова/i.test(name)) n += qty;
  }
  return n;
}

const LATIN = [["sht", "щ"], ["zh", "ж"], ["ch", "ч"], ["sh", "ш"], ["yu", "ю"], ["ya", "я"], ["ts", "ц"], ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["y", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"], ["h", "х"], ["c", "ц"], ["w", "в"], ["j", "дж"], ["x", "кс"], ["q", "к"]];

/** "Petko Petkov" → "Петко Петков", so the voice reads it as a Bulgarian name. */
export function cyrillic(text) {
  return String(text || "").replace(/[a-z]+/gi, (word) => {
    let out = "";
    let w = word.toLowerCase();
    while (w) {
      const [lat, cyr] = LATIN.find(([l]) => w.startsWith(l)) || [w[0], w[0]];
      out += cyr;
      w = w.slice(lat.length);
    }
    return word[0] === word[0].toUpperCase() ? out.charAt(0).toUpperCase() + out.slice(1) : out;
  });
}

/** "Петрова" → "госпожо Петрова", "Петров" → "господин Петров", else the first name. */
export function addressBG(rawName) {
  const fullName = cyrillic(rawName);
  const formal = formalNameBG(fullName);
  if (formal) return formal.replace(/^госпожа /, "госпожо ");
  const first = String(fullName || "").trim().split(/\s+/)[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
}

/** True when the order also had herbal patches (bought or as a gift). */
export function hadPatches(items) {
  return (items || []).some((it) => /пластир|лепенк/i.test(String(it.name || "")));
}

function boughtText(tubes, patches) {
  const gel =
    tubes >= 5 ? "гела с пчелна отрова – пакета 3 плюс 2, пет туби" : tubes >= 3 ? "гела с пчелна отрова – пакета 2 плюс 1, три туби" : "гела с пчелна отрова – една туба";
  return patches ? `${gel}, и билкови лепенки` : gel;
}

const MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];

/**
 * When the customer got the gel, as the agent says it: "преди около две седмици",
 * or for older orders the month ("през юли").
 * Without a delivery date, the order date + 2 days (delivery takes 1–2 working days).
 */
export function deliveredAgo({ deliveredAt, orderedAt }, now) {
  const at = deliveredAt ? new Date(deliveredAt) : orderedAt ? new Date(new Date(orderedAt).getTime() + 2 * 86_400_000) : null;
  if (!at || Number.isNaN(at.getTime())) return "наскоро";
  const days = Math.round((now - at) / 86_400_000);
  if (days <= 10) return "преди около седмица";
  if (days <= 17) return "преди около две седмици";
  if (days <= 24) return "преди около три седмици";
  if (days <= 40) return "преди около месец";
  const month = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Sofia", month: "numeric" }).format(at)) - 1;
  return `през ${MONTHS[month]}`;
}

function offerText(pack, o = FEEDBACK_OFFER) {
  const p = o.packs[pack];
  // Said as value against the shop's own price (bonus-pack framing), not as a list of numbers.
  // The gift is said once for both packs (gift_text), so each offer is short.
  const text = pack === 3 && p.price === o.site.one ? `три гела на цената на един – ${moneyBG(p.price)}` : `${p.words} гела за ${moneyBG(p.price)}`;
  return {
    offer: text,
    total: moneyBG(p.price + o.delivery),
    totalNum: Math.round((p.price + o.delivery) * 100) / 100,
  };
}

/**
 * Variables for one feedback call.
 * @param {{label: string, name: string, city?: string, address?: string, items: any[], deliveredAt?: string, orderedAt?: string}} order
 */
export function feedbackVariables(order, now = new Date()) {
  const tubes = gelTubes(order.items);
  // Three first („три на цената на един“), five as the second choice.
  const main = 3;
  const alt = 5;
  const m = offerText(main);
  const a = offerText(alt);
  const office = officeName(order.address).replace(/\s*\([^)]*\)/g, "");
  const city = String(order.city || "").trim();
  return {
    campaign: "feedback",
    order_key: `fb-${order.label}`,
    test: "no",
    customer_name: addressBG(order.name),
    order_number: String(order.label),
    bought_text: boughtText(tubes, hadPatches(order.items)),
    delivered_ago: deliveredAgo(order, now),
    delivery_text: office || (city ? `до адреса Ви в ${city}` : "на същия адрес"),
    main_pack: String(main),
    main_offer: m.offer,
    main_total: m.total,
    alt_pack: String(alt),
    alt_offer: a.offer,
    alt_total: a.total,
    delivery_fee: moneyBG(FEEDBACK_OFFER.delivery),
    site_one_price: moneyBG(FEEDBACK_OFFER.site.one),
    gift_text: FEEDBACK_OFFER.packs[3].gift,
  };
}

const OUTCOME_LABEL = {
  reorder: "🛒 ПОРЪЧА ОТНОВО",
  later: "📅 Иска по-късно",
  declined: "🙅 Не иска сега",
  not_using: "⏳ Още не го ползва",
  unhappy: "😕 Недоволен",
  side_effect: "⚠️ Нежелана реакция – обади се",
  busy: "🕐 Зает – да звъннем пак",
  wrong_person: "👤 Вдигна друг човек",
  wrong_number: "☎️ Грешен номер",
  do_not_call: "🚫 Не иска обаждания",
  needs_human: "🙋 Иска колега да му се обади",
  unclear_order: "❓ Може би иска поръчка – прочети разговора",
  voicemail: "📵 Гласова поща",
  no_conversation: "📵 Не вдигна / затвори",
};

/**
 * The feedback fields of a call. On calls through the Zadarma callback the
 * incoming agent collects them with a "fb_" prefix (its own "outcome" means
 * something else); the feedback agent itself uses the plain names.
 */
export function feedbackFields(fields = {}) {
  const out = { ...fields };
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith("fb_") && v !== "" && v != null) out[k.slice(3)] = v;
  }
  return out;
}

/** Mark the queued feedback call (record "fb-<order>") as finished. */
async function finishQueued(store, orderKey, result, now) {
  if (!/^fb-\d+$/.test(String(orderKey || ""))) return;
  for (let i = 0; i < 3; i++) {
    const entry = await store.getWithMetadata(orderKey, { type: "json" });
    if (!entry?.data) return;
    const { modified } = await store.setJSON(
      orderKey,
      { ...entry.data, status: "done", ...result, finishedAt: now.toISOString() },
      { onlyIfMatch: entry.etag },
    );
    if (modified) return;
  }
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const yes = (v) => v === true || String(v).toLowerCase() === "true";

/**
 * Telegram message (HTML) for one feedback call.
 * @param {ReturnType<import("./elevenlabs.mjs").readPostCall>} call
 */
export function feedbackMessage(call) {
  const v = call.variables || {};
  const f = feedbackFields(call.fields);
  let outcome = String(f.outcome || "").toLowerCase() || "no_conversation";
  // "Reorder" without a confirmed pack is not an order – Mitko must check the conversation.
  if (outcome === "reorder" && !/[35]/.test(String(f.reorder_pack || ""))) outcome = "unclear_order";
  const lines = [];
  lines.push(`${v.test === "yes" ? "🧪 ТЕСТ · " : ""}💬 <b>Обратна връзка · ${esc(OUTCOME_LABEL[outcome] || `❓ ${outcome}`)}</b>`);
  lines.push(`Поръчка #${esc(v.order_number)} · ${esc(v.customer_name)} · получена ${esc(v.delivered_ago)}`);
  lines.push(`Беше: ${esc(v.bought_text)}`);
  const uses = { yes: "ползва го", no: "още не го ползва", stopped: "спрял е" }[String(f.uses_product || "").toLowerCase()];
  const rating = String(f.satisfaction || "").match(/[1-5]/)?.[0];
  if (uses || rating) lines.push([uses && `🧴 ${uses}`, rating && `⭐ ${rating}/5`].filter(Boolean).join(" · "));
  if (f.feedback) lines.push(`🗣 ${esc(f.feedback)}`);
  if (f.usage) lines.push(`🕒 Как го ползва: ${esc(f.usage)}`);
  const pack = String(f.reorder_pack || "").match(/[35]/)?.[0];
  if (pack) {
    const offer = pack === v.main_pack ? { o: v.main_offer, t: v.main_total } : { o: v.alt_offer, t: v.alt_total };
    lines.push(`🛒 <b>Нова поръчка: ${esc(offer.o)} + подарък ${esc(v.gift_text || "лепенки")} · общо ${esc(offer.t)} с доставката</b>`);
    lines.push(`🚚 ${esc(f.delivery_change || v.delivery_text)}${f.delivery_change ? " (НОВО)" : ""}`);
    lines.push("Въведи я в Middleware.");
  }
  if (f.callback_when) lines.push(`📅 <b>Да звъннем:</b> ${esc(f.callback_when)}`);
  if (f.decline_reason) lines.push(`❔ Защо не: ${esc(f.decline_reason)}`);
  if (yes(f.side_effect)) lines.push("⚠️ <b>Спомена нежелана реакция – обади му се</b>");
  if (yes(f.do_not_call)) lines.push("🚫 Не му звъним повече");
  if (f.questions) lines.push(`❓ ${esc(f.questions)}`);
  if (call.failedChecks?.length) lines.push(`⚠️ <b>Провери разговора</b> – агентът може да е нарушил: ${esc(call.failedChecks.join(", "))}`);
  const summary = f.summary || call.summary;
  if (summary) lines.push(`\n📝 ${esc(summary)}`);
  if (call.transcript) {
    const t = call.transcript.length > 2200 ? call.transcript.slice(0, 2200) + "…" : call.transcript;
    lines.push(`\n<blockquote expandable>${esc(t)}</blockquote>`);
  }
  return lines.join("\n").slice(0, 4000);
}

/** Save the result (for callbacks and the do-not-call list) and tell Mitko. */
export async function handleFeedbackCall(deps, call, now = new Date()) {
  const v = call.variables || {};
  const f = feedbackFields(call.fields);
  const key = `feedback/${String(v.order_key || "fb-unknown").replace(/[^\w-]/g, "")}`;
  if (v.test !== "yes") {
    // The call came from the queue (/obratna): mark it done.
    await finishQueued(deps.store, v.order_key, { outcome: String(f.outcome || "").toLowerCase() || "no_conversation", conversationId: call.conversationId }, now);
    await deps.store.setJSON(key, {
      at: now.toISOString(),
      orderNo: v.order_number,
      name: v.customer_name,
      outcome: String(f.outcome || "").toLowerCase(),
      reorderPack: String(f.reorder_pack || ""),
      callbackWhen: String(f.callback_when || ""),
      doNotCall: yes(f.do_not_call),
      sideEffect: yes(f.side_effect),
      conversationId: call.conversationId,
    });
  }
  await deps.notify(feedbackMessage(call));
  return { feedback: key };
}
