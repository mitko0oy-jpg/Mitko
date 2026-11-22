// Връзка с Claude: the MCP server at /mcp/<company>.<token> (read only), and its settings at /api/mcp (owner only).
import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { hit } from "../lib/db.mts";
import { bad, body, handle, json, notFound } from "../lib/http.mts";
import { companyForToken, handleRpc, mcpSettings, setMcp } from "../lib/mcp.mts";
import { withCompany } from "../lib/tenant.mts";

const settings = handle(async (req) => {
  await requireUser(req, ["admin"]);
  if (req.method === "GET") return json(await mcpSettings());
  if (req.method !== "POST") throw notFound();
  const b = await body(req);
  if (b.action !== "new" && b.action !== "off") throw bad("action", "Избери „нов линк“ или „изключи“.");
  return json(await setMcp(b.action));
});

const rpcHeaders = { "content-type": "application/json", "cache-control": "no-store" };

export default async (req: Request, ctx: any) => {
  const url = new URL(req.url);
  if (url.pathname === "/api/mcp") return settings(req, ctx);
  const token = decodeURIComponent(url.pathname.replace(/^\/mcp\/?/, "").replace(/\/+$/, ""));
  // No server-to-client stream (GET) and no sessions to end (DELETE).
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const company = await companyForToken(token);
  if (!company) return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Линкът не е валиден или е сменен." } }), { status: 404, headers: rpcHeaders });
  if (!(await hit(`mcp:${company}`, 600, 3600))) return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "Твърде много заявки. Опитай след малко." } }), { status: 429, headers: rpcHeaders });
  let msg: any;
  try {
    const text = await req.text();
    if (text.length > 100_000) return new Response(null, { status: 413 });
    msg = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }), { status: 400, headers: rpcHeaders });
  }
  return withCompany(company, async () => {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(handleRpc))).filter(Boolean);
      return out.length ? new Response(JSON.stringify(out), { headers: rpcHeaders }) : new Response(null, { status: 202 });
    }
    const out = await handleRpc(msg);
    return out ? new Response(JSON.stringify(out), { headers: rpcHeaders }) : new Response(null, { status: 202 });
  });
};

export const config: Config = { path: ["/mcp/*", "/api/mcp"] };
