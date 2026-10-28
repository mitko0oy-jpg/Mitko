// Packages and delivery for the card shop. Prices are euro cents.
// The order API imports this same file and recomputes every total, so a price shown here
// is the price charged. Change a price here and nowhere else.
export const PACKAGES = {
  "lit-1": { title: "Карти по литература", note: "1 комплект · 40 карти", price: 2590 },
  "lit-2": { title: "Карти по литература × 2", note: "2 комплекта – за двама ученици", price: 3880, was: 5180 },
  "ezik-1": { title: "Карти по български език", note: "1 комплект · 40 карти", price: 2590 },
  "ezik-2": { title: "Карти по български език × 2", note: "2 комплекта – за двама ученици", price: 3880, was: 5180 },
  duo: { title: "Литература + Български език", note: "двете тестета · 80 карти", price: 4490, was: 5180 },
};

export const SHIPPING = {
  econt: { title: "До офис на Еконт", price: 390, place: "office" },
  speedy: { title: "До офис на Спиди", price: 390, place: "office" },
  address: { title: "До адрес", price: 590, place: "address" },
};

// 2590 -> "25,90 €" (Bulgarian style, non-breaking space before the sign).
export const euro = (cents) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
