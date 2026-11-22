// One phone line: Zadarma connects every callback to the same number, and ElevenLabs does not see the customer's
// number, so only one call may connect or run at a time. The queues (feedback „fb-“, невзета пратка „pk-“) ask here
// before starting a call.
import { PENDING_TTL_MIN } from "./callback.mjs";

const QUEUES = { "fb-": "feedback call in progress", "pk-": "pickup call in progress" };

/** Why the line is busy for a queue (its own prefix is checked by the queue itself), or "" when it is free. */
export async function lineBusy(store, now = new Date(), own = "") {
  for (const { key } of (await store.list({ prefix: "pending/" })).blobs) {
    const p = await store.get(key, { type: "json" });
    if (p && now - new Date(p.at) < PENDING_TTL_MIN * 60_000) return "another call is connecting";
  }
  for (const [prefix, why] of Object.entries(QUEUES)) {
    if (prefix === own) continue;
    for (const { key } of (await store.list({ prefix })).blobs) {
      if (key.startsWith("fb-called/")) continue;
      const rec = await store.get(key, { type: "json" });
      // A call left "calling" for over half an hour is stale (its queue closes it), not a busy line.
      if (rec?.status === "calling" && now - new Date(rec.startedAt || 0) < 30 * 60_000) return why;
    }
  }
  return "";
}
