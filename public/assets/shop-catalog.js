// Packages and delivery for the card shop. Prices are euro cents.
// The order API imports this same file and recomputes every total, so a price shown here
// is the price charged. Change a price here and nowhere else.
// boxes: which boxes are shown in the package picture; has: what the parent gets, line by line;
// freeShip: delivery is free with this package.
export const PACKAGES = {
  "lit-1": { title: "Карти по литература", note: "1 комплект · 40 карти", price: 2590, boxes: ["lit"],
    has: ["1 кутия с 40 карти по литература", "27 карти с творбите + 13 с въпроси"] },
  "lit-2": { title: "Карти по литература × 2", note: "2 комплекта – за двама ученици", price: 4490, boxes: ["lit", "lit"], freeShip: true,
    has: ["2 кутии · 80 карти по литература", "по една кутия за всеки ученик"] },
  "ezik-1": { title: "Карти по български език", note: "1 комплект · 40 карти", price: 2590, boxes: ["ezik"],
    has: ["1 кутия с 40 карти по български език", "20 карти с правила + 20 с упражнения"] },
  "ezik-2": { title: "Карти по български език × 2", note: "2 комплекта – за двама ученици", price: 4490, boxes: ["ezik", "ezik"], freeShip: true,
    has: ["2 кутии · 80 карти по български език", "по една кутия за всеки ученик"] },
  duo: { title: "Литература + Български език", note: "двете тестета · 80 карти", price: 4490, boxes: ["lit", "ezik"], freeShip: true,
    has: ["кутия по литература · 40 карти", "кутия по български език · 40 карти"] },
};

// The offer after an order of the language cards (the ConvertBuilder upsell page). It is sold only
// there, through the builder's upsell button, so it stays out of PACKAGES and the order API.
export const UPSELL = { title: "Карти по литература", price: 1990 };

// The regular price of one deck, as in the builder's checkout. The shop sells below it, so it is
// shown struck through next to each price ("was"): once per deck in the package. With no regular
// price (0) a package is compared with buying its decks one by one, and the upsell with lit-1.
export const REGULAR = 3990;
export function setRegular(reg) {
  for (const p of Object.values(PACKAGES)) p.was = p.boxes.reduce((sum, b) => sum + (reg || PACKAGES[`${b}-1`].price), 0);
  UPSELL.was = reg || PACKAGES["lit-1"].price;
}
setRegular(REGULAR);

export const SHIPPING = {
  econt: { title: "До офис на Еконт", price: 390, place: "office" },
  speedy: { title: "До офис на Спиди", price: 390, place: "office" },
  address: { title: "До адрес", price: 590, place: "address" },
};

// What delivery costs with a package.
export const shipPrice = (pkg, ship) => (pkg.freeShip ? 0 : ship.price);

// 2590 -> "25,90 €" (Bulgarian style, non-breaking space before the sign).
export const euro = (cents) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
