// Business lines ("направления"): one Meta ad account can run ads for several shops
// (e.g. the "Bio" account runs Еду БЕЛ and BeeVenom BG). Profit is counted per line:
// each campaign goes to the first line whose keywords appear in its name, otherwise to
// the default line of its ad account. Editable in Settings.

export const DEFAULT_LINES = [
  { id: "edubel", name: "Еду БЕЛ", country: "BG", sites: ["edubel"], keywords: ["нво", "карти", "български език", "литератур", "матур", "запетаи", "edubel", "бел "] },
  { id: "bv-sk", name: "BeeVenom SK", country: "SK", sites: ["sk", "vcelijed"], keywords: ["slovak", "словак", "|sk|", "vcelijed"] },
  { id: "bv-hu", name: "BeeVenom HU", country: "HU", sites: ["hu"], keywords: ["hungar", "унгар", "magyar", "|hu|"] },
  { id: "bv-si", name: "BeeVenom SI", country: "SI", sites: ["sl"], keywords: ["sloven", "словен", "|sl|", "| si |"] },
  { id: "bio", name: "BioShop", country: "BG", sites: ["bioshop"], keywords: ["bioshop", "хиалурон", "кестен"] },
  { id: "bv-bg", name: "BeeVenom BG", country: "BG", sites: ["bg", "max4"], keywords: [] },
];

// Which line takes the campaigns that match no keyword, by ad account name.
export function defaultLineFor(accountName = "", lines = DEFAULT_LINES) {
  const n = accountName.toLowerCase();
  const byId = (id) => lines.find((l) => l.id === id)?.id;
  if (/словен|sloven/.test(n)) return byId("bv-si") || lines[0]?.id;
  if (/словак|slovak/.test(n)) return byId("bv-sk") || lines[0]?.id;
  if (/унгар|hungar|magyar/.test(n)) return byId("bv-hu") || lines[0]?.id;
  return byId("bv-bg") || lines[lines.length - 1]?.id;
}

export function lineForCampaign(name = "", accountDefault, lines = DEFAULT_LINES) {
  const n = ` ${String(name).toLowerCase()} `;
  for (const l of lines) for (const k of l.keywords || []) if (k && n.includes(String(k).toLowerCase())) return l.id;
  return accountDefault;
}
