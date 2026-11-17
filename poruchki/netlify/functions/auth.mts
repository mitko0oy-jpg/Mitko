import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { burnPasswordCheck, createSession, destroySession, getUser, hashPassword, validEmail, verifyPassword } from "../lib/auth.mts";
import { hit, one, tx } from "../lib/db.mts";
import { bad, body, clientIp, env, forbidden, handle, json, notFound, str, sub, tooMany, unauthorized } from "../lib/http.mts";

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default handle(async (req, ctx) => {
  const [action] = sub(req, "/api/auth/");
  const ip = clientIp(req, ctx);

  if (req.method === "GET" && action === "me") {
    const user = await getUser(req);
    const any = user ? null : await one("SELECT 1 FROM users LIMIT 1");
    return json({ user: user && { name: user.name, email: user.email, role: user.role }, needsSetup: !user && !any });
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  // The very first account. Needs SETUP_CODE from the Netlify settings, so nobody else can take the empty site.
  if (action === "setup") {
    if (!(await hit(`setup:${ip}`, 10, 3600))) throw tooMany();
    const code = env("SETUP_CODE") || "";
    if (code.length < 12 || !sameText(str(b.code, 100), code)) throw forbidden("Кодът за първи вход не е верен.");
    const email = str(b.email, 200).toLowerCase();
    const name = str(b.name, 80);
    const password = typeof b.password === "string" ? b.password : "";
    if (!validEmail(email)) throw bad("email", "Провери имейла.");
    if (password.length < 10 || password.length > 200) throw bad("password", "Паролата трябва да е поне 10 знака.");
    const hash = await hashPassword(password);
    const id = await tx(async (t) => {
      const exists = await t("SELECT 1 FROM users LIMIT 1");
      if (exists.length) throw forbidden("Вече има профил. Влез с него.");
      const [u] = await t<{ id: number }>("INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin') RETURNING id", [email, hash, name]);
      return Number(u.id);
    });
    return json({ ok: true }, 200, { "set-cookie": await createSession(req, id) });
  }

  if (action === "login") {
    if (!(await hit(`login:${ip}`, 30, 600))) throw tooMany();
    const email = str(b.email, 200).toLowerCase();
    const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
    if (!(await hit(`login:u:${email}`, 10, 600))) throw tooMany();
    const u = await one<any>("SELECT id, password_hash FROM users WHERE email = $1", [email]);
    if (!u) {
      await burnPasswordCheck(password);
      throw unauthorized("Грешен имейл или парола.");
    }
    if (!(await verifyPassword(password, u.password_hash))) throw unauthorized("Грешен имейл или парола.");
    return json({ ok: true }, 200, { "set-cookie": await createSession(req, Number(u.id)) });
  }

  if (action === "logout") return json({ ok: true }, 200, { "set-cookie": await destroySession(req) });

  throw notFound();
});

export const config: Config = { path: "/api/auth/*" };
