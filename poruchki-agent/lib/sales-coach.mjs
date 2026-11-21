// Learning from every feedback call that did not end with an order.
//
// 1. The result of each feedback call is kept for review (lib/coach.mjs, kind "feedback").
// 2. Every tick, Claude looks at the newest call without a sale: the real reason the
//    customer did not order, what Елена could have done better, and at most ONE new
//    rule for the script.
// 3. Mitko gets it in Telegram right away: /da_N adds the rule, /ne_N drops it.
//    Approved rules live in coach/fb-rules and are added to the feedback script at the
//    start of every call (lib/callback.mjs) – from the next call, no deploy.
// 4. Sales are counted against the goal (20–25% of real conversations end with an order).
import { askJson, COACH_MODEL } from "./ai.mjs";
import { sofiaDay } from "./coach.mjs";
import { feedbackFields } from "./feedback.mjs";

export const MAX_FB_RULES = 15;
export const SALES_GOAL = { from: 20, to: 25 }; // % of real conversations
const RULES_KEY = "coach/fb-rules";
const PROP_PREFIX = "coach/fb-prop/";
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Outcomes that are not a real conversation about the gel (nobody to sell to).
const NOT_A_TALK = new Set(["no_conversation", "voicemail", "wrong_number", "wrong_person", "busy", ""]);
export const isSale = (outcome) => outcome === "reorder";
export const isTalk = (outcome) => !NOT_A_TALK.has(String(outcome || ""));

export async function getFbRules(store) {
  return (await store.get(RULES_KEY, { type: "json" }))?.items || [];
}

/** Added to the feedback script at the start of every call. */
export function fbRulesSection(items) {
  if (!items?.length) return "";
  return `\n\n# Научено от истински разговори\n\nТези правила са от разговорите ти с клиенти. Спазвай ги, освен ако противоречат на правилата по-горе (без натиск, без медицински твърдения, суми само от данните).\n${items.map((l) => `- ${l.text}`).join("\n")}\n`;
}

const REASONS_BG = {
  has_stock: "още има гел",
  no_need: "няма нужда сега",
  price: "цената",
  not_satisfied: "не е доволен",
  side_effect: "нежелана реакция",
  distrust: "недоверие",
  later: "иска по-късно",
  agent_mistake: "грешка на асистента",
  no_offer_made: "не чу предложение",
  other: "друго",
};

const SYSTEM = `Ти си опитен треньор по телефонни продажби за малък български онлайн магазин.
Асистентката Елена (изкуствен интелект, представя се като дигитален асистент) звъни на стари клиенти, купили козметичен гел с пчелна отрова за ставите. Първо пита дали са доволни, после – само ако са доволни – предлага повторна поръчка: три гела на цената на един (15,90 €) или за 4 € повече пет гела, подарък дванайсет билкови лепенки; при „скъпо“ – един гел за 9,90 €; после златно мляко или чай като добавка. Клиентите са предимно възрастни хора.
Целта е 20–25% от разговорите да завършват с поръчка – с уважение и без натиск.

Получаваш стенограмата на разговор, който НЕ завърши с поръчка (разпозната реч – странни думи на клиента може да са грешки на разпознаването), и вече одобрените правила.
Върни:
- reason: истинската причина да не поръча – точно една от: has_stock, no_need, price, not_satisfied, side_effect, distrust, later, agent_mistake, no_offer_made, other;
- summary: едно изречение какво стана;
- agent_part: какво конкретно асистентката можеше да каже или направи по-добре (едно-две изречения), или празно, ако тя е постъпила добре;
- rule: ЕДНО ново кратко правило към асистентката („Когато…, кажи…“), което би увеличило шанса за поръчка в подобни разговори. Празно, ако причината не зависи от нея, ако правилото вече го има в одобрените, или ако би било натиск;
- why: защо това правило ще помогне – едно изречение.
Правилото НЕ може: да казва или намеква, че продуктът лекува или маха болка; да предлага повече от веднъж или да настоява; да измисля цени, отстъпки, подаръци или срокове; да смята суми; да крие, че е дигитален асистент.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reason", "summary", "agent_part", "rule", "why"],
  properties: {
    reason: { type: "string" },
    summary: { type: "string" },
    agent_part: { type: "string" },
    rule: { type: "string" },
    why: { type: "string" },
  },
};

async function nextPropNo(store) {
  return (await store.list({ prefix: PROP_PREFIX })).blobs.length + 1;
}

/**
 * Look at feedback calls without a sale (today and yesterday), at most `max` per run,
 * and tell Mitko right away.
 */
export async function salesReviewPending({ store, env, fetchImpl, notify }, now = new Date(), { max = 1 } = {}) {
  const days = [sofiaDay(now), sofiaDay(new Date(now.getTime() - 86_400_000))];
  let done = 0;
  for (const day of days) {
    for (const { key } of (await store.list({ prefix: `review/${day}/` })).blobs) {
      if (done >= max) return { sales: done };
      const rec = await store.get(key, { type: "json" });
      if (!rec || rec.kind !== "feedback" || rec.salesReviewed || (rec.salesErrors || 0) >= 2) continue;
      // A sale, or no real conversation: nothing to learn from here.
      if (isSale(rec.outcome) || !isTalk(rec.outcome) || !/^Клиент:/m.test(rec.transcript || "")) {
        await store.setJSON(key, { ...rec, salesReviewed: true });
        continue;
      }
      try {
        const rules = await getFbRules(store);
        const r = await askJson({
          env,
          fetchImpl,
          system: SYSTEM,
          user: JSON.stringify({ transcript: rec.transcript, existing_rules: rules.map((l) => l.text) }),
          schema: SCHEMA,
          model: env("COACH_MODEL") || COACH_MODEL,
          maxTokens: 700,
        });
        const reason = REASONS_BG[r.reason] ? r.reason : "other";
        const rule = String(r.rule || "").trim().slice(0, 300);
        let no = null;
        if (rule && !rules.some((l) => l.text === rule)) {
          no = await nextPropNo(store);
          await store.setJSON(`${PROP_PREFIX}${String(no).padStart(4, "0")}`, { no, text: rule, why: String(r.why || "").slice(0, 300), at: now.toISOString(), conversationId: rec.conversationId, status: "proposed" });
        }
        await store.setJSON(key, { ...rec, salesReviewed: true, sales: { reason, summary: String(r.summary || "").slice(0, 300), agentPart: String(r.agent_part || "").slice(0, 400), proposal: no } });
        const lines = [
          `🎓 <b>Урок от разговор${rec.orderNo ? ` #${esc(rec.orderNo)}` : ""}</b> – не поръча`,
          `Причина: ${esc(REASONS_BG[reason])}`,
          r.summary ? esc(r.summary) : "",
          r.agent_part ? `Можеше по-добре: ${esc(r.agent_part)}` : "Елена е постъпила добре – причината не зависи от нея.",
          no ? `\n💡 Ново правило: „${esc(rule)}“\n${r.why ? `(${esc(r.why)})\n` : ""}✅ /da_${no} – добави го · ❌ /ne_${no} – не` : "",
        ].filter(Boolean);
        await notify(lines.join("\n"));
        done++;
      } catch (err) {
        if (err.code === "ai_unavailable") return { sales: done, aiOff: true };
        console.error("sales review failed", key, err.message);
        await store.setJSON(key, { ...rec, salesErrors: (rec.salesErrors || 0) + 1 });
        done++;
      }
    }
  }
  return { sales: done };
}

async function getProp(store, no) {
  return store.get(`${PROP_PREFIX}${String(no).padStart(4, "0")}`, { type: "json" });
}

/** /da_N */
export async function approveFbRule(store, no, now = new Date()) {
  const p = await getProp(store, no);
  if (!p) return `Няма предложение №${no}.`;
  if (p.status !== "proposed") return p.status === "added" ? "Това правило вече е добавено." : "Това предложение е отказано.";
  const rules = await getFbRules(store);
  if (rules.length >= MAX_FB_RULES) return `⚠️ Вече има ${MAX_FB_RULES} правила – махни някое с /mahni_p_N (виж /pravila).`;
  rules.push({ text: p.text, at: now.toISOString() });
  await store.setJSON(RULES_KEY, { items: rules });
  await store.setJSON(`${PROP_PREFIX}${String(no).padStart(4, "0")}`, { ...p, status: "added" });
  return `✅ Добавено – важи от следващия разговор:\n• ${esc(p.text)}\n\nВсички правила: /pravila`;
}

/** /ne_N */
export async function rejectFbRule(store, no) {
  const p = await getProp(store, no);
  if (!p) return `Няма предложение №${no}.`;
  await store.setJSON(`${PROP_PREFIX}${String(no).padStart(4, "0")}`, { ...p, status: "rejected" });
  return "Добре, не го добавям.";
}

/** /pravila */
export async function fbRulesList(store) {
  const items = await getFbRules(store);
  if (!items.length) return "Още няма научени правила за обратната връзка. Идват след разговорите без продажба.";
  return ["<b>Какво е научила от разговорите (обратна връзка):</b>", ...items.map((l, i) => `${i + 1}. ${esc(l.text)} – /mahni_p_${i + 1}`)].join("\n");
}

/** /mahni_p_N */
export async function removeFbRule(store, n) {
  const items = await getFbRules(store);
  const gone = items[n - 1];
  if (!gone) return `Няма правило №${n}. Виж /pravila.`;
  items.splice(n - 1, 1);
  await store.setJSON(RULES_KEY, { items });
  return `🗑 Махнах: ${esc(gone.text)}`;
}

/** Sales against the goal, from the feedback results of the last `days` days. */
export async function salesStats(store, now = new Date(), days = 30) {
  let talks = 0;
  let sales = 0;
  for (const { key } of (await store.list({ prefix: "feedback/" })).blobs) {
    const r = await store.get(key, { type: "json" });
    if (!r?.at || now - new Date(r.at) > days * 86_400_000) continue;
    if (!isTalk(r.outcome)) continue;
    talks++;
    if (isSale(r.outcome) && /[135]/.test(String(r.reorderPack || ""))) sales++;
  }
  const pct = talks ? Math.round((sales / talks) * 100) : 0;
  return { talks, sales, pct };
}

export function salesText({ talks, sales, pct }) {
  if (!talks) return "Продажби: още няма проведени разговори.";
  const mark = pct >= SALES_GOAL.from ? "✅" : "📈";
  return `${mark} Продажби: ${sales} от ${talks} разговора (${pct}%) · цел ${SALES_GOAL.from}–${SALES_GOAL.to}%`;
}

/** Kept for the review: the feedback outcome, not the order agent's own field. */
export function feedbackOutcome(call) {
  return String(feedbackFields(call?.fields || {}).outcome || "").toLowerCase();
}
