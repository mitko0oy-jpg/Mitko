import type { Config } from "@netlify/functions";
import { hit, one } from "../lib/db.mts";
import { body, clientIp, handle, notFound } from "../lib/http.mts";
import { saveReport } from "../lib/reports.mts";

// The app sends its signals about problems here (see netlify/lib/reports.mts). It always answers 204: a dropped
// signal (too many, bad data) must not show the child an error about an error.
export default handle(async (req, ctx) => {
  if (req.method !== "POST") throw notFound();
  const done = new Response(null, { status: 204 });
  // 30 signals an hour from one address and 400 an hour in total: enough for a real wave of errors, useless for spam.
  if (!(await hit(`report:${clientIp(req, ctx)}`, 30, 3600))) return done;
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM reports WHERE last_at > now() - interval '1 hour'");
  if ((recent?.n ?? 0) > 400) return done;
  await saveReport(await body(req, 8_000), req.headers.get("user-agent") || "");
  return done;
});

export const config: Config = { path: "/api/report" };
