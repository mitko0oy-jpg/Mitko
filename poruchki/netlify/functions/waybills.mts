import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { courierInfo } from "../lib/track.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { cancelFor, createFor, draftForOrder, getDefaults, labelsFor, markPrintedPublic, officesFor, priceFor, printQueue, saveDefaults } from "../lib/waybills.mts";
import { getAutomation, saveAutomation } from "../lib/agent.mts";

const orderId = (v: unknown) => {
  const id = Number(v);
  if (!Number.isSafeInteger(id) || id <= 0) throw bad("order", "Няма такава поръчка.");
  return id;
};

export default handle(async (req) => {
  const user = await requireUser(req);
  const [what] = sub(req, "/api/waybills/");
  const u = new URL(req.url).searchParams;

  if (req.method === "GET") {
    // Everything the waybill window needs, filled in from the order.
    if (what === "draft") {
      const { order: o, draft, defaults } = await draftForOrder(orderId(u.get("order")));
      return json({
        draft,
        defaults,
        couriers: await courierInfo(),
        order: {
          id: o.id, shop: o.shop_label, order_no: o.order_no, ordered_at: o.ordered_at, total: o.total, currency: o.currency, paid: o.paid,
          payment_method: o.payment_method, shipping_name: o.shipping_name, items: o.items, tracking_no: o.tracking_no,
          tracking_source: o.tracking_source, courier: o.courier, region: o.region,
        },
      });
    }
    if (what === "offices") return json({ offices: await officesFor(str(u.get("courier"), 10), str(u.get("q"), 60)) });
    if (what === "label") {
      const ids = String(u.get("ids") || "").split(",").map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 40);
      if (!ids.length) throw bad("ids", "Няма избрани поръчки.");
      const pdf = await labelsFor(ids);
      return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="etiketi-${ids.length}.pdf"`, "cache-control": "no-store" } });
    }
    if (what === "settings") return json({ defaults: await getDefaults(), automation: await getAutomation() });
    if (what === "queue") return json({ queue: await printQueue() });
    throw notFound();
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req);
  if (what === "price") return json(await priceFor(orderId(b.orderId), b.draft));
  if (what === "create") return json(await createFor(orderId(b.orderId), b.draft, user.id));
  if (what === "cancel") return json(await cancelFor(orderId(b.orderId), user.id));
  if (what === "settings") {
    if (user.role !== "admin") throw bad("admin", "Само собственикът може да променя подателя.");
    const automation = b.automation ? await saveAutomation(b.automation) : await getAutomation();
    return json({ defaults: b.speedy || b.econt ? await saveDefaults(b) : await getDefaults(), automation });
  }
  if (what === "printed") {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n: number) => Number.isSafeInteger(n) && n > 0).slice(0, 100);
    await markPrintedPublic(ids);
    return json({ ok: true });
  }
  throw notFound();
});

export const config: Config = { path: "/api/waybills/*" };
