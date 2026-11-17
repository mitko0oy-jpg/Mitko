// Courier logins are kept encrypted in the database (AES-256-GCM).
// The key is SECRET_KEY (32+ random characters) in the Netlify env, never in git.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env, HttpError } from "./http.mts";

function key(): Buffer {
  const k = env("SECRET_KEY") || "";
  if (k.length < 32) throw new HttpError(500, "no_secret_key", "Липсва SECRET_KEY в настройките на Netlify.");
  return createHash("sha256").update(k).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function unseal<T = any>(sealed: string): T {
  const [v, iv, tag, data] = String(sealed).split(".");
  if (v !== "v1") throw new Error("unknown sealed format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8"));
}
