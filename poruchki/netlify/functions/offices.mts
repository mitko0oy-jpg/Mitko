// Public: the Econt and Speedy offices for the office picker on the shops' order forms (zdravets.eu …).
// Offices as [id, city, name, address] (with ?apt=1 also the automats, marked "a"). Public data, so any shop may read it;
// Netlify's CDN keeps the answer a day, so the function itself (and the courier API) runs rarely.
import type { Config } from "@netlify/functions";
import { handle, json, notFound, sub } from "../lib/http.mts";
import { enterCompany, ENV_COMPANY } from "../lib/tenant.mts";
import { publicOffices } from "../lib/waybills.mts";

const CORS = { "access-control-allow-origin": "*" };

export default handle(async (req) => {
  const [courier] = sub(req, "/api/offices/");
  if (courier !== "econt" && courier !== "speedy") throw notFound();
  // The couriers' access of the company whose Netlify settings these are (Митко's).
  enterCompany(ENV_COMPANY);
  // ?apt=1 – also the automats (Еконтомат, АПС на Спиди), for shops that offer them
  const offices = await publicOffices(courier, new URL(req.url).searchParams.get("apt") === "1");
  return json({ courier, offices }, 200, {
    ...CORS,
    "cache-control": "public, max-age=3600",
    "netlify-cdn-cache-control": offices.length ? "public, durable, s-maxage=86400, stale-while-revalidate=604800" : "no-store",
  });
});

export const config: Config = { path: "/api/offices/*", method: ["GET"] };
