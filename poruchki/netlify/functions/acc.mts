import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { bad, body, handle, json, notFound, sub } from "../lib/http.mts";
import {
  cashMonth, createEntry, deleteBank, deleteEntry, expenseFromBank, importAll, isMonth, listBank, listEntries, months, report, saveSettings,
  settingsView, updateBank, updateEntry,
} from "../lib/acc.mts";
import { accSettings, monthSales } from "../lib/sales.mts";
import { napFile, napMonth } from "../lib/nap.mts";
import { monthPack, packLetter, sendPack, sentLog } from "../lib/accmail.mts";

// Счетоводство – само собственикът на фирмата.
// GET  /api/acc/settings | POST /api/acc/settings
// GET  /api/acc/report?from=2026-01&to=2026-11      – печалба по месеци
// GET  /api/acc/sales?month=2026-11                 – продажбите по държави и магазини (както в писмото)
// GET  /api/acc/entries?month= | POST /api/acc/entries | POST /api/acc/entries/:id | POST /api/acc/entries/:id/delete
// GET  /api/acc/bank?month= | POST /api/acc/bank/:id | POST /api/acc/bank/:id/delete | POST /api/acc/bank/:id/expense
// POST /api/acc/import                              – извлечението и фактурите за месеца (JSON)
// GET  /api/acc/nap?month=                          – одиторските файлове и какво е изпратено
// GET  /api/acc/nap/xml?shop=&month= | GET /api/acc/nap/csv?month= | GET /api/acc/nap/letter?month=
// POST /api/acc/nap/send { month }                  – писмото до счетоводителката сега
const monthOf = (url: URL) => {
  const m = url.searchParams.get("month") || "";
  if (!isMonth(m)) throw bad("month", "Избери месец.");
  return m;
};
const ascii = (s: string) => s.replace(/[^\w.-]/g, "_");

export default handle(async (req) => {
  const user = await requireUser(req, ["admin"]);
  const who = user.name || user.email;
  const url = new URL(req.url);
  const [a, b, c] = sub(req, "/api/acc");

  if (req.method === "GET") {
    if (a === "settings") return json(await settingsView());
    if (a === "months") return json({ months: await months() });
    if (a === "report") return json(await report(url.searchParams.get("from") || "", url.searchParams.get("to") || ""));
    if (a === "sales") {
      const s = await monthSales(monthOf(url));
      return json({ ...s, orders: undefined, set: undefined, count: s.orders.length });
    }
    if (a === "entries") return json({ entries: await listEntries(monthOf(url)) });
    if (a === "bank") {
      const m = monthOf(url);
      const [lines, cash] = await Promise.all([listBank(m), cashMonth(m)]);
      return json({ lines, cash });
    }
    if (a === "nap" && !b) {
      const m = monthOf(url);
      const [files, log, set] = await Promise.all([napMonth(m), sentLog(m), accSettings()]);
      return json({ files: files.map((f) => ({ ...f, xml: undefined, bytes: undefined, ready: Boolean(f.bytes) })), log, accountant: set.accountant });
    }
    if (a === "nap" && b === "xml") {
      const f = await napFile(url.searchParams.get("shop") || "", monthOf(url)).catch(() => {
        throw notFound("Няма такъв магазин.");
      });
      if (!f.bytes) throw bad("nap", [...f.errors, ...f.warnings].join(" ") || "Няма файл за този месец.");
      return new Response(new Uint8Array(f.bytes), {
        headers: { "content-type": "application/xml; charset=windows-1251", "content-disposition": `attachment; filename="${ascii(f.fileName)}"`, "cache-control": "no-store" },
      });
    }
    if (a === "nap" && b === "csv") {
      const m = monthOf(url);
      const p = await monthPack(m);
      return new Response(p.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="prodazhbi_${m}.csv"`, "cache-control": "no-store" } });
    }
    if (a === "nap" && b === "letter") {
      const m = monthOf(url);
      const [p, set] = await Promise.all([monthPack(m), accSettings()]);
      const l = packLetter(p, { company: set.companyName, greeting: set.accountant.name ? `Здравейте, ${set.accountant.name},` : "Здравейте,", correction: null });
      return json({ subject: l.subject, html: l.html, to: set.accountant.email, files: [`prodazhbi_${m}.csv`, ...p.files.filter((f) => f.bytes).map((f) => f.fileName)] });
    }
    throw notFound();
  }

  if (req.method !== "POST") throw notFound();
  const data = await body(req, a === "import" ? 3_000_000 : 64_000);
  if (a === "settings") return json(await saveSettings(data));
  if (a === "import") return json(await importAll(data, who));
  if (a === "entries") {
    if (!b) {
      const id = await createEntry(data, who);
      return json({ id });
    }
    const id = Number(b);
    if (!Number.isSafeInteger(id)) throw notFound();
    if (c === "delete") await deleteEntry(id);
    else if (!c) await updateEntry(id, data, who);
    else throw notFound();
    return json({ ok: true });
  }
  if (a === "bank") {
    const id = Number(b);
    if (!Number.isSafeInteger(id)) throw notFound();
    if (c === "delete") await deleteBank(id);
    else if (c === "expense") return json({ entry: await expenseFromBank(id, data, who) });
    else if (!c) await updateBank(id, data);
    else throw notFound();
    return json({ ok: true });
  }
  if (a === "nap" && b === "send") {
    const m = typeof data?.month === "string" ? data.month : "";
    if (!isMonth(m)) throw bad("month", "Избери месец.");
    try {
      return json(await sendPack(m, { auto: false, cc: user.email }));
    } catch (e: any) {
      throw bad("send", e.message);
    }
  }
  throw notFound();
});

export const config: Config = { path: ["/api/acc", "/api/acc/*"] };
