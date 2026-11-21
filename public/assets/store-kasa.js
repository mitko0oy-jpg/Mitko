// The cart checkout of edubel.bg (CFG.KASA: a funnel step with the ConvertBuilder element
// "Чекаут на количка"). Every mix of decks without a checkout of its own comes here as ?p=<package>:
// this block empties the ConvertBuilder cart and puts in that package's product (and, with the
// Bulgarian-language cards, the free answer key). The form under the block then shows and sells it.
import * as CFG from "/assets/store-config.js";

const SET = window.EB_LANDING?.store || {};
const STORE = { ...CFG.STORE_ID, ...CFG.KASA_STORE, ...(SET.kasaStore || {}) };
// extras that come with the package (?x=dos): their products go in after it
const XSTORE = Object.fromEntries(Object.entries(CFG.EXTRAS || {}).map(([x, e]) => [x, e.store]));
const KEY_ID = Number(SET.kasaKey || CFG.KASA_KEY) || 0;
const withKey = (pkg) => pkg === "trio" || pkg.includes("ezik");

const W = () => window.WebPlatform;
const ready = () => {
  const w = W();
  return Boolean(w && w.Store && w.Store.Orders && w.makeClientWebsiteRequest);
};
function req(action, data) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 15000);
    const fail = (e) => {
      clearTimeout(timer);
      reject(e || new Error(action));
    };
    try {
      W().makeClientWebsiteRequest({ action, data, onOk: (r) => (clearTimeout(timer), resolve(r)), onError: fail, onFail: fail });
    } catch (e) {
      fail(e);
    }
  });
}
function setOrder(order) {
  const S = W().Store;
  S.Orders.set("cart", order);
  try { S.updateCartNumber(order.size || 0, false); } catch {}
  try { W().Events.trigger(document, W().Events.ORDER_CHANGED, { id: "cart", order }); } catch {}
  return order;
}
const getCart = () =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ items: [] }), 10000);
    try {
      W().Store.Orders.get("cart", (o) => (clearTimeout(timer), resolve(o || { items: [] })));
    } catch {
      clearTimeout(timer);
      resolve({ items: [] });
    }
  });
async function addProduct(id) {
  const p = (await req("getStoreProduct", { id })).data;
  const option = { productId: p.id, quantity: 1, combination: -1, variation: [], price: p.onSale ? p.salePrice : p.price };
  const r = await req("addToCart", { orderId: "cart", option: JSON.stringify(option), process: "cart" });
  try { W().Store.reportAddToCart(r.uid, p, option, W().Store.currency); } catch {}
  return setOrder(r.data);
}
async function removeAt(index) {
  const r = await req("updateCart", { orderId: "cart", products: "[]", type: "remove", index });
  return setOrder(r.data);
}

async function fill(pkg, xs) {
  let o = await getCart();
  for (let i = (o.items || []).length - 1; i >= 0; i--) o = await removeAt(i);
  await addProduct(STORE[pkg]);
  if (KEY_ID && withKey(pkg)) await addProduct(KEY_ID);
  for (const x of xs) if (XSTORE[x]) await addProduct(XSTORE[x]);
}

// the package is one line in the order: no "+" and "−" next to it
const style = document.createElement("style");
style.textContent = ".payment-step-wrapper .cart-row .number-pad,.payment-step-wrapper .cart-row .cart-row-quantity{display:none!important}";
document.head.appendChild(style);

(function start(n = 0) {
  const q = new URLSearchParams(location.search);
  const pkg = q.get("p");
  const xs = (q.get("x") || "").split(",").filter((x) => XSTORE[x]);
  if (!pkg || !STORE[pkg]) return;
  if (!ready()) {
    if (n < 100) setTimeout(() => start(n + 1), 300);
    return;
  }
  history.replaceState(null, "", location.pathname);
  fill(pkg, xs).catch(() => {});
})();
