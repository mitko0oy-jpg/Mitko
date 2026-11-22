// Tools the inbound agent calls during a phone call:
//   POST /tools/<TOOLS_SECRET>/find-order    { phone?, caller_phone }
//   POST /tools/<TOOLS_SECRET>/quote-order   { items[], delivery }
//   POST /tools/<TOOLS_SECRET>/submit-order  { customer_name, phone?, caller_phone, items[], delivery, city, office_or_address, note? }
import type { Config, Context } from "@netlify/functions";
// The incoming line sells the zdravets.eu catalogue (scripts/build-zdravets-pricelist.mjs).
import priceList from "../../agent/pricelist-zdravets.json" with { type: "json" };
import { realDeps, env } from "../../lib/config.mjs";
import { findOrders, submitOrder, quote } from "../../lib/inbound.mjs";
import { quoteAnswer } from "../../lib/zdravets.mjs";

export default async (req: Request, context: Context) => {
  const secret = env("TOOLS_SECRET");
  if (!secret || context.params.secret !== secret) return new Response("not found", { status: 404 });
  const body = await req.json().catch(() => ({}));
  const deps = realDeps();
  try {
    if (context.params.name === "find-order") {
      return Response.json(await findOrders(deps.cb, body.phone || body.caller_phone, deps.mw));
    }
    if (context.params.name === "quote-order") {
      const q = quote(priceList, body);
      if (q.errors.length) return Response.json({ ok: false, error: q.errors.join("; ") });
      if (!q.delivery) return Response.json({ ok: false, error: "не е избран начин на доставка (офис на Еконт, офис на Спиди или адрес)" });
      return Response.json(quoteAnswer(q));
    }
    if (context.params.name === "submit-order") {
      return Response.json(await submitOrder({ store: deps.store, notify: deps.notify, priceList }, body));
    }
  } catch (err) {
    console.error(context.params.name, err);
    return Response.json({ ok: false, error: "Временен проблем със системата. Кажи на клиента, че колега ще му се обади." });
  }
  return new Response("not found", { status: 404 });
};

export const config: Config = { path: "/tools/:secret/:name", method: "POST" };
