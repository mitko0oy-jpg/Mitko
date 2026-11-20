// Made-up shops and orders for trying the pages locally (DEMO=1 node scripts/dev-server.mjs).
// Nothing here is real data.
import { hashPassword } from "../netlify/lib/auth.mts";
import { q } from "../netlify/lib/db.mts";
import { upsertOrders } from "../netlify/lib/orders.mts";

const SHOPS = [
  { id: "bg", label: "BeeVenom BG", region: "bg", currency: "EUR", perDay: 6, products: [["BeeVenom Care Gel", 15.9], ["Bee Venom крем за стави 3+2", 29.9], ["Пластири с пчелна отрова", 4.9]] },
  { id: "edubel", label: "EduBel", region: "bg", currency: "EUR", perDay: 12, products: [["Образователни карти за НВО", 27.9], ["Карти по литература", 44.9], ["Пробна матура – книжна", 9.9]] },
  { id: "bioshop", label: "BioShop", region: "bg", currency: "EUR", perDay: 1, products: [["1 бр. Пчелна отрова крем", 15.9], ["3 Пчелна отрова крем", 24.9]] },
  { id: "max4", label: "4 Max BG", region: "bg", currency: "EUR", perDay: 0.4, products: [["Пчелна отрова 2+1", 22.9]] },
  { id: "sk", label: "BeeVenom SK", region: "abroad", currency: "EUR", perDay: 4, products: [["BeeVenom 2+1", 37.9], ["BeeVenom 3+2", 47.9]] },
  { id: "hu", label: "BeeVenom HU", region: "abroad", currency: "HUF", perDay: 5, products: [["BeeVenom 2+1", 10990], ["BeeVenom 3+2", 8490]] },
  { id: "sl", label: "BeeVenom SI", region: "abroad", currency: "EUR", perDay: 1.5, products: [["BeeVenom 2+1", 39.9]] },
];
const NAMES = ["Иван Петров", "Мария Георгиева", "Петя Колева", "Стоян Димов", "Елена Маринова", "Георги Тодоров", "Николина Ангелова", "Даниела Стоянова"];
const CITIES = ["София", "Пловдив", "Варна", "Бургас", "Русе", "Стара Загора", "Плевен", "Хасково"];

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

export async function seedDemo() {
  for (const [i, s] of SHOPS.entries()) {
    await q("INSERT INTO shops (id, label, domain, region, currency, position, synced_at, full_sync_at, company_id) VALUES ($1, $2, $3, $4, $5, $6, now(), now(), 1) ON CONFLICT (id) DO NOTHING", [
      s.id, s.label, `${s.id}.example`, s.region, s.currency, i,
    ]);
  }
  await q("INSERT INTO settings (key, value) VALUES ('fx', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify({ rates: { HUF: 364.35 }, date: "demo" })]);
  const now = Date.now();
  let id = 1000;
  let total = 0;
  for (const s of SHOPS) {
    const raws: any[] = [];
    const fates: { id: number; fate: string; courier: string }[] = [];
    for (let d = 75; d >= 0; d--) {
      const count = Math.floor(s.perDay * (0.6 + rnd() * 0.8) * (new Date(now - d * 86400000).getDay() === 0 ? 0.7 : 1) + rnd());
      for (let k = 0; k < count; k++) {
        id++;
        const created = Math.floor((now - d * 86400000 - rnd() * 12 * 3600000) / 1000);
        const [name, price] = pick(s.products) as [string, number];
        const qty = rnd() < 0.15 ? 2 : 1;
        const shipping = s.currency === "HUF" ? 1700 : rnd() < 0.3 ? 0 : 4.5;
        const courier = s.region === "bg" ? (rnd() < 0.55 ? "econt" : "speedy") : "gls";
        const age = d;
        const r = rnd();
        let fate = "new";
        if (age >= 8) fate = r < 0.07 ? "canceled" : r < 0.15 ? (rnd() < 0.35 ? "refused" : "returned") : "delivered";
        else if (age >= 3) fate = r < 0.06 ? "canceled" : r < 0.35 ? "at_office" : r < 0.55 ? "in_transit" : r < 0.6 ? "returned" : "delivered";
        else if (age >= 1) fate = r < 0.08 ? "canceled" : r < 0.45 ? "new" : "in_transit";
        else fate = r < 0.05 ? "canceled" : "new";
        const shipped = !["new", "canceled"].includes(fate);
        raws.push({
          id,
          invoiceNo: id,
          created,
          status: fate === "canceled" ? "canceled" : fate === "new" ? "pending" : fate === "delivered" && s.region === "abroad" ? "completed" : "shipped",
          customerName: pick(NAMES),
          shippingAddress: { name: "", phone: "0888" + String(100000 + Math.floor(rnd() * 899999)), city: pick(CITIES), address: courier === "econt" ? "До офис econt[8501]: Айтос Автогара" : courier === "speedy" ? "До офис speedy[414]: ПЛОВДИВ - ВЕЛЕШКИ ул. Авксентий Велешки 31" : "ул. Демо 1" },
          items: [{ name, quantity: qty, total: Math.round(price * qty * 100) / 100, sku: `SKU-${String(name).length}${Math.round(price)}`, weight: 0.35, variation: qty > 1 ? [{ name: "Брой", value: "2" }] : [] }],
          customerEmail: rnd() < 0.5 ? "klient@example.com" : "",
          ...(rnd() < 0.15 ? { discountCode: "ESEN10" } : {}),
          subTotal: price * qty,
          shippingAmount: shipping,
          total: Math.round((price * qty + shipping) * 100) / 100,
          shippingName: courier === "econt" ? "Доставка до офис на Еконт" : courier === "speedy" ? "Доставка до офис на Спиди" : "To office gls-new",
          paymentMethod: "cod",
          ...(shipped && s.region === "bg" ? { fulfillment: { courier, trackingNo: String(1051600000000 + id) } } : {}),
        });
        if (shipped && s.region === "bg") fates.push({ id, fate, courier });
      }
    }
    await upsertOrders({ id: s.id, currency: s.currency }, raws, { rates: { HUF: 364.35 }, date: "demo" });
    total += raws.length;
    for (const f of fates) {
      const text = { delivered: "Доставена", returned: "Върната", refused: "Отказана от получателя", at_office: "Пристигнала в офис", in_transit: "Пътува към офиса" }[f.fate];
      await q(
        `UPDATE orders SET parcel_status = $3, parcel_text = $4, parcel_at = ordered_at + interval '2 days', parcel_final = $5, tracked_at = now(),
                parcel_events = $6, delivered_at = CASE WHEN $3 = 'delivered' THEN ordered_at + interval '2 days' END
          WHERE shop = $1 AND cb_id = $2`,
        [s.id, f.id, f.fate, text, ["delivered", "returned", "refused"].includes(f.fate), JSON.stringify([{ at: null, text: "Приета от куриера" }, { at: null, text }])],
      );
    }
  }
  await q("INSERT INTO users (email, password_hash, name, role, company_id, is_owner) VALUES ('demo@local', $1, 'Демо', 'admin', 1, true) ON CONFLICT (email) DO NOTHING", [await hashPassword("demo-demo-demo")]);
  // What the couriers charged (Middleware shows it in brackets next to the delivery price).
  await q("UPDATE orders SET courier_cost = CASE WHEN courier = 'econt' THEN 3.24 ELSE 3.80 END, courier_cost_at = now() WHERE tracking_no IS NOT NULL");
  await q("INSERT INTO job_log (job, ok, info) VALUES ('sync', true, '{\"demo\": true}'), ('track', true, '{\"demo\": true}')");
  // nekorekten.com marks on a few returned customers (invented reports).
  await q(
    `INSERT INTO phone_checks (company_id, phone_key, phone, count, reports)
     SELECT DISTINCT 1, right(regexp_replace(phone, '\\D', '', 'g'), 9), phone, 2,
            '[{"id":1,"text":"Не взе пратката от офиса (измислен пример)","date":"2026-10-01T10:15:00+03:00","name":"","city":"София"},{"id":2,"text":"Отказа на място (измислен пример)","date":"2026-09-12T12:00:00+03:00","name":"","city":""}]'::jsonb
       FROM orders WHERE stage = 'returned' AND phone <> '' LIMIT 6
     ON CONFLICT DO NOTHING`,
  );
  // Сега в сайтовете: people on the shop pages now and earlier today, and the feed.
  const SOURCES = ["Facebook / Instagram", "Facebook / Instagram", "Facebook / Instagram", "Google реклама", "Google", "Директно", "TikTok", "sms", "newsletter"];
  const CITIES2 = ["София", "Пловдив", "Варна", "Бургас", "Русе", "Стара Загора", "Плевен"];
  for (let i = 0; i < 160; i++) {
    const shop = SHOPS[i % SHOPS.length];
    const online = i < 14;
    const minsAgo = online ? Math.floor(rnd() * 1) : 3 + Math.floor(rnd() * 600);
    const stage = online ? (i % 7 === 0 ? "filling" : i % 4 === 0 ? "checkout" : "browsing") : "browsing";
    const reached = online ? stage : rnd() < 0.12 ? "filling" : rnd() < 0.25 ? "checkout" : "browsing";
    const source = pick(SOURCES) as string;
    const country = shop.region === "bg" ? "BG" : shop.id === "hu" ? "HU" : shop.id === "sk" ? "SK" : "SI";
    const city = country === "BG" ? (pick(CITIES2) as string) : "";
    const sid = `demo${String(i).padStart(6, "0")}`;
    await q(
      `INSERT INTO visits (shop, sid, vid, page, stage, reached, device, source, country, city, cart_lines, value, pages, first_at, last_at, left_at)
       VALUES ($1, $2, $3, '/', $4, $5, $6, $7, $8, $9, $10, $11, $12, now() - make_interval(mins => $13 + 4), now() - make_interval(mins => $13), CASE WHEN $14 THEN NULL ELSE now() END)`,
      [shop.id, sid, `v${sid}`, stage, reached, rnd() < 0.8 ? "mobile" : "desktop", source, country, city, reached === "browsing" ? 0 : 1, reached === "browsing" ? "" : "39,90 €", 1 + Math.floor(rnd() * 4), minsAgo, online],
    );
    if (minsAgo < 180) {
      await q("INSERT INTO visit_events (shop, sid, kind, country, city, source, at) VALUES ($1, $2, 'came', $3, $4, $5, now() - make_interval(mins => $6 + 4))", [shop.id, sid, country, city, source, minsAgo]);
      if (reached !== "browsing") await q("INSERT INTO visit_events (shop, sid, kind, country, city, source, at) VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(mins => $7 + 1))", [shop.id, sid, reached, country, city, source, minsAgo]);
    }
  }
  // Today's orders came through these visits (the phone typed in the form links them).
  const todays = await q<any>("SELECT id, shop, phone, ordered_at FROM orders WHERE day = (now() AT TIME ZONE 'Europe/Sofia')::date ORDER BY id LIMIT 40");
  for (const [i, o] of todays.entries()) {
    const sid = `demoo${String(i).padStart(5, "0")}`;
    await q(
      `INSERT INTO visits (shop, sid, vid, page, stage, reached, device, source, country, city, first_at, last_at, left_at)
       VALUES ($1, $2, $3, '/', 'ordered', 'ordered', 'mobile', $4, 'BG', '', $5::timestamptz - interval '6 minutes', $5, $5)`,
      [o.shop, sid, `v${sid}`, pick(SOURCES), o.ordered_at],
    );
    await q("INSERT INTO leads (shop, sid, name, phone, first_at, last_at) VALUES ($1, $2, '', $3, $4::timestamptz - interval '3 minutes', $4)", [o.shop, sid, o.phone, o.ordered_at]);
  }
  return `demo: ${SHOPS.length} shops, ${total} orders, login demo@local / demo-demo-demo`;
}

export { seedDemo as seed };
