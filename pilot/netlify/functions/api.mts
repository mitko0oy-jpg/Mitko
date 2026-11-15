// All HTTP endpoints of the app.
//   GET  /api/health
//   POST /api/do/login | logout
//   GET  /api/view/<dashboard|campaigns|creatives|autopilot|market|learning|settingsView>
//   POST /api/do/<action>          body: { args }
//   POST /api/hook/orders          header x-pilot-secret (shop webhook)
//   GET/POST /api/hook/meta        Meta ads webhooks (creative_fatigue, effective_status…)
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "@netlify/functions";
import { json, fail, body, env, HttpError } from "../lib/http.mts";
import { isAuthed, requireAuth, login, logout } from "../lib/auth.mts";
import { app, isDemo } from "../lib/app.mts";
import { pgStore } from "../lib/db.mts";
import * as sales from "../lib/sales.mts";

const VIEWS = new Set(["dashboard", "campaigns", "creatives", "autopilot", "market", "learning", "settingsView", "studio"]);
const ACTIONS = new Set(["run", "approve", "reject", "act", "revert24h", "saveSettings", "importTablo", "confirmCosts", "saveCreative", "check", "briefs", "generate", "approveCreative", "launch", "saveRadar", "make", "makeStatus", "makeVideo", "launchMade"]);

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\//, "");
  try {
    if (path === "health") return json({ app: "pilot", auth: await isAuthed(req).catch(() => false), demo: isDemo() });

    if (path === "do/login" && req.method === "POST") {
      const b = await body(req);
      const c = await login(req, String(b?.args?.password || ""));
      return json({ ok: true }, 200, { "set-cookie": c });
    }
    if (path === "do/logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": await logout(req) });

    if (path === "hook/orders" && req.method === "POST") {
      const secret = env("SALES_HOOK_SECRET");
      if (!secret || !safeEq(req.headers.get("x-pilot-secret") || "", secret)) throw new HttpError(401, "auth", "Невалиден ключ.");
      const n = await sales.ingest(await body(req));
      const sync: any = (await pgStore.get("meta", "sync")) || {};
      await pgStore.put("meta", "sync", { ...sync, hookAt: new Date().toISOString(), salesAt: new Date().toISOString() });
      return json({ ok: true, stored: n });
    }

    if (path === "hook/meta") {
      if (req.method === "GET") {
        const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("META_WEBHOOK_VERIFY");
        return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("no", { status: 403 });
      }
      const raw = await req.text();
      const sig = req.headers.get("x-hub-signature-256") || "";
      const secret = env("META_APP_SECRET");
      if (!secret || !safeEq(sig, "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"))) throw new HttpError(401, "sig", "Невалиден подпис.");
      const j = JSON.parse(raw || "{}");
      for (const entry of j.entry || []) {
        for (const ch of entry.changes || []) {
          if (ch.field === "creative_fatigue") {
            const v = ch.value || {};
            const id = String(v.ad_id || v.id || "");
            if (id) await pgStore.put("metaFatigue", id, { level: v.level || v.fatigue_level || v.status, at: new Date().toISOString() });
          } else {
            await pgStore.put("metaEvents", `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, { field: ch.field, value: ch.value, at: new Date().toISOString() });
          }
        }
      }
      return json({ ok: true });
    }

    await requireAuth(req);
    const svc = app();
    if (path.startsWith("view/") && req.method === "GET") {
      const name = path.slice(5);
      if (!VIEWS.has(name)) throw new HttpError(404, "nf", "Няма такъв изглед.");
      const range = url.searchParams.get("range") || undefined;
      return json(await (svc as any)[name](range));
    }
    if (path.startsWith("do/") && req.method === "POST") {
      const name = path.slice(3);
      if (!ACTIONS.has(name)) throw new HttpError(404, "nf", "Няма такава команда.");
      const b = await body(req);
      return json(await (svc as any)[name](b?.args ?? undefined));
    }
    throw new HttpError(404, "nf", "Няма такъв адрес.");
  } catch (e) {
    return fail(e);
  }
};

export const config: Config = { path: "/api/*" };
