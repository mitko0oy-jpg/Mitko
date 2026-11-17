import type { Config } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { hashPassword, requireUser, validEmail } from "../lib/auth.mts";
import { cbSite, createWebhook, deleteWebhook } from "../lib/cb.mts";
import { COURIERS, isCourier } from "../lib/couriers.mts";
import { one, q } from "../lib/db.mts";
import { companyId, inCompany, ENV_COMPANY } from "../lib/tenant.mts";
import { getRates } from "../lib/fx.mts";
import { bad, body, env, handle, json, notFound, str, sub } from "../lib/http.mts";
import { mwConfig } from "../lib/mw.mts";
import { ensureShops } from "../lib/shops.mts";
import { runSync, startHistory } from "../lib/sync.mts";
import { courierInfo, runTracking, saveCreds } from "../lib/track.mts";

async function overview(req: Request, isAdmin: boolean) {
  const shops = await ensureShops();
  const counts = await q<any>(`SELECT shop, count(*)::int AS n, min(day)::text AS first_day FROM orders WHERE ${inCompany()} GROUP BY shop`);
  const byShop = new Map(counts.map((c) => [c.shop, c]));
  // The job log covers all companies: only the platform's own company sees its details.
  const jobs =
    companyId() === ENV_COMPANY
      ? await q<any>(`SELECT DISTINCT ON (job) job, ok, info, at FROM job_log WHERE job IN ('sync', 'track') ORDER BY job, at DESC`)
      : [];
  const tracked = await one<any>(
    `SELECT count(*) FILTER (WHERE tracking_no IS NOT NULL)::int AS with_no,
            count(*) FILTER (WHERE tracking_no IS NOT NULL AND tracked_at IS NOT NULL)::int AS tracked,
            count(*) FILTER (WHERE tracking_source = 'econt_match')::int AS matched
       FROM orders WHERE ${inCompany()} AND ordered_at > now() - interval '60 days'`,
  );
  return {
    shops: shops.map((s) => ({
      id: s.id,
      label: s.label,
      domain: s.domain,
      region: s.region,
      currency: s.currency,
      active: s.active,
      syncedAt: s.synced_at,
      fullSyncAt: s.full_sync_at,
      history: s.backfill ? { from: s.backfill.from, to: s.backfill.to } : null,
      error: s.last_error,
      hook: Boolean(s.hook_id),
      hookAt: s.hook_at,
      orders: byShop.get(s.id)?.n || 0,
      firstDay: byShop.get(s.id)?.first_day || null,
      hasKey: Boolean(cbSite(s.id)),
    })),
    couriers: await courierInfo(),
    middleware: { enabled: mwConfig().enabled },
    company: { id: companyId() },
    jobs,
    tracked,
    fx: await getRates(),
    secretKey: (env("SECRET_KEY") || "").length >= 32,
    users: isAdmin ? await q("SELECT id, email, name, role, created_at FROM users WHERE company_id = $1 ORDER BY id", [companyId()]) : [],
    site: new URL(req.url).origin,
  };
}

export default handle(async (req) => {
  const user = await requireUser(req);
  const isAdmin = user.role === "admin";
  const [what, arg] = sub(req, "/api/settings");
  if (req.method === "GET" && !what) return json(await overview(req, isAdmin));
  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  // Anyone on the team may refresh.
  if (what === "sync") return json(await runSync({ deadline: Date.now() + 20000, job: "sync-manual" }));
  if (what === "track") return json(await runTracking({ deadline: Date.now() + 20000, job: "track-manual" }));

  if (!isAdmin) throw bad("admin", "Само собственикът може да променя настройките.");

  if (what === "shop") {
    const id = str(b.id, 20);
    const s = await one("SELECT id FROM shops WHERE id = $1 AND company_id = $2", [id, companyId()]);
    if (!s) throw notFound("Няма такъв магазин.");
    if (b.region !== undefined && !["bg", "abroad"].includes(b.region)) throw bad("region", "Невалиден регион.");
    const currency = b.currency !== undefined ? str(b.currency, 3).toUpperCase() : null;
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw bad("currency", "Валутата е три букви, напр. EUR.");
    await q(
      `UPDATE shops SET region = COALESCE($2, region), currency = COALESCE($3, currency), active = COALESCE($4, active) WHERE id = $1`,
      [id, b.region ?? null, currency, typeof b.active === "boolean" ? b.active : null],
    );
    return json(await overview(req, isAdmin));
  }

  if (what === "courier") {
    const id = str(b.courier, 20);
    if (!isCourier(id)) throw bad("courier", "Непознат куриер.");
    if (b.remove === true) {
      await q("DELETE FROM settings WHERE key = $1", [cKey(`courier:${id}`)]);
      return json(await overview(req, isAdmin));
    }
    const user = str(b.user, 120);
    const pass = typeof b.pass === "string" ? b.pass.trim().slice(0, 200) : "";
    if (!user || !pass) throw bad("creds", "Попълни потребител и парола.");
    try {
      await saveCreds(id, { user, pass });
    } catch (e: any) {
      throw bad("creds", `${COURIERS[id].label} не приема тези данни: ${e.message}`);
    }
    return json(await overview(req, isAdmin));
  }

  // Import older orders, newest first. Runs in the background over the next runs.
  if (what === "history") {
    const months = Number(b.months);
    if (!Number.isFinite(months) || months < 1 || months > 36) throw bad("months", "От 1 до 36 месеца.");
    await startHistory(months);
    return json(await runSync({ deadline: Date.now() + 20000, job: "sync-manual" }));
  }

  // ConvertBuilder sends every new or changed order to us right away.
  if (what === "hooks") {
    const origin = new URL(req.url).origin;
    if (!origin.startsWith("https://") && !/^http:\/\/localhost(:\d+)?$/.test(origin)) throw bad("https", "Връзката работи само на истинския адрес (https).");
    const result: Record<string, string> = {};
    for (const shop of await ensureShops()) {
      const site = cbSite(shop.id);
      if (!shop.active || !site) continue;
      try {
        if (shop.hook_id) await deleteWebhook(site, shop.hook_id).catch(() => null);
        const secret = randomBytes(24).toString("hex");
        const hook = await createWebhook(site, `${origin}/api/hooks/cb/${shop.id}`, secret);
        const hookId = String(hook?.id || hook?.item?.id || "");
        await q("UPDATE shops SET hook_id = $2, hook_secret = $3, hook_at = now() WHERE id = $1", [shop.id, hookId || "unknown", secret]);
        result[shop.id] = "ok";
      } catch (e: any) {
        result[shop.id] = e.message;
      }
    }
    return json({ result, ...(await overview(req, isAdmin)) });
  }

  if (what === "users") {
    if (arg === "delete") {
      const id = Number(b.id);
      if (id === user.id) throw bad("self", "Не можеш да изтриеш собствения си профил.");
      await q("DELETE FROM users WHERE id = $1 AND role <> 'admin' AND company_id = $2", [id, companyId()]);
      return json(await overview(req, isAdmin));
    }
    const email = str(b.email, 200).toLowerCase();
    const name = str(b.name, 80);
    const password = typeof b.password === "string" ? b.password : "";
    if (!validEmail(email)) throw bad("email", "Провери имейла.");
    if (password.length < 10) throw bad("password", "Паролата трябва да е поне 10 знака.");
    const exists = await one("SELECT 1 FROM users WHERE email = $1", [email]);
    if (exists) throw bad("email_taken", "Вече има профил с този имейл.");
    await q("INSERT INTO users (email, password_hash, name, role, company_id) VALUES ($1, $2, $3, 'staff', $4)", [email, await hashPassword(password), name, companyId()]);
    return json(await overview(req, isAdmin));
  }

  throw notFound();
});

export const config: Config = { path: ["/api/settings", "/api/settings/*"] };

