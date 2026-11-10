// The landing of the НВО тренажор (edubel.bg/nvo-trenazhor): the plans and their ConvertBuilder
// checkout pages. Prices are euro cents. Inside a ConvertBuilder block, window.EB_LANDING.trn can
// override any of these settings.
export const TRN = {
  plans: {
    m1: { title: "1 месец", months: 1, price: 990 },
    m6: { title: "6 месеца", months: 6, price: 2990 },
    m12: { title: "1 година", months: 12, price: 3990 },
  },
  checkout: { m1: "/poruchka-trenazhor-1", m6: "/poruchka-trenazhor-6", m12: "/poruchka-trenazhor-12" },
  // the trainer itself: opens with the personal code
  app: "https://app.edubel.site/t/",
  store: "/",
};
