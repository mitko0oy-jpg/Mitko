import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneSK, moneySK, itemsTextSK, formalNameSK, inCallingHours } from "../lib/format.mjs";
import { normalizeOrder, deliveryTextSK } from "../lib/convertbuilder.mjs";
import { countryOfSite, parseSiteCountries } from "../lib/countries.mjs";
import { memoryStore } from "../lib/store.mjs";
import { syncOrders, runDueCalls } from "../lib/engine.mjs";

test("Slovak phone numbers", () => {
  assert.equal(normalizePhoneSK("0905 123 456"), "+421905123456");
  assert.equal(normalizePhoneSK("+421 905 123 456"), "+421905123456");
  assert.equal(normalizePhoneSK("00421905123456"), "+421905123456");
  assert.equal(normalizePhoneSK("+421 0905 123 456"), "+421905123456");
  assert.equal(normalizePhoneSK("905123456"), "+421905123456");
  assert.equal(normalizePhoneSK("02 1234 5678"), "+421212345678");
  assert.equal(normalizePhoneSK("0888 123 456"), null, "a Bulgarian mobile is not Slovak");
  assert.equal(normalizePhoneSK("0905 12"), null);
  assert.equal(normalizePhoneSK(""), null);
});

test("Slovak money, items and polite name", () => {
  assert.equal(moneySK(37.9), "37 eur a 90 centov");
  assert.equal(moneySK(4), "4 eurá");
  assert.equal(moneySK(1.01), "1 euro a 1 cent");
  assert.equal(moneySK(3.04), "3 eurá a 4 centy");
  assert.equal(
    itemsTextSK([
      { name: "Včelí jed 2+1", qty: 1, price: 27.9 },
      { name: "Darček: 8 náplastí s včelím jedom", qty: 1, price: 0 },
      { name: "Návod na použitie", qty: 1, price: 0 },
    ]),
    "Včelí jed 2 plus 1 a darček: 8 náplastí s včelím jedom",
  );
  assert.equal(
    itemsTextSK([{ name: "Včelí jed 3+2", qty: 1, price: 37.9 }, { name: "Sprej s včelím jedom", qty: 2, price: 25.8 }]),
    "Včelí jed 3 plus 2 a 2 kusy Sprej s včelím jedom",
  );
  assert.equal(formalNameSK("Mária Nováková"), "pani Nováková");
  assert.equal(formalNameSK("Ján Novák"), "pán Novák");
  assert.equal(formalNameSK("Peter Hruška"), "", "cannot tell – use the full name");
  assert.equal(formalNameSK("Mária"), "");
});

test("calling hours in Slovak time (one hour behind Sofia)", () => {
  // 2026-11-16 winter time: Bratislava = UTC+1.
  assert.equal(inCallingHours("09:00-20:00", new Date("2026-11-16T07:59:00Z"), "Europe/Bratislava"), false); // 08:59
  assert.equal(inCallingHours("09:00-20:00", new Date("2026-11-16T08:00:00Z"), "Europe/Bratislava"), true); // 09:00
  assert.equal(inCallingHours("09:00-20:00", new Date("2026-11-16T19:00:00Z"), "Europe/Bratislava"), false); // 20:00
});

test("sites map to countries", () => {
  assert.equal(countryOfSite("vcelijed").code, "sk");
  assert.equal(countryOfSite("bg").code, "bg");
  assert.equal(countryOfSite("hu"), null, "no Hungarian agent yet");
  assert.equal(countryOfSite("hu", parseSiteCountries("hu:sk")).code, "sk");
});

test("Slovak delivery text", () => {
  const o = { shippingName: "To address gls", shippingAddress: { name: "Ján Novák", phone: "0905123456", city: "TRNAVA", address: "Hlavná 12" } };
  assert.equal(deliveryTextSK(o), "kuriérom GLS na adresu Hlavná 12, Trnava");
  assert.equal(deliveryTextSK({ shippingName: "To office gls", shippingAddress: { city: "Nitra", address: "GLS ParcelShop Tesco" } }), "kuriérom GLS na výdajné miesto GLS ParcelShop Tesco, Nitra");
  const n = normalizeOrder({ id: "vcelijed", label: "Vcelijed SK", country: "sk" }, { id: 5, invoiceNo: 98831, created: 1794700000, total: 31.9, ...o, items: [] });
  assert.equal(n.deliveryText, "kuriérom GLS na adresu Hlavná 12, Trnava");
});

test("the 3+2 package ships free in Slovakia: the agent says the total without shipping", () => {
  const site = { id: "vcelijed", label: "Vcelijed SK", country: "sk" };
  const big = { id: 7, invoiceNo: 98837, created: 1794700000, subTotal: 42.8, shippingAmount: 4, total: 46.8, items: [{ name: "Včelí jed 3+2", quantity: 1, total: 37.9 }, { name: "Darček: 16 náplastí s včelím jedom", quantity: 1, total: 0 }, { name: "Náplasti na kolená s prírodnými extraktmi - 12", quantity: 1, total: 4.9 }] };
  assert.equal(normalizeOrder(site, big).total, 42.8);
  const { shippingAmount, ...noShippingField } = big;
  assert.equal(normalizeOrder(site, noShippingField).total, 42.8, "falls back to total minus subtotal");
  const small = { id: 8, invoiceNo: 98836, created: 1794700000, subTotal: 27.9, shippingAmount: 4, total: 31.9, items: [{ name: "Včelí jed 2+1", quantity: 1, total: 27.9 }, { name: "Darček: 8 náplastí s včelím jedom", quantity: 1, total: 0 }] };
  assert.equal(normalizeOrder(site, small).total, 31.9, "2+1 still pays 4 € shipping");
  assert.equal(normalizeOrder({ id: "bg", label: "BG", country: "bg" }, { ...big, id: 9 }).total, 46.8, "Bulgaria is unchanged");
});

test("a Slovak order is called by the Slovak agent, in Slovak, in Slovak hours", async () => {
  const store = memoryStore();
  const calls = [];
  const T0 = new Date("2026-11-16T09:00:00Z"); // 10:00 Bratislava, 11:00 Sofia
  const at = (m) => new Date(T0.getTime() + m * 60_000);
  const orders = [];
  const deps = {
    store,
    cb: { fetchNewOrders: async () => orders, isStillPending: async () => true },
    call: async (args) => (calls.push(args), { conversationId: `c${calls.length}` }),
    notify: async () => {},
    config: {
      mode: "live",
      testPhone: "+359877000000",
      countries: {
        bg: { ready: true, hours: "09:00-21:00", hoursSunday: "10:00-19:00", shopName: "BeeVenom", deliveryDays: "един до два работни дни", deliveryText: "" },
        sk: { ready: true, hours: "09:00-20:00", hoursSunday: "10:00-18:00", shopName: "obchodu BeeVenom", deliveryDays: "tri až päť pracovných dní", deliveryText: "na adresu" },
      },
    },
  };
  await syncOrders(deps, T0);
  orders.push(
    { site: "vcelijed", siteLabel: "Vcelijed SK", orderNo: 98831, createdAt: at(1).toISOString(), name: "Mária Nováková", phone: "0905 123 456", items: [{ name: "Včelí jed 2+1", qty: 1, price: 27.9 }, { name: "Darček: 8 náplastí s včelím jedom", qty: 1, price: 0 }], total: 31.9, deliveryText: "kuriérom GLS na adresu Hlavná 12, Trnava" },
    { site: "bg", siteLabel: "BeeVenom BG", orderNo: 7001, createdAt: at(1).toISOString(), name: "Мария Петрова", phone: "0888 123 456", items: [{ name: "Гел 2+1", qty: 1, price: 19.9 }], total: 24.4, deliveryText: "" },
  );
  assert.equal(await syncOrders(deps, at(2)), 2);
  const rep = await runDueCalls(deps, at(3));
  assert.equal(rep.started, 2, "one call per country in the same run");
  const sk = calls.find((c) => c.country === "sk");
  assert.equal(sk.to, "+421905123456");
  assert.equal(sk.variables.customer_name, "pani Nováková");
  assert.equal(sk.variables.order_total, "31 eur a 90 centov");
  assert.equal(sk.variables.order_items, "Včelí jed 2 plus 1 a darček: 8 náplastí s včelím jedom");
  assert.equal(sk.variables.shop_name, "obchodu BeeVenom");
  const bg = calls.find((c) => c.country === "bg");
  assert.equal(bg.to, "+359888123456");

  // 20:30 Sofia = 19:30 Bratislava: both may call; 20:30 Bratislava: only Bulgaria.
  deps.config.countries.sk.ready = false;
  orders.push({ site: "vcelijed", siteLabel: "Vcelijed SK", orderNo: 98832, createdAt: at(5).toISOString(), name: "Ján Novák", phone: "0905 999 888", items: [], total: 21.9, deliveryText: "" });
  await syncOrders(deps, at(6));
  const r2 = await runDueCalls(deps, at(7));
  assert.equal(r2.started, 0, "the Slovak agent is not configured, so the Slovak order waits");
  assert.equal(calls.length, 2);
});
