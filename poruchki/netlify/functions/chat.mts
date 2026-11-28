// Чат на сайта на магазина.
// Публично (скриптът /chat.js от сайта на магазина; приема само от домейна на магазина, или от OrderDesk за проба):
//   GET  /api/chat/s/:shop                 – настройките за балончето (нищо тайно)
//   GET  /api/chat/s/:shop/m?sid=&after=N  – съобщенията след N-тото (историята и отговорите на човек)
//   POST /api/chat/s/:shop                 – {sid, text, page} като text/plain (без preflight) → новите съобщения
// За екипа (вход):
//   GET  /api/chat/list?tab=human|all|done&shop=  – разговорите, броевете и магазините с настройките им
//   GET  /api/chat/c/:id                    – един разговор (отбелязва се като видян)
//   POST /api/chat/c/:id/reply {text}       – отговор от човек
//   POST /api/chat/c/:id/status {status}    – bot / human / done
//   GET|POST /api/chat/settings/:shop       – настройките на магазина (запис – само собственикът на фирмата)
import type { Config } from "@netlify/functions";
import { getUser, requireUser } from "../lib/auth.mts";
import {
  chatSettings,
  chatTurn,
  cleanSettings,
  cleanText,
  getChat,
  listChats,
  messagesAfter,
  publicChat,
  saveChatSettings,
  setChatStatus,
  staffReply,
  validSid,
  type Shop,
} from "../lib/chat.mts";
import { hit, one, q } from "../lib/db.mts";
import { bad, body, clientIp, handle, json, notFound, sub } from "../lib/http.mts";
import { companyId } from "../lib/tenant.mts";

const host = (u: string | null) => {
  try {
    return u ? new URL(u).host.toLowerCase().replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

const plainHeaders = (origin: string) => ({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": origin,
  vary: "origin",
});
const reply = (data: unknown, status: number, origin: string) => new Response(JSON.stringify(data), { status, headers: plainHeaders(origin) });

/** Магазинът и дали заявката идва от неговия сайт (или от OrderDesk с вход – за пробата в Настройки). */
async function publicShop(req: Request, shopId: string): Promise<{ shop: Shop; origin: string; preview: boolean } | null> {
  if (!/^[a-z0-9-]{1,40}$/i.test(shopId)) return null;
  const shop = await one<any>("SELECT id, label, domain, company_id, active FROM shops WHERE id = $1", [shopId]);
  if (!shop || !shop.active) return null;
  const origin = req.headers.get("origin") || "";
  const from = host(origin);
  const own = host(req.url);
  const shopHost = String(shop.domain).toLowerCase().replace(/^www\./, "");
  if (from && from === shopHost) return { shop: { id: shop.id, label: shop.label, domain: shop.domain, company_id: Number(shop.company_id) }, origin, preview: false };
  // Проба от страницата „Чат“ в OrderDesk: същият сайт и влязъл човек от фирмата на магазина.
  if ((!from || from === own) && (await getUser(req))?.company === Number(shop.company_id))
    return { shop: { id: shop.id, label: shop.label, domain: shop.domain, company_id: Number(shop.company_id) }, origin: origin || "*", preview: true };
  return null;
}

async function publicApi(req: Request, ctx: any, parts: string[]): Promise<Response> {
  const [shopId, what] = parts;
  const found = await publicShop(req, shopId || "");
  if (!found) return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  const { shop, origin, preview } = found;
  const ip = clientIp(req, ctx);

  if (req.method === "GET" && !what) {
    const s = await chatSettings(shop.id);
    // В пробата балончето се показва и преди чатът да е включен.
    const cfg = publicChat(preview ? { ...s, enabled: true } : s);
    return new Response(JSON.stringify(cfg), { status: 200, headers: { ...plainHeaders(origin), "cache-control": preview ? "no-store" : "public, max-age=60" } });
  }
  if (req.method === "GET" && what === "m") {
    if (!(await hit(`chatpoll:${ip}`, 900, 3600))) return reply({ error: "rate_limited" }, 429, origin);
    const u = new URL(req.url);
    const sid = u.searchParams.get("sid");
    if (!validSid(sid)) return reply({ error: "bad_sid" }, 400, origin);
    return reply(await messagesAfter(shop.id, sid, Number(u.searchParams.get("after")) || 0), 200, origin);
  }
  if (req.method === "POST" && !what) {
    if (!(await hit(`chat:${ip}`, 40, 3600))) return reply({ error: "rate_limited" }, 429, origin);
    const raw = await req.text();
    if (raw.length > 4000) return reply({ error: "too_large" }, 413, origin);
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return reply({ error: "bad_json" }, 400, origin);
    }
    const text = cleanText(data?.text);
    if (!validSid(data?.sid) || !text) return reply({ error: "bad_input" }, 400, origin);
    const out = await chatTurn(shop, data.sid, text, { page: preview ? "проба в OrderDesk" : data?.page, country: ctx?.geo?.country?.code, preview });
    if ("error" in out) return reply(out, 404, origin);
    return reply(out, 200, origin);
  }
  return new Response(null, { status: 405 });
}

const staffApi = handle(async (req) => {
  const [what, id, action] = sub(req, "/api/chat/");
  const user = await requireUser(req);
  const company = companyId();

  if (what === "list" && req.method === "GET") {
    const u = new URL(req.url);
    const out = await listChats(company, u.searchParams.get("tab") || "human", u.searchParams.get("shop") || "");
    const shops = await q<any>("SELECT id, label, domain FROM shops WHERE company_id = $1 AND active ORDER BY position, id", [company]);
    const withSettings = await Promise.all(shops.map(async (s) => ({ ...s, enabled: (await chatSettings(s.id)).enabled })));
    return json({ ...out, shops: withSettings });
  }

  if (what === "c") {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) throw notFound();
    if (!action && req.method === "GET") {
      const c = await getChat(company, n);
      if (!c) throw notFound("Няма такъв разговор.");
      return json({ chat: c });
    }
    if (action === "reply" && req.method === "POST") {
      const text = cleanText((await body(req))?.text);
      if (!text) throw bad("empty", "Напиши отговора.");
      if (!(await staffReply(company, n, text))) throw notFound("Няма такъв разговор.");
      return json({ chat: await getChat(company, n) });
    }
    if (action === "status" && req.method === "POST") {
      const status = (await body(req))?.status;
      if (!["bot", "human", "done"].includes(status)) throw bad("bad_status", "Непознат статус.");
      if (!(await setChatStatus(company, n, status))) throw notFound("Няма такъв разговор.");
      return json({ chat: await getChat(company, n) });
    }
    throw notFound();
  }

  if (what === "settings" && id) {
    const shop = await one<any>("SELECT id, label, domain FROM shops WHERE id = $1 AND company_id = $2", [id, company]);
    if (!shop) throw notFound("Няма такъв магазин.");
    if (req.method === "POST") {
      if (user.role !== "admin") throw bad("admin", "Само собственикът на фирмата променя чата.");
      await saveChatSettings(shop.id, cleanSettings(shop.id, await body(req, 40_000)));
    } else if (req.method !== "GET") throw notFound();
    return json({ shop, settings: await chatSettings(shop.id) });
  }
  throw notFound();
});

export default async (req: Request, ctx: any) => {
  const parts = sub(req, "/api/chat/");
  if (parts[0] === "s") {
    try {
      return await publicApi(req, ctx, parts.slice(1));
    } catch (e) {
      console.error("chat public failed", e);
      return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: { "content-type": "application/json" } });
    }
  }
  return staffApi(req, ctx);
};

export const config: Config = { path: "/api/chat/*" };
