// The sales MCP client against a fake MCP server (stateful, answers as SSE),
// through the real sync job on the local dev server in live mode.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALES = { v: 1, sites: [{ id: "bg", sessions: { "2026-11-13": 200 } }], products: ["BeeVenom Care Gel"], orders: [[0, "2026-11-13", "s", 1, 29.9, 4.5, 0, 34.4, [[0, 1, 29.9]], 0, 1001], [0, "2026-11-13", "p", 0, 29.9, 4.5, 0, 34.4, [[0, 1, 29.9]], 0, 1002]] };
let mock, srv, calls = [];
const mockPort = 8990 + Math.floor(Math.random() * 9);
const port = 9010 + Math.floor(Math.random() * 40);

before(async () => {
  mock = createServer(async (req, res) => {
    let b = "";
    for await (const c of req) b += c;
    const j = JSON.parse(b || "{}");
    calls.push(j.method);
    const sse = (obj, headers = {}) => {
      res.writeHead(200, { "content-type": "text/event-stream", ...headers });
      res.end(`event: message\ndata: ${JSON.stringify(obj)}\n\n`);
    };
    if (j.method === "initialize") return sse({ jsonrpc: "2.0", id: j.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "mock" } } }, { "mcp-session-id": "s1" });
    if (j.method === "notifications/initialized") return res.writeHead(202).end();
    if (j.method === "tools/call" && req.headers["mcp-session-id"] !== "s1") return res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: j.id, error: { code: -32000, message: "no session" } }));
    if (j.method === "tools/call") return sse({ jsonrpc: "2.0", id: j.id, result: { content: [{ type: "text", text: JSON.stringify(SALES) }] } });
    res.writeHead(404).end();
  }).listen(mockPort);
  srv = spawn(process.execPath, ["scripts/dev-server.mjs", String(port)], { cwd: root, env: { ...process.env, PILOT_DEMO: "0", APP_PASSWORD: "test-password-123", SALES_MCP_URL: `http://localhost:${mockPort}/mcp/secret` }, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = "";
  srv.stdout.on("data", (d) => (srv.out += d));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
});
after(() => {
  srv?.kill();
  mock?.close();
});

test("sync pulls orders from the sales MCP server (handshake + SSE)", async () => {
  await fetch(`http://localhost:${port}/__job/sync`);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(calls.slice(0, 3), ["tools/call", "initialize", "notifications/initialized"]);
  assert.ok(calls.filter((c) => c === "tools/call").length >= 2);
  const line = srv.out.split("\n").find((l) => l.startsWith("sync "));
  const out = JSON.parse(line.slice(5));
  assert.equal(out.sales.stored, 2, line);
  assert.equal(out.sales.source, "mcp");
});
