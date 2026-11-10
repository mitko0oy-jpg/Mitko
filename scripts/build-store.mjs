// Builds the ConvertBuilder code blocks of the new store (edubel.bg) in landing/edubel-bg/ from the
// pages in public/magazin/ (and the separate landings listed in PAGES). Each file is one
// self-contained block for a "Code" widget: styles scoped to the block, markup, settings, script.
// Media and fonts load from jsDelivr at a fixed commit of this public repository.
// The scoping is the same as in build-landing.mjs (the edubel.site blocks).
// Usage: node scripts/build-store.mjs   (commit and push the media first)
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { LINKS, LOCAL, CHECKOUT, DELIVERY_FROM } from "../public/assets/store-config.js";
import { PACKAGES, REGULAR } from "../public/assets/shop-catalog.js";
import { DOS } from "../public/assets/dosieta-config.js";
import { TRN } from "../public/assets/trenazhor-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root }).toString().trim();
const MEDIA_PATHS = "public/karti-nvo/media public/fonts public/assets/logo.png";
const dirty = git(`status --porcelain -- ${MEDIA_PATHS}`);
if (dirty) throw new Error(`Commit and push the media first:\n${dirty}`);
const repo = git("remote get-url origin").match(/github\.com[/:]([^/]+\/[^/.]+)/)[1];
const sha = git(`log -1 --format=%H -- ${MEDIA_PATHS}`);
const CDN = `https://cdn.jsdelivr.net/gh/${repo}@${sha}/public`;
const OUT = path.join(root, "landing/edubel-bg");

// src: the page in public/; out: the block; name: shown in the block's first line and settings.
const PAGES = [
  { src: "magazin", out: "nachalo.html", name: "Начало (магазин)", url: LINKS.home },
  { src: "magazin/literatura", out: "literatura.html", name: "Карти по литература", url: LINKS.lit },
  { src: "magazin/balgarski-ezik", out: "balgarski-ezik.html", name: "Карти по български език", url: LINKS.ezik },
  { src: "magazin/komplekt", out: "komplekt.html", name: "Комплект: литература + език", url: LINKS.duo },
  { src: "dosieta", out: "literaturni-dosieta.html", name: "Литературни досиета", url: LINKS.dosieta, kind: "dos" },
  { src: "prilozhenie", out: "prilozhenie.html", name: "Приложението Еду БЕЛ", url: LINKS.app, kind: "app" },
  { src: "trenazhor", out: "nvo-trenazhor.html", name: "НВО тренажор по БЕЛ", url: LINKS.trenazhor, kind: "trn" },
];
// the address of the app (registration, sign-in, the programme)
const APP_URL = "https://edubel-app.netlify.app/";
// local page address → the address on the live site
const PATHS = Object.fromEntries(Object.entries(LOCAL).map(([k, v]) => [v, LINKS[k]]));
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
  if (/^body(\[data-deck="\w+"\])?::after/.test(sel)) return sel.replace(/^body/, "#ebl");
  if (sel.startsWith(":root")) return SCOPE + sel.slice(5);
  if (sel.startsWith("body")) return SCOPE + sel.slice(4);
  if (sel.startsWith(".js ")) return `${SCOPE}.js ${sel.slice(4)}`;
  if (sel.startsWith(".no-sticky ")) return `${SCOPE}.no-sticky ${sel.slice(11)}`;
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
async function styles(sheets) {
  let css = "";
  for (const s of sheets) css += (await readFile(path.join(root, "public", s), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "") + "\n";
  css = scopeBlock(css)
    .replace(/#ebl::after\{content:"";position:fixed;inset:-50%;/, '#ebl::after{content:"";position:absolute;inset:0;')
    .replace(/scroll-padding-top:calc\(var\(--nav-h\) \+ 12px\)/, "scroll-padding-top:120px")
    .replace(/(^|\})html\{([^}]*)\}/, (m, before, rules) => `${before}html{${rules.replace(/;?overflow-x:clip/, "")}}`);
  css = css.replace(/url\(\/fonts\//g, `url(${CDN}/fonts/`).replace(/url\(\/karti-nvo\/media\//g, `url(${CDN}/karti-nvo/media/`);
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  const re = new RegExp(`\\b(${names.join("|")})\\b`, "g");
  css = css.replace(/@keyframes\s+([\w-]+)/g, "@keyframes eb-$1").replace(/(animation(?:-name)?\s*:)([^;}]*)/g, (m, p, v) => p + v.replace(re, "eb-$1"));
  const fonts = (await readFile(path.join(root, "public/assets/fonts.css"), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\(\/fonts\//g, `url(${CDN}/fonts/`);
  // Builder rows stop at 1100 px: the row holding the block is stretched to the whole width.
  // The builder's reset makes <b>, <small> and <blockquote> plain; bring back what the pages use.
  const reset = `.page-layout:has(#ebl){overflow:clip;display:flow-root}` +
    `.grid-row:has(#ebl){padding-left:0!important;padding-right:0!important}` +
    `.grid-content:has(#ebl),.grid-column:has(#ebl),.widget-row:has(#ebl),.widget:has(#ebl),.code-widget-content:has(#ebl){display:block!important;float:none!important;width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important}` +
    `#ebl{position:relative;isolation:isolate;width:100%}${SCOPE} b,${SCOPE} strong{font-weight:700}${SCOPE} small{font-size:.85em}${SCOPE} blockquote{border:0;padding:0;margin:0;quotes:none}${SCOPE} .container{max-width:none;padding:0;float:none}` +
    `${SCOPE} dialog{color:var(--ink)}${SCOPE} h1,${SCOPE} h2,${SCOPE} h3,${SCOPE} h4{font-family:var(--sans);color:inherit}${SCOPE} .serif{font-family:var(--serif)}`;
  return (fonts + reset + css).replace(/\s*\n\s*/g, "").replace(/\s{2,}/g, " ");
}

async function script(entry) {
  const res = await build({
    entryPoints: [path.join(root, "public/assets", entry)],
    bundle: true,
    write: false,
    format: "iife",
    minify: true,
    target: "es2020",
    plugins: [{ name: "abs", setup: (b) => b.onResolve({ filter: /^\/assets\// }, (a) => ({ path: path.join(root, "public", a.path) })) }],
  });
  return res.outputFiles[0].text.trim();
}

function markup(html) {
  const deck = html.match(/<body data-deck="(\w+)">/)[1];
  let body = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.indexOf("</body>"));
  body = body.replace(/"\/karti-nvo\/media\//g, `"${CDN}/karti-nvo/media/`).replace(/"\/assets\/logo\.png"/g, `"${CDN}/assets/logo.png"`);
  body = body.replace(/href="(\/[^"#]*)(#[^"]*)?"/g, (m, page, hash = "") => (PATHS[page] ? `href="${PATHS[page]}${hash}"` : m));
  const ownPaths = new Set(Object.values(LINKS));
  for (const m of body.matchAll(/(src|href|poster)="(\/[^"]*)"/g)) {
    if (m[2].startsWith("//")) continue;
    if (!ownPaths.has(m[2].split("#")[0])) throw new Error(`Relative link left: ${m[0]}`);
  }
  return { deck, body: body.replace(/\n\s*\n/g, "\n").trim() };
}

const euroVal = (c) => Number((c / 100).toFixed(2));
const dosSettings = (page) => `<script>
/* ===== НАСТРОЙКИ – „${page.name}“. Можеш да ги променяш. ===== */
window.EB_LANDING = {
  dos: {
    // Цени в евро без доставката – същите като в продуктите в ConvertBuilder.
    prices: ${JSON.stringify(Object.fromEntries(Object.entries(DOS.packages).map(([k, p]) => [k, euroVal(p.price)]))).replace(/,/g, ", ")},
    // Зачеркнатата цена на комплекта с картите (0 = без зачеркната цена).
    was: ${JSON.stringify({ "dos-lit": euroVal(DOS.packages["dos-lit"].was) })},
    // Цената на корицата; показва се зачеркната, ако книгата е по-евтина от нея.
    regular: ${euroVal(DOS.regular)},
    // Страницата с поръчката в ConvertBuilder за всеки комплект и подвързия.
    checkout: ${JSON.stringify(DOS.checkout, null, 1).replace(/\n\s*/g, " ")},
    // Доставка с една книга (от … €).
    delivery: ${euroVal(DOS.delivery)},
    // Магазинът с картите.
    store: "${LINKS.home}"
  }
};
</script>`;
const appSettings = (page) => `<script>
/* ===== НАСТРОЙКИ – „${page.name}“. Можеш да ги променяш. ===== */
window.EB_LANDING = {
  app: {
    // Адресът на приложението (регистрация, вход, програмата).
    url: "${APP_URL}",
    // Магазинът с картите.
    store: "${LINKS.home}"
  }
};
</script>`;
const trnSettings = (page) => `<script>
/* ===== НАСТРОЙКИ – „${page.name}“. Можеш да ги променяш. ===== */
window.EB_LANDING = {
  trn: {
    // Цените на плановете в евро – същите като в продуктите в ConvertBuilder.
    prices: ${JSON.stringify(Object.fromEntries(Object.entries(TRN.plans).map(([k, p]) => [k, euroVal(p.price)]))).replace(/,/g, ", ")},
    // Страницата с поръчката в ConvertBuilder за всеки план.
    checkout: ${JSON.stringify(TRN.checkout, null, 1).replace(/\n\s*/g, " ")},
    // Тренажорът (отваря се с личния код).
    app: "${TRN.app}",
    // Магазинът с картите.
    store: "${LINKS.home}"
  }
};
</script>`;
const settings = (page) => page.kind === "trn" ? trnSettings(page) : page.kind === "dos" ? dosSettings(page) : page.kind === "app" ? appSettings(page) : `<script>
/* ===== НАСТРОЙКИ – „${page.name}“. Еднакви са във всички страници на магазина. ===== */
window.EB_LANDING = {
  // Цени в евро без доставката. Трябва да са същите като в продуктите в ConvertBuilder.
  // "redovna" е редовната цена на едно тесте – показва се зачеркната (при две тестета – двойна).
  prices: ${JSON.stringify({ "lit-1": euroVal(PACKAGES["lit-1"].price), "lit-2": euroVal(PACKAGES["lit-2"].price), "ezik-1": euroVal(PACKAGES["ezik-1"].price), "ezik-2": euroVal(PACKAGES["ezik-2"].price), duo: euroVal(PACKAGES.duo.price), redovna: euroVal(REGULAR) }).replace(/,/g, ", ")},
  store: {
    // Страницата с поръчката (checkout) в ConvertBuilder за всеки комплект в количката.
    checkout: ${JSON.stringify(CHECKOUT, null, 1).replace(/\n\s*/g, " ")},
    // Адресите на страниците в сайта.
    links: ${JSON.stringify(LINKS, null, 1).replace(/\n\s*/g, " ")},
    // Доставка с едно тесте (от … €). Две тестета са с безплатна доставка.
    delivery: ${euroVal(DELIVERY_FROM)}
  }
};
</script>`;

await mkdir(OUT, { recursive: true });
const cssFor = new Map();
const jsFor = new Map();
for (const page of PAGES) {
  const html = await readFile(path.join(root, "public", page.src, "index.html"), "utf8");
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="\/(assets\/[\w-]+\.css)">/g)].map((m) => m[1]);
  const key = sheets.join(",");
  if (!cssFor.has(key)) cssFor.set(key, await styles(sheets));
  const entry = html.match(/<script type="module" src="\/assets\/([\w-]+\.js)">/)[1];
  if (!jsFor.has(entry)) jsFor.set(entry, await script(entry));
  const { deck, body } = markup(html);
  const out = `<!-- ЕДУ БЕЛ · ${page.name} (${page.url}) · целият код отива в един HTML/Code блок в ConvertBuilder.
     Направен от scripts/build-store.mjs – промените се правят в public/${page.src}/ и после се генерира наново. -->
<style>${cssFor.get(key)}</style>
<div id="ebl" data-deck="${deck}">
<script>document.getElementById("ebl").classList.add("js")</script>
${body}
</div>
${settings(page)}
<script>${jsFor.get(entry)}</script>
`;
  await writeFile(path.join(OUT, page.out), out);
  console.log(`landing/edubel-bg/${page.out}  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
}
console.log(`media from ${CDN}`);
