// Tools the inbound agent calls during a phone call:
//   POST /tools/<TOOLS_SECRET>/find-order    { phone?, caller_phone }
//   POST /tools/<TOOLS_SECRET>/quote-order   { items[], delivery, caller_phone? }
//   POST /tools/<TOOLS_SECRET>/submit-order  { customer_name, phone?, caller_phone, items[], delivery, city, office_or_address, note? }
import type { Config, Context } from "@netlify/functions";
// The incoming line sells the zdravets.eu catalogue (scripts/build-zdravets-pricelist.mjs).
import priceList from "../../agent/pricelist-zdravets.json" with { type: "json" };
import { realDeps, env } from "../../lib/config.mjs";
import { findOrders, submitOrder, quote, repeatCustomer } from "../../lib/inbound.mjs";
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
    // A customer who has ordered before gets the repeat discount on a phone order.
    const repeat = () => repeatCustomer(deps, [body.caller_phone, body.phone]).catch(() => false);
    if (context.params.name === "quote-order") {
      // Before the delivery is chosen (to say a price or an offer early), the total is to an office.
      const early = !body.delivery;
      const q = quote(priceList, early ? { ...body, delivery: "econt_office" } : body, new Date(), { repeat: await repeat() });
      if (q.errors.length) return Response.json({ ok: false, error: q.errors.join("; ") });
      return Response.json({
        ...quoteAnswer(q),
        ...(early ? { delivery_note: "Доставката още не е избрана – сумата е с доставка до офис. До адрес е 5,90 €." } : {}),
      });
    }
    if (context.params.name === "submit-order") {
      return Response.json(await submitOrder({ store: deps.store, notify: deps.notify, priceList }, body, new Date(), { repeat: await repeat() }));
    }
  } catch (err) {
    console.error(context.params.name, err);
    return Response.json({ ok: false, error: "Временен проблем със системата. Кажи на клиента, че колега ще му се обади." });
  }
  return new Response("not found", { status: 404 });
};

export const config: Config = { path: "/tools/:secret/:name", method: "POST" };
