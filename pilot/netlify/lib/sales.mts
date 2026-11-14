// Shop orders. Three ways in:
// 1) MCP: SALES_MCP_URL is the address of the ConvertBuilder sales MCP server
//    (tool get_sales, format v1) – the same source Claude reads;
// 2) pull: SALES_URL returns format v1 for ?from=YYYY-MM-DD&to=YYYY-MM-DD,
//    with Authorization: Bearer SALES_TOKEN;
// 3) push: a webhook to /api/hook/orders with header x-pilot-secret = SALES_HOOK_SECRET.
// Orders carry no personal data.
import { env, HttpError } from "./http.mts";
import { q } from "./db.mts";

export type Order = { site: string; date: string; status: string; shipped: number; subTotal: number; shipping: number; discount: number; total: number; items: { product: string; qty: number; total: number }[]; orderNo: string; utm?: Record<string, string> };

// Decode the compact v1 format: orders are arrays with indexes into sites/products.
export function decodeV1(j: any): { orders: Order[]; sessions: { site: string; date: string; sessions: number }[] } {
  if (!j || j.v !== 1 || !Array.isArray(j.orders)) throw new HttpError(502, "sales_format", "Непознат формат на продажбите.");
  const sites = (j.sites || []).map((s: any) => s.id);
  const orders: Order[] = j.orders.map((o: any[]) => ({
    site: sites[o[0]] ?? String(o[0]), date: o[1], status: o[2], shipped: o[3] ? 1 : 0, subTotal: +o[4] || 0, shipping: +o[5] || 0, discount: +o[6] || 0, total: +o[7] || 0,
    items: (o[8] || []).map((it: any[]) => ({ product: j.products?.[it[0]] ?? String(it[0]), qty: +it[1] || 1, total: +it[2] || 0 })),
    orderNo: String(o[10] ?? `${o[1]}-${Math.random()}`),
  }));
  const sessions = [];
  for (const s of j.sites || []) for (const [date, n] of Object.entries(s.sessions || {})) sessions.push({ site: s.id, date, sessions: Number(n) || 0 });
  return { orders, sessions };
}

export async function store(orders: Order[], sessions: { site: string; date: string; sessions: number }[] = []) {
  for (const o of orders) {
    await q(
      `INSERT INTO orders (site, order_no, date, data, synced_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (site, order_no) DO UPDATE SET data = EXCLUDED.data, date = EXCLUDED.date, synced_at = now()`,
      [o.site, o.orderNo, o.date, JSON.stringify(o)],
    );
  }
  for (const s of sessions) {
    await q(`INSERT INTO site_sessions (site, date, sessions) VALUES ($1,$2,$3) ON CONFLICT (site, date) DO UPDATE SET sessions = EXCLUDED.sessions`, [s.site, s.date, s.sessions]);
  }
  return orders.length;
}

// Minimal MCP client (JSON-RPC over HTTP, JSON or SSE answers).
async function rpc(url: string, body: unknown, session?: string) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await r.text();
  let j: any = null;
  if ((r.headers.get("content-type") || "").includes("text/event-stream")) {
    const datas = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
    for (const d of datas) {
      try {
        const x = JSON.parse(d);
        if (x.id === (body as any).id) j = x;
      } catch {}
    }
  } else {
    try {
      j = JSON.parse(text);
    } catch {}
  }
  return { status: r.status, j, session: r.headers.get("mcp-session-id") || session };
}

export async function pullMcp(from: string, to: string) {
  const url = env("SALES_MCP_URL")!;
  const call = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_sales", arguments: { from, to } } };
  let res = await rpc(url, call);
  if (!res.j?.result) {
    // Stateful servers want a handshake first.
    const init = await rpc(url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pilot", version: "0.1" } } });
    await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(init.session ? { "mcp-session-id": init.session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }).catch(() => {});
    res = await rpc(url, call, init.session);
  }
  if (res.j?.error || res.j?.result?.isError) throw new HttpError(502, "sales_mcp", `Сървърът за продажби върна грешка: ${res.j?.error?.message || "tool error"}`);
  const text = (res.j?.result?.content || []).find((c: any) => c.type === "text")?.text;
  const data = res.j?.result?.structuredContent || (text ? JSON.parse(text) : null);
  if (!data) throw new HttpError(502, "sales_mcp", `Сървърът за продажби не отговори (HTTP ${res.status}).`);
  const { orders, sessions } = decodeV1(data);
  return { stored: await store(orders, sessions), source: "mcp" };
}

export const salesConfigured = () => !!(env("SALES_MCP_URL") || env("SALES_URL"));

export async function pull(from: string, to: string) {
  if (env("SALES_MCP_URL")) return pullMcp(from, to);
  const url = env("SALES_URL");
  if (!url) return { skipped: "no SALES_URL" };
  const u = new URL(url);
  u.searchParams.set("from", from);
  u.searchParams.set("to", to);
  const r = await fetch(u, { headers: { authorization: `Bearer ${env("SALES_TOKEN") || ""}`, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new HttpError(502, "sales", `Магазинът върна ${r.status}.`);
  const { orders, sessions } = decodeV1(await r.json());
  return { stored: await store(orders, sessions) };
}

// Webhook: accepts either the v1 format or a list of normalized orders.
export async function ingest(body: any) {
  if (body?.v === 1) {
    const { orders, sessions } = decodeV1(body);
    return store(orders, sessions);
  }
  const list = Array.isArray(body) ? body : body?.orders;
  if (!Array.isArray(list)) throw new HttpError(400, "bad_orders", "Очаквам списък с поръчки.");
  const clean: Order[] = list.slice(0, 2000).map((o: any) => ({
    site: String(o.site || "main"), date: String(o.date).slice(0, 10), status: ["p", "s", "c", "x", "a"].includes(o.status) ? o.status : "p", shipped: o.shipped ? 1 : 0,
    subTotal: +o.subTotal || 0, shipping: +o.shipping || 0, discount: +o.discount || 0, total: +o.total || 0,
    items: (o.items || []).map((i: any) => ({ product: String(i.product || ""), qty: +i.qty || 1, total: +i.total || 0 })),
    orderNo: String(o.orderNo || o.id), utm: o.utm && typeof o.utm === "object" ? o.utm : undefined,
  }));
  return store(clean);
}
