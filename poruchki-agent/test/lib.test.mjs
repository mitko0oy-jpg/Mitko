import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { normalizePhoneBG, moneyBG, itemsTextBG, inCallingHours, formalNameBG, spoken } from "../lib/format.mjs";
import { verifySignature, readPostCall } from "../lib/elevenlabs.mjs";
import { applyOutcome, buildMessage, MAX_ATTEMPTS } from "../lib/policy.mjs";

test("phone numbers", () => {
  assert.equal(normalizePhoneBG("0888 123 456"), "+359888123456");
  assert.equal(normalizePhoneBG("+359 888 123 456"), "+359888123456");
  assert.equal(normalizePhoneBG("359888123456"), "+359888123456");
  assert.equal(normalizePhoneBG("00359 88 812 3456"), "+359888123456");
  assert.equal(normalizePhoneBG("+359 0888123456"), "+359888123456");
  assert.equal(normalizePhoneBG("888123456"), "+359888123456");
  assert.equal(normalizePhoneBG("02 987 6543"), "+35929876543");
  assert.equal(normalizePhoneBG("0888 12"), null);
  assert.equal(normalizePhoneBG("+421 905 123 456"), null);
  assert.equal(normalizePhoneBG(""), null);
});

test("money in words", () => {
  assert.equal(moneyBG(27.4), "27 евро и 40 цента");
  assert.equal(moneyBG(20), "20 евро");
  assert.equal(moneyBG(0.01), "1 цент");
  assert.equal(moneyBG(34.4), "34 евро и 40 цента");
});

test("items text", () => {
  assert.equal(
    itemsTextBG([
      { name: "BeeVenom Care Gel 2+1 броя", qty: 1, price: 19.9 },
      { name: "Подарък 8 бр. пластири за стави и мускули", qty: 1, price: 0 },
    ]),
    "BeeVenom Care Gel 2 плюс 1 броя, и подарък: 8 броя пластири за стави и мускули",
  );
  assert.equal(itemsTextBG([{ name: "Пластири с пчелна отрова", qty: 2, price: 7.8 }]), "2 броя Пластири с пчелна отрова");
});

test("calling hours in Sofia time", () => {
  // 2026-11-12 is winter time: Sofia = UTC+2.
  assert.equal(inCallingHours("10:00-20:00", new Date("2026-11-12T07:59:00Z")), false); // 09:59
  assert.equal(inCallingHours("10:00-20:00", new Date("2026-11-12T08:00:00Z")), true); // 10:00
  assert.equal(inCallingHours("10:00-20:00", new Date("2026-11-12T17:59:00Z")), true); // 19:59
  assert.equal(inCallingHours("10:00-20:00", new Date("2026-11-12T18:00:00Z")), false); // 20:00
  // Summer time: Sofia = UTC+3.
  assert.equal(inCallingHours("10:00-20:00", new Date("2026-07-01T07:00:00Z")), true); // 10:00
});

test("webhook signature (same scheme as the official SDK)", () => {
  const secret = "wsec_test";
  const body = JSON.stringify({ type: "post_call_transcription", data: {} });
  const t = Math.floor(Date.now() / 1000);
  const sig = "v0=" + createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(verifySignature(body, `t=${t},${sig}`, secret), true);
  assert.equal(verifySignature(body + " ", `t=${t},${sig}`, secret), false);
  assert.equal(verifySignature(body, `t=${t},${sig}`, "other"), false);
  assert.equal(verifySignature(body, `t=${t - 3600},${sig}`, secret), false);
  assert.equal(verifySignature(body, "", secret), false);
});

test("read post-call payload", () => {
  const p = readPostCall({
    type: "post_call_transcription",
    data: {
      conversation_id: "conv_1",
      transcript: [
        { role: "agent", message: "Здравейте!" },
        { role: "user", message: "Да, аз съм." },
      ],
      analysis: {
        transcript_summary: "Клиентът потвърди.",
        data_collection_results: {
          outcome: { data_collection_id: "outcome", value: "Confirmed" },
          allergy_or_health: { value: false },
          delivery_change: { value: null },
        },
        evaluation_criteria_results: { no_health_claims: { result: "failure" }, ai_disclosed: { result: "success" } },
      },
      conversation_initiation_client_data: { dynamic_variables: { order_key: "bg:1703" } },
    },
  });
  assert.equal(p.outcome, "confirmed");
  assert.equal(p.health, false);
  assert.equal(p.deliveryChange, "");
  assert.equal(p.variables.order_key, "bg:1703");
  assert.deepEqual(p.failedChecks, ["no_health_claims"]);
  assert.match(p.transcript, /Асистент: Здравейте!\nКлиент: Да, аз съм\./);
});

test("retry policy", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  let r = applyOutcome({ attempts: 1, state: "calling" }, { outcome: "voicemail" }, now);
  assert.equal(r.rec.state, "queued");
  assert.equal(r.rec.nextAttemptAt, "2026-11-12T11:00:00.000Z");
  assert.equal(r.notify, false);
  r = applyOutcome({ attempts: 2, state: "calling" }, { outcome: "no-answer" }, now);
  assert.equal(r.rec.nextAttemptAt, "2026-11-13T07:00:00.000Z"); // next day, 21 h later
  r = applyOutcome({ attempts: MAX_ATTEMPTS, state: "calling" }, { outcome: "busy" }, now);
  assert.equal(r.rec.state, "gave_up");
  assert.equal(r.notify, true);
  r = applyOutcome({ attempts: 1 }, { outcome: "confirmed" }, now);
  assert.equal(r.rec.state, "done");
  r = applyOutcome({ attempts: 1 }, { outcome: "needs_human" }, now);
  assert.equal(r.rec.state, "needs_mitko");
  assert.equal(r.notify, true);
});

test("telegram message escapes and is short", () => {
  const msg = buildMessage(
    { orderNo: 1703, site: "bg", name: "Иван <script>", phone: "+359888123456", itemsText: "Гел", totalText: "20 евро" },
    "✅ Потвърдена",
    { summary: "ok", transcript: "x".repeat(5000), failedChecks: [] },
    { testMode: true },
  );
  assert.match(msg, /^🧪 ТЕСТ/);
  assert.match(msg, /Иван &lt;script&gt;/);
  assert.ok(msg.length <= 4000);
});

test("polite form of the name", () => {
  assert.equal(formalNameBG("Иван Георгиев"), "господин Георгиев");
  assert.equal(formalNameBG("мария петрова"), "госпожа Петрова");
  assert.equal(formalNameBG("Петър Иванов Стоянов"), "господин Стоянов");
  assert.equal(formalNameBG("Ана Маринска"), "госпожа Маринска");
  assert.equal(formalNameBG("Maria Petrova"), "госпожа Petrova");
  assert.equal(formalNameBG("Мария"), "");
  assert.equal(formalNameBG("Мария Х."), "");
});

test("product names read aloud", () => {
  assert.equal(spoken("Кутия Билкови пластири 12бр."), "Кутия Билкови пластири 12 броя");
  assert.equal(spoken("Пчелна отрова Пакет 3+2 бр."), "Пчелна отрова Пакет 3 плюс 2 броя");
  assert.equal(spoken("Bee Venom крем за стави 30 г"), "Bee Venom крем за стави 30 грама");
  assert.equal(spoken("Подарък 8 бр. пластири"), "Подарък 8 броя пластири");
  assert.equal(spoken("Гел 50 мл"), "Гел 50 милилитра");
  assert.equal(spoken("BeeVenom Care Gel"), "BeeVenom Care Gel");
});
