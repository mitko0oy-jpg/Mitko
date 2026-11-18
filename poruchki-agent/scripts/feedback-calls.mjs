#!/usr/bin/env node
// Feedback calls, one after another: each call waits for the previous one to end.
// The list (customer data) stays outside git: a JSON array of
//   {label, name, phone, city, address, items: [{name, q}], deliveredAt}
//
//   ELEVENLABS_API_KEY=… EL_FEEDBACK_AGENT_ID=… EL_PHONE_NUMBER_ID=… \
//     node scripts/feedback-calls.mjs <list.json> [--only 1649,1641] [--to +359…] [--dry] [--tries 3]
//
// --to   calls this number instead (a test; the result is marked 🧪 and not saved)
// --dry  only prints what the agent would say
// --tries  how many times to try when the line drops the call before anyone could answer (default 3)
import fs from "node:fs";
import { feedbackVariables } from "../lib/feedback.mjs";
import { normalizePhoneBG, inCallingHours, sofiaNow } from "../lib/format.mjs";
import { startCall } from "../lib/elevenlabs.mjs";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const list = JSON.parse(fs.readFileSync(args[0], "utf8"));
const only = opt("only")?.split(",");
const to = opt("to");
const dry = args.includes("--dry");
const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.EL_FEEDBACK_AGENT_ID;
const phoneNumberId = process.env.EL_PHONE_NUMBER_ID;
if (!dry && (!key || !agentId || !phoneNumberId)) throw new Error("ELEVENLABS_API_KEY, EL_FEEDBACK_AGENT_ID and EL_PHONE_NUMBER_ID are needed");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function result(id) {
  for (let i = 0; i < 60; i++) {
    await wait(10_000);
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, { headers: { "xi-api-key": key } });
    const d = await r.json();
    if (["done", "failed"].includes(d.status)) {
      const dc = d.analysis?.data_collection_results || {};
      const spoke = (d.transcript || []).some((t) => t.role === "user" && t.message);
      return { secs: d.metadata?.call_duration_secs, outcome: dc.outcome?.value || d.status, summary: dc.summary?.value || "", spoke, ring: await ringSecs(id) };
    }
  }
  return { outcome: "still running" };
}

// Seconds from our INVITE to the answer. Some Zadarma routes "answer" after ~2.5 s,
// before the customer's phone could be picked up, and drop the call ~4 s later.
// Such a call never reached the customer, so it is tried again.
async function ringSecs(id) {
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}/sip-messages`, { headers: { "xi-api-key": key } });
    const msgs = (await r.json()).sip_messages || [];
    const at = (p) => msgs.filter((m) => String(m.raw_message || "").startsWith(p)).at(-1)?.created_at_unix_micro;
    const inv = at("INVITE");
    const ack = at("ACK");
    return inv && ack ? (ack - inv) / 1e6 : null;
  } catch {
    return null;
  }
}
const lineFault = (r) => !r.spoke && (r.secs ?? 99) <= 8 && r.ring != null && r.ring < 5;
const TRIES = Number(opt("tries") || 3);

for (const order of list.filter((o) => !only || only.includes(String(o.label)))) {
  const variables = feedbackVariables(order);
  const phone = normalizePhoneBG(to || order.phone);
  if (to) variables.test = "yes";
  if (dry) {
    console.log(`#${order.label} ${variables.customer_name} | ${variables.bought_text} | ${variables.delivered_ago} | ${variables.main_offer} = ${variables.main_total} | ${variables.delivery_text}`);
    continue;
  }
  const now = sofiaNow();
  if (!to && (now.weekday === 0 || !inCallingHours("10:00-19:30"))) {
    console.log("Outside calling hours (Mon–Sat 10:00–19:30) – stopping.");
    break;
  }
  if (!phone) {
    console.log(`#${order.label}: no valid phone – skipped`);
    continue;
  }
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const { conversationId } = await startCall({ apiKey: key, agentId, phoneNumberId, to: phone, variables });
      const r = await result(conversationId);
      if (lineFault(r)) {
        console.log(`#${order.label}: line fault (answered after ${r.ring.toFixed(1)} s, dropped) – try ${attempt}/${TRIES}`);
        await wait(90_000);
        continue;
      }
      console.log(`#${order.label}: ${r.outcome} (${r.secs ?? "?"} s, rang ${r.ring?.toFixed(1) ?? "?"} s) ${r.summary}`);
    } catch (err) {
      console.log(`#${order.label}: call failed – ${err.message}`);
    }
    break;
  }
  await wait(20_000); // let the line free up before the next call
}
