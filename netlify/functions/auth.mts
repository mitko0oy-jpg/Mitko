import type { Config } from "@netlify/functions";
import { testMode } from "../lib/access.mts";
import {
  burnPasswordCheck,
  createSession,
  destroySession,
  getAuth,
  hashPassword,
  normalizeUsername,
  requireUser,
  updateSessionChild,
  validEmail,
  verifyPassword,
} from "../lib/auth.mts";
import { event, hit, one, tx } from "../lib/db.mts";
import { bad, body, clientIp, forbidden, handle, json, notFound, str, sub, tooMany, unauthorized } from "../lib/http.mts";
import { redeemCode } from "../lib/codes.mts";

async function me(req: Request) {
  const { user, child } = await getAuth(req);
  return {
    user: user && { name: user.name, email: user.email, role: user.role },
    child: child && { id: child.id, name: child.display_name, username: child.username, grade: child.grade },
    viaParent: !!(user && child),
    testMode: testMode(),
  };
}

export default handle(async (req, ctx) => {
  const [action] = sub(req, "/api/auth/");
  const ip = clientIp(req, ctx);

  if (req.method === "GET" && action === "me") return json(await me(req));

  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  if (action === "register") {
    if (!(await hit(`reg:${ip}`, 10, 3600))) throw tooMany();
    const email = str(b.email, 200).toLowerCase();
    const name = str(b.name, 80);
    const password = typeof b.password === "string" ? b.password : "";
    const code = str(b.code, 40);
    if (!name) throw bad("name", "Напиши името си.");
    if (!validEmail(email)) throw bad("email", "Провери имейла.");
    if (password.length < 8 || password.length > 200) throw bad("password", "Паролата трябва да е поне 8 знака.");
    if (b.consent !== true) throw bad("consent", "Нужно е съгласието ти като родител.");
    const hash = await hashPassword(password);
    const userId = await tx(async (t) => {
      const exists = await t("SELECT 1 FROM users WHERE email = $1", [email]);
      if (exists.length) throw bad("email_taken", "Вече има профил с този имейл. Влез с паролата си.");
      const [u] = await t<{ id: number }>(
        "INSERT INTO users (email, password_hash, name, consent_at) VALUES ($1, $2, $3, now()) RETURNING id",
        [email, hash, name],
      );
      return Number(u.id);
    });
    let codeResult = null;
    if (code) {
      try {
        codeResult = await redeemCode(userId, code);
      } catch (e: any) {
        codeResult = { error: e.message };
      }
    }
    await event("register", {}, userId);
    const cookie = await createSession(req, userId, null);
    const res = json({ ok: true, code: codeResult }, 200, { "set-cookie": cookie });
    return res;
  }

  if (action === "login") {
    if (!(await hit(`login:${ip}`, 30, 600))) throw tooMany();
    const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
    if (b.username) {
      const username = normalizeUsername(str(b.username, 40));
      if (!(await hit(`login:c:${username}`, 10, 600))) throw tooMany();
      const c = await one<any>("SELECT id, password_hash FROM children WHERE username = $1", [username]);
      if (!c) {
        await burnPasswordCheck(password);
        throw unauthorized("Грешно потребителско име или парола.");
      }
      if (!(await verifyPassword(password, c.password_hash))) throw unauthorized("Грешно потребителско име или парола.");
      await event("login_child", {}, null, Number(c.id));
      return json({ ok: true }, 200, { "set-cookie": await createSession(req, null, Number(c.id)) });
    }
    const email = str(b.email, 200).toLowerCase();
    if (!(await hit(`login:u:${email}`, 10, 600))) throw tooMany();
    const u = await one<any>("SELECT id, password_hash FROM users WHERE email = $1", [email]);
    if (!u) {
      await burnPasswordCheck(password);
      throw unauthorized("Грешен имейл или парола.");
    }
    if (!(await verifyPassword(password, u.password_hash))) throw unauthorized("Грешен имейл или парола.");
    return json({ ok: true }, 200, { "set-cookie": await createSession(req, Number(u.id), null) });
  }

  if (action === "logout") {
    return json({ ok: true }, 200, { "set-cookie": await destroySession(req) });
  }

  // A parent opens a child's profile on the same device (no child password needed).
  if (action === "switch") {
    const user = await requireUser(req, ["parent", "reviewer", "admin"]);
    const childId = Number(b.childId);
    const c = await one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [childId, user.id]);
    if (!c) throw forbidden();
    await updateSessionChild(req, childId);
    return json({ ok: true });
  }

  if (action === "switch-back") {
    const { user } = await getAuth(req);
    if (!user) throw unauthorized("Влез като родител.");
    await updateSessionChild(req, null);
    return json({ ok: true });
  }

  throw notFound();
});

export const config: Config = { path: "/api/auth/*" };
