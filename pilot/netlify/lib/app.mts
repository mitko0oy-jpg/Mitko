// Wires the shared service to Postgres and the live (or demo) data source.
import { createService } from "../../public/core/service.js";
import { demoSource } from "../../public/core/demo-source.js";
import { pgStore } from "./db.mts";
import { liveSource } from "./live-source.mts";
import * as ai from "./ai.mts";
import * as video from "./video.mts";
import * as higgsfield from "./higgsfield.mts";
import { demoGen } from "../../public/core/demo-gen.js";
import { env } from "./http.mts";

export const isDemo = () => env("PILOT_DEMO") === "1";

export function app() {
  const demo = isDemo();
  return createService({
    store: pgStore,
    source: demo ? demoSource(pgStore) : liveSource(),
    ai: ai.available() ? { briefs: ai.briefs } : null,
    video: !demo && video.available() ? { start: video.start } : null,
    gen: demo ? demoGen() : { available: higgsfield.available, startImages: higgsfield.startImages, startVideo: higgsfield.startVideo, poll: higgsfield.poll, productImages: higgsfield.productImages },
    demo,
  });
}
