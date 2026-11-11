// Signals about problems: errors the app notices by itself ("error") and „Мисля, че тук има грешка“ ("task").
// Nobody is identified: no code, device id, account or IP is stored – only what, where, which version, which kind of device.
import { createHash } from "node:crypto";
import { q } from "./db.mts";
import { str } from "./http.mts";

// "Android · Chrome" from the browser string – enough to reproduce a problem, too little to recognise anyone.
export function deviceOf(ua: string): string {
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "друго";
  const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "друг";
  return `${os} · ${br}`;
}

// E-mails and phone numbers do not belong in a report (a child may type them into the note).
export const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[имейл]").replace(/\+?\d[\d\s-]{7,}\d/g, "[номер]");

// The same problem in the same version is one row with a count.
export async function saveReport(b: any, ua: string): Promise<boolean> {
  const kind = b.kind === "task" ? "task" : b.kind === "error" ? "error" : "";
  if (!kind) return false;
  const r = {
    page: str(b.page, 60),
    ref: str(b.ref, 80),
    message: scrub(str(b.message, 300)),
    detail: scrub(str(b.detail, 1500)),
    note: scrub(str(b.note, 400)),
    version: str(b.version, 30),
    device: deviceOf(ua),
  };
  if (kind === "error" && !r.message) return false;
  if (kind === "task" && !r.ref) return false;
  const sig = createHash("sha256").update([kind, r.page, r.ref, r.message, r.note, r.version].join("\u0001")).digest("hex");
  await q(
    `INSERT INTO reports (kind, sig, page, ref, message, detail, note, version, device) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (sig) WHERE status <> 'fixed' DO UPDATE SET count = reports.count + 1, last_at = now()`,
    [kind, sig, r.page, r.ref, r.message, r.detail, r.note, r.version, r.device],
  );
  return true;
}

// The list for Митко (/kodove/) and for Claude (admin.mjs reports): new first, then the newest.
export const listReports = (all = false) =>
  q(
    `SELECT id, kind, page, ref, message, detail, note, version, device, count, first_at, last_at, status
       FROM reports ${all ? "" : "WHERE status <> 'fixed'"} ORDER BY (status = 'new') DESC, last_at DESC LIMIT 200`,
  );

export const setReport = (id: number, status: string) =>
  q("UPDATE reports SET status = $2 WHERE id = $1 AND $2 IN ('new', 'seen', 'fixed') RETURNING id, status", [id, status]);
