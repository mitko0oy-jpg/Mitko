// Local test server: static files from public/, API functions from netlify/functions,
// and an in-memory Postgres from @netlify/database-dev with the real migrations.
// Usage: node scripts/dev-server.mjs [port]
import { createServer } from "node:http";
import { readFile, readdir, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { NetlifyDB } from "@netlify/database-dev";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 8888);

const db = new NetlifyDB({ logger: () => {} });
process.env.NETLIFY_DB_URL = await db.start();
await db.applyMigrations(path.join(root, "netlify/database/migrations"));
process.env.ADMIN_TOKEN ||= "local-admin-token-local-admin-token-0000";
process.env.TEST_MODE ||= "1";
globalThis.Netlify = { env: { get: (k) => process.env[k] } };

const fnDir = path.join(root, "netlify/functions");
const outDir = path.join(root, "tmp/functions");
await mkdir(outDir, { recursive: true });
const routes = [];
for (const f of (await readdir(fnDir)).filter((f) => f.endsWith(".mts"))) {
  const out = path.join(outDir, f.replace(/\.mts$/, ".mjs"));
  await build({ entryPoints: [path.join(fnDir, f)], bundle: true, platform: "node", format: "esm", packages: "external", outfile: out, logLevel: "warning" });
  const mod = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
  const paths = [].concat(mod.config?.path || `/.netlify/functions/${f.replace(/\.mts$/, "")}`);
  routes.push({ paths, handler: mod.default });
}
const match = (p, pattern) => (pattern.endsWith("/*") ? p.startsWith(pattern.slice(0, -1)) : p === pattern);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const route = routes.find((r) => r.paths.some((p) => match(url.pathname, p)));
  if (route) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await route.handler(request, { ip: "127.0.0.1" });
    const headers = {};
    response.headers.forEach((v, k) => (headers[k] = v));
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let file = path.join(root, "public", decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(root, "public"))) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    try {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      res.end(await readFile(path.join(root, "public/404.html")));
    } catch {
      res.writeHead(404).end("Not found");
    }
  }
}).listen(port, () => console.log(`dev server on http://localhost:${port}`));
