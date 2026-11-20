// Unfinished orders for the team: list (tabs: open / ordered / hidden / all), hide, restore or link to an order,
// the cart stream, SMS and e-mail reminders (by hand and their automatic settings).
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { emailSettings, saveEmailSettings } from "../lib/email.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { listLeads, setLead } from "../lib/leads.mts";
import { cartStream, reminderSettings, remind, saveReminderSettings } from "../lib/reminders.mts";
import { smsSettings } from "../lib/sms.mts";

async function reminderInfo() {
  const e = await emailSettings();
  return {
    settings: await reminderSettings(),
    email: { configured: e.configured, source: e.source, fromEmail: e.fromEmail, fromName: e.fromName },
    sms: { configured: Boolean((await smsSettings()).token) },
  };
}

export default handle(async (req) => {
  const user = await requireUser(req);
  const [id] = sub(req, "/api/leads/");
  const u = new URL(req.url).searchParams;
  if (req.method === "GET" && !id) return json(await listLeads(str(u.get("tab"), 10) || "open", str(u.get("shop"), 20)));
  if (req.method === "GET" && id === "stream") return json(await cartStream(str(u.get("shop"), 20)));
  if (req.method === "GET" && id === "reminders") return json(await reminderInfo());
  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  if (id === "reminders" || id === "email") {
    if (user.role !== "admin") throw bad("admin", "Само собственикът променя напомнянията.");
    if (id === "reminders") await saveReminderSettings(b);
    else await saveEmailSettings(b);
    return json(await reminderInfo());
  }
  if (/^\d{1,12}$/.test(id || "")) {
    const action = str(b.action, 20);
    if (action === "sms" || action === "email") return json(await remind(Number(id), action, { text: b.text, subject: b.subject }, "manual", user.id));
    if (!["dismiss", "restore", "ordered"].includes(action)) throw bad("action", "Непознато действие.");
    await setLead(Number(id), action, Number(b.orderId) || undefined);
    return json({ ok: true });
  }
  throw notFound();
});

export const config: Config = { path: ["/api/leads", "/api/leads/*"] };
