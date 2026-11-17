// Unfinished orders for the team: list (tabs: open / ordered / hidden / all) and hide, restore or link to an order.
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { listLeads, setLead } from "../lib/leads.mts";

export default handle(async (req) => {
  await requireUser(req);
  const [id] = sub(req, "/api/leads/");
  if (req.method === "GET" && !id) {
    const u = new URL(req.url).searchParams;
    return json(await listLeads(str(u.get("tab"), 10) || "open", str(u.get("shop"), 20)));
  }
  if (req.method === "POST" && /^\d{1,12}$/.test(id || "")) {
    const b = await body(req);
    const action = str(b.action, 20);
    if (!["dismiss", "restore", "ordered"].includes(action)) throw bad("action", "Непознато действие.");
    await setLead(Number(id), action, Number(b.orderId) || undefined);
    return json({ ok: true });
  }
  throw notFound();
});

export const config: Config = { path: ["/api/leads", "/api/leads/*"] };
