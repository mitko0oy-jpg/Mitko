// Learning from real calls.
//
// 1. After every call the transcript is kept for 60 days under review/<day>/<conversation>.
// 2. A few minutes later (tick) Claude reviews each call: how natural, clear and
//    correct the agent was, and the exact words that went wrong.
// 3. At 21:15 Sofia time Mitko gets one Telegram report for the day: scores, the
//    mistakes with quotes, voice A/B numbers, and up to 3 proposed new rules.
// 4. A rule is used only after Mitko taps /urok_N. Approved rules live in
//    coach/lessons and are added to the agent's script at the start of every call
//    (lib/callback.mjs) – nothing in ElevenLabs is rewritten, and /mahni_N removes one.
import { askJson, REVIEW_MODEL, COACH_MODEL } from "./ai.mjs";
import { PERSONAS } from "./persona.mjs";

export const MAX_LESSONS = 12;
export const DIGEST_AT = { hour: 21, minute: 15 }; // Sofia time, after the last calls
const KEEP_DAYS = 60;
const LESSONS_KEY = "coach/lessons";
const PROPOSAL_KEY = "coach/proposal";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "2026-11-20" in Sofia. */
export function sofiaDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function reviewKind(variables = {}) {
  if (variables.campaign === "feedback") return "feedback";
  if (variables.order_key === "test") return "test";
  if (variables.order_key) return "order";
  return "inbound";
}

/** Keep a finished call for review. */
export async function saveReview(store, call, now = new Date()) {
  if (!call?.conversationId || !call.transcript) return null;
  const v = call.variables || {};
  const key = `review/${sofiaDay(now)}/${call.conversationId}`;
  await store.setJSON(key, {
    at: now.toISOString(),
    conversationId: call.conversationId,
    kind: reviewKind(v),
    orderNo: v.order_number || "",
    persona: v.persona || "elena",
    voice: v.voice_id || "",
    // Feedback calls: their own outcome (the incoming agent collects it as fb_outcome).
    outcome: String((v.campaign === "feedback" && (call.fields?.fb_outcome || call.fields?.outcome)) || call.outcome || "").toLowerCase(),
    upsell: call.upsell || "",
    durationSecs: call.durationSecs ?? null,
    failedChecks: call.failedChecks || [],
    transcript: String(call.transcript).slice(0, 8000),
    reviewed: false,
  });
  return key;
}

const REVIEW_SYSTEM = `Ти си строг, но справедлив треньор на гласов асистент. Асистентът звъни на български клиенти на малък онлайн магазин, за да потвърди поръчка с наложен платеж, или отговаря на входящи обаждания.
Получаваш стенограмата на един разговор (Асистент / Клиент). Тя е от разпознаване на реч: странни думи на клиента може да са грешка на разпознаването – не ги броиш срещу асистента, освен ако той е отговорил на нещо, което клиентът явно не е казал. Тагове в квадратни скоби като [warmly] са указания за гласа и не се чуват.

Оцени от 1 до 5:
- natural: звучи ли като жив, приветлив човек – кратки реплики, без заучени фрази и без да хвали всеки отговор, реагира на казаното;
- clear: ясно и разбираемо ли говори – по едно нещо, без излишни подробности, продуктите на български;
- correct: вярна ли е информацията и спазва ли правилата – не обещава непознати неща, не казва, че продуктът лекува, не натиска, казва сумите точно.

issues: до 4 конкретни грешки на асистента. За всяка: kind (robotic, repetition, too_long, misunderstood, wrong_fact, health_claim, pushy, missed_step, english, other), quote – точните думи на асистента (до 15 думи), fix – как трябваше да го каже или направи, едно изречение на български.
good: до 2 неща, които асистентът направи добре.
Ако няма грешки, issues е празен. Не измисляй грешки.`;

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["natural", "clear", "correct", "issues", "good"],
  properties: {
    natural: { type: "integer" },
    clear: { type: "integer" },
    correct: { type: "integer" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "quote", "fix"],
        properties: { kind: { type: "string" }, quote: { type: "string" }, fix: { type: "string" } },
      },
    },
    good: { type: "array", items: { type: "string" } },
  },
};

const clamp = (n) => Math.max(1, Math.min(5, Math.round(Number(n) || 0))) || null;

/**
 * Review calls that are not reviewed yet (today and yesterday), at most `max` per run.
 * @returns {Promise<{reviewed: number, aiOff?: boolean}>}
 */
export async function reviewPending({ store, env, fetchImpl }, now = new Date(), { max = 2 } = {}) {
  const days = [sofiaDay(now), sofiaDay(new Date(now.getTime() - 86_400_000))];
  let reviewed = 0;
  for (const day of days) {
    for (const { key } of (await store.list({ prefix: `review/${day}/` })).blobs) {
      if (reviewed >= max) return { reviewed };
      const rec = await store.get(key, { type: "json" });
      if (!rec || rec.reviewed || (rec.reviewErrors || 0) >= 2) continue;
      if (!/^Клиент:/m.test(rec.transcript || "")) {
        await store.setJSON(key, { ...rec, reviewed: true, review: null });
        continue;
      }
      try {
        const r = await askJson({ env, fetchImpl, system: REVIEW_SYSTEM, user: `Стенограма:\n${rec.transcript}`, schema: REVIEW_SCHEMA, model: env("REVIEW_MODEL") || REVIEW_MODEL, maxTokens: 900 });
        const review = {
          natural: clamp(r.natural),
          clear: clamp(r.clear),
          correct: clamp(r.correct),
          issues: (r.issues || []).slice(0, 4).map((i) => ({ kind: String(i.kind || "other"), quote: String(i.quote || "").slice(0, 160), fix: String(i.fix || "").slice(0, 300) })),
          good: (r.good || []).slice(0, 2).map((g) => String(g).slice(0, 200)),
        };
        await store.setJSON(key, { ...rec, reviewed: true, review });
        reviewed++;
      } catch (err) {
        if (err.code === "ai_unavailable") return { reviewed, aiOff: true };
        console.error("review failed", key, err.message);
        await store.setJSON(key, { ...rec, reviewErrors: (rec.reviewErrors || 0) + 1 });
        reviewed++; // counts against this run's budget
      }
    }
  }
  return { reviewed };
}

export async function getLessons(store) {
  return (await store.get(LESSONS_KEY, { type: "json" }))?.items || [];
}

/** The part added to the agent's script at the start of every call. */
export function lessonsSection(items) {
  if (!items?.length) return "";
  return `\n\n# Научено от истински разговори\n\nТези правила са от прегледа на твоите разговори. Спазвай ги, освен ако противоречат на правилата по-горе.\n${items.map((l) => `- ${l.text}`).join("\n")}\n`;
}

/** Voice A/B over the last `days` days: order calls only. */
export async function abStats(store, now = new Date(), days = 30) {
  const from = sofiaDay(new Date(now.getTime() - days * 86_400_000));
  const by = {};
  for (const { key } of (await store.list({ prefix: "review/" })).blobs) {
    if (key.split("/")[1] < from) continue;
    const r = await store.get(key, { type: "json" });
    if (!r || r.kind !== "order") continue;
    const s = (by[r.persona || "elena"] ||= { calls: 0, confirmed: 0, upsell: 0 });
    s.calls++;
    if (r.outcome === "confirmed") s.confirmed++;
    if (["one_box", "two_boxes"].includes(r.upsell)) s.upsell++;
  }
  return by;
}

export function abText(by) {
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const lines = Object.entries(PERSONAS)
    .filter(([id]) => by[id])
    .map(([id, name]) => {
      const s = by[id];
      return `${name}: ${s.calls} разговора, потвърдени ${s.confirmed} (${pct(s.confirmed, s.calls)}%), с пластири ${s.upsell} (${pct(s.upsell, s.calls)}%)`;
    });
  if (!lines.length) return "Още няма разговори по поръчки за сравнение.";
  const few = Object.values(by).some((s) => s.calls < 30) || Object.keys(by).length < 2;
  return lines.join("\n") + (few ? "\n<i>Още е рано за извод – трябват поне по 30 разговора на глас.</i>" : "");
}

const COACH_SYSTEM = `Ти си треньор на гласов асистент, който говори с български клиенти на онлайн магазин (потвърждение на поръчки с наложен платеж, гел с пчелна отрова и билкови пластири).
Получаваш грешките от днешните разговори (с цитати и как е трябвало) и правилата, които асистентът вече е научил.
1. summary: две изречения на български – как мина денят като цяло.
2. lessons: до 3 нови правила, всяко едно кратко изречение на български към асистента („Когато…, кажи…“ или „Не…, а…“), които ще предотвратят грешките. Предпочитай грешки, които се повтарят в повече от един разговор, и сериозните (грешен факт, обещание, медицинско твърдение) дори да са веднъж. why: в едно изречение защо.
Не предлагай правило, което вече го има или противоречи на основните: не казва, че продуктът лекува; не натиска; не смята суми сам; представя се като дигитален асистент. Ако няма какво да се научи, lessons е празен.`;

const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "lessons"],
  properties: {
    summary: { type: "string" },
    lessons: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text", "why"], properties: { text: { type: "string" }, why: { type: "string" } } },
    },
  },
};

const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–");

/**
 * The day's report for Mitko (also stores the proposed rules for /urok_N).
 * @returns {Promise<string|null>} Telegram text, or null when there were no calls
 */
export async function buildDigest({ store, env, fetchImpl }, now = new Date(), day = sofiaDay(now)) {
  const reviews = [];
  for (const { key } of (await store.list({ prefix: `review/${day}/` })).blobs) {
    const r = await store.get(key, { type: "json" });
    if (r) reviews.push(r);
  }
  if (!reviews.length) return null;
  const done = reviews.filter((r) => r.review);
  const issues = done.flatMap((r) => r.review.issues.map((i) => ({ ...i, persona: r.persona })));
  const lessons = await getLessons(store);

  let summary = "";
  let proposed = [];
  if (issues.length) {
    try {
      const out = await askJson({
        env,
        fetchImpl,
        system: COACH_SYSTEM,
        user: JSON.stringify({ issues: issues.map(({ kind, quote, fix }) => ({ kind, quote, fix })), existing_rules: lessons.map((l) => l.text) }),
        schema: COACH_SCHEMA,
        model: env("COACH_MODEL") || COACH_MODEL,
        maxTokens: 900,
      });
      summary = String(out.summary || "");
      proposed = (out.lessons || []).slice(0, 3).map((l) => ({ text: String(l.text).slice(0, 300), why: String(l.why || "").slice(0, 300) }));
    } catch (err) {
      summary = `⚠️ Не успях да обобщя деня: ${String(err.message).slice(0, 150)}`;
    }
  }
  await store.setJSON(PROPOSAL_KEY, { day, at: now.toISOString(), lessons: proposed, used: [] });

  const [, m, d] = day.split("-");
  const lines = [`🎓 <b>Разговорите на ${d}.${m}</b> – ${reviews.length} (${done.length} прегледани)`];
  if (!done.length) lines.push("<i>AI прегледът на разговорите още не е минал (или не е включен в Netlify).</i>");
  if (done.length) {
    lines.push(`Естественост ${avg(done.map((r) => r.review.natural))} · яснота ${avg(done.map((r) => r.review.clear))} · точност ${avg(done.map((r) => r.review.correct))} (от 5)`);
  }
  const by = await abStats(store, now);
  if (Object.keys(by).length > 1) lines.push("", "<b>Елена срещу Александра (30 дни):</b>", abText(by));
  if (summary) lines.push("", esc(summary));
  if (issues.length) {
    lines.push("", "<b>Какво да се поправи:</b>");
    for (const i of issues.slice(0, 6)) lines.push(`• „${esc(i.quote)}“ → ${esc(i.fix)}`);
  } else if (done.length) {
    lines.push("", "Без забележки днес 👍");
  }
  if (proposed.length) {
    lines.push("", "<b>Предлагам да науча:</b>");
    proposed.forEach((l, n) => lines.push(`${n + 1}. ${esc(l.text)}\n   <i>${esc(l.why)}</i>\n   👉 /urok_${n + 1}`));
    lines.push("", "/uroci_vsichki – всички · /uroci_ne – нито едно");
  }
  return lines.join("\n");
}

/**
 * Approve proposed rules: "all" or a list of numbers from the last report.
 * @returns {Promise<string>} reply for Telegram
 */
export async function approveLessons(store, which, now = new Date()) {
  const proposal = await store.get(PROPOSAL_KEY, { type: "json" });
  if (!proposal?.lessons?.length) return "Няма предложени уроци. Те идват с вечерния преглед.";
  const nums = which === "all" ? proposal.lessons.map((_, i) => i + 1) : which;
  const lessons = await getLessons(store);
  const added = [];
  for (const n of nums) {
    const l = proposal.lessons[n - 1];
    if (!l) return `Няма урок №${n} в последния преглед.`;
    if ((proposal.used || []).includes(n) || lessons.some((x) => x.text === l.text)) continue;
    if (lessons.length >= MAX_LESSONS) {
      await store.setJSON(LESSONS_KEY, { items: lessons });
      return `⚠️ Елена вече има ${MAX_LESSONS} урока – махни някой с /mahni_N (виж /uroci).`;
    }
    lessons.push({ text: l.text, at: now.toISOString() });
    proposal.used = [...(proposal.used || []), n];
    added.push(l.text);
  }
  await store.setJSON(LESSONS_KEY, { items: lessons });
  await store.setJSON(PROPOSAL_KEY, proposal);
  if (!added.length) return "Това вече е научено.";
  return `✅ Научено (важи от следващото обаждане):\n${added.map((t) => `• ${esc(t)}`).join("\n")}\n\nВсички уроци: /uroci`;
}

export async function dismissProposal(store) {
  const proposal = await store.get(PROPOSAL_KEY, { type: "json" });
  if (proposal) await store.setJSON(PROPOSAL_KEY, { ...proposal, lessons: [] });
  return "Добре, не добавям нищо от днешния преглед.";
}

export async function lessonsList(store) {
  const items = await getLessons(store);
  if (!items.length) return "Още няма научени уроци. Идват с вечерния преглед на разговорите.";
  return ["<b>Какво е научила от разговорите:</b>", ...items.map((l, i) => `${i + 1}. ${esc(l.text)} – /mahni_${i + 1}`)].join("\n");
}

export async function removeLesson(store, n) {
  const items = await getLessons(store);
  const gone = items[n - 1];
  if (!gone) return `Няма урок №${n}. Виж /uroci.`;
  items.splice(n - 1, 1);
  await store.setJSON(LESSONS_KEY, { items });
  return `🗑 Махнах: ${esc(gone.text)}`;
}

/** Old transcripts go after 60 days. */
export async function purgeReviews(store, now = new Date()) {
  const from = sofiaDay(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
  let n = 0;
  for (const { key } of (await store.list({ prefix: "review/" })).blobs) {
    if (key.split("/")[1] < from) {
      await store.delete(key);
      n++;
    }
  }
  return n;
}
