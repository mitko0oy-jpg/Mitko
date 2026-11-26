// OrderDesk's „📞 Обади се“: start the call right away instead of waiting for the next 5-minute run.
//   POST /api/call-now   Authorization: Bearer <PLATFORM_TOKEN>  (the same value as OrderDesk's AGENT_TOKEN)
// It does what a run of `tick` does for the order calls: picks up the requests, then starts the due call.
// A manual request is called whatever /rezhim says; /stop, CALLS_PAUSED and the calling hours still hold.
import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { realDeps, env } from "../../lib/config.mjs";
import { syncOrders, runDueCalls, orderCallInProgress } from "../../lib/engine.mjs";
import { lineBusy } from "../../lib/line.mjs";

export default async (req: Request) => {
  const want = env("PLATFORM_TOKEN") || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (want.length < 32 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new Response("not found", { status: 404 });
  }
  const deps = realDeps();
  const now = new Date();
  try {
    const added = await syncOrders(deps, now);
    // One phone line: if a call is ringing or talking, the next 5-minute run starts this one.
    const busy = (await orderCallInProgress(deps.store, now)) ? "order call in progress" : await lineBusy(deps.store, now, "");
    const report = busy ? { started: 0, skipped: 0, stale: 0, reason: "busy", busy } : await runDueCalls(deps, now);
    console.log(JSON.stringify({ via: "call-now", added, ...report }));
    return Response.json({ ok: true, added, ...report });
  } catch (err) {
    console.error("call-now", err);
    return Response.json({ ok: false, reason: "error", error: String((err as Error).message).slice(0, 200) }, { status: 500 });
  }
};

export const config: Config = { path: "/api/call-now", method: "POST" };
