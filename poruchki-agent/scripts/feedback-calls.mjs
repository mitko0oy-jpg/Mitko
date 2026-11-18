#!/usr/bin/env node
// Feedback calls, one after another: each call waits for the previous one to end.
// The list (customer data) stays outside git: a JSON array of
//   {label, name, phone, city, address, items: [{name, q}], deliveredAt}
//
//   ELEVENLABS_API_KEY=… EL_FEEDBACK_AGENT_ID=… EL_PHONE_NUMBER_ID=… \
//     node scripts/feedback-calls.mjs <list.json> [--only 1649,1641] [--to +359…] [--dry]
//
// --to   calls this number instead (a test; the result is marked 🧪 and not saved)
// --dry  only prints what the agent would say
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
      return { secs: d.metadata?.call_duration_secs, outcome: dc.outcome?.value || d.status, summary: dc.summary?.value || "" };
    }
  }
  return { outcome: "still running" };
}

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
  try {
    const { conversationId } = await startCall({ apiKey: key, agentId, phoneNumberId, to: phone, variables });
    const r = await result(conversationId);
    console.log(`#${order.label}: ${r.outcome} (${r.secs ?? "?"} s) ${r.summary}`);
  } catch (err) {
    console.log(`#${order.label}: call failed – ${err.message}`);
  }
  await wait(20_000); // let the line free up before the next call
}
