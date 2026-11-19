import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { body, forbidden, handle, json, notFound, sub } from "../lib/http.mts";
import { addLink, addMove, createItem, exportCsv, itemDetail, overview, productNames, setIgnored, updateItem } from "../lib/stock.mts";

// GET  /api/stock                 – the warehouse: items, quantity, value, days left, unlinked products
// GET  /api/stock/products        – product names from the orders, for linking
// GET  /api/stock/export          – CSV for Excel
// GET  /api/stock/:id             – one item with its history
// POST /api/stock                 – new item (owner)
// POST /api/stock/:id             – change name, group, cost, links, archive (owner)
// POST /api/stock/:id/move        – delivery / count / write-off (anyone)
// POST /api/stock/link            – a product from the orders to an item (owner)
// POST /api/stock/ignore          – hide a product from „без връзка“ (owner)
export default handle(async (req) => {
  const user = await requireUser(req);
  const [a, b] = sub(req, "/api/stock");
  const who = { id: user.id, name: user.name || user.email };
  const owner = () => {
    if (user.role !== "admin") throw forbidden("Само собственикът може да променя продуктите в склада.");
  };

  if (req.method === "GET") {
    if (!a) return json(await overview());
    if (a === "products") return json({ products: await productNames() });
    if (a === "export") {
      const day = new Date().toISOString().slice(0, 10);
      return new Response(await exportCsv(), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="sklad-${day}.csv"`, "cache-control": "no-store" },
      });
    }
    const id = Number(a);
    if (!Number.isSafeInteger(id) || b) throw notFound();
    return json(await itemDetail(id));
  }

  if (req.method !== "POST") throw notFound();
  const data = await body(req);
  if (!a) {
    owner();
    const id = await createItem(data, who);
    return json({ id, ...(await overview()) });
  }
  if (a === "link") {
    owner();
    await addLink(data);
    return json(await overview());
  }
  if (a === "ignore") {
    owner();
    await setIgnored(data.product, data.ignore !== false);
    return json(await overview());
  }
  const id = Number(a);
  if (!Number.isSafeInteger(id)) throw notFound();
  if (b === "move") {
    await addMove(id, data, who);
    return json(await itemDetail(id));
  }
  if (b) throw notFound();
  owner();
  await updateItem(id, data);
  return json(await itemDetail(id));
});

export const config: Config = { path: ["/api/stock", "/api/stock/*"] };
