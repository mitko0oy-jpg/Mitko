// ConvertBuilder webhooks: order_created / order_updated. The body is the whole order.
// Signed with HMAC-SHA512 of the raw body (header X-Webhook-Signature) using the secret we gave when registering.
import type { Config } from "@netlify/functions";
import { createHmac, timingSafeEqual } from "node:crypto";
import { one } from "../lib/db.mts";
import { getRates } from "../lib/fx.mts";
import { json, sub } from "../lib/http.mts";
import { upsertOrders } from "../lib/orders.mts";

export function validSignature(raw: string, secret: string, got: string | null): boolean {
  if (!got || !/^[0-9a-f]{128}$/i.test(got)) return false;
  const want = createHmac("sha512", secret).update(raw, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(want), Buffer.from(got.toLowerCase()));
}

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const [kind, shopId] = sub(req, "/api/hooks/");
  if (kind !== "cb" || !shopId) return json({ error: "not_found" }, 404);
  const shop = await one<any>("SELECT id, currency, hook_secret, active FROM shops WHERE id = $1", [shopId]);
  if (!shop || !shop.hook_secret) return json({ error: "not_found" }, 404);
  const raw = await req.text();
  if (raw.length > 2_000_000) return json({ error: "too_large" }, 413);
  if (!validSignature(raw, shop.hook_secret, req.headers.get("x-webhook-signature"))) return json({ error: "signature" }, 401);
  const topic = req.headers.get("x-webhook-topic") || "";
  if (!topic.startsWith("order_")) return json({ ok: true, ignored: topic });
  let order: any;
  try {
    order = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const o = order?.item && order.item.id ? order.item : order;
  if (!o || !Number.isFinite(Number(o.id))) return json({ error: "no_order" }, 400);
  await upsertOrders({ id: shop.id, currency: shop.currency }, [o], await getRates());
  return json({ ok: true });
};

export const config: Config = { path: "/api/hooks/*" };
