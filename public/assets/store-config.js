// The new card store (edubel.bg on ConvertBuilder): pages, checkouts and what the cart shows.
// Prices are not here: they come from shop-catalog.js (PACKAGES, REGULAR), the same as on edubel.site.
// Inside a ConvertBuilder block, window.EB_LANDING.store can override any of these settings.

// The pages of the store on the live site. Locally (/magazin/…) store.js uses LOCAL instead.
export const LINKS = {
  home: "/",
  lit: "/literatura",
  ezik: "/balgarski-ezik",
  duo: "/komplekt",
  // the separate landings
  dosieta: "/literaturni-dosieta",
  app: "/prilozhenie",
  // legal pages: ConvertBuilder pages with the same text as on edubel.site
  terms: "/obshti-usloviya",
  privacy: "/poveritelnost",
  cookies: "/cookies",
  delivery: "/dostavka-i-vrashtane",
};
export const LOCAL = { home: "/magazin/", lit: "/magazin/literatura/", ezik: "/magazin/balgarski-ezik/", duo: "/magazin/komplekt/", dosieta: "/dosieta/", app: "/prilozhenie/" };

// The checkout page in ConvertBuilder for each package. The cart holds at most two decks,
// so every cart is one of these five packages.
export const CHECKOUT = {
  "lit-1": "/poruchka-literatura",
  "lit-2": "/poruchka-literatura-2",
  "ezik-1": "/poruchka-ezik",
  "ezik-2": "/poruchka-ezik-2",
  duo: "/poruchka-komplekt",
};

// Delivery with one deck (euro cents), as in the ConvertBuilder checkout: from this price to an office.
// Two decks ship free.
export const DELIVERY_FROM = 450;

export const CONTACT = { phone: "0893 42 52 92", tel: "+359893425292", email: "edubel@mail.bg" };
export const COMPANY = "Ангелова ЕДУ БЕЛ ЕООД · ЕИК 208473142";

// The two decks: what the cart, the product cards and the menu show.
export const DECKS = {
  lit: { title: "Карти по литература", short: "Литература", sub: "40 карти · 22 творби за НВО", img: "kutiya-literatura.webp" },
  ezik: { title: "Карти по български език", short: "Български език", sub: "40 карти · 20 правила + 20 упражнения", img: "kutiya-ezik.webp" },
};

// The most decks in one order: the checkouts sell one or two decks.
export const MAX_DECKS = 2;
