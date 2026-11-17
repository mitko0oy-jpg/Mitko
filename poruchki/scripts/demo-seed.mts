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
    await q("INSERT INTO shops (id, label, domain, region, currency, position, synced_at, full_sync_at) VALUES ($1, $2, $3, $4, $5, $6, now(), now()) ON CONFLICT (id) DO NOTHING", [
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
          shippingAddress: { name: "", phone: "0888" + String(100000 + Math.floor(rnd() * 899999)), city: pick(CITIES), address: courier === "econt" ? "До офис econt[1234]: Демо офис" : "ул. Демо 1" },
          items: [{ name, quantity: qty, total: Math.round(price * qty * 100) / 100 }],
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
  await q("INSERT INTO users (email, password_hash, name, role) VALUES ('demo@local', $1, 'Демо', 'admin') ON CONFLICT (email) DO NOTHING", [await hashPassword("demo-demo-demo")]);
  await q("INSERT INTO job_log (job, ok, info) VALUES ('sync', true, '{\"demo\": true}'), ('track', true, '{\"demo\": true}')");
  return `demo: ${SHOPS.length} shops, ${total} orders, login demo@local / demo-demo-demo`;
}

export { seedDemo as seed };
