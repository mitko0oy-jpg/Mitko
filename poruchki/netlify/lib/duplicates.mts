// Duplicate orders (like Middleware's "Откриване на дублирани поръчки"). A new order from the shop whose customer
// already ordered shortly before – same phone or email, and if wanted the same products / the same amount – is held
// as "Дублирана" (stage 'duplicate'): no waybill, no call from the agent, not in the dashboard, until someone
// looks at it and presses "Не е дубликат" (or confirms it) or archives it.
// Rules per company in settings duplicates@<company>; every order is looked at once (dup_checked_at).
import { getSetting, one, q, setSetting } from "./db.mts";
import { addEvent } from "./edit.mts";
import { HttpError } from "./http.mts";

export type DupRules = {
  on: boolean;
  phone: boolean; // same phone (last 9 digits)
  email: boolean; // same email
  products: boolean; // and the same products and quantities
  amount: boolean; // and the same amount (cash on delivery)
  hours: number; // looking back this many hours
  sameShop: boolean; // only orders from the same shop (otherwise every shop of the company)
};

export const DUP_DEFAULTS: DupRules = { on: true, phone: true, email: true, products: false, amount: false, hours: 72, sameShop: false };

const key = (company: number) => `duplicates@${company}`;

export function cleanRules(v: any): DupRules {
  const b = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
  const hours = Math.round(Number(v?.hours));
  return {
    on: b(v?.on, DUP_DEFAULTS.on),
    phone: b(v?.phone, DUP_DEFAULTS.phone),
    email: b(v?.email, DUP_DEFAULTS.email),
    products: b(v?.products, DUP_DEFAULTS.products),
    amount: b(v?.amount, DUP_DEFAULTS.amount),
    hours: Number.isFinite(hours) && hours >= 1 ? Math.min(hours, 720) : DUP_DEFAULTS.hours,
    sameShop: b(v?.sameShop, DUP_DEFAULTS.sameShop),
  };
}

export async function dupRules(company: number): Promise<DupRules> {
  return cleanRules(await getSetting(key(company)));
}

export async function saveDupRules(company: number, input: any): Promise<DupRules> {
  const r = cleanRules({ ...(await dupRules(company)), ...input });
  if (r.on && !r.phone && !r.email) throw new HttpError(400, "rules", "Избери поне телефон или имейл – по тях се познава същият клиент.");
  await setSetting(key(company), r);
  return r;
}

const P9 = (col: string) => `right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 9)`;
// The products of an order as one text: name × quantity, sorted (the order of the lines does not matter).
const SIG = (col: string) =>
  `(SELECT coalesce(string_agg(lower(trim(e->>'name')) || '×' || coalesce(e->>'qty', '1'), '|' ORDER BY lower(trim(e->>'name')), e->>'qty'), '')
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END) e)`;

const fmtDay = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Looks at the orders not checked yet (of one shop, or all) and holds the duplicates.
 * Only new, unconfirmed shop orders of the last week can be held; everything else is just marked as checked.
 */
export async function checkDuplicates(shop?: string): Promise<{ checked: number; held: number }> {
  const rows = await q<any>(
    `SELECT o.id, o.shop, o.order_no, o.ordered_at, o.phone, o.email, s.company_id,
            (o.source = 'shop' AND o.stage = 'new' AND o.confirmed_at IS NULL AND o.archived_at IS NULL AND o.tracking_no IS NULL
             AND o.ordered_at > now() - interval '7 days') AS can_hold
       FROM orders o JOIN shops s ON s.id = o.shop
      WHERE o.dup_checked_at IS NULL ${shop ? "AND o.shop = $1" : ""}
      ORDER BY o.ordered_at, o.id
      LIMIT 300`,
    shop ? [shop] : [],
  );
  if (!rows.length) return { checked: 0, held: 0 };
  const rulesOf = new Map<number, DupRules>();
  let held = 0;
  for (const o of rows) {
    const company = Number(o.company_id);
    if (!rulesOf.has(company)) rulesOf.set(company, await dupRules(company));
    const r = rulesOf.get(company)!;
    const phone = String(o.phone || "").replace(/\D/g, "").slice(-9);
    const email = String(o.email || "").trim().toLowerCase();
    const byPhone = r.phone && phone.length === 9;
    // ConvertBuilder writes "<number>@no.email" when the customer gave no email: not a real address.
    const byEmail = r.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !/@(no\.email|noemail\.|example\.)/.test(email);
    if (o.can_hold && r.on && (byPhone || byEmail)) {
      // Only the parameters that are used (Postgres refuses unused ones).
      const params: unknown[] = [company, o.id, o.ordered_at, r.hours];
      const $ = (v: unknown) => `$${params.push(v)}`;
      const samePhone = byPhone ? `${P9("x.phone")} = ${$(phone)}` : "false";
      const sameEmail = byEmail ? `lower(trim(x.email)) = ${$(email)}` : "false";
      const x = await one<any>(
        `SELECT x.id, x.order_no, x.ordered_at, s.label AS shop_label, ${samePhone} AS same_phone, ${sameEmail} AS same_email
           FROM orders x JOIN shops s ON s.id = x.shop
          WHERE s.company_id = $1 AND x.id <> $2
            AND (x.ordered_at < $3 OR (x.ordered_at = $3 AND x.id < $2))
            AND x.ordered_at >= $3::timestamptz - make_interval(hours => $4::int)
            AND x.stage NOT IN ('abandoned', 'canceled', 'duplicate') AND x.archived_at IS NULL
            ${r.sameShop ? `AND x.shop = ${$(o.shop)}` : ""}
            AND (${samePhone} OR ${sameEmail})
            ${r.products ? `AND ${SIG("x.items")} = ${SIG("(SELECT items FROM orders WHERE id = $2)")}` : ""}
            ${r.amount ? "AND abs(coalesce(x.total_eur, 0) - (SELECT coalesce(total_eur, 0) FROM orders WHERE id = $2)) < 0.01" : ""}
          ORDER BY x.ordered_at DESC, x.id DESC
          LIMIT 1`,
        params,
      );
      if (x) {
        const done = await q("UPDATE orders SET dup_of = $2, dup_state = 'held', dup_checked_at = now() WHERE id = $1 AND dup_checked_at IS NULL RETURNING id", [o.id, x.id]);
        if (done.length) {
          held++;
          const why = [x.same_phone ? "същия телефон" : "", x.same_email ? "същия имейл" : ""].filter(Boolean).join(" и ");
          const also = [r.products ? "същите продукти" : "", r.amount ? "същата сума" : ""].filter(Boolean).join(", ");
          await addEvent(
            o.id,
            "duplicate",
            `Задържана като дублирана: клиентът с ${why}${also ? ` (${also})` : ""} вече поръча № ${x.order_no} (${x.shop_label}, ${fmtDay.format(new Date(x.ordered_at))}). Провери и натисни „Не е дубликат“ или я архивирай.`,
            { dup_of: Number(x.id) },
          );
          continue;
        }
      }
    }
    await q("UPDATE orders SET dup_checked_at = now() WHERE id = $1 AND dup_checked_at IS NULL", [o.id]);
  }
  return { checked: rows.length, held };
}

/** "Не е дубликат": the order goes on as a normal new order. */
export async function releaseDuplicate(id: number, userId: number | null, who: string | null = null, how = "Не е дубликат") {
  const r = await one<any>("UPDATE orders SET dup_state = 'released' WHERE id = $1 AND dup_state = 'held' RETURNING id", [id]);
  if (r) await addEvent(id, "duplicate", `${how} – поръчката продължава като нова`, {}, userId, who);
  return Boolean(r);
}
