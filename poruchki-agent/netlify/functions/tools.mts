// Tools the inbound agent calls during a phone call:
//   POST /tools/<TOOLS_SECRET>/find-order    { phone?, caller_phone }
//   POST /tools/<TOOLS_SECRET>/quote-order   { items[], delivery }
//   POST /tools/<TOOLS_SECRET>/submit-order  { customer_name, phone?, caller_phone, items[], delivery, city, office_or_address, note? }
import type { Config, Context } from "@netlify/functions";
import priceList from "../../agent/pricelist-bg.json" with { type: "json" };
import { realDeps, env } from "../../lib/config.mjs";
import { findOrders, submitOrder, quote } from "../../lib/inbound.mjs";

export default async (req: Request, context: Context) => {
  const secret = env("TOOLS_SECRET");
  if (!secret || context.params.secret !== secret) return new Response("not found", { status: 404 });
  const body = await req.json().catch(() => ({}));
  const deps = realDeps();
  try {
    if (context.params.name === "find-order") {
      return Response.json(await findOrders(deps.cb, body.phone || body.caller_phone));
    }
    if (context.params.name === "quote-order") {
      const q = quote(priceList, body);
      if (q.errors.length) return Response.json({ ok: false, error: q.errors.join("; ") });
      return Response.json({ ok: true, total: q.totalText, delivery: `${q.delivery.label} – ${q.delivery.price.toFixed(2)} €`, items: q.lines.map((l) => `${l.qty} × ${l.name}${l.gift ? ` (подарък: ${l.gift})` : ""}`) });
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
