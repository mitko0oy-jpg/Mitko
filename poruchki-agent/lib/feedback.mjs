// Feedback calls: 2–3 weeks after delivery the agent asks how the customer is
// doing with the gel and, if they are happy, offers a repeat order.
// The offer follows what they bought: one tube or 2+1 → the 3-pack first,
// 3+2 → the 5-pack first; the other pack is the alternative.
import { formalNameBG, moneyBG } from "./format.mjs";
import { officeName } from "./convertbuilder.mjs";

export const FEEDBACK_OFFER = {
  delivery: 4.5,
  packs: {
    3: { qty: 3, words: "три", price: 15.9, gift: "8 билкови пластира" },
    5: { qty: 5, words: "пет", price: 19.9, gift: "16 билкови пластира" },
  },
};

/** How many tubes of gel the order had (1, 3 or 5), 0 when there was no gel. */
export function gelTubes(items) {
  let n = 0;
  for (const it of items || []) {
    const name = String(it.name || "");
    const qty = Number(it.q ?? it.qty ?? 1) || 1;
    if (/подарък|пластир/i.test(name)) continue;
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

function boughtText(tubes) {
  if (tubes >= 5) return "гела с пчелна отрова – пакета 3 плюс 2, пет туби";
  if (tubes >= 3) return "гела с пчелна отрова – пакета 2 плюс 1, три туби";
  return "гела с пчелна отрова – една туба";
}

function deliveredAgo(deliveredAt, now) {
  const days = Math.round((now - new Date(deliveredAt)) / 86_400_000);
  if (days <= 10) return "преди около седмица";
  if (days <= 17) return "преди около две седмици";
  if (days <= 24) return "преди около три седмици";
  return "преди около месец";
}

function offerText(pack, o = FEEDBACK_OFFER) {
  const p = o.packs[pack];
  return {
    offer: `пакет от ${p.words} гела за ${moneyBG(p.price)}, и подарък ${p.gift}`,
    total: moneyBG(p.price + o.delivery),
    totalNum: Math.round((p.price + o.delivery) * 100) / 100,
  };
}

/**
 * Variables for one feedback call.
 * @param {{label: string, name: string, city?: string, address?: string, for?: string, items: any[], deliveredAt: string}} order
 */
export function feedbackVariables(order, now = new Date()) {
  const tubes = gelTubes(order.items);
  const main = tubes >= 5 ? 5 : 3;
  const alt = main === 5 ? 3 : 5;
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
    bought_text: boughtText(tubes),
    delivered_ago: deliveredAgo(order.deliveredAt, now),
    delivery_text: office || (city ? `до адреса Ви в ${city}` : "на същия адрес"),
    main_pack: String(main),
    main_offer: m.offer,
    main_total: m.total,
    alt_pack: String(alt),
    alt_offer: a.offer,
    alt_total: a.total,
    delivery_fee: moneyBG(FEEDBACK_OFFER.delivery),
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
  voicemail: "📵 Гласова поща",
  no_conversation: "📵 Не вдигна / затвори",
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const yes = (v) => v === true || String(v).toLowerCase() === "true";

/**
 * Telegram message (HTML) for one feedback call.
 * @param {ReturnType<import("./elevenlabs.mjs").readPostCall>} call
 */
export function feedbackMessage(call) {
  const v = call.variables || {};
  const f = call.fields || {};
  const outcome = String(f.outcome || "").toLowerCase() || "no_conversation";
  const lines = [];
  lines.push(`${v.test === "yes" ? "🧪 ТЕСТ · " : ""}💬 <b>Обратна връзка · ${esc(OUTCOME_LABEL[outcome] || outcome)}</b>`);
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
    lines.push(`🛒 <b>Нова поръчка: ${esc(offer.o)} · общо ${esc(offer.t)} с доставката</b>`);
    lines.push(`🚚 ${esc(f.delivery_change || v.delivery_text)}${f.delivery_change ? " (НОВО)" : ""}`);
    lines.push("Въведи я в Middleware.");
  }
  if (f.callback_when) lines.push(`📅 <b>Да звъннем:</b> ${esc(f.callback_when)}`);
  if (f.decline_reason) lines.push(`❔ Защо не: ${esc(f.decline_reason)}`);
  if (yes(f.side_effect)) lines.push("⚠️ <b>Спомена нежелана реакция – обади му се</b>");
  if (yes(f.do_not_call)) lines.push("🚫 Не му звъним повече");
  if (f.questions) lines.push(`❓ ${esc(f.questions)}`);
  if (call.failedChecks?.length) lines.push(`⚠️ <b>Провери разговора</b> – агентът може да е нарушил: ${esc(call.failedChecks.join(", "))}`);
  if (call.summary) lines.push(`\n📝 ${esc(call.summary)}`);
  if (call.transcript) {
    const t = call.transcript.length > 2200 ? call.transcript.slice(0, 2200) + "…" : call.transcript;
    lines.push(`\n<blockquote expandable>${esc(t)}</blockquote>`);
  }
  return lines.join("\n").slice(0, 4000);
}

/** Save the result (for callbacks and the do-not-call list) and tell Mitko. */
export async function handleFeedbackCall(deps, call, now = new Date()) {
  const v = call.variables || {};
  const f = call.fields || {};
  const key = `feedback/${String(v.order_key || "fb-unknown").replace(/[^\w-]/g, "")}`;
  if (v.test !== "yes") {
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
