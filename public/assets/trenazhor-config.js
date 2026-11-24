// The landing of the НВО тренажор (edubel.bg/nvo-trenazhor): the plans and their ConvertBuilder
// checkout pages. Prices are euro cents. Inside a ConvertBuilder block, window.EB_LANDING.trn can
// override any of these settings.
export const TRN = {
  plans: {
    m1: { title: "1 месец", months: 1, price: 990 },
    m6: { title: "6 месеца", months: 6, price: 2990 },
    m12: { title: "1 година", months: 12, price: 3990 },
  },
  checkout: { m1: "/prilozhenie-trenazhor-za-nvo/poruchka-trenazhor-1", m6: "/prilozhenie-trenazhor-za-nvo/poruchka-trenazhor-6", m12: "/prilozhenie-trenazhor-za-nvo/poruchka-trenazhor-12" },
  // the trainer itself: opens with the personal code
  app: "https://app.edubel.site/t/",
  store: "/",
  // paying by card in the app (see trn-pay.js): its page and the app's plan for each of ours. The buttons go there
  // only while the app takes real card payments; "" keeps them on the ConvertBuilder order pages.
  appPay: "https://app.edubel.site/dostap/",
  appPlans: { m1: "full-1m", m6: "full-6m", m12: "full-12m" },
};
