// Build an agent's prompt from its spec: prompt file + shared style + price list.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renderPriceList } from "./inbound.mjs";

/** @param {{keepPriceList?: boolean}} [opts] keepPriceList: leave [[PRICE_LIST]] to be filled at call time. */
export async function loadSpec(file, { keepPriceList = false } = {}) {
  const spec = JSON.parse(await readFile(file, "utf8"));
  const dir = dirname(file);
  let prompt = await readFile(join(dir, spec.prompt_file), "utf8");
  if (spec.style_file) prompt = prompt.replace("[[STYLE]]", (await readFile(join(dir, spec.style_file), "utf8")).trim());
  let priceList = null;
  if (spec.price_list_file) {
    priceList = JSON.parse(await readFile(join(dir, spec.price_list_file), "utf8"));
    if (!keepPriceList) prompt = prompt.replace("[[PRICE_LIST]]", renderPriceList(priceList));
  }
  if (prompt.replace("[[PRICE_LIST]]", "").includes("[[")) throw new Error(`unfilled placeholder in ${spec.prompt_file}`);
  return { spec, prompt, priceList };
}
