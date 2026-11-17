// API for the phone agent (Authorization: Bearer AGENT_TOKEN). See lib/agent.mts.
import type { Config } from "@netlify/functions";
import { AI, applyCallResult, markCalling, orderForAgent, ordersByPhone, ordersToCall, requireAgent } from "../lib/agent.mts";
import { editOrder } from "../lib/edit.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";
import { addNote, createOrder } from "../lib/manage.mts";
import { catalog } from "../lib/products.mts";
import { getAutomation } from "../lib/agent.mts";
import { createFor, matchOffice, searchOffices } from "../lib/waybills.mts";

const idOf = (v: unknown) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw bad("id", "bad id");
  return n;
};

export default handle(async (req) => {
  requireAgent(req);
  const [what, idStr, action] = sub(req, "/api/agent/");
  const u = new URL(req.url).searchParams;

  if (req.method === "GET") {
    if (what === "orders" && !idStr) {
      const shops = String(u.get("shops") || "").split(",").map((x) => x.trim()).filter(Boolean);
      const since = u.get("since") || new Date(Date.now() - 86400000).toISOString();
      return json({ orders: await ordersToCall(shops, since) });
    }
    if (what === "orders" && idStr) {
      const o = await orderForAgent(idOf(idStr));
      if (!o) throw notFound();
      return json(o);
    }
    if (what === "by-phone") return json({ orders: await ordersByPhone(str(u.get("phone"), 40), Number(u.get("days")) || 45) });
    if (what === "products") return json({ products: await catalog(str(u.get("shop"), 20), str(u.get("q"), 60)) });
    // Courier offices of a city for the agent to read to the customer (best matches for the words first).
    if (what === "offices") {
      const { list } = await searchOffices(str(u.get("courier"), 10), str(u.get("city"), 60), str(u.get("q"), 120));
      return json({ offices: list.slice(0, 8).map((o: any) => ({ id: o.id, name: o.name, address: o.address, automat: !!o.automat, match: o.score })) });
    }
    throw notFound();
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  // An order taken over the phone: confirmed already; the waybill follows when the delivery is complete.
  if (what === "orders" && !idStr) {
    // An office said in words: find its code, so the waybill can go out on its own.
    const d = b.delivery && typeof b.delivery === "object" ? { ...b.delivery } : {};
    let officeNote = "";
    if ((d.type === "office" || d.type === "automat") && !/^\d{1,8}$/.test(String(d.officeId || ""))) {
      const said = String(d.officeName || b.address || "");
      const m = await matchOffice(String(d.courier || ""), String(b.city || ""), said).catch(() => null);
      if (m) Object.assign(d, { officeId: m.id, officeName: m.name });
      else officeNote = `⚠ Избери офиса: AI записа „${said.slice(0, 150)}“, но не го намерих точно в офисите на ${d.courier === "econt" ? "Еконт" : "Спиди"}.`;
    }
    const r = await createOrder({ ...b, delivery: d, confirmed: true }, { source: "phone", userId: null, who: AI, by: AI });
    if (officeNote) await addNote(r.id, officeNote, null, AI);
    const auto = await getAutomation();
    let waybill = null;
    const complete = d.type === "address" ? Boolean(b.city && b.address) : /^\d{1,8}$/.test(String(d.officeId || ""));
    if (auto.autoWaybill && b.autoWaybill !== false && complete) {
      try {
        waybill = await createFor(r.id, undefined, null);
      } catch (e: any) {
        await addNote(r.id, `⚠ Товарителницата не се създаде автоматично: ${e.message}`, null, AI);
      }
    }
    return json({ ...r, waybill });
  }

  const id = idOf(idStr);
  if (what !== "orders") throw notFound();
  if (action === "calling") {
    await markCalling(id, Number(b.attempt) || 1);
    return json({ ok: true });
  }
  if (action === "result") return json(await applyCallResult(id, b));
  if (action === "edit") return json(await editOrder(id, b, null, AI));
  if (action === "note") {
    await addNote(id, str(b.text, 1000), null, AI);
    return json({ ok: true });
  }
  throw notFound();
});

export const config: Config = { path: "/api/agent/*" };
