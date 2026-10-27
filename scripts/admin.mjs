// Calls the operator API. The token is read from the environment, never stored in the repo.
// Usage:
//   EDUBEL_URL=https://... ADMIN_TOKEN=... node scripts/admin.mjs import content.json
//   ... node scripts/admin.mjs codes '{"count":20,"days":60,"batch":"testers"}'
//   ... node scripts/admin.mjs stats | comments | export
//   ... node scripts/admin.mjs item 123 '{"data":{...},"resolution":"Поправено"}'
//   ... node scripts/admin.mjs users example.com
//   ... node scripts/admin.mjs delete-user parent@example.com
import { readFile } from "node:fs/promises";

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
else if (cmd === "delete-user") out = await call("POST", "delete-user", { email: a, confirm: a });
else if (cmd === "users") out = await call("GET", `users?q=${encodeURIComponent(a || "")}`);
else if (["stats", "comments", "export"].includes(cmd)) out = await call("GET", cmd);
else {
  console.error("Unknown command");
  process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
