import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { one, q } from "./db.mts";
import { enterCompany } from "./tenant.mts";
import { cookieHeader, forbidden, getCookie, unauthorized } from "./http.mts";

const COOKIE = "pr_s";
const SESSION_DAYS = 60;

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

// Keeps login timing similar whether or not the account exists.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const burnPasswordCheck = (password: string) => verifyPassword(password, DUMMY_HASH);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(req: Request, userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))", [sha256(token), userId, SESSION_DAYS]);
  if (Math.random() < 0.05) await q("DELETE FROM sessions WHERE expires_at < now()");
  return cookieHeader(COOKIE, token, SESSION_DAYS * 86400, new URL(req.url).protocol === "https:");
}

export async function destroySession(req: Request): Promise<string> {
  const token = getCookie(req, COOKIE);
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  return cookieHeader(COOKIE, "", 0, new URL(req.url).protocol === "https:");
}

export type User = { id: number; email: string; name: string; role: "admin" | "staff"; company: number; companyName: string; owner: boolean };

export async function getUser(req: Request): Promise<User | null> {
  const token = getCookie(req, COOKIE);
  if (!token || token.length > 100) return null;
  const row = await one<any>(
    `SELECT u.id, u.email, u.name, u.role, u.company_id, u.is_owner, c.name AS company_name
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN companies c ON c.id = u.company_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND c.archived_at IS NULL`,
    [sha256(token)],
  );
  return row
    ? { id: Number(row.id), email: row.email, name: row.name, role: row.role, company: Number(row.company_id), companyName: row.company_name, owner: Boolean(row.is_owner) }
    : null;
}

export async function requireUser(req: Request, roles: User["role"][] = ["admin", "staff"]): Promise<User> {
  const user = await getUser(req);
  if (!user) throw unauthorized();
  if (!roles.includes(user.role)) throw forbidden("Само собственикът може да прави това.");
  // Everything after this works only with this person's company.
  enterCompany(user.company);
  return user;
}

export const validEmail = (s: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
