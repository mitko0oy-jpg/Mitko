// Public: what a customer typed in a shop's order form (sent by /c.js on the shop pages).
// Plain text body (no preflight), accepted only from the shops' own domains, rate-limited per IP.
import type { Config } from "@netlify/functions";
import { hit } from "../lib/db.mts";
import { clientIp } from "../lib/http.mts";
import { cleanLead, saveLead, shopForOrigin } from "../lib/leads.mts";

const done = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export default async (req: Request, ctx: any) => {
  if (req.method !== "POST") return done(405);
  try {
    const shop = await shopForOrigin(req.headers.get("origin"));
    if (!shop) return done(403);
    const text = await req.text();
    if (text.length > 4000) return done(413);
    if (!(await hit(`collect:${clientIp(req, ctx)}`, 150, 3600))) return done(429);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return done(400);
    }
    const lead = cleanLead(data);
    if (lead) await saveLead(shop, lead);
    return done(204);
  } catch (e) {
    console.error("collect failed", e);
    return done(500);
  }
};

export const config: Config = { path: "/api/collect" };
