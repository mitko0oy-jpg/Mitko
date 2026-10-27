import type { Config } from "@netlify/functions";
import { requireAdmin } from "../lib/auth.mts";
import { formatCode, newCode } from "../lib/codes.mts";
import { one, q, tx } from "../lib/db.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";

const KINDS = ["cards", "t25", "chars", "pesho", "diagnostic", "exam"];

// JSONB does not keep key order, so compare content with sorted keys.
function stable(v: any): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

// Operator API used by Claude from the command line. Protected by the ADMIN_TOKEN header.
export default handle(async (req) => {
  requireAdmin(req);
  const parts = sub(req, "/api/admin/");

  if (req.method === "GET" && parts[0] === "stats") {
    const counts = await one(
      `SELECT (SELECT count(*)::int FROM users WHERE role = 'parent') AS parents,
              (SELECT count(*)::int FROM children) AS children,
              (SELECT count(*)::int FROM progress) AS answers,
              (SELECT count(*)::int FROM entitlements WHERE ends_at > now()) AS active_passes,
              (SELECT count(*)::int FROM item_comments WHERE resolved_at IS NULL) AS open_comments,
              (SELECT count(*)::int FROM items WHERE status = 'approved') AS approved_items,
              (SELECT count(*)::int FROM items WHERE status = 'review') AS review_items`,
    );
    const events = await q("SELECT name, count(*)::int AS n FROM events WHERE at > now() - interval '7 days' GROUP BY name ORDER BY n DESC");
    const ai = await one("SELECT COALESCE(sum(count), 0)::int AS messages FROM ai_usage WHERE day > current_date - 7");
    return json({ counts, events, aiLast7Days: ai });
  }

  if (req.method === "GET" && parts[0] === "comments") {
    const rows = await q(
      `SELECT c.id, c.body, c.created_at, i.id AS item_id, i.module_slug, i.ext_id, i.data, i.status
         FROM item_comments c JOIN items i ON i.id = c.item_id
        WHERE c.resolved_at IS NULL ORDER BY c.created_at`,
    );
    return json({ comments: rows });
  }

  // Find accounts by part of the e-mail (support, test clean-up, GDPR requests).
  if (req.method === "GET" && parts[0] === "users") {
    const like = (new URL(req.url).searchParams.get("q") || "").trim();
    if (like.length < 3) throw bad("q", "Дай поне 3 знака от имейла.");
    const rows = await q(
      `SELECT u.email, u.role, u.created_at, count(c.id)::int AS children
         FROM users u LEFT JOIN children c ON c.parent_id = u.id
        WHERE u.email ILIKE $1 GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`,
      [`%${like}%`],
    );
    return json({ users: rows });
  }

  if (req.method === "GET" && parts[0] === "export") {
    const modules = await q("SELECT * FROM modules ORDER BY grade, position");
    const items = await q("SELECT module_slug, ext_id, position, data, status, reviewed_at, updated_at FROM items ORDER BY module_slug, position");
    return json({ modules, items });
  }

  if (req.method !== "POST") throw notFound();
  const b = await body(req, 5_000_000);

  // Upserts modules and items. Existing items keep their review status unless the content changed.
  if (parts[0] === "import") {
    const modules = Array.isArray(b.modules) ? b.modules : [];
    const items = Array.isArray(b.items) ? b.items : [];
    let created = 0, changed = 0, same = 0;
    await tx(async (t) => {
      for (const m of modules) {
        if (!KINDS.includes(m.kind)) throw bad("kind", `Непознат вид: ${m.kind}`);
        await t(
          `INSERT INTO modules (slug, grade, kind, title, subtitle, position, free_ratio, free_count, meta, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (slug) DO UPDATE SET grade = $2, kind = $3, title = $4, subtitle = $5, position = $6,
             free_ratio = $7, free_count = $8, meta = $9, active = $10`,
          [m.slug, m.grade, m.kind, m.title, m.subtitle || "", m.position || 0, m.free_ratio ?? 0.3, m.free_count ?? null, JSON.stringify(m.meta || {}), m.active !== false],
        );
      }
      for (const it of items) {
        const data = JSON.stringify(it.data);
        const [prev] = await t<any>("SELECT id, data FROM items WHERE module_slug = $1 AND ext_id = $2", [it.module, it.ext]);
        if (!prev) {
          await t("INSERT INTO items (module_slug, ext_id, position, data, status) VALUES ($1, $2, $3, $4, $5)", [
            it.module,
            it.ext,
            it.position,
            data,
            it.status || "review",
          ]);
          created++;
        } else if (stable(prev.data) !== stable(it.data)) {
          await t("UPDATE items SET data = $2, position = $3, status = 'review', reviewed_by = NULL, reviewed_at = NULL, updated_at = now() WHERE id = $1", [
            prev.id,
            data,
            it.position,
          ]);
          changed++;
        } else {
          await t("UPDATE items SET position = $2 WHERE id = $1", [prev.id, it.position]);
          same++;
        }
      }
    });
    return json({ ok: true, created, changed, same });
  }

  // Fix one item after a teacher comment; the fix goes back to the teacher for approval.
  if (parts[0] === "items" && parts[1]) {
    const id = Number(parts[1]);
    const item = await one("SELECT id FROM items WHERE id = $1", [id]);
    if (!item) throw notFound();
    if (b.data) {
      await q("UPDATE items SET data = $2, status = 'review', reviewed_by = NULL, reviewed_at = NULL, updated_at = now() WHERE id = $1", [id, JSON.stringify(b.data)]);
    }
    if (b.status && ["draft", "review", "approved", "hidden"].includes(b.status)) {
      await q("UPDATE items SET status = $2 WHERE id = $1", [id, b.status]);
    }
    if (b.resolution) {
      await q("UPDATE item_comments SET resolution = $2, resolved_at = now() WHERE item_id = $1 AND resolved_at IS NULL", [id, str(b.resolution, 1000)]);
    }
    return json({ ok: true });
  }

  // GDPR erasure on request: removes the parent, the children and all their data.
  if (parts[0] === "delete-user") {
    const email = str(b.email, 200).toLowerCase();
    if (!email || b.confirm !== email) throw bad("confirm", "Повтори имейла в confirm.");
    const r = await q("DELETE FROM users WHERE email = $1 RETURNING id", [email]);
    return json({ ok: true, deleted: r.length });
  }

  if (parts[0] === "codes") {
    const count = Math.max(1, Math.min(1000, Number(b.count) || 1));
    const kind = b.kind === "reviewer" ? "reviewer" : "access";
    const product = str(b.product, 20) || "bel-all";
    const days = Math.max(1, Math.min(800, Number(b.days) || 30));
    const maxUses = Math.max(1, Math.min(10000, Number(b.maxUses) || 1));
    const batch = str(b.batch, 60);
    const expires = b.expiresAt ? new Date(b.expiresAt) : null;
    const codes: string[] = [];
    while (codes.length < count) {
      const c = newCode();
      const r = await q(
        `INSERT INTO access_codes (code, kind, product, days, batch, max_uses, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [c, kind, product, days, batch, maxUses, expires],
      );
      if (r.length) codes.push(formatCode(c));
    }
    return json({ ok: true, codes });
  }

  throw notFound();
});

export const config: Config = { path: "/api/admin/*" };
