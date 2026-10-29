// Builds the ConvertBuilder code blocks in landing/ from the shop pages in public/karti-nvo/.
// Each file is one self-contained block (styles, markup, settings, script) for a "Code" widget.
// Every style is scoped to the block, so the builder's page and its checkout are not affected.
// Images, videos and fonts load from jsDelivr, which serves this public repository at a fixed
// commit, so the block needs nothing from our server and no account anywhere.
// Usage: node scripts/build-landing.mjs   (commit the media first)
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root }).toString().trim();

const dirty = git("status --porcelain -- public/karti-nvo/media public/fonts");
if (dirty) throw new Error(`Commit and push the media first:\n${dirty}`);
const repo = git("remote get-url origin").match(/github\.com[/:]([^/]+\/[^/.]+)/)[1];
const sha = git("log -1 --format=%H -- public/karti-nvo/media public/fonts");
const CDN = `https://cdn.jsdelivr.net/gh/${repo}@${sha}/public`;

// order: where "Поръчай" at each package leads – its order page on the builder (otherwise the
// builder's form right under the block).
const PAGES = [
  { src: "karti-nvo/balgarski-ezik", out: "balgarski-ezik.html", name: "Карти по български език",
    order: { "ezik-1": "https://edubel.site/bg", "ezik-2": "https://edubel.site/bg2", duo: "https://edubel.site/bgl" } },
  { src: "karti-nvo/literatura", out: "literatura.html", name: "Карти по литература" },
  { src: "karti-nvo", out: "dvete-testeta.html", name: "Двете тестета" },
  // shown after an order of the language cards; sells through the builder's upsell button
  { src: "karti-nvo/oferta-literatura", out: "upsell-literatura.html", name: "Ъпсел – карти по литература", upsell: true },
  // the thank-you step after an order of the language cards
  { src: "karti-nvo/blagodarim-ezik", out: "blagodarim-ezik.html", name: "Благодарим – карти по български език", thanks: true },
];
// Addresses of the pages on the builder. The owner can change them in the settings of each block.
const LINKS = { literatura: "https://edubel.site/literatura", ezik: "https://edubel.site/karti-balgarski-ezik", dvete: "https://edubel.site/karti" };
const PACK_NAMES = { "lit-1": "1 тесте", "lit-2": "2 тестета", "ezik-1": "1 тесте", "ezik-2": "2 тестета", duo: "литература + български език" };
const PATHS = { "/karti-nvo/literatura/": "literatura", "/karti-nvo/balgarski-ezik/": "ezik", "/karti-nvo/": "dvete" };
const SCOPE = ":is(#ebl,#ebf)";

/* ---------- styles: scope every selector to the block and rename the keyframes ---------- */
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
  if (/^body(\[data-deck="\w+"\])?::after/.test(sel)) return sel.replace(/^body/, "#ebl"); // grain only over the page block
  if (sel.startsWith(":root")) return SCOPE + sel.slice(5);
  if (sel.startsWith("body")) return SCOPE + sel.slice(4);
  if (sel.startsWith(".js ")) return `${SCOPE}.js ${sel.slice(4)}`;
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
    const semi = css.indexOf(";", i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    if (prelude.startsWith("@import") && semi > -1 && semi < open) {
      i = semi + 1;
      continue;
    }
    const close = matching(css, open);
    const inner = css.slice(open + 1, close);
    if (/^@(media|supports|container)/.test(prelude)) out += `${prelude}{${scopeBlock(inner)}}`;
    else if (prelude.startsWith("@")) out += `${prelude}{${inner}}`;
    else out += `${splitTop(prelude).map(scopeSelector).join(",")}{${inner}}`;
    i = close + 1;
  }
  return out;
}

// sheets: the stylesheets the page links (shop.css, and shop-hub.css on the home page), in order.
async function styles(sheets) {
  let css = "";
  for (const s of sheets) css += (await readFile(path.join(root, "public", s), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "") + "\n";
  css = scopeBlock(css)
    .replace(/#ebl::after\{content:"";position:fixed;inset:-50%;/, '#ebl::after{content:"";position:absolute;inset:0;')
    .replace(/scroll-padding-top:calc\(var\(--nav-h\) \+ 12px\)/, "scroll-padding-top:80px");
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  const re = new RegExp(`\\b(${names.join("|")})\\b`, "g");
  css = css.replace(/@keyframes\s+([\w-]+)/g, "@keyframes eb-$1").replace(/(animation(?:-name)?\s*:)([^;}]*)/g, (m, p, v) => p + v.replace(re, "eb-$1"));
  const fonts = (await readFile(path.join(root, "public/assets/fonts.css"), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\(\/fonts\//g, `url(${CDN}/fonts/`);
  // The builder's reset makes <b>, <small> and <blockquote> plain; bring back what the pages rely on.
  // Builder rows stop at 1100 px: the row holding this block is stretched to the whole width,
  // the same thing the builder's "stretched row" option does, and only for this row.
  // Its page wrapper clips with overflow:hidden, which turns off position:sticky; clip does the same
  // clipping without that (flow-root keeps the float containment hidden gave).
  const reset = `.page-layout:has(#ebl){overflow:clip;display:flow-root}` +
    `.grid-row:has(#ebl){padding-left:0!important;padding-right:0!important}` +
    `.grid-content:has(#ebl),.grid-column:has(#ebl),.widget-row:has(#ebl),.widget:has(#ebl),.code-widget-content:has(#ebl){display:block!important;float:none!important;width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important}` +
    `#ebl{position:relative;isolation:isolate;width:100%}${SCOPE} b,${SCOPE} strong{font-weight:700}${SCOPE} small{font-size:.85em}${SCOPE} blockquote{border:0;padding:0;margin:0;quotes:none}${SCOPE} .container{max-width:none;padding:0;float:none}`;
  return (fonts + reset + css).replace(/\s*\n\s*/g, "").replace(/\s{2,}/g, " ");
}

/* ---------- script: the same shop.js, bundled without the order form ---------- */
async function script() {
  const res = await build({
    entryPoints: [path.join(root, "public/assets/shop.js")],
    bundle: true,
    write: false,
    format: "iife",
    minify: true,
    target: "es2020",
    plugins: [{ name: "abs", setup: (b) => b.onResolve({ filter: /^\/assets\// }, (a) => ({ path: path.join(root, "public", a.path) })) }],
  });
  return res.outputFiles[0].text.trim();
}

/* ---------- markup ---------- */
function markup(html) {
  const deck = html.match(/<body data-deck="(\w+)">/)[1];
  let body = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.indexOf("</body>"));
  body = body
    .replace(/<a class="skip"[^>]*>.*?<\/a>\n?/, "")
    .replace(/<footer class="foot">[\s\S]*?<\/footer>\n?/, "")
    .replace('<main id="main">', "<main>")
    .replace(/<a class="brand" href="\/karti-nvo\/"/g, '<a class="brand" href="#top"');
  // Prices go last, right above the builder's own checkout form (on the pages that sell through it).
  const order = body.match(/<section class="section alt" id="porachka">[\s\S]*?<\/section>\n?/)?.[0];
  if (order) body = body.replace(order, "").replace("</main>", `${order}<div id="porachka-forma"></div>\n</main>`);
  body = body.replace(/"\/karti-nvo\/media\//g, `"${CDN}/karti-nvo/media/`);
  body = body.replace(/href="(\/karti-nvo\/(?:literatura\/|balgarski-ezik\/)?)"/g, (m, p) => `href="${LINKS[PATHS[p]]}" data-link="${PATHS[p]}"`);
  if (/(src|href|poster)="\/(?!\/)/.test(body)) throw new Error(`Relative link left: ${body.match(/(src|href|poster)="\/[^"]*"/)[0]}`);
  return { deck, body: body.replace(/\n\s*\n/g, "\n").trim() };
}

const settings = (page) => page.thanks ? "<script>window.EB_LANDING = {};</script>" : page.upsell ? `<script>
/* ===== НАСТРОЙКИ – „${page.name}“. Можеш да ги променяш. ===== */
window.EB_LANDING = {
  // Цени в евро. "upsell" е цената на офертата – същата като в ъпсел бутона в ConvertBuilder.
  // "redovna" е редовната цена на картите по литература; показва се зачеркната.
  // 0 = вместо нея се зачерква цената от сайта (25,90 €).
  prices: { "upsell": 19.90, "redovna": 39.90 }
};
</script>` : `<script>
/* ===== НАСТРОЙКИ – „${page.name}“. Можеш да ги променяш. ===== */
window.EB_LANDING = {
${page.order ? `  // Къде води „Поръчай“ при всеки пакет – страницата с поръчката му в ConvertBuilder:
  // ${Object.keys(page.order).map((k) => `"${k}" – ${PACK_NAMES[k]}`).join(", ")}.
  // "#porachka-forma" вместо адрес води до формата точно под този блок.
  order: ${JSON.stringify(page.order, null, 1).replace(/\n\s*/g, " ")},` : `  // Къде водят бутоните „Поръчай“ при цените: котвата точно под този блок (там постави формата
  // за поръчка на ConvertBuilder) или адрес на поръчката, например "https://edubel.site/checkout".
  order: "#porachka-forma",`}
  // Адресите на другите страници с карти.
  links: ${JSON.stringify(LINKS, null, 1).replace(/\n\s*/g, " ")},
  // Цени в евро без доставката. Трябва да са същите като в ConvertBuilder.
  // "redovna" е редовната цена на едно тесте – показва се зачеркната до цените (при две тестета –
  // двойна), както в поръчката на ConvertBuilder. 0 = без зачеркнати цени.
  prices: { "lit-1": 25.90, "lit-2": 44.90, "ezik-1": 25.90, "ezik-2": 44.90, "duo": 44.90, "redovna": 39.90 }
};
</script>`;

const js = await script();
const cssFor = new Map();
await mkdir(path.join(root, "landing"), { recursive: true });
for (const page of PAGES) {
  const html = await readFile(path.join(root, "public", page.src, "index.html"), "utf8");
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="\/(assets\/[\w-]+\.css)">/g)].map((m) => m[1]);
  const key = sheets.join(",");
  if (!cssFor.has(key)) cssFor.set(key, await styles(sheets));
  const css = cssFor.get(key);
  const { deck, body } = markup(html);
  const out = `<!-- ЕДУ БЕЛ · ${page.name} · цялият код отива в един HTML/Code блок в ConvertBuilder.
     Направен от scripts/build-landing.mjs – промените се правят в public/karti-nvo/ и после се генерира наново. -->
<style>${css}</style>
<div id="ebl" data-deck="${deck}">
<script>document.getElementById("ebl").classList.add("js")</script>
${body}
</div>
${settings(page)}
<script>${js}</script>
`;
  await writeFile(path.join(root, "landing", page.out), out);
  console.log(`landing/${page.out}  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
}
console.log(`media from ${CDN}`);
