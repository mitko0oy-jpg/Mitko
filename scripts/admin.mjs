// Calls the operator API. The token is read from the environment, never stored in the repo.
// Usage:
//   EDUBEL_URL=https://... ADMIN_TOKEN=... node scripts/admin.mjs import content.json
//   ... node scripts/admin.mjs codes '{"count":20,"days":60,"batch":"testers"}'
//   ... node scripts/admin.mjs stats | comments | export
//   ... node scripts/admin.mjs item 123 '{"data":{...},"resolution":"Поправено"}'
//   ... node scripts/admin.mjs users example.com
//   ... node scripts/admin.mjs delete-user parent@example.com
//   ... node scripts/admin.mjs trener-bank private/nvo-trener/bank-all.json   (НВО тренажор: questions)
//   ... node scripts/admin.mjs trener-bank-get [private/nvo-trener/bank-live.json]   (the questions served now)
//   ... node scripts/admin.mjs trener-bank-add <file with {modules, questions} and/or {retell}>   (add or replace whole modules / retelling texts)
//   ... node scripts/admin.mjs trener-bank-approve mz-chisla,mz-danni | all   (drafts the teacher approved go live)
//   ... node scripts/admin.mjs invites | invite-new <партида> [--drafts] | invite-off <партида> | invite-on <партида>   (master links)
//   ... node scripts/admin.mjs trener-codes '{"count":150,"batch":"pdf-2026-11"}' | trener-list pdf-2026-11
//   ... node scripts/admin.mjs role owner@example.com admin
//   ... node scripts/admin.mjs trener-backup [private/backups/trener-YYYY-MM-DD.json]   (codes + grades, keep it safe)
//   ... node scripts/admin.mjs trener-trace <leaked-text-file>   (which code a copied text came from)
//   ... node scripts/admin.mjs retell-try <text id> <retelling.txt> ['{"model":"claude-opus-5-5","effort":"high"}']   (the AI's raw check)
//   ... node scripts/admin.mjs reports [all] | report <id> [seen|fixed]   (signals about problems from the app)
//   ... node scripts/admin.mjs plans [plans.json | '[{"id":"full-nvo","title":"Пълен до НВО","tier":"full","until":"2027-06-30","price":59}]'] | payments
//   ... node scripts/admin.mjs trial ['{"open":true,"months":1}' | '{"open":true,"days":1}' | '{"open":false}']
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
else if (cmd === "invites") out = await call("GET", "invites");
else if (cmd === "invite-new") out = await call("POST", "invites", { batch: a, drafts: process.argv.includes("--drafts") });
else if (cmd === "invite-off" || cmd === "invite-on") out = await call("POST", "invites", { batch: a, off: cmd === "invite-off" });
else if (cmd === "trener-bank-approve") out = await call("POST", "trener-bank-approve", { ids: String(a || "").split(",").filter(Boolean) });
else if (cmd === "retell-try") out = await call("POST", "retell-try", { id: a, text: await readFile(b, "utf8"), ...(process.argv[5] ? JSON.parse(process.argv[5]) : {}) });
else if (cmd === "trener-bank-add") out = await call("POST", "trener-bank-add", JSON.parse(await readFile(a, "utf8")));
else if (cmd === "trener-bank-get") {
  const data = await call("GET", "trener-bank");
  const file = a || "private/nvo-trener/bank-live.json";
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  const math = (data.modules || []).filter((m) => m.area === "math");
  out = { file, id: data.id, modules: (data.modules || []).length, questions: (data.questions || []).length, mathCards: data.math ? data.math.cards.length : 0, mathModules: math.map((m) => m.id).join(" ") };
}
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
else if (cmd === "reports") out = await call("GET", `reports${a === "all" ? "?all=1" : ""}`);
else if (cmd === "plans") out = a ? await call("POST", "plans", { plans: JSON.parse(await readFile(a, "utf8").catch(() => a)) }) : await call("GET", "plans");
else if (cmd === "payments") out = await call("GET", "payments");
else if (cmd === "trial") out = a ? await call("POST", "trial", JSON.parse(a)) : await call("GET", "trial");
else if (cmd === "report") out = await call("POST", "report", { id: Number(a), status: b || "fixed" });
else if (["stats", "comments", "export"].includes(cmd)) out = await call("GET", cmd);
else {
  console.error("Unknown command");
  process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
