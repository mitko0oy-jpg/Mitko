// The landing of the book-game „Литературни досиета“ (edubel.bg/literaturni-dosieta): packages,
// bindings and the ConvertBuilder checkout page of each choice. Prices are euro cents.
// Inside a ConvertBuilder block, window.EB_LANDING.dos can override any of these settings.
export const DOS = {
  // the price printed on the back cover
  regular: 3990,
  packages: {
    "dos-1": { title: "Книгата", note: "24 досиета · 72 цветни страници", price: 3990 },
    "dos-lit": { title: "Книгата + Карти по литература", note: "същите 22 творби в 40 карти", price: 5990, was: 6780, freeShip: true },
  },
  // the two print versions; the same price
  bindings: {
    spirala: { title: "Със спирала", note: "отваря се докрай и стои отворена" },
    telche: { title: "С телче", note: "по-лека и тънка" },
  },
  // the checkout page in ConvertBuilder for each package and binding
  checkout: {
    "dos-1:spirala": "/poruchka-dosieta-spirala",
    "dos-1:telche": "/poruchka-dosieta",
    "dos-lit:spirala": "/poruchka-dosieta-karti-spirala",
    "dos-lit:telche": "/poruchka-dosieta-karti",
  },
  // delivery with the book alone, from this price to an office
  delivery: 450,
  store: "/",
};
