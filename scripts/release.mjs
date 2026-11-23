// A new version for the live site (app.edubel.site), ready for the Netlify deploy command.
//
//   node scripts/release.mjs [<folder>]
//
// 1. Only committed work goes live: the working tree must be clean, so what is online is always in git.
// 2. The version that is live now must be part of this branch (its commit is in /version.json on the site):
//    work deployed from another branch is never lost. If it is not, merge that commit first.
// 3. The folder is a copy of the commit (git archive) + the live files that are not in git (deploy-extra.json,
//    e.g. the PDFs), taken from this checkout if they are here, otherwise downloaded from the live site.
// 4. The version is written in: /version.json (open trainers notice it and refresh themselves), APP_V in
//    trener.js (it goes with every problem report), and ?v=<version> on every script and style, so each
//    browser takes the new files at once instead of an hour-old copy.
// Then: the deploy command from the Netlify MCP (deploy-site), run from <folder>. Each deploy is a production one.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const LIVE = (process.env.EDUBEL_URL || "https://app.edubel.site").replace(/\/$/, "");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const stop = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

// 1. clean tree
if (git("status", "--porcelain")) stop("Има незаписани промени. Първо commit (на живо отива само записаното в git).");
const commit = git("rev-parse", "HEAD");
const short = commit.slice(0, 7);

// 2. the live version must be in this branch
let live = null;
try {
  const r = await fetch(`${LIVE}/version.json`, { cache: "no-store" });
  if (r.ok) live = await r.json();
} catch (e) {
  stop(`Няма връзка с ${LIVE}: ${e.message}`);
}
if (live && live.commit) {
  const known = () => { try { git("cat-file", "-e", `${live.commit}^{commit}`); return true; } catch (e) { return false; } };
  if (!known()) { try { git("fetch", "--quiet", "origin"); } catch (e) {} }
  if (!known()) stop(`На живо е версия ${live.version} (commit ${live.commit.slice(0, 7)}), която я няма в това хранилище. Намери клона ѝ и го слей.`);
  try { git("merge-base", "--is-ancestor", live.commit, "HEAD"); }
  catch (e) { stop(`На живо е версия ${live.version} (commit ${live.commit.slice(0, 7)}), която не е в този клон. Слей я: git merge ${live.commit.slice(0, 7)}`); }
  console.log(`✓ На живо е ${live.version} – тя е част от този клон.`);
} else {
  console.log("! На живо още няма version.json (първото качване с този скрипт) – провери ръчно, че качената версия е слята тук.");
}

// 3. the folder
const now = new Date();
const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
  .formatToParts(now).map((x) => [x.type, x.value]));
const version = `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}-${short}`;
const out = resolve(process.argv[2] || join(tmpdir(), `edubel-release-${version}`));
if (existsSync(out) && readdirSync(out).length) stop(`Папката ${out} не е празна.`);
mkdirSync(out, { recursive: true });
execFileSync("sh", ["-c", `git archive HEAD | tar -x -C "${out}"`], { cwd: ROOT });

const extra = JSON.parse(readFileSync(join(ROOT, "deploy-extra.json"), "utf8")).files || [];
for (const f of extra) {
  const dest = join(out, f);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(join(ROOT, f))) {
    cpSync(join(ROOT, f), dest);
    console.log(`✓ ${f} (от тук)`);
    continue;
  }
  const url = `${LIVE}/${f.replace(/^public\//, "")}`;
  const r = await fetch(url);
  if (!r.ok) stop(`${f} го няма тук, а и на живо (${url}) отговаря ${r.status}. Сложи файла на мястото му и пусни пак.`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  console.log(`✓ ${f} (от живия сайт, ${Math.round(statSync(dest).size / 1024)} KB)`);
}

// 4. the version
const pub = join(out, "public");
writeFileSync(join(pub, "version.json"), JSON.stringify({ version, commit, at: now.toISOString() }) + "\n");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(pub);
const tag = (u) => `${u}?v=${version}`;
let html = 0, js = 0;
for (const f of files) {
  if (f.endsWith(".html")) {
    const s = readFileSync(f, "utf8");
    const t = s.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")(\/assets\/[^"?#]+\.(?:js|css))"/g, (_, a, u) => `${a}${tag(u)}"`);
    if (t !== s) { writeFileSync(f, t); html++; }
  } else if (f.endsWith(".js") && relative(pub, f).startsWith("assets") && !relative(pub, f).includes("vendor")) {
    let s = readFileSync(f, "utf8");
    const t0 = s;
    // module imports: from "./app.js", import("./x.js"), import("/assets/vendor/qrcode.js")
    s = s.replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])((?:\.\/|\/assets\/)[\w./-]+\.js)\2/g, (_, a, q, u) => `${a}${q}${tag(u)}${q}`);
    if (f.endsWith("trener.js")) {
      if (!/const APP_V = "[^"]*";/.test(s)) stop("В trener.js липсва APP_V.");
      s = s.replace(/const APP_V = "[^"]*";/, `const APP_V = "${version}";`);
    }
    if (s !== t0) { writeFileSync(f, s); js++; }
  }
}
console.log(`✓ Версия ${version}: ${html} страници и ${js} скрипта с ?v=, /version.json, APP_V.`);

// dependencies for the functions (the deploy bundles them from node_modules)
execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: out, stdio: "inherit" });
rmSync(join(out, "private"), { recursive: true, force: true });

console.log(`\nГотово: ${out}\nСледва: командата от Netlify MCP (deploy-site за edubel-app), пусната от тази папка.\nСлед качването: curl ${LIVE}/version.json трябва да покаже ${version}.\n`);
