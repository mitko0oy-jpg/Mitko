// Builds the ConvertBuilder code blocks of the new Здравец Натура site (zdravets.eu) in
// landing/zdravets/ from zdravets/src/. Each file is one self-contained block for a "Код / HTML"
// widget: styles scoped to the block, markup, data and script. On the live site every page holds
// only the one-line loader (landing/zdravets/load.js) that fetches its block from jsDelivr.
// The scoping follows build-store.mjs (the edubel.bg blocks).
// Usage: node scripts/build-zdravets.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "zdravets/src");
const OUT = path.join(root, "landing/zdravets");
const SCOPE = ":is(#znl,#znf)";

// src: the page in zdravets/src/pages; out: the block name (data-zn="…"); url: its page in ConvertBuilder.
const PAGES = [
  { src: "index", out: "nachalo", url: "/" },
  { src: "cheren-petak", out: "cheren-petak", url: "/cheren-petak" },
  { src: "produkti", out: "produkti", url: "/produkti" },
  { src: "produkt", out: "produkt", url: "/produkt" },
  { src: "dostavka", out: "dostavka", url: "/dostavka" },
  { src: "kontakti", out: "kontakti", url: "/kontakti" },
  { src: "obshti-usloviya", out: "obshti-usloviya", url: "/obshti-usloviya" },
  { src: "poveritelnost", out: "poveritelnost", url: "/poveritelnost" },
  { src: "blagodarim", out: "blagodarim", url: "/blagodarim" },
  // the checkout page: this block above ConvertBuilder's checkout element, "dolu" below it
  { src: "poruchka", out: "poruchka", url: "/poruchka (над формата за поръчка)" },
  { src: "dolu", out: "dolu", url: "/poruchka (под формата за поръчка)" },
  // фунията „Сайт поръчка“ (/kasa): поръчка → ъпсел → даунсел → благодарим; над елемента „Ъпсел / Даунсел“
  { src: "upsell", out: "upsell", url: "/kasa/oferta-za-vas (над елемента „Ъпсел / Даунсел“)" },
  { src: "downsell", out: "downsell", url: "/kasa/posledna-oferta (над елемента „Ъпсел / Даунсел“)" },
];
// the old file names in the sources → the pages on the live site
const LINKS = {
  "index.html": "/",
  "cheren-petak.html": "/cheren-petak",
  "produkti.html": "/produkti",
  "produkt.html": "/produkt",
  "porachka.html": "/poruchka",
  "blagodarim.html": "/blagodarim",
  "dostavka.html": "/dostavka",
  "kontakti.html": "/kontakti",
  "obshti-usloviya.html": "/obshti-usloviya",
  "poveritelnost.html": "/poveritelnost",
};
const FONTS = "https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Manrope:wght@500;600;700;800&display=swap";

/* ---------- styles: scope every selector to the block ---------- */
function splitTop(list) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) (parts.push(cur), (cur = ""));
    else cur += ch;
  }
  return [...parts, cur].map((s) => s.trim()).filter(Boolean);
}
function scopeSelector(sel) {
  if (sel === "html") return "html";
  if (sel.startsWith(":root")) return SCOPE + sel.slice(5);
  if (sel.startsWith("html.")) return SCOPE + sel.slice(4); // html.fs-l → the block with .fs-l
  if (sel.startsWith("body")) return SCOPE + sel.slice(4);
  if (sel === "*") return `${SCOPE},${SCOPE} *`;
  return `${SCOPE} ${sel}`;
}
function matching(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i;
  }
  throw new Error("Unbalanced CSS");
}
function scopeBlock(css) {
  let out = "", i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    const close = matching(css, open);
    const inner = css.slice(open + 1, close);
    if (/^@(media|supports|container)/.test(prelude)) out += `${prelude}{${scopeBlock(inner)}}`;
    else if (prelude.startsWith("@")) out += `${prelude}{${inner}}`;
    else out += `${splitTop(prelude).map(scopeSelector).join(",")}{${inner}}`;
    i = close + 1;
  }
  return out;
}
// rem follows the page (ConvertBuilder sets 16px); the site is sized from --fs, so rem → --fs.
const remToFs = (s) => s.replace(/(\d*\.?\d+)rem\b/g, (m, n) => `calc(${n}*var(--fs))`);

async function styles() {
  let css = (await readFile(path.join(SRC, "assets/style.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  // html{font-size:var(--fs)} would resize ConvertBuilder's own elements: the size lives on the block
  css = css.replace(/(^|\})\s*html\{font-size:var\(--fs\);scroll-behavior:smooth\}/, "$1html{scroll-behavior:smooth}");
  css = remToFs(scopeBlock(css));
  // The builder rows stop at 1100 px: the row with the block is stretched to the whole width,
  // and the builder's resets for text, lists and forms are undone inside the block.
  const reset =
    `.page-layout:has(#znl),.page-layout:has(#znf){overflow:clip;display:flow-root}` +
    `.grid-row:has(#znl),.grid-row:has(#znf){padding-left:0!important;padding-right:0!important}` +
    `:is(.grid-content,.grid-column,.widget-row,.widget,.code-widget-content):is(:has(#znl),:has(#znf)){display:block!important;float:none!important;clear:both;width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important}` +
    `${SCOPE}{position:relative;isolation:isolate;width:100%;font-size:var(--fs);text-align:left;font-feature-settings:"locl" 0}` +
    `${SCOPE} b,${SCOPE} strong{font-weight:800}${SCOPE} ul{list-style:none;padding:0;margin:0}${SCOPE} .prose ul{list-style:disc;padding-left:1.3em;margin:0 0 1em}` +
    `${SCOPE} button{font-family:inherit}${SCOPE} input,${SCOPE} textarea{font-family:inherit;font-size:inherit}${SCOPE} a{text-decoration-thickness:1px}`;
  return (reset + css).replace(/\s*\n\s*/g, "").replace(/\s{2,}/g, " ");
}

async function script() {
  const data = await readFile(path.join(SRC, "assets/data.js"), "utf8");
  const app = await readFile(path.join(SRC, "assets/app.js"), "utf8");
  // one function: two blocks on one page (поръчка + долу) must not clash
  return `(function(){"use strict";\n${data}\n${app}\n})();`;
}

function page(raw, file) {
  const m = raw.match(/^<!--\s*([\s\S]*?)\s*-->\s*/);
  if (!m) throw new Error(`No header comment in ${file}`);
  const meta = Object.fromEntries(m[1].split("\n").filter((l) => l.includes(":")).map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  let body = raw.slice(m[0].length);
  body = body.replace(/href="([a-z-]+\.html)([?#][^"]*)?"/g, (all, f, rest = "") => {
    if (!LINKS[f]) throw new Error(`Unknown link ${f} in ${file}`);
    return `href="${LINKS[f]}${rest}"`;
  });
  for (const x of body.matchAll(/(src|href)="(?!https?:|tel:|mailto:|#|\/)([^"]*)"/g)) throw new Error(`Relative link left in ${file}: ${x[0]}`);
  return { meta, body: remToFs(body.trim()) };
}

await mkdir(OUT, { recursive: true });
const css = await styles();
const js = await script();
const list = [];
for (const p of PAGES) {
  const { meta, body } = page(await readFile(path.join(SRC, "pages", p.src + ".html"), "utf8"), p.src);
  const id = meta.root || "znl";
  const header = meta.header === "no" ? "" : `<div data-zn-header></div>\n`;
  const footer = meta.footer === "no" ? "" : `\n<div data-zn-footer></div>`;
  const mbar = meta.mbar === "no" ? "" : " data-mbar";
  // the page's own unscoped styles (the checkout form of ConvertBuilder on /poruchka)
  const extra = meta.css ? (await readFile(path.join(SRC, "assets", meta.css), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "") : "";
  const out = `<!-- ЗДРАВЕЦ НАТУРА · ${meta.title} (${p.url}) · целият код отива в един HTML/Code блок в ConvertBuilder.
     Направен от scripts/build-zdravets.mjs – промените се правят в zdravets/src/ и после се генерира наново. -->
<style>${css}${extra}</style>
<link rel="stylesheet" href="${FONTS}">
<div id="${id}" class="zn-root" data-page="${meta.page || ""}"${mbar}>
${header}<div class="zn-main">
${body}
</div>${footer}
</div>
<script>${js}</script>
`;
  await writeFile(path.join(OUT, `${p.out}.html`), out);
  list.push({ ...p, title: meta.title, desc: meta.desc || "" });
  console.log(`landing/zdravets/${p.out}.html  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
}
await writeFile(path.join(OUT, "pages.json"), JSON.stringify(list, null, 2) + "\n");
