// Сега в сайтовете: live visitors per shop, the open sessions and today's numbers.
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { handle, json, notFound } from "../lib/http.mts";
import { liveView } from "../lib/visits.mts";

export default handle(async (req) => {
  await requireUser(req);
  if (req.method !== "GET") throw notFound();
  const minutes = Math.max(5, Math.min(120, Number(new URL(req.url).searchParams.get("min")) || 15));
  return json(await liveView(minutes));
});

export const config: Config = { path: "/api/live" };
