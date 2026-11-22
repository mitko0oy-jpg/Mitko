// Връзка с Claude (MCP, like RevOrder's „Свържи с Claude или ChatGPT“): a remote MCP server, read only, at a secret
// link /mcp/<company>.<token> that the owner makes, changes or switches off in Настройки. Claude (claude.ai → Settings →
// Connectors → Add custom connector) then reads the orders, clients, sales, ads report, warehouse and open carts itself.
// Streamable HTTP without streams: every JSON-RPC request gets one JSON answer; notifications get 202.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { report as adsReport } from "./attribution.mts";
import { customerOrders, listCustomers } from "./customers.mts";
import { daysBetween, isDay } from "./dates.mts";
import { getSetting, one, q, setSetting } from "./db.mts";
import { env } from "./http.mts";
import { cartStream } from "./reminders.mts";
import { seal, unseal } from "./secret.mts";
import { dashboard } from "./stats.mts";
import { overview as stockOverview } from "./stock.mts";
import { cKey, companyId } from "./tenant.mts";

type Stored = { sealed?: string; on?: boolean; at?: string };
const site = () => env("URL") || "https://mitko-poruchki.netlify.app";

export async function mcpSettings() {
  const s = (await getSetting<Stored>(cKey("mcp"))) || {};
  let url = "";
  if (s.on && s.sealed) {
    try {
      url = `${site()}/mcp/${companyId()}.${unseal<string>(s.sealed)}`;
    } catch {
      /* broken key: shown as off */
    }
  }
  return { on: Boolean(url), url, at: s.at || null };
}

/** A new link (the old one stops working at once), or off. */
export async function setMcp(action: "new" | "off") {
  if (action === "off") await setSetting(cKey("mcp"), { on: false, at: new Date().toISOString() });
  else await setSetting(cKey("mcp"), { on: true, sealed: seal(randomBytes(24).toString("base64url")), at: new Date().toISOString() });
  return mcpSettings();
}

/** The company of a link, or null (wrong, changed or switched off). Compared in constant time. */
export async function companyForToken(raw: string): Promise<number | null> {
  const m = /^(\d{1,9})\.([A-Za-z0-9_-]{20,64})$/.exec(raw || "");
  if (!m) return null;
  const company = Number(m[1]);
  const s = await getSetting<Stored>(`mcp@${company}`);
  if (!s?.on || !s.sealed) return null;
  let want = "";
  try {
    want = unseal<string>(s.sealed);
  } catch {
    return null;
  }
  const a = createHash("sha256").update(m[2]).digest();
  const b = createHash("sha256").update(want).digest();
  if (!timingSafeEqual(a, b)) return null;
  // A stopped company (Фирми → спряна) cannot read either.
  const active = await one("SELECT 1 FROM companies WHERE id = $1 AND archived_at IS NULL", [company]);
  return active ? company : null;
}

// ---- the tools ----

const P9 = (col: string) => `right(regexp_replace(${col}, '\\D', '', 'g'), 9)`;
const STAGES = ["new", "duplicate", "prepared", "shipped", "at_office", "delivered", "returned", "canceled", "archived", "abandoned"];
const sofiaToday = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Sofia" }).slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(sofiaToday() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
function period(a: any, def = 30) {
  const to = isDay(a?.to) ? a.to : sofiaToday();
  const from = isDay(a?.from) ? a.from : daysAgo(def - 1);
  if (from > to) throw new Error("„from“ е след „to“.");
  if (daysBetween(from, to) > 400) throw new Error("Периодът е най-много 400 дни.");
  return { from, to };
}
const str = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const items = (x: any) => (Array.isArray(x) ? x : []).map((i: any) => ({ name: i.name, qty: i.qty, total: i.total }));

const STAGE_HELP =
  "Stages: new (not sent yet), duplicate (held), prepared (waybill made), shipped (on the way), at_office (waiting at the courier's office), delivered (taken and paid – cash on delivery), returned (sent back / refused), canceled, archived, abandoned (a cart, not an order).";

export const TOOLS = [
  {
    name: "search_orders",
    title: "Търсене на поръчки",
    description: `Find orders of all shops (newest first). Search by order number, client name, phone or city; filter by stage, shop and days (Sofia time). ${STAGE_HELP} Amounts: total in the order's currency, total_eur in euro.`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Order number, part of the name, phone (any format) or city" },
        stage: { type: "string", enum: STAGES },
        shop: { type: "string", description: "Shop id (see sales_dashboard → shops)" },
        from: { type: "string", description: "First day YYYY-MM-DD" },
        to: { type: "string", description: "Last day YYYY-MM-DD" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
    },
    run: async (a: any) => {
      const where = [`s.company_id = ${companyId()}`];
      const params: unknown[] = [];
      const text = str(a.q, 80);
      if (text) {
        const digits = text.replace(/\D/g, "");
        params.push(text);
        const p = `$${params.length}`;
        const parts = [`o.order_no = ${p}`, `o.customer_name ILIKE '%' || ${p} || '%'`, `o.city ILIKE '%' || ${p} || '%'`];
        if (digits.length >= 6) {
          params.push(`%${digits.slice(-9)}`);
          parts.push(`${P9("o.phone")} LIKE $${params.length}`);
        }
        where.push(`(${parts.join(" OR ")})`);
      }
      if (STAGES.includes(a.stage)) {
        params.push(a.stage);
        where.push(`o.stage = $${params.length}`);
      } else where.push("o.stage <> 'abandoned'");
      if (str(a.shop, 40)) {
        params.push(str(a.shop, 40));
        where.push(`o.shop = $${params.length}`);
      }
      if (isDay(a.from)) {
        params.push(a.from);
        where.push(`(o.ordered_at AT TIME ZONE 'Europe/Sofia')::date >= $${params.length}::date`);
      }
      if (isDay(a.to)) {
        params.push(a.to);
        where.push(`(o.ordered_at AT TIME ZONE 'Europe/Sofia')::date <= $${params.length}::date`);
      }
      const limit = Math.min(Math.max(Math.trunc(Number(a.limit)) || 25, 1), 100);
      const rows = await q<any>(
        `SELECT o.id, o.order_no, s.label AS shop, o.ordered_at, o.customer_name, o.phone, o.email, o.city, o.stage, o.parcel_text,
                o.office_since, o.courier, o.tracking_no, o.total, o.currency, o.total_eur::float AS total_eur, o.items, o.note,
                o.confirmed_by, o.src->>'channel' AS channel, o.src->>'campaign' AS campaign, o.src->>'ad' AS ad
           FROM orders o JOIN shops s ON s.id = o.shop WHERE ${where.join(" AND ")} ORDER BY o.ordered_at DESC LIMIT ${limit}`,
        params,
      );
      return { count: rows.length, orders: rows.map((r) => ({ ...r, total: Number(r.total), items: items(r.items) })) };
    },
  },
  {
    name: "get_order",
    title: "Поръчка с хронологията",
    description: "One order with everything: client, delivery, products, courier status, and its history (calls, SMS, corrections, waybills). Give the id from search_orders, or the order number.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" }, order_no: { type: "string" }, shop: { type: "string", description: "Shop id, if the number is in more shops" } },
    },
    run: async (a: any) => {
      const params: unknown[] = [companyId()];
      let w = "";
      if (Number.isSafeInteger(Number(a.id)) && Number(a.id) > 0) {
        params.push(Number(a.id));
        w = `o.id = $2`;
      } else if (str(a.order_no, 40)) {
        params.push(str(a.order_no, 40));
        w = `o.order_no = $2`;
        if (str(a.shop, 40)) {
          params.push(str(a.shop, 40));
          w += ` AND o.shop = $3`;
        }
      } else throw new Error("Дай id или order_no.");
      const o = await one<any>(
        `SELECT o.*, s.label AS shop_label FROM orders o JOIN shops s ON s.id = o.shop WHERE s.company_id = $1 AND ${w} ORDER BY o.ordered_at DESC LIMIT 1`,
        params,
      );
      if (!o) throw new Error("Няма такава поръчка.");
      const { raw: _raw, parcel_events: _pe, cb_id: _c, ...rest } = o;
      const events = await q<any>(
        `SELECT e.kind, e.text, e.at, coalesce(u.name, e.who) AS who FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = $1 ORDER BY e.at`,
        [o.id],
      );
      return { order: { ...rest, total: Number(o.total), items: items(o.items) }, history: events };
    },
  },
  {
    name: "get_customer",
    title: "Клиент по телефон",
    description: "A client by phone: all their orders (taken, sent back, open), how much they spent on taken parcels, risk level (high/medium/low by sent-back parcels and nekorekten.com), VIP, and how many SMS and calls they got.",
    inputSchema: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] },
    run: async (a: any) => {
      const k = str(a.phone, 40).replace(/\D/g, "").slice(-9);
      if (k.length < 9) throw new Error("Телефонът трябва да има поне 9 цифри.");
      const list = await listCustomers({ q: k, per: 10 });
      return { client: list.customers.find((c: any) => c.k === k) || null, ...(await customerOrders(k)) };
    },
  },
  {
    name: "list_customers",
    title: "Клиенти",
    description: "Clients grouped by phone, with a summary (repeat share, average spent, VIP, risky). Segments: repeat, vip, new (one order), open (an order on the way now). Sort: last, spent, orders, returned, first.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        seg: { type: "string", enum: ["", "repeat", "vip", "new", "open"] },
        risk: { type: "string", enum: ["", "high", "medium", "low"] },
        sort: { type: "string", enum: ["last", "spent", "orders", "returned", "first"] },
        page: { type: "integer", minimum: 1 },
      },
    },
    run: (a: any) => listCustomers({ q: str(a.q, 80), seg: str(a.seg, 10), risk: str(a.risk, 10), sort: str(a.sort, 10), page: Number(a.page) || 1, per: 50 }),
  },
  {
    name: "sales_dashboard",
    title: "Табло: продажби",
    description: `Orders and money for a period (default the last 30 days, Sofia days): by stage, by shop, by day and the top products; Bulgaria and abroad apart with region. ${STAGE_HELP}`,
    inputSchema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, region: { type: "string", enum: ["", "bg", "abroad"] }, shop: { type: "string" } },
    },
    run: async (a: any) => {
      const p = period(a);
      const region = (["bg", "abroad"].includes(a.region) ? a.region : "") as "bg" | "abroad" | "";
      return { ...p, ...(await dashboard({ ...p, region, shop: str(a.shop, 40) })) };
    },
  },
  {
    name: "ads_report",
    title: "Реклами и страници",
    description: "Where the orders came from (channel, campaign › ad set › ad from the utm parameters, landing page) and what happened to them: orders, taken, sent back, on the way, money taken. Default the last 30 days. Only orders from 23.11.2026 on have the ad.",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, shop: { type: "string" } } },
    run: async (a: any) => {
      const p = period(a);
      return adsReport(p.from, p.to, str(a.shop, 40));
    },
  },
  {
    name: "warehouse",
    title: "Склад",
    description: "The warehouse: each product with the quantity in stock, the cost value and for how many days it lasts at the sales of the last 30 days.",
    inputSchema: { type: "object", properties: {} },
    run: () => stockOverview(),
  },
  {
    name: "open_carts",
    title: "Незавършени поръчки",
    description: "Open carts of the last 72 hours (people who started the order form but did not order): name, phone, cart, value and the reminders they got; and today's recovered ones.",
    inputSchema: { type: "object", properties: { shop: { type: "string" } } },
    run: (a: any) => cartStream(str(a.shop, 40)),
  },
];

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS =
  "OrderDesk: the orders of Mitko's shops (ConvertBuilder; BeeVenom / Здравец Натура in Bulgaria, Slovakia, Slovenia, Hungary; Еду БЕЛ), cash on delivery with Speedy and Econt. Read only. Days are Sofia time, money in euro (total_eur). Answer in Bulgarian.";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

/** One JSON-RPC message → its answer (null for a notification). */
export async function handleRpc(msg: Rpc): Promise<any | null> {
  const id = msg?.id;
  const isNote = id === undefined || id === null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return err(-32600, "Invalid Request");
  if (isNote) return null; // notifications/initialized, cancelled …
  switch (msg.method) {
    case "initialize": {
      const want = msg.params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "orderdesk", title: "OrderDesk", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ run: _run, ...t }) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return err(-32602, `Unknown tool: ${String(msg.params?.name)}`);
      try {
        const data = await tool.run(msg.params?.arguments || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(data) }] });
      } catch (e: any) {
        return ok({ content: [{ type: "text", text: String(e?.message || e) }], isError: true });
      }
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return err(-32601, `Method not found: ${msg.method}`);
  }
}
