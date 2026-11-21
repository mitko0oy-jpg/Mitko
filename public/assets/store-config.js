// The card store (edubel.bg on ConvertBuilder): pages, checkouts and what the cart shows.
// Prices are not here: they come from shop-catalog.js (PACKAGES, REGULAR), the same as on edubel.site.
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
  matematika: "/karti-po-matematika/predvaritelna-poruchka",
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
  produkti: "/magazin/produkti/", shkoli: "/magazin/#uchilishta",
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

// The checkout page in ConvertBuilder for each package. The cart holds at most two decks,
// so every cart is one of these five packages.
export const CHECKOUT = {
  "lit-1": "/nvo/poruchka-literatura",
  "lit-2": "/nvo/poruchka-literatura-2",
  "ezik-1": "/karti-po-b-lgarski/poruchka-ezik",
  "ezik-2": "/karti-po-b-lgarski/poruchka-ezik-2",
  duo: "/komplekt/poruchka-komplekt",
};

// Delivery with one deck (euro cents), as in the ConvertBuilder checkout: from this price to an office.
// Two decks ship free.
export const DELIVERY_FROM = 450;

export const CONTACT = {
  phone: "0893 42 52 92",
  tel: "+359893425292",
  email: "edubel@mail.bg",
  viber: "https://invite.viber.com/?g2=AQAHAw6O7C9zc1dx8TZ9cIE8Z6G8lUWFiYkgY2OK8dH77VvsL%2B13ZY66S7ACf7Pz",
};
export const COMPANY = "ДД Димитров 26 ЕООД · ЕИК 208651506";

// The two decks: what the cart, the product cards and the menu show.
export const DECKS = {
  lit: { title: "Карти по литература", short: "Литература", sub: "40 карти · 22 творби за НВО", img: "kutiya-literatura.webp" },
  ezik: { title: "Карти по български език", short: "Български език", sub: "40 карти · 20 правила + 20 упражнения", img: "kutiya-ezik.webp" },
};

// The most decks in one order: the checkouts sell one or two decks.
export const MAX_DECKS = 2;
