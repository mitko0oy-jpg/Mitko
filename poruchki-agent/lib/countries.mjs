// Per-country calling setup: language helpers, time zone, which ElevenLabs
// agent and phone number to use (a local number per country), default texts.
// A site (ConvertBuilder shop) belongs to one country; SITE_COUNTRIES can override.
import {
  normalizePhoneBG, moneyBG, itemsTextBG, formalNameBG,
  normalizePhoneSK, moneySK, itemsTextSK, formalNameSK,
} from "./format.mjs";

export const COUNTRIES = {
  bg: {
    code: "bg",
    timeZone: "Europe/Sofia",
    normalizePhone: normalizePhoneBG,
    money: moneyBG,
    itemsText: itemsTextBG,
    formalName: formalNameBG,
    env: { agent: "EL_AGENT_ID", phone: "EL_PHONE_NUMBER_ID", hours: "CALL_HOURS", hoursSunday: "CALL_HOURS_SUNDAY", shopName: "SHOP_NAME", deliveryDays: "DELIVERY_DAYS" },
    defaults: { hours: "09:00-21:00", hoursSunday: "10:00-19:00", shopName: "магазина с пчелната отрова", deliveryDays: "един до два работни дни", deliveryText: "както е посочено в поръчката" },
  },
  sk: {
    code: "sk",
    timeZone: "Europe/Bratislava",
    normalizePhone: normalizePhoneSK,
    money: moneySK,
    itemsText: itemsTextSK,
    formalName: formalNameSK,
    env: { agent: "EL_AGENT_ID_SK", phone: "EL_PHONE_NUMBER_ID_SK", hours: "CALL_HOURS_SK", hoursSunday: "CALL_HOURS_SUNDAY_SK", shopName: "SHOP_NAME_SK", deliveryDays: "DELIVERY_DAYS_SK" },
    defaults: { hours: "09:00-20:00", hoursSunday: "10:00-18:00", shopName: "obchodu BeeVenom", deliveryDays: "zvyčajne tri až päť pracovných dní", deliveryText: "na adresu uvedenú v objednávke" },
  },
};

// ConvertBuilder site id → country. Sites of countries without a calling setup are never called.
const DEFAULT_SITE_COUNTRIES = { bg: "bg", max4: "bg", sk: "sk", vcelijed: "sk", sl: "si", hu: "hu" };

/** "bg:bg,vcelijed:sk" → { bg: "bg", vcelijed: "sk" } */
export function parseSiteCountries(text) {
  const out = {};
  for (const pair of String(text || "").split(",")) {
    const [site, country] = pair.split(":").map((x) => x.trim());
    if (site && country) out[site] = country.toLowerCase();
  }
  return out;
}

/** The country setup for a site id, or null when that country has no calling setup. */
export function countryOfSite(siteId, overrides = {}) {
  const code = overrides[siteId] || DEFAULT_SITE_COUNTRIES[siteId] || "bg";
  return COUNTRIES[code] || null;
}

/** Country setup by code; old records without a country are Bulgarian. */
export function countryByCode(code) {
  return COUNTRIES[code || "bg"] || null;
}
