// nekorekten.com from the app: settings (owner), check a phone now, send a report about an order.
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { companyId } from "../lib/tenant.mts";
import { hit, one } from "../lib/db.mts";
import { addEvent } from "../lib/edit.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { checkPhone, nekSettings, nekUsage, phoneCheck, saveNekSettings, sendReport } from "../lib/nekorekten.mts";

const publicSettings = (s: Awaited<ReturnType<typeof nekSettings>>) => ({ configured: !!s.key, source: s.source, auto: s.auto });

async function orderFor(id: unknown) {
  const n = Number(id);
  const o = Number.isSafeInteger(n) && n > 0 ? await one<any>("SELECT o.id, o.phone, o.customer_name, o.order_no FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1 AND s.company_id = $2", [n, companyId()]) : null;
  if (!o) throw notFound("Няма такава поръчка.");
  if (!o.phone) throw bad("phone", "Поръчката няма телефон.");
  return o;
}

export default handle(async (req) => {
  const user = await requireUser(req);
  const [what] = sub(req, "/api/nekorekten/");

  if (what === "settings") {
    if (req.method === "POST") {
      if (user.role !== "admin") throw bad("admin", "Само собственикът може да сменя ключа.");
      const s = await saveNekSettings(await body(req));
      return json({ ...publicSettings(s), usage: s.key ? await nekUsage(s.key).catch((e) => ({ error: e.message })) : null });
    }
    const s = await nekSettings();
    const check = new URL(req.url).searchParams.get("check") === "1";
    return json({ ...publicSettings(s), usage: s.key && check ? await nekUsage(s.key).catch((e) => ({ error: e.message })) : null });
  }

  if (req.method === "GET" && what === "phone") {
    return json({ check: await phoneCheck(str(new URL(req.url).searchParams.get("phone"), 40)) });
  }

  if (req.method !== "POST") throw notFound();
  const s = await nekSettings();
  if (!s.key) throw bad("nekorekten", "Първо сложи ключа за nekorekten.com в Настройки.");
  if (!(await hit(`nek:${user.id}`, 30, 600))) throw bad("rate", "Твърде много проверки за кратко време. Изчакай малко.");
  const b = await body(req);
  const o = await orderFor(b.orderId);

  if (what === "check") return json({ check: await checkPhone(s.key, o.phone) });

  if (what === "report") {
    const r = await sendReport(s.key, { phone: o.phone, name: o.customer_name, text: str(b.text, 2000) });
    await addEvent(o.id, "nekorekten", `Подаден сигнал в nekorekten.com: ${str(b.text, 300)}`, { id: r.id }, user.id);
    await checkPhone(s.key, o.phone).catch(() => null);
    return json(r);
  }
  throw notFound();
});

export const config: Config = { path: "/api/nekorekten/*" };
