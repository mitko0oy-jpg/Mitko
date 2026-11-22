// The "unsubscribe" link in the reminder e-mails: no more reminders to this e-mail (or phone).
import type { Config } from "@netlify/functions";
import { optOut } from "../lib/reminders.mts";

const page = (title: string, text: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
     <style>body{font-family:system-ui,sans-serif;background:#f4f6f9;color:#111827;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;border-radius:16px;padding:28px 32px;max-width:420px;box-shadow:0 2px 8px rgb(0 0 0/.06)}h1{font-size:20px;margin:0 0 8px}</style></head>
     <body><main><h1>${title}</h1><p>${text}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

export default async (req: Request) => {
  const url = new URL(req.url);
  const u = url.searchParams;
  // The short SMS link: /u/<company>-<phone>-<signature>.
  const short = /^\/u\/(\d+)-(\d{6,15})-([A-Za-z0-9_-]{8})\/?$/.exec(url.pathname);
  const company = Number(short ? short[1] : u.get("c"));
  const contact = short ? short[2] : String(u.get("k") || "");
  const sig = short ? short[3] : String(u.get("s") || "");
  const ok = Number.isSafeInteger(company) && company > 0 && (await optOut(company, contact, sig));
  return ok
    ? page("Отписахте се", "Няма да получавате повече напомняния и предложения от нас.")
    : page("Линкът не е валиден", "Опитайте пак от последния имейл или ни пишете.", 400);
};

export const config: Config = { path: ["/api/unsub", "/u/*"] };
