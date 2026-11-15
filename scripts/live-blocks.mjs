// Points the live edubel.bg pages at the current commit: writes landing/edubel-bg/version.txt, which
// landing/edubel-bg/load.js reads (through raw.githubusercontent.com, cached for 5 minutes) to pick the
// commit it loads the blocks from via jsDelivr. Run it after the rebuilt blocks are committed and
// pushed, then commit and push version.txt – the live site follows within about 5 minutes.
import { execSync } from "node:child_process";
import fs from "node:fs";

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const sha = git("rev-parse HEAD");
const dirty = git("status --porcelain -- landing/edubel-bg");
if (dirty) {
  console.error(`Commit the blocks first:\n${dirty}`);
  process.exit(1);
}
if (!git(`branch -r --contains ${sha}`)) {
  console.error(`Push ${sha.slice(0, 7)} first: jsDelivr must be able to fetch it.`);
  process.exit(1);
}
fs.writeFileSync("landing/edubel-bg/version.txt", `${sha}\n`);
console.log(`landing/edubel-bg/version.txt → ${sha}`);
