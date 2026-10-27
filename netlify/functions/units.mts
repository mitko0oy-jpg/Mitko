import type { Config } from "@netlify/functions";
import { testMode } from "../lib/access.mts";
import { bad, handle, json } from "../lib/http.mts";
import { unitResources } from "../lib/units.mts";

// Public course structure for parents and testers: titles and counts only, no content.
export default handle(async (req) => {
  const grade = Number(new URL(req.url).searchParams.get("grade"));
  if (![5, 6, 7].includes(grade)) throw bad("grade", "Избери клас.");
  const { units, byUnit } = await unitResources(grade);
  return json(
    {
      grade,
      units: units.map((u) => ({
        slug: u.slug,
        section: u.section,
        grp: u.grp,
        title: u.title,
        subtitle: u.subtitle,
        planned: u.planned,
        resources: (byUnit.get(u.slug) || []).map((r) => ({ kind: r.kind, title: r.title, total: r.total })),
      })),
      testMode: testMode(),
    },
    200,
    { "cache-control": "public, max-age=300" },
  );
});

export const config: Config = { path: "/api/units", method: "GET" };
