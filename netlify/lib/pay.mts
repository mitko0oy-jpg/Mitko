// Paying for the НВО тренажор with a card, and the free trial.
// The parent pays on /dostap/ through Stripe Checkout (Stripe's own page: the card never reaches us). Stripe tells us the
// payment went through with a signed webhook; then the pupil's code gets the bought level and term, or a new code is made.
// Stripe keys live only in Netlify's settings: STRIPE_SECRET_KEY (sk_test_… for testing, sk_live_… for real money)
// and STRIPE_WEBHOOK_SECRET (whsec_…). Without them the page shows the plans but cannot take payments;
// locally PAY_FAKE=1 (scripts/dev-server.mjs) replaces Stripe with a practice payment.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { formatCode, newCode } from "./codes.mts";
import { one, q, tx } from "./db.mts";
import { env, HttpError } from "./http.mts";
import { TIER_RANK } from "./trener.mts";

export const stripeKey = () => env("STRIPE_SECRET_KEY") || "";
export const isLive = () => /^(sk|rk)_live_/.test(stripeKey());
export const fakeMode = () => !stripeKey() && env("PAY_FAKE") === "1";

/* ---------- settings (the free trial) ---------- */
export async function getSetting(key: string): Promise<any> {
  const row = await one<{ value: any }>("SELECT value FROM app_settings WHERE key = $1", [key]);
  return row?.value ?? null;
}
export async function setSetting(key: string, value: any) {
  await q("INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, JSON.stringify(value)]);
  return value;
}

/* ---------- plans ---------- */
export const plans = (all = false) => q(`SELECT * FROM trener_plans ${all ? "" : "WHERE active AND (until IS NULL OR until >= current_date)"} ORDER BY sort, id`);
export async function savePlans(list: any[]) {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, "plans", "Дай списък с пакети.");
  const ids: string[] = [];
  for (const [i, p] of list.entries()) {
    const id = String(p.id || "").slice(0, 40);
    if (!/^[a-z0-9-]+$/.test(id)) throw new HttpError(400, "plans", `Пакет ${i + 1}: id с малки латински букви, цифри и тире.`);
    const tier = p.tier === "std" ? "std" : "full";
    const months = Number.isInteger(p.months) && p.months >= 1 && p.months <= 36 ? p.months : null;
    const until = /^\d{4}-\d{2}-\d{2}$/.test(String(p.until || "")) ? p.until : null;
    if (!months && !until) throw new HttpError(400, "plans", `Пакет ${id}: months или until.`);
    const price = Math.round(Number(p.price) * 100);
    if (!(price >= 50)) throw new HttpError(400, "plans", `Пакет ${id}: цена в евро (например 39 или 5.90).`);
    await q(
      `INSERT INTO trener_plans (id, title, note, tier, subject, months, until, price_cents, currency, active, sort)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'eur', $9, $10)
       ON CONFLICT (id) DO UPDATE SET title = $2, note = $3, tier = $4, subject = $5, months = $6, until = $7, price_cents = $8, active = $9, sort = $10`,
      [id, String(p.title || id).slice(0, 80), String(p.note || "").slice(0, 200), tier, tier === "std" ? (p.subject === "math" ? "math" : "bel") : null, months, until, price, p.active !== false, i],
    );
    ids.push(id);
  }
  // Plans left out of the list are no longer sold (old payments still point at them).
  await q("UPDATE trener_plans SET active = false WHERE NOT (id = ANY($1))", [ids]);
  return plans(true);
}

/* ---------- Stripe ---------- */
// Stripe's API takes form fields; nested ones as a[b][c].
function form(obj: any, prefix = "", out: string[] = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}
async function stripe(method: string, path: string, params?: any) {
  // STRIPE_API: only for the local test with a stand-in Stripe (test/stripe.test.mjs); never set in Netlify.
  const res = await fetch(`${env("STRIPE_API") || "https://api.stripe.com"}/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${stripeKey()}`, "content-type": "application/x-www-form-urlencoded", "stripe-version": "2024-06-20" },
    body: params ? form(params) : undefined,
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("stripe", res.status, j?.error?.message);
    throw new HttpError(502, "stripe", "Плащането не може да започне в момента. Опитай пак след малко.");
  }
  return j;
}

// Checks that a webhook really comes from Stripe: HMAC-SHA256 of "<timestamp>.<body>" with the webhook secret,
// at most 5 minutes old.
export function verifySignature(payload: string, header: string, secret: string, now = Date.now()): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((x) => x.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const want = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  return header.split(",").some((x) => {
    const [k, v] = x.split("=");
    if (k?.trim() !== "v1" || !v) return false;
    const got = Buffer.from(v.trim(), "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/* ---------- a checkout ---------- */
// A code that is free both among the codes and among the payments still waiting.
async function freshCode() {
  for (let i = 0; i < 10; i++) {
    const c = newCode();
    const taken = await one("SELECT 1 FROM trener_keys WHERE code = $1 UNION ALL SELECT 1 FROM trener_payments WHERE code = $1", [c]);
    if (!taken) return c;
  }
  throw new HttpError(500, "server_error", "Нещо се обърка. Опитай пак.");
}

export async function startCheckout(plan: any, forCode: string | null, origin: string) {
  // A new code is chosen now and written in the name of the purchase, so it is also in Stripe's receipt by e-mail:
  // the parent keeps it even if the page after paying is closed. It starts to work only once the payment is through.
  const newOne = forCode ? null : await freshCode();
  const name = `НВО тренажор – ${plan.title} · ${forCode ? `удължаване на код ${formatCode(forCode)}` : `код ${formatCode(newOne!)}`}`;
  let session: string, url: string;
  if (stripeKey()) {
    const s = await stripe("POST", "checkout/sessions", {
      mode: "payment",
      locale: "bg",
      success_url: `${origin}/dostap/?s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dostap/${forCode ? `?k=${formatCode(forCode)}` : ""}`,
      line_items: { 0: { quantity: 1, price_data: { currency: plan.currency || "eur", unit_amount: plan.price_cents, product_data: { name, description: plan.note || undefined } } } },
      // EU: digital content that starts at once – the parent agrees to the terms (they explain the 14 days) before paying.
      consent_collection: env("STRIPE_TERMS") === "1" ? { terms_of_service: "required" } : undefined,
      custom_text: { submit: { message: forCode
        ? `След плащането достъпът на код ${formatCode(forCode)} се удължава веднага – детето продължава със същия бележник.`
        : `Кодът на детето е ${formatCode(newOne!)}. Ще го видиш веднага след плащането, а го има и в разписката на имейла ти.` } },
      payment_intent_data: { description: name },
      metadata: { plan: plan.id, for_code: forCode || "", code: newOne || "" },
    });
    session = s.id;
    url = s.url;
  } else if (fakeMode()) {
    session = `fake_${randomBytes(12).toString("hex")}`;
    url = `${origin}/dostap/?fake=${session}`;
  } else {
    throw new HttpError(503, "pay_off", "Плащането с карта още не е включено. Пиши ни и ще помогнем.");
  }
  await q(
    `INSERT INTO trener_payments (session, plan, tier, subject, months, until, amount_cents, currency, for_code, code, live)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [session, plan.id, plan.tier, plan.subject, plan.months, plan.until, plan.price_cents, plan.currency || "eur", forCode, newOne, isLive()],
  );
  return { session, url };
}

// After Stripe says "paid": give the pupil's code the bought level and term, or make a new code. Safe to call twice.
export async function fulfill(session: string, email?: string | null) {
  return tx(async (t) => {
    const [p] = await t<any>("SELECT * FROM trener_payments WHERE session = $1 FOR UPDATE", [session]);
    if (!p) throw new HttpError(404, "not_found", "Няма такова плащане.");
    if (p.status === "paid") return p;
    let code = p.for_code;
    if (code) {
      const [k] = await t<any>("SELECT * FROM trener_keys WHERE code = $1 FOR UPDATE", [code]);
      if (!k) throw new HttpError(404, "not_found", "Няма такъв код.");
      // Still running (or not opened yet): a higher level is kept, and БЕЛ + математика bought one by one make Пълен.
      const active = !k.first_used || (k.expires_at && new Date(k.expires_at) > new Date());
      let tier = p.tier, subject = p.subject;
      if (active && TIER_RANK[k.tier] > TIER_RANK[p.tier]) { tier = k.tier; subject = k.subject; }
      else if (active && k.tier === "std" && p.tier === "std" && k.subject !== p.subject) { tier = "full"; subject = null; }
      if (tier !== "std") subject = null;
      if (p.months) {
        // The new months come after the time left (from today if it already ended); a code not opened yet gets a longer term.
        if (k.first_used) await t("UPDATE trener_keys SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(months => $2), tier = $3, subject = $4 WHERE code = $1", [code, p.months, tier, subject]);
        else await t("UPDATE trener_keys SET months = COALESCE(months, 0) + $2, days = NULL, valid_until = NULL, tier = $3, subject = $4 WHERE code = $1", [code, p.months, tier, subject]);
      } else {
        const until = `${String(p.until).slice(0, 10)}T23:59:59+03:00`;
        if (k.first_used) await t("UPDATE trener_keys SET expires_at = GREATEST(COALESCE(expires_at, now()), $2::timestamptz), tier = $3, subject = $4 WHERE code = $1", [code, until, tier, subject]);
        else await t("UPDATE trener_keys SET valid_until = $2::timestamptz, months = NULL, days = NULL, tier = $3, subject = $4 WHERE code = $1", [code, until, tier, subject]);
      }
    } else {
      // The code chosen at the start of the payment (it is in the receipt); a new one only if it got taken meanwhile.
      code = null;
      for (let i = 0; i < 10 && !code; i++) {
        const c = i === 0 && p.code ? p.code : newCode();
        const r = await t(
          `INSERT INTO trener_keys (code, batch, max_devices, months, valid_until, kind, tier, subject, note)
           VALUES ($1, $2, 3, $3, $4, 'access', $5, $6, $7) ON CONFLICT (code) DO NOTHING RETURNING code`,
          [c, `карта-${new Date().toISOString().slice(0, 7)}${p.live ? "" : "-тест"}`, p.months, p.until ? `${String(p.until).slice(0, 10)}T23:59:59+03:00` : null, p.tier, p.subject, `плащане ${p.id}`],
        );
        if (r.length) code = c;
      }
    }
    const [done] = await t<any>("UPDATE trener_payments SET status = 'paid', paid_at = now(), code = $2, email = COALESCE($3, email) WHERE id = $1 RETURNING *", [p.id, code, email ? String(email).slice(0, 200) : null]);
    return done;
  });
}

// When the webhook is late (or not set up yet), the success page asks Stripe directly.
export async function checkWithStripe(session: string) {
  if (!stripeKey() || session.startsWith("fake_")) return null;
  const s = await stripe("GET", `checkout/sessions/${encodeURIComponent(session)}`);
  if (s.payment_status === "paid") return fulfill(session, s.customer_details?.email);
  if (s.status === "expired") await q("UPDATE trener_payments SET status = 'expired' WHERE session = $1 AND status = 'open'", [session]);
  return null;
}

// A code from a payment whose page was closed before we heard about it (and no webhook came): ask Stripe now.
// True when the code exists after this.
export async function activateIfPaid(code: string) {
  const p = await one<{ session: string }>("SELECT session FROM trener_payments WHERE code = $1 AND for_code IS NULL AND status = 'open'", [code]);
  if (!p) return false;
  const done = await checkWithStripe(p.session).catch(() => null);
  return !!(done && done.status === "paid");
}

// A renewal paid while the page after paying was closed (and no webhook came): when the trainer opens with the code,
// its payments still "open" from the last two days are checked with Stripe (Checkout sessions expire after 24 hours,
// so an abandoned one is marked expired and not asked about again).
export async function settleRenewals(code: string) {
  if (!stripeKey()) return;
  const rows = await q<{ session: string }>(
    "SELECT session FROM trener_payments WHERE for_code = $1 AND status = 'open' AND created_at > now() - interval '2 days' ORDER BY id LIMIT 3",
    [code],
  );
  for (const r of rows) await checkWithStripe(r.session).catch(() => null);
}

/* ---------- the free trial ---------- */
// One click on /dostap/: a new code at the full level for a short time (setting "trial": {open, months|days, daily}).
// After that the code falls back to Старт with all its grades. A few per address a day, a cap a day for everybody.
export async function trialCode() {
  const s = (await getSetting("trial")) || {};
  if (!s.open) throw new HttpError(403, "trial_closed", "Безплатната проба в момента е спряна.");
  const months = Number.isInteger(s.months) && s.months > 0 ? s.months : null;
  const days = !months && Number.isInteger(s.days) && s.days > 0 ? s.days : !months ? 1 : null;
  const today = await one<{ n: number }>("SELECT count(*)::int AS n FROM trener_keys WHERE batch LIKE 'проба-%' AND created_at > now() - interval '1 day'");
  if ((today?.n ?? 0) >= (Number(s.daily) || 300)) throw new HttpError(429, "trial_full", "Днес свършиха безплатните проби. Опитай утре.");
  for (let i = 0; i < 10; i++) {
    const c = newCode();
    const r = await q(
      `INSERT INTO trener_keys (code, batch, max_devices, months, days, kind, tier) VALUES ($1, $2, 3, $3, $4, 'access', 'full') ON CONFLICT (code) DO NOTHING RETURNING code`,
      [c, `проба-${new Date().toISOString().slice(0, 7)}`, months, days],
    );
    if (r.length) return { code: c, months, days };
  }
  throw new HttpError(500, "server_error", "Нещо се обърка. Опитай пак.");
}

// The demo: one tap in the trainer („Разгледай безплатно“) or app.edubel.site/demo. While the free trial is open and
// today's places last, it is the trial (everything, for a short time); otherwise a code at the free level Старт
// (no term). Either way the child is in the trainer at once, with no card, e-mail or account.
export async function demoCode(trialAllowed: boolean) {
  if (trialAllowed) {
    try {
      return { ...(await trialCode()), tier: "full" };
    } catch (e: any) {
      if (!["trial_closed", "trial_full"].includes(e?.code)) throw e;
    }
  }
  for (let i = 0; i < 10; i++) {
    const c = newCode();
    const r = await q(
      `INSERT INTO trener_keys (code, batch, max_devices, kind, tier) VALUES ($1, $2, 3, 'access', 'start') ON CONFLICT (code) DO NOTHING RETURNING code`,
      [c, `демо-${new Date().toISOString().slice(0, 7)}`],
    );
    if (r.length) return { code: c, months: null, days: null, tier: "start" };
  }
  throw new HttpError(500, "server_error", "Нещо се обърка. Опитай пак.");
}

/* ---------- invitation links (the owner's master link for testers and friends) ---------- */
// app.edubel.site/i/<token>: every new device that opens it gets its OWN code – everything, no term – so each
// person has a separate gradebook (one shared code would merge everybody's grades). The link works for any number
// of people and devices until it is switched off. Only the SHA-256 of the token is kept (setting "invites").
const tokenHash = (t: string) => createHash("sha256").update("edubel-invite:" + t).digest("hex");
type Invite = { hash: string; batch: string; note: string; created: string; count: number; off: boolean; drafts: boolean };
const invites = async (): Promise<Invite[]> => (await getSetting("invites")) || [];

export async function newInvite(batch: string, note = "", drafts = false) {
  const b = String(batch || "").trim().slice(0, 40);
  if (!/^[\p{L}\p{N}-]{3,40}$/u.test(b)) throw new HttpError(400, "invite", "Партида от букви, цифри и тире (3–40 знака).");
  const list = await invites();
  if (list.some((x) => x.batch === b)) throw new HttpError(400, "invite", "Такава партида вече има покана.");
  const token = randomBytes(9).toString("base64url");
  // A review batch („преглед…“) also sees the drafts waiting for the teacher.
  const batchName = drafts && !/^преглед/i.test(b) ? `преглед-${b}` : b;
  list.push({ hash: tokenHash(token), batch: batchName, note: String(note || "").slice(0, 120), created: new Date().toISOString(), count: 0, off: false, drafts });
  await setSetting("invites", list);
  return { token, batch: batchName };
}
export async function listInvites() {
  return (await invites()).map(({ hash, ...x }) => x);
}
export async function switchInvite(batch: string, off: boolean) {
  const list = await invites();
  const inv = list.find((x) => x.batch === batch);
  if (!inv) throw new HttpError(404, "not_found", "Няма такава покана.");
  inv.off = off;
  await setSetting("invites", list);
  return { batch, off };
}
export async function inviteCode(token: string) {
  const list = await invites();
  const inv = list.find((x) => x.hash === tokenHash(String(token || "")));
  if (!inv) throw new HttpError(404, "invite", "Този линк не е валиден. Провери го или поискай нов.");
  if (inv.off) throw new HttpError(403, "invite_off", "Този линк за покана вече е спрян.");
  for (let i = 0; i < 10; i++) {
    const c = newCode();
    const r = await q(
      `INSERT INTO trener_keys (code, batch, max_devices, kind, tier, note) VALUES ($1, $2, 3, 'access', 'full', $3) ON CONFLICT (code) DO NOTHING RETURNING code`,
      [c, inv.batch, `покана ${inv.batch}`],
    );
    if (r.length) {
      await q(
        `UPDATE app_settings SET value = (SELECT jsonb_agg(CASE WHEN e->>'hash' = $1 THEN jsonb_set(e, '{count}', to_jsonb(COALESCE((e->>'count')::int, 0) + 1)) ELSE e END) FROM jsonb_array_elements(value) e) WHERE key = 'invites'`,
        [inv.hash],
      );
      return { code: c, batch: inv.batch };
    }
  }
  throw new HttpError(500, "server_error", "Нещо се обърка. Опитай пак.");
}
