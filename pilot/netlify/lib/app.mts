// Wires the shared service to Postgres and the live (or demo) data source.
import { createService } from "../../public/core/service.js";
import { demoSource } from "../../public/core/demo-source.js";
import { pgStore } from "./db.mts";
import { liveSource } from "./live-source.mts";
import * as ai from "./ai.mts";
import * as video from "./video.mts";
import { env } from "./http.mts";

export const isDemo = () => env("PILOT_DEMO") === "1";

export function app() {
  const demo = isDemo();
  return createService({
    store: pgStore,
    source: demo ? demoSource(pgStore) : liveSource(),
    ai: ai.available() ? { briefs: ai.briefs } : null,
    video: !demo && video.available() ? { start: video.start } : null,
    demo,
  });
}
