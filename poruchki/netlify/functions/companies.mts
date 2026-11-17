// Companies on the platform (only the platform owner): who uses it, without their orders.
//   GET  /api/companies                 – list (name, people, shops)
//   POST /api/companies                 – new company with its first owner { name, userName, email, password }
//   POST /api/companies/:id             – rename { name } or switch off { archived: true|false }
import type { Config } from "@netlify/functions";
import { hashPassword, requireUser, validEmail } from "../lib/auth.mts";
import { one, q, tx } from "../lib/db.mts";
import { bad, body, forbidden, handle, json, notFound, str, sub } from "../lib/http.mts";

async function list() {
  return q<any>(
    `SELECT c.id, c.name, c.created_at, c.archived_at,
            (SELECT count(*) FROM users u WHERE u.company_id = c.id)::int AS users,
            (SELECT count(*) FROM shops s WHERE s.company_id = c.id)::int AS shops,
            (SELECT string_agg(u.email, ', ' ORDER BY u.id) FROM users u WHERE u.company_id = c.id AND u.role = 'admin') AS owners
       FROM companies c ORDER BY c.id`,
  );
}

export default handle(async (req) => {
  const user = await requireUser(req, ["admin"]);
  if (!user.owner) throw forbidden("Само собственикът на платформата управлява фирмите.");
  const [idStr] = sub(req, "/api/companies/");
  if (req.method === "GET" && !idStr) return json({ companies: await list() });
  if (req.method !== "POST") throw notFound();
  const b = await body(req);

  if (!idStr) {
    const name = str(b.name, 120);
    const userName = str(b.userName, 80);
    const email = str(b.email, 200).toLowerCase();
    const password = typeof b.password === "string" ? b.password : "";
    if (name.length < 2) throw bad("name", "Напиши името на фирмата.");
    if (!validEmail(email)) throw bad("email", "Провери имейла.");
    if (password.length < 10 || password.length > 200) throw bad("password", "Паролата трябва да е поне 10 знака.");
    if (await one("SELECT 1 FROM users WHERE email = $1", [email])) throw bad("email_taken", "Вече има профил с този имейл.");
    const hash = await hashPassword(password);
    await tx(async (t) => {
      const [c] = await t<{ id: number }>("INSERT INTO companies (name) VALUES ($1) RETURNING id", [name]);
      await t("INSERT INTO users (email, password_hash, name, role, company_id) VALUES ($1, $2, $3, 'admin', $4)", [email, hash, userName || email, c.id]);
    });
    return json({ companies: await list() });
  }

  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0 || !(await one("SELECT 1 FROM companies WHERE id = $1", [id]))) throw notFound("Няма такава фирма.");
  if (typeof b.name === "string") {
    const name = str(b.name, 120);
    if (name.length < 2) throw bad("name", "Напиши името на фирмата.");
    await q("UPDATE companies SET name = $2 WHERE id = $1", [id, name]);
  }
  if (typeof b.archived === "boolean") {
    if (id === user.company) throw bad("self", "Не можеш да спреш собствената си фирма.");
    await q(`UPDATE companies SET archived_at = ${b.archived ? "now()" : "NULL"} WHERE id = $1`, [id]);
  }
  return json({ companies: await list() });
});

export const config: Config = { path: ["/api/companies", "/api/companies/*"] };
