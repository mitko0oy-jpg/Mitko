// What to do after each call attempt, and what to tell Mitko. Pure functions.

export const MAX_ATTEMPTS = 3;
// Minutes to wait before attempt 2 (1 hour) and attempt 3 (next day, at a different hour).
export const RETRY_DELAYS_MIN = [60, 21 * 60];
// If no result arrives this long after a call started, treat it as "no conversation".
export const STALE_CALL_MIN = 30;

const RETRY_OUTCOMES = new Set(["voicemail", "no_conversation", "busy", "no-answer", "unknown", ""]);

const LABELS = {
  confirmed: "✅ Потвърдена",
  canceled: "❌ Отказана",
  change_requested: "✏️ Иска промяна",
  needs_human: "🙋 Иска човек – обади се",
  callback_later: "🕐 Да се обадим по-късно",
  wrong_person: "👤 Вдигна друг човек",
  wrong_number: "☎️ Грешен номер",
  gave_up: "📵 Не вдига",
  bad_phone: "☎️ Невалиден телефон",
  call_error: "⚠️ Грешка при обаждането",
};

/**
 * Apply the result of one attempt to an order record.
 * @param {object} rec order record (not mutated)
 * @param {{outcome: string}} result
 * @returns {{rec: object, notify: boolean, label: string}}
 */
export function applyOutcome(rec, result, now = new Date()) {
  const outcome = String(result.outcome || "").toLowerCase();
  const next = { ...rec, callingSince: null, lastOutcome: outcome || "no_conversation" };
  next.history = [...(rec.history || []), { at: now.toISOString(), event: "result", outcome: next.lastOutcome }];

  if (RETRY_OUTCOMES.has(outcome)) {
    if ((rec.attempts || 0) < MAX_ATTEMPTS) {
      const delay = RETRY_DELAYS_MIN[Math.min((rec.attempts || 1) - 1, RETRY_DELAYS_MIN.length - 1)];
      next.state = "queued";
      next.nextAttemptAt = new Date(now.getTime() + delay * 60_000).toISOString();
      return { rec: next, notify: false, label: "" };
    }
    next.state = "gave_up";
    next.finishedAt = now.toISOString();
    return { rec: next, notify: true, label: LABELS.gave_up };
  }

  next.state = outcome === "confirmed" || outcome === "canceled" ? "done" : "needs_mitko";
  next.finishedAt = now.toISOString();
  return { rec: next, notify: true, label: LABELS[outcome] || `❓ ${outcome}` };
}

export function labelFor(key) {
  return LABELS[key] || key;
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Telegram message (HTML) about one order.
 * @param {object} rec order record
 * @param {string} label first line, e.g. "✅ Потвърдена"
 * @param {object} [call] result of readPostCall()
 * @param {{testMode?: boolean}} [opts]
 */
export function buildMessage(rec, label, call, opts = {}) {
  const lines = [];
  lines.push(`${opts.testMode ? "🧪 ТЕСТ · " : ""}<b>${esc(label)}</b>`);
  lines.push(`Поръчка <b>#${esc(rec.orderNo)}</b> · ${esc(rec.siteLabel || rec.site)}`);
  lines.push(`${esc(rec.name)} · ${esc(rec.phone || rec.rawPhone || "няма телефон")}`);
  if (rec.itemsText) lines.push(`🛒 ${esc(rec.itemsText)} – ${esc(rec.totalText)}`);
  if (rec.deliveryText) lines.push(`🚚 ${esc(rec.deliveryText)}`);
  if (rec.attempts) lines.push(`Опити: ${rec.attempts}`);
  if (call) {
    if (call.deliveryChange) lines.push(`📍 <b>Нова доставка:</b> ${esc(call.deliveryChange)}`);
    if (call.orderChange) lines.push(`✏️ <b>Промяна:</b> ${esc(call.orderChange)}`);
    if (call.cancelReason) lines.push(`Причина за отказ: ${esc(call.cancelReason)}`);
    if (call.callbackWhen) lines.push(`🕐 Кога: ${esc(call.callbackWhen)}`);
    if (call.questions) lines.push(`❓ Въпроси: ${esc(call.questions)}`);
    if (call.health) lines.push(`⚠️ <b>Спомена алергия или здравословен проблем</b>`);
    if (call.failedChecks?.length) lines.push(`⚠️ <b>Провери разговора</b> – агентът може да е нарушил: ${esc(call.failedChecks.join(", "))}`);
    if (call.summary) lines.push(`\n📝 ${esc(call.summary)}`);
    if (call.transcript) {
      const t = call.transcript.length > 2200 ? call.transcript.slice(0, 2200) + "…" : call.transcript;
      lines.push(`\n<blockquote expandable>${esc(t)}</blockquote>`);
    }
  }
  if (rec.error) lines.push(`Грешка: ${esc(rec.error)}`);
  return lines.join("\n").slice(0, 4000);
}
