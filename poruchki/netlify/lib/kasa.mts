// „Чекаут настройки“ на магазин (като в Middleware): кои куриери показва нашият скрипт /k.js в касата
// на ConvertBuilder, с какви надписи, с автомати или без, и дали скриптът е бил видян на сайта.
// Пазят се в settings като kasa:<магазин> (номерата на магазините са уникални за всички фирми).
import { getSetting, setSetting } from "./db.mts";

export const KINDS = ["econt-office", "speedy-office", "speedy-address", "econt-address"] as const;
export type Kind = (typeof KINDS)[number];

export type KasaCourier = {
  kind: Kind;
  on: boolean;
  /** Името на метода за доставка в ConvertBuilder; празно = познава го сам по думите (Еконт/Спиди + офис/адрес). */
  title: string;
  /** Показва и автоматите (Еконтомат, АПС на Спиди) в списъка с офиси. */
  automats: boolean;
  /** Кратък текст под избора, напр. „Пратката пристига за 1–2 дни“. */
  text: string;
};

export type KasaSettings = {
  active: boolean;
  couriers: KasaCourier[];
  /** Текст над търсачката на офисите. */
  note: string;
};

export type KasaSeen = { at: string; page: string } | null;

export const DEFAULTS: KasaSettings = {
  active: true,
  couriers: [
    { kind: "econt-office", on: true, title: "", automats: false, text: "" },
    { kind: "speedy-office", on: true, title: "", automats: false, text: "" },
    { kind: "speedy-address", on: true, title: "", automats: false, text: "" },
    { kind: "econt-address", on: true, title: "", automats: false, text: "" },
  ],
  note: "",
};

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Какво е пратено от страницата с настройките, изчистено; липсващото е по подразбиране. */
export function cleanSettings(input: any): KasaSettings {
  const byKind = new Map<string, any>((Array.isArray(input?.couriers) ? input.couriers : []).map((c: any) => [c?.kind, c]));
  return {
    active: input?.active !== false,
    couriers: DEFAULTS.couriers.map((d) => {
      const c = byKind.get(d.kind) || {};
      return {
        kind: d.kind,
        on: typeof c.on === "boolean" ? c.on : d.on,
        title: clean(c.title, 80),
        automats: d.kind.endsWith("-office") && c.automats === true,
        text: clean(c.text, 200),
      };
    }),
    note: clean(input?.note, 200),
  };
}

export async function kasaSettings(shop: string): Promise<KasaSettings> {
  const s = await getSetting<KasaSettings>(`kasa:${shop}`);
  return s ? cleanSettings(s) : DEFAULTS;
}

export async function saveKasa(shop: string, s: KasaSettings) {
  await setSetting(`kasa:${shop}`, s);
}

export async function kasaSeen(shop: string): Promise<KasaSeen> {
  return getSetting<KasaSeen>(`kasa_seen:${shop}`);
}

/** Скриптът се е обадил от сайта на магазина: пазим кога и от коя страница (най-много веднъж на 10 минути). */
export async function markSeen(shop: string, page: string) {
  const old = await kasaSeen(shop);
  if (old && Date.now() - Date.parse(old.at) < 10 * 60000) return;
  await setSetting(`kasa_seen:${shop}`, { at: new Date().toISOString(), page: clean(page, 200) });
}

/** Какво получава скриптът /k.js: само включеното, без нищо тайно. */
export function publicKasa(s: KasaSettings) {
  return {
    active: s.active,
    note: s.note,
    couriers: s.couriers.filter((c) => c.on).map(({ kind, title, automats, text }) => ({ kind, title, automats, text })),
  };
}
