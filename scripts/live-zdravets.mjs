// Points the live Здравец Натура pages (zdravets.eu) at the current commit: writes
// landing/zdravets/version.txt, which landing/zdravets/load.js reads (through raw.githubusercontent.com,
// cached for about 5 minutes) to pick the commit it loads the blocks from via jsDelivr. Run it after the
// rebuilt blocks are committed and pushed, then commit and push version.txt.
import { execSync } from "node:child_process";
import fs from "node:fs";

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const sha = git("rev-parse HEAD");
const dirty = git("status --porcelain -- landing/zdravets zdravets");
if (dirty) {
  console.error(`Commit the blocks first:\n${dirty}`);
  process.exit(1);
}
if (!git(`branch -r --contains ${sha}`)) {
  console.error(`Push ${sha.slice(0, 7)} first: jsDelivr must be able to fetch it.`);
  process.exit(1);
}
fs.writeFileSync("landing/zdravets/version.txt", `${sha}\n`);
console.log(`landing/zdravets/version.txt → ${sha}`);
