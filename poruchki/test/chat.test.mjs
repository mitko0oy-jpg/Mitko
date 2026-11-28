// Чатът на сайта: настройки, проверка на домейна, отговор от асистента (фалшив Claude), търсене на поръчка
// по телефон + име, предаване на човек, отговор от екипа, звънчето, пробата от OrderDesk.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9000 + Math.floor(Math.random() * 400);
const AI_PORT = PORT + 500;
const B = `http://localhost:${PORT}`;
const SHOP = "https://shop.test";

// ---- фалшив Claude (Messages API) ----
const calls = [];
const notes = [];
const msg = (content, stop = "end_turn") => ({ id: "msg_" + calls.length, type: "message", role: "assistant", model: "fake", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
const ai = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  if (req.url.startsWith("/agent/api/notify")) {
    notes.push({ auth: req.headers.authorization, ...JSON.parse(raw) });
    res.writeHead(200, { "content-type": "application/json" });
    return res.end('{"ok":true}');
  }
  const body = JSON.parse(raw || "{}");
  calls.push(body);
  if (typeof body.system === "string" && body.system.startsWith("Преведи")) {
    const inner = /<msg>([\s\S]*)<\/msg>/.exec(body.messages[0].content)?.[1] || "";
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(msg([{ type: "text", text: inner.includes("ПОКВАРИ") ? "" : `[SK] ${inner}` }])));
  }
  const last = body.messages[body.messages.length - 1];
  let out;
  if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
    const r = JSON.parse(last.content[0].content);
    if (r.found) out = msg([{ type: "text", text: `Objednávka č. ${r.orders[0].number} je ${r.orders[0].status}.` }]);
    else if (r.ok) out = msg([{ type: "text", text: "Ďakujem, odovzdal som to kolegovi, ozve sa Vám." }]);
    else out = msg([{ type: "text", text: "Objednávku som podľa týchto údajov nenašiel." }]);
  } else {
    const text = typeof last.content === "string" ? last.content : "";
    if (text.includes("CRASH")) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }));
    }
    if (/objednávk/i.test(text)) {
      const name = /meno (\S+)/.exec(text)?.[1] || "";
      out = msg([{ type: "tool_use", id: "tu1", name: "find_order", input: { phone: "0908 111 222", name } }], "tool_use");
    } else if (/reklam/i.test(text)) {
      out = msg([{ type: "text", text: "Mrzí ma to." }, { type: "tool_use", id: "tu2", name: "hand_over", input: { kind: "complaint", summary: "Тубата е пристигнала счупена, иска нова.", phone: "0908111222", name: "Mária" } }], "tool_use");
    } else out = msg([{ type: "text", text: "Dobrý deň! **Gél** nie je mastný." }]);
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(out));
});

let server;
let dbUrl = "";
let cookie = "";
async function api(p, body, method) {
  const r = await fetch(B + p, { method: method || (body ? "POST" : "GET"), headers: { ...(body ? { "content-type": "application/json" } : {}), cookie }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: r.status, data: await r.json().catch(() => null) };
}
const site = (p, body, origin = SHOP) =>
  fetch(B + p, { method: body ? "POST" : "GET", headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { "content-type": "text/plain;charset=UTF-8" } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({
    status: r.status,
    acao: r.headers.get("access-control-allow-origin"),
    data: await r.json().catch(() => null),
  }));

test.before(async () => {
  await new Promise((ok) => ai.listen(AI_PORT, ok));
  server = spawn(process.execPath, ["scripts/dev-server.mjs", String(PORT)], {
    cwd: root,
    env: {
      ...process.env,
      DEMO: "",
      PRINT_DB: "1",
      SETUP_CODE: "chat-setup-code-123",
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${AI_PORT}`,
      AGENT_TOKEN: "agent-token-agent-token-agent-token-0000",
      AGENT_URL: `http://127.0.0.1:${AI_PORT}/agent`,
      CB_SITES: JSON.stringify([{ id: "vcelijed", label: "Vcelijed SK", domain: "shop.test", key: "k" }]),
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((ok, fail) => {
    server.stdout.on("data", (d) => {
      const m = /db (postgres\S+)/.exec(String(d));
      if (m) dbUrl = m[1];
      if (String(d).includes("dev server on")) ok();
    });
    server.on("exit", () => fail(new Error("server exited")));
  });
});
test.after(() => {
  server?.kill();
  ai.close();
});

test("site chat: off by default, only from the shop's domain, the assistant answers, finds orders, hands over", async () => {
  assert.equal((await api("/api/auth/setup", { email: "m@example.com", name: "Митко", password: "a-long-password", code: "chat-setup-code-123" })).status, 200);
  await api("/api/shops"); // създава магазините от CB_SITES

  // Изключен: балончето не се показва и не отговаря.
  let cfg = await site("/api/chat/s/vcelijed");
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.enabled, false);
  assert.equal(cfg.acao, SHOP);
  assert.equal((await site("/api/chat/s/vcelijed", { sid: "abcdefgh12", text: "Ahoj" })).status, 404);

  // Чужд сайт – нищо.
  assert.equal((await site("/api/chat/s/vcelijed", null, "https://evil.test")).status, 403);
  assert.equal((await site("/api/chat/s/vcelijed", { sid: "abcdefgh12", text: "Ahoj" }, "https://evil.test")).status, 403);

  // Настройките: по подразбиране има информацията за vcelijed.eu; включваме.
  const st = await api("/api/chat/settings/vcelijed");
  assert.match(st.data.settings.knowledge, /BeeVenom Care Gel/);
  assert.equal(st.data.settings.email, "majstervcelar@gmail.com");
  const saved = await api("/api/chat/settings/vcelijed", { ...st.data.settings, enabled: true, color: "javascript:alert(1)", title: "<b>BeeVenom</b>" });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.settings.color, "#c8811a", "a bad colour falls back");
  assert.equal(saved.data.settings.title, "b BeeVenom /b", "no tags");
  await api("/api/chat/settings/vcelijed", { ...st.data.settings, enabled: true });

  cfg = await site("/api/chat/s/vcelijed");
  assert.equal(cfg.data.enabled, true);
  assert.match(cfg.data.greeting, /automatický asistent/, "the greeting says it is an automatic assistant");
  assert.match(cfg.data.ui.note, /automatický asistent \(AI\)/);
  assert.equal(cfg.data.knowledge, undefined, "the facts stay on the server");

  // Обикновен въпрос.
  assert.equal((await site("/api/chat/s/vcelijed", { sid: "bad", text: "Ahoj" })).status, 400);
  let r = await site("/api/chat/s/vcelijed", { sid: "chatsid0001", text: "Je gél mastný?", page: "/" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.acao, SHOP);
  assert.equal(r.data.messages.length, 2);
  assert.equal(r.data.messages[1].t, "Dobrý deň! Gél nie je mastný.", "no markdown stars");
  assert.equal(r.data.total, 2);
  const first = calls[calls.length - 1];
  assert.match(first.system[0].text, /автоматичният асистент/);
  assert.match(first.system[0].text, /словашки/);
  assert.match(first.system[0].text, /BeeVenom Care Gel/);
  assert.deepEqual(first.tools.map((t) => t.name), ["find_order", "hand_over"]);

  // Поръчка: телефон + име трябва да съвпадат.
  const pg = (await import("pg")).default;
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  await db.query(
    `INSERT INTO orders (shop, cb_id, order_no, ordered_at, day, cb_status, customer_name, phone, address, items, total, currency, total_eur)
     VALUES ('vcelijed', 777, '98850', now() - interval '1 day', current_date, 'pending', 'Mária Nováková', '+421908111222', 'Hlavná 1, Bratislava',
             '[{"name":"Včelí jed 3+2","qty":1,"total":29.9}]', 29.9, 'EUR', 29.9)`,
  );
  r = await site("/api/chat/s/vcelijed", { sid: "chatsid0001", text: "Kde je moja objednávka? Telefón 0908 111 222, meno Novakova" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.messages[1].t, "Objednávka č. 98850 je prijatá, pripravuje sa na odoslanie.", "found by phone + name without diacritics");
  const toolRes = JSON.parse(calls[calls.length - 1].messages.at(-1).content[0].content);
  assert.equal(JSON.stringify(toolRes).includes("Hlavná"), false, "the address is never given to the assistant");
  r = await site("/api/chat/s/vcelijed", { sid: "chatsid0001", text: "A moja objednávka? meno Kováč" });
  assert.equal(r.data.messages[1].t, "Objednávku som podľa týchto údajov nenašiel.", "another name – nothing");

  // Оплакване → предадено на човек; звънчето светва.
  r = await site("/api/chat/s/vcelijed", { sid: "chatsid0002", text: "Chcem reklamáciu, tuba prišla rozbitá" });
  assert.equal(r.data.status, "human");
  assert.match(r.data.messages[1].t, /odovzdal som to kolegovi/);
  assert.equal((await api("/api/stats/alerts")).data.chats, 1);
  assert.equal(notes.length, 1, "one Telegram notice for the new case");
  assert.equal(notes[0].auth, "Bearer agent-token-agent-token-agent-token-0000");
  assert.match(notes[0].text, /Vcelijed SK: Оплакване/);
  assert.match(notes[0].text, /счупена/);
  assert.match(notes[0].text, /0908111222/);
  assert.match(notes[0].text, /\/chat\/\?c=\d+/);
  let list = await api("/api/chat/list?tab=human");
  assert.equal(list.data.counts.human, 1);
  const c = list.data.chats[0];
  assert.equal(c.kind_bg, "Оплакване");
  assert.equal(c.phone, "0908111222");
  assert.equal(c.unseen, true);
  assert.match(c.case_summary, /счупена/);

  // Отговор от екипа стига до балончето.
  const one = await api(`/api/chat/c/${c.id}`);
  assert.equal(one.data.chat.messages.length, 2);
  const rep = await api(`/api/chat/c/${c.id}/reply`, { text: "Здравейте, ще Ви изпратим нова туба." });
  assert.equal(rep.status, 200, JSON.stringify(rep.data));
  assert.equal(rep.data.chat.lang, "sk");
  const h = rep.data.chat.messages.at(-1);
  assert.equal(h.t, "[SK] Здравейте, ще Ви изпратим нова туба.", "translated into the shop's language");
  assert.equal(h.o, "Здравейте, ще Ви изпратим нова туба.", "the original stays for the team");
  const polled = await site(`/api/chat/s/vcelijed/m?sid=chatsid0002&after=2`);
  assert.equal(polled.data.messages.length, 1);
  assert.equal(polled.data.messages[0].r, "h");
  assert.equal(polled.data.messages[0].t, "[SK] Здравейте, ще Ви изпратим нова туба.");
  assert.equal(polled.data.total, 3);
  // Без превод (вече е на словашки) и неуспешен превод – нищо не стига до клиента.
  assert.equal((await api(`/api/chat/c/${c.id}/reply`, { text: "Dobrý deň, pošleme Vám novú tubu.", translate: false })).data.chat.messages.at(-1).t, "Dobrý deň, pošleme Vám novú tubu.");
  const badTr = await api(`/api/chat/c/${c.id}/reply`, { text: "ПОКВАРИ превода" });
  assert.equal(badTr.status, 400);
  assert.match(badTr.data.message, /Преводът не стана/);
  assert.equal((await site(`/api/chat/s/vcelijed/m?sid=chatsid0002&after=0`)).data.total, 4);
  // Клиентът пише пак: асистентът вижда отговора на екипа.
  await site("/api/chat/s/vcelijed", { sid: "chatsid0002", text: "Ďakujem" });
  assert.match(JSON.stringify(calls[calls.length - 1].messages), /Kolega z tímu\] \[SK\] Здравейте/);

  // Приключено → звънчето гасне.
  await api(`/api/chat/c/${c.id}/status`, { status: "done" });
  assert.equal((await api("/api/stats/alerts")).data.chats, 0);
  list = await api("/api/chat/list?tab=all");
  assert.equal(list.data.counts.all, 2);
  assert.equal(list.data.shops[0].enabled, true);

  // Ако Claude не отговаря – учтив отговор с имейла и случаят чака човек.
  r = await site("/api/chat/s/vcelijed", { sid: "chatsid0003", text: "CRASH" });
  assert.equal(r.status, 200);
  assert.match(r.data.messages[1].t, /majstervcelar@gmail\.com/);
  assert.equal(r.data.status, "human");
  assert.equal(notes.length, 2, "the failed answer also tells the team");
  assert.match(notes[1].text, /Клиентът: „CRASH“/);

  // Проба от OrderDesk (влязъл човек, без Origin) – работи и при изключен чат; без вход – не.
  await api("/api/chat/settings/vcelijed", { ...st.data.settings, enabled: false });
  const pv = await fetch(`${B}/api/chat/s/vcelijed`, { headers: { cookie } }).then((x) => x.json());
  assert.equal(pv.enabled, true);
  const pvPost = await fetch(`${B}/api/chat/s/vcelijed`, { method: "POST", headers: { cookie, "content-type": "text/plain" }, body: JSON.stringify({ sid: "preview0001", text: "Test" }) });
  assert.equal(pvPost.status, 200);
  assert.equal(notes.length, 2, "a try from OrderDesk does not notify");
  assert.equal((await fetch(`${B}/api/chat/s/vcelijed`)).status, 403);
  assert.equal((await site("/api/chat/s/vcelijed")).data.enabled, false, "the site still sees it off");

  // Страницата и скриптът се зареждат.
  assert.equal((await fetch(`${B}/chat/`)).status, 200);
  const js = await (await fetch(`${B}/chat.js`)).text();
  assert.match(js, /data-shop/);
  await db.end();
});
