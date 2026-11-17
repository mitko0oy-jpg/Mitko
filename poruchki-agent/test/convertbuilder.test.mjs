import test from "node:test";
import assert from "node:assert/strict";
import { convertBuilder, deliveryText, officeName } from "../lib/convertbuilder.mjs";

const SITES = JSON.stringify([
  { id: "bg", label: "BeeVenom BG", domain: "beevenombg.eu", key: "w-test-key" },
  { id: "sk", label: "BeeVenom SK", domain: "sk.example", key: "w-other" },
]);

// Shape taken from a real BeeVenom BG order (personal data replaced).
const order = (id, invoiceNo, status, extra = {}) => ({
  id,
  invoiceNo,
  created: 1794480000,
  status,
  customerName: "Мария Петрова",
  shippingAddress: { name: "Мария Петрова", phone: "0888123456", country: "BG", city: "Пловдив", address: "офис Тракия", address2: "" },
  items: [{ name: "BeeVenom Care Gel 2+1 броя ", quantity: 1, total: 22.9 }],
  total: 27.4,
  shippingName: "Доставка до офис на Еконт",
  ...extra,
});

test("fetches only pending orders of the chosen shop, with paging", async () => {
  const urls = [];
  const fakeFetch = async (url, init) => {
    urls.push({ url, auth: init.headers.Authorization });
    const u = new URL(url);
    const skip = Number(u.searchParams.get("skip"));
    const items = skip === 0 ? [order(1, 101, "pending"), order(2, 102, "shipped")] : [order(3, 103, "pending")];
    return new Response(JSON.stringify({ items, totalCount: 51, limit: 50, skip }), { status: 200 });
  };
  const cb = convertBuilder({ sites: ["bg"], env: (k) => (k === "CB_SITES" ? SITES : ""), fetchImpl: fakeFetch });
  const list = await cb.fetchNewOrders({ since: "2026-11-12T10:00:00Z" });
  assert.deepEqual(list.map((o) => o.orderNo), [101, 103]);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.url.startsWith("https://beevenombg.eu/api/site/orders?")));
  assert.equal(urls[0].auth, "Bearer w-test-key");
  const o = list[0];
  assert.equal(o.site, "bg");
  assert.equal(o.apiId, 1);
  assert.equal(o.name, "Мария Петрова");
  assert.equal(o.phone, "0888123456");
  assert.equal(o.items[0].name, "BeeVenom Care Gel 2+1 броя");
  assert.equal(o.deliveryText, "Доставка до офис на Еконт, Пловдив, офис Тракия");
});

test("isStillPending reads the single order", async () => {
  const fakeFetch = async (url) => {
    assert.equal(url, "https://beevenombg.eu/api/site/orders/7");
    return new Response(JSON.stringify(order(7, 107, "canceled")), { status: 200 });
  };
  const cb = convertBuilder({ sites: ["bg"], env: () => SITES, fetchImpl: fakeFetch });
  assert.equal(await cb.isStillPending({ site: "bg", apiId: 7 }), false);
});

test("delivery text", () => {
  assert.equal(
    deliveryText({ shippingName: "Безплатна доставка до Офис на Еконт", shippingAddress: { city: "София", address: "офис Люлин 5" } }),
    "Доставка до Офис на Еконт, София, офис Люлин 5",
  );
  assert.equal(
    deliveryText({ shippingName: "Офис на СПИДИ - Безплатна доставка", shippingAddress: { city: "Варна", address: "Варна" } }),
    "Офис на СПИДИ, Варна",
  );
});

test("office names as they come from ConvertBuilder", () => {
  const cases = {
    "До офис speedy[141]: БОТЕВГРАД - СКЛАД жк Васил Левски ул. Цар Иван Шишман No 42 СКЛАДОВА БАЗА ЛЪЧ Л": "до офис на Спиди „Ботевград – Склад“",
    "До офис speedy[35]: ПЕРНИК ул. Св. св. Кирил и Методий No 23 БЦ ЕЛЕНА": "до офис на Спиди „Перник“",
    "До офис speedy[9317]: КИЛИФАРЕВО - СУПЕРМАРКЕТ СТИВИ (АВТОМАТ) ул. Иван Вазов": "до автомат на Спиди „Килифарево – Супермаркет Стиви“",
    "До офис speedy[870]: СОФИЯ - ЗОНА Б-18 жк Зона Б-18 бл. 8": "до офис на Спиди „София – Зона Б-18“",
    "До офис speedy[48]: СВИЛЕНГРАД пл. 14-ти март No 13": "до офис на Спиди „Свиленград“",
    "До офис econt[8028]: Бургас Ветрен -  Бургас кв. Ветрен ул. Българка - кв. Ветрен №78 Автокомплекс В": "до офис на Еконт „Бургас Ветрен“",
    "До офис econt[7538]: Айдемир -  Айдемир кв. Деленките ул. София №7": "до офис на Еконт „Айдемир“",
    "До офис econt[6308]: Хасково -  Хасково Източна индустриална зона бул. Съединение №66": "до офис на Еконт „Хасково – Източна индустриална зона“",
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(officeName(raw), want, raw);
  assert.equal(officeName("ул. Шипка 5"), "");
  assert.equal(
    deliveryText({ shippingName: "Доставка до офис на Спиди", shippingAddress: { city: "Перник", address: "До офис speedy[35]: ПЕРНИК ул. Св. св. Кирил и Методий No 23" } }),
    "до офис на Спиди „Перник“",
  );
});
