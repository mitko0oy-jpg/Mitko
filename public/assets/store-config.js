// The card store (edubel.bg on ConvertBuilder): pages, checkouts and what the cart shows.
// Prices come from shop-catalog.js (PACKAGES, REGULAR), the same as on edubel.site, except PRICES below.
// Inside a ConvertBuilder block, window.EB_LANDING.store can override any of these settings.
import { TRN } from "./trenazhor-config.js";

// The pages on the live site (the funnel addresses ConvertBuilder gave them).
// Locally (/magazin/…, /dosieta/, …) store.js uses LOCAL instead.
export const LINKS = {
  home: "/",
  lit: "/nvo/karti-po-literatura",
  ezik: "/karti-po-b-lgarski",
  duo: "/komplekt",
  produkti: "/produkti",
  // teachers, schools and читалища: a section of the home page
  shkoli: "/#uchilishta",
  // the separate landings
  dosieta: "/igra-literaturni-dosieta",
  app: "/prilozhenie-trenazhor-za-nvo",
  trenazhor: "/prilozhenie-trenazhor-za-nvo/nvo-trenazhor",
  // the math cards (the page of the deck; "matematika" is the older name of the same link)
  mat: "/karti-po-matematika",
  matematika: "/karti-po-matematika",
  // the digital products (PDF files and the trainer), paid by card
  digitalni: "/digitalni-produkti",
  // legal pages
  terms: "/obshti-usloviya",
  privacy: "/poveritelnost",
  cookies: "/cookies",
  delivery: "/dostavka-i-vrashtane",
};
export const LOCAL = {
  home: "/magazin/", lit: "/magazin/literatura/", ezik: "/magazin/balgarski-ezik/", duo: "/magazin/komplekt/",
  produkti: "/magazin/produkti/", shkoli: "/magazin/#uchilishta", mat: "/magazin/matematika/", matematika: "/magazin/matematika/",
  dosieta: "/dosieta/", app: "/prilozhenie/", trenazhor: "/trenazhor/", digitalni: "/magazin/digitalni/",
};

// The digital products (the page LINKS.digitalni). Each one has its own checkout in ConvertBuilder,
// paid by card: the PDF comes to the buyer's e-mail as a download link right after the payment, the
// trainer as a personal code. The mock exam also comes printed (probnaPrint), sent by courier. Prices are euro cents and must match the products in ConvertBuilder.
export const DIGITAL = {
  probna: { title: "Пробна матура НВО – PDF", price: 990, checkout: "/digitalni/poruchka-probna-matura" },
  // the same mock exam printed and sent by courier (paid on delivery or by card)
  probnaPrint: { title: "Пробна матура НВО – книжна", price: 1490, checkout: "/digitalni/poruchka-probna-matura-knizhna" },
  karti90: { title: "90 интерактивни карти по литература", price: 790, checkout: "/digitalni/poruchka-90-karti" },
  v200: { title: "200 въпроса по БЕЛ – интерактивно приложение", price: 990, checkout: "/digitalni/poruchka-200-vaprosa" },
  ...Object.fromEntries(Object.entries(TRN.plans).map(([k, p]) => [`trn-${k}`, { title: `НВО тренажор – ${p.title}`, price: p.price, checkout: TRN.checkout[k] }])),
};

// The three decks, in this order in package keys and titles.
export const DECK_KEYS = ["lit", "ezik", "mat"];

// The cart holds up to three decks in any mix. The price goes by the number of decks (euro cents):
// 27,90 € for the first, +16,90 € for the second, +14,90 € for the third; two or three ship free.
// The first and second step follow the "lit-1" and "duo" prices; LADDER[3] is the price of three.
export const LADDER = [0, 2790, 4480, 5970];

// The package of a cart ({lit, ezik, mat} counts): one key per mix, the first five as before.
// One kind: "lit-1", "mat-2", "ezik-3"; two kinds of one each: "duo" (lit + ezik), "lit-mat", "ezik-mat";
// three decks of two kinds: the double one first ("lit2-mat"); one of each: "trio".
export function comboKey(c) {
  const n = DECK_KEYS.reduce((s, k) => s + (c[k] || 0), 0);
  if (!n) return null;
  const kinds = DECK_KEYS.filter((k) => c[k]).sort((a, b) => c[b] - c[a] || DECK_KEYS.indexOf(a) - DECK_KEYS.indexOf(b));
  if (kinds.length === 1) return `${kinds[0]}-${n}`;
  if (kinds.length === 3) return "trio";
  if (n === 2) return kinds.join("-") === "lit-ezik" ? "duo" : kinds.join("-");
  return `${kinds[0]}2-${kinds[1]}`;
}

// Every package past the old five: its name (as the product in ConvertBuilder).
export const COMBOS = {
  "mat-1": "Карти по математика",
  "mat-2": "Карти по математика × 2",
  "lit-mat": "Литература + Математика",
  "ezik-mat": "Български език + Математика",
  trio: "Литература + Български език + Математика",
  "lit-3": "Карти по литература × 3",
  "ezik-3": "Карти по български език × 3",
  "mat-3": "Карти по математика × 3",
  "lit2-ezik": "2 × Литература + Български език",
  "lit2-mat": "2 × Литература + Математика",
  "ezik2-lit": "2 × Български език + Литература",
  "ezik2-mat": "2 × Български език + Математика",
  "mat2-lit": "2 × Математика + Литература",
  "mat2-ezik": "2 × Математика + Български език",
};

// The checkout page in ConvertBuilder of a package that has its own (with its offers after the order).
export const CHECKOUT = {
  "lit-1": "/nvo/poruchka-literatura",
  "lit-2": "/nvo/poruchka-literatura-2",
  "ezik-1": "/karti-po-b-lgarski/poruchka-ezik",
  "ezik-2": "/karti-po-b-lgarski/poruchka-ezik-2",
  duo: "/komplekt/poruchka-komplekt",
  "mat-1": "/karti-po-matematika/poruchka-matematika",
  trio: "/karti-po-matematika/poruchka-3-testeta",
};

// Every other package goes to one checkout that sells the cart of the ConvertBuilder store
// ("Чекаут на количка"): KASA?p=<package>. Its block puts the package's product in that cart:
// KASA_STORE holds the product number in the store for each package, KASA_KEY the free answer key
// that goes with the Bulgarian-language cards.
export const KASA = "/komplekt/poruchka";
// The product in the store of each package with a checkout of its own: the cart checkout needs it
// when an extra (below) goes with that package.
export const STORE_ID = { "lit-1": 3, "lit-2": 4, "ezik-1": 5, "ezik-2": 6, duo: 7, "mat-1": 37, trio: 38 };
// Extras that go with the decks (not decks: no price step, no free delivery of their own).
// A product page offers one as a tick under the sets; with it the order goes to the cart checkout
// (KASA?p=<package>&x=<extra>), which adds the extra's product (store) after the package.
// "was" is the price printed on the cover. The same product is the order bump in the checkouts
// of the literature cards in ConvertBuilder.
export const EXTRAS = {
  dos: { title: "Книгата-игра „Литературни досиета“", sub: "68 стр. · цветна корица, черно-бели страници · спирала", price: 1690, was: 1990, img: "dosieta/knizhka-korica.webp", store: 60, with: "lit" },
};
export const KASA_STORE = {
  "lit-mat": 48, "ezik-mat": 49, "mat-2": 54,
  "lit-3": 56, "ezik-3": 57, "mat-3": 55,
  "lit2-ezik": 58, "lit2-mat": 52, "ezik2-lit": 59, "ezik2-mat": 53, "mat2-lit": 50, "mat2-ezik": 51,
};
export const KASA_KEY = 25;

// The package prices on edubel.bg that differ from shop-catalog.js (euro cents); edubel.site keeps its own.
// Two decks: 27,90 € for the first and 16,90 € for the second. Must match the products in ConvertBuilder.
export const PRICES = { "lit-2": 4480, "ezik-2": 4480, duo: 4480 };

// Delivery with one deck (euro cents), as in the ConvertBuilder checkout: from this price to an office.
export const DELIVERY_FROM = 490;
// From how many decks the delivery is free (as the free-delivery threshold of the ConvertBuilder store):
// 2 → "при 2 и 3 тестета", 3 → "при 3 тестета". Change it together with the store's shipping settings.
export const FREE_SHIP_DECKS = 2;
// A planned change of the above: from this moment the site says FREE_SHIP_LATER.decks by itself
// (texts, cart, package flags). The store's shipping threshold in ConvertBuilder is changed by hand.
// null = no planned change. 23.11.2026: free delivery with 2 decks is back (store threshold 44 €).
export const FREE_SHIP_LATER = null;

export const CONTACT = {
  phone: "0893 42 52 92",
  tel: "+359893425292",
  email: "edubel@mail.bg",
  viber: "https://invite.viber.com/?g2=AQAHAw6O7C9zc1dx8TZ9cIE8Z6G8lUWFiYkgY2OK8dH77VvsL%2B13ZY66S7ACf7Pz",
};
export const COMPANY = "ДД Димитров 26 ЕООД · ЕИК 208651506";

// The decks: what the cart, the product cards and the menu show. "plain": sold at one price, with no
// regular price struck through.
export const DECKS = {
  lit: { title: "Карти по литература", short: "Литература", sub: "40 карти · 22 творби за НВО", img: "kutiya-literatura.webp" },
  ezik: { title: "Карти по български език", short: "Български език", sub: "40 карти · 20 правила + 20 упражнения", img: "kutiya-ezik.webp" },
  mat: { title: "Карти по математика", short: "Математика", sub: "50 карти · 5.–7. клас", img: "kutiya-matematika.webp", plain: true, isNew: true },
};

// The most decks in one package (the price steps above and the packages in the store).
export const MAX_DECKS = 3;
// The most decks in one order. Past the third every deck is EXTRA_DECK.price more (for a second or
// third child): the cart checkout puts the three-deck package in the order and then each extra deck
// as its own product in the store (EXTRA_DECK.store, "Допълнително тесте: …", 14,90 €).
export const CART_MAX = 10;
export const EXTRA_DECK = { price: 1490, store: { lit: 62, ezik: 63, mat: 64 } };
// The gift with the three kinds (trio) until a moment. The trio's own checkout lists its gift products
// by itself; in the cart checkout (trio + extra decks) they are added after the package until then.
export const TRIO_GIFT = { until: "2026-11-29T23:59:59+02:00", store: [44, 61] };
