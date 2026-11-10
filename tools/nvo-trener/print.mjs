// Makes print-ready PDFs for codes that already exist on the live site, using the /kodove/ print view
// of a local dev server (node scripts/dev-server.mjs 8899) and a local admin account.
// Usage: node tools/nvo-trener/print.mjs <pdf|sheet|single> <out.pdf> <CODE1,CODE2,...> [--each]
//   --each with "pdf": one file per code (<out>-<CODE>.pdf), to send one PDF per customer.
// Env: LOCAL=http://localhost:8899 ADMIN_EMAIL=… ADMIN_PASSWORD=… BASE=https://app.edubel.site
//      TERM_MONTHS=12 or TERM_UNTIL=2027-06-30 (the access term printed on the sticker/PDF; must match the batch)
import { createRequire } from "node:module";

// Playwright is installed globally in the dev environment, which only CommonJS resolution finds.
const { chromium } = createRequire(import.meta.url)("playwright");

const [kind, out, list, flag] = process.argv.slice(2);
const LOCAL = process.env.LOCAL || "http://localhost:8899";
const BASE = process.env.BASE || "https://app.edubel.site";
const codes = (list || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!["pdf", "sheet", "single"].includes(kind) || !out || !codes.length) {
  console.error("Usage: node tools/nvo-trener/print.mjs <pdf|sheet|single> <out.pdf> <CODE1,CODE2,...> [--each]");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${LOCAL}/vhod/?kak=roditel`);
await page.fill("#pEmail", process.env.ADMIN_EMAIL || "");
await page.fill("#pPass", process.env.ADMIN_PASSWORD || "");
await page.press("#pPass", "Enter");
await page.waitForURL((u) => !u.pathname.startsWith("/vhod"), { timeout: 15000 });

async function render(cs, file) {
  const q = new URLSearchParams({ print: kind, codes: cs.join(","), base: BASE, title: "", term: process.env.TERM_MONTHS || process.env.TERM_UNTIL || "" });
  await page.goto(`${LOCAL}/kodove/?${q}`);
  await page.waitForSelector(kind === "pdf" ? ".pdfp" : kind === "sheet" ? ".sheet" : ".one");
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  console.log(file);
}
if (kind === "pdf" && flag === "--each") for (const c of codes) await render([c], out.replace(/\.pdf$/, `-${c}.pdf`));
else await render(codes, out);
await browser.close();
