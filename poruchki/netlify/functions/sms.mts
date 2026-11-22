import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { companyId } from "../lib/tenant.mts";
import { hit, one } from "../lib/db.mts";
import { addEvent } from "../lib/edit.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { fillTemplate, PRICE_PER_PART, saveSmsSettings, sendSms, smsParts, smsProfile, smsSettings, toLatin } from "../lib/sms.mts";

async function order(id: unknown) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw bad("order", "Няма такава поръчка.");
  const o = await one<any>("SELECT o.*, s.label AS shop_label FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1 AND s.company_id = $2", [n, companyId()]);
  if (!o) throw notFound("Няма такава поръчка.");
  o.total = Number(o.total);
  return o;
}

const publicSettings = (s: Awaited<ReturnType<typeof smsSettings>>) => ({ configured: !!s.token, source: s.source, sender: s.sender, templates: s.templates, latin: s.latin, office: s.office, shippedAuto: s.shippedAuto, reorder: s.reorder, pricePerPart: PRICE_PER_PART });

export default handle(async (req) => {
  const user = await requireUser(req);
  const [what] = sub(req, "/api/sms/");
  const u = new URL(req.url).searchParams;

  if (req.method === "GET") {
    // The SMS window: every template already filled in for this order.
    if (what === "draft") {
      const o = await order(u.get("order"));
      const s = await smsSettings();
      const filled = Object.fromEntries(Object.entries(s.templates).map(([k, t]) => [k, fillTemplate(t.text, o)]));
      const suggested = o.stage === "at_office" ? "office" : o.tracking_no ? "shipped" : "confirm";
      return json({ ...publicSettings(s), phone: o.phone, name: o.customer_name, filled, suggested });
    }
    if (what === "settings") {
      const s = await smsSettings();
      let account = null;
      if (s.token && u.get("check") === "1") account = await smsProfile(s.token).catch((e) => ({ error: e.message }));
      return json({ ...publicSettings(s), account });
    }
    if (what === "count") {
      const text = String(u.get("text") || "");
      return json(smsParts(u.get("latin") === "1" ? toLatin(text) : text));
    }
    throw notFound();
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  if (what === "send") {
    if (!(await hit(`sms:${user.id}`, 40, 600))) throw bad("rate", "Твърде много SMS за кратко време. Изчакай малко.");
    const o = await order(b.orderId);
    const raw = str(b.text, 700);
    const text = b.latin === true ? toLatin(raw) : raw;
    const phone = str(b.phone, 30) || o.phone;
    const r = await sendSms(phone, text);
    await addEvent(o.id, "sms", `SMS до ${phone}: ${text}`, { parts: r.parts, points: r.points, id: r.id, status: r.status }, user.id);
    return json({ ok: true, ...r });
  }

  if (what === "settings") {
    if (user.role !== "admin") throw bad("admin", "Само собственикът може да променя SMS настройките.");
    const s = await saveSmsSettings(b);
    let account = null;
    if (s.token) account = await smsProfile(s.token).catch((e) => ({ error: e.message }));
    return json({ ...publicSettings(s), account });
  }

  // A real SMS to a number of your choice, to see how it arrives.
  if (what === "test") {
    if (user.role !== "admin") throw bad("admin", "Само собственикът може да праща пробен SMS.");
    const r = await sendSms(str(b.phone, 30), str(b.text, 300) || "Пробен SMS от платформата Поръчки.");
    return json({ ok: true, ...r });
  }

  throw notFound();
});

export const config: Config = { path: "/api/sms/*" };
