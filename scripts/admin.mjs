// Calls the operator API. The token is read from the environment, never stored in the repo.
// Usage:
//   EDUBEL_URL=https://... ADMIN_TOKEN=... node scripts/admin.mjs import content.json
//   ... node scripts/admin.mjs codes '{"count":20,"days":60,"batch":"testers"}'
//   ... node scripts/admin.mjs stats | comments | export
//   ... node scripts/admin.mjs item 123 '{"data":{...},"resolution":"Поправено"}'
//   ... node scripts/admin.mjs users example.com
//   ... node scripts/admin.mjs delete-user parent@example.com
//   ... node scripts/admin.mjs trener-bank private/nvo-trener/bank-all.json   (НВО тренажор: questions)
//   ... node scripts/admin.mjs trener-codes '{"count":150,"batch":"pdf-2026-11"}' | trener-list pdf-2026-11
//   ... node scripts/admin.mjs role owner@example.com admin
//   ... node scripts/admin.mjs trener-backup [private/backups/trener-YYYY-MM-DD.json]   (codes + grades, keep it safe)
//   ... node scripts/admin.mjs trener-trace <leaked-text-file>   (which code a copied text came from)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const base = process.env.EDUBEL_URL || "http://localhost:8888";
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("ADMIN_TOKEN is not set");
  process.exit(1);
}
const [cmd, a, b] = process.argv.slice(2);

async function call(method, path, payload) {
  const res = await fetch(`${base}/api/admin/${path}`, {
    method,
    headers: { "x-admin-token": token, "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(res.status, text);
    process.exit(1);
  }
  return JSON.parse(text);
}

let out;
if (cmd === "import") out = await call("POST", "import", JSON.parse(await readFile(a, "utf8")));
else if (cmd === "codes") out = await call("POST", "codes", JSON.parse(a || "{}"));
else if (cmd === "item") out = await call("POST", `items/${a}`, JSON.parse(b || "{}"));
else if (cmd === "trener-bank") out = await call("POST", "trener-bank", JSON.parse(await readFile(a, "utf8")));
else if (cmd === "trener-codes") out = await call("POST", "trener-codes", JSON.parse(a || "{}"));
else if (cmd === "trener-list") out = await call("GET", `trener-codes?batch=${encodeURIComponent(a || "")}`);
else if (cmd === "role") out = await call("POST", "role", { email: a, role: b });
else if (cmd === "trener-trace") out = await call("POST", "trener-trace", { text: await readFile(a, "utf8") });
else if (cmd === "trener-backup") {
  const data = await call("GET", "trener-backup");
  const file = a || `private/backups/trener-${new Date().toISOString().slice(0, 10)}.json`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  out = { file, keys: data.keys.length, devices: data.devices.length, bankId: data.bankId };
}
else if (cmd === "delete-user") out = await call("POST", "delete-user", { email: a, confirm: a });
else if (cmd === "users") out = await call("GET", `users?q=${encodeURIComponent(a || "")}`);
else if (["stats", "comments", "export"].includes(cmd)) out = await call("GET", cmd);
else {
  console.error("Unknown command");
  process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
