#!/usr/bin/env node
// The incoming line's catalogue = the zdravets.eu site's own data (zdravets/src/assets/data.js),
// so Стела says the same products, prices and offers as the site.
//
//   node scripts/build-zdravets-pricelist.mjs <path/to/data.js>
//   node scripts/build-zdravets-pricelist.mjs --git origin/claude/cheren-petak-bf5
//
// Writes agent/pricelist-zdravets.json. Re-run whenever prices or offers on the site change
// (e.g. after Black Friday), then deploy.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "agent/pricelist-zdravets.json");

/** Evaluate data.js (plain `const NAME = …` declarations) and return its upper-case constants. */
export function readSiteData(src) {
  const ctx = { window: {}, document: { currentScript: null }, location: { pathname: "/", search: "" }, console, Date, URLSearchParams, encodeURIComponent };
  vm.createContext(ctx);
  const names = [...src.matchAll(/^(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
  vm.runInContext(`${src}\n;globalThis.__out = {${names.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : null`).join(",")}};`, ctx, { timeout: 2000 });
  return JSON.parse(JSON.stringify(ctx.__out, (k, v) => (typeof v === "function" ? undefined : v)));
}

const packSize = (k, bundles) => {
  const b = k.bundle ? bundles.find((x) => x.id === k.bundle) : null;
  if (b) return b.items.reduce((s, [, n]) => s + n, 0);
  const m = /^(\d+)/.exec(k.label || "");
  return m ? Number(m[1]) : 1;
};

/** The phone price list from the site's data. */
export function buildPriceList(d, source = "") {
  const C = d.CONFIG;
  const bundles = d.BUNDLES || [];
  const del = Object.fromEntries((C.shipping || []).map((s) => [s.id, s]));
  const products = d.PRODUCTS.map((p) => {
    const packs = (d.PACKS?.[p.packs] || []).map((k) => {
      const b = k.bundle ? bundles.find((x) => x.id === k.bundle) : null;
      const giftPacks = (b?.gift || []).reduce((s, [, n]) => s + n, 0);
      return {
        n: packSize(k, bundles),
        price: k.price,
        store: k.store,
        ...(k.prev ? { prev: k.prev } : {}),
        ...(k.featured ? { featured: true } : {}),
        ...(giftPacks > 1 ? { giftPacks } : {}),
      };
    });
    return {
      id: p.id,
      cat: p.cat,
      name: p.name,
      say: p.shortName || p.name,
      size: p.size || "",
      price: p.price,
      store: p.store,
      packs: packs.length ? packs : [{ n: 1, price: p.price, store: p.store }],
      half: Boolean(d.HALF?.[p.id]),
      halfStore: d.HALF?.[p.id] || null,
      short: p.short || "",
      bullets: p.bullets || [],
      ingredients: (p.ingredients || []).map(([a, b]) => `${a} – ${b}`),
      usage: p.usage || "",
      page: d.PRODUCT_PAGES?.[p.id] ? `zdravets.eu/${d.PRODUCT_PAGES[p.id]}` : "",
    };
  });
  // Sets of different products (e.g. "Грижа за тялото"); one-product packs are already in the products.
  const sets = bundles
    .filter((b) => new Set(b.items.map(([id]) => id)).size > 1)
    .map((b) => ({ id: b.id, name: b.title, line: b.line || "", price: b.price, store: b.store, items: b.items, units: b.items.reduce((s, [, n]) => s + n, 0) }));
  const wellness = products.filter((p) => p.cat === "wellness").map((p) => p.id);
  const giftProduct = products.find((p) => p.id === "plastiri");
  return {
    kind: "zdravets",
    note: `Генерирано от data.js на zdravets.eu${source ? ` (${source})` : ""} със scripts/build-zdravets-pricelist.mjs – не се пипа на ръка.`,
    currency: "EUR",
    shop: { brand: C.brand, site: "zdravets.eu", phone: C.phone, hours: C.hours, email: C.email, guaranteeDays: C.guaranteeDays || 30 },
    delivery: {
      econt_office: { label: "до офис на Еконт", price: del["econt-office"]?.price ?? 4.9, office: true },
      speedy_office: { label: "до офис на Спиди", price: del["speedy-office"]?.price ?? 4.9, office: true },
      speedy_address: { label: "до адрес с куриер", price: del.address?.price ?? 5.9, office: false },
    },
    rules: {
      freeOfficeFrom: C.freeOfficeShippingFrom || 0,
      halfFrom: C.halfFrom || 0,
      // Phone only (Mitko, 22.11): a customer who has ordered before gets 30% off the products when ordering by phone.
      phoneRepeatDiscount: 0.3,
      bf: C.bf?.active
        ? {
            label: C.bf.label || "Черен петък",
            end: C.bf.end,
            giftFrom: C.giftFrom || 3,
            gift: "12 лепенки за стави и мускули",
            giftValue: giftProduct?.price || 0,
            giftStore: C.giftStoreId || null,
            // His choice (22.11): 3 wellness boxes → a 4th box of the customer's choice instead of the joint patches.
            wellnessGift: "една кутия уелнес лепенки по избор",
          }
        : null,
    },
    categories: (d.CATEGORIES || []).map((c) => ({ id: c.id, name: c.name })),
    products,
    sets,
    wellness: { ids: wellness, combos: (d.PATCH_COMBOS || []).map((c) => ({ n: c.n, price: c.price, store: c.store })) },
    addons: (d.BUMPS || []).map((b) => ({ id: `addon_${b.id}`, of: b.id, name: b.title, price: b.price, store: b.store })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const gi = args.indexOf("--git");
  let src;
  let source;
  if (gi >= 0) {
    const ref = args[gi + 1];
    src = execFileSync("git", ["show", `${ref}:zdravets/src/assets/data.js`], { cwd: join(root, ".."), encoding: "utf8" });
    const sha = execFileSync("git", ["rev-parse", "--short", ref], { cwd: join(root, ".."), encoding: "utf8" }).trim();
    source = `${ref} @ ${sha}`;
  } else if (args[0]) {
    src = await readFile(args[0], "utf8");
    source = args[0];
  } else {
    console.error("usage: node scripts/build-zdravets-pricelist.mjs <data.js> | --git <ref>");
    process.exit(1);
  }
  const pl = buildPriceList(readSiteData(src), source);
  await writeFile(OUT, `${JSON.stringify(pl, null, 2)}\n`);
  console.log(`wrote ${OUT}: ${pl.products.length} products, ${pl.sets.length} sets, Black Friday ${pl.rules.bf ? `until ${pl.rules.bf.end}` : "off"}`);
}

