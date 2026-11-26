// The phone agent (separate Netlify site mitko-obazhdania) talks to the platform through /api/agent/*.
// It asks which orders to call, reports each call, corrects orders and adds orders taken by phone.
// After an AI confirmation the platform makes the waybill on its own, and the print page prints it.
import { timingSafeEqual } from "node:crypto";
import { getSetting, one, q, setSetting } from "./db.mts";
import { cKey, enterCompany, ENV_COMPANY, companyId } from "./tenant.mts";
import { editOrder, addEvent } from "./edit.mts";
import { env, forbidden } from "./http.mts";
import { addNote, confirmOrder } from "./manage.mts";
import { phoneKey } from "./match.mts";
import { createFor } from "./waybills.mts";

export const AI = "AI агент";

export function requireAgent(req: Request) {
  const want = env("AGENT_TOKEN") || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (want.length < 32 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw forbidden();
  // The phone agent works for the company whose Netlify settings it uses.
  enterCompany(ENV_COMPANY);
}

export type Automation = { autoWaybill: boolean };
export async function getAutomation(): Promise<Automation> {
  return { autoWaybill: true, ...((await getSetting<Automation>(cKey("automation"))) || {}) };
}
export async function saveAutomation(input: any): Promise<Automation> {
  const cur = await getAutomation();
  const next = { ...cur, ...(typeof input?.autoWaybill === "boolean" ? { autoWaybill: input.autoWaybill } : {}) };
  await setSetting(cKey("automation"), next);
  return next;
}

const round2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

/** The shape the agent reads (the same fields it used to read from ConvertBuilder). */
export function forAgent(o: any) {
  const d = o.delivery || {};
  const where = d.type === "address" ? "до адрес" : d.type === "automat" ? "до автомат" : "до офис";
  const courier = { speedy: "Спиди", econt: "Еконт" }[String(d.courier)] || "";
  return {
    id: Number(o.id),
    site: o.shop,
    siteLabel: o.shop_label,
    orderNo: o.order_no,
    createdAt: new Date(o.ordered_at).toISOString(),
    name: o.customer_name,
    phone: o.phone,
    items: (o.items || []).map((i: any) => ({ name: i.name, qty: Number(i.qty) || 1, price: round2(i.total) })),
    total: Number(o.total),
    shipping: Number(o.shipping),
    deliveryText: d.officeName ? `${where} на ${courier} „${d.officeName}“` : [where, courier, o.city, d.type === "address" ? o.address : ""].filter(Boolean).join(" "),
    confirmed: Boolean(o.confirmed_at),
    stillToCall: !o.confirmed_at && !o.archived_at && !o.tracking_no && o.stage === "new",
    requested: o.call?.state === "requested",
    requestedAt: o.call?.state === "requested" && o.call?.at ? new Date(o.call.at).toISOString() : null,
    stage: o.stage,
    trackingNo: o.tracking_no,
    courier: o.courier || d.courier || null,
    parcelText: o.parcel_text,
  };
}

const SELECT = () => `SELECT o.*, s.label AS shop_label FROM orders o JOIN shops s ON s.id = o.shop WHERE s.company_id = ${companyId()}`;

/** New orders of the given shops, and any order someone sent for "AI потвърждение". */
export async function ordersToCall(shops: string[], since: string) {
  const rows = await q<any>(
    `${SELECT()}
        AND o.confirmed_at IS NULL AND o.archived_at IS NULL AND o.tracking_no IS NULL AND o.stage = 'new' AND o.source <> 'phone' AND o.phone <> ''
        AND ((o.shop = ANY($1) AND o.ordered_at >= $2 AND o.ordered_at > now() - interval '48 hours')
             OR (o.call->>'state' = 'requested' AND o.ordered_at > now() - interval '14 days'))
      ORDER BY o.ordered_at LIMIT 50`,
    [shops, since],
  );
  return rows.map(forAgent);
}

/**
 * „📞 Обади се“: ask the phone agent (mitko-obazhdania) to call now, instead of at its next 5-minute run.
 * It calls a manual request whatever its mode is; /stop and the calling hours still hold. Best effort:
 * if it does not answer, it still picks the request up within 5 minutes. Returns a line for the user.
 */
export async function askAgentToCall(): Promise<{ started: boolean; reason: string; message: string }> {
  const later = { started: false, reason: "later", message: "Заявката е приета – Александра ще звънне до 5 минути." };
  const token = env("AGENT_TOKEN") || "";
  // The agent works only for the company whose Netlify settings it uses.
  if (token.length < 32 || companyId() !== ENV_COMPANY) return later;
  const base = (env("AGENT_URL") || "https://mitko-obazhdania.netlify.app").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/call-now`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
    const r: any = await res.json().catch(() => null);
    if (!res.ok || !r) return later;
    if (Number(r.started) > 0) return { started: true, reason: "", message: "📞 Александра звъни на клиента сега." };
    const reason = String(r.reason || "");
    const message =
      reason === "outside hours"
        ? "Извън часовете за обаждане – Александра ще звънне сутринта, в началото им."
        : reason === "paused"
          ? "Обажданията са спрени (/stop в Telegram или CALLS_PAUSED в Netlify) – Александра ще звънне, когато ги пуснеш с /pusni."
          : reason === "busy"
            ? "Линията е заета с друг разговор – Александра ще звънне до 5 минути."
            : later.message;
    return { started: false, reason: reason || "later", message };
  } catch {
    return later;
  }
}

export async function orderForAgent(id: number) {
  const o = await one<any>(`${SELECT()} AND o.id = $1`, [id]);
  return o ? forAgent(o) : null;
}

export async function ordersByPhone(phone: string, days = 45) {
  const key = phoneKey(phone);
  if (key.length < 9) return [];
  const rows = await q<any>(`${SELECT()} AND right(regexp_replace(o.phone, '\\D', '', 'g'), 9) = $1 AND o.ordered_at > now() - make_interval(days => $2) ORDER BY o.ordered_at DESC LIMIT 10`, [key, days]);
  return rows.map(forAgent);
}

export async function markCalling(id: number, attempt: number) {
  await q("UPDATE orders SET call = jsonb_build_object('state', 'calling', 'attempts', $2::int, 'at', now()) WHERE id = $1", [id, attempt]);
}

const LABEL: Record<string, string> = {
  confirmed: "потвърди",
  canceled: "клиентът отказа",
  change_requested: "клиентът иска промяна",
  needs_human: "иска човек – обади се",
  callback_later: "да се обадим по-късно",
  wrong_person: "вдигна друг човек",
  wrong_number: "грешен номер",
  gave_up: "не вдига след 3 опита",
  bad_phone: "невалиден телефон",
  call_error: "грешка при обаждането",
};
/** The same list as the agent's policy: these mean "nobody talked", and the agent tries again. */
const NO_TALK = new Set(["voicemail", "no_conversation", "busy", "no-answer", "no_answer", "unknown", ""]);

export type CallResult = {
  outcome: string;
  attempt?: number;
  final?: boolean;
  summary?: string;
  cancel_reason?: string;
  delivery_change?: string;
  order_change?: string;
  callback_when?: string;
  questions?: string;
  edit?: { items: any[]; shipping: number; discount?: number } | null;
  next_at?: string;
};

const TIME = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" });
/** "около 16:55" today, "утре около 10:20" tomorrow. */
function sofiaWhen(d: Date) {
  const today = DAY.format(new Date());
  const day = DAY.format(d);
  const tomorrow = DAY.format(new Date(Date.now() + 86400000));
  return `${day === today ? "" : day === tomorrow ? "утре " : `на ${day.slice(8, 10)}.${day.slice(5, 7)} `}около ${TIME.format(d)}`;
}

const t = (v: unknown, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** One call's result: history, comment, confirmation, correction, and the waybill when it can go out. */
export async function applyCallResult(id: number, r: CallResult) {
  const o = await one<any>("SELECT id, confirmed_at, tracking_no FROM orders WHERE id = $1", [id]);
  if (!o) return { ok: false, reason: "no order" };
  const outcome = t(r.outcome, 40).toLowerCase() || "no_conversation";
  const summary = t(r.summary, 600);
  const retry = NO_TALK.has(outcome);
  await q("UPDATE orders SET call = jsonb_build_object('state', $2::text, 'attempts', $3::int, 'at', now(), 'summary', $4::text, 'final', $5::boolean) WHERE id = $1", [
    id, retry && r.final ? "gave_up" : outcome, Number(r.attempt) || 1, summary, Boolean(r.final) || !retry,
  ]);
  await addEvent(id, "call", `Обаждане (опит ${Number(r.attempt) || 1}): ${retry ? (r.final ? LABEL.gave_up : "без разговор") : LABEL[outcome] || outcome}${summary ? ` – ${summary}` : ""}`, { outcome }, null, AI);

  const out: Record<string, unknown> = { ok: true, outcome };
  if (retry) {
    // Every call that did not get through is written down, with the next try.
    const attempt = Number(r.attempt) || 1;
    const next = r.next_at && !r.final ? new Date(r.next_at) : null;
    const nextText = next && !Number.isNaN(next.getTime()) ? `, ще опита пак ${sofiaWhen(next)}` : "";
    await addNote(id, r.final ? `☎ AI звъня ${attempt} пъти – клиентът не вдига. Обади се или пусни SMS.` : `☎ AI звъня (опит ${attempt}) – не вдигна${nextText}`, null, AI);
    return out;
  }
  const deliveryChange = t(r.delivery_change);
  const orderChange = t(r.order_change);
  if (outcome === "confirmed") {
    let changes: string[] = [];
    if (r.edit?.items?.length) {
      const e = await editOrder(id, r.edit, null, AI);
      changes = e.changes || [];
    }
    if (!o.confirmed_at) await confirmOrder(id, AI, null, AI);
    const warn = [deliveryChange && `иска друга доставка: ${deliveryChange}`, orderChange && !changes.length && `иска промяна: ${orderChange}`].filter(Boolean);
    await addNote(id, `AI потвърди по телефона${changes.length ? `. Корекция: ${changes.join("; ")}` : ". Без промени"}${warn.length ? `. ⚠ Провери: ${warn.join("; ")}` : ""}`, null, AI);
    // The waybill goes out on its own, unless the customer asked for something we must check first.
    const auto = await getAutomation();
    if (auto.autoWaybill && !warn.length && !o.tracking_no) {
      try {
        out.waybill = await createFor(id, undefined, null);
      } catch (e: any) {
        await addNote(id, `⚠ Товарителницата не се създаде автоматично: ${e.message}`, null, AI);
        out.waybillError = e.message;
      }
    }
    return out;
  }
  const details = [summary, outcome === "canceled" && t(r.cancel_reason), deliveryChange && `доставка: ${deliveryChange}`, orderChange && `промяна: ${orderChange}`, t(r.callback_when) && `кога: ${t(r.callback_when)}`, t(r.questions) && `въпроси: ${t(r.questions)}`].filter(Boolean);
  await addNote(id, `AI: ${LABEL[outcome] || outcome}${details.length ? ` – ${details.join("; ")}` : ""}`, null, AI);
  return out;
}
