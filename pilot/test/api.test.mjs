// End-to-end: the real functions on the local dev server (Postgres in memory, demo data).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 8950 + Math.floor(Math.random() * 40);
const base = `http://localhost:${port}`;
let srv, cookie = "";

before(async () => {
  srv = spawn(process.execPath, ["scripts/dev-server.mjs", String(port)], { cwd: root, env: { ...process.env, APP_PASSWORD: "test-password-123", PILOT_DEMO: "1", SALES_HOOK_SECRET: "hook-secret-xyz" }, stdio: "pipe" });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
});
after(() => srv?.kill());

const call = async (p, opts = {}) => {
  const r = await fetch(base + p, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: r.status, body: await r.json().catch(() => null) };
};

test("views need a login", async () => {
  assert.equal((await call("/api/view/dashboard")).status, 401);
  assert.equal((await call("/api/do/login", { method: "POST", body: JSON.stringify({ args: { password: "wrong" } }) })).status, 401);
  assert.equal((await call("/api/do/login", { method: "POST", body: JSON.stringify({ args: { password: "test-password-123" } }) })).status, 200);
  const d = await call("/api/view/dashboard?range=d7");
  assert.equal(d.status, 200);
  assert.ok(d.body.kpi.spend > 0);
});

test("every view answers", async () => {
  for (const v of ["campaigns", "creatives", "autopilot", "market", "learning", "settingsView"]) {
    const r = await call(`/api/view/${v}`);
    assert.equal(r.status, 200, v);
  }
});

test("actions go through and are stored in Postgres", async () => {
  const s = await call("/api/do/saveSettings", { method: "POST", body: JSON.stringify({ args: { mode: "copilot" } }) });
  assert.equal(s.status, 200);
  assert.equal((await call("/api/view/autopilot")).body.mode, "copilot");
  const bad = await call("/api/do/saveSettings", { method: "POST", body: JSON.stringify({ args: { mode: "yolo" } }) });
  assert.equal(bad.status, 400);
  assert.equal((await call("/api/do/nope", { method: "POST", body: "{}" })).status, 404);
});

test("order webhook needs the secret", async () => {
  const o = [{ site: "bg", date: "2026-11-13", status: "p", total: 30, items: [{ product: "Gel", qty: 1, total: 30 }], orderNo: "A1" }];
  assert.equal((await call("/api/hook/orders", { method: "POST", body: JSON.stringify(o) })).status, 401);
  const ok = await call("/api/hook/orders", { method: "POST", headers: { "x-pilot-secret": "hook-secret-xyz" }, body: JSON.stringify(o) });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.stored, 1);
});
