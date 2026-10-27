import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { event, one, q } from "../lib/db.mts";
import { bad, body, handle, json, notFound, str, sub } from "../lib/http.mts";

// Teacher review: every item is shown as the child sees it, with "approved" and "comment".
export default handle(async (req) => {
  const user = await requireUser(req, ["reviewer", "admin"]);
  const parts = sub(req, "/api/review/");

  if (req.method === "GET" && parts[0] === "modules") {
    const rows = await q(
      `SELECT m.slug, m.grade, m.kind, m.title, m.position,
              count(i.id) FILTER (WHERE i.status = 'review')::int   AS review,
              count(i.id) FILTER (WHERE i.status = 'approved')::int AS approved,
              count(i.id) FILTER (WHERE i.status IN ('review', 'approved'))::int AS total,
              (SELECT count(*)::int FROM item_comments ic JOIN items i2 ON i2.id = ic.item_id
                WHERE i2.module_slug = m.slug AND ic.resolved_at IS NULL) AS open_comments
         FROM modules m LEFT JOIN items i ON i.module_slug = m.slug
        GROUP BY m.slug ORDER BY m.grade DESC, m.position, m.slug`,
    );
    return json({ reviewer: { name: user.name }, modules: rows });
  }

  if (req.method === "GET" && parts[0] === "module" && parts[1]) {
    const m = await one("SELECT slug, grade, kind, title, subtitle FROM modules WHERE slug = $1", [parts[1]]);
    if (!m) throw notFound();
    const items = await q(
      `SELECT i.id, i.ext_id, i.position, i.data, i.status, i.reviewed_at, i.updated_at,
              COALESCE(json_agg(json_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'resolution', c.resolution, 'resolved_at', c.resolved_at)
                       ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments
         FROM items i LEFT JOIN item_comments c ON c.item_id = i.id
        WHERE i.module_slug = $1 AND i.status <> 'draft'
        GROUP BY i.id ORDER BY i.position, i.id`,
      [parts[1]],
    );
    return json({ module: m, items });
  }

  if (req.method !== "POST" || parts[0] !== "item" || !parts[1]) throw notFound();
  const itemId = Number(parts[1]);
  const item = await one("SELECT id, module_slug FROM items WHERE id = $1", [itemId]);
  if (!item) throw notFound();
  const b = await body(req);

  if (parts[2] === "approve") {
    await q("UPDATE items SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [itemId, user.id]);
    await event("item_approved", { item: itemId }, user.id);
    return json({ ok: true, status: "approved" });
  }
  if (parts[2] === "reopen") {
    await q("UPDATE items SET status = 'review', reviewed_by = NULL, reviewed_at = NULL WHERE id = $1", [itemId]);
    return json({ ok: true, status: "review" });
  }
  if (parts[2] === "comment") {
    const text = str(b.body, 2000);
    if (!text) throw bad("body", "Напиши коментар.");
    await q("INSERT INTO item_comments (item_id, user_id, body) VALUES ($1, $2, $3)", [itemId, user.id, text]);
    // A commented item goes back to "waiting" until the fix is approved.
    await q("UPDATE items SET status = 'review', reviewed_by = NULL, reviewed_at = NULL WHERE id = $1 AND status = 'approved'", [itemId]);
    await event("item_commented", { item: itemId }, user.id);
    return json({ ok: true, status: "review" });
  }
  throw notFound();
});

export const config: Config = { path: "/api/review/*" };
