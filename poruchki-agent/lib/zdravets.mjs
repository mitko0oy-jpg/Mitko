// zdravets.eu on the phone: the catalogue Стела knows and the totals she says.
// Same rules as the site (zdravets/src/assets/data.js → agent/pricelist-zdravets.json):
//   - every product has packs (1, 2, 3 and sometimes 5 pieces); the cheapest split is used;
//   - from 34,90 € the delivery to an office is free and every further single product is half price
//     (packs, sets, add-ons and wellness patches count towards the 34,90 € but are never halved);
//   - wellness patches: 1 box 14,90 €, any 2 boxes 22,90 €, any 3 boxes 29,90 €;
//   - Black Friday (until the end date): a gift from 3 pieces on;
//   - phone only: a customer who has ordered before gets 30% off the products (rules.phoneRepeatDiscount).
// The AI never does arithmetic: it says what quoteZ returns.
import { moneyBG } from "./format.mjs";

const EPS = 0.005;
const round = (x) => Math.round(x * 100) / 100;
const halfOf = (price) => Math.round(price * 50) / 100;
const MAX_QTY = 10;

/** The TTS stresses „пластири“ wrongly: the agent always says „лепенки“. */
export function sayBG(text) {
  // Only the plural forms: the singular („пластир“ → „лепенка“) changes the gender of the whole sentence,
  // so descriptions keep the site's wording and the style rule makes the agent say „лепенки“.
  return String(text || "")
    .replace(/серията BeeVenom/g, "серията Би Веном")
    .replace(/\s*BeeVenom\s+/g, " с пчелна отрова ")
    .replace(/\s*BeeVenom\b/g, " с пчелна отрова")
    .replace(/BeeHerb/g, "Би Хърб")
    .replace(/(\d+)\s*(?:бр\.\s*)?пластира/g, "$1 лепенки")
    .replace(/Пластирите/g, "Лепенките")
    .replace(/пластирите/g, "лепенките")
    .replace(/Пластири/g, "Лепенки")
    .replace(/пластири/g, "лепенки");
}

// How the English names of the wellness patches are said.
const SPOKEN = { energy: "Енерджи", stress: "Стрес Даун", nad: "Ен Ей Ди плюс", focus: "Фокус", love: "Лав" };
const sayName = (p) => sayBG(p.say).replace(/\s*Би Хърб/, "");

const bfOn = (pl, now) => Boolean(pl.rules?.bf) && now.getTime() <= new Date(pl.rules.bf.end).getTime();
const bfEndText = (pl) =>
  new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", timeZone: "Europe/Sofia" }).format(new Date(pl.rules.bf.end));
const giftText = (packs) => (packs > 1 ? `${packs} пакета лепенки за стави и мускули (${12 * packs} броя)` : "12 лепенки за стави и мускули");

// Codes the old (beevenombg.eu) incoming line used, and the site's pack keys.
const ALIASES = {
  "gel-1": ["gel", 1],
  "gel-2p1": ["gel", 3],
  "gel-3p2": ["gel", 5],
  "patches-bv": ["bvpatch", 1],
  "patches-herbal": ["beeherb", 1],
  bf2: ["gel", 2],
  bf3: ["gel", 3],
  bf5: ["gel", 5],
};

function resolve(pl, rawId) {
  const id = String(rawId || "").trim().toLowerCase();
  if (pl.products.some((p) => p.id === id) || pl.sets.some((s) => s.id === id) || pl.addons.some((a) => a.id === id)) return [id, 1];
  if (ALIASES[id]) return ALIASES[id];
  const m = /^([a-z]+?)-?(\d)$/.exec(id);
  if (m && pl.products.some((p) => p.id === m[1])) return [m[1], Number(m[2])];
  return null;
}

/** Cheapest way to make exactly n pieces from the packs (fewer packs on a tie). */
function splitPacks(packs, n) {
  const best = Array(n + 1).fill(null);
  best[0] = { cost: 0, used: [] };
  for (let i = 1; i <= n; i++) {
    for (const k of packs) {
      const prev = i >= k.n ? best[i - k.n] : null;
      if (!prev) continue;
      const cand = { cost: round(prev.cost + k.price), used: [...prev.used, k] };
      const cur = best[i];
      if (!cur || cand.cost < cur.cost - 0.001 || (Math.abs(cand.cost - cur.cost) < 0.001 && cand.used.length < cur.used.length)) best[i] = cand;
    }
  }
  return best[n]?.used || [];
}

/** Which single pieces stay at full price: the cheapest set that reaches the threshold (as the site does). */
function keepFull(units, need) {
  if (need <= 0) return units.map(() => false);
  if (units.length <= 14) {
    let best = 0;
    let bestSum = Infinity;
    for (let m = 1; m < 1 << units.length; m++) {
      let s = 0;
      for (let k = 0; k < units.length; k++) if (m & (1 << k)) s += units[k].price;
      if (s >= need && s < bestSum - 0.001) {
        best = m;
        bestSum = s;
      }
    }
    return units.map((u, k) => Boolean(best & (1 << k)));
  }
  const order = units.map((u, k) => k).sort((a, b) => units[b].price - units[a].price);
  const keep = units.map(() => false);
  let s = 0;
  for (const k of order) {
    if (s >= need) break;
    keep[k] = true;
    s += units[k].price;
  }
  return keep;
}

const THE = { 2: "двете", 3: "трите", 4: "четирите", 5: "петте" };
const packName = (p, n) => (n === 1 ? sayName(p) : `${sayName(p)} – ${n} броя`);

/**
 * Total of a phone order by the site's rules.
 * @param {any} pl agent/pricelist-zdravets.json
 * @param {{items: {product_id: string, quantity: number}[], delivery?: string}} order
 */
export function quoteZ(pl, order, now = new Date(), { suggest = true, repeat = false } = {}) {
  const errors = [];
  const units = new Map(); // product id → pieces
  const setQty = new Map();
  const addonQty = new Map();
  for (const it of order.items || []) {
    const r = resolve(pl, it.product_id);
    const qty = Math.round(Number(it.quantity) || 0);
    if (!r) {
      errors.push(`непознат продукт „${it.product_id}“ – използвай код от ценоразписа`);
      continue;
    }
    if (qty < 1 || qty > MAX_QTY) {
      errors.push(`невалиден брой за „${it.product_id}“`);
      continue;
    }
    const [id, mult] = r;
    if (pl.sets.some((s) => s.id === id)) setQty.set(id, (setQty.get(id) || 0) + qty);
    else if (pl.addons.some((a) => a.id === id)) addonQty.set(id, 1); // an add-on is one piece per order
    else units.set(id, (units.get(id) || 0) + qty * mult);
  }
  if (addonQty.size && !units.size && !setQty.size) errors.push("добавката се взима само заедно с друг продукт");
  for (const [id, n] of units) if (n > 15) errors.push(`твърде много броя от „${id}“ – за такава поръчка колега ще се обади`);

  const lines = []; // { id, name, cb, qty, sum }
  const singles = []; // half-price candidates: { p, price }
  let fixed = 0;
  let giftPacks = 1;
  let wellnessBoxes = 0;
  const wellnessKinds = [];
  for (const [id, n] of units) {
    const p = pl.products.find((x) => x.id === id);
    if (!p) continue;
    if (pl.wellness.ids.includes(id)) {
      wellnessBoxes += n;
      wellnessKinds.push(n > 1 ? `${p.say} × ${n}` : p.say); // for Mitko (Telegram)
      continue;
    }
    const used = splitPacks(p.packs, Math.min(n, 15));
    const byN = new Map();
    for (const k of used) byN.set(k.n, { k, count: (byN.get(k.n)?.count || 0) + 1 });
    for (const { k, count } of byN.values()) {
      if (k.giftPacks) giftPacks = Math.max(giftPacks, k.giftPacks);
      if (k.n === 1 && p.half) {
        for (let i = 0; i < count; i++) singles.push({ p, price: k.price });
        continue;
      }
      const sum = round(k.price * count);
      fixed += sum;
      lines.push({ id: p.id, pack: k.n, name: packName(p, k.n), cb: `${p.name} – ${k.n} бр. [№${k.store}]`, qty: count, sum });
    }
  }
  for (const [id, count] of setQty) {
    const s = pl.sets.find((x) => x.id === id);
    const sum = round(s.price * count);
    fixed += sum;
    lines.push({ id, pack: s.units, name: `${sayBG(s.name)} (${sayBG(s.line)})`, cb: `${s.name} [№${s.store}]`, qty: count, sum });
  }
  if (wellnessBoxes) {
    const combos = [...pl.wellness.combos].sort((a, b) => b.n - a.n);
    const c3 = combos.find((c) => c.n === 3);
    const c2 = combos.find((c) => c.n === 2);
    const single = pl.products.find((p) => pl.wellness.ids.includes(p.id));
    let left = wellnessBoxes;
    const kinds = wellnessKinds.join(", ");
    const add = (n, price, store, count) => {
      const sum = round(price * count);
      fixed += sum;
      lines.push({ id: "wellness", pack: n, name: n === 1 ? `уелнес лепенки – 1 кутия` : `уелнес лепенки – комплект ${n} кутии`, cb: `Уелнес пластири ${n} кут. (${kinds}) [№${store}]`, qty: count, sum });
    };
    if (c3 && left >= 3) {
      const k = Math.floor(left / 3);
      add(3, c3.price, c3.store, k);
      left -= 3 * k;
    }
    if (c2 && left === 2) add(2, c2.price, c2.store, 1);
    else if (left > 0) add(1, single.price, single.store, left);
  }
  for (const id of addonQty.keys()) {
    const a = pl.addons.find((x) => x.id === id);
    fixed += a.price;
    lines.push({ id, pack: 1, name: `${sayBG(a.name)} – като добавка към поръчката`, cb: `${a.name} (добавка) [№${a.store}]`, qty: 1, sum: a.price });
  }

  // Half price from the threshold on.
  const halfFrom = pl.rules.halfFrom || 0;
  const allSingles = singles.reduce((s, u) => s + u.price, 0);
  const halfOn = halfFrom > 0 && fixed + allSingles >= halfFrom - EPS;
  const keep = halfOn ? keepFull(singles, halfFrom - fixed - EPS) : singles.map(() => true);
  let saved = 0;
  const per = new Map();
  singles.forEach((u, k) => {
    const w = per.get(u.p.id) || { p: u.p, full: 0, half: 0 };
    if (keep[k]) w.full++;
    else {
      w.half++;
      saved += u.price - halfOf(u.price);
    }
    per.set(u.p.id, w);
  });
  for (const { p, full, half } of per.values()) {
    if (full) lines.push({ id: p.id, pack: 1, name: sayName(p), cb: `${p.name} [№${p.store}]`, qty: full, sum: round(p.price * full) });
    if (half) lines.push({ id: p.id, pack: 1, name: `${sayName(p)} на половин цена`, cb: `${p.name} – ½ цена [№${p.halfStore}]`, qty: half, sum: round(halfOf(p.price) * half) });
  }
  if (!lines.length && !errors.length) errors.push("няма избран продукт");

  const subtotal = round(lines.reduce((s, l) => s + l.sum, 0));
  const d = order.delivery ? pl.delivery[order.delivery] : null;
  if (order.delivery && !d) errors.push("непознат начин на доставка (офис на Еконт, офис на Спиди или до адрес)");
  const freeFrom = pl.rules.freeOfficeFrom || 0;
  const free = Boolean(d?.office) && freeFrom > 0 && subtotal >= freeFrom - EPS;
  const delivery = d ? (free ? { ...d, price: 0, label: `${d.label} (безплатна)` } : d) : null;
  // A repeat order by phone: −30% of the products, after the other offers (the thresholds count the price before it).
  const repeatPct = repeat ? pl.rules.phoneRepeatDiscount || 0 : 0;
  const repeatOff = round(subtotal * repeatPct);
  const total = round(subtotal - repeatOff + (delivery?.price || 0));

  // Black Friday gift.
  const pieces = [...units.entries()].reduce((s, [, n]) => s + n, 0) + [...setQty.entries()].reduce((s, [id, n]) => s + n * pl.sets.find((x) => x.id === id).units, 0) + addonQty.size;
  let gift = null;
  if (bfOn(pl, now) && pieces >= pl.rules.bf.giftFrom) {
    const onlyWellness = wellnessBoxes === pieces;
    gift = onlyWellness
      ? { text: pl.rules.bf.wellnessGift, cb: "Подарък: 1 кутия уелнес пластири по избор (видът е в бележката)", wellness: true }
      : { text: giftText(giftPacks), cb: `Подарък: ${giftPacks} × Пластири за стави 12 бр. [№${pl.rules.bf.giftStore}]`, packs: giftPacks };
  }

  const q = {
    errors,
    lines,
    delivery,
    freeDelivery: free,
    subtotal,
    total,
    totalText: moneyBG(total),
    halfOn,
    saved: round(saved),
    toThreshold: halfFrom > 0 && !halfOn ? round(halfFrom - subtotal) : 0,
    gift,
    pieces,
    repeatPct,
    repeatOff,
  };
  if (suggest && !errors.length) {
    q.ifAdd = ifAddFor(pl, order, q, units, now, repeat);
    q.suggestion = suggestionFor(pl, order, q, units, now, repeat);
  }
  return q;
}

const halfCount = (q, id) => q.lines.filter((l) => l.id === id && /половин цена/.test(l.name)).reduce((s, l) => s + l.qty, 0);

/** For every product: the new total if the customer adds one more – so the agent knows the offer for this very order. */
function ifAddFor(pl, order, q, units, now, repeat) {
  const delivery = order.delivery || "econt_office";
  const base = order.items || [];
  const inOrderWellness = [...units.keys()].find((id) => pl.wellness.ids.includes(id));
  const candidates = [
    ...pl.products.filter((p) => !pl.wellness.ids.includes(p.id)).map((p) => ({ id: p.id, name: sayName(p) })),
    ...pl.sets.map((s) => ({ id: s.id, name: sayBG(s.name) })),
    { id: inOrderWellness || pl.wellness.ids[0], name: "още една кутия уелнес лепенки по избор", wellness: true },
  ].filter((c) => c.id);
  const out = [];
  for (const c of candidates) {
    const r = quoteZ(pl, { items: [...base, { product_id: c.id, quantity: 1 }], delivery }, now, { suggest: false, repeat });
    if (r.errors.length) continue;
    out.push({
      id: c.wellness ? "wellness" : c.id,
      code: c.id,
      name: c.name,
      total: r.total,
      added: round(r.total - q.total),
      freeNow: r.freeDelivery && !q.freeDelivery,
      half: halfCount(r, c.id) > halfCount(q, c.id),
      gift: r.gift && !q.gift ? r.gift.text : "",
    });
  }
  return out;
}

/** One extra offer the agent may make, once, with the exact new total. */
function suggestionFor(pl, order, q, units, now, repeat) {
  const delivery = order.delivery || "econt_office";
  const alt = (items) => quoteZ(pl, { items, delivery }, now, { suggest: false, repeat });
  const base = order.items || [];
  const withTotal = (r) => r.total;
  // 0. Wellness only: one more box of any kind – 2 for 22,90 €, 3 for 29,90 € (+ the gift in Black Friday).
  const wellnessIds = [...units.keys()].filter((id) => pl.wellness.ids.includes(id));
  const boxes = wellnessIds.reduce((s, id) => s + units.get(id), 0);
  if (wellnessIds.length && wellnessIds.length === units.size && (boxes === 1 || boxes === 2)) {
    const combo = pl.wellness.combos.find((c) => c.n === boxes + 1);
    const r = alt([...base, { product_id: wellnessIds[0], quantity: 1 }]);
    if (combo && !r.errors.length) {
      const giftNow = r.gift && !q.gift ? ` и ${r.gift.text} подарък` : "";
      return `Ако вземете още една кутия – от същите или друг вид – ${THE[boxes + 1]} излизат ${moneyBG(combo.price)}${giftNow}. Общата сума ще е ${moneyBG(r.total)}.`;
    }
  }
  // 1. One or two pieces of a product with a bigger "most chosen" pack (e.g. 3 gels).
  for (const [id, n] of units) {
    const p = pl.products.find((x) => x.id === id);
    if (!p || pl.wellness.ids.includes(id)) continue;
    const feat = p.packs.find((k) => k.featured);
    if (feat && n < feat.n && units.size === 1 && !base.some((it) => !units.has(resolve(pl, it.product_id)?.[0]))) {
      const other = base.filter((it) => resolve(pl, it.product_id)?.[0] !== id);
      const r = alt([...other, { product_id: id, quantity: feat.n }]);
      if (r.errors.length) continue;
      const giftNow = r.gift && !q.gift ? ` и подарък ${r.gift.text}` : "";
      return `Ако вземете ${feat.n} броя ${sayName(p).toLowerCase()} вместо ${n}, ${THE[feat.n] || `${feat.n}-те`} излизат ${moneyBG(feat.price)}${giftNow}. Общата сума ще е ${moneyBG(withTotal(r))}.`;
    }
    // 2. Four pieces when five cost less.
    const bigger = p.packs.find((k) => k.n === n + 1 && k.n >= 5);
    if (bigger) {
      const other = base.filter((it) => resolve(pl, it.product_id)?.[0] !== id);
      const r = alt([...other, { product_id: id, quantity: n + 1 }]);
      if (!r.errors.length && r.total <= q.total + 0.001) return `${n + 1} броя ${sayName(p).toLowerCase()} излизат по-евтино от ${n}: общата сума ще е ${moneyBG(r.total)}.`;
    }
  }
  // 3. Close to the threshold: one more product makes the delivery to an office free – say which and the new total.
  if (q.toThreshold > 0 && q.toThreshold <= 12) {
    const cats = new Set([...units.keys()].map((id) => pl.products.find((p) => p.id === id)?.cat));
    const giftProduct = q.gift && !q.gift.wellness ? "plastiri" : "";
    const options = (q.ifAdd || []).filter((o) => o.freeNow && o.id !== "wellness" && !units.has(o.id) && o.id !== giftProduct);
    const pick =
      options.filter((o) => cats.has(pl.products.find((p) => p.id === o.id)?.cat)).sort((a, b) => a.added - b.added)[0] ||
      options.sort((a, b) => a.added - b.added)[0];
    if (pick) {
      return `Ако добавите и ${pick.name.toLowerCase()}, поръчката минава ${moneyBG(pl.rules.halfFrom)}: доставката до офис става безплатна и общата сума ще е ${moneyBG(pick.total)} – само ${moneyBG(pick.added)} повече. А всеки следващ продукт става на половин цена.`;
    }
    return `Още ${moneyBG(q.toThreshold)} до ${moneyBG(pl.rules.halfFrom)} и доставката до офис става безплатна, а всеки следващ продукт е на половин цена.`;
  }
  return "";
}

/** What the get_total tool answers. */
export function quoteAnswer(q) {
  return {
    ok: true,
    total: q.totalText,
    delivery: q.delivery ? `${q.delivery.label.replace(" (безплатна)", "")} – ${q.delivery.price ? moneyBG(q.delivery.price) : "безплатна"}` : "",
    items: q.lines.map((l) => `${l.qty > 1 ? `${l.qty} × ` : ""}${l.name} – ${moneyBG(l.sum)}`),
    ...(q.gift ? { gift: `Подарък: ${q.gift.text}${q.gift.wellness ? " – попитай кой вид иска и го запиши в бележката" : ""}` } : {}),
    ...(q.halfOn ? { half_price: `Поръчката е над прага: всеки следващ отделен продукт е на половин цена${q.saved ? ` (спестява ${moneyBG(q.saved)})` : ""}.` } : {}),
    ...(q.repeatOff ? { repeat_discount: `Клиентът вече е поръчвал при нас: ${Math.round(q.repeatPct * 100)}% отстъпка от продуктите (${moneyBG(q.repeatOff)}) – вече е в общата сума.` } : {}),
    ...(q.suggestion ? { suggestion: q.suggestion } : {}),
    ...(q.ifAdd?.length
      ? {
          if_you_add: q.ifAdd.map((o) => {
            const diff = o.added >= 0 ? `с ${moneyBG(o.added)} повече` : `с ${moneyBG(-o.added)} по-малко`;
            const flags = [o.half ? "той е на половин цена" : "", o.freeNow ? "доставката става безплатна" : "", o.gift ? `подарък ${o.gift}` : ""].filter(Boolean);
            return `${o.name} [${o.code}]: обща сума ${moneyBG(o.total)} (${diff})${flags.length ? ` – ${flags.join(", ")}` : ""}`;
          }),
        }
      : {}),
  };
}

const money = (x) => moneyBG(x);
const packsText = (p, bf) =>
  p.packs
    .map((k) => `${k.n} ${k.n === 1 ? "брой" : "броя"} – ${money(k.price)}${k.featured ? " (най-избиран)" : ""}${bf && k.giftPacks ? ` (с ${giftText(k.giftPacks)} подарък)` : ""}`)
    .join("; ");

/** The catalogue and offers for Стела's prompt, as of `now` (Black Friday ends by itself). */
export function renderZdravets(pl, now = new Date()) {
  const r = pl.rules;
  const out = [];
  out.push("## Оферти и доставка");
  if (bfOn(pl, now)) {
    out.push(
      `- ${r.bf.label} – до ${bfEndText(pl)} включително: към поръчка от ${r.bf.giftFrom} и повече броя подарък ${r.bf.gift}; към пакета от 5 гела – ${giftText(3)}. Ако поръчката е само от уелнес лепенки (3 кутии), подаръкът е ${r.bf.wellnessGift}. Подаръкът го определя инструментът.`,
    );
  }
  if (r.halfFrom) {
    out.push(
      `- При поръчка от ${money(r.halfFrom)} нагоре доставката до офис е безплатна и всеки следващ отделен продукт е на половин цена. Пакетите, комплектите и уелнес лепенките не стават на половин цена, но се броят към сумата. Кое е на половин цена, смята инструментът.`,
    );
  }
  out.push(
    `- Доставка: ${pl.delivery.econt_office.label} или ${pl.delivery.speedy_office.label} – ${money(pl.delivery.econt_office.price)}; ${pl.delivery.speedy_address.label} – ${money(pl.delivery.speedy_address.price)}.`,
    "- Изпращаме до един работен ден, куриерът доставя за един до два работни дни.",
    "- Плащане: наложен платеж – на куриера при получаване, в брой или с карта. Нищо не се плаща предварително.",
    `- Гаранция ${pl.shop.guaranteeDays} дни: ако продуктът не хареса, клиентът се обажда и ще му кажем как да го върне; парите за продукта се връщат до 14 дни след като го получим. Отделно има законово право на отказ 14 дни от получаването. Пратката може да се прегледа пред куриера – при повреда или грешка се обажда веднага и я оправяме за наша сметка.`,
    `- Телефон: ${pl.shop.phone}, денонощно, всеки ден. Имейл: ${pl.shop.email}. Сайт: ${pl.shop.site}.`,
  );
  for (const c of pl.categories) {
    out.push("", `## ${sayBG(c.name)}`);
    const inCat = pl.products.filter((x) => x.cat === c.id);
    const sameUsage = inCat.length > 1 && inCat.every((x) => x.usage === inCat[0].usage) ? inCat[0].usage : "";
    if (c.id === "wellness") {
      const [c2, c3] = [pl.wellness.combos.find((x) => x.n === 2), pl.wellness.combos.find((x) => x.n === 3)];
      out.push(
        `Цени за всички видове уелнес лепенки: една кутия – ${money(pl.products.find((p) => p.cat === "wellness")?.price || 0)}${c2 ? `; две кутии по избор (еднакви или различни) – ${money(c2.price)}` : ""}${c3 ? `; три кутии по избор – ${money(c3.price)}` : ""}. Всяка кутия е 30 лепенки за един месец. В инструмента подаваш всеки вид с броя кутии, а цената за комплекта той смята сам.`,
        "Уелнес лепенките не са лекарство и не лекуват. За тях не обещаваш отслабване, сваляне на кръвна захар, енергия, настроение или друг ефект върху здравето – казваш само какво съдържат и как се слагат.",
      );
    }
    if (sameUsage) out.push(`Употреба (еднаква за всички): ${sameUsage}`);
    for (const p of inCat) {
      out.push(
        "",
        `### ${sayName(p)}${SPOKEN[p.id] ? ` (казва се „${SPOKEN[p.id]}“)` : ""} [код ${p.id}]`,
        `${sayBG(p.size)}. ${c.id === "wellness" ? "" : `Цени: ${packsText(p, bfOn(pl, now))}.`}`.trim(),
        p.short,
        p.ingredients.length ? `Съставки: ${sayBG(p.ingredients.join("; "))}.` : "",
        p.usage && !sameUsage ? `Употреба: ${p.usage}` : "",
      );
    }
    for (const s of pl.sets.filter((x) => pl.products.find((p) => p.id === x.items[0][0])?.cat === c.id)) {
      out.push("", `### ${sayBG(s.name)} [код ${s.id}]`, `${sayBG(s.line)} – общо ${money(s.price)}.`);
    }
  }
  // The site's checkout add-ons (4,90 €) are not offered on the phone: Стела offers the patches at 9,90 €.
  return out.filter((l) => l !== "").join("\n").replace(/\n### /g, "\n\n### ").replace(/\n## /g, "\n\n## ");
}
