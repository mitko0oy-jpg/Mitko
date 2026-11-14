// Single-owner login: the password lives only in the Netlify env (APP_PASSWORD).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { q, one, pgStore } from "./db.mts";
import { env, cookie, HttpError } from "./http.mts";

const COOKIE = "pl_s";
const DAYS = 30;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function isAuthed(req: Request): Promise<boolean> {
  const t = cookie(req, COOKIE);
  if (!t) return false;
  const row = await one("SELECT 1 FROM auth_sessions WHERE token_hash = $1 AND expires_at > now()", [sha(t)]);
  return !!row;
}

export async function requireAuth(req: Request) {
  if (!(await isAuthed(req))) throw new HttpError(401, "auth", "Влез отново.");
}

export async function login(req: Request, password: string): Promise<string> {
  const expected = env("APP_PASSWORD");
  if (!expected || expected.length < 8) throw new HttpError(503, "no_password", "Паролата не е настроена в Netlify (APP_PASSWORD, поне 8 знака).");
  // Simple brute-force brake: 10 failed attempts per 15 minutes.
  const key = `login:${new Date().toISOString().slice(0, 15)}`;
  const tries = ((await pgStore.get("rate", key)) as any)?.n || 0;
  if (tries >= 10) throw new HttpError(429, "slow_down", "Твърде много опити. Изчакай 15 минути.");
  const a = Buffer.from(sha(password || "")), b = Buffer.from(sha(expected));
  if (!timingSafeEqual(a, b)) {
    await pgStore.put("rate", key, { n: tries + 1 });
    throw new HttpError(401, "wrong", "Грешна парола.");
  }
  const token = randomBytes(32).toString("base64url");
  await q("INSERT INTO auth_sessions (token_hash, expires_at) VALUES ($1, now() + make_interval(days => $2))", [sha(token), DAYS]);
  await q("DELETE FROM auth_sessions WHERE expires_at < now()");
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

export async function logout(req: Request): Promise<string> {
  const t = cookie(req, COOKIE);
  if (t) await q("DELETE FROM auth_sessions WHERE token_hash = $1", [sha(t)]);
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
