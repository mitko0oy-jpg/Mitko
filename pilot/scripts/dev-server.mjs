// Local test server: static files from public/, API from netlify/functions, and an
// in-memory Postgres with the real migrations. By default it runs on demo data
// (PILOT_DEMO=1) so nothing touches Meta.  Usage: node scripts/dev-server.mjs [port]
import { createServer } from "node:http";
import { readFile, readdir, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { NetlifyDB } from "@netlify/database-dev";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 8899);

const db = new NetlifyDB({ logger: () => {} });
process.env.NETLIFY_DB_URL = await db.start();
await db.applyMigrations(path.join(root, "netlify/database/migrations"));
process.env.APP_PASSWORD ||= "local-pilot-password";
process.env.PILOT_DEMO ||= "1";
globalThis.Netlify = { env: { get: (k) => process.env[k] } };

const fnDir = path.join(root, "netlify/functions");
const outDir = path.join(root, "tmp/functions");
await mkdir(outDir, { recursive: true });
const routes = [];
const jobs = {};
for (const f of (await readdir(fnDir)).filter((f) => f.endsWith(".mts"))) {
  const out = path.join(outDir, f.replace(/\.mts$/, ".mjs"));
  await build({ entryPoints: [path.join(fnDir, f)], bundle: true, platform: "node", format: "esm", packages: "external", outfile: out, logLevel: "warning" });
  const mod = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
  if (mod.config?.schedule) jobs[f.replace(/\.mts$/, "")] = mod.default;
  const paths = [].concat(mod.config?.path || `/.netlify/functions/${f.replace(/\.mts$/, "")}`);
  routes.push({ paths, handler: mod.default });
}
const match = (p, pattern) => (pattern.endsWith("/*") ? p.startsWith(pattern.slice(0, -1)) : p === pattern);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  // Run a scheduled job by hand: /__job/sync or /__job/daily
  if (url.pathname.startsWith("/__job/")) {
    const j = jobs[url.pathname.slice(7)];
    if (!j) return res.writeHead(404).end("no job");
    await j(new Request(url));
    return res.writeHead(200).end("done");
  }
  const route = routes.find((r) => r.paths.some((p) => match(url.pathname, p)));
  if (route) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await route.handler(request, { ip: "127.0.0.1" });
    const headers = {};
    response.headers.forEach((v, k) => (headers[k] = k === "set-cookie" ? v.replace("; Secure", "") : v));
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let file = path.join(root, "public", decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(root, "public"))) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => console.log(`Пилот: http://localhost:${port}  (парола: ${process.env.APP_PASSWORD}, демо: ${process.env.PILOT_DEMO === "1" ? "да" : "не"})`));
