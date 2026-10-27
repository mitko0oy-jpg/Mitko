import { randomInt } from "node:crypto";
import { event, tx } from "./db.mts";
import { bad } from "./http.mts";

// No 0/O, 1/I/L: codes are read from paper and typed on phones.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const formatCode = (c: string) => (c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);

export function newCode(len = 10) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export async function redeemCode(userId: number, raw: string) {
  const code = normalizeCode(raw);
  if (code.length < 6) throw bad("code", "Провери кода.");
  const res = await tx(async (t) => {
    const [c] = await t<any>("SELECT * FROM access_codes WHERE code = $1 FOR UPDATE", [code]);
    if (!c) throw bad("code", "Няма такъв код. Провери буквите и цифрите.");
    if (c.expires_at && new Date(c.expires_at) < new Date()) throw bad("code", "Този код е изтекъл.");
    const used = await t("SELECT 1 FROM code_redemptions WHERE code = $1 AND user_id = $2", [code, userId]);
    if (used.length) throw bad("code", "Вече си използвал този код.");
    if (c.uses >= c.max_uses) throw bad("code", "Този код вече е използван.");
    await t("UPDATE access_codes SET uses = uses + 1 WHERE code = $1", [code]);
    await t("INSERT INTO code_redemptions (code, user_id) VALUES ($1, $2)", [code, userId]);
    if (c.kind === "reviewer") {
      await t("UPDATE users SET role = 'reviewer' WHERE id = $1 AND role = 'parent'", [userId]);
      return { kind: "reviewer" };
    }
    // Extends an existing pass of the same product instead of overlapping it.
    const [row] = await t<any>(
      `INSERT INTO entitlements (user_id, product, starts_at, ends_at, source, ref)
       VALUES ($1, $2, now(),
               GREATEST(now(), COALESCE((SELECT max(ends_at) FROM entitlements WHERE user_id = $1 AND product = $2), now())) + make_interval(days => $3),
               'code', $4)
       RETURNING ends_at`,
      [userId, c.product, c.days, code],
    );
    return { kind: "access", product: c.product, endsAt: row.ends_at };
  });
  await event("code_redeemed", { kind: res.kind }, userId);
  return res;
}
