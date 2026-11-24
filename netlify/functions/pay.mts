import type { Config } from "@netlify/functions";
import { formatCode, normalizeCode } from "../lib/codes.mts";
import { event, hit, one, q } from "../lib/db.mts";
import { bad, body, clientIp, env, handle, HttpError, json, notFound, str, sub, tooMany } from "../lib/http.mts";
import { checkWithStripe, demoCode, fakeMode, fulfill, getSetting, isLive, plans, startCheckout, stripeKey, trialCode, verifySignature } from "../lib/pay.mts";
import { TIER_NAME, TIER_RANK } from "../lib/trener.mts";

// /dostap/ – the parent's page: the free trial, the plans and paying with a card (see netlify/lib/pay.mts).
// The child never sees prices: the trainer only shows „Покажи на родител“ with a link to this page.

const bgDate = (d: string | Date) => new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
const planView = (p: any) => ({
  id: p.id, title: p.title, note: p.note, tier: p.tier, tierName: TIER_NAME[p.tier], subject: p.subject,
  months: p.months, until: p.until ? String(p.until instanceof Date ? p.until.toISOString() : p.until).slice(0, 10) : null,
  price: p.price_cents / 100, currency: p.currency,
});
const originOf = (req: Request) => {
  const u = new URL(req.url);
  return env("PUBLIC_URL") || `${u.protocol}//${u.host}`;
};

async function codeInfo(raw: unknown) {
  const code = normalizeCode(str(raw, 40));
  if (code.length < 8) return null;
  const k = await one<any>("SELECT code, kind, tier, subject, expires_at, first_used, disabled_at, months, valid_until, days FROM trener_keys WHERE code = $1", [code]);
  if (!k || k.kind !== "access") throw notFound("Няма такъв код. Провери буквите и цифрите.");
  if (k.disabled_at) throw new HttpError(403, "disabled", "Този код е спрян. Свържи се с Еду БЕЛ.");
  const expired = !!(k.expires_at && new Date(k.expires_at) < new Date());
  const tier = expired ? "start" : k.tier;
  return {
    k,
    view: {
      code: formatCode(code),
      tier,
      tierName: TIER_NAME[tier],
      subject: tier === "std" ? k.subject : null,
      until: !expired && k.expires_at ? bgDate(k.expires_at) : null,
      expired,
      // Пълен without any end: nothing to buy (the early codes from the boxes, the teachers' codes without a term).
      unlimited: k.tier === "full" && !k.expires_at && !k.months && !k.valid_until && !k.days,
    },
  };
}

export default handle(async (req, ctx) => {
  const parts = sub(req, "/api/pay/");

  // Stripe tells us about a payment. Signed with STRIPE_WEBHOOK_SECRET; anything unsigned is refused.
  if (req.method === "POST" && parts[0] === "webhook") {
    const raw = await req.text();
    if (!verifySignature(raw, req.headers.get("stripe-signature") || "", env("STRIPE_WEBHOOK_SECRET") || "")) throw new HttpError(400, "signature", "Bad signature");
    const ev = JSON.parse(raw);
    const s = ev?.data?.object || {};
    if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && s.payment_status === "paid") {
      const p = await fulfill(String(s.id), s.customer_details?.email || null).catch((e) => (e?.status === 404 ? null : Promise.reject(e)));
      if (p) await event("trener_paid", { plan: p.plan, amount: p.amount_cents, live: p.live, renew: !!p.for_code });
    } else if (ev.type === "checkout.session.expired") {
      await q("UPDATE trener_payments SET status = 'expired' WHERE session = $1 AND status = 'open'", [String(s.id)]);
    }
    return json({ received: true });
  }

  if (!(await hit(`pay:${clientIp(req, ctx)}`, 120, 600))) throw tooMany();

  // The plans, the free trial and, with ?k=, the pupil's code (for extending it).
  if (req.method === "GET" && parts[0] === "plans") {
    const url = new URL(req.url);
    const trial = (await getSetting("trial")) || {};
    const info = url.searchParams.get("k") ? await codeInfo(url.searchParams.get("k")) : null;
    return json({
      plans: (await plans()).map(planView),
      trial: trial.open ? { months: trial.months || null, days: trial.months ? null : trial.days || 1 } : null,
      payments: !!stripeKey() || fakeMode(),
      test: !isLive(),
      code: info ? info.view : null,
    // edubel.bg asks this too (no cookies, public prices): its buttons switch to paying here once card payments are live.
    }, 200, { "access-control-allow-origin": "*" });
  }

  // The free trial: a new code at once, no card and no e-mail.
  if (req.method === "POST" && parts[0] === "trial") {
    if (!(await hit(`trial:${clientIp(req, ctx)}`, 3, 86400))) throw tooMany("Днес от тази връзка вече са взети няколко проби. Опитай утре.");
    const t = await trialCode();
    await event("trener_trial", { months: t.months, days: t.days });
    const link = `${originOf(req)}/t/?k=${formatCode(t.code)}`;
    return json({ code: formatCode(t.code), link, months: t.months, days: t.days });
  }

  // The demo from the trainer: a code at once – the free trial if it is open (3 a day from one address), else Старт.
  if (req.method === "POST" && parts[0] === "demo") {
    const ip = clientIp(req, ctx);
    if (!(await hit(`demo:${ip}`, 20, 86400))) throw tooMany("Днес от тази връзка вече са отворени много демо достъпи. Опитай утре или въведи код.");
    const d = await demoCode(await hit(`trial:${ip}`, 3, 86400));
    await event("trener_demo", { tier: d.tier, months: d.months, days: d.days });
    return json({ code: formatCode(d.code), tier: d.tier, months: d.months, days: d.days, link: `${originOf(req)}/t/?k=${formatCode(d.code)}` });
  }

  // Starts paying: the parent goes to Stripe's page and comes back to /dostap/?s=…
  if (req.method === "POST" && parts[0] === "checkout") {
    const b = await body(req);
    const plan = (await plans()).find((p: any) => p.id === str(b.plan, 40));
    if (!plan) throw bad("plan", "Този пакет вече не се предлага. Обнови страницата.");
    if (b.agree !== true) throw bad("agree", "Отбележи, че си съгласен с условията.");
    const info = b.code ? await codeInfo(b.code) : null;
    if (info && info.view.unlimited) throw bad("unlimited", "Този код е без срок – не е нужно да плащаш.");
    if (info && TIER_RANK[info.view.tier] > TIER_RANK[plan.tier])
      throw bad("lower", `Кодът вече е на ниво „${TIER_NAME[info.k.tier]}“${info.view.until ? ` до ${info.view.until}` : ""}. Избери пакет „${TIER_NAME[info.k.tier]}“, за да го удължиш.`);
    const r = await startCheckout(plan, info ? info.k.code : null, originOf(req));
    return json({ url: r.url });
  }

  // Locally only (PAY_FAKE=1, no Stripe key): the practice payment.
  if (req.method === "POST" && parts[0] === "fake-pay") {
    if (!fakeMode()) throw notFound();
    const b = await body(req);
    const p = await fulfill(str(b.session, 80), "test@example.com");
    return json({ ok: true, session: p.session });
  }

  // The page after paying: has the payment gone through, and which code it gave.
  if (req.method === "GET" && parts[0] === "status") {
    const session = str(new URL(req.url).searchParams.get("s"), 120);
    let p = await one<any>("SELECT * FROM trener_payments WHERE session = $1", [session]);
    if (!p) throw notFound("Няма такова плащане.");
    if (p.status === "open") p = (await checkWithStripe(session)) || p;
    if (p.status !== "paid") return json({ status: p.status });
    const k = await one<any>("SELECT code, tier, subject, expires_at, months, valid_until FROM trener_keys WHERE code = $1", [p.code]);
    return json({
      status: "paid",
      renewed: !!p.for_code,
      code: formatCode(p.code),
      link: `${originOf(req)}/t/?k=${formatCode(p.code)}`,
      tierName: TIER_NAME[k?.tier || p.tier],
      until: k?.expires_at ? bgDate(k.expires_at) : k?.valid_until ? bgDate(k.valid_until) : null,
      months: k && !k.expires_at ? k.months : null,
      test: !p.live,
    });
  }

  throw notFound();
});

export const config: Config = { path: "/api/pay/*" };
