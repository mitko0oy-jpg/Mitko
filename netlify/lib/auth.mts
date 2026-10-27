import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { one, q } from "./db.mts";
import { cookieHeader, env, forbidden, getCookie, unauthorized } from "./http.mts";

const COOKIE = "eb_s";
const SESSION_DAYS = 30;

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keylen, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Used to keep login timing similar whether or not the account exists.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const burnPasswordCheck = (password: string) => verifyPassword(password, DUMMY_HASH);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(req: Request, userId: number | null, childId: number | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q("INSERT INTO sessions (token_hash, user_id, child_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))", [
    sha256(token),
    userId,
    childId,
    SESSION_DAYS,
  ]);
  return cookieHeader(COOKIE, token, SESSION_DAYS * 86400, new URL(req.url).protocol === "https:");
}

export async function updateSessionChild(req: Request, childId: number | null) {
  const token = getCookie(req, COOKIE);
  if (token) await q("UPDATE sessions SET child_id = $2 WHERE token_hash = $1", [sha256(token), childId]);
}

export async function destroySession(req: Request): Promise<string> {
  const token = getCookie(req, COOKIE);
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  return cookieHeader(COOKIE, "", 0, new URL(req.url).protocol === "https:");
}

export type User = { id: number; email: string; name: string; role: "parent" | "reviewer" | "admin" };
export type Child = { id: number; parent_id: number; display_name: string; username: string; grade: number };
export type Auth = { user: User | null; child: Child | null };

export async function getAuth(req: Request): Promise<Auth> {
  const token = getCookie(req, COOKIE);
  if (!token || token.length > 100) return { user: null, child: null };
  const row = await one<any>(
    `SELECT s.user_id, s.child_id,
            u.email, u.name AS user_name, u.role,
            c.parent_id, c.display_name, c.username, c.grade
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN children c ON c.id = s.child_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row) return { user: null, child: null };
  const user: User | null = row.user_id ? { id: Number(row.user_id), email: row.email, name: row.user_name, role: row.role } : null;
  const child: Child | null = row.child_id
    ? { id: Number(row.child_id), parent_id: Number(row.parent_id), display_name: row.display_name, username: row.username, grade: Number(row.grade) }
    : null;
  return { user, child };
}

export async function requireUser(req: Request, roles: User["role"][] = ["parent", "reviewer", "admin"]): Promise<User> {
  const { user } = await getAuth(req);
  if (!user) throw unauthorized();
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

export async function requireChild(req: Request): Promise<Child> {
  const { child } = await getAuth(req);
  if (!child) throw unauthorized("Влез като ученик.");
  return child;
}

export function requireAdmin(req: Request) {
  const expected = env("ADMIN_TOKEN") || "";
  const got = req.headers.get("x-admin-token") || "";
  if (expected.length < 32 || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    throw forbidden();
  }
}

export function validEmail(s: string) {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
}

// Child usernames: latin letters, digits, dot, dash, underscore; 3–24 chars; stored lowercase.
export function normalizeUsername(s: string) {
  return s.trim().toLowerCase();
}
export function validUsername(s: string) {
  return /^[a-z0-9._-]{3,24}$/.test(s);
}
