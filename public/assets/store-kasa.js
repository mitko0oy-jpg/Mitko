// The cart checkout of edubel.bg (CFG.KASA: a funnel step with the ConvertBuilder element
// "Чекаут на количка"). Every mix of decks without a checkout of its own comes here as ?p=<package>:
// this block empties the ConvertBuilder cart and puts in that package's product (and, with the
// Bulgarian-language cards, the free answer key). The form under the block then shows and sells it.
import * as CFG from "/assets/store-config.js";

const SET = window.EB_LANDING?.store || {};
const STORE = { ...CFG.STORE_ID, ...CFG.KASA_STORE, ...(SET.kasaStore || {}) };
// extras that come with the package (?x=dos): their products go in after it
const XSTORE = Object.fromEntries(Object.entries(CFG.EXTRAS || {}).map(([x, e]) => [x, e.store]));
// decks past the third (?d=lit,lit,ezik), only with the trio: one product per kind, as many as asked for
const DSTORE = { ...(CFG.EXTRA_DECK?.store || {}), ...(SET.extraDeckStore || {}) };
const MORE_MAX = Math.max(0, (CFG.CART_MAX || 3) - (CFG.MAX_DECKS || 3));
// the trio's gift (until its moment): with extra decks the order comes here, not to the trio's own checkout
const giftNow = () => Boolean(CFG.TRIO_GIFT && Date.now() <= Date.parse(CFG.TRIO_GIFT.until));
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
async function addProduct(id, quantity = 1) {
  const p = (await req("getStoreProduct", { id })).data;
  const option = { productId: p.id, quantity, combination: -1, variation: [], price: p.onSale ? p.salePrice : p.price };
  const r = await req("addToCart", { orderId: "cart", option: JSON.stringify(option), process: "cart" });
  try { W().Store.reportAddToCart(r.uid, p, option, W().Store.currency); } catch {}
  return setOrder(r.data);
}
async function removeAt(index) {
  const r = await req("updateCart", { orderId: "cart", products: "[]", type: "remove", index });
  return setOrder(r.data);
}

async function fill(pkg, xs, more) {
  let o = await getCart();
  for (let i = (o.items || []).length - 1; i >= 0; i--) o = await removeAt(i);
  await addProduct(STORE[pkg]);
  if (KEY_ID && withKey(pkg)) await addProduct(KEY_ID);
  for (const [k, n] of Object.entries(more)) await addProduct(DSTORE[k], n);
  if (pkg === "trio" && giftNow()) for (const id of CFG.TRIO_GIFT.store) await addProduct(id);
  for (const x of xs) if (XSTORE[x]) await addProduct(XSTORE[x]);
}

// every line is fixed: no "+" and "−" and no number to change
const style = document.createElement("style");
style.textContent = ".payment-step-wrapper .cart-row .number-pad,.payment-step-wrapper .cart-row .cart-row-quantity{display:none!important}" +
  ".eb-q{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:8px;background:#13233E;color:#fff;font-size:.85em;font-weight:700;white-space:nowrap}";
document.head.appendChild(style);
// a line of two or more of the same product (the extra decks) says how many: "× 2"
function marks() {
  for (const row of document.querySelectorAll(".payment-step-wrapper .cart-row")) {
    const q = Number(row.querySelector(".cart-row-quantity")?.value) || 1;
    const h = row.querySelector("h4");
    if (!h) continue;
    const old = h.querySelector(".eb-q");
    if (q > 1 && old?.dataset.q !== String(q)) {
      old?.remove();
      h.insertAdjacentHTML("beforeend", `<span class="eb-q" data-q="${q}">× ${q}</span>`);
    } else if (q <= 1 && old) old.remove();
  }
}
new MutationObserver(marks).observe(document.documentElement, { childList: true, subtree: true });
marks();

(function start(n = 0) {
  const q = new URLSearchParams(location.search);
  const pkg = q.get("p");
  const xs = (q.get("x") || "").split(",").filter((x) => XSTORE[x]);
  const more = {};
  // extra decks only with the trio (all three kinds)
  if (pkg === "trio") for (const k of (q.get("d") || "").split(",")) if (DSTORE[k] && Object.values(more).reduce((s, n) => s + n, 0) < MORE_MAX) more[k] = (more[k] || 0) + 1;
  if (!pkg || !STORE[pkg]) return;
  if (!ready()) {
    if (n < 100) setTimeout(() => start(n + 1), 300);
    return;
  }
  history.replaceState(null, "", location.pathname);
  fill(pkg, xs, more).catch(() => {});
})();
