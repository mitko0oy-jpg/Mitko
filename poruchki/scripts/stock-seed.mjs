// Encrypts the starting stock list for netlify/lib/stock-seed.mts (the list itself never goes into git).
// Usage: node scripts/stock-seed.mjs tmp/stock-seed.json
//   → writes netlify/lib/stock-seed.mts and prints the key; put the key in Netlify as STOCK_SEED_KEY.
// Give STOCK_SEED_KEY=<key> to reuse an existing key.
// The JSON: { "countedAt": "2026-11-19T12:45:00+02:00", "items": [{ "name", "grp", "qty", "cost", "note",
//   "links": [{ "product": "<name in the orders>", "units": 5 }] }], "ignore": ["<product name>"] }
import { createCipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/stock-seed.mjs <seed.json>");
  process.exit(1);
}
const data = JSON.parse(await readFile(src, "utf8"));
if (!Array.isArray(data.items) || !data.countedAt) throw new Error("items and countedAt are required");

const key = process.env.STOCK_SEED_KEY ? Buffer.from(process.env.STOCK_SEED_KEY, "base64url") : randomBytes(32);
if (key.length !== 32) throw new Error("STOCK_SEED_KEY must be 32 bytes in base64url");
const iv = randomBytes(12);
const c = createCipheriv("aes-256-gcm", key, iv);
const enc = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
const sealed = ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");

await writeFile(
  path.join(root, "netlify/lib/stock-seed.mts"),
  `// The starting stock list (${data.items.length} products, counted ${data.countedAt}), encrypted.
// Made by scripts/stock-seed.mjs; opened with STOCK_SEED_KEY (Netlify env) by lib/stock.mts, once.
export const SEED = ${JSON.stringify(sealed)};
`,
);
console.log(`netlify/lib/stock-seed.mts written (${sealed.length} chars).`);
console.log(`STOCK_SEED_KEY=${key.toString("base64url")}`);
