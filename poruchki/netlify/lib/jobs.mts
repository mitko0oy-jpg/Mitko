// The scheduled functions only start the work: it runs in a background function (up to 15 minutes),
// because Netlify cuts a scheduled call off after ~15 s and repeats it.
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./http.mts";

export const jobKey = () => createHash("sha256").update(`${env("SECRET_KEY") || ""}:jobs`).digest("hex");

export function validJobKey(got: string | null) {
  const want = jobKey();
  return Boolean(env("SECRET_KEY")) && !!got && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** true when the background job was accepted. */
export async function startJob(name: "sync" | "track", siteUrl: string | undefined): Promise<boolean> {
  const base = (siteUrl || env("URL") || "").replace(/\/$/, "");
  if (!base.startsWith("https://")) return false;
  try {
    const r = await fetch(`${base}/api/jobs/${name}`, { method: "POST", headers: { "x-job-key": jobKey() }, signal: AbortSignal.timeout(6000) });
    return r.status === 202 || r.ok;
  } catch (e: any) {
    console.error(`start ${name} failed`, e.message);
    return false;
  }
}
