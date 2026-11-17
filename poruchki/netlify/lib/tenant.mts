// Companies: every person, shop, setting and order belongs to one company, and nobody sees another's.
// The company of the current request (or background step) travels with the async call chain, so the
// library code asks companyId() instead of taking a parameter everywhere. Without a company it throws –
// a missing filter fails loudly instead of showing someone else's orders.
import { als } from "./ctx.mts";
import { HttpError } from "./http.mts";

/** Run fn for one company (background jobs, webhooks, the phone agent). */
export function withCompany<T>(company: number, fn: () => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(company) || company <= 0) throw new Error("bad company");
  return als.run({ company }, fn);
}

/** From here on this request works for the company (called once the user is known). */
export function enterCompany(company: number) {
  if (!Number.isSafeInteger(company) || company <= 0) throw new Error("bad company");
  // The request's context object is shared by everything the request does, so filling it in here is
  // seen by the caller too (handle() starts it for every API request).
  const s = als.getStore();
  if (s) s.company = company;
  else als.enterWith({ company });
}

export function companyId(): number {
  const s = als.getStore();
  if (!s || !s.company) throw new Error("no company for this request");
  return s.company;
}

export const hasCompany = () => Boolean(als.getStore()?.company);

/** Settings that belong to a company are stored as "<key>@<company>". */
export const cKey = (key: string) => `${key}@${companyId()}`;

/** The company the env configuration (CB_SITES, SPEEDY_*, ECONT_*, AGENT_TOKEN…) belongs to: Mitko's. */
export const ENV_COMPANY = 1;

/** SQL condition: the row's shop belongs to the current company (the id is a checked integer, safe to inline). */
export const inCompany = (col = "shop") => `${col} IN (SELECT id FROM shops WHERE company_id = ${companyId()})`;

/** Companies that have shops, for background jobs that go through all of them. */
export async function companiesWithShops(q: (t: string, p?: unknown[]) => Promise<any[]>): Promise<number[]> {
  const rows = await q("SELECT DISTINCT company_id FROM shops ORDER BY company_id");
  return rows.map((r) => Number(r.company_id));
}

/** 404 unless the order belongs to the current company (before any action on an order by its id). */
export async function ownOrder(one: (t: string, p?: unknown[]) => Promise<any>, id: number) {
  const r = await one("SELECT o.id FROM orders o JOIN shops s ON s.id = o.shop WHERE o.id = $1 AND s.company_id = $2", [id, companyId()]);
  if (!r) throw new HttpError(404, "not_found", "Няма такава поръчка.");
}
